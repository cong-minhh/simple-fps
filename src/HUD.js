// HUD.js - Heads-up display with screen-edge enemy indicators
import { Logger } from './utils/Logger.js';

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
            ammoCount: document.getElementById('ammo-count'),
            reloadIndicator: document.getElementById('reload-indicator'),
            reloadProgress: document.querySelector('#reload-indicator .reload-progress'),
            damageFlash: document.getElementById('damage-flash'),
            // Multiplayer elements
            scoreboard: document.getElementById('scoreboard'),
            scoreboardRows: document.getElementById('scoreboard-rows'),
            killFeed: document.getElementById('kill-feed'),
            respawnOverlay: document.getElementById('respawn-overlay'),
            respawnTimer: document.getElementById('respawn-timer'),
            respawnKillerName: document.getElementById('respawn-killer-name'),
            playerCount: document.getElementById('player-count'),
            playerCountText: document.getElementById('player-count-text'),
            // Scope overlay (sniper)
            scopeOverlay: document.getElementById('scope-overlay'),
            crosshair: document.getElementById('crosshair')
        };

        this.startTime = 0;
        this.currentScore = 0;
        this.hitmarkerTimeout = null;

        // Edge indicator settings
        this.indicatorPool = [];
        this.maxIndicators = 10;
        this.edgePadding = 50;

        this.hitmarkerEnabled = true;

        // Dynamic crosshair state
        this.crosshairSpread = 0;
        this.targetCrosshairSpread = 0;
        this.crosshairRecoverySpeed = 8;
        this.isMoving = false;
        this.isShooting = false;
        this.isAiming = false;

        // Create dynamic crosshair
        this.createDynamicCrosshair();

        // Multiplayer state
        this.isMultiplayer = false;
        this.localPlayerId = null;

        // Setup scoreboard toggle
        this.setupScoreboardListeners();

        // Dirty tracking for performance
        this._lastScoreboardHash = '';

        // Damage direction indicators pool
        this.damageIndicators = [];
        this.maxDamageIndicators = 8;
        this._createDamageIndicatorPool();
    }

    /**
     * Create damage direction indicator pool
     */
    _createDamageIndicatorPool() {
        // Add styles for damage indicators
        if (!document.getElementById('damage-indicator-styles')) {
            const style = document.createElement('style');
            style.id = 'damage-indicator-styles';
            style.textContent = `
                .damage-indicator {
                    position: fixed;
                    width: 60px;
                    height: 60px;
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.1s ease-out;
                    z-index: 950;
                }
                .damage-indicator.active {
                    opacity: 1;
                    animation: damageIndicatorPulse 0.3s ease-out;
                }
                .damage-indicator::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 0;
                    height: 0;
                    border-left: 15px solid transparent;
                    border-right: 15px solid transparent;
                    border-bottom: 40px solid rgba(255, 50, 50, 0.8);
                    filter: drop-shadow(0 0 8px rgba(255, 0, 0, 0.6));
                }
                .damage-indicator.critical::before {
                    border-bottom-color: rgba(255, 0, 0, 1);
                    filter: drop-shadow(0 0 12px rgba(255, 0, 0, 0.9));
                }
                @keyframes damageIndicatorPulse {
                    0% { transform: scale(1.2); opacity: 1; }
                    100% { transform: scale(1); opacity: 0.8; }
                }
            `;
            document.head.appendChild(style);
        }

        // Create container
        let container = document.getElementById('damage-indicators');
        if (!container) {
            container = document.createElement('div');
            container.id = 'damage-indicators';
            container.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 950;';
            document.body.appendChild(container);
        }

        // Create indicator pool
        for (let i = 0; i < this.maxDamageIndicators; i++) {
            const indicator = document.createElement('div');
            indicator.className = 'damage-indicator';
            container.appendChild(indicator);
            this.damageIndicators.push({
                element: indicator,
                active: false,
                timeout: null,
                angle: 0
            });
        }
    }

    /**
     * Show damage direction indicator
     * @param {number} damageAngle - Direction of damage in radians (relative to player facing)
     * @param {number} intensity - Damage intensity 0-1 (affects visual intensity)
     */
    showDamageDirection(damageAngle, intensity = 0.5) {
        // Find inactive indicator
        let indicator = this.damageIndicators.find(i => !i.active);
        if (!indicator) {
            // Reuse oldest active indicator
            indicator = this.damageIndicators[0];
            if (indicator.timeout) clearTimeout(indicator.timeout);
        }

        indicator.active = true;
        indicator.angle = damageAngle;

        const el = indicator.element;
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        // Position on screen edge based on angle
        const radius = Math.min(centerX, centerY) * 0.7;
        const x = centerX + Math.sin(damageAngle) * radius;
        const y = centerY - Math.cos(damageAngle) * radius;

        // Rotate to point toward center (damage source direction)
        const rotationDeg = (damageAngle * 180 / Math.PI) + 180;

        el.style.left = `${x - 30}px`;
        el.style.top = `${y - 30}px`;
        el.style.transform = `rotate(${rotationDeg}deg)`;
        el.classList.add('active');
        el.classList.toggle('critical', intensity > 0.7);

        // Fade out
        const fadeTime = 1500 + intensity * 500;
        indicator.timeout = setTimeout(() => {
            el.classList.remove('active', 'critical');
            indicator.active = false;
        }, fadeTime);
    }

    /**
     * Calculate and show damage indicator from attacker position
     * @param {THREE.Vector3} playerPos - Player position
     * @param {number} playerYaw - Player yaw angle
     * @param {THREE.Vector3} attackerPos - Attacker position
     * @param {number} damage - Damage amount for intensity
     * @param {number} maxDamage - Max damage for intensity calculation
     */
    showDamageFrom(playerPos, playerYaw, attackerPos, damage = 20, maxDamage = 100) {
        // Calculate angle from player to attacker
        const dx = attackerPos.x - playerPos.x;
        const dz = attackerPos.z - playerPos.z;
        const worldAngle = Math.atan2(dx, -dz);
        const relativeAngle = worldAngle + playerYaw;

        const intensity = Math.min(damage / maxDamage, 1);
        this.showDamageDirection(relativeAngle, intensity);
    }

    /**
     * Clear all damage indicators
     */
    clearDamageIndicators() {
        for (const indicator of this.damageIndicators) {
            if (indicator.timeout) clearTimeout(indicator.timeout);
            indicator.element.classList.remove('active', 'critical');
            indicator.active = false;
        }
    }

    /**
     * Create dynamic crosshair with 4 lines that expand/contract
     */
    createDynamicCrosshair() {
        // Replace simple dot with dynamic crosshair
        const crosshair = this.elements.crosshair;
        if (!crosshair) return;

        // Store original for reference
        crosshair.classList.add('dynamic-crosshair');
        crosshair.innerHTML = `
            <div class="crosshair-line crosshair-top"></div>
            <div class="crosshair-line crosshair-bottom"></div>
            <div class="crosshair-line crosshair-left"></div>
            <div class="crosshair-line crosshair-right"></div>
            <div class="crosshair-dot"></div>
        `;

        // Add dynamic crosshair styles if not present
        if (!document.getElementById('dynamic-crosshair-styles')) {
            const style = document.createElement('style');
            style.id = 'dynamic-crosshair-styles';
            style.textContent = `
                .dynamic-crosshair {
                    width: 40px !important;
                    height: 40px !important;
                    background: none !important;
                    border-radius: 0 !important;
                    box-shadow: none !important;
                }
                .crosshair-line {
                    position: absolute;
                    background: rgba(255, 255, 255, 0.9);
                    transition: transform 0.05s ease-out;
                }
                .crosshair-top, .crosshair-bottom {
                    width: 2px;
                    height: 8px;
                    left: 50%;
                    margin-left: -1px;
                }
                .crosshair-top { top: 0; }
                .crosshair-bottom { bottom: 0; }
                .crosshair-left, .crosshair-right {
                    width: 8px;
                    height: 2px;
                    top: 50%;
                    margin-top: -1px;
                }
                .crosshair-left { left: 0; }
                .crosshair-right { right: 0; }
                .crosshair-dot {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: 2px;
                    height: 2px;
                    background: white;
                    transform: translate(-50%, -50%);
                    border-radius: 50%;
                }
                .dynamic-crosshair.hit .crosshair-line {
                    background: #ff3333;
                }
                .dynamic-crosshair.hit .crosshair-dot {
                    background: #ff3333;
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * Update dynamic crosshair spread based on player state
     * @param {boolean} isMoving - Player is moving
     * @param {boolean} isShooting - Player just shot
     * @param {boolean} isAiming - Player is aiming down sights
     * @param {number} dt - Delta time for smooth interpolation
     */
    updateCrosshair(isMoving, isShooting, isAiming, dt = 0.016) {
        // Calculate target spread based on state
        let targetSpread = 0;

        if (isShooting) {
            targetSpread = 12; // Max spread on shooting
        } else if (isMoving && !isAiming) {
            targetSpread = 6; // Medium spread when moving
        } else if (isAiming) {
            targetSpread = 0; // Tight when aiming
        } else {
            targetSpread = 2; // Slight spread at rest
        }

        // Smooth interpolation
        this.crosshairSpread += (targetSpread - this.crosshairSpread) * this.crosshairRecoverySpeed * dt;

        // Apply spread to crosshair lines
        const crosshair = this.elements.crosshair;
        if (!crosshair) return;

        const spread = this.crosshairSpread;
        const top = crosshair.querySelector('.crosshair-top');
        const bottom = crosshair.querySelector('.crosshair-bottom');
        const left = crosshair.querySelector('.crosshair-left');
        const right = crosshair.querySelector('.crosshair-right');

        if (top) top.style.transform = `translateY(-${spread}px)`;
        if (bottom) bottom.style.transform = `translateY(${spread}px)`;
        if (left) left.style.transform = `translateX(-${spread}px)`;
        if (right) right.style.transform = `translateX(${spread}px)`;
    }

    /**
     * Flash crosshair on hit for feedback
     */
    flashCrosshairHit() {
        const crosshair = this.elements.crosshair;
        if (!crosshair) return;

        crosshair.classList.add('hit');
        setTimeout(() => {
            crosshair.classList.remove('hit');
        }, 100);
    }

    setupScoreboardListeners() {
        // Tab to show/hide scoreboard
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' && this.isMultiplayer) {
                e.preventDefault();
                this.showScoreboard();
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === 'Tab') {
                this.hideScoreboard();
            }
        });
    }

    setMultiplayerMode(enabled, localPlayerId = null) {
        this.isMultiplayer = enabled;
        this.localPlayerId = localPlayerId;

        // Show/hide multiplayer-specific elements
        if (this.elements.playerCount) {
            this.elements.playerCount.classList.toggle('hidden', !enabled);
        }

        // Hide wave-based stats in multiplayer
        if (this.elements.wave) {
            this.elements.wave.style.display = enabled ? 'none' : 'block';
        }
        if (this.elements.enemies) {
            this.elements.enemies.style.display = enabled ? 'none' : 'block';
        }
    }

    setHitmarkerEnabled(enabled) {
        this.hitmarkerEnabled = enabled;
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
        const weaponNames = ['Rifle', 'SMG', 'Shotgun', 'Pistol', 'Sniper'];
        weaponSlots.forEach((slot, index) => {
            if (weaponNames[index] === weapon.name) {
                slot.classList.add('active');
            } else {
                slot.classList.remove('active');
            }
        });
    }

    showDamageFlash() {
        const flash = this.elements.damageFlash;
        if (!flash) return;

        flash.style.opacity = '1';
        setTimeout(() => {
            flash.style.opacity = '0';
        }, 100);
    }

    showHitmarker(isHeadshot = false) {
        if (!this.hitmarkerEnabled) return;

        const hitmarker = this.elements.hitmarker;
        if (!hitmarker) return;

        if (this.hitmarkerTimeout) {
            clearTimeout(this.hitmarkerTimeout);
        }

        hitmarker.classList.remove('show', 'headshot', 'hidden');
        void hitmarker.offsetWidth;

        hitmarker.classList.add('show');
        if (isHeadshot) {
            hitmarker.classList.add('headshot');
        }

        this.hitmarkerTimeout = setTimeout(() => {
            hitmarker.classList.remove('show', 'headshot');
            hitmarker.classList.add('hidden');
        }, isHeadshot ? 250 : 150);
    }

    updateReloadIndicator(progress, isReloading) {
        const indicator = this.elements.reloadIndicator;
        const progressEl = this.elements.reloadProgress;

        if (!indicator || !progressEl) return;

        if (isReloading) {
            indicator.classList.remove('hidden');
            const percent = Math.round(progress * 100);
            progressEl.style.setProperty('--progress', `${percent}%`);
        } else {
            indicator.classList.add('hidden');
        }
    }

    // Show/hide sniper scope overlay with smooth opacity
    updateScopeOverlay(isScoped, opacity = 1) {
        const scope = this.elements.scopeOverlay;
        const crosshair = this.elements.crosshair;

        if (!scope) return;

        if (isScoped) {
            scope.classList.remove('hidden');
            scope.classList.add('active');
            scope.style.opacity = opacity;
            // Hide crosshair when scoped
            if (crosshair) crosshair.style.opacity = '0';
        } else {
            scope.classList.remove('active');
            scope.style.opacity = '0';
            // Show crosshair when not scoped
            if (crosshair) crosshair.style.opacity = '0.8';
        }
    }

    show() {
        this.elements.hud?.classList.remove('hidden');
        this.startTime = performance.now();
    }

    hide() {
        this.elements.hud?.classList.add('hidden');
    }

    updateHealth(health, maxHealth) {
        const percent = (health / maxHealth) * 100;
        if (this.elements.healthBar) {
            this.elements.healthBar.style.width = `${percent}%`;
            if (percent < 30) {
                this.elements.healthBar.style.background = '#ff3333';
            } else {
                this.elements.healthBar.style.background = '#ffffff';
            }
        }
        if (this.elements.healthText) {
            this.elements.healthText.textContent = Math.ceil(health);
        }
    }

    updateWave(wave) {
        if (this.elements.wave) {
            this.elements.wave.textContent = `Wave: ${wave}`;
        }
    }

    updateEnemies(count) {
        if (this.elements.enemies) {
            this.elements.enemies.textContent = `Enemies: ${count}`;
        }
    }

    updateTimer() {
        const elapsed = Math.floor((performance.now() - this.startTime) / 1000);
        if (this.elements.timer) {
            this.elements.timer.textContent = `Time: ${elapsed}s`;
        }
        return elapsed;
    }

    updateScore(score) {
        this.currentScore = score;
        if (this.elements.score) {
            this.elements.score.textContent = `Score: ${score}`;
        }
    }

    updateEnemyIndicators(playerPos, playerYaw, enemies) {
        const aliveEnemies = enemies.filter(e => !e.isDead);
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const centerX = screenW / 2;
        const centerY = screenH / 2;

        while (this.indicatorPool.length < Math.min(aliveEnemies.length, this.maxIndicators)) {
            const indicator = document.createElement('div');
            indicator.className = 'edge-indicator';
            this.elements.indicators?.appendChild(indicator);
            this.indicatorPool.push(indicator);
        }

        this.indicatorPool.forEach(ind => ind.style.display = 'none');

        const enemyData = aliveEnemies.map(enemy => {
            const pos = enemy.mesh.position;
            const dx = pos.x - playerPos.x;
            const dz = pos.z - playerPos.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            const worldAngle = Math.atan2(dx, -dz);
            const relativeAngle = worldAngle + playerYaw;
            return { enemy, distance, relativeAngle };
        }).sort((a, b) => a.distance - b.distance);

        const count = Math.min(enemyData.length, this.maxIndicators);

        for (let i = 0; i < count; i++) {
            const { enemy, distance, relativeAngle } = enemyData[i];
            const indicator = this.indicatorPool[i];

            const dirX = Math.sin(relativeAngle);
            const dirY = -Math.cos(relativeAngle);

            let edgeX, edgeY;
            const maxX = centerX - this.edgePadding;
            const maxY = centerY - this.edgePadding;

            const absX = Math.abs(dirX);
            const absY = Math.abs(dirY);

            if (absX * maxY > absY * maxX) {
                edgeX = centerX + Math.sign(dirX) * maxX;
                edgeY = centerY + (dirY / absX) * maxX;
            } else {
                edgeX = centerX + (dirX / absY) * maxY;
                edgeY = centerY + Math.sign(dirY) * maxY;
            }

            edgeX = Math.max(this.edgePadding, Math.min(screenW - this.edgePadding, edgeX));
            edgeY = Math.max(this.edgePadding, Math.min(screenH - this.edgePadding, edgeY));

            const rotation = (relativeAngle * 180 / Math.PI);
            const scale = Math.max(0.5, Math.min(1.2, 1.4 - distance * 0.045));

            indicator.style.display = 'block';
            indicator.style.left = `${edgeX}px`;
            indicator.style.top = `${edgeY}px`;
            indicator.style.transform = `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})`;

            indicator.className = 'edge-indicator';

            if (distance < 6) {
                indicator.classList.add('close');
            } else if (distance < 12) {
                indicator.classList.add('medium');
            } else {
                indicator.classList.add('far');
            }

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

    // =========================================
    // MULTIPLAYER HUD METHODS
    // =========================================

    updatePlayerCount(count) {
        if (this.elements.playerCountText) {
            this.elements.playerCountText.textContent = `Players: ${count}`;
        }
    }

    showScoreboard() {
        this.elements.scoreboard?.classList.remove('hidden');
    }

    hideScoreboard() {
        this.elements.scoreboard?.classList.add('hidden');
    }

    updateScoreboard(scores, localPlayerId) {
        if (!this.elements.scoreboardRows) return;

        // Create a hash of scores to detect changes (avoid unnecessary DOM updates)
        const hash = scores.map(p => `${p.id}:${p.kills}:${p.deaths}`).join('|');
        if (hash === this._lastScoreboardHash) return;
        this._lastScoreboardHash = hash;

        this.elements.scoreboardRows.innerHTML = '';

        scores.forEach(player => {
            const row = document.createElement('div');
            row.className = 'scoreboard-row';
            if (player.id === localPlayerId) {
                row.classList.add('local');
            }

            const kd = player.deaths > 0
                ? (player.kills / player.deaths).toFixed(2)
                : player.kills.toFixed(2);

            const colorHex = player.color ?
                `#${player.color.toString(16).padStart(6, '0')}` : '#ffffff';

            row.innerHTML = `
                <div class="player-name">
                    <div class="player-color" style="background-color: ${colorHex}"></div>
                    <span>${player.name}</span>
                </div>
                <div class="player-kills">${player.kills}</div>
                <div class="player-deaths">${player.deaths}</div>
                <div class="player-kd">${kd}</div>
            `;

            this.elements.scoreboardRows.appendChild(row);
        });
    }

    addKillFeedEntry(killer, victim, isHeadshot, isLocalKill, isLocalDeath) {
        if (!this.elements.killFeed) return;

        const entry = document.createElement('div');
        entry.className = 'kill-entry';
        if (isHeadshot) entry.classList.add('headshot');
        if (isLocalKill) entry.classList.add('local-kill');
        if (isLocalDeath) entry.classList.add('local-death');

        const icon = isHeadshot ? '💀' : '☠';

        entry.innerHTML = `
            <span class="killer">${killer}</span>
            <span class="kill-icon">${icon}</span>
            <span class="victim">${victim}</span>
        `;

        this.elements.killFeed.insertBefore(entry, this.elements.killFeed.firstChild);

        // Limit kill feed entries
        while (this.elements.killFeed.children.length > 5) {
            this.elements.killFeed.removeChild(this.elements.killFeed.lastChild);
        }

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (entry.parentNode) {
                entry.style.opacity = '0';
                entry.style.transform = 'translateX(100%)';
                setTimeout(() => entry.remove(), 300);
            }
        }, 5000);
    }

    clearKillFeed() {
        if (this.elements.killFeed) {
            this.elements.killFeed.innerHTML = '';
        }
    }

    showRespawnOverlay(countdown, killerName = 'Enemy') {
        Logger.debug('HUD.showRespawnOverlay called with countdown:', countdown);
        if (this.elements.respawnOverlay) {
            this.elements.respawnOverlay.classList.remove('hidden');
            this.elements.respawnOverlay.style.display = 'flex'; // Reset display
        }
        if (this.elements.respawnTimer) {
            this.elements.respawnTimer.textContent = Math.ceil(countdown);
        }
        if (this.elements.respawnKillerName) {
            this.elements.respawnKillerName.textContent = killerName;
        }
    }

    hideRespawnOverlay() {
        Logger.debug('HUD.hideRespawnOverlay called');
        if (this.elements.respawnOverlay) {
            this.elements.respawnOverlay.classList.add('hidden');
            // Also set display directly as backup
            this.elements.respawnOverlay.style.display = 'none';
            Logger.debug('Respawn overlay hidden');
        }
    }

    updateRespawnTimer(countdown) {
        if (this.elements.respawnTimer) {
            this.elements.respawnTimer.textContent = Math.ceil(countdown);
        }
    }

    reset() {
        this.startTime = performance.now();
        this.currentScore = 0;
        this.updateHealth(100, 100);
        this.updateWave(1);
        this.updateEnemies(0);
        this.updateScore(0);
        this.clearEnemyIndicators();
        this.clearKillFeed();
        this.clearDamageIndicators();
        this.hideRespawnOverlay();
        this.hideScoreboard();
    }

    resetMultiplayer() {
        this.reset();
        this.isMultiplayer = false;
        this.localPlayerId = null;
        if (this.elements.playerCount) {
            this.elements.playerCount.classList.add('hidden');
        }
    }
}
