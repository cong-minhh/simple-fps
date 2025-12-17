// RenderConfig.js - Rendering and visual configuration
// Three.js renderer settings, pool sizes, and visual parameters

/**
 * Three.js renderer settings
 */
export const RENDERER = {
    ANTIALIAS: false,         // Disabled for performance
    PIXEL_RATIO: 1,           // Fixed for consistent performance
    POWER_PREFERENCE: 'high-performance',
    CLEAR_COLOR: 0x1a1a2e
};

/**
 * Shadow map settings
 */
export const SHADOWS = {
    ENABLED: true,
    TYPE: 'BasicShadowMap',   // Use THREE.BasicShadowMap
    MAP_SIZE: 512,
    CAMERA_NEAR: 1,
    CAMERA_FAR: 40,
    CAMERA_SIZE: 12          // Left/right/top/bottom bounds
};

/**
 * Fog settings
 */
export const FOG = {
    COLOR: 0x1a1a2e,
    NEAR: 20,
    FAR: 50
};

/**
 * Camera settings
 */
export const CAMERA = {
    FOV: 90,
    NEAR: 0.1,
    FAR: 100,
    DEFAULT_FOV: 75          // Used for ADS transitions
};

/**
 * Lighting configuration
 */
export const LIGHTING = {
    AMBIENT: {
        color: 0x606080,
        intensity: 0.6
    },
    DIRECTIONAL: {
        color: 0xffffff,
        intensity: 0.8,
        position: { x: 10, y: 20, z: 10 }
    },
    ACCENT_LIGHTS: [
        { color: 0xff4444, intensity: 0.4, distance: 25, position: { x: -8, y: 5, z: -8 } },
        { color: 0x4444ff, intensity: 0.4, distance: 25, position: { x: 8, y: 5, z: 8 } }
    ]
};

/**
 * Object pool sizes for performance
 */
export const POOL_SIZES = {
    BULLET_TRACERS: 100,
    ENEMY_PROJECTILES: 50,
    HIT_PARTICLES: 20,
    INDICATORS: 15
};

/**
 * Bullet tracer visual settings
 */
export const TRACER = {
    SPEED: 200,          // Units per second
    LENGTH: 1.2,         // Visual length
    FADE_SPEED: 80,      // How fast tracers fade after hitting
    COLORS: {
        RIFLE: 0xffdd44,      // Yellow
        PISTOL: 0x4488ff,     // Blue
        SMG: 0x44ff44,        // Green
        SHOTGUN: 0xff6600,    // Orange
        SNIPER: 0xffdd44      // Yellow
    }
};

/**
 * Enemy projectile settings
 */
export const PROJECTILE = {
    SPEED: 15,
    LIFETIME: 3,         // seconds
    SIZE: 0.12,
    TRAIL_COUNT: 3
};

/**
 * Scope overlay settings (sniper)
 */
export const SCOPE = {
    MIN_ZOOM: 2.0,
    MAX_ZOOM: 8.0,
    DEFAULT_ZOOM: 4.0,
    THRESHOLD: 0.85       // ADS transition % to activate scope
};

/**
 * Animation timing
 */
export const ANIMATIONS = {
    WEAPON_SWITCH_DURATION: 400,   // ms
    HIT_EFFECT_DURATION: 300,      // ms
    DAMAGE_FLASH_DURATION: 100,    // ms
    MUZZLE_FLASH_DURATION: 50      // ms
};
