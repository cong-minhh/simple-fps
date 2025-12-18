// CameraEffects.js - Screen shake, camera trauma, and visual feedback effects
// Provides juice and game feel through camera movement

import * as THREE from 'three';

/**
 * Shake presets for different events
 */
export const SHAKE_PRESETS = {
    WEAPON_FIRE: { trauma: 0.1, duration: 0.1 },
    SHOTGUN_FIRE: { trauma: 0.25, duration: 0.15 },
    SNIPER_FIRE: { trauma: 0.3, duration: 0.2 },
    EXPLOSION_NEAR: { trauma: 0.6, duration: 0.4 },
    EXPLOSION_FAR: { trauma: 0.2, duration: 0.3 },
    DAMAGE_LIGHT: { trauma: 0.15, duration: 0.15 },
    DAMAGE_HEAVY: { trauma: 0.4, duration: 0.25 },
    LANDING: { trauma: 0.1, duration: 0.1 },
    LANDING_HEAVY: { trauma: 0.2, duration: 0.15 }
};

/**
 * Camera effects manager for screen shake and visual feedback
 */
export class CameraEffects {
    constructor(camera) {
        this.camera = camera;

        // Trauma-based shake (cumulative, decays over time)
        this.trauma = 0;
        this.traumaDecay = 2.0; // Trauma reduction per second

        // Shake parameters
        this.maxShakeOffset = 0.15;
        this.maxShakeAngle = 0.03;
        this.shakeFrequency = 25; // Perlin noise frequency

        // Current shake values
        this.shakeOffset = new THREE.Vector3();
        this.shakeRotation = new THREE.Euler();

        // Original camera state (for restoration)
        this.originalPosition = new THREE.Vector3();
        this.originalRotation = new THREE.Euler();

        // Noise time offset (for smooth Perlin-like shake)
        this.noiseTime = 0;
        this.noiseSeed = Math.random() * 1000;

        // Recoil kick (separate from trauma shake)
        this.recoilOffset = new THREE.Vector3();
        this.recoilRotation = new THREE.Euler();
        this.recoilRecoverySpeed = 10;

        // FOV effects
        this.baseFov = 75;
        this.targetFov = 75;
        this.currentFov = 75;
        this.fovLerpSpeed = 8;

        // Tilt effects (for strafing, leaning)
        this.targetTilt = 0;
        this.currentTilt = 0;
        this.tiltLerpSpeed = 6;

        // Landing bob
        this.landingBob = 0;
        this.landingBobDecay = 8;

        // Enabled state
        this.enabled = true;
    }

    /**
     * Store current camera state before applying effects
     */
    saveState() {
        this.originalPosition.copy(this.camera.position);
        this.originalRotation.copy(this.camera.rotation);
    }

    /**
     * Restore camera to original state (call before player movement)
     */
    restoreState() {
        this.camera.position.copy(this.originalPosition);
        this.camera.rotation.copy(this.originalRotation);
    }

    /**
     * Add trauma (cumulative, capped at 1.0)
     * @param {number} amount - Trauma amount (0-1)
     */
    addTrauma(amount) {
        if (!this.enabled) return;
        this.trauma = Math.min(1.0, this.trauma + amount);
    }

    /**
     * Apply a shake preset
     * @param {Object} preset - Shake preset from SHAKE_PRESETS
     */
    applyPreset(preset) {
        if (preset && preset.trauma) {
            this.addTrauma(preset.trauma);
        }
    }

    /**
     * Add weapon recoil kick
     * @param {number} pitch - Upward pitch in radians
     * @param {number} yaw - Horizontal yaw in radians
     */
    addRecoilKick(pitch, yaw = 0) {
        if (!this.enabled) return;
        this.recoilRotation.x -= pitch;
        this.recoilRotation.y += yaw;
    }

    /**
     * Set target FOV (for ADS, sprint effects)
     * @param {number} fov - Target FOV
     */
    setTargetFov(fov) {
        this.targetFov = fov;
    }

    /**
     * Reset FOV to base
     */
    resetFov() {
        this.targetFov = this.baseFov;
    }

    /**
     * Set camera tilt (for strafing)
     * @param {number} tilt - Tilt angle in radians
     */
    setTilt(tilt) {
        this.targetTilt = tilt;
    }

    /**
     * Trigger landing bob effect
     * @param {number} intensity - Landing intensity (0-1)
     */
    triggerLandingBob(intensity = 0.5) {
        if (!this.enabled) return;
        this.landingBob = intensity * 0.1;
    }

    /**
     * Perlin-like noise function (using sin for performance)
     */
    _noise(t, seed) {
        // Simple pseudo-noise using multiple sine waves
        return Math.sin(t * 1.0 + seed) * 0.5 +
            Math.sin(t * 2.3 + seed * 1.7) * 0.3 +
            Math.sin(t * 4.1 + seed * 2.3) * 0.2;
    }

    /**
     * Update all camera effects
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        if (!this.enabled) return;

        // Update noise time
        this.noiseTime += dt * this.shakeFrequency;

        // Calculate shake intensity (trauma squared for more punch)
        const shake = this.trauma * this.trauma;

        // Calculate shake offset using noise
        if (shake > 0.001) {
            this.shakeOffset.x = this.maxShakeOffset * shake *
                this._noise(this.noiseTime, this.noiseSeed);
            this.shakeOffset.y = this.maxShakeOffset * shake *
                this._noise(this.noiseTime + 100, this.noiseSeed + 50);
            this.shakeOffset.z = this.maxShakeOffset * shake * 0.5 *
                this._noise(this.noiseTime + 200, this.noiseSeed + 100);

            this.shakeRotation.x = this.maxShakeAngle * shake *
                this._noise(this.noiseTime + 300, this.noiseSeed + 150);
            this.shakeRotation.y = this.maxShakeAngle * shake *
                this._noise(this.noiseTime + 400, this.noiseSeed + 200);
            this.shakeRotation.z = this.maxShakeAngle * shake * 0.5 *
                this._noise(this.noiseTime + 500, this.noiseSeed + 250);
        } else {
            this.shakeOffset.set(0, 0, 0);
            this.shakeRotation.set(0, 0, 0);
        }

        // Decay trauma
        this.trauma = Math.max(0, this.trauma - this.traumaDecay * dt);

        // Recover recoil
        this.recoilRotation.x *= Math.max(0, 1 - this.recoilRecoverySpeed * dt);
        this.recoilRotation.y *= Math.max(0, 1 - this.recoilRecoverySpeed * dt);
        this.recoilOffset.multiplyScalar(Math.max(0, 1 - this.recoilRecoverySpeed * dt));

        // Update FOV
        this.currentFov += (this.targetFov - this.currentFov) * this.fovLerpSpeed * dt;
        if (this.camera.fov !== undefined) {
            this.camera.fov = this.currentFov;
            this.camera.updateProjectionMatrix();
        }

        // Update tilt
        this.currentTilt += (this.targetTilt - this.currentTilt) * this.tiltLerpSpeed * dt;

        // Decay landing bob
        this.landingBob *= Math.max(0, 1 - this.landingBobDecay * dt);

        // Apply all effects to camera
        this._applyEffects();
    }

    /**
     * Apply accumulated effects to camera
     */
    _applyEffects() {
        // Apply position effects
        this.camera.position.x += this.shakeOffset.x + this.recoilOffset.x;
        this.camera.position.y += this.shakeOffset.y + this.recoilOffset.y - this.landingBob;
        this.camera.position.z += this.shakeOffset.z + this.recoilOffset.z;

        // Apply rotation effects
        this.camera.rotation.x += this.shakeRotation.x + this.recoilRotation.x;
        this.camera.rotation.y += this.shakeRotation.y + this.recoilRotation.y;
        this.camera.rotation.z += this.shakeRotation.z + this.currentTilt;
    }

    /**
     * Get current trauma level
     * @returns {number} Current trauma (0-1)
     */
    getTrauma() {
        return this.trauma;
    }

    /**
     * Enable/disable all effects
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.trauma = 0;
            this.shakeOffset.set(0, 0, 0);
            this.shakeRotation.set(0, 0, 0);
            this.recoilOffset.set(0, 0, 0);
            this.recoilRotation.set(0, 0, 0);
        }
    }

    /**
     * Reset all effects
     */
    reset() {
        this.trauma = 0;
        this.noiseTime = 0;
        this.shakeOffset.set(0, 0, 0);
        this.shakeRotation.set(0, 0, 0);
        this.recoilOffset.set(0, 0, 0);
        this.recoilRotation.set(0, 0, 0);
        this.currentFov = this.baseFov;
        this.targetFov = this.baseFov;
        this.currentTilt = 0;
        this.targetTilt = 0;
        this.landingBob = 0;
    }
}
