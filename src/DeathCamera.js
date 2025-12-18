// DeathCamera.js - Cinematic death camera with third-person killer view
// Provides visual feedback when player dies, showing the killer

import * as THREE from 'three';

/**
 * Death camera system for cinematic death sequences
 * Shows killer from third-person view with slow-motion effect
 */
export class DeathCamera {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene = scene;

        // State
        this.isActive = false;
        this.duration = 3000; // ms
        this.startTime = 0;

        // Camera positions
        this.originalPosition = new THREE.Vector3();
        this.originalRotation = new THREE.Euler();
        this.targetPosition = new THREE.Vector3();
        this.targetLookAt = new THREE.Vector3();

        // Killer reference
        this.killerId = null;
        this.killerPosition = new THREE.Vector3();
        this.killerName = '';
        this.weaponUsed = '';

        // Animation state
        this.progress = 0;
        this.cameraDistance = 5;
        this.cameraHeight = 2;

        // Pre-allocated vectors
        this._tempVec = new THREE.Vector3();
        this._lerpVec = new THREE.Vector3();

        // Callbacks
        this.onComplete = null;

        // Visual overlay element
        this.overlay = null;
        this._createOverlay();
    }

    _createOverlay() {
        // Create death camera overlay HTML element
        this.overlay = document.createElement('div');
        this.overlay.id = 'death-camera-overlay';
        this.overlay.className = 'hidden';
        this.overlay.innerHTML = `
            <div class="death-camera-content">
                <div class="death-camera-title">ELIMINATED</div>
                <div class="death-camera-killer">
                    <span class="killer-label">Killed by</span>
                    <span class="killer-name"></span>
                </div>
                <div class="death-camera-weapon"></div>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            #death-camera-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 1000;
                display: flex;
                flex-direction: column;
                justify-content: flex-end;
                align-items: center;
                padding-bottom: 20%;
                background: linear-gradient(to bottom, transparent 50%, rgba(139, 0, 0, 0.3) 100%);
                opacity: 0;
                transition: opacity 0.5s ease-in;
            }
            #death-camera-overlay.active {
                opacity: 1;
            }
            #death-camera-overlay.hidden {
                display: none;
            }
            .death-camera-content {
                text-align: center;
                color: white;
                text-shadow: 0 0 10px rgba(255, 0, 0, 0.8), 2px 2px 4px rgba(0, 0, 0, 0.8);
            }
            .death-camera-title {
                font-size: 48px;
                font-weight: bold;
                letter-spacing: 8px;
                color: #ff4444;
                margin-bottom: 20px;
                animation: deathPulse 1s ease-in-out infinite;
            }
            @keyframes deathPulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.8; transform: scale(1.02); }
            }
            .death-camera-killer {
                font-size: 24px;
                margin-bottom: 10px;
            }
            .killer-label {
                color: #aaa;
                margin-right: 10px;
            }
            .killer-name {
                color: #ff6666;
                font-weight: bold;
            }
            .death-camera-weapon {
                font-size: 18px;
                color: #888;
                font-style: italic;
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(this.overlay);
    }

    /**
     * Start death camera sequence
     * @param {THREE.Vector3} playerDeathPos - Where the player died
     * @param {Object} killerData - Killer information {id, name, position, weapon}
     */
    start(playerDeathPos, killerData) {
        if (!killerData) {
            // No killer (e.g., environmental death)
            this.onComplete?.();
            return;
        }

        this.isActive = true;
        this.startTime = performance.now();
        this.progress = 0;

        // Store original camera state
        this.originalPosition.copy(this.camera.position);
        this.originalRotation.copy(this.camera.rotation);

        // Store killer info
        this.killerId = killerData.id;
        this.killerName = killerData.name || 'Unknown';
        this.killerPosition.copy(killerData.position || playerDeathPos);
        this.weaponUsed = killerData.weapon || '';

        // Calculate camera position behind and above the killer
        const dirToKiller = this._tempVec.subVectors(this.killerPosition, playerDeathPos).normalize();

        // Position camera behind killer, looking at them
        this.targetPosition.copy(this.killerPosition);
        this.targetPosition.x -= dirToKiller.x * this.cameraDistance;
        this.targetPosition.z -= dirToKiller.z * this.cameraDistance;
        this.targetPosition.y = this.killerPosition.y + this.cameraHeight;

        this.targetLookAt.copy(this.killerPosition);
        this.targetLookAt.y += 0.8; // Look at chest height

        // Update overlay
        this.overlay.querySelector('.killer-name').textContent = this.killerName;
        this.overlay.querySelector('.death-camera-weapon').textContent =
            this.weaponUsed ? `with ${this.weaponUsed}` : '';

        // Show overlay
        this.overlay.classList.remove('hidden');
        setTimeout(() => this.overlay.classList.add('active'), 50);
    }

    /**
     * Update death camera animation
     * @param {number} deltaTime - Frame delta in seconds
     * @returns {boolean} True if still animating
     */
    update(deltaTime) {
        if (!this.isActive) return false;

        const elapsed = performance.now() - this.startTime;
        this.progress = Math.min(elapsed / this.duration, 1);

        // Smooth easing
        const ease = this._easeOutCubic(this.progress);

        // Lerp camera position
        this._lerpVec.lerpVectors(this.originalPosition, this.targetPosition, ease);
        this.camera.position.copy(this._lerpVec);

        // Look at killer
        this.camera.lookAt(this.targetLookAt);

        // Add slight camera shake for impact
        if (this.progress < 0.2) {
            const shake = (1 - this.progress / 0.2) * 0.05;
            this.camera.position.x += (Math.random() - 0.5) * shake;
            this.camera.position.y += (Math.random() - 0.5) * shake;
        }

        // Check if complete
        if (this.progress >= 1) {
            this.stop();
            return false;
        }

        return true;
    }

    /**
     * Update killer position (for tracking moving killer)
     * @param {THREE.Vector3} position - New killer position
     */
    updateKillerPosition(position) {
        if (!this.isActive) return;

        this.killerPosition.copy(position);

        // Recalculate target look-at
        this.targetLookAt.copy(position);
        this.targetLookAt.y += 0.8;
    }

    /**
     * Stop death camera and restore original state
     */
    stop() {
        if (!this.isActive) return;

        this.isActive = false;

        // Hide and reset overlay
        this.overlay.classList.remove('active');
        setTimeout(() => this.overlay.classList.add('hidden'), 500);

        // Call completion callback
        this.onComplete?.();
    }

    /**
     * Check if death camera is active
     * @returns {boolean}
     */
    isPlaying() {
        return this.isActive;
    }

    /**
     * Cubic ease-out function
     */
    _easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    /**
     * Set completion callback
     * @param {Function} callback
     */
    setOnComplete(callback) {
        this.onComplete = callback;
    }

    /**
     * Dispose of death camera resources
     */
    dispose() {
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
    }
}
