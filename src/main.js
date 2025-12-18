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
import { Logger, PerformanceMonitor } from './utils/index.js';
import { CameraEffects, SHAKE_PRESETS } from './CameraEffects.js';
import { PostProcessing } from './PostProcessing.js';
import { KillStreakManager } from './KillStreakManager.js';
import { ParticleSystem } from './ParticleSystem.js';
import { DeathCamera } from './DeathCamera.js';
import { WeaponPickupManager } from './WeaponPickup.js';
// New systems
import { SpatialAudio } from './SpatialAudio.js';
import { DeathAnimationManager } from './DeathAnimation.js';
import { DynamicMapManager } from './DynamicMapElements.js';
import { SpectatorMode } from './SpectatorMode.js';

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
        this.shooting.setCanvas(this.renderer.domElement); // For Chrome wheel events

        // Initialize bullet tracer system for visual feedback
        this.bulletTracerManager = new BulletTracerManager(this.scene, this.camera);
        this.shooting.setBulletTracerManager(this.bulletTracerManager);

        // Initialize enhanced systems
        this.cameraEffects = new CameraEffects(this.camera);
        this.postProcessing = new PostProcessing(this.renderer, this.scene, this.camera);
        this.killStreakManager = new KillStreakManager();
        this.particleSystem = new ParticleSystem(this.scene);
        this.deathCamera = new DeathCamera(this.camera, this.scene);

        // Weapon pickup system
        this.weaponPickupManager = new WeaponPickupManager(this.scene);
        this.weaponPickupManager.onWeaponCollected = (weaponType) => {
            this.shooting.switchWeapon(weaponType);
            this.audio.playPickup?.(); // Play pickup sound if available
            Logger.debug('Picked up weapon:', weaponType);
        };

        // New enhanced systems
        this.spatialAudio = new SpatialAudio();
        this.deathAnimations = new DeathAnimationManager(this.scene);
        this.dynamicMap = new DynamicMapManager(this.scene);
        this.spectatorMode = new SpectatorMode(this.camera, this.scene);


        // Connect camera effects to shooting
        this.shooting.cameraEffects = this.cameraEffects;

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
        // Ambient light - slightly blue for atmospheric feel
        const ambient = new THREE.AmbientLight(0x606080, 0.5);
        this.scene.add(ambient);

        // Main directional light with enhanced shadows
        const directional = new THREE.DirectionalLight(0xffeedd, 0.9);
        directional.position.set(15, 25, 10);
        directional.castShadow = true;

        // Higher quality shadow map
        directional.shadow.mapSize.width = 1024;
        directional.shadow.mapSize.height = 1024;
        directional.shadow.camera.near = 1;
        directional.shadow.camera.far = 60;
        directional.shadow.camera.left = -20;
        directional.shadow.camera.right = 20;
        directional.shadow.camera.top = 20;
        directional.shadow.camera.bottom = -20;
        directional.shadow.bias = -0.0005;
        directional.shadow.normalBias = 0.02;
        this.scene.add(directional);
        this.mainLight = directional;

        // Accent lights for atmosphere
        const redLight = new THREE.PointLight(0xff4444, 0.5, 25);
        redLight.position.set(-8, 4, -8);
        redLight.castShadow = true;
        redLight.shadow.mapSize.width = 256;
        redLight.shadow.mapSize.height = 256;
        this.scene.add(redLight);

        const blueLight = new THREE.PointLight(0x4444ff, 0.5, 25);
        blueLight.position.set(8, 4, 8);
        blueLight.castShadow = true;
        blueLight.shadow.mapSize.width = 256;
        blueLight.shadow.mapSize.height = 256;
        this.scene.add(blueLight);

        // Fill light from below for dramatic effect
        const fillLight = new THREE.HemisphereLight(0x444488, 0x222211, 0.3);
        this.scene.add(fillLight);

        // Rim light for player visibility
        const rimLight = new THREE.SpotLight(0xffffff, 0.3);
        rimLight.position.set(0, 15, 0);
        rimLight.angle = Math.PI / 4;
        rimLight.penumbra = 0.5;
        rimLight.decay = 2;
        rimLight.distance = 50;
        this.scene.add(rimLight);
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
            // Register kill for streak tracking
            const streakResult = this.killStreakManager.registerKill();
            if (streakResult) {
                Logger.debug('Kill streak:', streakResult.name);
            }
        };

        this.waveManager.onWaveChange = (wave) => {
            this.hud.updateWave(wave);
        };

        this.shooting.onShoot = () => {
            this.audio.playGunshot();
            // Add screen shake based on weapon
            const weaponKey = this.shooting.currentWeaponKey;
            if (weaponKey === 'SHOTGUN') {
                this.cameraEffects.applyPreset(SHAKE_PRESETS.SHOTGUN_FIRE);
            } else if (weaponKey === 'SNIPER') {
                this.cameraEffects.applyPreset(SHAKE_PRESETS.SNIPER_FIRE);
            } else {
                this.cameraEffects.applyPreset(SHAKE_PRESETS.WEAPON_FIRE);
            }
        };

        this.shooting.onHit = (enemy, damage, hitPoint, isHeadshot) => {
            const killed = enemy.takeDamage(damage);
            this.hud.showHitmarker(isHeadshot);
            // Play hit confirmation sound
            if (killed) {
                this.audio.playHitConfirmation('kill');
                this.waveManager.onEnemyDeath(enemy);

                // Trigger death animation
                const enemyPos = enemy.getPosition();
                const deathDir = enemyPos.clone().sub(this.player.getPosition()).normalize();
                this.deathAnimations.triggerDeath(enemy.mesh, enemyPos, deathDir, 'enemy');
            } else {
                this.audio.playHitConfirmation(isHeadshot ? 'headshot' : 'body');
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

        // Player damage audio & visual with damage direction
        const origTakeDamage = this.player.takeDamage.bind(this.player);
        this.player.takeDamage = (amount, attackerPos = null) => {
            origTakeDamage(amount);
            this.audio.playPlayerHurt();
            this.hud.showDamageFlash();
            // Add screen shake and post-processing damage effect
            const damageRatio = amount / this.player.maxHealth;
            if (damageRatio > 0.3) {
                this.cameraEffects.applyPreset(SHAKE_PRESETS.DAMAGE_HEAVY);
            } else {
                this.cameraEffects.applyPreset(SHAKE_PRESETS.DAMAGE_LIGHT);
            }
            this.postProcessing.triggerDamageEffect(damageRatio);

            // Show damage direction indicator if attacker position known
            if (attackerPos) {
                this.hud.showDamageFrom(
                    this.player.getPosition(),
                    this.camera.rotation.y,
                    attackerPos,
                    amount
                );
            }
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
                        Logger.debug('Adding existing player:', playerData.name);
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
                Logger.error('Connection failed:', error);
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
            Logger.info('Multiplayer game starting!', config);
            this.startMultiplayerGame();
        };

        // Game end
        this.multiplayerManager.onGameEnd = (data) => {
            Logger.info('Multiplayer game ended!', data);
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
                // Play kill confirmation sound when local player gets a kill
                if (latest.isLocalKiller) {
                    this.audio.playHitConfirmation('kill');
                }
            }
        };

        // Respawn
        this.multiplayerManager.onRespawnStart = (countdown, killerData) => {
            this.hud.showRespawnOverlay(countdown, killerData?.name);
            // Start death camera if we have killer data
            if (killerData && killerData.position) {
                this.deathCamera.start(this.player.getPosition(), killerData);
            }
            // Start spectator mode with remote players
            const remotePlayers = Array.from(this.multiplayerManager.remotePlayers.values());
            if (remotePlayers.length > 0) {
                this.spectatorMode.start(remotePlayers);
            }
        };

        this.multiplayerManager.onRespawnEnd = () => {
            this.hud.hideRespawnOverlay();
            this.deathCamera.stop();
            this.spectatorMode.stop();
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

        // Spatial audio for remote gunshots
        this.multiplayerManager.onRemoteShoot = (position, weaponType) => {
            this.spatialAudio.playRemoteGunshot(position, weaponType);
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

        // Spawn weapon pickups
        this.weaponPickupManager.clear();
        this.weaponPickupManager.spawnDefaultPickups();

        // Initialize spatial audio
        this.spatialAudio.init();

        // Create dynamic map elements
        this.dynamicMap.clear();
        this.dynamicMap.createDefaults();

        // Clear any death animations
        this.deathAnimations.clear();

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
                // Play hit confirmation sound (kill sound is played when kill is confirmed by server)
                this.audio.playHitConfirmation(isHeadshot ? 'headshot' : 'body');
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
            this.postProcessing.render();
            return;
        }

        // Update performance monitor
        PerformanceMonitor.update(dt, this.renderer);

        // Update camera effects
        this.cameraEffects.update(dt);

        // Update post-processing effects
        this.postProcessing.update(dt);

        // Update particle system
        this.particleSystem.update(dt);

        // Update based on game state
        if (this.state === STATES.PLAYING) {
            this.updateSoloGame(dt, time);
        } else if (this.state === STATES.MULTIPLAYER_PLAYING) {
            this.updateMultiplayerGame(dt, time);
        }

        // Render with post-processing
        this.postProcessing.render();
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

            // Update LOD system
            this.arena.updateLOD(this.camera.position, this.camera);

            // Update weapon pickups
            this.weaponPickupManager.update(dt, this.player.getPosition());

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

            // Update new systems
            const playerPos = this.player.getPosition();
            this.dynamicMap.update(dt, playerPos);
            this.deathAnimations.update(dt);
            this.spatialAudio.updateListener(this.camera);
        }
    }

    updateMultiplayerGame(dt, time) {
        // Update death camera first (takes over camera control when active)
        if (this.deathCamera.isPlaying()) {
            this.deathCamera.update(dt);
        }

        // Update player
        this.player.update(dt);
        this.shooting.update(dt);
        this.bulletTracerManager.update(dt);

        // Update arena (no hazard damage in MP to keep it simple)
        this.arena.update(dt, this.player.getPosition());

        // Update LOD system
        this.arena.updateLOD(this.camera.position, this.camera);

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
        // Update post-processing resolution
        this.postProcessing.resize(window.innerWidth, window.innerHeight);
    }

    // Convert slider value (1-10) to actual mouse sensitivity
    // Slider 1 = 0.001 (very slow), Slider 5 = 0.003 (default), Slider 10 = 0.01 (very fast)
    // Higher max for Firefox which reports smaller movement values
    sliderToSensitivity(sliderValue) {
        const minSens = 0.001;
        const maxSens = 0.01; // Increased for Firefox compatibility
        const normalized = (sliderValue - 1) / 9; // 0 to 1
        return minSens + normalized * (maxSens - minSens);
    }
}

// Start the game
window.addEventListener('DOMContentLoaded', () => {
    new Game();
});
