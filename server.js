// server.js - WebSocket multiplayer server for FPS game
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';

const PORT = process.env.PORT || 8080;

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

        // Create HTTP server
        this.httpServer = createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('FPS Multiplayer Server Running');
        });

        // Create WebSocket server
        this.wss = new WebSocketServer({ server: this.httpServer });

        this.setupWebSocket();
        this.startGameLoop();
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

        // Apply damage
        victim.health -= damage;

        // Broadcast damage
        room.broadcast({
            type: 'player_damage',
            targetId: message.targetId,
            attackerId: playerId,
            damage: damage,
            health: victim.health,
            isHeadshot: !!message.isHeadshot
        });

        // Check for kill
        if (victim.health <= 0) {
            room.handleKill(playerId, message.targetId, !!message.isHeadshot);
        }
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

    start() {
        this.httpServer.listen(PORT, () => {
            console.log(`🎮 FPS Multiplayer Server running on port ${PORT}`);
            console.log(`   Kill limit: ${CONFIG.KILL_LIMIT}`);
            console.log(`   Time limit: ${CONFIG.TIME_LIMIT / 60000} minutes`);
            console.log(`   Respawn delay: ${CONFIG.RESPAWN_DELAY / 1000} seconds`);
        });
    }
}

// Start server
const server = new GameServer();
server.start();
