// HUD.js - Heads-up display management
export class HUD {
    constructor() {
        this.elements = {
            hud: document.getElementById('hud'),
            healthBar: document.getElementById('health-bar'),
            healthText: document.getElementById('health-text'),
            wave: document.getElementById('wave'),
            enemies: document.getElementById('enemies'),
            timer: document.getElementById('timer'),
            score: document.getElementById('score')
        };

        this.startTime = 0;
        this.currentScore = 0;
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

        // Change color based on health
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
    }
}
