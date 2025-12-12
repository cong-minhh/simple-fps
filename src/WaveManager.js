// WaveManager.js - Enemy wave spawning system
import { Enemy } from './Enemy.js';
import { Pathfinding } from './Pathfinding.js';

export class WaveManager {
    constructor(scene, arena) {
        this.scene = scene;
        this.arena = arena;

        // Wave settings
        this.currentWave = 1;
        this.maxEnemies = 5;
        this.spawnInterval = 8000; // 8 seconds
        this.lastSpawnTime = 0;

        // Enemy tracking
        this.enemies = [];
        this.totalKills = 0;

        // Reference
        this.player = null;
        this.shooting = null;
        this.pathfinder = null;

        // Callbacks
        this.onEnemyKilled = null;
        this.onWaveChange = null;
    }

    initPathfinding() {
        // Initialize A* pathfinding grid from arena
        this.pathfinder = new Pathfinding(this.arena, 0.5);
    }

    setPlayer(player) {
        this.player = player;
        this.enemies.forEach(e => e.setPlayer(player));
    }

    setShooting(shooting) {
        this.shooting = shooting;

        // Set up hit callback
        shooting.onHit = (enemy, damage, hitPoint) => {
            const killed = enemy.takeDamage(damage);
            if (killed) {
                this.onEnemyDeath(enemy);
            }
        };
    }

    start() {
        // Spawn initial wave
        this.spawnWave();
        this.lastSpawnTime = performance.now();
    }

    spawnWave() {
        const enemiesToSpawn = Math.min(this.currentWave, this.maxEnemies - this.getAliveCount());

        for (let i = 0; i < enemiesToSpawn; i++) {
            this.spawnEnemy();
        }

        if (this.onWaveChange) {
            this.onWaveChange(this.currentWave);
        }
    }

    spawnEnemy() {
        if (this.getAliveCount() >= this.maxEnemies) return;

        const spawnPos = this.arena.getRandomSpawnPoint();
        const enemy = new Enemy(this.scene, this.arena, spawnPos, this.pathfinder);

        if (this.player) {
            enemy.setPlayer(this.player);
        }

        this.enemies.push(enemy);
        this.updateShootingTargets();
    }

    updateShootingTargets() {
        if (this.shooting) {
            const meshes = this.enemies
                .filter(e => !e.isDead)
                .map(e => e.getMesh());
            this.shooting.setEnemyMeshes(meshes);
        }
    }

    onEnemyDeath(enemy) {
        this.totalKills++;

        // Remove from array after animation completes
        setTimeout(() => {
            const index = this.enemies.indexOf(enemy);
            if (index > -1) {
                this.enemies.splice(index, 1);
            }
            this.updateShootingTargets();
        }, 350);

        if (this.onEnemyKilled) {
            this.onEnemyKilled();
        }
    }

    update(deltaTime) {
        // Update all enemies
        this.enemies.forEach(enemy => {
            enemy.update(deltaTime);
        });

        // Check for spawning
        const currentTime = performance.now();
        if (currentTime - this.lastSpawnTime >= this.spawnInterval) {
            this.lastSpawnTime = currentTime;

            // Increase wave if fewer enemies
            if (this.getAliveCount() < this.currentWave) {
                this.spawnEnemy();
            }

            // Wave progression
            if (this.totalKills > 0 && this.totalKills % 3 === 0) {
                this.currentWave = Math.min(this.currentWave + 1, 10);
            }
        }
    }

    getAliveCount() {
        return this.enemies.filter(e => !e.isDead).length;
    }

    getWave() {
        return this.currentWave;
    }

    getTotalKills() {
        return this.totalKills;
    }

    reset() {
        // Dispose all enemies
        this.enemies.forEach(enemy => {
            if (!enemy.isDead) {
                enemy.dispose();
            }
        });

        this.enemies = [];
        this.currentWave = 1;
        this.totalKills = 0;
        this.lastSpawnTime = 0;

        this.updateShootingTargets();
    }
}
