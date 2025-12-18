// WaveManager.js - Enhanced wave spawning with variety and fast pacing
import { Enemy, ENEMY_TYPES } from './Enemy.js';
import { Pathfinding } from './Pathfinding.js';
import { EnemyProjectileManager } from './EnemyProjectile.js';
import { WAVES, WAVE_CONFIG } from './config/GameConfig.js';

export class WaveManager {
    constructor(scene, arena) {
        this.scene = scene;
        this.arena = arena;

        // Wave settings - use centralized config
        this.currentWave = 1;
        this.maxEnemies = WAVE_CONFIG.MAX_ENEMIES;
        this.baseSpawnInterval = WAVE_CONFIG.BASE_SPAWN_INTERVAL;
        this.minSpawnInterval = WAVE_CONFIG.MIN_SPAWN_INTERVAL;
        this.lastSpawnTime = 0;
        this.waveStartTime = 0;

        // Wave state
        this.waveEnemyQueue = []; // Enemies yet to spawn this wave
        this.spawnDelay = WAVE_CONFIG.SPAWN_DELAY_BETWEEN;
        this.lastIndividualSpawn = 0;
        this.waveCompleted = false;
        this.waveCooldown = 2000; // Brief pause between waves

        // Enemy tracking
        this.enemies = [];
        this.totalKills = 0;

        // Reference
        this.player = null;
        this.shooting = null;
        this.pathfinder = null;
        this.projectileManager = null; // Enemy projectile system

        // Callbacks
        this.onEnemyKilled = null;
        this.onWaveChange = null;
    }

    initPathfinding() {
        this.pathfinder = new Pathfinding(this.arena, 0.5);
    }

    initProjectiles(scene) {
        this.projectileManager = new EnemyProjectileManager(scene);
    }

    setPlayer(player) {
        this.player = player;
        this.enemies.forEach(e => e.setPlayer(player));
    }

    setShooting(shooting) {
        this.shooting = shooting;

        shooting.onHit = (enemy, damage, hitPoint) => {
            const killed = enemy.takeDamage(damage);
            if (killed) {
                this.onEnemyDeath(enemy);
            }
        };
    }

    start() {
        this.startWave(1);
        this.waveStartTime = performance.now();
    }

    startWave(waveNum) {
        this.currentWave = Math.min(waveNum, WAVES.length);
        const config = WAVES[this.currentWave - 1];

        // Queue all enemies for this wave
        this.waveEnemyQueue = [...config.enemies];
        this.spawnDelay = config.spawnDelay;
        this.waveCompleted = false;
        this.lastIndividualSpawn = 0;

        if (this.onWaveChange) {
            this.onWaveChange(this.currentWave);
        }
    }

    spawnEnemy(type = 'NORMAL') {
        if (this.getAliveCount() >= this.maxEnemies) return false;

        // Use strategic spawn - prefer spawns far from player
        const playerPos = this.player ? this.player.position : null;
        const spawnPos = this.arena.getSpawnPointWithMinDistance(playerPos, 8);
        const enemy = new Enemy(this.scene, this.arena, spawnPos, this.pathfinder, type);

        if (this.player) {
            enemy.setPlayer(this.player);
        }

        // Connect projectile manager for ranged enemies
        if (this.projectileManager) {
            enemy.setProjectileManager(this.projectileManager);
        }

        this.enemies.push(enemy);
        this.updateShootingTargets();
        return true;
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
        const currentTime = performance.now();
        const aliveEnemies = this.enemies.filter(e => !e.isDead);

        // Update all enemies
        this.enemies.forEach(enemy => {
            enemy.update(deltaTime);
        });

        // Group spread - push enemies apart if too close (prevents clustering)
        const spreadRadius = 1.5;
        const spreadRadiusSq = spreadRadius * spreadRadius;
        const spreadForce = 2;

        for (let i = 0; i < aliveEnemies.length; i++) {
            const a = aliveEnemies[i];
            const posA = a.mesh.position;

            for (let j = i + 1; j < aliveEnemies.length; j++) {
                const b = aliveEnemies[j];
                const posB = b.mesh.position;

                const dx = posA.x - posB.x;
                const dz = posA.z - posB.z;
                const distSq = dx * dx + dz * dz;

                if (distSq < spreadRadiusSq && distSq > 0.01) {
                    const dist = Math.sqrt(distSq);
                    const overlap = spreadRadius - dist;
                    const pushX = (dx / dist) * overlap * spreadForce * deltaTime;
                    const pushZ = (dz / dist) * overlap * spreadForce * deltaTime;

                    // Push both enemies apart
                    posA.x += pushX * 0.5;
                    posA.z += pushZ * 0.5;
                    posB.x -= pushX * 0.5;
                    posB.z -= pushZ * 0.5;
                }
            }
        }

        // Update enemy projectiles
        if (this.projectileManager) {
            this.projectileManager.update(deltaTime);
        }

        // Spawn queued enemies with delay
        if (this.waveEnemyQueue.length > 0) {
            if (currentTime - this.lastIndividualSpawn >= this.spawnDelay) {
                const type = this.waveEnemyQueue.shift();
                if (this.spawnEnemy(type)) {
                    this.lastIndividualSpawn = currentTime;
                } else {
                    // Couldn't spawn (max enemies), put back in queue
                    this.waveEnemyQueue.unshift(type);
                }
            }
        } else if (!this.waveCompleted && this.getAliveCount() === 0) {
            // All enemies dead and queue empty - wave complete!
            this.waveCompleted = true;
            this.waveStartTime = currentTime;
        }

        // Start next wave after cooldown
        if (this.waveCompleted && currentTime - this.waveStartTime >= this.waveCooldown) {
            if (this.currentWave < WAVES.length) {
                this.startWave(this.currentWave + 1);
            } else {
                // Endless mode: repeat last wave with scaling
                this.startEndlessWave();
            }
        }

        // Continuous reinforcement if enemies spawn faster than they die
        if (this.waveEnemyQueue.length === 0 && !this.waveCompleted) {
            // Add reinforcements every spawn interval if below target count
            const targetCount = Math.min(this.currentWave + 2, this.maxEnemies);
            if (this.getAliveCount() < targetCount && currentTime - this.lastSpawnTime >= this.baseSpawnInterval) {
                this.spawnRandomEnemy();
                this.lastSpawnTime = currentTime;
            }
        }
    }

    startEndlessWave() {
        // Generate random enemy composition for endless mode
        const enemyCount = Math.min(8 + Math.floor(this.totalKills / 20), this.maxEnemies);
        const types = Object.keys(ENEMY_TYPES);

        this.waveEnemyQueue = [];
        for (let i = 0; i < enemyCount; i++) {
            const type = types[Math.floor(Math.random() * types.length)];
            this.waveEnemyQueue.push(type);
        }

        this.spawnDelay = Math.max(100, 200 - Math.floor(this.totalKills / 10));
        this.waveCompleted = false;
        this.currentWave++;

        if (this.onWaveChange) {
            this.onWaveChange(this.currentWave);
        }
    }

    spawnRandomEnemy() {
        const wave = this.currentWave;
        let type = 'NORMAL';

        // Higher waves = more variety
        const roll = Math.random();
        if (wave >= 3 && roll < 0.3) type = 'RUNNER';
        if (wave >= 4 && roll < 0.15) type = 'TANK';
        if (wave >= 6 && roll < 0.2) type = 'BERSERKER';

        this.spawnEnemy(type);
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
        this.enemies.forEach(enemy => {
            if (!enemy.isDead) {
                enemy.dispose();
            }
        });

        this.enemies = [];
        this.waveEnemyQueue = [];
        this.currentWave = 1;
        this.totalKills = 0;
        this.lastSpawnTime = 0;
        this.waveCompleted = false;

        this.updateShootingTargets();
    }
}
