// main.js - Optimized game orchestrator with Multiplayer support
import * as THREE from 'three';
import { Arena } from './Arena.js';
import { Player } from './Player.js';
import { Shooting } from './Shooting.js';
import { WaveManager } from './WaveManager.js';
import { HUD } from './HUD.js';
import { Menu } from './Menu.js';
import { Score } from './Score.js';
import { Audio } from './Audio.js';
import { NetworkManager } from './NetworkManager.js';
import { MultiplayerManager } from './MultiplayerManager.js';
import { BulletTracerManager } from './BulletTracer.js';

// Game states
const STATES = {
    LOADING: 0,
    MENU: 1,
    PLAYING: 2,
    GAME_OVER: 3,
    MULTIPLAYER_LOBBY: 4,
    MULTIPLAYER_PLAYING: 5,
    MULTIPLAYER_GAME_OVER: 6
};

class Game {
    constructor() {
        this.state = STATES.LOADING;
        this.lastTime = 0;

        // Initialize Three.js
        this.initRenderer();
        this.initScene();
        this.initLighting();

        // Initialize game systems
        this.arena = new Arena(this.scene);
        this.player = new Player(this.camera, this.renderer.domElement, this.arena);
        this.shooting = new Shooting(this.camera, this.scene);
        this.waveManager = new WaveManager(this.scene, this.arena);
        this.hud = new HUD();
        this.menu = new Menu();
        this.score = new Score();
        this.audio = new Audio();

        // Multiplayer systems
        this.network = new NetworkManager();
        this.multiplayerManager = null;

        // Connect systems
        this.waveManager.setPlayer(this.player);
        this.waveManager.setShooting(this.shooting);
        this.waveManager.initPathfinding();
        this.waveManager.initProjectiles(this.scene);
        this.shooting.setPlayer(this.player);
        this.shooting.setArena(this.arena);

        // Initialize bullet tracer system for visual feedback
        this.bulletTracerManager = new BulletTracerManager(this.scene, this.camera);
        this.shooting.setBulletTracerManager(this.bulletTracerManager);

        // Connect projectile manager to player for hit detection
        if (this.waveManager.projectileManager) {
            this.waveManager.projectileManager.setPlayer(this.player);
            this.waveManager.projectileManager.onHitPlayer = (damage) => {
                this.player.takeDamage(damage);
            };
        }

        // Set up callbacks
        this.setupCallbacks();
        this.setupMultiplayerCallbacks();

        // Apply initial settings from menu
        const initialSettings = this.menu.getSettings();
        this.arena.applySettings(initialSettings);
        this.hud.setHitmarkerEnabled(initialSettings.hitmarkers);
        // Apply initial sensitivity (convert slider 1-10 to actual sensitivity 0.0008-0.004)
        this.player.sensitivity = this.sliderToSensitivity(initialSettings.sensitivity);

        // Connect settings change callback
        this.menu.onSettingsChange = (setting, value) => {
            if (setting === 'particles') {
                this.arena.setParticlesEnabled(value);
            } else if (setting === 'flickerLights') {
                this.arena.setFlickerEnabled(value);
            } else if (setting === 'hitmarkers') {
                this.hud.setHitmarkerEnabled(value);
            } else if (setting === 'sensitivity') {
                this.player.sensitivity = this.sliderToSensitivity(value);
            }
        };

        // Add damage flash element
        this.createDamageFlash();

        // Handle window resize
        window.addEventListener('resize', () => this.onResize());

        // ESC key handler for pause menu
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Escape') {
                this.handleEscapeKey();
            }
        });

        // Click to re-lock pointer when playing (only if not paused)
        this.renderer.domElement.addEventListener('click', () => {
            if ((this.state === STATES.PLAYING || this.state === STATES.MULTIPLAYER_PLAYING)
                && !this.player.isLocked && !this.menu.isPaused) {
                this.player.lock();
            }
        });

        // Setup pause menu callbacks
        this.setupPauseMenuCallbacks();

        // Bind animate for optimal performance
        this.animate = this.animate.bind(this);

        // Start
        this.finishLoading();
    }

    initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: false,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(1);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.BasicShadowMap;
        this.renderer.setClearColor(0x1a1a2e);

        document.getElementById('game-container').appendChild(this.renderer.domElement);
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x1a1a2e, 20, 50);

        this.camera = new THREE.PerspectiveCamera(
            90,
            window.innerWidth / window.innerHeight,
            0.1,
            100
        );

        this.scene.add(this.camera);
    }

    initLighting() {
        const ambient = new THREE.AmbientLight(0x606080, 0.6);
        this.scene.add(ambient);

        const directional = new THREE.DirectionalLight(0xffffff, 0.8);
        directional.position.set(10, 20, 10);
        directional.castShadow = true;
        directional.shadow.mapSize.width = 512;
        directional.shadow.mapSize.height = 512;
        directional.shadow.camera.near = 1;
        directional.shadow.camera.far = 40;
        directional.shadow.camera.left = -12;
        directional.shadow.camera.right = 12;
        directional.shadow.camera.top = 12;
        directional.shadow.camera.bottom = -12;
        this.scene.add(directional);

        const redLight = new THREE.PointLight(0xff4444, 0.4, 25);
        redLight.position.set(-8, 5, -8);
        this.scene.add(redLight);

        const blueLight = new THREE.PointLight(0x4444ff, 0.4, 25);
        blueLight.position.set(8, 5, 8);
        this.scene.add(blueLight);
    }

    createDamageFlash() {
        const flash = document.createElement('div');
        flash.id = 'damage-flash';
        document.body.appendChild(flash);

        const muzzle = document.createElement('div');
        muzzle.id = 'muzzle-flash';
        document.body.appendChild(muzzle);
    }

    setupCallbacks() {
        this.menu.onStart = () => this.startGame();
        this.menu.onRestart = () => this.startGame();

        this.waveManager.onEnemyKilled = () => {
            this.score.addKill();
            this.audio.playEnemyDeath();
        };

        this.waveManager.onWaveChange = (wave) => {
            this.hud.updateWave(wave);
        };

        this.shooting.onShoot = () => {
            this.audio.playGunshot();
        };

        this.shooting.onHit = (enemy, damage, hitPoint, isHeadshot) => {
            const killed = enemy.takeDamage(damage);
            this.hud.showHitmarker(isHeadshot);
            if (killed) {
                this.waveManager.onEnemyDeath(enemy);
            }
        };

        this.shooting.onWeaponChange = (weapon, ammo) => {
            this.hud.updateWeapon(weapon, ammo, this.shooting.isReloading);
        };

        this.shooting.onReloadProgress = (progress, isReloading) => {
            this.hud.updateReloadIndicator(progress, isReloading);
        };

        this.shooting.onReload = () => {
            this.audio.playReload();
        };

        // Sniper scope overlay callback
        this.shooting.onScopeChange = (isScoped, opacity) => {
            this.hud.updateScopeOverlay(isScoped, opacity);
        };

        // Update shoot callback to pass weapon type
        const originalOnShoot = this.shooting.onShoot;
        this.shooting.onShoot = () => {
            this.audio.playGunshot(this.shooting.currentWeaponKey);
            if (originalOnShoot) originalOnShoot();
        };

        // Player movement audio
        this.player.onFootstep = (isSprinting) => {
            this.audio.playFootstep(isSprinting);
        };
        this.player.onJump = () => {
            this.audio.playJump();
            if (this.multiplayerManager && this.state === STATES.MULTIPLAYER_PLAYING) {
                this.multiplayerManager.onPlayerJump();
            }
        };
        this.player.onLand = () => {
            this.audio.playLand();
            if (this.multiplayerManager && this.state === STATES.MULTIPLAYER_PLAYING) {
                this.multiplayerManager.onPlayerLand();
            }
        };

        // Player damage audio & visual
        const origTakeDamage = this.player.takeDamage.bind(this.player);
        this.player.takeDamage = (amount) => {
            origTakeDamage(amount);
            this.audio.playPlayerHurt();
            this.hud.showDamageFlash();
        };

        // Pointer lock
        this.player.controls.addEventListener('lock', () => {
            if (this.state === STATES.MENU) {
                this.startGame();
            }
        });
    }

    setupMultiplayerCallbacks() {
        // Menu multiplayer connect
        this.menu.onMultiplayerConnect = async (serverUrl, playerName) => {
            try {
                this.state = STATES.MULTIPLAYER_LOBBY;
                const result = await this.network.connect(serverUrl, playerName);

                // Initialize multiplayer manager
                this.multiplayerManager = new MultiplayerManager(
                    this.scene,
                    this.arena,
                    this.network
                );
                this.multiplayerManager.setLocalPlayer(this.player);
                this.multiplayerManager.setShooting(this.shooting);
                this.multiplayerManager.setBulletTracerManager(this.bulletTracerManager);
                this.multiplayerManager.localPlayerId = result.playerId;

                // Setup multiplayer manager callbacks BEFORE adding players
                this.setupMultiplayerManagerCallbacks();

                // Manually add existing players (since 'joined' event was already emitted before MultiplayerManager existed)
                result.players.forEach(playerData => {
                    if (playerData.id !== result.playerId) {
                        console.log('Adding existing player:', playerData.name);
                        this.multiplayerManager.addRemotePlayer(playerData);
                    }
                });

                // Show player list
                this.menu.showLobbyPlayers(result.players, result.playerId);

                // Update player count
                if (this.multiplayerManager.onPlayerCountChange) {
                    this.multiplayerManager.onPlayerCountChange(this.multiplayerManager.getPlayerCount());
                }

                // If game already started, jump in
                if (result.gameStarted) {
                    this.startMultiplayerGame();
                }
            } catch (error) {
                console.error('Connection failed:', error);
                this.menu.showConnectionError('Failed to connect. Is the server running?');
                this.state = STATES.MENU;
            }
        };

        // Disconnect
        this.menu.onMultiplayerDisconnect = () => {
            this.network.disconnect();
            if (this.multiplayerManager) {
                this.multiplayerManager.dispose();
                this.multiplayerManager = null;
            }
            this.state = STATES.MENU;
            this.hud.resetMultiplayer();
        };

        // Play again from MP game over
        this.menu.onMultiplayerPlayAgain = () => {
            // TODO: Implement rematch functionality
            this.menu.hideMpGameOver();
            this.menu.showMultiplayerLobby();
        };

        // Network disconnected
        this.network.on('disconnected', () => {
            if (this.state === STATES.MULTIPLAYER_PLAYING) {
                this.player.unlock();
                this.hud.hide();
                this.menu.showConnectionError('Disconnected from server.');
                this.state = STATES.MULTIPLAYER_LOBBY;
            }
        });
    }

    setupMultiplayerManagerCallbacks() {
        if (!this.multiplayerManager) return;

        // Game start
        this.multiplayerManager.onGameStart = (config) => {
            console.log('Multiplayer game starting!', config);
            this.startMultiplayerGame();
        };

        // Game end
        this.multiplayerManager.onGameEnd = (data) => {
            console.log('Multiplayer game ended!', data);
            this.state = STATES.MULTIPLAYER_GAME_OVER;
            this.player.unlock();
            this.hud.hide();
            this.menu.showMpGameOver(data);
        };

        // Score updates
        this.multiplayerManager.onScoreUpdate = (scores) => {
            this.hud.updateScoreboard(scores, this.network.getPlayerId());
        };

        // Kill feed
        this.multiplayerManager.onKillFeed = (killFeed) => {
            if (killFeed.length > 0) {
                const latest = killFeed[0];
                this.hud.addKillFeedEntry(
                    latest.killer,
                    latest.victim,
                    latest.isHeadshot,
                    latest.isLocalKiller,
                    latest.isLocalVictim
                );
            }
        };

        // Respawn
        this.multiplayerManager.onRespawnStart = (countdown) => {
            this.hud.showRespawnOverlay(countdown);
        };

        this.multiplayerManager.onRespawnEnd = () => {
            this.hud.hideRespawnOverlay();
        };

        // Player count
        this.multiplayerManager.onPlayerCountChange = (count) => {
            this.hud.updatePlayerCount(count);
            // Update lobby if in lobby
            if (this.state === STATES.MULTIPLAYER_LOBBY) {
                const players = Array.from(this.multiplayerManager.remotePlayers.values())
                    .map(p => ({ id: p.id, name: p.name, color: p.color }));
                // Add local player
                players.unshift({
                    id: this.network.getPlayerId(),
                    name: 'You',
                    color: 0x00ffaa
                });
                this.menu.updatePlayerList(players, this.network.getPlayerId());
            }
        };
    }

    setupPauseMenuCallbacks() {
        // Resume game
        this.menu.onResume = () => {
            this.resumeGame();
        };

        // Vote restart (multiplayer only)
        this.menu.onVoteRestart = () => {
            if (this.network && this.network.isConnected) {
                this.network.send({ type: 'voteRestart' });
                // Update button to show voted state
                this.menu.updateVoteRestartStatus(1, 2, true);
            }
        };

        // Disconnect/Main Menu
        this.menu.onDisconnect = () => {
            if (this.state === STATES.MULTIPLAYER_PLAYING) {
                // Disconnect from server
                this.network.disconnect();
                if (this.multiplayerManager) {
                    this.multiplayerManager.dispose();
                    this.multiplayerManager = null;
                }
                this.hud.resetMultiplayer();
            }
            // Return to main menu
            this.state = STATES.MENU;
            this.hud.hide();
            this.menu.showStart(this.score.getHighScore());
        };
    }

    handleEscapeKey() {
        // Only handle ESC when playing
        if (this.state !== STATES.PLAYING && this.state !== STATES.MULTIPLAYER_PLAYING) {
            return;
        }

        const isMultiplayer = this.state === STATES.MULTIPLAYER_PLAYING;

        // Toggle pause menu
        const stillPaused = this.menu.togglePauseMenu(isMultiplayer);

        if (stillPaused) {
            // Pause game - unlock pointer
            this.player.unlock();
        } else {
            // Resume game
            this.resumeGame();
        }
    }

    resumeGame() {
        this.menu.hidePauseMenu();
        this.player.lock();
    }

    finishLoading() {
        this.menu.hideLoading();
        this.menu.showStart(this.score.getHighScore());
        this.state = STATES.MENU;
        requestAnimationFrame(this.animate);
    }

    startGame() {
        if (this.state === STATES.PLAYING) return;

        this.state = STATES.PLAYING;
        this.audio.init();

        this.player.reset();
        this.waveManager.reset();
        this.score.reset();
        this.hud.reset();
        this.shooting.reset();

        // Ensure HUD is in solo mode
        this.hud.setMultiplayerMode(false);

        this.menu.hideAll();
        this.hud.show();
        this.player.lock();
        this.waveManager.start();
    }

    startMultiplayerGame() {
        this.state = STATES.MULTIPLAYER_PLAYING;
        this.audio.init();

        this.player.reset();
        this.shooting.reset();
        this.hud.reset();

        // Set HUD to multiplayer mode
        this.hud.setMultiplayerMode(true, this.network.getPlayerId());

        this.menu.hideAll();
        this.hud.show();
        this.player.lock();

        // Setup shooting for multiplayer hits
        this.setupMultiplayerShooting();
    }

    setupMultiplayerShooting() {
        // Override shooting hit callback for multiplayer
        this.shooting.onHit = (target, damage, hitPoint, isHeadshot) => {
            // Check if this is a remote player
            if (target && target.playerId) {
                // Send hit to server
                this.multiplayerManager.handleLocalHit(target.playerId, damage, isHeadshot);
                this.hud.showHitmarker(isHeadshot);
            }
        };

        // Notify server when shooting
        const origShootCallback = this.shooting.onShoot;
        this.shooting.onShoot = () => {
            if (origShootCallback) origShootCallback();

            // Send shoot event to network with bullet trajectory data
            if (this.multiplayerManager && this.network.isConnected) {
                this.multiplayerManager.handleLocalShoot(
                    this.shooting.currentWeaponKey,
                    this.shooting.lastBulletData
                );
            }
        };

        // Set remote players as targets for shooting
        this.updateMultiplayerShootingTargets();
    }

    updateMultiplayerShootingTargets() {
        if (!this.multiplayerManager) return;

        const remoteMeshes = this.multiplayerManager.getRemotePlayerMeshes();
        // Convert to format shooting expects
        const meshes = remoteMeshes.map(data => {
            const mesh = data.mesh;
            mesh.playerId = data.playerId;
            mesh.headMesh = data.headMesh;
            return mesh;
        });
        this.shooting.setEnemyMeshes(meshes);
    }

    gameOver() {
        this.state = STATES.GAME_OVER;

        const finalScore = this.score.getScore();
        const finalTime = this.hud.getElapsedSeconds();
        const isNewHigh = this.score.isNewHighScore();

        if (isNewHigh) this.score.saveHighScore();

        this.hud.hide();
        this.menu.showGameOver(finalScore, finalTime, isNewHigh);
    }

    animate(time) {
        requestAnimationFrame(this.animate);

        const dt = (time - this.lastTime) * 0.001;
        this.lastTime = time;

        if (dt <= 0 || dt > 0.2) {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        // Update based on game state
        if (this.state === STATES.PLAYING) {
            this.updateSoloGame(dt, time);
        } else if (this.state === STATES.MULTIPLAYER_PLAYING) {
            this.updateMultiplayerGame(dt, time);
        }

        this.renderer.render(this.scene, this.camera);
    }

    updateSoloGame(dt, time) {
        this.player.update(dt);
        this.shooting.update(dt);
        this.bulletTracerManager.update(dt);

        if (this.player.isDead) {
            this.gameOver();
        } else {
            const arenaResult = this.arena.update(dt, this.player.getPosition());
            if (arenaResult.hazardDamage > 0) {
                this.player.takeDamage(arenaResult.hazardDamage);
            }

            this.waveManager.update(dt);

            this.hud.updateEnemyIndicators(
                this.player.getPosition(),
                this.camera.rotation.y,
                this.waveManager.enemies
            );

            if (Math.floor(time / 100) !== Math.floor((time - dt * 1000) / 100)) {
                this.hud.updateHealth(this.player.health, this.player.maxHealth);
                this.hud.updateEnemies(this.waveManager.getAliveCount());
                this.hud.updateWave(this.waveManager.getWave());
                const elapsed = this.hud.updateTimer();
                this.score.updateSurvival(elapsed);
                this.hud.updateScore(this.score.getScore());
            }
        }
    }

    updateMultiplayerGame(dt, time) {
        // Update player
        this.player.update(dt);
        this.shooting.update(dt);
        this.bulletTracerManager.update(dt);

        // Update arena (no hazard damage in MP to keep it simple)
        this.arena.update(dt, this.player.getPosition());

        // Update multiplayer manager (remote players, network sync)
        if (this.multiplayerManager) {
            this.multiplayerManager.update(dt);

            // Update shooting targets every frame for accurate hit detection
            this.updateMultiplayerShootingTargets();

            // Update respawn timer OR hide overlay if player is alive
            if (this.multiplayerManager.isRespawning) {
                this.hud.updateRespawnTimer(this.multiplayerManager.getRespawnCountdown());
            } else if (!this.player.isDead) {
                // Make sure overlay is hidden when player is alive
                this.hud.hideRespawnOverlay();
            }
        }

        // Update HUD
        if (Math.floor(time / 100) !== Math.floor((time - dt * 1000) / 100)) {
            this.hud.updateHealth(this.player.health, this.player.maxHealth);
            this.hud.updateTimer();
        }
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // Convert slider value (1-10) to actual mouse sensitivity
    // Slider 1 = 0.0008 (very slow), Slider 5 = 0.002 (default), Slider 10 = 0.004 (very fast)
    sliderToSensitivity(sliderValue) {
        // Linear mapping: 1 -> 0.0008, 10 -> 0.004
        const minSens = 0.0008;
        const maxSens = 0.004;
        const normalized = (sliderValue - 1) / 9; // 0 to 1
        return minSens + normalized * (maxSens - minSens);
    }
}

// Start the game
window.addEventListener('DOMContentLoaded', () => {
    new Game();
});
