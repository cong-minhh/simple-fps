// ServerConfig.js - Server-side configuration constants
// Used by server.js for multiplayer game settings

/**
 * Server network settings
 */
export const SERVER = {
    PORT: 8080,
    TICK_RATE: 20,           // Updates per second
    MAX_PLAYERS_PER_ROOM: 8,
    PING_INTERVAL: 2000      // ms between ping checks
};

/**
 * Multiplayer game rules
 */
export const GAME = {
    KILL_LIMIT: 20,
    TIME_LIMIT: 10 * 60 * 1000,  // 10 minutes in ms
    RESPAWN_DELAY: 3000,         // 3 seconds
    SPAWN_PROTECTION: 2000       // 2 seconds invulnerability
};

/**
 * Rate limiting configuration (messages per second)
 */
export const RATE_LIMITS = {
    position: {
        interval: 50,    // ms between messages
        maxPerSecond: 25
    },
    shoot: {
        interval: 50,
        maxPerSecond: 20
    },
    hit: {
        interval: 100,
        maxPerSecond: 15
    }
};

/**
 * Input validation bounds
 */
export const VALIDATION = {
    // Position bounds (arena is ~20x20)
    MAX_POSITION: 15,
    MIN_POSITION: -15,
    MAX_HEIGHT: 10,
    MIN_HEIGHT: 0,

    // Rotation bounds (radians)
    MAX_ROTATION: Math.PI * 2,

    // Damage bounds
    MAX_DAMAGE: 500,  // Max single hit (sniper headshot)
    MIN_DAMAGE: 0,

    // Player name
    MAX_NAME_LENGTH: 16
};

/**
 * Spawn points for multiplayer
 */
export const SPAWN_POINTS = [
    { x: -8, y: 1.7, z: -8 },
    { x: 8, y: 1.7, z: -8 },
    { x: -8, y: 1.7, z: 8 },
    { x: 8, y: 1.7, z: 8 },
    { x: 0, y: 1.7, z: 0 },
    { x: -5, y: 1.7, z: 0 },
    { x: 5, y: 1.7, z: 0 },
    { x: 0, y: 1.7, z: -5 }
];

/**
 * Player colors for multiplayer
 */
export const PLAYER_COLORS = [
    0xff4444,  // Red
    0x44ff44,  // Green
    0x4444ff,  // Blue
    0xffff44,  // Yellow
    0xff44ff,  // Magenta
    0x44ffff,  // Cyan
    0xff8844,  // Orange
    0x8844ff   // Purple
];
