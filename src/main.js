// main.js - Optimized game orchestrator
import * as THREE from 'three';
import { Arena } from './Arena.js';
import { Player } from './Player.js';
import { Shooting } from './Shooting.js';
import { WaveManager } from './WaveManager.js';
import { HUD } from './HUD.js';
import { Menu } from './Menu.js';
import { Score } from './Score.js';
import { Audio } from './Audio.js';

// Game states
const STATES = {
    LOADING: 0,
    MENU: 1,
    PLAYING: 2,
    GAME_OVER: 3
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

        // Connect systems
        this.waveManager.setPlayer(this.player);
        this.waveManager.setShooting(this.shooting);
        this.waveManager.initPathfinding(); // Initialize A* pathfinding

        // Set up callbacks
        this.setupCallbacks();

        // Add damage flash element
        this.createDamageFlash();

        // Handle window resize
        window.addEventListener('resize', () => this.onResize());

        // Bind animate for optimal performance
        this.animate = this.animate.bind(this);

        // Start
        this.finishLoading();
    }

    initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: false,  // Disable for performance
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(1);  // Lock to 1 for best performance
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.BasicShadowMap;  // Faster shadows
        this.renderer.setClearColor(0x1a1a2e);

        document.getElementById('game-container').appendChild(this.renderer.domElement);
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x1a1a2e, 20, 50);

        this.camera = new THREE.PerspectiveCamera(
            90,  // Wider FOV like CS:GO
            window.innerWidth / window.innerHeight,
            0.1,
            100
        );

        this.scene.add(this.camera);
    }

    initLighting() {
        // Simple ambient - no shadows
        const ambient = new THREE.AmbientLight(0x606080, 0.6);
        this.scene.add(ambient);

        // Main light with shadows
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

        // Colored lights - no shadows
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
            this.audio.playHit();
            if (killed) {
                this.waveManager.onEnemyDeath(enemy);
            }
        };

        // Player damage audio
        const origTakeDamage = this.player.takeDamage.bind(this.player);
        this.player.takeDamage = (amount) => {
            origTakeDamage(amount);
            this.audio.playPlayerHurt();
        };

        // Pointer lock
        this.player.controls.addEventListener('lock', () => {
            if (this.state === STATES.MENU) {
                this.startGame();
            }
        });
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

        this.menu.hideAll();
        this.hud.show();
        this.player.lock();
        this.waveManager.start();
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

        // Calculate delta time
        const dt = (time - this.lastTime) * 0.001;
        this.lastTime = time;

        // Skip if tab not visible or first frame
        if (dt <= 0 || dt > 0.2) {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        // Update game state
        if (this.state === STATES.PLAYING) {
            this.player.update(dt);

            if (this.player.isDead) {
                this.gameOver();
            } else {
                this.waveManager.update(dt);

                // Update HUD less frequently (every ~100ms)
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

        // Render
        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// Start the game
window.addEventListener('DOMContentLoaded', () => {
    new Game();
});
