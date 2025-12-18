// ParticleSystem.js - Enhanced particle effects for visual feedback
// Dust, debris, shell casings, and impact effects

import * as THREE from 'three';
import { ResourceManager } from './utils/ResourceManager.js';

/**
 * Particle types
 */
export const PARTICLE_TYPES = {
    DUST: 'dust',
    DEBRIS: 'debris',
    SPARK: 'spark',
    BLOOD: 'blood',
    SHELL_CASING: 'shell',
    SMOKE: 'smoke',
    MUZZLE_FLASH: 'muzzle'
};

/**
 * Particle pool configuration
 */
const POOL_CONFIG = {
    dust: { count: 50, size: 0.08, lifetime: 1.0, gravity: -0.5 },
    debris: { count: 30, size: 0.05, lifetime: 0.8, gravity: -9.8 },
    spark: { count: 40, size: 0.03, lifetime: 0.3, gravity: -2 },
    blood: { count: 20, size: 0.06, lifetime: 0.5, gravity: -5 },
    shell: { count: 10, size: 0.04, lifetime: 2.0, gravity: -9.8 },
    smoke: { count: 30, size: 0.15, lifetime: 1.5, gravity: 0.5 },
    muzzle: { count: 20, size: 0.1, lifetime: 0.08, gravity: 0 }
};

/**
 * Single particle data
 */
class Particle {
    constructor() {
        this.position = new THREE.Vector3();
        this.velocity = new THREE.Vector3();
        this.rotation = 0;
        this.rotationSpeed = 0;
        this.age = 0;
        this.lifetime = 1;
        this.size = 0.1;
        this.startSize = 0.1;
        this.endSize = 0;
        this.color = new THREE.Color(1, 1, 1);
        this.alpha = 1;
        this.gravity = -9.8;
        this.drag = 0.98;
        this.active = false;
        this.type = PARTICLE_TYPES.DUST;
    }

    reset() {
        this.position.set(0, 0, 0);
        this.velocity.set(0, 0, 0);
        this.rotation = 0;
        this.rotationSpeed = 0;
        this.age = 0;
        this.lifetime = 1;
        this.alpha = 1;
        this.active = false;
    }
}

/**
 * High-performance particle system using instanced points
 */
export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.enabled = true;
        this.qualityMultiplier = 1.0;

        // Particle pools per type
        this.pools = {};
        this.meshes = {};

        // Reusable vectors
        this._tempVec = new THREE.Vector3();
        this._tempColor = new THREE.Color();

        // Initialize pools
        this._initPools();
    }

    /**
     * Initialize particle pools for each type
     */
    _initPools() {
        for (const [type, config] of Object.entries(POOL_CONFIG)) {
            this.pools[type] = [];
            const count = Math.ceil(config.count * this.qualityMultiplier);

            for (let i = 0; i < count; i++) {
                this.pools[type].push(new Particle());
            }

            // Create geometry and material for this type
            this._createParticleMesh(type, config, count);
        }
    }

    /**
     * Create instanced mesh for particle type
     */
    _createParticleMesh(type, config, count) {
        // Use points for better performance
        const geometry = new THREE.BufferGeometry();

        // Positions
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const alphas = new Float32Array(count);

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

        // Custom shader material for particles
        const material = new THREE.ShaderMaterial({
            uniforms: {
                pointTexture: { value: this._createParticleTexture(type) }
            },
            vertexShader: `
                attribute float size;
                attribute float alpha;
                attribute vec3 color;
                varying float vAlpha;
                varying vec3 vColor;
                
                void main() {
                    vAlpha = alpha;
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform sampler2D pointTexture;
                varying float vAlpha;
                varying vec3 vColor;
                
                void main() {
                    vec4 texColor = texture2D(pointTexture, gl_PointCoord);
                    if (texColor.a < 0.1) discard;
                    gl_FragColor = vec4(vColor, texColor.a * vAlpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        const points = new THREE.Points(geometry, material);
        points.frustumCulled = false;
        this.scene.add(points);
        this.meshes[type] = points;
    }

    /**
     * Create procedural particle texture
     */
    _createParticleTexture(type) {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);

        switch (type) {
            case 'spark':
            case 'muzzle':
                gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
                gradient.addColorStop(0.3, 'rgba(255, 200, 100, 0.8)');
                gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');
                break;
            case 'blood':
                gradient.addColorStop(0, 'rgba(180, 0, 0, 1)');
                gradient.addColorStop(0.5, 'rgba(120, 0, 0, 0.6)');
                gradient.addColorStop(1, 'rgba(80, 0, 0, 0)');
                break;
            case 'smoke':
                gradient.addColorStop(0, 'rgba(100, 100, 100, 0.6)');
                gradient.addColorStop(0.5, 'rgba(60, 60, 60, 0.3)');
                gradient.addColorStop(1, 'rgba(40, 40, 40, 0)');
                break;
            default:
                gradient.addColorStop(0, 'rgba(200, 180, 150, 0.8)');
                gradient.addColorStop(0.5, 'rgba(150, 130, 100, 0.4)');
                gradient.addColorStop(1, 'rgba(100, 80, 60, 0)');
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 32, 32);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * Get inactive particle from pool
     */
    _getParticle(type) {
        const pool = this.pools[type];
        if (!pool) return null;

        for (let i = 0; i < pool.length; i++) {
            if (!pool[i].active) {
                return pool[i];
            }
        }
        return null;
    }

    /**
     * Spawn dust particles (for movement, landing)
     */
    spawnDust(position, intensity = 0.5) {
        if (!this.enabled) return;

        const count = Math.ceil(5 * intensity * this.qualityMultiplier);
        const config = POOL_CONFIG.dust;

        for (let i = 0; i < count; i++) {
            const particle = this._getParticle('dust');
            if (!particle) break;

            particle.active = true;
            particle.type = 'dust';
            particle.position.copy(position);
            particle.position.y += 0.1;
            particle.position.x += (Math.random() - 0.5) * 0.3;
            particle.position.z += (Math.random() - 0.5) * 0.3;

            particle.velocity.set(
                (Math.random() - 0.5) * 2,
                Math.random() * 1 + 0.5,
                (Math.random() - 0.5) * 2
            );

            particle.lifetime = config.lifetime * (0.8 + Math.random() * 0.4);
            particle.age = 0;
            particle.size = config.size * (0.8 + Math.random() * 0.4);
            particle.startSize = particle.size;
            particle.endSize = particle.size * 1.5;
            particle.gravity = config.gravity;
            particle.drag = 0.95;
            particle.color.setRGB(0.8, 0.7, 0.6);
            particle.alpha = 0.6;
        }
    }

    /**
     * Spawn debris particles (for wall hits)
     */
    spawnDebris(position, normal, material = 'concrete') {
        if (!this.enabled) return;

        const count = Math.ceil(8 * this.qualityMultiplier);
        const config = POOL_CONFIG.debris;

        for (let i = 0; i < count; i++) {
            const particle = this._getParticle('debris');
            if (!particle) break;

            particle.active = true;
            particle.type = 'debris';
            particle.position.copy(position);

            // Spray in direction of normal with spread
            particle.velocity.copy(normal).multiplyScalar(3 + Math.random() * 2);
            particle.velocity.x += (Math.random() - 0.5) * 3;
            particle.velocity.y += Math.random() * 2;
            particle.velocity.z += (Math.random() - 0.5) * 3;

            particle.lifetime = config.lifetime * (0.6 + Math.random() * 0.4);
            particle.age = 0;
            particle.size = config.size * (0.5 + Math.random() * 1);
            particle.startSize = particle.size;
            particle.endSize = 0;
            particle.gravity = config.gravity;
            particle.drag = 0.98;
            particle.rotationSpeed = (Math.random() - 0.5) * 10;

            // Color based on material
            if (material === 'metal') {
                particle.color.setRGB(0.6, 0.6, 0.7);
            } else {
                particle.color.setRGB(0.6, 0.55, 0.5);
            }
            particle.alpha = 1;
        }
    }

    /**
     * Spawn spark particles (for metal hits)
     */
    spawnSparks(position, count = 5) {
        if (!this.enabled) return;

        const config = POOL_CONFIG.spark;
        count = Math.ceil(count * this.qualityMultiplier);

        for (let i = 0; i < count; i++) {
            const particle = this._getParticle('spark');
            if (!particle) break;

            particle.active = true;
            particle.type = 'spark';
            particle.position.copy(position);

            const angle = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 5;
            particle.velocity.set(
                Math.cos(angle) * speed,
                1 + Math.random() * 3,
                Math.sin(angle) * speed
            );

            particle.lifetime = config.lifetime * (0.5 + Math.random() * 0.5);
            particle.age = 0;
            particle.size = config.size * (0.5 + Math.random() * 0.5);
            particle.startSize = particle.size;
            particle.endSize = 0;
            particle.gravity = config.gravity;
            particle.drag = 0.99;
            particle.color.setRGB(1, 0.8 + Math.random() * 0.2, 0.3);
            particle.alpha = 1;
        }
    }

    /**
     * Spawn blood particles (for enemy hits)
     */
    spawnBlood(position, direction, isHeadshot = false) {
        if (!this.enabled) return;

        const count = Math.ceil((isHeadshot ? 12 : 6) * this.qualityMultiplier);
        const config = POOL_CONFIG.blood;

        for (let i = 0; i < count; i++) {
            const particle = this._getParticle('blood');
            if (!particle) break;

            particle.active = true;
            particle.type = 'blood';
            particle.position.copy(position);

            // Spray away from hit direction
            particle.velocity.copy(direction).multiplyScalar(-(2 + Math.random() * 3));
            particle.velocity.x += (Math.random() - 0.5) * 2;
            particle.velocity.y += Math.random() * 2;
            particle.velocity.z += (Math.random() - 0.5) * 2;

            particle.lifetime = config.lifetime * (0.6 + Math.random() * 0.4);
            particle.age = 0;
            particle.size = config.size * (isHeadshot ? 1.5 : 1) * (0.6 + Math.random() * 0.8);
            particle.startSize = particle.size;
            particle.endSize = 0;
            particle.gravity = config.gravity;
            particle.drag = 0.96;
            particle.color.setRGB(0.6 + Math.random() * 0.2, 0, 0);
            particle.alpha = 0.9;
        }
    }

    /**
     * Spawn muzzle flash particles
     */
    spawnMuzzleFlash(position, direction) {
        if (!this.enabled) return;

        const count = Math.ceil(5 * this.qualityMultiplier);
        const config = POOL_CONFIG.muzzle;

        for (let i = 0; i < count; i++) {
            const particle = this._getParticle('muzzle');
            if (!particle) break;

            particle.active = true;
            particle.type = 'muzzle';
            particle.position.copy(position);

            particle.velocity.copy(direction).multiplyScalar(5 + Math.random() * 3);
            particle.velocity.x += (Math.random() - 0.5) * 1;
            particle.velocity.y += (Math.random() - 0.5) * 1;
            particle.velocity.z += (Math.random() - 0.5) * 1;

            particle.lifetime = config.lifetime * (0.8 + Math.random() * 0.4);
            particle.age = 0;
            particle.size = config.size * (0.8 + Math.random() * 0.4);
            particle.startSize = particle.size * 1.5;
            particle.endSize = 0;
            particle.gravity = 0;
            particle.drag = 0.9;
            particle.color.setRGB(1, 0.9, 0.7);
            particle.alpha = 1;
        }
    }

    /**
     * Update all particles
     */
    update(deltaTime) {
        if (!this.enabled) return;

        for (const [type, pool] of Object.entries(this.pools)) {
            const mesh = this.meshes[type];
            if (!mesh) continue;

            const positions = mesh.geometry.attributes.position.array;
            const colors = mesh.geometry.attributes.color.array;
            const sizes = mesh.geometry.attributes.size.array;
            const alphas = mesh.geometry.attributes.alpha.array;
            const config = POOL_CONFIG[type];

            for (let i = 0; i < pool.length; i++) {
                const particle = pool[i];

                if (!particle.active) {
                    // Hide inactive particles
                    sizes[i] = 0;
                    alphas[i] = 0;
                    continue;
                }

                // Update age
                particle.age += deltaTime;

                if (particle.age >= particle.lifetime) {
                    particle.reset();
                    sizes[i] = 0;
                    alphas[i] = 0;
                    continue;
                }

                // Physics update
                particle.velocity.y += particle.gravity * deltaTime;
                particle.velocity.multiplyScalar(particle.drag);
                particle.position.add(
                    this._tempVec.copy(particle.velocity).multiplyScalar(deltaTime)
                );

                // Calculate life ratio
                const lifeRatio = particle.age / particle.lifetime;

                // Update size
                const currentSize = particle.startSize + (particle.endSize - particle.startSize) * lifeRatio;

                // Update alpha (fade out)
                const currentAlpha = particle.alpha * (1 - lifeRatio);

                // Update buffer attributes
                positions[i * 3] = particle.position.x;
                positions[i * 3 + 1] = particle.position.y;
                positions[i * 3 + 2] = particle.position.z;
                colors[i * 3] = particle.color.r;
                colors[i * 3 + 1] = particle.color.g;
                colors[i * 3 + 2] = particle.color.b;
                sizes[i] = currentSize * 50; // Scale for visibility
                alphas[i] = currentAlpha;
            }

            // Mark attributes for update
            mesh.geometry.attributes.position.needsUpdate = true;
            mesh.geometry.attributes.color.needsUpdate = true;
            mesh.geometry.attributes.size.needsUpdate = true;
            mesh.geometry.attributes.alpha.needsUpdate = true;
        }
    }

    /**
     * Set quality multiplier (0.1 to 1.0)
     */
    setQuality(multiplier) {
        this.qualityMultiplier = Math.max(0.1, Math.min(1.0, multiplier));
    }

    /**
     * Enable/disable particle system
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        for (const mesh of Object.values(this.meshes)) {
            mesh.visible = enabled;
        }
    }

    /**
     * Reset all particles
     */
    reset() {
        for (const pool of Object.values(this.pools)) {
            for (const particle of pool) {
                particle.reset();
            }
        }
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        for (const mesh of Object.values(this.meshes)) {
            mesh.geometry.dispose();
            mesh.material.dispose();
            this.scene.remove(mesh);
        }
        this.pools = {};
        this.meshes = {};
    }
}
