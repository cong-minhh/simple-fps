// Menu.js - Start and Game Over menu management
export class Menu {
    constructor() {
        this.elements = {
            startMenu: document.getElementById('start-menu'),
            gameOverMenu: document.getElementById('game-over-menu'),
            loading: document.getElementById('loading'),
            startBtn: document.getElementById('start-btn'),
            restartBtn: document.getElementById('restart-btn'),
            highScore: document.getElementById('high-score'),
            finalScore: document.getElementById('final-score'),
            finalTime: document.getElementById('final-time'),
            newHighScore: document.getElementById('new-high-score')
        };

        // Callbacks
        this.onStart = null;
        this.onRestart = null;

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
    }

    hideLoading() {
        this.elements.loading.classList.add('hidden');
    }

    showStart(highScore) {
        this.elements.startMenu.classList.remove('hidden');
        this.elements.gameOverMenu.classList.add('hidden');
        this.elements.highScore.textContent = `High Score: ${highScore}`;
    }

    hideStart() {
        this.elements.startMenu.classList.add('hidden');
    }

    showGameOver(score, time, isNewHighScore) {
        this.elements.startMenu.classList.add('hidden');
        this.elements.gameOverMenu.classList.remove('hidden');
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
        this.elements.loading.classList.add('hidden');
    }
}
