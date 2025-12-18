// BulletTracer.js - High-performance visual bullet tracer system
// Uses object pooling to minimize GC and maximize performance
// Hit detection remains instant (hitscan), tracers are purely visual
import * as THREE from 'three';
import { POOL_SIZES, TRACER } from './config/RenderConfig.js';

// Pool configuration from centralized config
const POOL_SIZE = POOL_SIZES.BULLET_TRACERS;
const TRACER_SPEED = TRACER.SPEED;
const TRACER_LENGTH = TRACER.LENGTH;
const TRACER_FADE_SPEED = TRACER.FADE_SPEED;

/**
 * Manages all player bullet tracers with object pooling
 * Visual-only system - hit detection is separate (hitscan)
 */
export class BulletTracerManager {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.pool = [];
        this.active = [];

        // Shared geometry - thin elongated box for tracer
        // Offset so the BACK of the tracer is at position (0,0,0), not center
        // This ensures tracer visually starts from muzzle at any speed
        this.geometry = new THREE.BoxGeometry(0.02, 0.02, TRACER_LENGTH);
        this.geometry.translate(0, 0, -TRACER_LENGTH / 2);

        // Glowing tracer material with additive blending for visibility
        this.material = new THREE.MeshBasicMaterial({
            color: 0xffdd44,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        // Pre-allocate reusable vectors (zero GC in update loop)
        this._tempVec = new THREE.Vector3();
        this._direction = new THREE.Vector3();
        this._startPos = new THREE.Vector3();

        // Initialize pool
        this.initPool();
    }

    initPool() {
        for (let i = 0; i < POOL_SIZE; i++) {
            const mesh = new THREE.Mesh(this.geometry, this.material.clone());
            mesh.visible = false;
            mesh.renderOrder = 999; // Render on top
            this.scene.add(mesh);

            this.pool.push({
                mesh: mesh,
                startPos: new THREE.Vector3(),
                targetPos: new THREE.Vector3(),
                direction: new THREE.Vector3(),
                currentPos: new THREE.Vector3(),
                distance: 0,
                traveled: 0,
                fading: false,
                opacity: 1,
                active: false
            });
        }
    }

    /**
     * Get the muzzle position in world space
     * Uses the gun's stored muzzle offset for accuracy
     */
    getMuzzleWorldPosition(gunModel) {
        if (!gunModel) return null;

        // Use stored muzzle offset from gun model if available
        const muzzleOffset = gunModel.userData.muzzleOffset;
        if (muzzleOffset) {
            const muzzleWorld = new THREE.Vector3();
            gunModel.localToWorld(muzzleWorld.copy(muzzleOffset));
            return muzzleWorld;
        }

        // Fallback: estimate based on gun size
        const muzzleLocal = new THREE.Vector3(0, 0.02, -0.6);
        const muzzleWorld = new THREE.Vector3();
        gunModel.localToWorld(muzzleWorld.copy(muzzleLocal));
        return muzzleWorld;
    }

    /**
     * Fire a visual tracer from muzzle toward target
     * @param {THREE.Vector3} origin - Start position (muzzle)
     * @param {THREE.Vector3} target - End position (hit point or max range)
     * @param {string} weaponType - Weapon type for visual variation
     * @returns {boolean} - True if tracer was spawned
     */
    fire(origin, target, weaponType = 'RIFLE') {
        // Find inactive tracer from pool
        let tracer = null;
        for (let i = 0; i < this.pool.length; i++) {
            if (!this.pool[i].active) {
                tracer = this.pool[i];
                break;
            }
        }

        if (!tracer) {
            // Pool exhausted - skip this tracer
            return false;
        }

        // Initialize tracer
        tracer.active = true;
        tracer.fading = false;
        tracer.opacity = 1;
        tracer.startPos.copy(origin);
        tracer.targetPos.copy(target);
        tracer.currentPos.copy(origin);
        tracer.traveled = 0;

        // Calculate direction and distance
        tracer.direction.subVectors(target, origin).normalize();
        tracer.distance = origin.distanceTo(target);

        // Position and orient mesh
        tracer.mesh.position.copy(origin);
        tracer.mesh.lookAt(target);
        tracer.mesh.visible = true;
        tracer.mesh.material.opacity = 1;

        // Set tracer color based on weapon (using centralized config)
        const color = TRACER.COLORS[weaponType] || TRACER.COLORS.RIFLE;
        tracer.mesh.material.color.setHex(color);

        this.active.push(tracer);
        return true;
    }

    /**
     * Fire tracer from muzzle toward hit point or along ray direction
     * @param {THREE.Vector3} hitPoint - Hit point (if bullet hit something)
     * @param {THREE.Object3D} gunModel - Gun model for muzzle position
     * @param {string} weaponType - Weapon type
     * @param {number} maxRange - Max range if no hit
     * @param {THREE.Vector3} rayDirection - Optional: exact ray direction (includes spread)
     */
    fireFromCamera(hitPoint, gunModel, weaponType = 'RIFLE', maxRange = 100, rayDirection = null) {
        // Get muzzle position
        let muzzlePos;
        if (gunModel) {
            muzzlePos = this.getMuzzleWorldPosition(gunModel);
        }
        if (!muzzlePos) {
            // Fallback: use camera position offset slightly forward
            muzzlePos = this.camera.position.clone();
            const forward = new THREE.Vector3(0, 0, -1);
            forward.applyQuaternion(this.camera.quaternion);
            muzzlePos.add(forward.multiplyScalar(0.5));
        }

        // Calculate target position
        let targetPos;
        if (hitPoint) {
            // We have a hit point - trace to it
            targetPos = hitPoint.clone();
        } else if (rayDirection) {
            // No hit but we have ray direction - trace along that direction to max range
            targetPos = muzzlePos.clone().add(rayDirection.clone().normalize().multiplyScalar(maxRange));
        } else {
            // Fallback: shoot straight forward from camera
            const forward = new THREE.Vector3(0, 0, -1);
            forward.applyQuaternion(this.camera.quaternion);
            targetPos = muzzlePos.clone().add(forward.multiplyScalar(maxRange));
        }

        this.fire(muzzlePos, targetPos, weaponType);
    }

    /**
     * Update all active tracers - optimized for performance
     * @param {number} deltaTime - Frame delta in seconds
     */
    update(deltaTime) {
        // Iterate backwards for safe removal
        for (let i = this.active.length - 1; i >= 0; i--) {
            const t = this.active[i];

            if (t.fading) {
                // Fade out after reaching target
                t.opacity -= TRACER_FADE_SPEED * deltaTime;
                t.mesh.material.opacity = Math.max(0, t.opacity);

                if (t.opacity <= 0) {
                    this.deactivate(t, i);
                }
            } else {
                // Move toward target
                const moveAmount = TRACER_SPEED * deltaTime;
                t.traveled += moveAmount;

                if (t.traveled >= t.distance) {
                    // Reached target - start fading
                    t.currentPos.copy(t.targetPos);
                    t.fading = true;
                } else {
                    // Update position
                    t.currentPos.addScaledVector(t.direction, moveAmount);
                }

                // Update mesh position
                t.mesh.position.copy(t.currentPos);
            }
        }
    }

    deactivate(tracer, activeIndex) {
        tracer.active = false;
        tracer.mesh.visible = false;
        this.active.splice(activeIndex, 1);
    }

    /**
     * Get count of active tracers (for debugging)
     */
    getActiveCount() {
        return this.active.length;
    }

    /**
     * Clear all tracers (on game reset)
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

        for (const t of this.pool) {
            t.mesh.material.dispose();
            this.scene.remove(t.mesh);
        }
    }
}
