// Pathfinding.js - Optimized A* pathfinding for enemy AI
import * as THREE from 'three';

/**
 * High-performance grid-based A* pathfinding
 * Uses typed arrays and object pooling to minimize GC
 */
export class Pathfinding {
    constructor(arena, cellSize = 0.5) {
        this.arena = arena;
        this.cellSize = cellSize;

        // Grid dimensions (arena is 20x20, centered at origin)
        this.gridSize = Math.ceil(20 / cellSize);
        this.halfGrid = this.gridSize / 2;
        this.offset = 10; // Arena goes from -10 to 10

        // Pre-allocate grid (1 = blocked, 0 = walkable)
        this.grid = new Uint8Array(this.gridSize * this.gridSize);

        // Build initial grid from colliders
        this.buildGrid();

        // Object pools to avoid GC during pathfinding
        this._openSet = [];
        this._closedSet = new Set();
        this._cameFrom = new Map();
        this._gScore = new Map();
        this._fScore = new Map();

        // Reusable vectors
        this._tempVec = new THREE.Vector3();
    }

    buildGrid() {
        const colliders = this.arena.colliders;
        const padding = 0.4; // Enemy radius padding

        for (let x = 0; x < this.gridSize; x++) {
            for (let z = 0; z < this.gridSize; z++) {
                const worldX = (x - this.halfGrid) * this.cellSize;
                const worldZ = (z - this.halfGrid) * this.cellSize;

                // Check if cell overlaps any collider (with padding)
                let blocked = false;
                for (const collider of colliders) {
                    // Skip platforms (enemies walk under them)
                    if (collider.isPlatform) continue;

                    if (worldX + padding >= collider.min.x && worldX - padding <= collider.max.x &&
                        worldZ + padding >= collider.min.z && worldZ - padding <= collider.max.z) {
                        blocked = true;
                        break;
                    }
                }

                this.grid[x + z * this.gridSize] = blocked ? 1 : 0;
            }
        }
    }

    // Convert world coords to grid coords
    worldToGrid(x, z) {
        return {
            x: Math.floor((x + this.offset) / this.cellSize),
            z: Math.floor((z + this.offset) / this.cellSize)
        };
    }

    // Convert grid coords to world coords (center of cell)
    gridToWorld(gx, gz) {
        return {
            x: (gx - this.halfGrid + 0.5) * this.cellSize,
            z: (gz - this.halfGrid + 0.5) * this.cellSize
        };
    }

    // Check if grid cell is walkable
    isWalkable(gx, gz) {
        if (gx < 0 || gx >= this.gridSize || gz < 0 || gz >= this.gridSize) {
            return false;
        }
        return this.grid[gx + gz * this.gridSize] === 0;
    }

    // Get cell key for maps
    cellKey(gx, gz) {
        return gx + gz * this.gridSize;
    }

    // Manhattan distance heuristic (fast, admissible)
    heuristic(ax, az, bx, bz) {
        return Math.abs(ax - bx) + Math.abs(az - bz);
    }

    /**
     * Find nearest walkable cell to given grid coordinates
     * Uses expanding square search
     */
    findNearestWalkable(gx, gz) {
        // Check up to 5 cells away
        for (let dist = 1; dist <= 5; dist++) {
            for (let dx = -dist; dx <= dist; dx++) {
                for (let dz = -dist; dz <= dist; dz++) {
                    // Only check cells at this distance (perimeter)
                    if (Math.abs(dx) !== dist && Math.abs(dz) !== dist) continue;

                    const nx = gx + dx;
                    const nz = gz + dz;

                    if (this.isWalkable(nx, nz)) {
                        return { x: nx, z: nz };
                    }
                }
            }
        }
        return null;
    }

    /**
     * Find path from start to end using A*
     * Returns array of world positions, or null if no path
     */
    findPath(startPos, endPos) {
        const start = this.worldToGrid(startPos.x, startPos.z);
        let end = this.worldToGrid(endPos.x, endPos.z);

        // If start is blocked, find nearest walkable cell
        if (!this.isWalkable(start.x, start.z)) {
            const nearStart = this.findNearestWalkable(start.x, start.z);
            if (!nearStart) return null;
            start.x = nearStart.x;
            start.z = nearStart.z;
        }

        // If end is blocked (player near wall), find nearest walkable cell
        if (!this.isWalkable(end.x, end.z)) {
            const nearEnd = this.findNearestWalkable(end.x, end.z);
            if (!nearEnd) return null;
            end = nearEnd;
        }

        // Clear pools
        this._openSet.length = 0;
        this._closedSet.clear();
        this._cameFrom.clear();
        this._gScore.clear();
        this._fScore.clear();

        const startKey = this.cellKey(start.x, start.z);
        const endKey = this.cellKey(end.x, end.z);

        this._openSet.push({ x: start.x, z: start.z, key: startKey });
        this._gScore.set(startKey, 0);
        this._fScore.set(startKey, this.heuristic(start.x, start.z, end.x, end.z));

        // 8-directional neighbors (diagonal movement allowed)
        const neighbors = [
            { dx: 1, dz: 0, cost: 1 },
            { dx: -1, dz: 0, cost: 1 },
            { dx: 0, dz: 1, cost: 1 },
            { dx: 0, dz: -1, cost: 1 },
            { dx: 1, dz: 1, cost: 1.414 },
            { dx: -1, dz: 1, cost: 1.414 },
            { dx: 1, dz: -1, cost: 1.414 },
            { dx: -1, dz: -1, cost: 1.414 }
        ];

        let iterations = 0;
        const maxIterations = 1000; // Safety limit

        while (this._openSet.length > 0 && iterations < maxIterations) {
            iterations++;

            // Find node with lowest fScore (simple min search - fast for small grids)
            let lowestIdx = 0;
            let lowestF = this._fScore.get(this._openSet[0].key);
            for (let i = 1; i < this._openSet.length; i++) {
                const f = this._fScore.get(this._openSet[i].key);
                if (f < lowestF) {
                    lowestF = f;
                    lowestIdx = i;
                }
            }

            const current = this._openSet[lowestIdx];

            // Reached goal
            if (current.key === endKey) {
                return this.reconstructPath(current.key);
            }

            // Move from open to closed
            this._openSet.splice(lowestIdx, 1);
            this._closedSet.add(current.key);

            // Check all neighbors
            for (const n of neighbors) {
                const nx = current.x + n.dx;
                const nz = current.z + n.dz;

                if (!this.isWalkable(nx, nz)) continue;

                const nKey = this.cellKey(nx, nz);
                if (this._closedSet.has(nKey)) continue;

                // For diagonal moves, check that both adjacent cells are walkable
                if (n.dx !== 0 && n.dz !== 0) {
                    if (!this.isWalkable(current.x + n.dx, current.z) ||
                        !this.isWalkable(current.x, current.z + n.dz)) {
                        continue;
                    }
                }

                const tentativeG = this._gScore.get(current.key) + n.cost;

                const inOpenSet = this._openSet.some(node => node.key === nKey);

                if (!inOpenSet || tentativeG < (this._gScore.get(nKey) || Infinity)) {
                    this._cameFrom.set(nKey, current.key);
                    this._gScore.set(nKey, tentativeG);
                    this._fScore.set(nKey, tentativeG + this.heuristic(nx, nz, end.x, end.z));

                    if (!inOpenSet) {
                        this._openSet.push({ x: nx, z: nz, key: nKey });
                    }
                }
            }
        }

        // No path found
        return null;
    }

    reconstructPath(endKey) {
        const path = [];
        let current = endKey;

        while (current !== undefined) {
            const gx = current % this.gridSize;
            const gz = Math.floor(current / this.gridSize);
            const world = this.gridToWorld(gx, gz);
            path.unshift(new THREE.Vector3(world.x, 0, world.z));
            current = this._cameFrom.get(current);
        }

        // Smooth path by removing redundant waypoints
        return this.smoothPath(path);
    }

    smoothPath(path) {
        if (path.length <= 2) return path;

        const smoothed = [path[0]];
        let current = 0;

        while (current < path.length - 1) {
            // Try to skip waypoints by checking direct line-of-sight
            let farthest = current + 1;

            for (let i = path.length - 1; i > current + 1; i--) {
                if (this.hasLineOfSight(path[current], path[i])) {
                    farthest = i;
                    break;
                }
            }

            smoothed.push(path[farthest]);
            current = farthest;
        }

        return smoothed;
    }

    hasLineOfSight(start, end) {
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const steps = Math.ceil(dist / (this.cellSize * 0.5));

        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const x = start.x + dx * t;
            const z = start.z + dz * t;
            const g = this.worldToGrid(x, z);

            if (!this.isWalkable(g.x, g.z)) {
                return false;
            }
        }

        return true;
    }
}
