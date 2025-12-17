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
    MAX_PLAYERS_PER_ROOM: 8
};

// Player class
class Player {
    constructor(id, ws, name) {
        this.id = id;
        this.ws = ws;
        this.name = name || `Player${id.slice(0, 4)}`;
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

        // Check spawn protection
        if (victim.spawnProtectionUntil && Date.now() < victim.spawnProtectionUntil) {
            console.log(`${victim.name} is spawn protected, ignoring hit`);
            return;
        }

        // Apply damage
        victim.health -= message.damage;

        // Broadcast damage
        room.broadcast({
            type: 'player_damage',
            targetId: message.targetId,
            attackerId: playerId,
            damage: message.damage,
            health: victim.health,
            isHeadshot: message.isHeadshot
        });

        // Check for kill
        if (victim.health <= 0) {
            room.handleKill(playerId, message.targetId, message.isHeadshot);
        }
    }

    handleWeaponChange(playerId, message) {
        const room = this.playerToRoom.get(playerId);
        if (!room) return;

        const player = room.players.get(playerId);
        if (!player) return;

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
        setInterval(() => {
            this.rooms.forEach(room => {
                if (room.gameStarted) {
                    room.update();
                }
            });
        }, 1000 / CONFIG.TICK_RATE);
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
