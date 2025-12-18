// KillStreakManager.js - Kill streak tracking and announcements
// Tracks consecutive kills and provides visual/audio feedback

import { Logger } from './utils/Logger.js';

/**
 * Kill streak definitions
 */
export const KILL_STREAKS = {
    DOUBLE_KILL: { count: 2, name: 'DOUBLE KILL', color: '#ffff00', sound: 'double' },
    TRIPLE_KILL: { count: 3, name: 'TRIPLE KILL', color: '#ff8800', sound: 'triple' },
    MEGA_KILL: { count: 4, name: 'MEGA KILL', color: '#ff4400', sound: 'mega' },
    ULTRA_KILL: { count: 5, name: 'ULTRA KILL', color: '#ff0088', sound: 'ultra' },
    MONSTER_KILL: { count: 6, name: 'MONSTER KILL', color: '#ff00ff', sound: 'monster' },
    GODLIKE: { count: 7, name: 'GODLIKE!', color: '#00ffff', sound: 'godlike' },
    UNSTOPPABLE: { count: 10, name: 'UNSTOPPABLE!!', color: '#ffffff', sound: 'unstoppable' }
};

/**
 * Time window for multi-kills (ms)
 */
const MULTI_KILL_WINDOW = 4000;

/**
 * Time between kills to maintain streak (ms)
 */
const STREAK_TIMEOUT = 10000;

/**
 * Kill streak manager
 */
export class KillStreakManager {
    constructor() {
        // Current streak
        this.currentStreak = 0;
        this.highestStreak = 0;

        // Multi-kill tracking
        this.multiKillCount = 0;
        this.lastKillTime = 0;
        this.multiKillTimer = null;

        // Streak timeout
        this.streakTimer = null;

        // UI element
        this.announcementElement = null;
        this.createUI();

        // Callbacks
        this.onStreakAnnouncement = null;
        this.onMultiKill = null;

        // Statistics
        this.stats = {
            totalKills: 0,
            doubleKills: 0,
            tripleKills: 0,
            megaKills: 0,
            ultraKills: 0,
            monsterKills: 0,
            godlikes: 0,
            highestStreak: 0
        };
    }

    /**
     * Create announcement UI element
     */
    createUI() {
        // Check if already exists
        if (document.getElementById('kill-streak-announcement')) {
            this.announcementElement = document.getElementById('kill-streak-announcement');
            return;
        }

        this.announcementElement = document.createElement('div');
        this.announcementElement.id = 'kill-streak-announcement';
        this.announcementElement.style.cssText = `
            position: fixed;
            top: 25%;
            left: 50%;
            transform: translateX(-50%) scale(0);
            font-family: 'Impact', 'Arial Black', sans-serif;
            font-size: 48px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 4px;
            text-shadow: 
                0 0 10px currentColor,
                0 0 20px currentColor,
                0 0 40px currentColor,
                2px 2px 0 #000,
                -2px -2px 0 #000,
                2px -2px 0 #000,
                -2px 2px 0 #000;
            pointer-events: none;
            z-index: 1000;
            opacity: 0;
            transition: none;
        `;
        document.body.appendChild(this.announcementElement);

        // Create screen flash overlay for big kills
        this.flashOverlay = document.createElement('div');
        this.flashOverlay.id = 'kill-streak-flash';
        this.flashOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 999;
            opacity: 0;
            transition: opacity 0.1s ease-out;
        `;
        document.body.appendChild(this.flashOverlay);

        // Create combo timer display
        this.comboDisplay = document.createElement('div');
        this.comboDisplay.id = 'combo-timer';
        this.comboDisplay.style.cssText = `
            position: fixed;
            top: 35%;
            left: 50%;
            transform: translateX(-50%);
            font-family: 'Courier New', monospace;
            font-size: 18px;
            color: #ffaa00;
            text-shadow: 0 0 5px #ff6600;
            pointer-events: none;
            z-index: 998;
            opacity: 0;
            transition: opacity 0.2s;
        `;
        document.body.appendChild(this.comboDisplay);

        // Add CSS animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes streakAnnounce {
                0% {
                    transform: translateX(-50%) scale(0);
                    opacity: 0;
                }
                15% {
                    transform: translateX(-50%) scale(1.3);
                    opacity: 1;
                }
                25% {
                    transform: translateX(-50%) scale(1);
                }
                75% {
                    transform: translateX(-50%) scale(1);
                    opacity: 1;
                }
                100% {
                    transform: translateX(-50%) scale(0.8);
                    opacity: 0;
                }
            }
            
            @keyframes streakPulse {
                0%, 100% { filter: brightness(1); }
                50% { filter: brightness(1.5); }
            }

            @keyframes screenFlash {
                0% { opacity: 0.5; }
                100% { opacity: 0; }
            }

            @keyframes comboCountdown {
                from { width: 100%; }
                to { width: 0%; }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Show screen flash effect
     * @param {string} color - Flash color
     */
    showScreenFlash(color = '#ffffff') {
        if (!this.flashOverlay) return;

        this.flashOverlay.style.background = `radial-gradient(circle, ${color}40 0%, transparent 70%)`;
        this.flashOverlay.style.animation = 'none';
        this.flashOverlay.offsetHeight;
        this.flashOverlay.style.animation = 'screenFlash 0.4s ease-out forwards';
    }

    /**
     * Update combo timer display
     */
    _updateComboDisplay() {
        if (!this.comboDisplay) return;

        if (this.multiKillCount > 0) {
            this.comboDisplay.style.opacity = '1';
            this.comboDisplay.textContent = `COMBO: ${this.multiKillCount}x`;
        } else {
            this.comboDisplay.style.opacity = '0';
        }
    }

    /**
     * Register a kill
     * @param {boolean} isHeadshot - Was it a headshot
     * @returns {Object|null} Multi-kill or streak info if triggered
     */
    registerKill(isHeadshot = false) {
        const now = Date.now();
        this.stats.totalKills++;

        // Update streak
        this.currentStreak++;
        this.highestStreak = Math.max(this.highestStreak, this.currentStreak);
        this.stats.highestStreak = this.highestStreak;

        // Reset streak timeout
        if (this.streakTimer) {
            clearTimeout(this.streakTimer);
        }
        this.streakTimer = setTimeout(() => {
            this.resetStreak();
        }, STREAK_TIMEOUT);

        // Check for multi-kill
        let multiKillResult = null;
        if (now - this.lastKillTime < MULTI_KILL_WINDOW) {
            this.multiKillCount++;
            multiKillResult = this._checkMultiKill();
        } else {
            this.multiKillCount = 1;
        }
        this.lastKillTime = now;

        // Reset multi-kill timer
        if (this.multiKillTimer) {
            clearTimeout(this.multiKillTimer);
        }
        this.multiKillTimer = setTimeout(() => {
            this.multiKillCount = 0;
        }, MULTI_KILL_WINDOW);

        // Check for streak milestone
        const streakResult = this._checkStreakMilestone();

        // Return the more impressive achievement
        if (streakResult && (!multiKillResult || streakResult.count >= multiKillResult.count)) {
            return streakResult;
        }
        return multiKillResult;
    }

    /**
     * Check for multi-kill announcement
     */
    _checkMultiKill() {
        for (const [key, streak] of Object.entries(KILL_STREAKS)) {
            if (this.multiKillCount === streak.count && streak.count <= 7) {
                this._updateStats(streak.count);
                this.showAnnouncement(streak.name, streak.color);

                if (this.onMultiKill) {
                    this.onMultiKill(streak);
                }

                return streak;
            }
        }
        return null;
    }

    /**
     * Check for streak milestone
     */
    _checkStreakMilestone() {
        // Check milestones at 5, 10, 15, 20
        const milestones = [5, 10, 15, 20, 25];

        if (milestones.includes(this.currentStreak)) {
            const streakInfo = {
                count: this.currentStreak,
                name: `${this.currentStreak} KILL STREAK!`,
                color: this.currentStreak >= 20 ? '#ffffff' :
                    this.currentStreak >= 15 ? '#00ffff' :
                        this.currentStreak >= 10 ? '#ff00ff' : '#ffff00'
            };

            this.showAnnouncement(streakInfo.name, streakInfo.color);

            if (this.onStreakAnnouncement) {
                this.onStreakAnnouncement(streakInfo);
            }

            return streakInfo;
        }

        return null;
    }

    /**
     * Update statistics
     */
    _updateStats(multiKillCount) {
        switch (multiKillCount) {
            case 2: this.stats.doubleKills++; break;
            case 3: this.stats.tripleKills++; break;
            case 4: this.stats.megaKills++; break;
            case 5: this.stats.ultraKills++; break;
            case 6: this.stats.monsterKills++; break;
            case 7: this.stats.godlikes++; break;
        }
    }

    /**
     * Show announcement on screen
     * @param {string} text - Text to display
     * @param {string} color - Color of the text
     */
    showAnnouncement(text, color = '#ffffff') {
        if (!this.announcementElement) return;

        // Reset animation
        this.announcementElement.style.animation = 'none';
        this.announcementElement.offsetHeight; // Trigger reflow

        this.announcementElement.textContent = text;
        this.announcementElement.style.color = color;
        this.announcementElement.style.animation = 'streakAnnounce 1.5s ease-out forwards, streakPulse 0.3s ease-in-out 3';

        Logger.debug(`Kill Streak: ${text}`);
    }

    /**
     * Reset current streak (on death)
     */
    resetStreak() {
        this.currentStreak = 0;
        this.multiKillCount = 0;

        if (this.streakTimer) {
            clearTimeout(this.streakTimer);
            this.streakTimer = null;
        }
        if (this.multiKillTimer) {
            clearTimeout(this.multiKillTimer);
            this.multiKillTimer = null;
        }
    }

    /**
     * Get current streak count
     * @returns {number} Current kill streak
     */
    getStreak() {
        return this.currentStreak;
    }

    /**
     * Get highest streak
     * @returns {number} Highest kill streak
     */
    getHighestStreak() {
        return this.highestStreak;
    }

    /**
     * Get statistics
     * @returns {Object} Kill streak statistics
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Full reset (new game)
     */
    reset() {
        this.resetStreak();
        this.highestStreak = 0;
        this.lastKillTime = 0;
    }

    /**
     * Reset stats (new session)
     */
    resetStats() {
        this.stats = {
            totalKills: 0,
            doubleKills: 0,
            tripleKills: 0,
            megaKills: 0,
            ultraKills: 0,
            monsterKills: 0,
            godlikes: 0,
            highestStreak: 0
        };
    }

    /**
     * Dispose UI elements
     */
    dispose() {
        if (this.announcementElement && this.announcementElement.parentNode) {
            this.announcementElement.parentNode.removeChild(this.announcementElement);
        }
        if (this.streakTimer) clearTimeout(this.streakTimer);
        if (this.multiKillTimer) clearTimeout(this.multiKillTimer);
    }
}
