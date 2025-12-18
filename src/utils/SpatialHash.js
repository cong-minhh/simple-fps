// SpatialHash.js - High-performance spatial partitioning for 3D collision detection
// Uses a grid-based hash map for O(1) nearest neighbor and collision queries

import * as THREE from 'three';

/**
 * @typedef {Object} SpatialEntity
 * @property {THREE.Vector3|{x: number, y: number, z: number}} position - Entity position
 * @property {number} [radius] - Optional collision radius
 * @property {*} [data] - Optional custom data
 */

/**
 * High-performance spatial hash for 3D objects
 * Divides world space into grid cells for fast spatial queries
 */
export class SpatialHash {
    /**
     * @param {number} cellSize - Size of each grid cell (larger = fewer cells, faster insert/remove, slower query)
     * @param {number} bounds - Half-size of the world bounds (world is -bounds to +bounds on each axis)
     */
    constructor(cellSize = 4, bounds = 20) {
        this.cellSize = cellSize;
        this.bounds = bounds;
        this.cells = new Map();

        // Pre-allocated vectors for zero GC in queries
        this._tempVec = new THREE.Vector3();
        this._queryResults = [];

        // Stats for performance monitoring
        this.stats = {
            entities: 0,
            cells: 0,
            queries: 0,
            avgQueryTime: 0
        };
    }

    /**
     * Get cell key from world position
     * @param {number} x 
     * @param {number} y 
     * @param {number} z 
     * @returns {string} Cell key
     */
    _getCellKey(x, y, z) {
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        const cz = Math.floor(z / this.cellSize);
        return `${cx},${cy},${cz}`;
    }

    /**
     * Get cell coordinates from world position
     * @param {number} x 
     * @param {number} y 
     * @param {number} z 
     * @returns {{cx: number, cy: number, cz: number}}
     */
    _getCellCoords(x, y, z) {
        return {
            cx: Math.floor(x / this.cellSize),
            cy: Math.floor(y / this.cellSize),
            cz: Math.floor(z / this.cellSize)
        };
    }

    /**
     * Insert an entity into the spatial hash
     * @param {string} id - Unique identifier for the entity
     * @param {THREE.Vector3|{x: number, y: number, z: number}} position - Entity position
     * @param {number} [radius=0] - Entity collision radius (for multi-cell insertion)
     * @param {*} [data] - Optional custom data to store with entity
     */
    insert(id, position, radius = 0, data = null) {
        const entity = {
            id,
            position: { x: position.x, y: position.y, z: position.z },
            radius,
            data,
            cells: [] // Track which cells contain this entity
        };

        // Calculate which cells this entity occupies (based on radius)
        const minX = Math.floor((position.x - radius) / this.cellSize);
        const maxX = Math.floor((position.x + radius) / this.cellSize);
        const minY = Math.floor((position.y - radius) / this.cellSize);
        const maxY = Math.floor((position.y + radius) / this.cellSize);
        const minZ = Math.floor((position.z - radius) / this.cellSize);
        const maxZ = Math.floor((position.z + radius) / this.cellSize);

        for (let cx = minX; cx <= maxX; cx++) {
            for (let cy = minY; cy <= maxY; cy++) {
                for (let cz = minZ; cz <= maxZ; cz++) {
                    const key = `${cx},${cy},${cz}`;
                    if (!this.cells.has(key)) {
                        this.cells.set(key, new Map());
                        this.stats.cells++;
                    }
                    this.cells.get(key).set(id, entity);
                    entity.cells.push(key);
                }
            }
        }

        this.stats.entities++;
        return entity;
    }

    /**
     * Remove an entity from the spatial hash
     * @param {string} id - Entity identifier
     * @returns {boolean} True if entity was found and removed
     */
    remove(id) {
        // Find entity in any cell and get its cell list
        for (const [key, cell] of this.cells) {
            const entity = cell.get(id);
            if (entity) {
                // Remove from all cells it occupies
                for (const cellKey of entity.cells) {
                    const c = this.cells.get(cellKey);
                    if (c) {
                        c.delete(id);
                        if (c.size === 0) {
                            this.cells.delete(cellKey);
                            this.stats.cells--;
                        }
                    }
                }
                this.stats.entities--;
                return true;
            }
        }
        return false;
    }

    /**
     * Update an entity's position in the spatial hash
     * @param {string} id - Entity identifier
     * @param {THREE.Vector3|{x: number, y: number, z: number}} newPosition - New position
     * @param {number} [radius] - Optional new radius
     * @returns {boolean} True if entity was found and updated
     */
    update(id, newPosition, radius = undefined) {
        // Find entity
        for (const cell of this.cells.values()) {
            const entity = cell.get(id);
            if (entity) {
                const oldKey = this._getCellKey(entity.position.x, entity.position.y, entity.position.z);
                const newKey = this._getCellKey(newPosition.x, newPosition.y, newPosition.z);

                // If cell changed, re-insert
                if (oldKey !== newKey || radius !== undefined) {
                    const data = entity.data;
                    const r = radius !== undefined ? radius : entity.radius;
                    this.remove(id);
                    this.insert(id, newPosition, r, data);
                } else {
                    // Just update position in place
                    entity.position.x = newPosition.x;
                    entity.position.y = newPosition.y;
                    entity.position.z = newPosition.z;
                }
                return true;
            }
        }
        return false;
    }

    /**
     * Query all entities within a radius of a position
     * @param {THREE.Vector3|{x: number, y: number, z: number}} position - Query center
     * @param {number} radius - Query radius
     * @param {string} [excludeId] - Optional entity ID to exclude from results
     * @returns {Array<{id: string, position: Object, data: *, distanceSq: number}>}
     */
    queryRadius(position, radius, excludeId = null) {
        const results = [];
        const radiusSq = radius * radius;

        // Calculate which cells to check
        const minX = Math.floor((position.x - radius) / this.cellSize);
        const maxX = Math.floor((position.x + radius) / this.cellSize);
        const minY = Math.floor((position.y - radius) / this.cellSize);
        const maxY = Math.floor((position.y + radius) / this.cellSize);
        const minZ = Math.floor((position.z - radius) / this.cellSize);
        const maxZ = Math.floor((position.z + radius) / this.cellSize);

        const seen = new Set();

        for (let cx = minX; cx <= maxX; cx++) {
            for (let cy = minY; cy <= maxY; cy++) {
                for (let cz = minZ; cz <= maxZ; cz++) {
                    const key = `${cx},${cy},${cz}`;
                    const cell = this.cells.get(key);
                    if (!cell) continue;

                    for (const [id, entity] of cell) {
                        if (seen.has(id) || id === excludeId) continue;
                        seen.add(id);

                        // Calculate distance squared
                        const dx = entity.position.x - position.x;
                        const dy = entity.position.y - position.y;
                        const dz = entity.position.z - position.z;
                        const distSq = dx * dx + dy * dy + dz * dz;

                        // Include entity radius in check
                        const totalRadius = radius + (entity.radius || 0);
                        if (distSq <= totalRadius * totalRadius) {
                            results.push({
                                id,
                                position: entity.position,
                                data: entity.data,
                                distanceSq: distSq
                            });
                        }
                    }
                }
            }
        }

        this.stats.queries++;
        return results;
    }

    /**
     * Get the nearest entity to a position
     * @param {THREE.Vector3|{x: number, y: number, z: number}} position - Query center
     * @param {number} maxRadius - Maximum search radius
     * @param {string} [excludeId] - Optional entity ID to exclude
     * @returns {{id: string, position: Object, data: *, distance: number}|null}
     */
    queryNearest(position, maxRadius, excludeId = null) {
        const results = this.queryRadius(position, maxRadius, excludeId);
        if (results.length === 0) return null;

        let nearest = results[0];
        for (let i = 1; i < results.length; i++) {
            if (results[i].distanceSq < nearest.distanceSq) {
                nearest = results[i];
            }
        }

        nearest.distance = Math.sqrt(nearest.distanceSq);
        return nearest;
    }

    /**
     * Check if any entity is within radius of position
     * @param {THREE.Vector3|{x: number, y: number, z: number}} position 
     * @param {number} radius 
     * @param {string} [excludeId]
     * @returns {boolean}
     */
    hasAny(position, radius, excludeId = null) {
        const radiusSq = radius * radius;

        const minX = Math.floor((position.x - radius) / this.cellSize);
        const maxX = Math.floor((position.x + radius) / this.cellSize);
        const minY = Math.floor((position.y - radius) / this.cellSize);
        const maxY = Math.floor((position.y + radius) / this.cellSize);
        const minZ = Math.floor((position.z - radius) / this.cellSize);
        const maxZ = Math.floor((position.z + radius) / this.cellSize);

        for (let cx = minX; cx <= maxX; cx++) {
            for (let cy = minY; cy <= maxY; cy++) {
                for (let cz = minZ; cz <= maxZ; cz++) {
                    const key = `${cx},${cy},${cz}`;
                    const cell = this.cells.get(key);
                    if (!cell) continue;

                    for (const [id, entity] of cell) {
                        if (id === excludeId) continue;

                        const dx = entity.position.x - position.x;
                        const dy = entity.position.y - position.y;
                        const dz = entity.position.z - position.z;
                        const distSq = dx * dx + dy * dy + dz * dz;

                        const totalRadius = radius + (entity.radius || 0);
                        if (distSq <= totalRadius * totalRadius) {
                            return true;
                        }
                    }
                }
            }
        }

        return false;
    }

    /**
     * Clear all entities from the spatial hash
     */
    clear() {
        this.cells.clear();
        this.stats.entities = 0;
        this.stats.cells = 0;
    }

    /**
     * Get statistics about the spatial hash
     * @returns {{entities: number, cells: number, queries: number}}
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Iterate over all entities (useful for debugging)
     * @yields {{id: string, position: Object, data: *}}
     */
    *[Symbol.iterator]() {
        const seen = new Set();
        for (const cell of this.cells.values()) {
            for (const [id, entity] of cell) {
                if (!seen.has(id)) {
                    seen.add(id);
                    yield { id, position: entity.position, data: entity.data };
                }
            }
        }
    }
}

// Singleton for global enemy spatial hash (most common use case)
export const EnemySpatialHash = new SpatialHash(4, 20);

// Singleton for static colliders (arena geometry)
export const ColliderSpatialHash = new SpatialHash(2, 20);
