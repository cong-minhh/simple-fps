// PostProcessing.js - Post-processing effects pipeline
// Bloom, vignette, and damage effects for enhanced visuals

import * as THREE from 'three';

/**
 * Custom vignette shader
 */
const VignetteShader = {
    uniforms: {
        tDiffuse: { value: null },
        darkness: { value: 0.5 },
        offset: { value: 1.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float darkness;
        uniform float offset;
        varying vec2 vUv;
        
        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
            float dist = length(uv);
            float vig = smoothstep(0.8, 0.2, dist);
            texel.rgb = mix(texel.rgb, texel.rgb * vig, darkness);
            gl_FragColor = texel;
        }
    `
};

/**
 * Custom chromatic aberration shader (for damage effects)
 */
const ChromaticAberrationShader = {
    uniforms: {
        tDiffuse: { value: null },
        amount: { value: 0.0 },
        angle: { value: 0.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float amount;
        uniform float angle;
        varying vec2 vUv;
        
        void main() {
            vec2 offset = amount * vec2(cos(angle), sin(angle));
            vec4 cr = texture2D(tDiffuse, vUv + offset);
            vec4 cg = texture2D(tDiffuse, vUv);
            vec4 cb = texture2D(tDiffuse, vUv - offset);
            gl_FragColor = vec4(cr.r, cg.g, cb.b, cg.a);
        }
    `
};

/**
 * Simple bloom shader (lightweight alternative to UnrealBloomPass)
 */
const SimpleBloomShader = {
    uniforms: {
        tDiffuse: { value: null },
        threshold: { value: 0.8 },
        intensity: { value: 0.3 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float threshold;
        uniform float intensity;
        varying vec2 vUv;
        
        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            
            // Calculate luminance
            float luminance = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
            
            // Extract bright areas
            float bloom = max(0.0, luminance - threshold);
            
            // Add bloom
            texel.rgb += texel.rgb * bloom * intensity;
            
            gl_FragColor = texel;
        }
    `
};

/**
 * Lightweight post-processing manager
 * Uses render-to-texture with custom shaders
 */
export class PostProcessing {
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.enabled = true;

        // Get render size
        const size = renderer.getSize(new THREE.Vector2());
        this.width = size.x;
        this.height = size.y;

        // Create render targets
        this.renderTarget = new THREE.WebGLRenderTarget(this.width, this.height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat
        });

        // Create fullscreen quad for post-processing
        this.quad = this._createFullscreenQuad();
        this.postScene = new THREE.Scene();
        this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.postScene.add(this.quad);

        // Effect parameters
        this.vignetteIntensity = 0.3;
        this.bloomIntensity = 0.3;
        this.bloomThreshold = 0.75;
        this.chromaticAmount = 0;
        this.chromaticDecay = 5;

        // Combined shader material
        this.postMaterial = this._createCombinedMaterial();
        this.quad.material = this.postMaterial;

        // Damage effect state
        this.damageChromatic = 0;
    }

    /**
     * Create fullscreen quad for post-processing
     */
    _createFullscreenQuad() {
        const geometry = new THREE.PlaneGeometry(2, 2);
        const material = new THREE.MeshBasicMaterial();
        return new THREE.Mesh(geometry, material);
    }

    /**
     * Create combined post-processing shader material
     */
    _createCombinedMaterial() {
        return new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                // Vignette
                vignetteDarkness: { value: this.vignetteIntensity },
                vignetteOffset: { value: 1.0 },
                // Bloom
                bloomThreshold: { value: this.bloomThreshold },
                bloomIntensity: { value: this.bloomIntensity },
                // Chromatic aberration
                chromaticAmount: { value: 0.0 },
                chromaticAngle: { value: 0.0 },
                // Resolution
                resolution: { value: new THREE.Vector2(this.width, this.height) }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float vignetteDarkness;
                uniform float vignetteOffset;
                uniform float bloomThreshold;
                uniform float bloomIntensity;
                uniform float chromaticAmount;
                uniform float chromaticAngle;
                uniform vec2 resolution;
                varying vec2 vUv;
                
                void main() {
                    // Chromatic aberration (when damaged)
                    vec4 texel;
                    if (chromaticAmount > 0.001) {
                        vec2 offset = chromaticAmount * vec2(cos(chromaticAngle), sin(chromaticAngle));
                        float cr = texture2D(tDiffuse, vUv + offset).r;
                        vec4 cg = texture2D(tDiffuse, vUv);
                        float cb = texture2D(tDiffuse, vUv - offset).b;
                        texel = vec4(cr, cg.g, cb, cg.a);
                    } else {
                        texel = texture2D(tDiffuse, vUv);
                    }
                    
                    // Simple bloom
                    float luminance = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
                    float bloom = max(0.0, luminance - bloomThreshold);
                    texel.rgb += texel.rgb * bloom * bloomIntensity;
                    
                    // Vignette
                    vec2 uv = (vUv - vec2(0.5)) * vec2(vignetteOffset);
                    float dist = length(uv);
                    float vig = smoothstep(0.8, 0.2, dist);
                    texel.rgb = mix(texel.rgb, texel.rgb * vig, vignetteDarkness);
                    
                    gl_FragColor = texel;
                }
            `
        });
    }

    /**
     * Trigger damage chromatic aberration effect
     * @param {number} intensity - Damage intensity (0-1)
     */
    triggerDamageEffect(intensity = 0.5) {
        this.damageChromatic = intensity * 0.02;
    }

    /**
     * Set vignette intensity
     * @param {number} intensity - Vignette darkness (0-1)
     */
    setVignetteIntensity(intensity) {
        this.vignetteIntensity = intensity;
        this.postMaterial.uniforms.vignetteDarkness.value = intensity;
    }

    /**
     * Set bloom parameters
     * @param {number} intensity - Bloom intensity (0-1)
     * @param {number} threshold - Luminance threshold for bloom
     */
    setBloomParams(intensity, threshold = 0.75) {
        this.bloomIntensity = intensity;
        this.bloomThreshold = threshold;
        this.postMaterial.uniforms.bloomIntensity.value = intensity;
        this.postMaterial.uniforms.bloomThreshold.value = threshold;
    }

    /**
     * Update effects (call each frame)
     * @param {number} dt - Delta time
     */
    update(dt) {
        // Decay chromatic aberration
        if (this.damageChromatic > 0.001) {
            this.damageChromatic *= Math.max(0, 1 - this.chromaticDecay * dt);
            this.postMaterial.uniforms.chromaticAmount.value = this.damageChromatic;
            this.postMaterial.uniforms.chromaticAngle.value = Math.random() * Math.PI * 2;
        } else {
            this.postMaterial.uniforms.chromaticAmount.value = 0;
        }
    }

    /**
     * Render scene with post-processing
     */
    render() {
        if (!this.enabled) {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        // Render scene to texture
        this.renderer.setRenderTarget(this.renderTarget);
        this.renderer.render(this.scene, this.camera);

        // Apply post-processing
        this.postMaterial.uniforms.tDiffuse.value = this.renderTarget.texture;
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.postScene, this.postCamera);
    }

    /**
     * Handle window resize
     * @param {number} width - New width
     * @param {number} height - New height
     */
    resize(width, height) {
        this.width = width;
        this.height = height;
        this.renderTarget.setSize(width, height);
        this.postMaterial.uniforms.resolution.value.set(width, height);
    }

    /**
     * Enable/disable post-processing
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
    }

    /**
     * Dispose of resources
     */
    dispose() {
        this.renderTarget.dispose();
        this.postMaterial.dispose();
        this.quad.geometry.dispose();
    }
}
