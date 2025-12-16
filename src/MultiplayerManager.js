// MultiplayerManager.js - Manages multiplayer game state and remote players
import * as THREE from 'three';
import { RemotePlayer } from './RemotePlayer.js';

// Game modes - mirrored from server
const GAME_MODES = {
    DEATHMATCH: 'deathmatch',
    TEAM_DEATHMATCH: 'team_deathmatch'
};

const TEAMS = {
    ALPHA: 'alpha',
    BRAVO: 'bravo'
};

export class MultiplayerManager {
    constructor(scene, arena, networkManager, hud = null) {
        this.scene = scene;
        this.arena = arena;
        this.network = networkManager;
        this.hud = hud; // Direct HUD reference for respawn overlay

        // Remote players
        this.remotePlayers = new Map();

        // Local player and shooting references
        this.localPlayer = null;
        this.localPlayerId = null;
        this.localPlayerTeam = null;
        this.shooting = null; // For reading ADS, reload, weapon state
        this.bulletTracerManager = null; // For rendering remote player bullet tracers

        // Game state
        this.gameStarted = false;
        this.gameMode = GAME_MODES.DEATHMATCH;
        this.scores = [];
        this.teamScores = { [TEAMS.ALPHA]: 0, [TEAMS.BRAVO]: 0 };
        this.killFeed = [];
        this.respawnCountdown = 0;
        this.isRespawning = false;

        // Callbacks
        this.onScoreUpdate = null;
        this.onKillFeed = null;
        this.onGameStart = null;
        this.onGameEnd = null;
        this.onRespawnStart = null;
        this.onRespawnEnd = null;
        this.onPlayerCountChange = null;
        this.onTeamScoreUpdate = null;

        // Setup network handlers
        this.setupNetworkHandlers();
    }

    setupNetworkHandlers() {
        // Player joined
        this.network.on('player_joined', (data) => {
            console.log(`Player joined: ${data.player.name}`);
            this.addRemotePlayer(data.player);
            if (this.onPlayerCountChange) {
                this.onPlayerCountChange(this.getPlayerCount());
            }
        });

        // Player left
        this.network.on('player_left', (data) => {
            console.log(`Player left: ${data.playerName}`);
            this.removeRemotePlayer(data.playerId);
            if (this.onPlayerCountChange) {
                this.onPlayerCountChange(this.getPlayerCount());
            }
        });

        // Initial player list on join
        this.network.on('joined', (data) => {
            this.localPlayerId = data.playerId;

            // Store game mode and team info
            this.gameMode = data.gameMode || GAME_MODES.DEATHMATCH;
            if (data.teamScores) {
                this.teamScores = data.teamScores;
            }

            // Find local player's team from player list
            const localPlayerData = data.players.find(p => p.id === this.localPlayerId);
            if (localPlayerData && localPlayerData.team) {
                this.localPlayerTeam = localPlayerData.team;
                console.log(`Assigned to team: ${this.localPlayerTeam}`);
            }

            // Add existing players
            data.players.forEach(playerData => {
                if (playerData.id !== this.localPlayerId) {
                    this.addRemotePlayer(playerData);
                }
            });

            if (data.gameStarted) {
                this.gameStarted = true;
                if (this.onGameStart) this.onGameStart(data.config, data.gameMode);
            }

            if (this.onPlayerCountChange) {
                this.onPlayerCountChange(this.getPlayerCount());
            }
        });

        // Game start
        this.network.on('game_start', (data) => {
            console.log(`Game started! Mode: ${data.gameMode}`);
            this.gameStarted = true;
            this.gameMode = data.gameMode || GAME_MODES.DEATHMATCH;
            this.scores = [];
            this.killFeed = [];

            // Reset team scores
            if (data.teamScores) {
                this.teamScores = data.teamScores;
                if (this.onTeamScoreUpdate) {
                    this.onTeamScoreUpdate(this.teamScores);
                }
            }

            // Update local player's team from player list
            if (data.players) {
                const localPlayerData = data.players.find(p => p.id === this.localPlayerId);
                if (localPlayerData && localPlayerData.team) {
                    this.localPlayerTeam = localPlayerData.team;
                    console.log(`Team reassigned: ${this.localPlayerTeam}`);
                }
            }

            if (this.onGameStart) this.onGameStart(data.config, data.gameMode);
        });

        // Game end
        this.network.on('game_end', (data) => {
            console.log('Game ended:', data.reason);
            this.gameStarted = false;

            if (this.onGameEnd) this.onGameEnd(data);
        });

        // Position updates
        this.network.on('player_position', (data) => {
            const player = this.remotePlayers.get(data.playerId);
            if (player) {
                player.updatePosition(data.position, data.rotation);
                // Apply visual states for crouch, peek, ADS, sprint, etc.
                if (data.state) {
                    player.updateState(data.state);
                }
            }
        });

        // Shoot events - now with bullet tracer data
        this.network.on('player_shoot', (data) => {
            const player = this.remotePlayers.get(data.playerId);
            if (player) {
                player.showShootEffect();

                // Render bullet tracer from the remote player's actual gun muzzle
                if (this.bulletTracerManager && data.target) {
                    // Use the remote player's gun muzzle position (not the sent origin)
                    // This ensures the tracer comes from the correct position on their model
                    const origin = player.getMuzzleWorldPosition();
                    const target = new THREE.Vector3(data.target.x, data.target.y, data.target.z);
                    this.bulletTracerManager.fire(origin, target, data.weapon || 'RIFLE');
                }
            }
        });

        // Damage events
        this.network.on('player_damage', (data) => {
            if (data.targetId === this.localPlayerId) {
                // Local player took damage - only if alive
                if (this.localPlayer && !this.localPlayer.isDead && !this.isRespawning) {
                    this.localPlayer.takeDamage(data.damage);
                }
            } else {
                // Remote player took damage
                const player = this.remotePlayers.get(data.targetId);
                if (player) {
                    player.setHealth(data.health);
                    player.showDamageFlash();
                }
            }
        });

        // Kill events
        this.network.on('player_killed', (data) => {
            // Update scores
            this.scores = data.scores;
            if (this.onScoreUpdate) this.onScoreUpdate(this.scores);

            // Update team scores
            if (data.teamScores) {
                this.teamScores = data.teamScores;
                if (this.onTeamScoreUpdate) {
                    this.onTeamScoreUpdate(this.teamScores);
                }
            }

            // Add to kill feed with team info
            const killInfo = {
                killer: data.killerName,
                killerTeam: data.killerTeam,
                victim: data.victimName,
                victimTeam: data.victimTeam,
                isHeadshot: data.isHeadshot,
                isLocalKiller: data.killerId === this.localPlayerId,
                isLocalVictim: data.victimId === this.localPlayerId
            };
            this.killFeed.unshift(killInfo);
            if (this.killFeed.length > 5) this.killFeed.pop();
            if (this.onKillFeed) this.onKillFeed(this.killFeed);

            // Handle remote player death
            if (data.victimId !== this.localPlayerId) {
                const victim = this.remotePlayers.get(data.victimId);
                if (victim) {
                    victim.setAlive(false);
                }
            } else {
                // Local player died - mark as dead immediately
                if (this.localPlayer) {
                    this.localPlayer.isDead = true;
                    this.localPlayer.health = 0;
                }
                this.isRespawning = true;
                this.respawnCountdown = 3;
                if (this.onRespawnStart) this.onRespawnStart(this.respawnCountdown);
            }
        });

        // Respawn events
        this.network.on('player_respawn', (data) => {
            console.log('Respawn event received:', data.playerId, 'Local ID:', this.localPlayerId);

            if (data.playerId === this.localPlayerId) {
                // Local player respawned
                console.log('Local player respawning!');
                this.isRespawning = false;
                this.respawnCountdown = 0;

                if (this.localPlayer) {
                    this.localPlayer.respawnAt(data.position);
                }

                // Hide the respawn overlay - try both methods
                // Direct HUD call
                if (this.hud) {
                    console.log('Hiding respawn overlay via direct HUD reference');
                    this.hud.hideRespawnOverlay();
                }
                // Also try callback
                if (this.onRespawnEnd) {
                    console.log('Calling onRespawnEnd callback');
                    this.onRespawnEnd();
                }
            } else {
                // Remote player respawned
                const player = this.remotePlayers.get(data.playerId);
                if (player) {
                    player.setAlive(true);
                    player.setHealth(data.health);
                    player.updatePosition(data.position, { x: 0, y: 0 });
                }
            }
        });

        // Weapon change
        this.network.on('player_weapon', (data) => {
            const player = this.remotePlayers.get(data.playerId);
            if (player) {
                player.weapon = data.weapon;
            }
        });
    }

    setLocalPlayer(player) {
        this.localPlayer = player;

        // Add respawn method to player if not exists
        if (!player.respawnAt) {
            player.respawnAt = (position) => {
                try {
                    // Reset player position (use camera height for Y)
                    const spawnY = position.y || 1.7;
                    player.camera.position.set(position.x, spawnY, position.z);

                    // Reset velocity (Player uses separate velocityX/Y/Z properties)
                    player.velocityX = 0;
                    player.velocityY = 0;
                    player.velocityZ = 0;

                    console.log('Local player respawned at:', position);
                } catch (e) {
                    console.error('Error in respawnAt:', e);
                }

                // Always reset health and isDead, even if position update fails
                player.health = player.maxHealth;
                player.isDead = false;
            };
        }
    }

    setShooting(shooting) {
        this.shooting = shooting;
    }

    addRemotePlayer(playerData) {
        if (this.remotePlayers.has(playerData.id)) return;

        const remotePlayer = new RemotePlayer(this.scene, playerData);
        this.remotePlayers.set(playerData.id, remotePlayer);

        console.log(`Added remote player: ${playerData.name}`);
    }

    removeRemotePlayer(playerId) {
        const player = this.remotePlayers.get(playerId);
        if (player) {
            player.dispose();
            this.remotePlayers.delete(playerId);
        }
    }

    update(deltaTime) {
        // Update respawn countdown
        if (this.isRespawning && this.respawnCountdown > 0) {
            this.respawnCountdown -= deltaTime;
            if (this.respawnCountdown < 0) this.respawnCountdown = 0;
        }

        // Update remote players
        this.remotePlayers.forEach(player => {
            player.update(deltaTime);
        });

        // Send local player position with state
        if (this.localPlayer && this.network.isConnected && !this.isRespawning) {
            // Use getBasePosition to exclude peek offset - keeps remote legs still
            const pos = this.localPlayer.getBasePosition ?
                this.localPlayer.getBasePosition() :
                this.localPlayer.getPosition();
            const rot = {
                x: this.localPlayer.camera.rotation.x,
                y: this.localPlayer.camera.rotation.y
            };

            // Collect local player state for visual sync
            const state = {
                isCrouching: this.localPlayer.isCrouching || false,
                peekState: this.localPlayer.peekLeft ? -1 : (this.localPlayer.peekRight ? 1 : 0),
                isAiming: this.shooting?.isAiming || false,
                isSprinting: this.localPlayer.sprint || false,
                isReloading: this.shooting?.isReloading || false,
                weapon: this.shooting?.currentWeaponKey || 'RIFLE'
            };

            this.network.sendPosition(pos, rot, state);
        }
    }

    onPlayerJump() {
        if (this.localPlayer && this.network.isConnected) {
            // Force immediate update on jump to ensure other players see it
            const pos = this.localPlayer.getBasePosition ? this.localPlayer.getBasePosition() : this.localPlayer.getPosition();
            const rot = {
                x: this.localPlayer.camera.rotation.x,
                y: this.localPlayer.camera.rotation.y
            };
            const state = {
                isCrouching: false,
                peekState: this.localPlayer.peekLeft ? -1 : (this.localPlayer.peekRight ? 1 : 0),
                isAiming: this.shooting?.isAiming || false,
                isSprinting: this.localPlayer.sprint || false,
                isReloading: this.shooting?.isReloading || false,
                weapon: this.shooting?.currentWeaponKey || 'RIFLE'
            };
            this.network.sendPosition(pos, rot, state, true); // Force update
        }
    }

    onPlayerLand() {
        if (this.localPlayer && this.network.isConnected) {
            // Force immediate update on landing
            const pos = this.localPlayer.getBasePosition ? this.localPlayer.getBasePosition() : this.localPlayer.getPosition();
            const rot = {
                x: this.localPlayer.camera.rotation.x,
                y: this.localPlayer.camera.rotation.y
            };
            const state = {
                isCrouching: this.localPlayer.sprint || false, // Use current state
                peekState: this.localPlayer.peekLeft ? -1 : (this.localPlayer.peekRight ? 1 : 0),
                isAiming: this.shooting?.isAiming || false,
                isSprinting: this.localPlayer.sprint || false,
                isReloading: this.shooting?.isReloading || false,
                weapon: this.shooting?.currentWeaponKey || 'RIFLE'
            };
            // Correct crouching check
            state.isCrouching = this.localPlayer.isCrouching || false;

            this.network.sendPosition(pos, rot, state, true); // Force update
        }
    }

    // Get all remote player meshes for hit detection
    getRemotePlayerMeshes() {
        const meshes = [];
        this.remotePlayers.forEach(player => {
            if (player.isAlive) {
                // Add body and head as separate targets
                meshes.push({
                    mesh: player.getMesh(),
                    headMesh: player.getHeadMesh(),
                    playerId: player.id,
                    isPlayer: true
                });
            }
        });
        return meshes;
    }

    // Called when local player hits a remote player
    handleLocalHit(targetPlayerId, damage, isHeadshot) {
        this.network.sendHit(targetPlayerId, damage, isHeadshot);
    }

    // Called when local player shoots - pass bullet trajectory data
    handleLocalShoot(weapon, bulletData) {
        this.network.sendShoot(weapon, bulletData);
    }

    setBulletTracerManager(manager) {
        this.bulletTracerManager = manager;
    }

    getPlayerCount() {
        return this.remotePlayers.size + 1; // +1 for local player
    }

    getScores() {
        return this.scores;
    }

    getKillFeed() {
        return this.killFeed;
    }

    getRespawnCountdown() {
        return Math.ceil(this.respawnCountdown);
    }

    isGameActive() {
        return this.gameStarted && !this.isRespawning;
    }

    // Team getters
    getGameMode() {
        return this.gameMode;
    }

    getTeamScores() {
        return this.teamScores;
    }

    getLocalPlayerTeam() {
        return this.localPlayerTeam;
    }

    isTeamMode() {
        return this.gameMode === GAME_MODES.TEAM_DEATHMATCH;
    }

    // Check if a player is on the same team as local player
    isSameTeam(playerId) {
        if (!this.isTeamMode() || !this.localPlayerTeam) return false;
        const player = this.remotePlayers.get(playerId);
        return player && player.team === this.localPlayerTeam;
    }

    reset() {
        // Remove all remote players
        this.remotePlayers.forEach(player => {
            player.dispose();
        });
        this.remotePlayers.clear();

        this.gameStarted = false;
        this.gameMode = GAME_MODES.DEATHMATCH;
        this.scores = [];
        this.teamScores = { [TEAMS.ALPHA]: 0, [TEAMS.BRAVO]: 0 };
        this.killFeed = [];
        this.respawnCountdown = 0;
        this.isRespawning = false;
        this.localPlayerTeam = null;
    }

    dispose() {
        this.reset();
        this.network.disconnect();
    }
}
