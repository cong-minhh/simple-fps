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
            // Team score elements (will be created dynamically)
            teamScoreDisplay: null
        };

        this.startTime = 0;
        this.currentScore = 0;
        this.hitmarkerTimeout = null;

        // Edge indicator settings
        this.indicatorPool = [];
        this.maxIndicators = 10;
        this.edgePadding = 50;

        this.hitmarkerEnabled = true;

        // Multiplayer state
        this.isMultiplayer = false;
        this.localPlayerId = null;
        this.gameMode = null;
        this.localPlayerTeam = null;

        // Setup scoreboard toggle
        this.setupScoreboardListeners();

        // Create team score display element
        this.createTeamScoreDisplay();
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

    createTeamScoreDisplay() {
        // Create a container for team scores at top center
        const container = document.createElement('div');
        container.id = 'team-score-display';
        container.className = 'hidden';
        container.innerHTML = `
            <div class="team-score alpha">
                <span class="team-label">ALPHA</span>
                <span class="team-score-value" id="alpha-score">0</span>
            </div>
            <div class="team-divider">VS</div>
            <div class="team-score bravo">
                <span class="team-label">BRAVO</span>
                <span class="team-score-value" id="bravo-score">0</span>
            </div>
        `;
        document.body.appendChild(container);
        this.elements.teamScoreDisplay = container;
        this.elements.alphaScore = document.getElementById('alpha-score');
        this.elements.bravoScore = document.getElementById('bravo-score');
    }

    setMultiplayerMode(enabled, localPlayerId = null, gameMode = null, localPlayerTeam = null) {
        this.isMultiplayer = enabled;
        this.localPlayerId = localPlayerId;
        this.gameMode = gameMode;
        this.localPlayerTeam = localPlayerTeam;

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

        // Show team score display in team modes
        const isTeamMode = gameMode === 'team_deathmatch';
        if (this.elements.teamScoreDisplay) {
            this.elements.teamScoreDisplay.classList.toggle('hidden', !enabled || !isTeamMode);
        }

        // Highlight local player's team
        if (localPlayerTeam && this.elements.teamScoreDisplay) {
            const alphaEl = this.elements.teamScoreDisplay.querySelector('.team-score.alpha');
            const bravoEl = this.elements.teamScoreDisplay.querySelector('.team-score.bravo');
            if (alphaEl) alphaEl.classList.toggle('local-team', localPlayerTeam === 'alpha');
            if (bravoEl) bravoEl.classList.toggle('local-team', localPlayerTeam === 'bravo');
        }
    }

    updateTeamScores(teamScores) {
        if (this.elements.alphaScore && teamScores.alpha !== undefined) {
            this.elements.alphaScore.textContent = teamScores.alpha;
        }
        if (this.elements.bravoScore && teamScores.bravo !== undefined) {
            this.elements.bravoScore.textContent = teamScores.bravo;
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
        const weaponNames = ['Rifle', 'SMG', 'Shotgun', 'Pistol'];
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
        console.log('HUD.showRespawnOverlay called with countdown:', countdown);
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
        console.log('HUD.hideRespawnOverlay called');
        if (this.elements.respawnOverlay) {
            this.elements.respawnOverlay.classList.add('hidden');
            // Also set display directly as backup
            this.elements.respawnOverlay.style.display = 'none';
            console.log('Respawn overlay hidden');
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
