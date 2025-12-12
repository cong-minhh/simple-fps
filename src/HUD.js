// HUD.js - Heads-up display with screen-edge enemy indicators
export class HUD {
    constructor() {
        this.elements = {
            hud: document.getElementById('hud'),
            healthBar: document.getElementById('health-bar'),
            healthText: document.getElementById('health-text'),
            wave: document.getElementById('wave'),
            enemies: document.getElementById('enemies'),
            timer: document.getElementById('timer'),
            score: document.getElementById('score'),
            indicators: document.getElementById('enemy-indicators'),
            hitmarker: document.getElementById('hitmarker'),
            weaponName: document.getElementById('weapon-name'),
            ammoCount: document.getElementById('ammo-count')
        };

        this.startTime = 0;
        this.currentScore = 0;
        this.hitmarkerTimeout = null;

        // Edge indicator settings
        this.indicatorPool = [];
        this.maxIndicators = 10;
        this.edgePadding = 50; // Distance from screen edge
    }

    updateWeapon(weapon, ammo, isReloading = false) {
        if (this.elements.weaponName) {
            this.elements.weaponName.textContent = weapon.name;
        }
        if (this.elements.ammoCount) {
            if (isReloading) {
                this.elements.ammoCount.textContent = 'RELOADING...';
                this.elements.ammoCount.className = 'reloading';
            } else {
                this.elements.ammoCount.textContent = `${ammo} / ${weapon.magazineSize}`;
                this.elements.ammoCount.className = ammo <= weapon.magazineSize * 0.3 ? 'low' : '';
            }
        }

        // Update weapon selector highlight
        const weaponSlots = document.querySelectorAll('.weapon-slot');
        const weaponNames = ['Rifle', 'SMG', 'Shotgun', 'Pistol'];
        weaponSlots.forEach((slot, index) => {
            if (weaponNames[index] === weapon.name) {
                slot.classList.add('active');
            } else {
                slot.classList.remove('active');
            }
        });
    }

    /**
     * Show hitmarker when hitting an enemy
     * @param {boolean} isHeadshot - Whether this was a headshot
     */
    showHitmarker(isHeadshot = false) {
        const hitmarker = this.elements.hitmarker;

        // Clear any existing timeout
        if (this.hitmarkerTimeout) {
            clearTimeout(this.hitmarkerTimeout);
        }

        // Reset classes
        hitmarker.classList.remove('show', 'headshot', 'hidden');

        // Force reflow for animation restart
        void hitmarker.offsetWidth;

        // Add appropriate classes
        hitmarker.classList.add('show');
        if (isHeadshot) {
            hitmarker.classList.add('headshot');
        }

        // Hide after animation
        this.hitmarkerTimeout = setTimeout(() => {
            hitmarker.classList.remove('show', 'headshot');
            hitmarker.classList.add('hidden');
        }, isHeadshot ? 250 : 150);
    }

    show() {
        this.elements.hud.classList.remove('hidden');
        this.startTime = performance.now();
    }

    hide() {
        this.elements.hud.classList.add('hidden');
    }

    updateHealth(health, maxHealth) {
        const percent = (health / maxHealth) * 100;
        this.elements.healthBar.style.width = `${percent}%`;
        this.elements.healthText.textContent = Math.ceil(health);

        if (percent < 30) {
            this.elements.healthBar.style.background = 'linear-gradient(90deg, #ff0000, #ff3333)';
        } else if (percent < 60) {
            this.elements.healthBar.style.background = 'linear-gradient(90deg, #ff6600, #ff9933)';
        } else {
            this.elements.healthBar.style.background = 'linear-gradient(90deg, #ff4444, #ff6666)';
        }
    }

    updateWave(wave) {
        this.elements.wave.textContent = `Wave: ${wave}`;
    }

    updateEnemies(count) {
        this.elements.enemies.textContent = `Enemies: ${count}`;
    }

    updateTimer() {
        const elapsed = Math.floor((performance.now() - this.startTime) / 1000);
        this.elements.timer.textContent = `Time: ${elapsed}s`;
        return elapsed;
    }

    updateScore(score) {
        this.currentScore = score;
        this.elements.score.textContent = `Score: ${score}`;
    }

    /**
     * Update screen-edge enemy indicators
     */
    updateEnemyIndicators(playerPos, playerYaw, enemies) {
        const aliveEnemies = enemies.filter(e => !e.isDead);
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const centerX = screenW / 2;
        const centerY = screenH / 2;

        // Ensure we have enough indicators
        while (this.indicatorPool.length < Math.min(aliveEnemies.length, this.maxIndicators)) {
            const indicator = document.createElement('div');
            indicator.className = 'edge-indicator';
            this.elements.indicators.appendChild(indicator);
            this.indicatorPool.push(indicator);
        }

        // Hide all first
        this.indicatorPool.forEach(ind => ind.style.display = 'none');

        // Sort by distance
        const enemyData = aliveEnemies.map(enemy => {
            const pos = enemy.mesh.position;
            const dx = pos.x - playerPos.x;
            const dz = pos.z - playerPos.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            // Calculate angle relative to player view
            const worldAngle = Math.atan2(dx, -dz);
            const relativeAngle = worldAngle + playerYaw;

            return { enemy, distance, relativeAngle };
        }).sort((a, b) => a.distance - b.distance);

        const count = Math.min(enemyData.length, this.maxIndicators);

        for (let i = 0; i < count; i++) {
            const { enemy, distance, relativeAngle } = enemyData[i];
            const indicator = this.indicatorPool[i];

            // Calculate direction from center of screen
            const dirX = Math.sin(relativeAngle);
            const dirY = -Math.cos(relativeAngle);

            // Find intersection with screen edge
            let edgeX, edgeY;
            const maxX = centerX - this.edgePadding;
            const maxY = centerY - this.edgePadding;

            // Calculate where the line from center intersects screen edge
            const absX = Math.abs(dirX);
            const absY = Math.abs(dirY);

            if (absX * maxY > absY * maxX) {
                // Hits left or right edge
                edgeX = centerX + Math.sign(dirX) * maxX;
                edgeY = centerY + (dirY / absX) * maxX;
            } else {
                // Hits top or bottom edge
                edgeX = centerX + (dirX / absY) * maxY;
                edgeY = centerY + Math.sign(dirY) * maxY;
            }

            // Clamp to screen bounds
            edgeX = Math.max(this.edgePadding, Math.min(screenW - this.edgePadding, edgeX));
            edgeY = Math.max(this.edgePadding, Math.min(screenH - this.edgePadding, edgeY));

            // Rotation to point toward enemy (arrow points in direction)
            const rotation = (relativeAngle * 180 / Math.PI);

            // Scale based on distance (closer = bigger)
            // Range: 1.2 at distance 0, down to 0.5 at distance 20+
            const scale = Math.max(0.5, Math.min(1.2, 1.4 - distance * 0.045));

            // Show and position
            indicator.style.display = 'block';
            indicator.style.left = `${edgeX}px`;
            indicator.style.top = `${edgeY}px`;
            indicator.style.transform = `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})`;

            // Reset classes
            indicator.className = 'edge-indicator';

            // Distance class
            if (distance < 6) {
                indicator.classList.add('close');
            } else if (distance < 12) {
                indicator.classList.add('medium');
            } else {
                indicator.classList.add('far');
            }

            // Type class
            if (enemy.type === 'RUNNER') {
                indicator.classList.add('runner');
            } else if (enemy.type === 'TANK') {
                indicator.classList.add('tank');
            } else if (enemy.type === 'BERSERKER') {
                indicator.classList.add('berserker');
            }
        }
    }

    clearEnemyIndicators() {
        this.indicatorPool.forEach(ind => ind.style.display = 'none');
    }

    getElapsedSeconds() {
        return Math.floor((performance.now() - this.startTime) / 1000);
    }

    reset() {
        this.startTime = performance.now();
        this.currentScore = 0;
        this.updateHealth(100, 100);
        this.updateWave(1);
        this.updateEnemies(0);
        this.updateScore(0);
        this.clearEnemyIndicators();
    }
}
