// main.js - Game orchestrator
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
    LOADING: 'LOADING',
    MENU: 'MENU',
    PLAYING: 'PLAYING',
    GAME_OVER: 'GAME_OVER'
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

        // Set up callbacks
        this.setupCallbacks();

        // Add damage flash element
        this.createDamageFlash();

        // Handle window resize
        window.addEventListener('resize', () => this.onResize());

        // Start loading
        this.finishLoading();
    }

    initRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setClearColor(0x1a1a2e);

        document.getElementById('game-container').appendChild(this.renderer.domElement);
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x1a1a2e, 15, 40);

        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            100
        );

        // Add camera to scene so gun model is visible
        this.scene.add(this.camera);
    }

    initLighting() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0x404060, 0.4);
        this.scene.add(ambient);

        // Main directional light
        const directional = new THREE.DirectionalLight(0xffffff, 0.8);
        directional.position.set(10, 20, 10);
        directional.castShadow = true;
        directional.shadow.mapSize.width = 1024;
        directional.shadow.mapSize.height = 1024;
        directional.shadow.camera.near = 0.5;
        directional.shadow.camera.far = 50;
        directional.shadow.camera.left = -15;
        directional.shadow.camera.right = 15;
        directional.shadow.camera.top = 15;
        directional.shadow.camera.bottom = -15;
        this.scene.add(directional);

        // Colored accent lights
        const redLight = new THREE.PointLight(0xff4444, 0.5, 20);
        redLight.position.set(-8, 5, -8);
        this.scene.add(redLight);

        const blueLight = new THREE.PointLight(0x4444ff, 0.5, 20);
        blueLight.position.set(8, 5, 8);
        this.scene.add(blueLight);

        const greenLight = new THREE.PointLight(0x00ff88, 0.3, 15);
        greenLight.position.set(0, 3, 0);
        this.scene.add(greenLight);
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
        // Menu callbacks
        this.menu.onStart = () => this.startGame();
        this.menu.onRestart = () => this.restartGame();

        // Wave manager callbacks
        this.waveManager.onEnemyKilled = () => {
            this.score.addKill();
            this.audio.playEnemyDeath();
        };

        this.waveManager.onWaveChange = (wave) => {
            this.hud.updateWave(wave);
        };

        // Shooting callbacks
        this.shooting.onShoot = () => {
            this.audio.playGunshot();
        };

        this.shooting.onHit = (enemy, damage, hitPoint) => {
            const killed = enemy.takeDamage(damage);
            this.audio.playHit();
            if (killed) {
                this.waveManager.onEnemyDeath(enemy);
            }
        };

        // Track player damage for audio
        const originalTakeDamage = this.player.takeDamage.bind(this.player);
        this.player.takeDamage = (amount) => {
            originalTakeDamage(amount);
            this.audio.playPlayerHurt();
        };

        // Pointer lock handling
        this.player.controls.addEventListener('lock', () => {
            if (this.state === STATES.MENU) {
                this.startGame();
            }
        });

        this.player.controls.addEventListener('unlock', () => {
            if (this.state === STATES.PLAYING && !this.player.isDead) {
                // Paused - could show pause menu
            }
        });
    }

    finishLoading() {
        // Hide loading, show menu
        this.menu.hideLoading();
        this.menu.showStart(this.score.getHighScore());
        this.state = STATES.MENU;

        // Start animation loop
        this.animate(0);
    }

    startGame() {
        if (this.state === STATES.PLAYING) return;

        this.state = STATES.PLAYING;

        // Initialize audio on first interaction
        this.audio.init();

        // Reset systems
        this.player.reset();
        this.waveManager.reset();
        this.score.reset();
        this.hud.reset();
        this.shooting.reset();

        // Update UI
        this.menu.hideAll();
        this.hud.show();

        // Lock pointer
        this.player.lock();

        // Start spawning
        this.waveManager.start();
    }

    restartGame() {
        this.startGame();
    }

    gameOver() {
        this.state = STATES.GAME_OVER;

        const finalScore = this.score.getScore();
        const finalTime = this.hud.getElapsedSeconds();
        const isNewHigh = this.score.isNewHighScore();

        if (isNewHigh) {
            this.score.saveHighScore();
        }

        this.hud.hide();
        this.menu.showGameOver(finalScore, finalTime, isNewHigh);
    }

    update(deltaTime) {
        if (this.state !== STATES.PLAYING) return;

        // Update player
        this.player.update(deltaTime);

        // Check for death
        if (this.player.isDead) {
            this.gameOver();
            return;
        }

        // Update enemies
        this.waveManager.update(deltaTime);

        // Update HUD
        this.hud.updateHealth(this.player.health, this.player.maxHealth);
        this.hud.updateEnemies(this.waveManager.getAliveCount());
        this.hud.updateWave(this.waveManager.getWave());

        const elapsed = this.hud.updateTimer();
        this.score.updateSurvival(elapsed);
        this.hud.updateScore(this.score.getScore());
    }

    animate(currentTime) {
        requestAnimationFrame((t) => this.animate(t));

        const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
        this.lastTime = currentTime;

        this.update(deltaTime);
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
