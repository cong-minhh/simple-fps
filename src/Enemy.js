// Enemy.js - Intelligent Enemy AI with FSM and A* Pathfinding
import * as THREE from 'three';
import { ENEMY_STATES as STATES, ENEMY_TYPES } from './config/GameConfig.js';

export { ENEMY_TYPES };

export class Enemy {
    constructor(scene, arena, position, pathfinder = null, type = 'NORMAL') {
        this.scene = scene;
        this.arena = arena;
        this.pathfinder = pathfinder;
        this.type = type;

        // Get type config
        const config = ENEMY_TYPES[type] || ENEMY_TYPES.NORMAL;

        // Stats from type
        this.health = config.health[0] + Math.random() * (config.health[1] - config.health[0]);
        this.maxHealth = this.health;
        this.speed = config.speed;
        this.detectionRange = 20;
        this.attackRange = config.attackRange;
        this.attackDamage = config.damage;
        this.attackCooldown = config.attackCooldown;
        this.lastAttackTime = 0;
        this.bodyColor = config.bodyColor;
        this.headColor = config.headColor;
        this.scale = config.scale;

        // Ranged attack properties
        this.isRanged = config.isRanged || false;
        this.projectileSpeed = config.projectileSpeed || 15;
        this.preferredRange = config.preferredRange || this.attackRange;
        this.aimTime = config.aimTime || 0;
        this.currentAimTime = 0;
        this.isAiming = false;
        this.projectileManager = null; // Set by WaveManager

        // Leap attack properties (Berserker)
        this.canLeap = config.canLeap || false;
        this.leapDamage = config.leapDamage || this.attackDamage;
        this.leapCooldown = config.leapCooldown || 3;
        this.lastLeapTime = 0;
        this.leapVelocity = new THREE.Vector3();
        this.isLeaping = false;

        // State
        this.state = STATES.PATROL;
        this.isDead = false;

        // Patrol
        this.currentWaypoint = arena.getRandomWaypoint();
        this.waypointThreshold = 0.5;

        // Pathfinding state (optimized - only recalculate when needed)
        this.currentPath = [];
        this.currentPathIndex = 0;
        this.pathUpdateInterval = 0.3; // Faster path updates for more responsive AI
        this.lastPathUpdate = 0;
        this.lastPlayerPos = new THREE.Vector3();

        // Combat behavior
        this.strafeDirection = Math.random() < 0.5 ? 1 : -1;
        this.strafeTimer = 0;
        this.strafeDuration = 1 + Math.random(); // 1-2 seconds per strafe
        this.retreatThreshold = 0.3; // Retreat when below 30% health

        // Collision settings
        this.collisionRadius = 0.4; // Enemy hitbox radius
        this.stuckTimer = 0;
        this.stuckThreshold = 0.5; // Faster stuck detection (0.5s)
        this.lastPosition = new THREE.Vector3();
        this.stuckRecoveryDir = new THREE.Vector3();
        this.stuckRecoveryTimer = 0; // Time spent in recovery mode

        // Create mesh
        this.mesh = this.createMesh();
        this.mesh.position.copy(position);
        this.mesh.userData.enemy = this;
        scene.add(this.mesh);

        // Create laser sight for SNIPER (visible when aiming)
        if (type === 'SNIPER') {
            this.createLaserSight();
        }

        // Reference to player (set by game)
        this.player = null;

        // Reusable vectors to avoid GC
        this._tempVec = new THREE.Vector3();
        this._moveDir = new THREE.Vector3();
        this._pushVec = new THREE.Vector3();
    }

    createMesh() {
        const group = new THREE.Group();

        // Body (improved capsule)
        const bodyGeometry = new THREE.CapsuleGeometry(0.25, 0.6, 4, 8);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: this.bodyColor,
            roughness: 0.4,
            metalness: 0.4,
            emissive: this.bodyColor,
            emissiveIntensity: 0.1
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.8;
        body.castShadow = true;
        group.add(body);

        // Shoulders
        const shoulderGeo = new THREE.SphereGeometry(0.15, 8, 8);
        const shoulderMat = new THREE.MeshStandardMaterial({ color: this.bodyColor, metalness: 0.5 });
        [-0.35, 0.35].forEach(x => {
            const shoulder = new THREE.Mesh(shoulderGeo, shoulderMat);
            shoulder.position.set(x, 1.1, 0);
            shoulder.castShadow = true;
            group.add(shoulder);
        });

        // Arms
        const armGeo = new THREE.CapsuleGeometry(0.08, 0.4, 4, 8);
        const armMat = new THREE.MeshStandardMaterial({ color: this.bodyColor, metalness: 0.3 });
        [-0.4, 0.4].forEach(x => {
            const arm = new THREE.Mesh(armGeo, armMat);
            arm.position.set(x, 0.7, 0);
            arm.castShadow = true;
            group.add(arm);
        });

        // Legs
        const legGeo = new THREE.CapsuleGeometry(0.1, 0.5, 4, 8);
        [-0.15, 0.15].forEach(x => {
            const leg = new THREE.Mesh(legGeo, armMat);
            leg.position.set(x, 0.25, 0);
            leg.castShadow = true;
            group.add(leg);
        });

        // Head (rounded box style)
        const headGeometry = new THREE.BoxGeometry(0.35, 0.35, 0.35);
        const headMaterial = new THREE.MeshStandardMaterial({
            color: this.headColor,
            roughness: 0.3,
            metalness: 0.3
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.45;
        head.castShadow = true;
        head.userData.isHead = true;
        group.add(head);

        // Glowing eyes
        const eyeGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        const eyeMaterial = new THREE.MeshBasicMaterial({
            color: this.type === 'BERSERKER' ? 0xff0000 : 0xffff00
        });

        [-0.08, 0.08].forEach(x => {
            const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            eye.position.set(x, 1.48, 0.18);
            group.add(eye);
        });

        // Type-specific features
        if (this.type === 'TANK') {
            // Armor plates
            const armorGeo = new THREE.BoxGeometry(0.5, 0.4, 0.15);
            const armorMat = new THREE.MeshStandardMaterial({ color: 0x3333aa, metalness: 0.8, roughness: 0.2 });
            const chest = new THREE.Mesh(armorGeo, armorMat);
            chest.position.set(0, 0.9, 0.2);
            group.add(chest);
        } else if (this.type === 'RUNNER') {
            // Sleek visor
            const visorGeo = new THREE.BoxGeometry(0.38, 0.1, 0.1);
            const visorMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            const visor = new THREE.Mesh(visorGeo, visorMat);
            visor.position.set(0, 1.5, 0.18);
            group.add(visor);
        } else if (this.type === 'BERSERKER') {
            // Spiky shoulders
            const spikeMat = new THREE.MeshStandardMaterial({ color: 0xff00ff, metalness: 0.7 });
            [-0.4, 0.4].forEach(x => {
                const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 4), spikeMat);
                spike.position.set(x, 1.3, 0);
                spike.rotation.z = x > 0 ? -0.5 : 0.5;
                group.add(spike);
            });
        }

        // Health bar background
        const healthBgGeometry = new THREE.PlaneGeometry(0.6, 0.08);
        const healthBgMaterial = new THREE.MeshBasicMaterial({
            color: 0x333333,
            side: THREE.DoubleSide
        });
        const healthBg = new THREE.Mesh(healthBgGeometry, healthBgMaterial);
        healthBg.position.y = 1.85;
        group.add(healthBg);

        // Health bar fill
        const healthBarGeometry = new THREE.PlaneGeometry(0.58, 0.06);
        const healthBarMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            side: THREE.DoubleSide
        });
        this.healthBar = new THREE.Mesh(healthBarGeometry, healthBarMaterial);
        this.healthBar.position.y = 1.85;
        this.healthBar.position.z = 0.01;
        group.add(this.healthBar);

        // Apply type-based scale
        group.scale.setScalar(this.scale);

        return group;
    }

    setPlayer(player) {
        this.player = player;
    }

    setPathfinder(pathfinder) {
        this.pathfinder = pathfinder;
    }

    update(deltaTime) {
        if (this.isDead || !this.player) return;

        const playerPos = this.player.getPosition();
        const myPos = this.mesh.position;
        // Use 2D distance for gameplay logic to ignore height differences
        const dx = myPos.x - playerPos.x;
        const dz = myPos.z - playerPos.z;
        const distanceToPlayer = Math.sqrt(dx * dx + dz * dz);
        const healthPercent = this.health / this.maxHealth;

        // Update timers
        this.strafeTimer += deltaTime;
        this.lastPathUpdate += deltaTime;

        // State machine with tactical decisions
        switch (this.state) {
            case STATES.PATROL:
                if (distanceToPlayer < this.detectionRange) {
                    // Ranged enemies prefer to shoot from distance
                    if (this.isRanged && distanceToPlayer < this.preferredRange * 1.5) {
                        this.state = STATES.ATTACK_RANGED;
                    } else {
                        this.state = STATES.CHASE;
                        this.requestPath(playerPos);
                    }
                } else {
                    this.patrol(deltaTime);
                }
                break;

            case STATES.CHASE:
                // Check for retreat condition (low health)
                if (healthPercent < this.retreatThreshold && Math.random() < 0.3) {
                    this.state = STATES.RETREAT;
                } else if (this.isRanged && distanceToPlayer <= this.attackRange) {
                    // Ranged enemies switch to shooting
                    this.state = STATES.ATTACK_RANGED;
                } else if (this.canLeap && distanceToPlayer > 3 && distanceToPlayer < 8) {
                    // Berserker leap opportunity
                    const currentTime = performance.now() / 1000;
                    if (currentTime - this.lastLeapTime > this.leapCooldown) {
                        this.state = STATES.LEAP;
                        this.startLeap(playerPos);
                    } else {
                        this.chase(deltaTime, playerPos);
                    }
                } else if (distanceToPlayer < this.attackRange) {
                    this.state = STATES.STRAFE; // Strafe while attacking (melee)
                } else if (distanceToPlayer > this.detectionRange * 1.5) {
                    this.state = STATES.PATROL;
                    this.currentWaypoint = this.arena.getRandomWaypoint();
                    this.currentPath = [];
                } else {
                    this.chase(deltaTime, playerPos);
                }
                break;

            case STATES.ATTACK_RANGED:
                // Ranged attack behavior with aiming
                if (distanceToPlayer > this.attackRange * 1.2) {
                    this.state = STATES.CHASE;
                    this.isAiming = false;
                    this.currentAimTime = 0;
                    this.updateLaserSight(false);
                } else if (distanceToPlayer < this.preferredRange * 0.5 && this.preferredRange > 3) {
                    // Too close - retreat for ranged enemies
                    this.state = STATES.RETREAT;
                    this.isAiming = false;
                    this.updateLaserSight(false);
                } else {
                    this.rangedAttack(deltaTime, playerPos);
                }
                break;

            case STATES.LEAP:
                // Execute leap attack
                this.updateLeap(deltaTime, playerPos);
                break;

            case STATES.STRAFE:
                // Strafe and attack simultaneously
                if (distanceToPlayer > this.attackRange * 1.5) {
                    this.state = STATES.CHASE;
                    this.requestPath(playerPos);
                } else if (healthPercent < this.retreatThreshold && Math.random() < 0.2) {
                    this.state = STATES.RETREAT;
                } else {
                    this.strafeAttack(deltaTime, playerPos);
                }
                break;

            case STATES.RETREAT:
                // Move away from player when low health
                if (healthPercent > this.retreatThreshold || distanceToPlayer > this.detectionRange) {
                    this.state = STATES.CHASE;
                } else {
                    this.retreat(deltaTime, playerPos);
                }
                break;

            case STATES.ATTACK:
                // Legacy state - redirect to strafe
                this.state = STATES.STRAFE;
                break;

            case STATES.FLANK:
                // Move to player's side
                this.flank(deltaTime, playerPos);
                if (distanceToPlayer < this.attackRange) {
                    this.state = STATES.STRAFE;
                }
                break;

            case STATES.IDLE:
                // Do nothing
                break;
        }

        // Update health bar to face camera
        if (this.healthBar) {
            // Fix: Rotate only the health bar, not the entire enemy group
            this.healthBar.lookAt(playerPos.x, playerPos.y, playerPos.z);
        }

        // Update health bar scale
        this.healthBar.scale.x = healthPercent;
        this.healthBar.position.x = (1 - healthPercent) * -0.29; // Center the scaling

        // Change health bar color based on health
        if (healthPercent < 0.3) {
            this.healthBar.material.color.setHex(0xff0000);
        } else if (healthPercent < 0.6) {
            this.healthBar.material.color.setHex(0xffaa00);
        }
    }

    requestPath(targetPos) {
        if (!this.pathfinder) return;

        // Check if player moved significantly (optimization)
        const playerMoved = this.lastPlayerPos.distanceTo(targetPos) > 1;

        if (this.lastPathUpdate >= this.pathUpdateInterval || playerMoved || this.currentPath.length === 0) {
            const path = this.pathfinder.findPath(this.mesh.position, targetPos);
            if (path && path.length > 0) {
                this.currentPath = path;
                this.currentPathIndex = 0;
            }
            this.lastPathUpdate = 0;
            this.lastPlayerPos.copy(targetPos);
        }
    }

    /**
     * Robust movement with separate axis testing and stuck recovery
     * Returns true if any movement occurred
     */
    tryMove(dx, dz, deltaTime) {
        const pos = this.mesh.position;
        const radius = this.collisionRadius;
        let moved = false;

        // Use ground level (y=1) for collision check - enemies are at floor level
        const checkY = 1;

        // Sub-stepping for high speed/low FPS stability
        const steps = Math.ceil(this.speed * deltaTime / (this.collisionRadius * 0.5));
        const stepDx = dx / steps;
        const stepDz = dz / steps;

        for (let i = 0; i < steps; i++) {
            // First try moving both axes together
            this._tempVec.set(pos.x + stepDx, checkY, pos.z + stepDz);
            if (!this.arena.checkCollision(this._tempVec, radius)) {
                pos.x += stepDx;
                pos.z += stepDz;
                moved = true;
            } else {
                // Try X movement separately
                this._tempVec.set(pos.x + stepDx, checkY, pos.z);
                let movedX = false;
                if (!this.arena.checkCollision(this._tempVec, radius)) {
                    pos.x += stepDx;
                    moved = true;
                    movedX = true;
                }

                // Try Z movement separately
                this._tempVec.set(pos.x, checkY, pos.z + stepDz);
                if (!this.arena.checkCollision(this._tempVec, radius)) {
                    pos.z += stepDz;
                    moved = true;
                } else if (!movedX) {
                    // Blocked on both - stop this sub-step
                    break;
                }
            }
        }

        // Stuck detection - if not moving much, try to recover
        const distMoved = pos.distanceTo(this.lastPosition);
        if (distMoved < 0.01 * deltaTime) { // Adjusted threshold for time
            this.stuckTimer += deltaTime;

            if (this.stuckTimer > this.stuckThreshold) {
                // Push away from collisions
                this.pushOutOfCollision();
                this.stuckTimer = 0;

                // Request new path if we have pathfinder
                if (this.pathfinder && this.player) {
                    this.currentPath = [];
                    this.lastPathUpdate = this.pathUpdateInterval; // Force recalc
                }
            }
        } else {
            this.stuckTimer = 0;
        }

        this.lastPosition.copy(pos);
        return moved;
    }

    /**
     * Push enemy out of any collisions they're inside
     */
    pushOutOfCollision() {
        const pos = this.mesh.position;
        const radius = this.collisionRadius;
        const checkY = 1; // Same Y level as tryMove

        // Check current position
        this._tempVec.set(pos.x, checkY, pos.z);
        const collider = this.arena.checkCollision(this._tempVec, radius);

        if (collider) {
            // Calculate push direction (away from collider center)
            const colliderCenterX = (collider.min.x + collider.max.x) / 2;
            const colliderCenterZ = (collider.min.z + collider.max.z) / 2;

            this._pushVec.set(pos.x - colliderCenterX, 0, pos.z - colliderCenterZ);
            const len = this._pushVec.length();

            if (len > 0.01) {
                this._pushVec.divideScalar(len); // Normalize

                // Push out incrementally
                for (let i = 0; i < 10; i++) {
                    pos.x += this._pushVec.x * 0.15;
                    pos.z += this._pushVec.z * 0.15;

                    this._tempVec.set(pos.x, checkY, pos.z);
                    if (!this.arena.checkCollision(this._tempVec, radius)) {
                        break; // We're out!
                    }
                }
            } else {
                // Random push if at center
                pos.x += (Math.random() - 0.5) * 0.8;
                pos.z += (Math.random() - 0.5) * 0.8;
            }
        }
    }

    patrol(deltaTime) {
        const direction = this._moveDir;
        direction.subVectors(this.currentWaypoint, this.mesh.position);
        direction.y = 0;

        if (direction.lengthSq() < 0.01) {
            this.currentWaypoint = this.arena.getRandomWaypoint();
            return;
        }

        direction.normalize();

        // Move towards waypoint with collision checking
        const dx = direction.x * this.speed * deltaTime;
        const dz = direction.z * this.speed * deltaTime;
        this.tryMove(dx, dz, deltaTime);

        // Look in movement direction
        this.mesh.lookAt(
            this.mesh.position.x + direction.x,
            this.mesh.position.y,
            this.mesh.position.z + direction.z
        );

        // Check if reached waypoint
        const distToWaypoint = this.mesh.position.distanceTo(this.currentWaypoint);
        if (distToWaypoint < this.waypointThreshold) {
            this.currentWaypoint = this.arena.getRandomWaypoint();
        }
    }

    chase(deltaTime, playerPos) {
        // Request path update if needed
        this.requestPath(playerPos);

        // Follow path if available
        if (this.currentPath.length > 0 && this.currentPathIndex < this.currentPath.length) {
            const target = this.currentPath[this.currentPathIndex];
            const direction = this._moveDir;
            direction.subVectors(target, this.mesh.position);
            direction.y = 0;

            const distToWaypoint = direction.length();

            if (distToWaypoint < 0.5) {
                this.currentPathIndex++;
            } else {
                direction.normalize();

                // Move with robust collision checking
                const dx = direction.x * this.speed * deltaTime;
                const dz = direction.z * this.speed * deltaTime;
                this.tryMove(dx, dz, deltaTime);

                // Look at movement direction
                this.mesh.lookAt(
                    this.mesh.position.x + direction.x,
                    this.mesh.position.y,
                    this.mesh.position.z + direction.z
                );
            }
        } else {
            // Fallback: direct movement if no path
            this.directChase(deltaTime, playerPos);
        }
    }

    directChase(deltaTime, playerPos) {
        const direction = this._moveDir;
        direction.subVectors(playerPos, this.mesh.position);
        direction.y = 0;
        direction.normalize();

        const dx = direction.x * this.speed * deltaTime;
        const dz = direction.z * this.speed * deltaTime;

        if (!this.tryMove(dx, dz, deltaTime)) {
            // Blocked - try perpendicular movement to go around obstacle
            const perpX = direction.z * this.strafeDirection;
            const perpZ = -direction.x * this.strafeDirection;

            if (!this.tryMove(perpX * this.speed * deltaTime, perpZ * this.speed * deltaTime, deltaTime)) {
                // Both blocked - flip strafe direction for next time
                this.strafeDirection *= -1;
            }
        }

        this.mesh.lookAt(playerPos.x, this.mesh.position.y, playerPos.z);
    }

    strafeAttack(deltaTime, playerPos) {
        // Change strafe direction periodically
        if (this.strafeTimer > this.strafeDuration) {
            this.strafeDirection *= -1;
            this.strafeTimer = 0;
            this.strafeDuration = 0.5 + Math.random() * 1.5; // Variable 0.5-2s
        }

        // Calculate strafe direction (perpendicular to player)
        const toPlayer = this._moveDir;
        toPlayer.subVectors(playerPos, this.mesh.position);
        toPlayer.y = 0;
        toPlayer.normalize();

        // Perpendicular vector for strafing
        const strafeX = toPlayer.z * this.strafeDirection;
        const strafeZ = -toPlayer.x * this.strafeDirection;

        // Variable strafe speed based on type
        let speedMult = 0.6;
        if (this.type === 'RUNNER') speedMult = 0.9; // Fast strafe
        if (this.type === 'TANK') speedMult = 0.3; // Slow but steady
        if (this.type === 'BERSERKER') speedMult = 0.7 + Math.sin(this.strafeTimer * 8) * 0.2; // Erratic

        const strafeSpeed = this.speed * speedMult;
        let dx = strafeX * strafeSpeed * deltaTime;
        let dz = strafeZ * strafeSpeed * deltaTime;

        // Dodge mechanic - random quick side-step (more frequent for aggressive types)
        const dodgeChance = this.type === 'BERSERKER' ? 0.02 :
            this.type === 'RUNNER' ? 0.015 : 0.005;
        if (Math.random() < dodgeChance) {
            // Quick dodge burst
            dx *= 3;
            dz *= 3;
            this.strafeDirection *= -1; // Flip direction after dodge
        }

        if (!this.tryMove(dx, dz, deltaTime)) {
            // Couldn't move, reverse strafe direction
            this.strafeDirection *= -1;
        }

        // Always face player
        this.mesh.lookAt(playerPos.x, this.mesh.position.y, playerPos.z);

        // Attack while strafing
        this.attack(deltaTime);
    }

    retreat(deltaTime, playerPos) {
        // Move away from player
        const away = this._moveDir;
        away.subVectors(this.mesh.position, playerPos);
        away.y = 0;
        away.normalize();

        const retreatSpeed = this.speed * 0.8;
        const dx = away.x * retreatSpeed * deltaTime;
        const dz = away.z * retreatSpeed * deltaTime;

        if (!this.tryMove(dx, dz, deltaTime)) {
            // Can't retreat further, switch to strafe
            this.state = STATES.STRAFE;
        }

        // Keep facing player while retreating
        this.mesh.lookAt(playerPos.x, this.mesh.position.y, playerPos.z);
    }

    flank(deltaTime, playerPos) {
        // Try to move to player's side
        const toPlayer = this._moveDir;
        toPlayer.subVectors(playerPos, this.mesh.position);
        toPlayer.y = 0;

        // Get perpendicular direction
        const flankX = toPlayer.z * this.strafeDirection;
        const flankZ = -toPlayer.x * this.strafeDirection;

        // Also move closer
        toPlayer.normalize();
        const dx = (toPlayer.x * 0.5 + flankX * 0.5) * this.speed * deltaTime;
        const dz = (toPlayer.z * 0.5 + flankZ * 0.5) * this.speed * deltaTime;

        this.tryMove(dx, dz, deltaTime);

        this.mesh.lookAt(playerPos.x, this.mesh.position.y, playerPos.z);
    }

    attack(deltaTime) {
        const currentTime = performance.now() / 1000;

        if (currentTime - this.lastAttackTime >= this.attackCooldown) {
            this.lastAttackTime = currentTime;

            // Deal damage to player
            if (this.player && !this.player.isDead) {
                this.player.takeDamage(this.attackDamage);

                // Attack animation (simple scale pulse)
                this.animateAttack();
            }
        }
    }

    animateAttack() {
        const originalScale = 1;
        const attackScale = 1.2;

        this.mesh.scale.setScalar(attackScale);

        setTimeout(() => {
            if (this.mesh) {
                this.mesh.scale.setScalar(originalScale);
            }
        }, 100);
    }

    takeDamage(amount) {
        if (this.isDead) return false;

        this.health -= amount;

        // Damage flash
        this.mesh.children.forEach(child => {
            if (child.material && child.material.color) {
                const originalColor = child.material.color.getHex();
                child.material.color.setHex(0xffffff);
                setTimeout(() => {
                    if (child.material) {
                        child.material.color.setHex(originalColor);
                    }
                }, 50);
            }
        });

        if (this.health <= 0) {
            this.die();
            return true; // Killed
        }
        return false;
    }

    die() {
        this.isDead = true;
        this.state = STATES.IDLE;

        // Death animation - shrink and fade
        const duration = 300;
        const startTime = performance.now();

        const animate = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            this.mesh.scale.setScalar(1 - progress);
            this.mesh.position.y = -progress * 0.5;

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.dispose();
            }
        };
        animate();
    }

    dispose() {
        this.scene.remove(this.mesh);
        if (this.laserLine) {
            this.scene.remove(this.laserLine);
        }
        this.mesh.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
    }

    // === NEW COMBAT METHODS ===

    setProjectileManager(manager) {
        this.projectileManager = manager;
    }

    createLaserSight() {
        // Laser sight line for SNIPER enemies
        const laserMat = new THREE.LineBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.6,
            linewidth: 2
        });
        const points = [new THREE.Vector3(), new THREE.Vector3()];
        const laserGeo = new THREE.BufferGeometry().setFromPoints(points);
        this.laserLine = new THREE.Line(laserGeo, laserMat);
        this.laserLine.visible = false;
        this.scene.add(this.laserLine);
    }

    updateLaserSight(visible, targetPos = null) {
        if (!this.laserLine) return;

        this.laserLine.visible = visible;
        if (visible && targetPos) {
            const positions = this.laserLine.geometry.attributes.position.array;
            const myPos = this.mesh.position;
            // Start from enemy head height
            positions[0] = myPos.x;
            positions[1] = myPos.y + 1.4 * this.scale;
            positions[2] = myPos.z;
            // End at player position
            positions[3] = targetPos.x;
            positions[4] = targetPos.y;
            positions[5] = targetPos.z;
            this.laserLine.geometry.attributes.position.needsUpdate = true;

            // Pulse opacity based on aim progress
            this.laserLine.material.opacity = 0.3 + (this.currentAimTime / this.aimTime) * 0.5;
        }
    }

    rangedAttack(deltaTime, playerPos) {
        if (!this.projectileManager) return;

        const currentTime = performance.now() / 1000;
        const timeSinceLastAttack = currentTime - this.lastAttackTime;

        // Face the player while aiming
        this.mesh.lookAt(playerPos.x, this.mesh.position.y, playerPos.z);

        // Start aiming
        if (!this.isAiming && timeSinceLastAttack >= this.attackCooldown) {
            this.isAiming = true;
            this.currentAimTime = 0;
        }

        // Update aim
        if (this.isAiming) {
            this.currentAimTime += deltaTime;
            this.updateLaserSight(true, playerPos);

            // Fire when aim complete
            if (this.currentAimTime >= this.aimTime) {
                const myPos = this.mesh.position;
                const origin = this._tempVec.set(
                    myPos.x,
                    myPos.y + 1.2 * this.scale,
                    myPos.z
                );

                // Fire projectile
                this.projectileManager.fire(
                    origin,
                    playerPos,
                    this.attackDamage,
                    this.projectileSpeed
                );

                this.lastAttackTime = currentTime;
                this.isAiming = false;
                this.currentAimTime = 0;
                this.updateLaserSight(false);

                // Shoot animation
                this.animateAttack();
            }
        }

        // Light strafe while shooting
        const strafeSpeed = this.speed * 0.3;
        const toPlayer = this._moveDir;
        toPlayer.subVectors(playerPos, this.mesh.position);
        toPlayer.y = 0;
        toPlayer.normalize();

        const perpX = toPlayer.z * this.strafeDirection;
        const perpZ = -toPlayer.x * this.strafeDirection;

        this.tryMove(perpX * strafeSpeed * deltaTime, perpZ * strafeSpeed * deltaTime, deltaTime);

        // Occasionally change strafe direction
        this.strafeTimer += deltaTime;
        if (this.strafeTimer > this.strafeDuration) {
            this.strafeDirection *= -1;
            this.strafeTimer = 0;
        }
    }

    startLeap(targetPos) {
        this.isLeaping = true;
        this.lastLeapTime = performance.now() / 1000;

        // Calculate leap velocity - arc toward player
        const myPos = this.mesh.position;
        const dx = targetPos.x - myPos.x;
        const dz = targetPos.z - myPos.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        // Horizontal velocity
        const leapSpeed = 12;
        this.leapVelocity.x = (dx / distance) * leapSpeed;
        this.leapVelocity.z = (dz / distance) * leapSpeed;
        // Vertical arc
        this.leapVelocity.y = 6;
    }

    updateLeap(deltaTime, playerPos) {
        if (!this.isLeaping) {
            this.state = STATES.CHASE;
            return;
        }

        const myPos = this.mesh.position;

        // Apply gravity
        this.leapVelocity.y -= 15 * deltaTime;

        // Move
        myPos.x += this.leapVelocity.x * deltaTime;
        myPos.y += this.leapVelocity.y * deltaTime;
        myPos.z += this.leapVelocity.z * deltaTime;

        // Face player during leap
        this.mesh.lookAt(playerPos.x, myPos.y, playerPos.z);

        // Check for landing
        const floorHeight = this.arena.getFloorHeight(myPos.x, myPos.z);
        if (myPos.y <= floorHeight) {
            myPos.y = floorHeight;
            this.isLeaping = false;

            // Deal damage if close to player on landing
            const distToPlayer = myPos.distanceTo(playerPos);
            if (distToPlayer < 2.5 && this.player && !this.player.isDead) {
                this.player.takeDamage(this.leapDamage);

                // Impact animation
                this.mesh.scale.setScalar(1.3);
                setTimeout(() => {
                    if (this.mesh) this.mesh.scale.setScalar(this.scale);
                }, 150);
            }

            // Return to chase state
            this.state = STATES.CHASE;
        }
    }

    getMesh() {
        return this.mesh;
    }
}
