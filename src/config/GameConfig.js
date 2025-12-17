// GameConfig.js - Centralized game configuration constants
// This file consolidates all magic numbers and tunable values for easy adjustment

/**
 * Player movement and physics constants
 */
export const PLAYER = {
    // Movement speeds (units per second)
    WALK_SPEED: 4,
    SPRINT_SPEED: 6,
    CROUCH_SPEED: 2,

    // Physics
    JUMP_FORCE: 8,
    GRAVITY: 20,
    AIR_CONTROL: 0.3,  // How much control in air (0-1)

    // Dimensions
    STAND_HEIGHT: 1.6,
    CROUCH_HEIGHT: 1.0,
    RADIUS: 0.4,

    // Stats
    MAX_HEALTH: 100,

    // Mouse sensitivity (radians per pixel)
    DEFAULT_SENSITIVITY: 0.002,
    MIN_SENSITIVITY: 0.001,
    MAX_SENSITIVITY: 0.01,

    // Peek/Lean (Delta Force style)
    PEEK_ANGLE: 10 * Math.PI / 180,  // 10 degrees tilt
    PEEK_OFFSET: 0.7,                 // Horizontal offset
    PEEK_DROP_HEIGHT: 0.15,           // Vertical drop when leaning
    PEEK_SPEED: 8                     // Transition speed
};

/**
 * Weapon definitions with stats and recoil patterns
 */
export const WEAPONS = {
    PISTOL: {
        name: 'Pistol',
        fireRate: 5,
        damage: 25,
        headMultiplier: 2.5,
        magazineSize: 12,
        reloadTime: 1500,
        recoilAmount: 0.025,
        recoilRecovery: 8,
        spread: 0.01,
        adsSpread: 0.002,
        adsZoom: 1.2,
        adsOffsetY: -0.12,
        automatic: false,
        model: { bodySize: [0.08, 0.15, 0.3], barrelSize: [0.05, 0.05, 0.15], color: 0x2a2a2a },
        recoilPattern: [
            [0.015, 0], [0.018, 0.002], [0.02, -0.003], [0.022, 0.001],
            [0.025, -0.002], [0.025, 0.003], [0.028, 0], [0.028, -0.002],
            [0.03, 0.002], [0.03, -0.001], [0.032, 0], [0.032, 0.002]
        ]
    },
    RIFLE: {
        name: 'Rifle',
        fireRate: 10,
        damage: 30,
        headMultiplier: 3,
        magazineSize: 30,
        reloadTime: 2500,
        recoilAmount: 0.04,
        recoilRecovery: 6,
        spread: 0.02,
        adsSpread: 0.005,
        adsZoom: 1.5,
        adsOffsetY: -0.105,
        automatic: true,
        model: { bodySize: [0.06, 0.12, 0.5], barrelSize: [0.04, 0.04, 0.3], color: 0x1a1a1a },
        recoilPattern: [
            [0.025, 0], [0.03, 0], [0.035, 0], [0.04, 0], [0.045, 0],
            [0.045, -0.015], [0.04, -0.02], [0.035, -0.025], [0.03, -0.02],
            [0.025, -0.01], [0.02, 0], [0.02, 0.01], [0.025, 0.02],
            [0.03, 0.025], [0.035, 0.03], [0.04, 0.025], [0.035, 0.02],
            [0.03, 0.01], [0.025, 0], [0.02, -0.01], [0.025, -0.015],
            [0.03, -0.02], [0.03, -0.01], [0.025, 0.01], [0.03, 0.02],
            [0.035, 0.01], [0.03, -0.01], [0.025, 0], [0.02, 0.01], [0.02, -0.01]
        ]
    },
    SMG: {
        name: 'SMG',
        fireRate: 15,
        damage: 18,
        headMultiplier: 2,
        magazineSize: 25,
        reloadTime: 2000,
        recoilAmount: 0.03,
        recoilRecovery: 10,
        spread: 0.03,
        adsSpread: 0.015,
        adsZoom: 1.3,
        adsOffsetY: -0.095,
        automatic: true,
        model: { bodySize: [0.07, 0.1, 0.35], barrelSize: [0.035, 0.035, 0.12], color: 0x3a3a3a },
        recoilPattern: [
            [0.015, 0], [0.02, 0.005], [0.022, -0.005], [0.025, 0.008],
            [0.025, -0.01], [0.028, 0.012], [0.028, -0.008], [0.03, 0.005],
            [0.028, -0.012], [0.025, 0.01], [0.025, -0.005], [0.028, 0.008],
            [0.03, -0.01], [0.028, 0.012], [0.025, -0.008], [0.025, 0.005],
            [0.028, -0.01], [0.03, 0.01], [0.028, -0.005], [0.025, 0.008],
            [0.025, -0.008], [0.028, 0.005], [0.03, -0.01], [0.028, 0.012], [0.025, 0]
        ]
    },
    SHOTGUN: {
        name: 'Shotgun',
        fireRate: 1.5,
        damage: 15,  // Per pellet
        pellets: 8,
        headMultiplier: 2,
        magazineSize: 6,
        reloadTime: 3000,
        recoilAmount: 0.12,
        recoilRecovery: 4,
        spread: 0.08,
        adsSpread: 0.05,
        adsZoom: 1.1,
        adsOffsetY: -0.105,
        automatic: false,
        model: { bodySize: [0.08, 0.12, 0.55], barrelSize: [0.06, 0.06, 0.25], color: 0x4a3020 },
        recoilPattern: [
            [0.08, 0.01], [0.09, -0.02], [0.1, 0.015], [0.09, -0.01], [0.08, 0.01], [0.07, 0]
        ]
    },
    SNIPER: {
        name: 'Sniper',
        fireRate: 0.8,
        damage: 100,
        headMultiplier: 4.0,
        magazineSize: 5,
        reloadTime: 3500,
        recoilAmount: 0.15,
        recoilRecovery: 3,
        spread: 0.04,
        adsSpread: 0,
        adsZoom: 4.0,
        adsOffsetY: -0.11,
        adsSpeed: 8,
        automatic: false,
        hasScope: true,
        model: { bodySize: [0.05, 0.1, 0.7], barrelSize: [0.03, 0.03, 0.5], color: 0x2a2a2a },
        recoilPattern: [
            [0.12, 0], [0.1, 0.01], [0.08, -0.01], [0.06, 0], [0.05, 0]
        ]
    }
};

/**
 * Body part damage multipliers
 */
export const BODY_PART_MULTIPLIERS = {
    head: 3.0,
    torso: 1.0,
    arm: 0.7,
    leg: 0.6
};

/**
 * Enemy AI states
 */
export const ENEMY_STATES = {
    PATROL: 'PATROL',
    CHASE: 'CHASE',
    ATTACK: 'ATTACK',
    ATTACK_RANGED: 'ATTACK_RANGED',
    STRAFE: 'STRAFE',
    RETREAT: 'RETREAT',
    FLANK: 'FLANK',
    LEAP: 'LEAP',
    IDLE: 'IDLE'
};

/**
 * Enemy type configurations
 */
export const ENEMY_TYPES = {
    NORMAL: {
        name: 'Normal',
        health: [40, 60],
        speed: 2.5,
        damage: 10,
        attackCooldown: 0.8,
        attackRange: 2,
        bodyColor: 0xff4444,
        headColor: 0xffaaaa,
        scale: 1.0
    },
    RUNNER: {
        name: 'Runner',
        health: [20, 30],
        speed: 4.5,
        damage: 8,
        attackCooldown: 0.5,
        attackRange: 1.5,
        bodyColor: 0x44ff44,
        headColor: 0xaaffaa,
        scale: 0.8
    },
    TANK: {
        name: 'Tank',
        health: [100, 140],
        speed: 1.5,
        damage: 20,
        attackCooldown: 1.5,
        attackRange: 2.5,
        bodyColor: 0x4444ff,
        headColor: 0xaaaaff,
        scale: 1.3
    },
    BERSERKER: {
        name: 'Berserker',
        health: [50, 70],
        speed: 3.5,
        damage: 15,
        attackCooldown: 0.4,
        attackRange: 2,
        bodyColor: 0xff44ff,
        headColor: 0xffaaff,
        scale: 1.1,
        canLeap: true,
        leapDamage: 25,
        leapCooldown: 4
    },
    SNIPER: {
        name: 'Sniper',
        health: [35, 50],
        speed: 1.8,
        damage: 20,
        attackCooldown: 2.5,
        attackRange: 15,
        preferredRange: 10,
        bodyColor: 0x888888,
        headColor: 0xcccccc,
        scale: 0.95,
        isRanged: true,
        projectileSpeed: 25,
        aimTime: 1.5
    }
};

/**
 * Wave configurations for solo mode
 */
export const WAVES = [
    // Wave 1: Easy start
    { enemies: ['NORMAL', 'NORMAL', 'NORMAL'], spawnDelay: 500 },
    // Wave 2: Introduce runners
    { enemies: ['NORMAL', 'NORMAL', 'RUNNER', 'RUNNER'], spawnDelay: 400 },
    // Wave 3: Mix
    { enemies: ['NORMAL', 'RUNNER', 'RUNNER', 'NORMAL', 'RUNNER'], spawnDelay: 350 },
    // Wave 4: Tank introduction
    { enemies: ['TANK', 'NORMAL', 'RUNNER', 'RUNNER'], spawnDelay: 400 },
    // Wave 5: Berserker introduction
    { enemies: ['BERSERKER', 'RUNNER', 'RUNNER', 'NORMAL'], spawnDelay: 350 },
    // Wave 6: Sniper introduction
    { enemies: ['SNIPER', 'NORMAL', 'NORMAL', 'RUNNER'], spawnDelay: 350 },
    // Wave 7: Mixed horde
    { enemies: ['NORMAL', 'RUNNER', 'TANK', 'BERSERKER', 'RUNNER'], spawnDelay: 300 },
    // Wave 8: Sniper squad
    { enemies: ['SNIPER', 'SNIPER', 'NORMAL', 'RUNNER', 'BERSERKER'], spawnDelay: 300 },
    // Wave 9: Heavy
    { enemies: ['SNIPER', 'SNIPER', 'TANK', 'BERSERKER', 'RUNNER', 'RUNNER'], spawnDelay: 200 },
    // Wave 10: Boss wave
    { enemies: ['TANK', 'TANK', 'SNIPER', 'SNIPER', 'BERSERKER', 'BERSERKER', 'RUNNER'], spawnDelay: 150 },
];

/**
 * Wave manager settings
 */
export const WAVE_CONFIG = {
    MAX_ENEMIES: 12,
    BASE_SPAWN_INTERVAL: 3000,   // ms
    MIN_SPAWN_INTERVAL: 1000,    // ms
    SPAWN_DELAY_BETWEEN: 500     // ms between individual spawns
};
