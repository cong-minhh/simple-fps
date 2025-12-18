// DynamicMapElements.js - Moving platforms and interactive doors
// Adds dynamic elements to arena layouts

import * as THREE from 'three';

/**
 * Configuration for dynamic elements
 */
const ELEMENT_CONFIG = {
    PLATFORM: {
        SPEED: 2,
        PAUSE_DURATION: 1.5
    },
    DOOR: {
        SPEED: 3,
        OPEN_HEIGHT: 3,
        TRIGGER_DISTANCE: 3
    }
};

/**
 * Moving Platform
 */
class MovingPlatform {
    constructor(scene, config) {
        this.scene = scene;
        this.startPos = new THREE.Vector3().copy(config.start);
        this.endPos = new THREE.Vector3().copy(config.end);
        this.speed = config.speed || ELEMENT_CONFIG.PLATFORM.SPEED;
        this.pauseDuration = config.pause || ELEMENT_CONFIG.PLATFORM.PAUSE_DURATION;

        // State
        this.progress = 0;
        this.direction = 1;
        this.paused = false;
        this.pauseTimer = 0;

        // Create mesh
        const width = config.width || 3;
        const depth = config.depth || 3;
        const height = config.height || 0.3;

        const geometry = new THREE.BoxGeometry(width, height, depth);
        const material = new THREE.MeshStandardMaterial({
            color: config.color || 0x666688,
            roughness: 0.5,
            metalness: 0.5
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.startPos);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        scene.add(this.mesh);

        // Collision box
        this.collider = {
            min: new THREE.Vector3(),
            max: new THREE.Vector3(),
            width: width / 2,
            depth: depth / 2,
            height: height
        };
        this._updateCollider();
    }

    update(dt) {
        if (this.paused) {
            this.pauseTimer -= dt;
            if (this.pauseTimer <= 0) {
                this.paused = false;
            }
            return;
        }

        // Move platform
        this.progress += this.direction * this.speed * dt / this.startPos.distanceTo(this.endPos);

        // Check endpoints
        if (this.progress >= 1) {
            this.progress = 1;
            this.direction = -1;
            this.paused = true;
            this.pauseTimer = this.pauseDuration;
        } else if (this.progress <= 0) {
            this.progress = 0;
            this.direction = 1;
            this.paused = true;
            this.pauseTimer = this.pauseDuration;
        }

        // Update position
        this.mesh.position.lerpVectors(this.startPos, this.endPos, this.progress);
        this._updateCollider();
    }

    _updateCollider() {
        const pos = this.mesh.position;
        this.collider.min.set(
            pos.x - this.collider.width,
            pos.y,
            pos.z - this.collider.depth
        );
        this.collider.max.set(
            pos.x + this.collider.width,
            pos.y + this.collider.height,
            pos.z + this.collider.depth
        );
    }

    /**
     * Check if player is on platform and get velocity
     */
    checkPlayerOn(playerPos, playerRadius = 0.5) {
        const pos = this.mesh.position;
        const onPlatform = (
            playerPos.x > pos.x - this.collider.width - playerRadius &&
            playerPos.x < pos.x + this.collider.width + playerRadius &&
            playerPos.z > pos.z - this.collider.depth - playerRadius &&
            playerPos.z < pos.z + this.collider.depth + playerRadius &&
            Math.abs(playerPos.y - (pos.y + this.collider.height + 0.1)) < 0.5
        );

        if (onPlatform && !this.paused) {
            const velocity = this.endPos.clone().sub(this.startPos).normalize();
            velocity.multiplyScalar(this.speed * this.direction);
            return velocity;
        }
        return null;
    }

    dispose() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

/**
 * Automatic Door
 */
class AutoDoor {
    constructor(scene, config) {
        this.scene = scene;
        this.position = new THREE.Vector3().copy(config.position);
        this.openHeight = config.openHeight || ELEMENT_CONFIG.DOOR.OPEN_HEIGHT;
        this.speed = config.speed || ELEMENT_CONFIG.DOOR.SPEED;
        this.triggerDistance = config.triggerDistance || ELEMENT_CONFIG.DOOR.TRIGGER_DISTANCE;

        // State
        this.openProgress = 0;
        this.targetOpen = 0;

        // Create door segments
        const width = config.width || 2;
        const height = config.height || 3;
        const depth = config.depth || 0.2;

        const geometry = new THREE.BoxGeometry(width, height, depth);

        // Left door
        const leftMat = new THREE.MeshStandardMaterial({
            color: config.color || 0x444466,
            roughness: 0.4,
            metalness: 0.6
        });
        this.leftDoor = new THREE.Mesh(geometry, leftMat);
        this.leftDoor.position.copy(this.position);
        this.leftDoor.position.x -= width / 2;
        this.leftDoor.castShadow = true;
        scene.add(this.leftDoor);

        // Right door
        const rightMat = leftMat.clone();
        this.rightDoor = new THREE.Mesh(geometry, rightMat);
        this.rightDoor.position.copy(this.position);
        this.rightDoor.position.x += width / 2;
        this.rightDoor.castShadow = true;
        scene.add(this.rightDoor);

        // Door frame
        const frameGeo = new THREE.BoxGeometry(width * 2 + depth * 2, depth, depth);
        const frameMat = new THREE.MeshStandardMaterial({
            color: 0x333355,
            roughness: 0.6,
            metalness: 0.4
        });
        this.frame = new THREE.Mesh(frameGeo, frameMat);
        this.frame.position.copy(this.position);
        this.frame.position.y += height / 2 + depth / 2;
        scene.add(this.frame);

        this.closedY = this.position.y;
    }

    update(dt, playerPos) {
        // Check if player is near
        const dist = this.position.distanceTo(playerPos);
        this.targetOpen = dist < this.triggerDistance ? 1 : 0;

        // Animate door
        const diff = this.targetOpen - this.openProgress;
        if (Math.abs(diff) > 0.01) {
            this.openProgress += Math.sign(diff) * this.speed * dt;
            this.openProgress = Math.max(0, Math.min(1, this.openProgress));

            // Move doors up
            const yOffset = this.openProgress * this.openHeight;
            this.leftDoor.position.y = this.closedY + yOffset;
            this.rightDoor.position.y = this.closedY + yOffset;
        }
    }

    /**
     * Check if door blocks movement
     */
    isBlocking() {
        return this.openProgress < 0.8;
    }

    getCollider() {
        if (!this.isBlocking()) return null;

        return {
            min: new THREE.Vector3(
                this.position.x - 2,
                this.closedY,
                this.position.z - 0.3
            ),
            max: new THREE.Vector3(
                this.position.x + 2,
                this.closedY + 3,
                this.position.z + 0.3
            )
        };
    }

    dispose() {
        this.scene.remove(this.leftDoor);
        this.scene.remove(this.rightDoor);
        this.scene.remove(this.frame);
        this.leftDoor.geometry.dispose();
        this.leftDoor.material.dispose();
        this.rightDoor.geometry.dispose();
        this.rightDoor.material.dispose();
        this.frame.geometry.dispose();
        this.frame.material.dispose();
    }
}

/**
 * Dynamic Map Elements Manager
 */
export class DynamicMapManager {
    constructor(scene) {
        this.scene = scene;
        this.platforms = [];
        this.doors = [];
    }

    /**
     * Add a moving platform
     */
    addPlatform(config) {
        const platform = new MovingPlatform(this.scene, config);
        this.platforms.push(platform);
        return platform;
    }

    /**
     * Add an automatic door
     */
    addDoor(config) {
        const door = new AutoDoor(this.scene, config);
        this.doors.push(door);
        return door;
    }

    /**
     * Create default dynamic elements for arena
     */
    createDefaults() {
        // Moving platform in center
        this.addPlatform({
            start: new THREE.Vector3(0, 1, -5),
            end: new THREE.Vector3(0, 4, -5),
            width: 3,
            depth: 3,
            speed: 1.5
        });

        // Horizontal platform
        this.addPlatform({
            start: new THREE.Vector3(-8, 2, 0),
            end: new THREE.Vector3(8, 2, 0),
            width: 2,
            depth: 2,
            speed: 3
        });

        // Auto door
        this.addDoor({
            position: new THREE.Vector3(0, 1.5, 8),
            triggerDistance: 4
        });
    }

    /**
     * Update all dynamic elements
     */
    update(dt, playerPos) {
        // Update platforms
        for (const platform of this.platforms) {
            platform.update(dt);
        }

        // Update doors
        for (const door of this.doors) {
            door.update(dt, playerPos);
        }
    }

    /**
     * Get platform velocity if player is on one
     */
    getPlatformVelocity(playerPos) {
        for (const platform of this.platforms) {
            const velocity = platform.checkPlayerOn(playerPos);
            if (velocity) return velocity;
        }
        return null;
    }

    /**
     * Get all active colliders
     */
    getColliders() {
        const colliders = [];

        for (const platform of this.platforms) {
            colliders.push(platform.collider);
        }

        for (const door of this.doors) {
            const collider = door.getCollider();
            if (collider) colliders.push(collider);
        }

        return colliders;
    }

    /**
     * Clear all elements
     */
    clear() {
        this.platforms.forEach(p => p.dispose());
        this.doors.forEach(d => d.dispose());
        this.platforms = [];
        this.doors = [];
    }

    dispose() {
        this.clear();
    }
}

export { MovingPlatform, AutoDoor };
