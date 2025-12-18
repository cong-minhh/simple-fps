// Pathfinding.js - Optimized A* pathfinding for enemy AI
import * as THREE from 'three';

/**
 * Binary Heap implementation for O(log n) priority queue operations
 */
class BinaryHeap {
    constructor() {
        this.heap = [];
        this.positions = new Map(); // key -> index in heap for O(1) lookup
    }

    size() {
        return this.heap.length;
    }

    isEmpty() {
        return this.heap.length === 0;
    }

    contains(key) {
        return this.positions.has(key);
    }

    push(node) {
        this.heap.push(node);
        this.positions.set(node.key, this.heap.length - 1);
        this._bubbleUp(this.heap.length - 1);
    }

    pop() {
        if (this.heap.length === 0) return null;
        const result = this.heap[0];
        this.positions.delete(result.key);

        const last = this.heap.pop();
        if (this.heap.length > 0) {
            this.heap[0] = last;
            this.positions.set(last.key, 0);
            this._bubbleDown(0);
        }
        return result;
    }

    updatePriority(key, newF) {
        const idx = this.positions.get(key);
        if (idx === undefined) return false;
        const oldF = this.heap[idx].f;
        this.heap[idx].f = newF;
        if (newF < oldF) {
            this._bubbleUp(idx);
        } else {
            this._bubbleDown(idx);
        }
        return true;
    }

    clear() {
        this.heap.length = 0;
        this.positions.clear();
    }

    _bubbleUp(idx) {
        const node = this.heap[idx];
        while (idx > 0) {
            const parentIdx = (idx - 1) >> 1;
            const parent = this.heap[parentIdx];
            if (node.f >= parent.f) break;
            this.heap[idx] = parent;
            this.positions.set(parent.key, idx);
            idx = parentIdx;
        }
        this.heap[idx] = node;
        this.positions.set(node.key, idx);
    }

    _bubbleDown(idx) {
        const length = this.heap.length;
        const node = this.heap[idx];
        while (true) {
            const leftIdx = (idx << 1) + 1;
            const rightIdx = leftIdx + 1;
            let smallest = idx;

            if (leftIdx < length && this.heap[leftIdx].f < this.heap[smallest].f) {
                smallest = leftIdx;
            }
            if (rightIdx < length && this.heap[rightIdx].f < this.heap[smallest].f) {
                smallest = rightIdx;
            }
            if (smallest === idx) break;

            this.heap[idx] = this.heap[smallest];
            this.positions.set(this.heap[idx].key, idx);
            idx = smallest;
        }
        this.heap[idx] = node;
        this.positions.set(node.key, idx);
    }
}

/**
 * High-performance grid-based A* pathfinding
 * Uses binary heap priority queue and spatial hashing for optimal performance
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

        // Optimized data structures for A*
        this._openHeap = new BinaryHeap(); // O(log n) priority queue
        this._closedSet = new Set();
        this._cameFrom = new Map();
        this._gScore = new Map();

        // Pre-computed neighbor offsets (8-directional)
        this._neighbors = [
            { dx: 1, dz: 0, cost: 1 },
            { dx: -1, dz: 0, cost: 1 },
            { dx: 0, dz: 1, cost: 1 },
            { dx: 0, dz: -1, cost: 1 },
            { dx: 1, dz: 1, cost: 1.414 },
            { dx: -1, dz: 1, cost: 1.414 },
            { dx: 1, dz: -1, cost: 1.414 },
            { dx: -1, dz: -1, cost: 1.414 }
        ];

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
     * Uses expanding square search with larger radius
     */
    findNearestWalkable(gx, gz) {
        // Check up to 15 cells away (increased from 5 for better coverage)
        for (let dist = 1; dist <= 15; dist++) {
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

        // Clear data structures
        this._openHeap.clear();
        this._closedSet.clear();
        this._cameFrom.clear();
        this._gScore.clear();

        const startKey = this.cellKey(start.x, start.z);
        const endKey = this.cellKey(end.x, end.z);
        const startF = this.heuristic(start.x, start.z, end.x, end.z);

        // Push start node with f-score
        this._openHeap.push({ x: start.x, z: start.z, key: startKey, f: startF });
        this._gScore.set(startKey, 0);

        let iterations = 0;
        const maxIterations = 2000;

        while (!this._openHeap.isEmpty() && iterations < maxIterations) {
            iterations++;

            // Pop node with lowest f-score - O(log n) with binary heap
            const current = this._openHeap.pop();

            // Reached goal
            if (current.key === endKey) {
                return this.reconstructPath(current.key);
            }

            this._closedSet.add(current.key);

            // Check all neighbors using pre-computed offsets
            for (const n of this._neighbors) {
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
                const existingG = this._gScore.get(nKey);

                // O(1) check if in open set using heap's Map
                const inOpenSet = this._openHeap.contains(nKey);

                if (existingG === undefined || tentativeG < existingG) {
                    this._cameFrom.set(nKey, current.key);
                    this._gScore.set(nKey, tentativeG);
                    const newF = tentativeG + this.heuristic(nx, nz, end.x, end.z);

                    if (inOpenSet) {
                        // Update existing node's priority - O(log n)
                        this._openHeap.updatePriority(nKey, newF);
                    } else {
                        // Add new node - O(log n)
                        this._openHeap.push({ x: nx, z: nz, key: nKey, f: newF });
                    }
                }
            }
        }

        // No path found - return a fallback path directly toward target
        // This ensures enemies always try to move toward player
        const startWorld = this.gridToWorld(start.x, start.z);
        const endWorld = this.gridToWorld(end.x, end.z);
        return [
            new THREE.Vector3(startWorld.x, 0, startWorld.z),
            new THREE.Vector3(endWorld.x, 0, endWorld.z)
        ];
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
