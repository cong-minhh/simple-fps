// EnemyProjectile.js - Performance-optimized pooled projectile system for enemies
import * as THREE from 'three';
import { POOL_SIZES, PROJECTILE } from './config/RenderConfig.js';

// Pool configuration from centralized config
const POOL_SIZE = POOL_SIZES.ENEMY_PROJECTILES;
const PROJECTILE_SPEED = PROJECTILE.SPEED;
const PROJECTILE_LIFETIME = PROJECTILE.LIFETIME;

/**
 * Manages all enemy projectiles with object pooling to minimize GC
 * Single shared geometry/material for all projectiles (instancing-friendly)
 */
export class EnemyProjectileManager {
    constructor(scene) {
        this.scene = scene;
        this.pool = [];
        this.active = [];

        // Shared geometry and material (one draw call + uniforms)
        this.geometry = new THREE.SphereGeometry(0.12, 6, 6);
        this.material = new THREE.MeshBasicMaterial({
            color: 0xff4444,
            transparent: true,
            opacity: 0.9
        });

        // Trail material
        this.trailMaterial = new THREE.MeshBasicMaterial({
            color: 0xff2222,
            transparent: true,
            opacity: 0.5
        });
        this.trailGeometry = new THREE.SphereGeometry(0.06, 4, 4);

        // Pre-allocate reusable vectors (zero GC in update loop)
        this._tempVec = new THREE.Vector3();
        this._direction = new THREE.Vector3();

        // Player reference for hit detection
        this.player = null;
        this.playerHitRadius = 0.5;

        // Damage callback
        this.onHitPlayer = null;

        // Initialize pool
        this.initPool();
    }

    initPool() {
        for (let i = 0; i < POOL_SIZE; i++) {
            const mesh = new THREE.Mesh(this.geometry, this.material);
            mesh.visible = false;
            this.scene.add(mesh);

            // Trail meshes (3 trail segments)
            const trails = [];
            for (let t = 0; t < 3; t++) {
                const trail = new THREE.Mesh(this.trailGeometry, this.trailMaterial);
                trail.visible = false;
                trail.scale.setScalar(1 - t * 0.25);
                this.scene.add(trail);
                trails.push(trail);
            }

            this.pool.push({
                mesh: mesh,
                trails: trails,
                velocity: new THREE.Vector3(),
                position: new THREE.Vector3(),
                prevPositions: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
                lifetime: 0,
                damage: 0,
                active: false
            });
        }
    }

    setPlayer(player) {
        this.player = player;
    }

    /**
     * Fire a projectile from origin toward target
     * @param {THREE.Vector3} origin - Start position
     * @param {THREE.Vector3} target - Target position (usually player)
     * @param {number} damage - Damage to deal on hit
     * @param {number} speed - Optional speed override
     * @returns {boolean} - True if projectile was spawned
     */
    fire(origin, target, damage, speed = PROJECTILE_SPEED) {
        // Find inactive projectile from pool
        let projectile = null;
        for (let i = 0; i < this.pool.length; i++) {
            if (!this.pool[i].active) {
                projectile = this.pool[i];
                break;
            }
        }

        if (!projectile) {
            // Pool exhausted - optionally recycle oldest
            return false;
        }

        // Initialize projectile
        projectile.active = true;
        projectile.lifetime = 0;
        projectile.damage = damage;
        projectile.position.copy(origin);
        projectile.mesh.position.copy(origin);
        projectile.mesh.visible = true;

        // Calculate velocity toward target with slight randomization
        this._direction.subVectors(target, origin).normalize();
        // Add small accuracy spread
        this._direction.x += (Math.random() - 0.5) * 0.1;
        this._direction.y += (Math.random() - 0.5) * 0.05;
        this._direction.z += (Math.random() - 0.5) * 0.1;
        this._direction.normalize();

        projectile.velocity.copy(this._direction).multiplyScalar(speed);

        // Reset trail positions
        for (let i = 0; i < projectile.prevPositions.length; i++) {
            projectile.prevPositions[i].copy(origin);
        }

        this.active.push(projectile);
        return true;
    }

    /**
     * Update all active projectiles - optimized for performance
     * @param {number} deltaTime - Frame delta in seconds
     */
    update(deltaTime) {
        if (!this.player) return;

        const playerPos = this.player.getPosition();
        const hitRadiusSq = this.playerHitRadius * this.playerHitRadius;

        // Iterate backwards for safe removal
        for (let i = this.active.length - 1; i >= 0; i--) {
            const p = this.active[i];

            // Store previous position for trail
            p.prevPositions[2].copy(p.prevPositions[1]);
            p.prevPositions[1].copy(p.prevPositions[0]);
            p.prevPositions[0].copy(p.position);

            // Move projectile
            p.position.x += p.velocity.x * deltaTime;
            p.position.y += p.velocity.y * deltaTime;
            p.position.z += p.velocity.z * deltaTime;
            p.mesh.position.copy(p.position);

            // Update trail visuals
            for (let t = 0; t < p.trails.length; t++) {
                p.trails[t].position.copy(p.prevPositions[t]);
                p.trails[t].visible = true;
            }

            p.lifetime += deltaTime;

            // Check player collision (distance squared for performance)
            this._tempVec.subVectors(p.position, playerPos);
            const distSq = this._tempVec.lengthSq();

            if (distSq < hitRadiusSq) {
                // Hit player!
                if (this.onHitPlayer) {
                    this.onHitPlayer(p.damage);
                }
                this.deactivate(p, i);
                continue;
            }

            // Check lifetime
            if (p.lifetime > PROJECTILE_LIFETIME) {
                this.deactivate(p, i);
                continue;
            }

            // Check out of bounds (arena is ~20x20)
            if (Math.abs(p.position.x) > 15 || Math.abs(p.position.z) > 15 || p.position.y < 0) {
                this.deactivate(p, i);
                continue;
            }
        }
    }

    deactivate(projectile, activeIndex) {
        projectile.active = false;
        projectile.mesh.visible = false;
        for (let t = 0; t < projectile.trails.length; t++) {
            projectile.trails[t].visible = false;
        }
        this.active.splice(activeIndex, 1);
    }

    /**
     * Get count of active projectiles (for debugging/HUD)
     */
    getActiveCount() {
        return this.active.length;
    }

    /**
     * Clear all projectiles (on game reset)
     */
    reset() {
        for (let i = this.active.length - 1; i >= 0; i--) {
            this.deactivate(this.active[i], i);
        }
    }

    dispose() {
        this.reset();
        this.geometry.dispose();
        this.material.dispose();
        this.trailMaterial.dispose();
        this.trailGeometry.dispose();

        for (const p of this.pool) {
            this.scene.remove(p.mesh);
            for (const t of p.trails) {
                this.scene.remove(t);
            }
        }
    }
}
