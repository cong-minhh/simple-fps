// Player.js - Optimized CS:GO-style FPS camera and movement
import * as THREE from 'three';

export class Player {
    constructor(camera, domElement, arena) {
        this.camera = camera;
        this.domElement = domElement;
        this.arena = arena;

        // Movement settings
        this.walkSpeed = 4;
        this.sprintSpeed = 6;
        this.jumpForce = 8;
        this.gravity = 20;

        // Camera settings
        this.sensitivity = 0.0015;
        this.maxDelta = 150;
        this.pitch = 0;
        this.yaw = 0;
        this.targetPitch = 0;
        this.targetYaw = 0;
        this.pitchMin = -1.553;
        this.pitchMax = 1.553;

        // Cached objects (avoid GC stutters)
        this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this._moveDir = new THREE.Vector3();
        this._testPos = new THREE.Vector3();

        // State
        this.velocity = new THREE.Vector3();
        this.isOnGround = true;
        this.health = 100;
        this.maxHealth = 100;
        this.isDead = false;
        this._isLocked = false;
        this._skipNextMouse = false;
        this._hasMouseInput = false;

        // Input state - using object for cleaner access
        this.input = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            sprint: false,
            jump: false
        };

        // Physics
        this.playerHeight = 1.6;
        this.playerRadius = 0.4;

        // Initialize camera position and rotation
        this.camera.position.set(0, this.playerHeight, 5);
        this._syncRotation();

        // Setup event listeners
        this._setupEvents();
    }

    _setupEvents() {
        // Use bound functions stored as properties for proper removal if needed
        this._onMouseMove = (e) => {
            if (!this._isLocked || this.isDead) return;
            if (this._skipNextMouse) {
                this._skipNextMouse = false;
                return;
            }

            let dx = e.movementX || 0;
            let dy = e.movementY || 0;

            // Filter extreme values (prevents teleporting)
            if (Math.abs(dx) > this.maxDelta) dx = 0;
            if (Math.abs(dy) > this.maxDelta) dy = 0;

            // Accumulate target rotation
            this.targetYaw -= dx * this.sensitivity;
            this.targetPitch -= dy * this.sensitivity;

            // Clamp pitch
            this.targetPitch = Math.max(this.pitchMin, Math.min(this.pitchMax, this.targetPitch));

            // Wrap yaw
            if (this.targetYaw > Math.PI) this.targetYaw -= Math.PI * 2;
            if (this.targetYaw < -Math.PI) this.targetYaw += Math.PI * 2;

            this._hasMouseInput = true;
        };

        this._onKeyDown = (e) => {
            if (this.isDead) return;
            this._setKey(e.code, true);
        };

        this._onKeyUp = (e) => {
            this._setKey(e.code, false);
        };

        this._onLockChange = () => {
            const wasLocked = this._isLocked;
            this._isLocked = document.pointerLockElement === this.domElement;

            if (this._isLocked && !wasLocked) {
                this._skipNextMouse = true;
                this.domElement.dispatchEvent(new CustomEvent('lock'));
            } else if (!this._isLocked && wasLocked) {
                this.domElement.dispatchEvent(new CustomEvent('unlock'));
            }
        };

        document.addEventListener('mousemove', this._onMouseMove, false);
        document.addEventListener('keydown', this._onKeyDown, false);
        document.addEventListener('keyup', this._onKeyUp, false);
        document.addEventListener('pointerlockchange', this._onLockChange, false);
    }

    _setKey(code, pressed) {
        switch (code) {
            case 'KeyW': case 'ArrowUp': this.input.forward = pressed; break;
            case 'KeyS': case 'ArrowDown': this.input.backward = pressed; break;
            case 'KeyA': case 'ArrowLeft': this.input.left = pressed; break;
            case 'KeyD': case 'ArrowRight': this.input.right = pressed; break;
            case 'ShiftLeft': case 'ShiftRight': this.input.sprint = pressed; break;
            case 'Space': this.input.jump = pressed; break;
        }
    }

    _syncRotation() {
        // Apply rotation using cached euler - no new object creation
        this._euler.set(this.pitch, this.yaw, 0, 'YXZ');
        this.camera.quaternion.setFromEuler(this._euler);
    }

    update(deltaTime) {
        if (this.isDead || !this._isLocked) return;

        // Clamp delta time
        deltaTime = Math.min(deltaTime, 0.05);

        // Apply accumulated mouse input (sync rotation in update loop)
        if (this._hasMouseInput) {
            this.pitch = this.targetPitch;
            this.yaw = this.targetYaw;
            this._syncRotation();
            this._hasMouseInput = false;
        }

        // Movement
        this._updateMovement(deltaTime);
        this._updatePhysics(deltaTime);
    }

    _updateMovement(dt) {
        const speed = this.input.sprint ? this.sprintSpeed : this.walkSpeed;
        const sin = Math.sin(this.yaw);
        const cos = Math.cos(this.yaw);

        // Reset velocity
        this.velocity.x = 0;
        this.velocity.z = 0;

        // Forward/backward (forward is -Z in Three.js default)
        if (this.input.forward) {
            this.velocity.x -= sin * speed;
            this.velocity.z -= cos * speed;
        }
        if (this.input.backward) {
            this.velocity.x += sin * speed;
            this.velocity.z += cos * speed;
        }

        // Left/right (strafe)
        if (this.input.right) {
            this.velocity.x += cos * speed;
            this.velocity.z -= sin * speed;
        }
        if (this.input.left) {
            this.velocity.x -= cos * speed;
            this.velocity.z += sin * speed;
        }

        // Normalize diagonal movement
        const hSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
        if (hSpeed > speed) {
            const scale = speed / hSpeed;
            this.velocity.x *= scale;
            this.velocity.z *= scale;
        }
    }

    _updatePhysics(dt) {
        const pos = this.camera.position;

        // Jump
        if (this.input.jump && this.isOnGround) {
            this.velocity.y = this.jumpForce;
            this.isOnGround = false;
        }

        // Gravity
        if (!this.isOnGround) {
            this.velocity.y -= this.gravity * dt;
        }

        // X movement with collision
        this._testPos.set(pos.x + this.velocity.x * dt, pos.y, pos.z);
        if (!this.arena.checkCollision(this._testPos, this.playerRadius)) {
            pos.x = this._testPos.x;
        }

        // Z movement with collision
        this._testPos.set(pos.x, pos.y, pos.z + this.velocity.z * dt);
        if (!this.arena.checkCollision(this._testPos, this.playerRadius)) {
            pos.z = this._testPos.z;
        }

        // Y movement
        pos.y += this.velocity.y * dt;

        // Ground check
        const groundY = this.arena.getFloorHeight(pos.x, pos.z) + this.playerHeight;
        if (pos.y <= groundY) {
            pos.y = groundY;
            this.velocity.y = 0;
            this.isOnGround = true;
        } else {
            this.isOnGround = false;
        }
    }

    takeDamage(amount) {
        if (this.isDead) return;
        this.health -= amount;
        this.showDamageEffect();
        if (this.health <= 0) {
            this.health = 0;
            this.die();
        }
    }

    showDamageEffect() {
        const flash = document.getElementById('damage-flash');
        if (flash) {
            flash.style.opacity = '1';
            setTimeout(() => flash.style.opacity = '0', 100);
        }
    }

    die() {
        this.isDead = true;
        this.unlock();
    }

    reset() {
        this.health = this.maxHealth;
        this.isDead = false;
        this.velocity.set(0, 0, 0);
        this.camera.position.set(0, this.playerHeight, 5);
        this.pitch = this.targetPitch = 0;
        this.yaw = this.targetYaw = 0;
        this._syncRotation();
        this.isOnGround = true;
        this._hasMouseInput = false;

        // Reset input
        for (const key in this.input) {
            this.input[key] = false;
        }
    }

    getPosition() {
        return this.camera.position.clone();
    }

    lock() {
        this.domElement.requestPointerLock();
    }

    unlock() {
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
    }

    get isLocked() {
        return this._isLocked;
    }

    get controls() {
        return {
            isLocked: this._isLocked,
            lock: () => this.lock(),
            unlock: () => this.unlock(),
            addEventListener: (evt, cb) => this.domElement.addEventListener(evt, cb)
        };
    }
}
