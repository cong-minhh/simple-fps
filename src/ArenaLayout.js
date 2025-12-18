// ArenaLayout.js - Arena layout factory for different map configurations
// Creates diverse arena layouts with varying cover, hazards, and spawn points

import * as THREE from 'three';
import { ARENA_LAYOUTS, HAZARDS } from './config/GameConfig.js';

/**
 * @typedef {Object} LayoutConfig
 * @property {string} name - Layout name
 * @property {number} size - Arena half-size
 * @property {Array<Object>} walls - Wall configurations [{pos, size}]
 * @property {Array<Object>} crates - Crate configurations [{pos, size, rotation}]
 * @property {Array<Object>} pillars - Pillar positions [[x, y, z]]
 * @property {Array<Object>} platforms - Platform configurations [{pos, size}]
 * @property {Array<Object>} hazards - Hazard zone configurations [{type, pos, size}]
 * @property {Array<THREE.Vector3>} spawnPoints - Player spawn points
 * @property {Array<THREE.Vector3>} waypoints - AI waypoints
 */

/**
 * Arena layout definitions
 */
export const LAYOUTS = {
    /**
     * WAREHOUSE - Industrial indoor arena (default/current layout)
     * Rectangular crates and barrels, industrial lighting
     */
    WAREHOUSE: {
        name: 'Warehouse',
        floorColor: 0x1a1a2e,
        skyColor: 0x0a0a1a,
        fogNear: 15,
        fogFar: 50,
        size: 10,
        walls: [
            { pos: [-5, 1, -3], size: [3, 2, 0.5] },
            { pos: [5, 1, 3], size: [3, 2, 0.5] },
            { pos: [-3, 1, 5], size: [0.5, 2, 3] },
            { pos: [3, 1, -5], size: [0.5, 2, 3] }
        ],
        crates: [
            { pos: [-6, 0.5, 0], size: 1.0 },
            { pos: [6, 0.5, 0], size: 1.0 },
            { pos: [0, 0.5, 6], size: 1.0 },
            { pos: [0, 0.5, -6], size: 1.0 },
            { pos: [-4, 0.4, -6], size: 0.8 },
            { pos: [4, 0.4, 6], size: 0.8 }
        ],
        pillars: [
            [-12, 2.5, -12], [12, 2.5, -12], [-12, 2.5, 12], [12, 2.5, 12],
            [-12, 2.5, 0], [12, 2.5, 0], [0, 2.5, -12], [0, 2.5, 12]
        ],
        platforms: [
            { pos: [-7, 1.5, -7], size: [3, 0.3, 3] },
            { pos: [7, 1.5, 7], size: [3, 0.3, 3] }
        ],
        hazards: [
            { type: 'TOXIC', pos: [-8, 0, 0], size: [2, 1, 3] },
            { type: 'TOXIC', pos: [8, 0, 0], size: [2, 1, 3] }
        ],
        spawnPoints: [
            [-9, 0, -9], [9, 0, -9], [-9, 0, 9], [9, 0, 9],
            [0, 0, -9], [0, 0, 9], [-9, 0, 0], [9, 0, 0]
        ],
        waypoints: [
            [-6, 0, -6], [6, 0, -6], [6, 0, 6], [-6, 0, 6],
            [0, 0, 0], [-3, 0, 0], [3, 0, 0], [0, 0, -3], [0, 0, 3]
        ]
    },

    /**
     * COURTYARD - Open outdoor arena with central fountain
     * More open sightlines, natural cover, garden-like atmosphere
     */
    COURTYARD: {
        name: 'Courtyard',
        floorColor: 0x2a3a2a,
        skyColor: 0x102030,
        fogNear: 25,
        fogFar: 60,
        size: 12,
        walls: [
            // Low stone walls around perimeter
            { pos: [-10, 0.6, 0], size: [1, 1.2, 8] },
            { pos: [10, 0.6, 0], size: [1, 1.2, 8] },
            { pos: [0, 0.6, -10], size: [8, 1.2, 1] },
            { pos: [0, 0.6, 10], size: [8, 1.2, 1] }
        ],
        crates: [
            // Stone benches and planters
            { pos: [-4, 0.3, -4], size: 0.6 },
            { pos: [4, 0.3, -4], size: 0.6 },
            { pos: [-4, 0.3, 4], size: 0.6 },
            { pos: [4, 0.3, 4], size: 0.6 },
            // Central fountain base
            { pos: [0, 0.5, 0], size: 2.0 }
        ],
        pillars: [
            // Corner columns
            [-11, 2, -11], [11, 2, -11], [-11, 2, 11], [11, 2, 11]
        ],
        platforms: [
            // Raised garden beds
            { pos: [-6, 0.5, 6], size: [2.5, 0.5, 2.5] },
            { pos: [6, 0.5, -6], size: [2.5, 0.5, 2.5] }
        ],
        hazards: [
            // Fountain water (cosmetic, no damage)
            { type: 'WATER', pos: [0, 0.1, 0], size: [1.5, 0.2, 1.5] }
        ],
        spawnPoints: [
            [-9, 0, -9], [9, 0, -9], [-9, 0, 9], [9, 0, 9],
            [-6, 0, 0], [6, 0, 0], [0, 0, -6], [0, 0, 6]
        ],
        waypoints: [
            [-5, 0, -5], [5, 0, -5], [5, 0, 5], [-5, 0, 5],
            [0, 0, 0], [-8, 0, 0], [8, 0, 0], [0, 0, -8], [0, 0, 8]
        ],
        outdoorLighting: true
    },

    /**
     * BUNKER - Underground military bunker with tight corridors
     * Close quarters, low ceiling, industrial feel
     */
    BUNKER: {
        name: 'Bunker',
        floorColor: 0x2a2a2a,
        skyColor: 0x0a0a0a,
        fogNear: 8,
        fogFar: 25,
        size: 9,
        ceilingHeight: 3,
        walls: [
            // Central corridor walls
            { pos: [-3, 1.5, 0], size: [0.5, 3, 12] },
            { pos: [3, 1.5, 0], size: [0.5, 3, 12] },
            // Cross corridors
            { pos: [0, 1.5, -4], size: [6, 3, 0.5] },
            { pos: [0, 1.5, 4], size: [6, 3, 0.5] },
            // Side rooms
            { pos: [-6, 1.5, -6], size: [3, 3, 0.5] },
            { pos: [6, 1.5, 6], size: [3, 3, 0.5] }
        ],
        crates: [
            // Supply crates
            { pos: [-5, 0.4, -2], size: 0.8 },
            { pos: [-5, 0.4, 2], size: 0.8 },
            { pos: [5, 0.4, -2], size: 0.8 },
            { pos: [5, 0.4, 2], size: 0.8 },
            // Barricades
            { pos: [0, 0.5, 0], size: 1.0 }
        ],
        pillars: [
            // Support columns
            [-6, 1.5, 0], [6, 1.5, 0], [0, 1.5, -7], [0, 1.5, 7]
        ],
        platforms: [],
        hazards: [
            // Fire hazard in damaged section
            { type: 'FIRE', pos: [-7, 0, 5], size: [1.5, 1, 1.5] },
            // Toxic leak
            { type: 'TOXIC', pos: [7, 0, -5], size: [1.5, 1, 2] }
        ],
        spawnPoints: [
            [-7, 0, -7], [7, 0, -7], [-7, 0, 7], [7, 0, 7],
            [0, 0, -7], [0, 0, 7], [-7, 0, 0], [7, 0, 0]
        ],
        waypoints: [
            [-5, 0, -5], [5, 0, -5], [5, 0, 5], [-5, 0, 5],
            [0, 0, 0], [-5, 0, 0], [5, 0, 0], [0, 0, -5], [0, 0, 5]
        ],
        lowCeiling: true
    }
};

/**
 * Arena Layout Factory
 * Creates and configures arena layouts programmatically
 */
export class ArenaLayoutFactory {
    /**
     * Get layout configuration by name
     * @param {string} layoutName - Layout name ('WAREHOUSE', 'COURTYARD', 'BUNKER')
     * @returns {Object} Layout configuration
     */
    static getLayout(layoutName) {
        const layout = LAYOUTS[layoutName.toUpperCase()];
        if (!layout) {
            console.warn(`Unknown layout: ${layoutName}, defaulting to WAREHOUSE`);
            return LAYOUTS.WAREHOUSE;
        }
        return layout;
    }

    /**
     * Get all available layout names
     * @returns {string[]} Array of layout names
     */
    static getLayoutNames() {
        return Object.keys(LAYOUTS);
    }

    /**
     * Get spawn points for a layout
     * @param {string} layoutName - Layout name
     * @returns {THREE.Vector3[]} Array of spawn points
     */
    static getSpawnPoints(layoutName) {
        const layout = this.getLayout(layoutName);
        return layout.spawnPoints.map(pos =>
            Array.isArray(pos) ? new THREE.Vector3(pos[0], pos[1], pos[2]) : pos.clone()
        );
    }

    /**
     * Get waypoints for a layout
     * @param {string} layoutName - Layout name
     * @returns {THREE.Vector3[]} Array of waypoints
     */
    static getWaypoints(layoutName) {
        const layout = this.getLayout(layoutName);
        return layout.waypoints.map(pos =>
            Array.isArray(pos) ? new THREE.Vector3(pos[0], pos[1], pos[2]) : pos.clone()
        );
    }

    /**
     * Get hazard configurations for a layout
     * @param {string} layoutName - Layout name
     * @returns {Object[]} Array of hazard configs
     */
    static getHazards(layoutName) {
        const layout = this.getLayout(layoutName);
        return layout.hazards.map(hazard => ({
            ...hazard,
            config: HAZARDS[hazard.type] || { damage: 0, interval: 1000 }
        }));
    }

    /**
     * Get random spawn point far from a position
     * @param {string} layoutName - Layout name
     * @param {THREE.Vector3} avoidPos - Position to avoid
     * @param {number} minDistance - Minimum distance (default 8)
     * @returns {THREE.Vector3} Spawn point
     */
    static getSpawnPointFarFrom(layoutName, avoidPos, minDistance = 8) {
        const spawnPoints = this.getSpawnPoints(layoutName);

        if (!avoidPos) {
            return spawnPoints[Math.floor(Math.random() * spawnPoints.length)].clone();
        }

        // Filter by minimum distance
        const validSpawns = spawnPoints.filter(sp => sp.distanceTo(avoidPos) >= minDistance);

        if (validSpawns.length === 0) {
            // Return furthest spawn
            let maxDist = 0;
            let bestSpawn = spawnPoints[0];
            for (const sp of spawnPoints) {
                const dist = sp.distanceTo(avoidPos);
                if (dist > maxDist) {
                    maxDist = dist;
                    bestSpawn = sp;
                }
            }
            return bestSpawn.clone();
        }

        return validSpawns[Math.floor(Math.random() * validSpawns.length)].clone();
    }

    /**
     * Create materials for a layout
     * @param {string} layoutName - Layout name
     * @returns {Object} Material dictionary
     */
    static createMaterials(layoutName) {
        const layout = this.getLayout(layoutName);

        return {
            floor: new THREE.MeshStandardMaterial({
                color: layout.floorColor,
                roughness: 0.7,
                metalness: 0.3
            }),
            wall: new THREE.MeshStandardMaterial({
                color: layout.name === 'Courtyard' ? 0x6a6a6a : 0x4a4a5a,
                roughness: 0.6,
                metalness: 0.3
            }),
            pillar: new THREE.MeshStandardMaterial({
                color: layout.name === 'Courtyard' ? 0x5a5a5a : 0x3a3a4a,
                roughness: 0.4,
                metalness: 0.6
            })
        };
    }
}

export { HAZARDS };
