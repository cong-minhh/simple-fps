// SpectatorMode.js - Spectator camera for dead players in multiplayer
// Allows viewing other players while waiting to respawn

import * as THREE from 'three';

/**
 * Spectator mode for dead players
 * Switches between watching alive players with smooth transitions
 */
export class SpectatorMode {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene = scene;
        this.active = false;

        // Target player
        this.targetPlayer = null;
        this.targetIndex = 0;
        this.players = [];

        // Camera positioning
        this.offset = new THREE.Vector3(0, 3, -5);
        this.lookAtOffset = new THREE.Vector3(0, 1.5, 0);
        this.currentPosition = new THREE.Vector3();
        this.currentLookAt = new THREE.Vector3();

        // Transition smoothing
        this.positionSmoothing = 5;
        this.rotationSmoothing = 8;

        // Free cam mode
        this.freeCam = false;
        this.freeCamSpeed = 10;
        this.freeCamVelocity = new THREE.Vector3();

        // Input state
        this.keys = { w: false, a: false, s: false, d: false, space: false, shift: false };

        // UI
        this.overlay = null;
        this._createOverlay();
    }

    _createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'spectator-overlay';
        this.overlay.innerHTML = `
            <div class="spectator-info">
                <span class="spectator-label">SPECTATING</span>
                <span class="spectator-name"></span>
            </div>
            <div class="spectator-controls">
                <span>← → Switch Player</span>
                <span>F Free Cam</span>
            </div>
        `;
        this.overlay.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            text-align: center;
            font-family: monospace;
            color: white;
            z-index: 200;
            pointer-events: none;
            display: none;
        `;

        const style = document.createElement('style');
        style.textContent = `
            .spectator-info {
                background: rgba(0, 0, 0, 0.7);
                padding: 10px 20px;
                margin-bottom: 10px;
                border: 1px solid rgba(255, 255, 255, 0.3);
            }
            .spectator-label {
                color: #888;
                font-size: 12px;
                letter-spacing: 2px;
                display: block;
                margin-bottom: 5px;
            }
            .spectator-name {
                font-size: 18px;
                font-weight: bold;
                color: #00ffaa;
            }
            .spectator-controls {
                font-size: 11px;
                color: #666;
                display: flex;
                gap: 20px;
                justify-content: center;
            }
            .spectator-controls span {
                background: rgba(0, 0, 0, 0.5);
                padding: 5px 10px;
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(this.overlay);
    }

    /**
     * Start spectator mode
     * @param {Array} players - List of players to spectate
     */
    start(players) {
        this.active = true;
        this.players = players.filter(p => p.isAlive !== false);
        this.targetIndex = 0;
        this.freeCam = false;

        if (this.players.length > 0) {
            this.targetPlayer = this.players[0];
            const pos = this.targetPlayer.getPosition();
            this.currentPosition.copy(pos).add(this.offset);
            this.currentLookAt.copy(pos).add(this.lookAtOffset);
        }

        this.overlay.style.display = 'block';
        this._updateOverlay();
        this._setupInputHandlers();
    }

    /**
     * Stop spectator mode
     */
    stop() {
        this.active = false;
        this.targetPlayer = null;
        this.overlay.style.display = 'none';
        this._removeInputHandlers();
    }

    /**
     * Update players list
     */
    updatePlayers(players) {
        this.players = players.filter(p => p.isAlive !== false);

        // Keep watching same player if still alive
        if (this.targetPlayer && !this.players.includes(this.targetPlayer)) {
            this.nextPlayer();
        }
    }

    /**
     * Switch to next player
     */
    nextPlayer() {
        if (this.players.length === 0) return;

        this.targetIndex = (this.targetIndex + 1) % this.players.length;
        this.targetPlayer = this.players[this.targetIndex];
        this._updateOverlay();
    }

    /**
     * Switch to previous player
     */
    prevPlayer() {
        if (this.players.length === 0) return;

        this.targetIndex = (this.targetIndex - 1 + this.players.length) % this.players.length;
        this.targetPlayer = this.players[this.targetIndex];
        this._updateOverlay();
    }

    /**
     * Toggle free camera mode
     */
    toggleFreeCam() {
        this.freeCam = !this.freeCam;
        this._updateOverlay();
    }

    /**
     * Update spectator camera
     * @param {number} dt - Delta time
     */
    update(dt) {
        if (!this.active) return;

        if (this.freeCam) {
            this._updateFreeCam(dt);
        } else {
            this._updateFollowCam(dt);
        }
    }

    _updateFollowCam(dt) {
        if (!this.targetPlayer) return;

        const targetPos = this.targetPlayer.getPosition();
        const targetRot = this.targetPlayer.getRotation ?
            this.targetPlayer.getRotation().y : 0;

        // Calculate camera position behind player
        const offsetRotated = this.offset.clone();
        offsetRotated.applyAxisAngle(new THREE.Vector3(0, 1, 0), targetRot);

        const desiredPosition = targetPos.clone().add(offsetRotated);
        const desiredLookAt = targetPos.clone().add(this.lookAtOffset);

        // Smooth camera movement
        this.currentPosition.lerp(desiredPosition, this.positionSmoothing * dt);
        this.currentLookAt.lerp(desiredLookAt, this.rotationSmoothing * dt);

        // Apply to camera
        this.camera.position.copy(this.currentPosition);
        this.camera.lookAt(this.currentLookAt);
    }

    _updateFreeCam(dt) {
        // Calculate movement direction
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0));

        // Apply input
        const moveSpeed = this.freeCamSpeed * dt;

        if (this.keys.w) this.camera.position.addScaledVector(forward, moveSpeed);
        if (this.keys.s) this.camera.position.addScaledVector(forward, -moveSpeed);
        if (this.keys.d) this.camera.position.addScaledVector(right, moveSpeed);
        if (this.keys.a) this.camera.position.addScaledVector(right, -moveSpeed);
        if (this.keys.space) this.camera.position.y += moveSpeed;
        if (this.keys.shift) this.camera.position.y -= moveSpeed;
    }

    _updateOverlay() {
        const nameEl = this.overlay.querySelector('.spectator-name');
        const labelEl = this.overlay.querySelector('.spectator-label');

        if (this.freeCam) {
            labelEl.textContent = 'FREE CAMERA';
            nameEl.textContent = 'WASD to move';
        } else if (this.targetPlayer) {
            labelEl.textContent = 'SPECTATING';
            nameEl.textContent = this.targetPlayer.name || `Player ${this.targetIndex + 1}`;
        } else {
            labelEl.textContent = 'NO PLAYERS';
            nameEl.textContent = 'Waiting...';
        }
    }

    _setupInputHandlers() {
        this._keyDown = (e) => {
            if (!this.active) return;

            const key = e.key.toLowerCase();

            if (key === 'arrowright' || key === 'e') {
                this.nextPlayer();
            } else if (key === 'arrowleft' || key === 'q') {
                this.prevPlayer();
            } else if (key === 'f') {
                this.toggleFreeCam();
            } else if (this.freeCam) {
                if (key === 'w') this.keys.w = true;
                if (key === 'a') this.keys.a = true;
                if (key === 's') this.keys.s = true;
                if (key === 'd') this.keys.d = true;
                if (key === ' ') this.keys.space = true;
                if (key === 'shift') this.keys.shift = true;
            }
        };

        this._keyUp = (e) => {
            const key = e.key.toLowerCase();
            if (key === 'w') this.keys.w = false;
            if (key === 'a') this.keys.a = false;
            if (key === 's') this.keys.s = false;
            if (key === 'd') this.keys.d = false;
            if (key === ' ') this.keys.space = false;
            if (key === 'shift') this.keys.shift = false;
        };

        document.addEventListener('keydown', this._keyDown);
        document.addEventListener('keyup', this._keyUp);
    }

    _removeInputHandlers() {
        document.removeEventListener('keydown', this._keyDown);
        document.removeEventListener('keyup', this._keyUp);
    }

    dispose() {
        this.stop();
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
    }
}
