// Enemy.js - Enemy AI with FSM (PATROL → CHASE → ATTACK)
import * as THREE from 'three';

// Enemy states
const STATES = {
    PATROL: 'PATROL',
    CHASE: 'CHASE',
    ATTACK: 'ATTACK',
    IDLE: 'IDLE'
};

export class Enemy {
    constructor(scene, arena, position) {
        this.scene = scene;
        this.arena = arena;

        // Stats
        this.health = 40 + Math.random() * 20; // 40-60 HP
        this.maxHealth = this.health;
        this.speed = 2.5;
        this.detectionRange = 20;
        this.attackRange = 2;
        this.attackDamage = 10;
        this.attackCooldown = 0.8;
        this.lastAttackTime = 0;

        // State
        this.state = STATES.PATROL;
        this.isDead = false;

        // Patrol
        this.currentWaypoint = arena.getRandomWaypoint();
        this.waypointThreshold = 0.5;

        // Create mesh
        this.mesh = this.createMesh();
        this.mesh.position.copy(position);
        this.mesh.userData.enemy = this;
        scene.add(this.mesh);

        // Reference to player (set by game)
        this.player = null;
    }

    createMesh() {
        const group = new THREE.Group();

        // Body (capsule approximation using cylinder + spheres)
        const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1, 8);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0xff4444,
            roughness: 0.5,
            metalness: 0.3
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.7;
        body.castShadow = true;
        group.add(body);

        // Head (cube)
        const headGeometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0xffaaaa,
            roughness: 0.4,
            metalness: 0.2
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.4;
        head.castShadow = true;
        group.add(head);

        // Eyes
        const eyeGeometry = new THREE.SphereGeometry(0.06, 6, 6);
        const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });

        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.1, 1.45, 0.2);
        group.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.1, 1.45, 0.2);
        group.add(rightEye);

        // Health bar background
        const healthBgGeometry = new THREE.PlaneGeometry(0.6, 0.08);
        const healthBgMaterial = new THREE.MeshBasicMaterial({
            color: 0x333333,
            side: THREE.DoubleSide
        });
        const healthBg = new THREE.Mesh(healthBgGeometry, healthBgMaterial);
        healthBg.position.y = 1.8;
        group.add(healthBg);

        // Health bar fill
        const healthBarGeometry = new THREE.PlaneGeometry(0.58, 0.06);
        const healthBarMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            side: THREE.DoubleSide
        });
        this.healthBar = new THREE.Mesh(healthBarGeometry, healthBarMaterial);
        this.healthBar.position.y = 1.8;
        this.healthBar.position.z = 0.01;
        group.add(this.healthBar);

        return group;
    }

    setPlayer(player) {
        this.player = player;
    }

    update(deltaTime) {
        if (this.isDead || !this.player) return;

        const playerPos = this.player.getPosition();
        const myPos = this.mesh.position;
        const distanceToPlayer = myPos.distanceTo(playerPos);

        // State transitions
        switch (this.state) {
            case STATES.PATROL:
                if (distanceToPlayer < this.detectionRange) {
                    this.state = STATES.CHASE;
                } else {
                    this.patrol(deltaTime);
                }
                break;

            case STATES.CHASE:
                if (distanceToPlayer < this.attackRange) {
                    this.state = STATES.ATTACK;
                } else if (distanceToPlayer > this.detectionRange * 1.5) {
                    this.state = STATES.PATROL;
                    this.currentWaypoint = this.arena.getRandomWaypoint();
                } else {
                    this.chase(deltaTime, playerPos);
                }
                break;

            case STATES.ATTACK:
                if (distanceToPlayer > this.attackRange * 1.5) {
                    this.state = STATES.CHASE;
                } else {
                    this.attack(deltaTime);
                }
                break;

            case STATES.IDLE:
                // Do nothing
                break;
        }

        // Update health bar to face camera
        if (this.healthBar) {
            this.healthBar.parent.lookAt(playerPos.x, this.mesh.position.y + 1.8, playerPos.z);
        }

        // Update health bar scale
        const healthPercent = this.health / this.maxHealth;
        this.healthBar.scale.x = healthPercent;
        this.healthBar.position.x = (1 - healthPercent) * -0.29;

        // Change health bar color based on health
        if (healthPercent < 0.3) {
            this.healthBar.material.color.setHex(0xff0000);
        } else if (healthPercent < 0.6) {
            this.healthBar.material.color.setHex(0xffaa00);
        }
    }

    patrol(deltaTime) {
        const direction = new THREE.Vector3()
            .subVectors(this.currentWaypoint, this.mesh.position)
            .normalize();

        // Move towards waypoint
        this.mesh.position.x += direction.x * this.speed * deltaTime;
        this.mesh.position.z += direction.z * this.speed * deltaTime;

        // Look in movement direction
        if (direction.length() > 0.1) {
            this.mesh.lookAt(
                this.mesh.position.x + direction.x,
                this.mesh.position.y,
                this.mesh.position.z + direction.z
            );
        }

        // Check if reached waypoint
        const distToWaypoint = this.mesh.position.distanceTo(this.currentWaypoint);
        if (distToWaypoint < this.waypointThreshold) {
            this.currentWaypoint = this.arena.getRandomWaypoint();
        }
    }

    chase(deltaTime, playerPos) {
        const direction = new THREE.Vector3()
            .subVectors(playerPos, this.mesh.position);
        direction.y = 0;
        direction.normalize();

        // Move towards player
        const newX = this.mesh.position.x + direction.x * this.speed * deltaTime;
        const newZ = this.mesh.position.z + direction.z * this.speed * deltaTime;

        // Simple collision avoidance with arena boundaries
        const testPos = new THREE.Vector3(newX, this.mesh.position.y + 1, newZ);
        if (!this.arena.checkCollision(testPos, 0.3)) {
            this.mesh.position.x = newX;
            this.mesh.position.z = newZ;
        }

        // Look at player
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

        // Keep looking at player
        const playerPos = this.player.getPosition();
        this.mesh.lookAt(playerPos.x, this.mesh.position.y, playerPos.z);
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
        this.mesh.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
    }

    getMesh() {
        return this.mesh;
    }
}
