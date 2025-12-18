// WeatherSystem.js - Dynamic weather effects for the arena
// Rain, fog variations, and atmospheric effects

import * as THREE from 'three';

/**
 * Weather configuration presets
 */
const WEATHER_PRESETS = {
    CLEAR: {
        fogNear: 50,
        fogFar: 100,
        fogColor: 0x1a1a2e,
        rainIntensity: 0,
        ambientIntensity: 0.4
    },
    FOGGY: {
        fogNear: 10,
        fogFar: 40,
        fogColor: 0x2a2a3e,
        rainIntensity: 0,
        ambientIntensity: 0.3
    },
    LIGHT_RAIN: {
        fogNear: 20,
        fogFar: 60,
        fogColor: 0x1a1a28,
        rainIntensity: 0.3,
        ambientIntensity: 0.25
    },
    HEAVY_RAIN: {
        fogNear: 15,
        fogFar: 45,
        fogColor: 0x151520,
        rainIntensity: 1.0,
        ambientIntensity: 0.2
    },
    STORM: {
        fogNear: 8,
        fogFar: 35,
        fogColor: 0x101018,
        rainIntensity: 1.0,
        ambientIntensity: 0.15,
        lightning: true
    }
};

/**
 * Rain particle system using instanced rendering
 */
class RainSystem {
    constructor(scene, count = 5000) {
        this.scene = scene;
        this.count = count;
        this.active = false;

        // Rain geometry - simple lines
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 6); // 2 vertices per line
        const velocities = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            // Random starting positions in a box around player
            const x = (Math.random() - 0.5) * 40;
            const y = Math.random() * 20;
            const z = (Math.random() - 0.5) * 40;

            // Line start
            positions[i * 6] = x;
            positions[i * 6 + 1] = y;
            positions[i * 6 + 2] = z;

            // Line end (slightly below)
            positions[i * 6 + 3] = x;
            positions[i * 6 + 4] = y - 0.5;
            positions[i * 6 + 5] = z;

            velocities[i] = 15 + Math.random() * 10;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.positions = positions;
        this.velocities = velocities;

        const material = new THREE.LineBasicMaterial({
            color: 0x88aacc,
            transparent: true,
            opacity: 0.4
        });

        this.mesh = new THREE.LineSegments(geometry, material);
        this.mesh.visible = false;
        scene.add(this.mesh);

        this.intensity = 0;
    }

    setIntensity(intensity) {
        this.intensity = intensity;
        this.active = intensity > 0;
        this.mesh.visible = this.active;
        this.mesh.material.opacity = 0.2 + intensity * 0.4;
    }

    update(dt, playerPos) {
        if (!this.active) return;

        const positions = this.positions;

        for (let i = 0; i < this.count; i++) {
            // Move rain down
            const fall = this.velocities[i] * dt * this.intensity;
            positions[i * 6 + 1] -= fall;
            positions[i * 6 + 4] -= fall;

            // Reset if below ground
            if (positions[i * 6 + 1] < 0) {
                const x = playerPos.x + (Math.random() - 0.5) * 40;
                const z = playerPos.z + (Math.random() - 0.5) * 40;
                const y = 15 + Math.random() * 10;

                positions[i * 6] = x;
                positions[i * 6 + 1] = y;
                positions[i * 6 + 2] = z;
                positions[i * 6 + 3] = x;
                positions[i * 6 + 4] = y - 0.5;
                positions[i * 6 + 5] = z;
            }
        }

        this.mesh.geometry.attributes.position.needsUpdate = true;
    }

    dispose() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

/**
 * Lightning flash effect
 */
class LightningSystem {
    constructor(scene) {
        this.scene = scene;
        this.active = false;
        this.flashLight = null;
        this.nextFlashTime = 0;
        this.flashDuration = 0;
        this.flashIntensity = 0;
    }

    setActive(active) {
        this.active = active;
        if (!active && this.flashLight) {
            this.flashLight.intensity = 0;
        }
    }

    update(dt, playerPos) {
        if (!this.active) return;

        const now = performance.now();

        // Create flash light if needed
        if (!this.flashLight) {
            this.flashLight = new THREE.PointLight(0xccddff, 0, 100);
            this.flashLight.position.set(0, 20, 0);
            this.scene.add(this.flashLight);
            this.nextFlashTime = now + 3000 + Math.random() * 7000;
        }

        // Check for new flash
        if (now > this.nextFlashTime && this.flashIntensity === 0) {
            this.flashIntensity = 2 + Math.random() * 3;
            this.flashDuration = 100 + Math.random() * 200;
            this.flashLight.position.set(
                playerPos.x + (Math.random() - 0.5) * 30,
                20,
                playerPos.z + (Math.random() - 0.5) * 30
            );
            this.nextFlashTime = now + 5000 + Math.random() * 15000;
        }

        // Animate flash
        if (this.flashIntensity > 0) {
            this.flashDuration -= dt * 1000;
            if (this.flashDuration <= 0) {
                this.flashIntensity = 0;
            }

            // Flicker effect
            const flicker = this.flashDuration > 50 ?
                (Math.random() > 0.3 ? this.flashIntensity : 0) :
                this.flashIntensity * (this.flashDuration / 50);

            this.flashLight.intensity = flicker;
        }
    }

    dispose() {
        if (this.flashLight) {
            this.scene.remove(this.flashLight);
            this.flashLight.dispose();
        }
    }
}

/**
 * Weather System Manager
 */
export class WeatherSystem {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // Systems
        this.rain = new RainSystem(scene, 5000);
        this.lightning = new LightningSystem(scene);

        // Current weather state
        this.currentWeather = 'CLEAR';
        this.targetWeather = 'CLEAR';
        this.transitionProgress = 1;
        this.transitionSpeed = 0.5; // Weather changes over 2 seconds

        // Current values (for interpolation)
        this.currentFog = {
            near: WEATHER_PRESETS.CLEAR.fogNear,
            far: WEATHER_PRESETS.CLEAR.fogFar,
            color: new THREE.Color(WEATHER_PRESETS.CLEAR.fogColor)
        };

        // Store original scene fog
        this.originalFog = scene.fog ? scene.fog.clone() : null;

        // Player position reference
        this.playerPos = new THREE.Vector3();
    }

    /**
     * Set weather preset
     * @param {string} weatherType - CLEAR, FOGGY, LIGHT_RAIN, HEAVY_RAIN, STORM
     */
    setWeather(weatherType) {
        if (!WEATHER_PRESETS[weatherType]) {
            console.warn('Unknown weather type:', weatherType);
            return;
        }

        this.targetWeather = weatherType;
        this.transitionProgress = 0;
    }

    /**
     * Get available weather types
     */
    static getWeatherTypes() {
        return Object.keys(WEATHER_PRESETS);
    }

    /**
     * Update weather system
     * @param {number} dt - Delta time
     * @param {THREE.Vector3} playerPos - Player position
     */
    update(dt, playerPos) {
        this.playerPos.copy(playerPos);

        // Update transition
        if (this.transitionProgress < 1) {
            this.transitionProgress = Math.min(1, this.transitionProgress + this.transitionSpeed * dt);
            this._updateWeatherTransition();
        }

        // Update rain
        const targetPreset = WEATHER_PRESETS[this.targetWeather];
        this.rain.setIntensity(targetPreset.rainIntensity * this.transitionProgress);
        this.rain.update(dt, playerPos);

        // Update lightning
        this.lightning.setActive(targetPreset.lightning && this.transitionProgress > 0.5);
        this.lightning.update(dt, playerPos);
    }

    _updateWeatherTransition() {
        const startPreset = WEATHER_PRESETS[this.currentWeather];
        const endPreset = WEATHER_PRESETS[this.targetWeather];
        const t = this.transitionProgress;

        // Interpolate fog
        const fogNear = THREE.MathUtils.lerp(startPreset.fogNear, endPreset.fogNear, t);
        const fogFar = THREE.MathUtils.lerp(startPreset.fogFar, endPreset.fogFar, t);

        const startColor = new THREE.Color(startPreset.fogColor);
        const endColor = new THREE.Color(endPreset.fogColor);
        const fogColor = startColor.lerp(endColor, t);

        // Apply fog
        if (!this.scene.fog) {
            this.scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);
        } else {
            this.scene.fog.color.copy(fogColor);
            this.scene.fog.near = fogNear;
            this.scene.fog.far = fogFar;
        }

        // Update background color to match fog
        if (this.scene.background instanceof THREE.Color) {
            this.scene.background.copy(fogColor);
        }

        // Mark transition complete
        if (t >= 1) {
            this.currentWeather = this.targetWeather;
        }
    }

    /**
     * Cycle to next weather type
     */
    cycleWeather() {
        const types = Object.keys(WEATHER_PRESETS);
        const currentIndex = types.indexOf(this.currentWeather);
        const nextIndex = (currentIndex + 1) % types.length;
        this.setWeather(types[nextIndex]);
        return types[nextIndex];
    }

    /**
     * Reset to clear weather
     */
    reset() {
        this.setWeather('CLEAR');
        if (this.originalFog) {
            this.scene.fog = this.originalFog.clone();
        }
    }

    /**
     * Dispose of weather system
     */
    dispose() {
        this.rain.dispose();
        this.lightning.dispose();
        this.reset();
    }
}

export { WEATHER_PRESETS };
