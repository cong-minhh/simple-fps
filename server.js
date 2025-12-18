// server.js - WebSocket multiplayer server for FPS game
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';

const PORT = process.env.PORT || 8080;
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS) || 100;

// Game configuration
const CONFIG = {
    KILL_LIMIT: 20,
    TIME_LIMIT: 10 * 60 * 1000, // 10 minutes
    RESPAWN_DELAY: 3000, // 3 seconds
    TICK_RATE: 20, // Updates per second
    MAX_PLAYERS_PER_ROOM: 8,
    PLAYER_TIMEOUT: 30000, // 30 seconds without update = disconnect
    TIMEOUT_CHECK_INTERVAL: 10000 // Check every 10 seconds
};

// Rate limiting configuration (per player)
const RATE_LIMITS = {
    position: { interval: 40, maxPerSecond: 30 },  // ~25/sec allowed
    shoot: { interval: 50, maxPerSecond: 20 },
    hit: { interval: 80, maxPerSecond: 15 },
    weapon_change: { interval: 200, maxPerSecond: 10 }
};

// Input validation bounds
const BOUNDS = {
    MAX_POSITION: 15,
    MIN_POSITION: -15,
    MAX_HEIGHT: 10,
    MIN_HEIGHT: 0,
    MAX_DAMAGE: 500,
    MAX_NAME_LENGTH: 16
};

// Validation utilities
function isValidNumber(val) {
    return typeof val === 'number' && isFinite(val) && !isNaN(val);
}

function isValidPosition(pos) {
    if (!pos || typeof pos !== 'object') return false;
    if (!isValidNumber(pos.x) || !isValidNumber(pos.y) || !isValidNumber(pos.z)) return false;
    if (Math.abs(pos.x) > BOUNDS.MAX_POSITION) return false;
    if (Math.abs(pos.z) > BOUNDS.MAX_POSITION) return false;
    if (pos.y < BOUNDS.MIN_HEIGHT || pos.y > BOUNDS.MAX_HEIGHT) return false;
    return true;
}

function isValidRotation(rot) {
    if (!rot || typeof rot !== 'object') return false;
    if (!isValidNumber(rot.x) || !isValidNumber(rot.y)) return false;
    return true;
}

function sanitizeName(name) {
    if (!name || typeof name !== 'string') return null;
    // Remove non-printable characters, limit length
    return name.replace(/[^\x20-\x7E]/g, '').trim().slice(0, BOUNDS.MAX_NAME_LENGTH);
}

// Player class
class Player {
    constructor(id, ws, name) {
        this.id = id;
        this.ws = ws;
        this.name = sanitizeName(name) || `Player${id.slice(0, 4)}`;
        this.position = { x: 0, y: 1.7, z: 0 };
        this.rotation = { x: 0, y: 0 };
        this.health = 100;
        this.kills = 0;
        this.deaths = 0;
        this.weapon = 'RIFLE';
        this.isAlive = true;
        this.respawnTime = 0;
        this.color = this.generateColor();
        this.lastUpdate = Date.now();

        // Rate limiting state
        this.rateLimits = {};
        for (const type of Object.keys(RATE_LIMITS)) {
            this.rateLimits[type] = { lastTime: 0, count: 0, lastSecond: 0 };
        }

        // Position history for lag compensation (last 500ms)
        this.positionHistory = [];
        this.maxHistoryAge = 500; // ms
    }

    /**
     * Record current position to history
     */
    recordPosition() {
        const now = Date.now();
        this.positionHistory.push({
            time: now,
            position: { ...this.position },
            rotation: { ...this.rotation }
        });

        // Prune old entries
        while (this.positionHistory.length > 0 &&
            now - this.positionHistory[0].time > this.maxHistoryAge) {
            this.positionHistory.shift();
        }
    }

    /**
     * Get position at a specific time (for lag compensation)
     * @param {number} targetTime - Timestamp to look up
     * @returns {Object} Position at that time
     */
    getPositionAtTime(targetTime) {
        if (this.positionHistory.length === 0) {
            return this.position;
        }

        // Find the two entries that bracket the target time
        for (let i = this.positionHistory.length - 1; i >= 0; i--) {
            if (this.positionHistory[i].time <= targetTime) {
                return this.positionHistory[i].position;
            }
        }

        // Target time is before all history, return oldest
        return this.positionHistory[0].position;
    }

    // Check rate limit for message type, returns true if allowed
    checkRateLimit(type) {
        const limit = RATE_LIMITS[type];
        if (!limit) return true; // No limit for this type

        const now = Date.now();
        const state = this.rateLimits[type];

        // Reset counter each second
        const currentSecond = Math.floor(now / 1000);
        if (currentSecond !== state.lastSecond) {
            state.count = 0;
            state.lastSecond = currentSecond;
        }

        // Check interval
        if (now - state.lastTime < limit.interval) {
            return false;
        }

        // Check per-second limit
        if (state.count >= limit.maxPerSecond) {
            return false;
        }

        state.lastTime = now;
        state.count++;
        return true;
    }

    generateColor() {
        const colors = [
            0xff4444, 0x44ff44, 0x4444ff, 0xffff44,
            0xff44ff, 0x44ffff, 0xff8844, 0x8844ff
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            position: this.position,
            rotation: this.rotation,
            health: this.health,
            kills: this.kills,
            deaths: this.deaths,
            weapon: this.weapon,
            isAlive: this.isAlive,
            color: this.color
        };
    }
}

// Room class
class Room {
    constructor(id) {
        this.id = id;
        this.players = new Map();
        this.gameStarted = false;
        this.gameStartTime = 0;
        this.killFeed = [];
        this.lastTick = Date.now();
    }

    addPlayer(player) {
        this.players.set(player.id, player);

        // Auto-start when 2+ players
        if (this.players.size >= 2 && !this.gameStarted) {
            this.startGame();
        }
    }

    removePlayer(playerId) {
        this.players.delete(playerId);

        // End game if less than 2 players
        if (this.players.size < 2 && this.gameStarted) {
            this.endGame('Not enough players');
        }
    }

    startGame() {
        this.gameStarted = true;
        this.gameStartTime = Date.now();
        this.killFeed = [];

        // Reset all players
        this.players.forEach(player => {
            player.kills = 0;
            player.deaths = 0;
            player.health = 100;
            player.isAlive = true;
        });

        this.broadcast({
            type: 'game_start',
            config: CONFIG,
            players: this.getPlayersArray()
        });

        console.log(`Room ${this.id}: Game started with ${this.players.size} players`);
    }

    endGame(reason = 'Game Over') {
        this.gameStarted = false;

        // Find winner
        let winner = null;
        let maxKills = -1;
        this.players.forEach(player => {
            if (player.kills > maxKills) {
                maxKills = player.kills;
                winner = player;
            }
        });

        this.broadcast({
            type: 'game_end',
            reason,
            winner: winner ? winner.toJSON() : null,
            players: this.getPlayersArray()
        });

        console.log(`Room ${this.id}: Game ended - ${reason}`);
    }

    handleKill(killerId, victimId, isHeadshot) {
        const killer = this.players.get(killerId);
        const victim = this.players.get(victimId);

        if (!killer || !victim) return;

        killer.kills++;
        victim.deaths++;
        victim.health = 0;
        victim.isAlive = false;
        victim.respawnTime = Date.now() + CONFIG.RESPAWN_DELAY;

        // Add to kill feed
        const killInfo = {
            killer: killer.name,
            victim: victim.name,
            isHeadshot,
            timestamp: Date.now()
        };
        this.killFeed.push(killInfo);
        if (this.killFeed.length > 10) this.killFeed.shift();

        // Broadcast kill
        this.broadcast({
            type: 'player_killed',
            killerId,
            victimId,
            killerName: killer.name,
            victimName: victim.name,
            isHeadshot,
            scores: this.getScores()
        });

        // Check win condition
        if (killer.kills >= CONFIG.KILL_LIMIT) {
            this.endGame(`${killer.name} wins!`);
        }
    }

    handleRespawn(playerId) {
        const player = this.players.get(playerId);
        if (!player) return;

        player.isAlive = true;
        player.health = 100;
        player.spawnProtectionUntil = Date.now() + 2000; // 2 seconds of invulnerability

        // Random spawn position
        const spawnPoints = [
            { x: -8, y: 1.7, z: -8 },
            { x: 8, y: 1.7, z: -8 },
            { x: -8, y: 1.7, z: 8 },
            { x: 8, y: 1.7, z: 8 },
            { x: 0, y: 1.7, z: 0 },
            { x: -5, y: 1.7, z: 0 },
            { x: 5, y: 1.7, z: 0 },
            { x: 0, y: 1.7, z: -5 }
        ];
        const spawn = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
        player.position = { ...spawn };

        console.log(`Player ${player.name} respawning at:`, spawn);

        this.broadcast({
            type: 'player_respawn',
            playerId,
            position: player.position,
            health: player.health,
            spawnProtection: 2000 // Tell client about protection duration
        });
    }

    update() {
        const now = Date.now();

        // Check respawns
        this.players.forEach(player => {
            if (!player.isAlive && player.respawnTime > 0 && now >= player.respawnTime) {
                player.respawnTime = 0;
                this.handleRespawn(player.id);
            }
        });

        // Check time limit
        if (this.gameStarted && (now - this.gameStartTime) >= CONFIG.TIME_LIMIT) {
            this.endGame('Time limit reached');
        }
    }

    broadcast(message, excludeId = null) {
        const data = JSON.stringify(message);
        this.players.forEach((player, id) => {
            if (id !== excludeId && player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(data);
            }
        });
    }

    getPlayersArray() {
        return Array.from(this.players.values()).map(p => p.toJSON());
    }

    getScores() {
        return Array.from(this.players.values()).map(p => ({
            id: p.id,
            name: p.name,
            kills: p.kills,
            deaths: p.deaths,
            color: p.color
        })).sort((a, b) => b.kills - a.kills);
    }
}

// Server class
class GameServer {
    constructor() {
        this.rooms = new Map();
        this.playerToRoom = new Map();
        this.defaultRoom = this.createRoom('default');
        this.isShuttingDown = false;

        // Create HTTP server with health check endpoint
        this.httpServer = createServer((req, res) => {
            // Health check endpoint
            if (req.url === '/health') {
                const status = {
                    status: 'ok',
                    uptime: process.uptime(),
                    rooms: this.rooms.size,
                    players: Array.from(this.rooms.values())
                        .reduce((sum, room) => sum + room.players.size, 0),
                    connections: this.wss ? this.wss.clients.size : 0
                };
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(status));
                return;
            }

            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('FPS Multiplayer Server Running');
        });

        // Create WebSocket server
        this.wss = new WebSocketServer({ server: this.httpServer });

        this.setupWebSocket();
        this.startGameLoop();
        this.setupGracefulShutdown();
    }

    createRoom(id) {
        const room = new Room(id);
        this.rooms.set(id, room);
        return room;
    }

    generatePlayerId() {
        return 'p_' + Math.random().toString(36).substr(2, 9);
    }

    setupWebSocket() {
        this.wss.on('connection', (ws) => {
            // Connection limit check
            if (this.wss.clients.size > MAX_CONNECTIONS) {
                ws.close(1013, 'Server at capacity');
                console.log('Connection rejected: server at capacity');
                return;
            }

            // Reject new connections during shutdown
            if (this.isShuttingDown) {
                ws.close(1001, 'Server shutting down');
                return;
            }

            const playerId = this.generatePlayerId();
            console.log(`Player ${playerId} connected`);

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(playerId, ws, message);
                } catch (e) {
                    console.error('Invalid message:', e);
                }
            });

            ws.on('close', () => {
                this.handleDisconnect(playerId);
            });

            ws.on('error', (error) => {
                console.error(`Player ${playerId} error:`, error);
            });
        });
    }

    handleMessage(playerId, ws, message) {
        switch (message.type) {
            case 'join':
                this.handleJoin(playerId, ws, message);
                break;
            case 'position':
                this.handlePosition(playerId, message);
                break;
            case 'shoot':
                this.handleShoot(playerId, message);
                break;
            case 'hit':
                this.handleHit(playerId, message);
                break;
            case 'weapon_change':
                this.handleWeaponChange(playerId, message);
                break;
            case 'ping':
                ws.send(JSON.stringify({ type: 'pong', timestamp: message.timestamp }));
                break;
        }
    }

    handleJoin(playerId, ws, message) {
        const player = new Player(playerId, ws, message.name);
        const room = this.defaultRoom;

        room.addPlayer(player);
        this.playerToRoom.set(playerId, room);

        // Send join confirmation
        ws.send(JSON.stringify({
            type: 'joined',
            playerId,
            players: room.getPlayersArray(),
            gameStarted: room.gameStarted,
            config: CONFIG
        }));

        // Notify others
        room.broadcast({
            type: 'player_joined',
            player: player.toJSON()
        }, playerId);

        console.log(`Player ${player.name} (${playerId}) joined room ${room.id}`);
    }

    handlePosition(playerId, message) {
        const room = this.playerToRoom.get(playerId);
        if (!room) return;

        const player = room.players.get(playerId);
        if (!player || !player.isAlive) return;

        // Rate limiting
        if (!player.checkRateLimit('position')) return;

        // Validate position
        if (!isValidPosition(message.position)) return;
        if (!isValidRotation(message.rotation)) return;

        player.position = message.position;
        player.rotation = message.rotation;
        player.state = message.state || {}; // Store player state
        player.lastUpdate = Date.now();

        // Record position for lag compensation
        player.recordPosition();

        // Broadcast to others including state
        room.broadcast({
            type: 'player_position',
            playerId,
            position: player.position,
            rotation: player.rotation,
            state: player.state
        }, playerId);
    }

    handleShoot(playerId, message) {
        const room = this.playerToRoom.get(playerId);
        if (!room) return;

        const player = room.players.get(playerId);
        if (!player || !player.isAlive) return;

        // Rate limiting
        if (!player.checkRateLimit('shoot')) return;

        // Broadcast shoot to others with bullet trajectory data
        room.broadcast({
            type: 'player_shoot',
            playerId,
            weapon: message.weapon,
            position: player.position,
            origin: message.origin,  // Bullet start position (muzzle)
            target: message.target   // Bullet end position (hit point or max range)
        }, playerId);
    }

    handleHit(playerId, message) {
        const room = this.playerToRoom.get(playerId);
        if (!room || !room.gameStarted) return;

        const attacker = room.players.get(playerId);
        const victim = room.players.get(message.targetId);

        if (!attacker || !victim || !victim.isAlive) return;

        // Rate limiting
        if (!attacker.checkRateLimit('hit')) return;

        // Validate damage
        const damage = Number(message.damage);
        if (!isValidNumber(damage) || damage < 0 || damage > BOUNDS.MAX_DAMAGE) return;

        // Check spawn protection
        if (victim.spawnProtectionUntil && Date.now() < victim.spawnProtectionUntil) {
            return; // Silently ignore (no console spam)
        }

        // === Enhanced Hit Validation ===
        const validationResult = this.validateHit(attacker, victim, message);
        if (!validationResult.valid) {
            console.log(`Hit rejected: ${validationResult.reason}`);
            return;
        }

        // Apply validated damage (may be reduced)
        const finalDamage = Math.min(damage, damage * validationResult.damageMultiplier);
        victim.health -= finalDamage;

        // Broadcast damage
        room.broadcast({
            type: 'player_damage',
            targetId: message.targetId,
            attackerId: playerId,
            damage: finalDamage,
            health: victim.health,
            isHeadshot: !!message.isHeadshot
        });

        // Check for kill
        if (victim.health <= 0) {
            room.handleKill(playerId, message.targetId, !!message.isHeadshot);
        }
    }

    /**
     * Validate a hit for anti-cheat and lag compensation
     * @param {Player} attacker - Attacking player
     * @param {Player} victim - Target player
     * @param {Object} message - Hit message data
     * @returns {Object} {valid: boolean, reason: string, damageMultiplier: number}
     */
    validateHit(attacker, victim, message) {
        // Weapon range limits (generous for lag tolerance)
        const WEAPON_RANGES = {
            'RIFLE': 80,
            'SMG': 40,
            'SHOTGUN': 15,
            'PISTOL': 50,
            'SNIPER': 150
        };

        // Get attacker's current position
        const attackerPos = attacker.position;

        // Use lag compensation: get victim's position from ~100ms ago
        const lagCompensatedTime = Date.now() - 100;
        const victimPos = victim.getPositionAtTime(lagCompensatedTime);

        // Calculate distance between players
        const dx = attackerPos.x - victimPos.x;
        const dy = attackerPos.y - victimPos.y;
        const dz = attackerPos.z - victimPos.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Get max range for weapon (with 15% tolerance for lag)
        const weapon = attacker.weapon || 'RIFLE';
        const maxRange = (WEAPON_RANGES[weapon] || 80) * 1.15;

        // Check distance
        if (distance > maxRange) {
            return {
                valid: false,
                reason: `Distance ${distance.toFixed(1)} exceeds max range ${maxRange.toFixed(1)} for ${weapon}`,
                damageMultiplier: 0
            };
        }

        // Basic line-of-sight check (just check height difference isn't absurd)
        if (Math.abs(dy) > 5) {
            return {
                valid: false,
                reason: `Height difference ${Math.abs(dy).toFixed(1)} too large`,
                damageMultiplier: 0
            };
        }

        // Apply distance-based damage falloff for some weapons
        let damageMultiplier = 1.0;
        if (weapon === 'SHOTGUN' && distance > 8) {
            // Shotgun damage falls off beyond 8 units
            damageMultiplier = Math.max(0.3, 1 - (distance - 8) / 12);
        } else if (weapon === 'SMG' && distance > 25) {
            // SMG damage falls off beyond 25 units
            damageMultiplier = Math.max(0.5, 1 - (distance - 25) / 30);
        }

        return {
            valid: true,
            reason: 'ok',
            damageMultiplier
        };
    }

    handleWeaponChange(playerId, message) {
        const room = this.playerToRoom.get(playerId);
        if (!room) return;

        const player = room.players.get(playerId);
        if (!player) return;

        // Rate limiting
        if (!player.checkRateLimit('weapon_change')) return;

        // Validate weapon type
        const validWeapons = ['RIFLE', 'PISTOL', 'SMG', 'SHOTGUN', 'SNIPER'];
        if (!validWeapons.includes(message.weapon)) return;

        player.weapon = message.weapon;

        room.broadcast({
            type: 'player_weapon',
            playerId,
            weapon: message.weapon
        }, playerId);
    }

    handleDisconnect(playerId) {
        const room = this.playerToRoom.get(playerId);
        if (!room) return;

        const player = room.players.get(playerId);
        if (player) {
            console.log(`Player ${player.name} (${playerId}) disconnected`);

            room.broadcast({
                type: 'player_left',
                playerId,
                playerName: player.name
            });

            room.removePlayer(playerId);
        }

        this.playerToRoom.delete(playerId);
    }

    startGameLoop() {
        // Game state update loop
        setInterval(() => {
            this.rooms.forEach(room => {
                if (room.gameStarted) {
                    room.update();
                }
            });
        }, 1000 / CONFIG.TICK_RATE);

        // Player timeout check loop
        setInterval(() => {
            const now = Date.now();
            this.rooms.forEach(room => {
                room.players.forEach((player, playerId) => {
                    if (now - player.lastUpdate > CONFIG.PLAYER_TIMEOUT) {
                        console.log(`Player ${player.name} timed out (no updates for ${CONFIG.PLAYER_TIMEOUT / 1000}s)`);
                        // Close the WebSocket - this will trigger handleDisconnect
                        if (player.ws && player.ws.readyState === WebSocket.OPEN) {
                            player.ws.close(1000, 'Connection timeout');
                        }
                    }
                });
            });
        }, CONFIG.TIMEOUT_CHECK_INTERVAL);
    }

    setupGracefulShutdown() {
        const shutdown = (signal) => {
            if (this.isShuttingDown) return;
            this.isShuttingDown = true;

            console.log(`\n${signal} received. Starting graceful shutdown...`);

            // Notify all players
            this.rooms.forEach(room => {
                room.broadcast({ type: 'server_shutdown', message: 'Server is shutting down' });
            });

            // Close WebSocket server (stop accepting new connections)
            this.wss.close(() => {
                console.log('WebSocket server closed');
            });

            // Give clients time to receive the shutdown message
            setTimeout(() => {
                this.httpServer.close(() => {
                    console.log('HTTP server closed');
                    process.exit(0);
                });

                // Force exit after 5 seconds if graceful shutdown fails
                setTimeout(() => {
                    console.log('Forcing exit...');
                    process.exit(1);
                }, 5000);
            }, 1000);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }

    start() {
        this.httpServer.listen(PORT, () => {
            console.log(`🎮 FPS Multiplayer Server running on port ${PORT}`);
            console.log(`   Kill limit: ${CONFIG.KILL_LIMIT}`);
            console.log(`   Time limit: ${CONFIG.TIME_LIMIT / 60000} minutes`);
            console.log(`   Respawn delay: ${CONFIG.RESPAWN_DELAY / 1000} seconds`);
            console.log(`   Max connections: ${MAX_CONNECTIONS}`);
        });
    }
}

// Start server
const server = new GameServer();
server.start();
