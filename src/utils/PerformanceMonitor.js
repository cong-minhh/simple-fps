// PerformanceMonitor.js - Adaptive quality system with FPS monitoring
// Automatically adjusts rendering quality based on performance

import { Logger } from './Logger.js';

/**
 * Quality levels for adaptive rendering
 */
export const QUALITY_LEVELS = {
    ULTRA: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
    POTATO: 0
};

/**
 * Quality settings per level
 */
const QUALITY_PRESETS = {
    [QUALITY_LEVELS.ULTRA]: {
        shadowMapSize: 1024,
        particleCount: 1.0,
        lodBias: 0,
        postProcessing: true,
        antialias: true,
        pixelRatio: window.devicePixelRatio
    },
    [QUALITY_LEVELS.HIGH]: {
        shadowMapSize: 512,
        particleCount: 0.8,
        lodBias: 5,
        postProcessing: true,
        antialias: false,
        pixelRatio: 1
    },
    [QUALITY_LEVELS.MEDIUM]: {
        shadowMapSize: 256,
        particleCount: 0.5,
        lodBias: 10,
        postProcessing: false,
        antialias: false,
        pixelRatio: 1
    },
    [QUALITY_LEVELS.LOW]: {
        shadowMapSize: 0, // No shadows
        particleCount: 0.3,
        lodBias: 15,
        postProcessing: false,
        antialias: false,
        pixelRatio: 0.75
    },
    [QUALITY_LEVELS.POTATO]: {
        shadowMapSize: 0,
        particleCount: 0.1,
        lodBias: 20,
        postProcessing: false,
        antialias: false,
        pixelRatio: 0.5
    }
};

/**
 * Performance monitor with adaptive quality adjustment
 */
class PerformanceMonitorClass {
    constructor() {
        // FPS tracking
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
        this.currentFps = 60;
        this.fpsHistory = [];
        this.maxHistory = 60; // 1 second of samples at 60fps

        // Quality management
        this.currentQuality = QUALITY_LEVELS.HIGH;
        this.targetFps = 55; // Target slightly below 60 for headroom
        this.lowFpsThreshold = 45;
        this.highFpsThreshold = 58;

        // Cooldown to prevent rapid quality changes
        this.qualityChangeCooldown = 3000; // 3 seconds
        this.lastQualityChange = 0;

        // Callbacks for quality changes
        this.onQualityChange = null;

        // Frame time tracking
        this.frameTimes = [];
        this.maxFrameTimes = 120;

        // Memory monitoring (if available)
        this.memoryWarningThreshold = 500 * 1024 * 1024; // 500MB

        // Statistics
        this.stats = {
            avgFps: 60,
            minFps: 60,
            maxFps: 60,
            avgFrameTime: 16.67,
            drawCalls: 0,
            triangles: 0,
            qualityChanges: 0
        };
    }

    /**
     * Call this every frame to update performance metrics
     * @param {number} deltaTime - Frame delta in seconds
     * @param {THREE.WebGLRenderer} renderer - Optional, for render stats
     */
    update(deltaTime, renderer = null) {
        const now = performance.now();
        this.frameCount++;

        // Store frame time
        const frameTimeMs = deltaTime * 1000;
        this.frameTimes.push(frameTimeMs);
        if (this.frameTimes.length > this.maxFrameTimes) {
            this.frameTimes.shift();
        }

        // Update FPS every 100ms
        const timeSinceUpdate = now - this.lastFpsUpdate;
        if (timeSinceUpdate >= 100) {
            this.currentFps = (this.frameCount / timeSinceUpdate) * 1000;
            this.fpsHistory.push(this.currentFps);

            if (this.fpsHistory.length > this.maxHistory) {
                this.fpsHistory.shift();
            }

            this.frameCount = 0;
            this.lastFpsUpdate = now;

            // Update statistics
            this._updateStats();

            // Check if quality adjustment is needed
            this._checkQualityAdjustment(now);
        }

        // Get renderer stats if available
        if (renderer && renderer.info) {
            this.stats.drawCalls = renderer.info.render.calls;
            this.stats.triangles = renderer.info.render.triangles;
        }
    }

    /**
     * Update performance statistics
     */
    _updateStats() {
        if (this.fpsHistory.length === 0) return;

        const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
        this.stats.avgFps = sum / this.fpsHistory.length;
        this.stats.minFps = Math.min(...this.fpsHistory);
        this.stats.maxFps = Math.max(...this.fpsHistory);

        if (this.frameTimes.length > 0) {
            const frameSum = this.frameTimes.reduce((a, b) => a + b, 0);
            this.stats.avgFrameTime = frameSum / this.frameTimes.length;
        }
    }

    /**
     * Check if quality should be adjusted based on FPS
     */
    _checkQualityAdjustment(now) {
        // Check cooldown
        if (now - this.lastQualityChange < this.qualityChangeCooldown) {
            return;
        }

        // Need enough history to make a decision
        if (this.fpsHistory.length < 30) {
            return;
        }

        // Use recent average (last 500ms)
        const recentHistory = this.fpsHistory.slice(-5);
        const recentAvg = recentHistory.reduce((a, b) => a + b, 0) / recentHistory.length;

        // Check if we need to lower quality
        if (recentAvg < this.lowFpsThreshold && this.currentQuality > QUALITY_LEVELS.POTATO) {
            this._changeQuality(this.currentQuality - 1);
            this.lastQualityChange = now;
            Logger.info(`Performance: Lowering quality to ${this.getQualityName()} (FPS: ${recentAvg.toFixed(1)})`);
        }
        // Check if we can raise quality
        else if (recentAvg > this.highFpsThreshold && this.currentQuality < QUALITY_LEVELS.ULTRA) {
            this._changeQuality(this.currentQuality + 1);
            this.lastQualityChange = now;
            Logger.info(`Performance: Raising quality to ${this.getQualityName()} (FPS: ${recentAvg.toFixed(1)})`);
        }
    }

    /**
     * Change quality level
     */
    _changeQuality(newLevel) {
        this.currentQuality = newLevel;
        this.stats.qualityChanges++;

        if (this.onQualityChange) {
            this.onQualityChange(newLevel, this.getQualitySettings());
        }
    }

    /**
     * Get current quality settings
     * @returns {Object} Quality settings for current level
     */
    getQualitySettings() {
        return { ...QUALITY_PRESETS[this.currentQuality] };
    }

    /**
     * Get quality level name
     * @returns {string} Human-readable quality name
     */
    getQualityName() {
        const names = ['POTATO', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA'];
        return names[this.currentQuality] || 'UNKNOWN';
    }

    /**
     * Manually set quality level
     * @param {number} level - Quality level from QUALITY_LEVELS
     */
    setQuality(level) {
        if (level >= QUALITY_LEVELS.POTATO && level <= QUALITY_LEVELS.ULTRA) {
            this._changeQuality(level);
        }
    }

    /**
     * Get current FPS
     * @returns {number} Current FPS
     */
    getFps() {
        return this.currentFps;
    }

    /**
     * Get performance statistics
     * @returns {Object} Performance stats
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Check memory usage (if Performance API supports it)
     * @returns {Object|null} Memory info or null if not available
     */
    getMemoryInfo() {
        if (performance.memory) {
            return {
                usedHeapSize: performance.memory.usedJSHeapSize,
                totalHeapSize: performance.memory.totalJSHeapSize,
                heapLimit: performance.memory.jsHeapSizeLimit,
                usagePercent: (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100
            };
        }
        return null;
    }

    /**
     * Check if memory usage is high
     * @returns {boolean} True if memory usage is concerning
     */
    isMemoryWarning() {
        const mem = this.getMemoryInfo();
        return mem && mem.usedHeapSize > this.memoryWarningThreshold;
    }

    /**
     * Create a debug overlay element
     * @returns {HTMLElement} Debug overlay element
     */
    createDebugOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'perf-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            background: rgba(0, 0, 0, 0.7);
            color: #0f0;
            font-family: monospace;
            font-size: 12px;
            padding: 10px;
            z-index: 9999;
            pointer-events: none;
            min-width: 150px;
        `;
        return overlay;
    }

    /**
     * Update debug overlay content
     * @param {HTMLElement} overlay - Debug overlay element
     */
    updateDebugOverlay(overlay) {
        if (!overlay) return;

        const mem = this.getMemoryInfo();
        const memStr = mem
            ? `${(mem.usedHeapSize / 1024 / 1024).toFixed(1)}MB`
            : 'N/A';

        overlay.innerHTML = `
            <div>FPS: ${this.currentFps.toFixed(0)} (avg: ${this.stats.avgFps.toFixed(0)})</div>
            <div>Frame: ${this.stats.avgFrameTime.toFixed(2)}ms</div>
            <div>Quality: ${this.getQualityName()}</div>
            <div>Draw Calls: ${this.stats.drawCalls}</div>
            <div>Triangles: ${(this.stats.triangles / 1000).toFixed(1)}k</div>
            <div>Memory: ${memStr}</div>
        `;
    }

    /**
     * Reset all tracking data
     */
    reset() {
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
        this.fpsHistory = [];
        this.frameTimes = [];
        this.stats = {
            avgFps: 60,
            minFps: 60,
            maxFps: 60,
            avgFrameTime: 16.67,
            drawCalls: 0,
            triangles: 0,
            qualityChanges: 0
        };
    }
}

// Export singleton instance
export const PerformanceMonitor = new PerformanceMonitorClass();

// Also export class and quality levels
export { PerformanceMonitorClass };
