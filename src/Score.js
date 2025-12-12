// Score.js - Scoring system with localStorage persistence
export class Score {
    constructor() {
        this.storageKey = 'vercel-fps-highscore';
        this.currentScore = 0;
        this.killPoints = 10;
        this.survivalPoints = 2;
        this.lastSurvivalCheck = 0;
    }

    reset() {
        this.currentScore = 0;
        this.lastSurvivalCheck = 0;
    }

    addKill() {
        this.currentScore += this.killPoints;
        return this.currentScore;
    }

    updateSurvival(elapsedSeconds) {
        // Add points for each new second survived
        if (elapsedSeconds > this.lastSurvivalCheck) {
            const newSeconds = elapsedSeconds - this.lastSurvivalCheck;
            this.currentScore += newSeconds * this.survivalPoints;
            this.lastSurvivalCheck = elapsedSeconds;
        }
        return this.currentScore;
    }

    getScore() {
        return this.currentScore;
    }

    getHighScore() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? parseInt(stored, 10) : 0;
        } catch (e) {
            return 0;
        }
    }

    saveHighScore() {
        const currentHigh = this.getHighScore();
        if (this.currentScore > currentHigh) {
            try {
                localStorage.setItem(this.storageKey, this.currentScore.toString());
                return true; // New high score
            } catch (e) {
                return false;
            }
        }
        return false;
    }

    isNewHighScore() {
        return this.currentScore > this.getHighScore();
    }
}
