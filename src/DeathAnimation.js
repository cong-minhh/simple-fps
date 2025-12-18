// DeathAnimation.js - Death animations for enemies and players
// Ragdoll-style physics simulation for death sequences

import * as THREE from 'three';

/**
 * Configuration for death animations
 */
const DEATH_CONFIG = {
    RAGDOLL_DURATION: 2000,  // ms
    GRAVITY: -15,
    ROTATION_SPEED: 5,
    BOUNCE_DAMPING: 0.3,
    FADE_START: 1500,
    FADE_DURATION: 500
};

/**
 * Individual death animation instance
 */
class DeathInstance {
    constructor(mesh, position, deathDirection, type = 'enemy') {
        this.mesh = mesh;
        this.type = type;
        this.startTime = performance.now();
        this.finished = false;

        // Physics state
        this.position = position.clone();
        this.velocity = new THREE.Vector3(
            deathDirection.x * 2 + (Math.random() - 0.5) * 2,
            3 + Math.random() * 2,
            deathDirection.z * 2 + (Math.random() - 0.5) * 2
        );

        // Rotation state
        this.rotation = mesh.rotation.clone();
        this.angularVelocity = new THREE.Vector3(
            (Math.random() - 0.5) * DEATH_CONFIG.ROTATION_SPEED,
            (Math.random() - 0.5) * DEATH_CONFIG.ROTATION_SPEED * 0.5,
            (Math.random() - 0.5) * DEATH_CONFIG.ROTATION_SPEED
        );

        // Ground level
        this.groundY = 0.3;
        this.landed = false;

        // Store original materials for fading
        this.materials = [];
        mesh.traverse(child => {
            if (child.isMesh && child.material) {
                const mat = child.material.clone();
                mat.transparent = true;
                child.material = mat;
                this.materials.push(mat);
            }
        });
    }

    update(dt) {
        if (this.finished) return;

        const elapsed = performance.now() - this.startTime;

        // Apply gravity
        if (!this.landed) {
            this.velocity.y += DEATH_CONFIG.GRAVITY * dt;

            // Update position
            this.position.x += this.velocity.x * dt;
            this.position.y += this.velocity.y * dt;
            this.position.z += this.velocity.z * dt;

            // Check ground collision
            if (this.position.y <= this.groundY) {
                this.position.y = this.groundY;
                this.velocity.y = -this.velocity.y * DEATH_CONFIG.BOUNCE_DAMPING;
                this.velocity.x *= 0.7;
                this.velocity.z *= 0.7;

                // Stop bouncing when velocity is low
                if (Math.abs(this.velocity.y) < 0.5) {
                    this.landed = true;
                    this.velocity.set(0, 0, 0);
                    // Final rotation - lie flat
                    this.rotation.x = Math.PI / 2 * (Math.random() > 0.5 ? 1 : -1);
                    this.rotation.z = (Math.random() - 0.5) * 0.5;
                }
            }

            // Update rotation while falling
            this.rotation.x += this.angularVelocity.x * dt;
            this.rotation.y += this.angularVelocity.y * dt;
            this.rotation.z += this.angularVelocity.z * dt;
        }

        // Apply to mesh
        this.mesh.position.copy(this.position);
        this.mesh.rotation.copy(this.rotation);

        // Fade out
        if (elapsed > DEATH_CONFIG.FADE_START) {
            const fadeProgress = (elapsed - DEATH_CONFIG.FADE_START) / DEATH_CONFIG.FADE_DURATION;
            const opacity = Math.max(0, 1 - fadeProgress);

            this.materials.forEach(mat => {
                mat.opacity = opacity;
            });

            if (opacity <= 0) {
                this.finished = true;
            }
        }

        // Force finish after max duration
        if (elapsed > DEATH_CONFIG.RAGDOLL_DURATION) {
            this.finished = true;
        }

        return this.finished;
    }

    dispose() {
        this.materials.forEach(mat => mat.dispose());
    }
}

/**
 * Death Animation Manager
 * Handles all death animations in the scene
 */
export class DeathAnimationManager {
    constructor(scene) {
        this.scene = scene;
        this.activeDeaths = [];
        this.corpsePool = [];
        this.maxCorpses = 10;
    }

    /**
     * Trigger death animation for an entity
     * @param {THREE.Object3D} entity - The dying entity
     * @param {THREE.Vector3} position - Death position
     * @param {THREE.Vector3} deathDirection - Direction of killing blow
     * @param {string} type - 'enemy' or 'player'
     */
    triggerDeath(entity, position, deathDirection, type = 'enemy') {
        // Clone the entity mesh for the ragdoll
        const corpse = this._createCorpse(entity, type);
        if (!corpse) return null;

        corpse.position.copy(position);
        this.scene.add(corpse);

        const deathInstance = new DeathInstance(
            corpse,
            position,
            deathDirection || new THREE.Vector3(0, 0, 0),
            type
        );

        this.activeDeaths.push(deathInstance);

        // Limit active corpses
        while (this.activeDeaths.length > this.maxCorpses) {
            const oldest = this.activeDeaths.shift();
            this._removeCorpse(oldest);
        }

        return deathInstance;
    }

    /**
     * Create a corpse mesh from entity
     */
    _createCorpse(entity, type) {
        // Create simplified corpse based on type
        const corpse = new THREE.Group();

        if (type === 'enemy') {
            // Create enemy corpse shape
            const bodyGeo = new THREE.BoxGeometry(0.6, 1.2, 0.4);
            const bodyMat = new THREE.MeshStandardMaterial({
                color: 0x882222,
                transparent: true
            });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.position.y = 0.6;
            corpse.add(body);

            // Head
            const headGeo = new THREE.SphereGeometry(0.2, 8, 6);
            const head = new THREE.Mesh(headGeo, bodyMat.clone());
            head.position.y = 1.4;
            corpse.add(head);

            // Arms (simple boxes)
            const armGeo = new THREE.BoxGeometry(0.15, 0.5, 0.15);
            const leftArm = new THREE.Mesh(armGeo, bodyMat.clone());
            leftArm.position.set(-0.4, 0.9, 0);
            leftArm.rotation.z = 0.5;
            corpse.add(leftArm);

            const rightArm = new THREE.Mesh(armGeo, bodyMat.clone());
            rightArm.position.set(0.4, 0.9, 0);
            rightArm.rotation.z = -0.5;
            corpse.add(rightArm);

        } else {
            // Player corpse - simpler shape
            const bodyGeo = new THREE.CapsuleGeometry(0.3, 1.0, 4, 8);
            const bodyMat = new THREE.MeshStandardMaterial({
                color: 0x4488ff,
                transparent: true
            });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.position.y = 0.8;
            corpse.add(body);
        }

        return corpse;
    }

    _removeCorpse(deathInstance) {
        if (deathInstance.mesh) {
            this.scene.remove(deathInstance.mesh);
            deathInstance.mesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        }
        deathInstance.dispose();
    }

    /**
     * Update all active death animations
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        for (let i = this.activeDeaths.length - 1; i >= 0; i--) {
            const death = this.activeDeaths[i];
            const finished = death.update(dt);

            if (finished) {
                this._removeCorpse(death);
                this.activeDeaths.splice(i, 1);
            }
        }
    }

    /**
     * Clear all death animations
     */
    clear() {
        this.activeDeaths.forEach(death => this._removeCorpse(death));
        this.activeDeaths = [];
    }

    /**
     * Dispose of manager
     */
    dispose() {
        this.clear();
    }
}
