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
        this.crouchSpeed = 2;
        this.jumpForce = 8;
        this.gravity = 20;
        this.standHeight = 1.6;
        this.crouchHeight = 1.0;
        this.playerHeight = 1.6;
        this.playerRadius = 0.4;

        // Peek/Lean settings
        this.peekAngle = 15 * Math.PI / 180; // 15 degrees tilt
        this.peekOffset = 0.4; // Horizontal offset when leaning
        this.peekSpeed = 8; // Transition speed

        // Mouse sensitivity (radians per pixel)
        this.sensitivity = 0.002;

        // State
        this.health = 100;
        this.maxHealth = 100;
        this.isDead = false;
        this._isLocked = false;
        this.isOnGround = true;
        this.isCrouching = false;
        this.velocityY = 0;

        // Peek state
        this.currentPeekAngle = 0;
        this.currentPeekOffset = 0;
        this.targetPeekAngle = 0;
        this.targetPeekOffset = 0;

        // Input flags - using direct booleans for speed
        this.moveF = false;
        this.moveB = false;
        this.moveL = false;
        this.moveR = false;
        this.sprint = false;
        this.jump = false;
        this.crouch = false;
        this.peekLeft = false;
        this.peekRight = false;

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
            case 'Space': if (this.isOnGround && !this.isCrouching) this.jump = true; break;
            case 'KeyC': this.crouch = true; break;
            case 'KeyQ': this.peekLeft = true; break;
            case 'KeyE': this.peekRight = true; break;
        }
    }

    _onKeyUp(e) {
        switch (e.code) {
            case 'KeyW': case 'ArrowUp': this.moveF = false; break;
            case 'KeyS': case 'ArrowDown': this.moveB = false; break;
            case 'KeyA': case 'ArrowLeft': this.moveL = false; break;
            case 'KeyD': case 'ArrowRight': this.moveR = false; break;
            case 'ShiftLeft': case 'ShiftRight': this.sprint = false; break;
            case 'KeyC': this.crouch = false; break;
            case 'KeyQ': this.peekLeft = false; break;
            case 'KeyE': this.peekRight = false; break;
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

        // Undo previous peek offset before physics
        if (this._peekOffsetX !== undefined) {
            this.camera.position.x -= this._peekOffsetX;
            this.camera.position.z -= this._peekOffsetZ;
        }

        // Cap delta to prevent explosion
        if (dt > 0.1) dt = 0.1;

        // Handle crouch state (hold to crouch)
        this.isCrouching = this.crouch;

        // Smooth height transition (8 units/sec for snappy feel)
        const targetHeight = this.isCrouching ? this.crouchHeight : this.standHeight;
        if (this.playerHeight !== targetHeight) {
            const heightDiff = targetHeight - this.playerHeight;
            const maxChange = 8 * dt;
            this.playerHeight += Math.abs(heightDiff) < maxChange ? heightDiff : Math.sign(heightDiff) * maxChange;
        }

        // Speed: crouch < walk < sprint (can't sprint while crouching)
        const speed = this.isCrouching ? this.crouchSpeed : (this.sprint ? this.sprintSpeed : this.walkSpeed);
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

        // Peek/Lean update
        if (this.peekLeft && !this.peekRight) {
            this.targetPeekAngle = this.peekAngle;
            this.targetPeekOffset = -this.peekOffset;
        } else if (this.peekRight && !this.peekLeft) {
            this.targetPeekAngle = -this.peekAngle;
            this.targetPeekOffset = this.peekOffset;
        } else {
            this.targetPeekAngle = 0;
            this.targetPeekOffset = 0;
        }

        // Smooth interpolation for peek
        const peekLerp = 1 - Math.exp(-this.peekSpeed * dt);
        this.currentPeekAngle += (this.targetPeekAngle - this.currentPeekAngle) * peekLerp;
        this.currentPeekOffset += (this.targetPeekOffset - this.currentPeekOffset) * peekLerp;

        // Apply peek tilt (Z rotation)
        this.camera.rotation.z = this.currentPeekAngle;

        // Apply horizontal offset based on camera yaw
        // Calculate lateral offset in world space
        const peekYaw = this.camera.rotation.y;
        const offsetX = Math.cos(peekYaw) * this.currentPeekOffset;
        const offsetZ = -Math.sin(peekYaw) * this.currentPeekOffset;

        // Store base position and add offset for rendering
        // (offset is visual only, collision uses base pos)
        this.camera.position.x += offsetX;
        this.camera.position.z += offsetZ;

        // Store for next frame to undo
        this._peekOffsetX = offsetX;
        this._peekOffsetZ = offsetZ;
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
        this.playerHeight = this.standHeight;
        this.isCrouching = false;
        this.camera.position.set(0, this.playerHeight, 5);
        this.camera.rotation.set(0, 0, 0);
        this.velocityY = 0;
        this.isOnGround = true;
        this.moveF = this.moveB = this.moveL = this.moveR = false;
        this.sprint = this.jump = this.crouch = false;
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
