// WeaponPickup.js - Weapon pickup system for arena
// Spawns collectible weapons that players can pick up to change their loadout

import * as THREE from 'three';
import { WEAPONS, PICKUPS } from './config/GameConfig.js';

/**
 * Individual weapon pickup entity
 */
class WeaponPickupEntity {
    constructor(scene, weaponType, position) {
        this.scene = scene;
        this.weaponType = weaponType;
        this.weapon = WEAPONS[weaponType];
        this.position = position.clone();
        this.isCollected = false;
        this.respawnTime = PICKUPS.RESPAWN_TIME;
        this.respawnTimer = 0;

        // Visual
        this.mesh = null;
        this.glowMesh = null;
        this.rotation = 0;
        this.bobOffset = 0;

        this._createVisual();
    }

    _createVisual() {
        // Create weapon model (simplified version)
        const config = this.weapon.model;
        const bodyGeo = new THREE.BoxGeometry(...config.bodySize);
        const barrelGeo = new THREE.BoxGeometry(...config.barrelSize);

        const material = new THREE.MeshStandardMaterial({
            color: config.color,
            roughness: 0.4,
            metalness: 0.6
        });

        // Create group
        this.mesh = new THREE.Group();

        // Body
        const body = new THREE.Mesh(bodyGeo, material);
        this.mesh.add(body);

        // Barrel
        const barrel = new THREE.Mesh(barrelGeo, material);
        barrel.position.z = config.bodySize[2] / 2 + config.barrelSize[2] / 2;
        this.mesh.add(barrel);

        // Position
        this.mesh.position.copy(this.position);
        this.mesh.position.y += PICKUPS.FLOAT_HEIGHT;

        // Glow effect
        const glowGeo = new THREE.SphereGeometry(0.4, 8, 8);
        const glowMat = new THREE.MeshBasicMaterial({
            color: this._getGlowColor(),
            transparent: true,
            opacity: 0.3
        });
        this.glowMesh = new THREE.Mesh(glowGeo, glowMat);
        this.glowMesh.position.copy(this.mesh.position);

        // Add to scene
        this.scene.add(this.mesh);
        this.scene.add(this.glowMesh);
    }

    _getGlowColor() {
        switch (this.weaponType) {
            case 'RIFLE': return 0x4488ff;
            case 'SMG': return 0x44ff44;
            case 'SHOTGUN': return 0xff8844;
            case 'SNIPER': return 0xff44ff;
            case 'PISTOL': return 0xffff44;
            default: return 0xffffff;
        }
    }

    update(deltaTime) {
        if (this.isCollected) {
            // Count down respawn timer
            this.respawnTimer -= deltaTime * 1000;
            if (this.respawnTimer <= 0) {
                this.respawn();
            }
            return;
        }

        // Rotate
        this.rotation += PICKUPS.ROTATION_SPEED * deltaTime;
        this.mesh.rotation.y = this.rotation;

        // Bob up and down
        this.bobOffset += deltaTime * 2;
        const bob = Math.sin(this.bobOffset) * 0.1;
        this.mesh.position.y = this.position.y + PICKUPS.FLOAT_HEIGHT + bob;
        this.glowMesh.position.y = this.mesh.position.y;

        // Pulse glow
        const pulse = 0.3 + Math.sin(this.bobOffset * 2) * 0.1;
        this.glowMesh.material.opacity = pulse;
    }

    collect() {
        if (this.isCollected) return false;

        this.isCollected = true;
        this.respawnTimer = this.respawnTime;

        // Hide
        this.mesh.visible = false;
        this.glowMesh.visible = false;

        return true;
    }

    respawn() {
        this.isCollected = false;
        this.mesh.visible = true;
        this.glowMesh.visible = true;
    }

    checkCollision(playerPos, collectRadius = PICKUPS.COLLECT_RADIUS) {
        if (this.isCollected) return false;

        const dx = playerPos.x - this.position.x;
        const dz = playerPos.z - this.position.z;
        const distSq = dx * dx + dz * dz;

        return distSq < collectRadius * collectRadius;
    }

    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        }
        if (this.glowMesh) {
            this.scene.remove(this.glowMesh);
            this.glowMesh.geometry.dispose();
            this.glowMesh.material.dispose();
        }
    }
}

/**
 * Weapon Pickup Manager
 * Manages all weapon pickups in the arena
 */
export class WeaponPickupManager {
    constructor(scene) {
        this.scene = scene;
        this.pickups = [];

        // Callbacks
        this.onWeaponCollected = null;

        // Pre-allocate temp vector
        this._tempVec = new THREE.Vector3();
    }

    /**
     * Spawn default weapon pickups for arena
     */
    spawnDefaultPickups() {
        // Strategic pickup locations
        const pickupConfigs = [
            { weapon: 'RIFLE', pos: new THREE.Vector3(-6, 0, -6) },
            { weapon: 'SMG', pos: new THREE.Vector3(6, 0, 6) },
            { weapon: 'SHOTGUN', pos: new THREE.Vector3(0, 0, 8) },
            { weapon: 'SNIPER', pos: new THREE.Vector3(0, 0, -8) },
            { weapon: 'RIFLE', pos: new THREE.Vector3(6, 0, -6) },
            { weapon: 'SMG', pos: new THREE.Vector3(-6, 0, 6) }
        ];

        pickupConfigs.forEach(config => {
            this.addPickup(config.weapon, config.pos);
        });
    }

    /**
     * Add a weapon pickup at a position
     * @param {string} weaponType - Weapon type from WEAPONS config
     * @param {THREE.Vector3} position - World position
     * @returns {WeaponPickupEntity}
     */
    addPickup(weaponType, position) {
        const pickup = new WeaponPickupEntity(this.scene, weaponType, position);
        this.pickups.push(pickup);
        return pickup;
    }

    /**
     * Remove a specific pickup
     * @param {WeaponPickupEntity} pickup
     */
    removePickup(pickup) {
        const index = this.pickups.indexOf(pickup);
        if (index >= 0) {
            pickup.dispose();
            this.pickups.splice(index, 1);
        }
    }

    /**
     * Update all pickups and check for player collection
     * @param {number} deltaTime - Frame delta in seconds
     * @param {THREE.Vector3} playerPos - Player position
     * @returns {string|null} Collected weapon type or null
     */
    update(deltaTime, playerPos) {
        let collected = null;

        for (const pickup of this.pickups) {
            pickup.update(deltaTime);

            // Check collection
            if (playerPos && pickup.checkCollision(playerPos)) {
                if (pickup.collect()) {
                    collected = pickup.weaponType;

                    if (this.onWeaponCollected) {
                        this.onWeaponCollected(pickup.weaponType);
                    }
                }
            }
        }

        return collected;
    }

    /**
     * Get nearest available pickup to a position
     * @param {THREE.Vector3} position
     * @returns {{pickup: WeaponPickupEntity, distance: number}|null}
     */
    getNearestPickup(position) {
        let nearest = null;
        let minDistSq = Infinity;

        for (const pickup of this.pickups) {
            if (pickup.isCollected) continue;

            const dx = position.x - pickup.position.x;
            const dz = position.z - pickup.position.z;
            const distSq = dx * dx + dz * dz;

            if (distSq < minDistSq) {
                minDistSq = distSq;
                nearest = pickup;
            }
        }

        return nearest ? { pickup: nearest, distance: Math.sqrt(minDistSq) } : null;
    }

    /**
     * Get count of available pickups
     * @returns {number}
     */
    getAvailableCount() {
        return this.pickups.filter(p => !p.isCollected).length;
    }

    /**
     * Clear all pickups
     */
    clear() {
        this.pickups.forEach(p => p.dispose());
        this.pickups = [];
    }

    /**
     * Reset all pickups (make them available again)
     */
    reset() {
        this.pickups.forEach(p => p.respawn());
    }

    /**
     * Dispose of manager
     */
    dispose() {
        this.clear();
    }
}
