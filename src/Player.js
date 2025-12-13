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

        // Peek/Lean settings (Delta Force style - dramatic body lean)
        this.peekAngle = 10 * Math.PI / 180; // 20 degrees tilt (more dramatic)
        this.peekOffset = 0.7; // Larger horizontal offset for full body lean
        this.peekDropHeight = 0.15; // Vertical drop when leaning
        this.peekSpeed = 8; // Faster, snappier transition

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
        this.velocityX = 0; // Horizontal velocity for air momentum
        this.velocityZ = 0;
        this.airControl = 0.3; // How much control player has in air (0-1)

        // Peek state
        this.currentPeekAngle = 0;
        this.currentPeekOffset = 0;
        this.currentPeekDrop = 0; // Vertical drop when leaning
        this.targetPeekAngle = 0;
        this.targetPeekOffset = 0;
        this.targetPeekDrop = 0;

        // Audio callbacks
        this.onFootstep = null;
        this.onJump = null;
        this.onLand = null;
        this.footstepTimer = 0;
        this.wasInAir = false;

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

        // Undo previous peek offset before physics (including vertical drop)
        if (this._peekOffsetX !== undefined) {
            this.camera.position.x -= this._peekOffsetX;
            this.camera.position.z -= this._peekOffsetZ;
            this.camera.position.y -= this._peekOffsetY;
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
        let inputX = 0, inputZ = 0;

        if (this.moveF) { inputX -= s; inputZ -= c; }
        if (this.moveB) { inputX += s; inputZ += c; }
        if (this.moveR) { inputX += c; inputZ -= s; }
        if (this.moveL) { inputX -= c; inputZ += s; }

        // Normalize if moving diagonally
        const len = Math.sqrt(inputX * inputX + inputZ * inputZ);
        if (len > 0) {
            const inv = speed / len;
            inputX *= inv;
            inputZ *= inv;
        }

        // Apply movement based on ground/air state
        if (this.isOnGround) {
            // Ground movement with smooth acceleration/deceleration
            const groundAccel = 15; // How fast player accelerates
            const groundFriction = 8; // How fast player decelerates when no input

            if (len > 0) {
                // Accelerate towards target velocity
                const accelRate = groundAccel * dt;
                this.velocityX += (inputX - this.velocityX) * Math.min(1, accelRate);
                this.velocityZ += (inputZ - this.velocityZ) * Math.min(1, accelRate);
            } else {
                // Apply friction when no input - smooth deceleration
                const frictionRate = 1 - Math.min(1, groundFriction * dt);
                this.velocityX *= frictionRate;
                this.velocityZ *= frictionRate;

                // Stop completely at very low speeds to avoid sliding forever
                if (Math.abs(this.velocityX) < 0.01) this.velocityX = 0;
                if (Math.abs(this.velocityZ) < 0.01) this.velocityZ = 0;
            }
        } else {
            // In air: preserve momentum, allow limited air steering
            if (len > 0) {
                // Add air control (player can slightly steer mid-air)
                this.velocityX += inputX * this.airControl * dt * 10;
                this.velocityZ += inputZ * this.airControl * dt * 10;

                // Cap air velocity to not exceed ground speed
                const airSpeed = Math.sqrt(this.velocityX * this.velocityX + this.velocityZ * this.velocityZ);
                if (airSpeed > speed) {
                    const airInv = speed / airSpeed;
                    this.velocityX *= airInv;
                    this.velocityZ *= airInv;
                }
            }
            // Minimal air friction - momentum is mostly preserved
            // This ensures player completes their arc when releasing keys
            this.velocityX *= 0.999;
            this.velocityZ *= 0.999;
        }

        // Jump
        if (this.jump && this.isOnGround) {
            this.velocityY = this.jumpForce;
            this.isOnGround = false;
            this.jump = false;
            this.wasInAir = true;
            if (this.onJump) this.onJump();
        }

        // Gravity
        this.velocityY -= this.gravity * dt;

        // === ROBUST COLLISION WITH SWEPT TESTING AND PUSH-OUT ===
        const pos = this.camera.position;

        // Calculate movement deltas
        const deltaX = this.velocityX * dt;
        const deltaY = this.velocityY * dt;
        const deltaZ = this.velocityZ * dt;

        // Movement step size for sub-stepping (smaller = more accurate but slower)
        const stepSize = this.playerRadius * 0.5;
        const totalDist = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
        const steps = Math.max(1, Math.ceil(totalDist / stepSize));

        // Sub-step horizontal movement to prevent tunneling
        for (let i = 0; i < steps; i++) {
            const stepFraction = 1 / steps;
            const stepDeltaX = deltaX * stepFraction;
            const stepDeltaZ = deltaZ * stepFraction;

            // X collision
            this._testPos.set(pos.x + stepDeltaX, pos.y, pos.z);
            if (!this.arena.checkCollision(this._testPos, this.playerRadius)) {
                pos.x = this._testPos.x;
            } else {
                this.velocityX = 0;
                break; // Stop sub-stepping on collision
            }

            // Z collision
            this._testPos.set(pos.x, pos.y, pos.z + stepDeltaZ);
            if (!this.arena.checkCollision(this._testPos, this.playerRadius)) {
                pos.z = this._testPos.z;
            } else {
                this.velocityZ = 0;
                break;
            }
        }

        // Y movement with ceiling collision
        if (deltaY > 0) {
            // Moving up - check ceiling
            const ceiling = this.arena.checkCeilingCollision(pos, this.playerRadius, this.playerHeight, deltaY);
            if (ceiling) {
                // Hit ceiling, stop upward movement
                this.velocityY = 0;
            } else {
                pos.y += deltaY;
            }
        } else {
            // Moving down - just apply gravity
            pos.y += deltaY;
        }

        // Ground check with radius consideration
        const groundY = this.arena.getFloorHeightWithRadius(pos.x, pos.z, this.playerRadius) + this.playerHeight;
        if (pos.y <= groundY) {
            pos.y = groundY;
            // Landing sound
            if (this.wasInAir && this.onLand) {
                this.onLand();
            }
            this.wasInAir = false;
            this.velocityY = 0;
            this.isOnGround = true;
        } else {
            this.isOnGround = false;
            this.wasInAir = true;
        }

        // === SAFETY: Push out if somehow stuck inside a collider ===
        const pushed = this.arena.resolveCollision(pos, this.playerRadius, this.playerHeight);
        if (pushed) {
            // Cancel velocity if we had to push out
            this.velocityX *= 0.5;
            this.velocityZ *= 0.5;
        }

        // Footstep sounds - only when moving on ground
        if (this.isOnGround && len > 0) {
            const stepInterval = this.sprint ? 0.3 : 0.45; // Faster steps when sprinting
            this.footstepTimer += dt;
            if (this.footstepTimer >= stepInterval) {
                this.footstepTimer = 0;
                if (this.onFootstep) this.onFootstep(this.sprint);
            }
        } else {
            this.footstepTimer = 0;
        }

        // Peek/Lean update (Delta Force style - full body lean)
        if (this.peekLeft && !this.peekRight) {
            this.targetPeekAngle = this.peekAngle;
            this.targetPeekOffset = -this.peekOffset;
            this.targetPeekDrop = -this.peekDropHeight; // Drop down when leaning
        } else if (this.peekRight && !this.peekLeft) {
            this.targetPeekAngle = -this.peekAngle;
            this.targetPeekOffset = this.peekOffset;
            this.targetPeekDrop = -this.peekDropHeight; // Drop down when leaning
        } else {
            this.targetPeekAngle = 0;
            this.targetPeekOffset = 0;
            this.targetPeekDrop = 0;
        }

        // Smooth interpolation for peek (fast & snappy like Delta Force)
        const peekLerp = 1 - Math.exp(-this.peekSpeed * dt);
        this.currentPeekAngle += (this.targetPeekAngle - this.currentPeekAngle) * peekLerp;
        this.currentPeekOffset += (this.targetPeekOffset - this.currentPeekOffset) * peekLerp;
        this.currentPeekDrop += (this.targetPeekDrop - this.currentPeekDrop) * peekLerp;

        // Apply peek tilt (Z rotation) - dramatic body tilt
        this.camera.rotation.z = this.currentPeekAngle;

        // Calculate lateral offset in world space based on camera yaw
        const peekYaw = this.camera.rotation.y;
        const offsetX = Math.cos(peekYaw) * this.currentPeekOffset;
        const offsetZ = -Math.sin(peekYaw) * this.currentPeekOffset;

        // Slight forward lean when peeking (body leans around corner)
        const peekAmount = Math.abs(this.currentPeekOffset) / this.peekOffset;
        const forwardLean = peekAmount * 0.15; // Lean forward slightly
        const forwardX = -Math.sin(peekYaw) * forwardLean;
        const forwardZ = -Math.cos(peekYaw) * forwardLean;

        // Store base position and add offset for rendering
        // (offset is visual only, collision uses base pos)
        this.camera.position.x += offsetX + forwardX;
        this.camera.position.z += offsetZ + forwardZ;
        this.camera.position.y += this.currentPeekDrop;

        // Store for next frame to undo
        this._peekOffsetX = offsetX + forwardX;
        this._peekOffsetZ = offsetZ + forwardZ;
        this._peekOffsetY = this.currentPeekDrop;
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
