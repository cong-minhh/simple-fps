// RemotePlayer.js - Represents other players in the game
import * as THREE from 'three';

export class RemotePlayer {
    constructor(scene, playerData) {
        this.scene = scene;
        this.id = playerData.id;
        this.name = playerData.name;
        this.color = playerData.color || 0xff4444;

        // State
        this.health = playerData.health || 100;
        this.maxHealth = 100;
        this.isAlive = playerData.isAlive !== false;
        this.weapon = playerData.weapon || 'RIFLE';
        this.kills = playerData.kills || 0;
        this.deaths = playerData.deaths || 0;

        // Position interpolation - use ground level (0), not camera height
        this.position = new THREE.Vector3(
            playerData.position?.x || 0,
            0, // Ground level - the mesh handles the visual height
            playerData.position?.z || 0
        );
        this.targetPosition = this.position.clone();
        this.rotation = new THREE.Euler(
            playerData.rotation?.x || 0,
            playerData.rotation?.y || 0,
            0
        );
        this.targetRotation = { x: 0, y: 0 };

        // Interpolation settings
        this.lerpFactor = 0.15;

        // Create visual representation
        this.createMesh();
        this.createNameTag();
        this.createHealthBar();
    }

    createMesh() {
        this.mesh = new THREE.Group();

        // Set userData for hit detection
        this.mesh.userData.isPlayer = true;
        this.mesh.userData.playerId = this.id;
        this.mesh.userData.remotePlayer = this;

        // Body
        const bodyGeometry = new THREE.CapsuleGeometry(0.4, 1.0, 4, 8);
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: this.color });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.9;
        body.castShadow = true;
        body.userData.isPlayer = true;
        body.userData.playerId = this.id;
        this.mesh.add(body);
        this.bodyMesh = body;

        // Head - mark as headshot target
        const headGeometry = new THREE.SphereGeometry(0.25, 8, 8);
        const headMaterial = new THREE.MeshLambertMaterial({
            color: this.lightenColor(this.color)
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.65;
        head.castShadow = true;
        head.userData.isHead = true;
        head.userData.isPlayer = true;
        head.userData.playerId = this.id;
        this.mesh.add(head);
        this.headMesh = head;

        // Eyes (direction indicator)
        const eyeGeometry = new THREE.SphereGeometry(0.05, 6, 6);
        const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });

        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.08, 1.68, 0.2);
        this.mesh.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.08, 1.68, 0.2);
        this.mesh.add(rightEye);

        // Simple gun
        const gunGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.5);
        const gunMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
        const gun = new THREE.Mesh(gunGeometry, gunMaterial);
        gun.position.set(0.3, 1.2, 0.3);
        this.mesh.add(gun);
        this.gunMesh = gun;

        // Set initial position at ground level
        this.mesh.position.copy(this.position);

        this.scene.add(this.mesh);
    }

    createNameTag() {
        // Create canvas for name
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Draw name
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, 256, 64);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.name, 128, 32);

        // Create texture
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        // Create sprite
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false
        });
        this.nameTag = new THREE.Sprite(material);
        this.nameTag.scale.set(2, 0.5, 1);
        this.nameTag.position.y = 2.3;
        this.mesh.add(this.nameTag);

        this.nameCanvas = canvas;
        this.nameContext = ctx;
        this.nameTexture = texture;
    }

    createHealthBar() {
        // Background
        const bgGeometry = new THREE.PlaneGeometry(0.8, 0.08);
        const bgMaterial = new THREE.MeshBasicMaterial({
            color: 0x333333,
            transparent: true,
            opacity: 0.7,
            depthTest: false
        });
        const bg = new THREE.Mesh(bgGeometry, bgMaterial);
        bg.position.y = 2.0;
        this.mesh.add(bg);

        // Health bar
        const barGeometry = new THREE.PlaneGeometry(0.76, 0.06);
        const barMaterial = new THREE.MeshBasicMaterial({
            color: 0x44ff44,
            depthTest: false
        });
        const bar = new THREE.Mesh(barGeometry, barMaterial);
        bar.position.y = 2.0;
        bar.position.z = 0.01;
        this.mesh.add(bar);

        this.healthBar = bar;
        this.healthBarMaterial = barMaterial;
    }

    lightenColor(color) {
        const r = ((color >> 16) & 255) / 255;
        const g = ((color >> 8) & 255) / 255;
        const b = (color & 255) / 255;

        return new THREE.Color(
            Math.min(1, r + 0.3),
            Math.min(1, g + 0.3),
            Math.min(1, b + 0.3)
        );
    }

    updatePosition(position, rotation) {
        // Position Y should be 0 (ground level), not camera height
        // The mesh handles the visual offset internally
        this.targetPosition.set(position.x, 0, position.z);
        this.targetRotation = rotation;
    }

    setHealth(health) {
        this.health = health;

        // Update health bar
        const percent = Math.max(0, health / this.maxHealth);
        this.healthBar.scale.x = percent;
        this.healthBar.position.x = (1 - percent) * -0.38;

        // Change color based on health
        if (percent > 0.5) {
            this.healthBarMaterial.color.setHex(0x44ff44);
        } else if (percent > 0.25) {
            this.healthBarMaterial.color.setHex(0xffff44);
        } else {
            this.healthBarMaterial.color.setHex(0xff4444);
        }
    }

    setAlive(alive) {
        this.isAlive = alive;
        this.mesh.visible = alive;
    }

    showDamageFlash() {
        // Flash body red when hit
        const originalColor = this.bodyMesh.material.color.getHex();
        this.bodyMesh.material.color.setHex(0xffffff);

        setTimeout(() => {
            this.bodyMesh.material.color.setHex(originalColor);
        }, 100);
    }

    showShootEffect() {
        // Muzzle flash effect
        const flash = new THREE.PointLight(0xffff00, 2, 5);
        flash.position.copy(this.mesh.position);
        flash.position.y = 1.2;
        this.scene.add(flash);

        setTimeout(() => {
            this.scene.remove(flash);
        }, 50);
    }

    update(deltaTime) {
        if (!this.isAlive) return;

        // Interpolate position
        this.position.lerp(this.targetPosition, this.lerpFactor);
        this.mesh.position.copy(this.position);

        // Interpolate rotation (only Y axis for body)
        const current = this.mesh.rotation.y;
        const target = this.targetRotation.y;
        let diff = target - current;

        // Handle wrap-around
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;

        this.mesh.rotation.y = current + diff * this.lerpFactor;

        // Make health bar and name tag face camera
        // (Sprites auto-face camera, but we need to keep them upright)
    }

    getPosition() {
        return this.position;
    }

    getMesh() {
        return this.mesh;
    }

    getHeadMesh() {
        return this.headMesh;
    }

    dispose() {
        this.scene.remove(this.mesh);

        // Dispose geometries and materials
        this.mesh.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });

        if (this.nameTexture) this.nameTexture.dispose();
    }
}
