// server.js - WebSocket multiplayer server for FPS game
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';

const PORT = process.env.PORT || 8080;

// Game modes
const GAME_MODES = {
    DEATHMATCH: 'deathmatch',
    TEAM_DEATHMATCH: 'team_deathmatch'
};

// Teams for team-based modes
const TEAMS = {
    ALPHA: 'alpha',  // Blue team
    BRAVO: 'bravo'   // Red team
};

const TEAM_COLORS = {
    [TEAMS.ALPHA]: [0x4488ff, 0x66aaff, 0x88ccff, 0x3377ee], // Blue shades
    [TEAMS.BRAVO]: [0xff4444, 0xff6666, 0xff8888, 0xee3333]  // Red shades
};

// Game configuration
const CONFIG = {
    KILL_LIMIT: 20,
    TEAM_KILL_LIMIT: 50, // Higher limit for team modes
    TIME_LIMIT: 10 * 60 * 1000, // 10 minutes
    RESPAWN_DELAY: 3000, // 3 seconds
    TICK_RATE: 20, // Updates per second
    MAX_PLAYERS_PER_ROOM: 8,
    FRIENDLY_FIRE: false,
    DEFAULT_MODE: GAME_MODES.TEAM_DEATHMATCH
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
        this.team = null; // Will be assigned for team modes
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

    // Assign team color based on team
    setTeam(team) {
        this.team = team;
        if (team && TEAM_COLORS[team]) {
            const teamColors = TEAM_COLORS[team];
            this.color = teamColors[Math.floor(Math.random() * teamColors.length)];
        }
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
            color: this.color,
            team: this.team
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

        // Game mode support
        this.gameMode = CONFIG.DEFAULT_MODE;
        this.teamScores = {
            [TEAMS.ALPHA]: 0,
            [TEAMS.BRAVO]: 0
        };
    }

    addPlayer(player) {
        // Assign team in team modes
        if (this.gameMode === GAME_MODES.TEAM_DEATHMATCH) {
            const team = this.getTeamWithFewerPlayers();
            player.setTeam(team);
        }

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

    // Get team with fewer players for balancing
    getTeamWithFewerPlayers() {
        let alphaCount = 0;
        let bravoCount = 0;

        this.players.forEach(player => {
            if (player.team === TEAMS.ALPHA) alphaCount++;
            else if (player.team === TEAMS.BRAVO) bravoCount++;
        });

        return alphaCount <= bravoCount ? TEAMS.ALPHA : TEAMS.BRAVO;
    }

    // Get team spawn points
    getTeamSpawnPoints(team) {
        if (team === TEAMS.ALPHA) {
            // Alpha spawns on negative Z side (blue team)
            return [
                { x: -8, y: 1.7, z: -8 },
                { x: -5, y: 1.7, z: -8 },
                { x: 0, y: 1.7, z: -8 },
                { x: -7, y: 1.7, z: -5 }
            ];
        } else if (team === TEAMS.BRAVO) {
            // Bravo spawns on positive Z side (red team)
            return [
                { x: 8, y: 1.7, z: 8 },
                { x: 5, y: 1.7, z: 8 },
                { x: 0, y: 1.7, z: 8 },
                { x: 7, y: 1.7, z: 5 }
            ];
        }
        // Default random spawns
        return [
            { x: -8, y: 1.7, z: -8 },
            { x: 8, y: 1.7, z: -8 },
            { x: -8, y: 1.7, z: 8 },
            { x: 8, y: 1.7, z: 8 },
            { x: 0, y: 1.7, z: 0 }
        ];
    }

    setGameMode(mode) {
        if (!this.gameStarted) {
            this.gameMode = mode;
            console.log(`Room ${this.id}: Game mode set to ${mode}`);
        }
    }

    startGame() {
        this.gameStarted = true;
        this.gameStartTime = Date.now();
        this.killFeed = [];
        this.teamScores = {
            [TEAMS.ALPHA]: 0,
            [TEAMS.BRAVO]: 0
        };

        // Reset all players and reassign teams for balance
        const playerList = Array.from(this.players.values());
        playerList.forEach((player, index) => {
            player.kills = 0;
            player.deaths = 0;
            player.health = 100;
            player.isAlive = true;

            // Reassign teams evenly at game start
            if (this.gameMode === GAME_MODES.TEAM_DEATHMATCH) {
                const team = index % 2 === 0 ? TEAMS.ALPHA : TEAMS.BRAVO;
                player.setTeam(team);
            }
        });

        this.broadcast({
            type: 'game_start',
            config: CONFIG,
            gameMode: this.gameMode,
            players: this.getPlayersArray(),
            teamScores: this.teamScores
        });

        console.log(`Room ${this.id}: Game started (${this.gameMode}) with ${this.players.size} players`);
    }

    endGame(reason = 'Game Over') {
        this.gameStarted = false;

        let winner = null;
        let winningTeam = null;

        if (this.gameMode === GAME_MODES.TEAM_DEATHMATCH) {
            // Determine winning team
            if (this.teamScores[TEAMS.ALPHA] > this.teamScores[TEAMS.BRAVO]) {
                winningTeam = TEAMS.ALPHA;
            } else if (this.teamScores[TEAMS.BRAVO] > this.teamScores[TEAMS.ALPHA]) {
                winningTeam = TEAMS.BRAVO;
            } else {
                winningTeam = 'tie';
            }
        } else {
            // Find individual winner (FFA mode)
            let maxKills = -1;
            this.players.forEach(player => {
                if (player.kills > maxKills) {
                    maxKills = player.kills;
                    winner = player;
                }
            });
        }

        this.broadcast({
            type: 'game_end',
            reason,
            gameMode: this.gameMode,
            winner: winner ? winner.toJSON() : null,
            winningTeam,
            teamScores: this.teamScores,
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

        // Update team score in TDM
        if (this.gameMode === GAME_MODES.TEAM_DEATHMATCH && killer.team) {
            this.teamScores[killer.team]++;
        }

        // Add to kill feed
        const killInfo = {
            killer: killer.name,
            killerTeam: killer.team,
            victim: victim.name,
            victimTeam: victim.team,
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
            killerTeam: killer.team,
            victimName: victim.name,
            victimTeam: victim.team,
            isHeadshot,
            scores: this.getScores(),
            teamScores: this.teamScores
        });

        // Check win condition
        if (this.gameMode === GAME_MODES.TEAM_DEATHMATCH) {
            // Team win check
            const winningTeam = Object.entries(this.teamScores)
                .find(([team, score]) => score >= CONFIG.TEAM_KILL_LIMIT);
            if (winningTeam) {
                const teamName = winningTeam[0] === TEAMS.ALPHA ? 'Alpha' : 'Bravo';
                this.endGame(`Team ${teamName} wins!`);
            }
        } else {
            // Individual win check
            if (killer.kills >= CONFIG.KILL_LIMIT) {
                this.endGame(`${killer.name} wins!`);
            }
        }
    }

    handleRespawn(playerId) {
        const player = this.players.get(playerId);
        if (!player) return;

        player.isAlive = true;
        player.health = 100;
        player.spawnProtectionUntil = Date.now() + 2000; // 2 seconds of invulnerability

        // Get team-appropriate spawn points
        const spawnPoints = this.getTeamSpawnPoints(player.team);
        const spawn = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
        player.position = { ...spawn };

        console.log(`Player ${player.name} (${player.team || 'no team'}) respawning at:`, spawn);

        this.broadcast({
            type: 'player_respawn',
            playerId,
            position: player.position,
            health: player.health,
            team: player.team,
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

        // Send join confirmation with game mode info
        ws.send(JSON.stringify({
            type: 'joined',
            playerId,
            players: room.getPlayersArray(),
            gameStarted: room.gameStarted,
            gameMode: room.gameMode,
            teamScores: room.teamScores,
            config: CONFIG
        }));

        // Notify others (includes team info now)
        room.broadcast({
            type: 'player_joined',
            player: player.toJSON()
        }, playerId);

        console.log(`Player ${player.name} (${playerId}) joined room ${room.id} as ${player.team || 'no team'}`);
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

        // Check for friendly fire in team modes
        if (room.gameMode === GAME_MODES.TEAM_DEATHMATCH &&
            !CONFIG.FRIENDLY_FIRE &&
            attacker.team === victim.team) {
            // Same team - ignore damage
            return;
        }

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
