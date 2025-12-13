// Menu.js - Start and Game Over menu management with Settings
export class Menu {
    constructor() {
        this.elements = {
            startMenu: document.getElementById('start-menu'),
            gameOverMenu: document.getElementById('game-over-menu'),
            settingsPanel: document.getElementById('settings-panel'),
            loading: document.getElementById('loading'),
            startBtn: document.getElementById('start-btn'),
            restartBtn: document.getElementById('restart-btn'),
            settingsBtn: document.getElementById('settings-btn'),
            settingsBackBtn: document.getElementById('settings-back-btn'),
            particlesToggle: document.getElementById('particles-toggle'),
            flickerToggle: document.getElementById('flicker-toggle'),
            hitmarkerToggle: document.getElementById('hitmarker-toggle'),
            highScore: document.getElementById('high-score'),
            finalScore: document.getElementById('final-score'),
            finalTime: document.getElementById('final-time'),
            newHighScore: document.getElementById('new-high-score')
        };

        // Settings state (load from localStorage)
        this.settings = {
            particles: localStorage.getItem('fps_particles') !== 'false',
            particles: localStorage.getItem('fps_particles') !== 'false',
            flickerLights: localStorage.getItem('fps_flicker') !== 'false',
            hitmarkers: localStorage.getItem('fps_hitmarkers') !== 'false'
        };

        // Apply initial toggle states
        this.elements.particlesToggle.checked = this.settings.particles;
        this.elements.flickerToggle.checked = this.settings.flickerLights;
        this.elements.hitmarkerToggle.checked = this.settings.hitmarkers;

        // Callbacks
        this.onStart = null;
        this.onRestart = null;
        this.onSettingsChange = null;

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.elements.startBtn.addEventListener('click', () => {
            if (this.onStart) {
                this.onStart();
            }
        });

        this.elements.restartBtn.addEventListener('click', () => {
            if (this.onRestart) {
                this.onRestart();
            }
        });

        // Settings button
        this.elements.settingsBtn.addEventListener('click', () => {
            this.showSettings();
        });

        // Settings back button
        this.elements.settingsBackBtn.addEventListener('click', () => {
            this.hideSettings();
        });

        // Particles toggle
        this.elements.particlesToggle.addEventListener('change', (e) => {
            this.settings.particles = e.target.checked;
            localStorage.setItem('fps_particles', this.settings.particles);
            if (this.onSettingsChange) {
                this.onSettingsChange('particles', this.settings.particles);
            }
        });

        // Flicker lights toggle
        this.elements.flickerToggle.addEventListener('change', (e) => {
            this.settings.flickerLights = e.target.checked;
            localStorage.setItem('fps_flicker', this.settings.flickerLights);
            if (this.onSettingsChange) {
                this.onSettingsChange('flickerLights', this.settings.flickerLights);
            }
        });

        // Hitmarker toggle
        this.elements.hitmarkerToggle.addEventListener('change', (e) => {
            this.settings.hitmarkers = e.target.checked;
            localStorage.setItem('fps_hitmarkers', this.settings.hitmarkers);
            if (this.onSettingsChange) {
                this.onSettingsChange('hitmarkers', this.settings.hitmarkers);
            }
        });
    }

    showSettings() {
        this.elements.startMenu.classList.add('hidden');
        this.elements.settingsPanel.classList.remove('hidden');
    }

    hideSettings() {
        this.elements.settingsPanel.classList.add('hidden');
        this.elements.startMenu.classList.remove('hidden');
    }

    getSettings() {
        return this.settings;
    }

    hideLoading() {
        this.elements.loading.classList.add('hidden');
    }

    showStart(highScore) {
        this.elements.startMenu.classList.remove('hidden');
        this.elements.gameOverMenu.classList.add('hidden');
        this.elements.settingsPanel.classList.add('hidden');
        this.elements.highScore.textContent = `High Score: ${highScore}`;
    }

    hideStart() {
        this.elements.startMenu.classList.add('hidden');
    }

    showGameOver(score, time, isNewHighScore) {
        this.elements.startMenu.classList.add('hidden');
        this.elements.gameOverMenu.classList.remove('hidden');
        this.elements.settingsPanel.classList.add('hidden');
        this.elements.finalScore.textContent = `Score: ${score}`;
        this.elements.finalTime.textContent = `Survived: ${time}s`;

        if (isNewHighScore) {
            this.elements.newHighScore.classList.remove('hidden');
        } else {
            this.elements.newHighScore.classList.add('hidden');
        }
    }

    hideGameOver() {
        this.elements.gameOverMenu.classList.add('hidden');
    }

    hideAll() {
        this.elements.startMenu.classList.add('hidden');
        this.elements.gameOverMenu.classList.add('hidden');
        this.elements.settingsPanel.classList.add('hidden');
        this.elements.loading.classList.add('hidden');
    }
}
