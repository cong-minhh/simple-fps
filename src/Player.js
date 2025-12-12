// Player.js - Ultra-optimized FPS camera and movement
import * as THREE from 'three';

export class Player {
    constructor(camera, domElement, arena) {
        this.camera = camera;
        this.domElement = domElement;
        this.arena = arena;

        // Pre-set rotation order ONCE - critical for FPS camera
        this.camera.rotation.order = 'YXZ';

        // Movement settings
        this.walkSpeed = 4;
        this.sprintSpeed = 6;
        this.jumpForce = 8;
        this.gravity = 20;
        this.playerHeight = 1.6;
        this.playerRadius = 0.4;

        // Mouse sensitivity (radians per pixel)
        this.sensitivity = 0.002;

        // State
        this.health = 100;
        this.maxHealth = 100;
        this.isDead = false;
        this._isLocked = false;
        this.isOnGround = true;
        this.velocityY = 0;

        // Input flags - using direct booleans for speed
        this.moveF = false;
        this.moveB = false;
        this.moveL = false;
        this.moveR = false;
        this.sprint = false;
        this.jump = false;

        // Reusable vectors to avoid GC
        this._testPos = new THREE.Vector3();

        // Initial setup
        this.camera.position.set(0, this.playerHeight, 5);
        this.camera.rotation.set(0, 0, 0);

        // Bind and register events
        this._onMouse = this._onMouse.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._onLockChange = this._onLockChange.bind(this);

        document.addEventListener('mousemove', this._onMouse, false);
        document.addEventListener('keydown', this._onKeyDown, false);
        document.addEventListener('keyup', this._onKeyUp, false);
        document.addEventListener('pointerlockchange', this._onLockChange, false);
    }

    // CRITICAL: Mouse handling must be instant with zero lag
    _onMouse(e) {
        if (!this._isLocked || this.isDead) return;

        const dx = e.movementX;
        const dy = e.movementY;

        // Skip abnormal values (happens on pointer lock)
        if (dx > 200 || dx < -200 || dy > 200 || dy < -200) return;

        // Direct rotation update - no intermediate objects
        this.camera.rotation.y -= dx * this.sensitivity;
        this.camera.rotation.x -= dy * this.sensitivity;

        // Clamp pitch inline
        if (this.camera.rotation.x > 1.5) this.camera.rotation.x = 1.5;
        if (this.camera.rotation.x < -1.5) this.camera.rotation.x = -1.5;
    }

    _onKeyDown(e) {
        if (this.isDead) return;
        switch (e.code) {
            case 'KeyW': case 'ArrowUp': this.moveF = true; break;
            case 'KeyS': case 'ArrowDown': this.moveB = true; break;
            case 'KeyA': case 'ArrowLeft': this.moveL = true; break;
            case 'KeyD': case 'ArrowRight': this.moveR = true; break;
            case 'ShiftLeft': case 'ShiftRight': this.sprint = true; break;
            case 'Space': if (this.isOnGround) this.jump = true; break;
        }
    }

    _onKeyUp(e) {
        switch (e.code) {
            case 'KeyW': case 'ArrowUp': this.moveF = false; break;
            case 'KeyS': case 'ArrowDown': this.moveB = false; break;
            case 'KeyA': case 'ArrowLeft': this.moveL = false; break;
            case 'KeyD': case 'ArrowRight': this.moveR = false; break;
            case 'ShiftLeft': case 'ShiftRight': this.sprint = false; break;
        }
    }

    _onLockChange() {
        const wasLocked = this._isLocked;
        this._isLocked = document.pointerLockElement === this.domElement;
        if (this._isLocked && !wasLocked) {
            this.domElement.dispatchEvent(new CustomEvent('lock'));
        } else if (!this._isLocked && wasLocked) {
            this.domElement.dispatchEvent(new CustomEvent('unlock'));
        }
    }

    update(dt) {
        if (this.isDead || !this._isLocked) return;

        // Cap delta to prevent explosion
        if (dt > 0.1) dt = 0.1;

        const speed = this.sprint ? this.sprintSpeed : this.walkSpeed;
        const yaw = this.camera.rotation.y;

        // Calculate sin/cos once
        const s = Math.sin(yaw);
        const c = Math.cos(yaw);

        // Forward: -sin, -cos | Right: cos, -sin
        let vx = 0, vz = 0;

        if (this.moveF) { vx -= s; vz -= c; }
        if (this.moveB) { vx += s; vz += c; }
        if (this.moveR) { vx += c; vz -= s; }
        if (this.moveL) { vx -= c; vz += s; }

        // Normalize if moving diagonally
        const len = Math.sqrt(vx * vx + vz * vz);
        if (len > 0) {
            const inv = speed / len;
            vx *= inv;
            vz *= inv;
        }

        // Jump
        if (this.jump && this.isOnGround) {
            this.velocityY = this.jumpForce;
            this.isOnGround = false;
            this.jump = false;
        }

        // Gravity
        this.velocityY -= this.gravity * dt;

        // Position updates with collision
        const pos = this.camera.position;

        // X collision
        this._testPos.set(pos.x + vx * dt, pos.y, pos.z);
        if (!this.arena.checkCollision(this._testPos, this.playerRadius)) {
            pos.x = this._testPos.x;
        }

        // Z collision
        this._testPos.set(pos.x, pos.y, pos.z + vz * dt);
        if (!this.arena.checkCollision(this._testPos, this.playerRadius)) {
            pos.z = this._testPos.z;
        }

        // Y movement
        pos.y += this.velocityY * dt;

        // Ground check
        const groundY = this.arena.getFloorHeight(pos.x, pos.z) + this.playerHeight;
        if (pos.y <= groundY) {
            pos.y = groundY;
            this.velocityY = 0;
            this.isOnGround = true;
        } else {
            this.isOnGround = false;
        }
    }

    takeDamage(amount) {
        if (this.isDead) return;
        this.health -= amount;
        const flash = document.getElementById('damage-flash');
        if (flash) {
            flash.style.opacity = '1';
            setTimeout(() => flash.style.opacity = '0', 100);
        }
        if (this.health <= 0) {
            this.health = 0;
            this.die();
        }
    }

    die() {
        this.isDead = true;
        if (document.pointerLockElement) document.exitPointerLock();
    }

    reset() {
        this.health = this.maxHealth;
        this.isDead = false;
        this.camera.position.set(0, this.playerHeight, 5);
        this.camera.rotation.set(0, 0, 0);
        this.velocityY = 0;
        this.isOnGround = true;
        this.moveF = this.moveB = this.moveL = this.moveR = false;
        this.sprint = this.jump = false;
    }

    getPosition() {
        return this.camera.position;
    }

    lock() {
        this.domElement.requestPointerLock();
    }

    unlock() {
        if (document.pointerLockElement) document.exitPointerLock();
    }

    get isLocked() {
        return this._isLocked;
    }

    get controls() {
        return {
            isLocked: this._isLocked,
            lock: () => this.lock(),
            unlock: () => this.unlock(),
            addEventListener: (event, cb) => this.domElement.addEventListener(event, cb)
        };
    }
}
