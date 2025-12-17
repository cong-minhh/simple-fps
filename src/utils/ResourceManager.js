// ResourceManager.js - Centralized resource management for Three.js objects
// Handles shared geometries, materials, and textures to reduce memory usage

import * as THREE from 'three';

/**
 * Resource types for the pool
 */
const RESOURCE_TYPES = {
    GEOMETRY: 'geometry',
    MATERIAL: 'material',
    TEXTURE: 'texture'
};

/**
 * Singleton resource manager for shared Three.js resources
 * Reduces GPU memory usage by reusing common geometries and materials
 */
class ResourceManagerClass {
    constructor() {
        this.geometries = new Map();
        this.materials = new Map();
        this.textures = new Map();
        this.refCounts = new Map();  // Track references for cleanup

        // Pre-create common geometries
        this._initCommonGeometries();
    }

    /**
     * Initialize commonly used geometries
     */
    _initCommonGeometries() {
        // Hit effect particles
        this.geometries.set('particle_small', new THREE.SphereGeometry(0.03, 4, 4));
        this.geometries.set('particle_medium', new THREE.SphereGeometry(0.06, 6, 6));

        // Projectiles
        this.geometries.set('projectile', new THREE.SphereGeometry(0.12, 6, 6));
        this.geometries.set('projectile_trail', new THREE.SphereGeometry(0.06, 4, 4));

        // Tracer
        this.geometries.set('tracer', this._createTracerGeometry());
    }

    _createTracerGeometry() {
        const geo = new THREE.BoxGeometry(0.02, 0.02, 1.2);
        geo.translate(0, 0, -0.6);  // Offset so back is at origin
        return geo;
    }

    /**
     * Get or create a shared geometry
     * @param {string} key - Unique identifier for this geometry
     * @param {Function} createFn - Factory function if geometry doesn't exist
     * @returns {THREE.BufferGeometry}
     */
    getGeometry(key, createFn = null) {
        if (!this.geometries.has(key)) {
            if (createFn) {
                this.geometries.set(key, createFn());
            } else {
                throw new Error(`Geometry '${key}' not found and no factory provided`);
            }
        }
        this._incrementRef(`geo_${key}`);
        return this.geometries.get(key);
    }

    /**
     * Get or create a shared material
     * @param {string} key - Unique identifier
     * @param {Function} createFn - Factory function
     * @returns {THREE.Material}
     */
    getMaterial(key, createFn = null) {
        if (!this.materials.has(key)) {
            if (createFn) {
                this.materials.set(key, createFn());
            } else {
                throw new Error(`Material '${key}' not found and no factory provided`);
            }
        }
        this._incrementRef(`mat_${key}`);
        return this.materials.get(key);
    }

    /**
     * Get or create a shared texture
     * @param {string} key - Unique identifier  
     * @param {Function} createFn - Factory function
     * @returns {THREE.Texture}
     */
    getTexture(key, createFn = null) {
        if (!this.textures.has(key)) {
            if (createFn) {
                this.textures.set(key, createFn());
            } else {
                throw new Error(`Texture '${key}' not found and no factory provided`);
            }
        }
        this._incrementRef(`tex_${key}`);
        return this.textures.get(key);
    }

    /**
     * Create a basic material with common settings
     * @param {Object} options - Material options
     * @returns {THREE.Material}
     */
    createBasicMaterial(options = {}) {
        const key = `basic_${options.color || 'default'}_${options.transparent ? 't' : 'o'}`;
        return this.getMaterial(key, () => new THREE.MeshBasicMaterial(options));
    }

    /**
     * Create a standard material with common settings
     * @param {Object} options - Material options
     * @returns {THREE.Material}
     */
    createStandardMaterial(options = {}) {
        const key = `standard_${options.color || 'default'}_${options.metalness || 0}_${options.roughness || 1}`;
        return this.getMaterial(key, () => new THREE.MeshStandardMaterial(options));
    }

    /**
     * Increment reference count for a resource
     */
    _incrementRef(key) {
        this.refCounts.set(key, (this.refCounts.get(key) || 0) + 1);
    }

    /**
     * Decrement reference count (for future cleanup)
     */
    _decrementRef(key) {
        const count = this.refCounts.get(key) || 0;
        if (count > 0) {
            this.refCounts.set(key, count - 1);
        }
    }

    /**
     * Release a geometry reference
     */
    releaseGeometry(key) {
        this._decrementRef(`geo_${key}`);
    }

    /**
     * Release a material reference
     */
    releaseMaterial(key) {
        this._decrementRef(`mat_${key}`);
    }

    /**
     * Get statistics about resource usage
     */
    getStats() {
        return {
            geometries: this.geometries.size,
            materials: this.materials.size,
            textures: this.textures.size,
            totalRefs: Array.from(this.refCounts.values()).reduce((a, b) => a + b, 0)
        };
    }

    /**
     * Dispose all resources (call on game shutdown)
     */
    dispose() {
        // Dispose geometries
        this.geometries.forEach((geo, key) => {
            geo.dispose();
        });
        this.geometries.clear();

        // Dispose materials
        this.materials.forEach((mat, key) => {
            mat.dispose();
        });
        this.materials.clear();

        // Dispose textures
        this.textures.forEach((tex, key) => {
            tex.dispose();
        });
        this.textures.clear();

        this.refCounts.clear();
    }

    /**
     * Clean up unused resources (resources with 0 references)
     */
    cleanup() {
        // Don't cleanup in current implementation to avoid breaking shared refs
        // This could be enhanced with weak references in the future
    }
}

// Export singleton instance
export const ResourceManager = new ResourceManagerClass();

// Also export class for testing
export { ResourceManagerClass };
