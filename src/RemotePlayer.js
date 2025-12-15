// RemotePlayer.js - Represents other players in the game with full state sync
import * as THREE from 'three';

// Weapon model configurations
const WEAPON_MODELS = {
    PISTOL: { length: 0.25, width: 0.06, color: 0x2a2a2a },
    RIFLE: { length: 0.6, width: 0.08, color: 0x1a1a1a },
    SMG: { length: 0.4, width: 0.07, color: 0x3a3a3a },
    SHOTGUN: { length: 0.55, width: 0.1, color: 0x4a3020 }
};

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

        // Visual states
        this.isCrouching = false;
        this.peekState = 0; // -1 left, 0 none, 1 right
        this.isAiming = false;
        this.isSprinting = false;
        this.isReloading = false;

        // Animation states
        this.currentCrouchY = 0;
        this.currentPeekAngle = 0;
        this.currentAimOffset = 0;
        this.shootAnimTime = 0;
        this.reloadAnimTime = 0;

        // Position interpolation
        this.position = new THREE.Vector3(
            playerData.position?.x || 0,
            playerData.position?.y || 1.6,
            playerData.position?.z || 0
        );
        this.targetPosition = this.position.clone();
        this.rotation = new THREE.Euler(0, playerData.rotation?.y || 0, 0);
        this.targetRotation = { x: 0, y: 0 };
        this.headPitch = 0;
        this.targetHeadPitch = 0;

        // Height state for syncing with camera position
        this.currentHeight = 1.6;

        // Interpolation settings
        this.lerpFactor = 0.15;

        // Create visual representation
        this.createMesh();
        this.createNameTag();
        this.createHealthBar();
    }

    // ... (lines 62-264 unchanged) ...

    updatePosition(position, rotation) {
        this.targetPosition.copy(position); // Use full position including Y
        this.targetRotation = rotation;
        this.targetHeadPitch = rotation.x || 0;
    }

    updateState(state) {
        if (!state) return;

        this.isCrouching = state.isCrouching || false;
        this.peekState = state.peekState || 0;
        this.isAiming = state.isAiming || false;
        this.isSprinting = state.isSprinting || false;

        if (state.isReloading && !this.isReloading) {
            this.playReloadAnimation();
        }
        this.isReloading = state.isReloading || false;

        if (state.weapon && state.weapon !== this.weapon) {
            this.setWeapon(state.weapon);
        }
    }

    // ... (lines 292-339 unchanged) ...

    update(deltaTime) {
        if (!this.isAlive) return;

        // === POSITION INTERPOLATION ===
        this.position.lerp(this.targetPosition, this.lerpFactor);

        // === HEIGHT & JUMP HANDLING ===
        // Interpolate player height (Camera Y -> Feet Y offset)
        const targetHeight = this.isCrouching ? 1.0 : 1.6;
        this.currentHeight += (targetHeight - this.currentHeight) * 0.2;

        // Mesh position is Camera Position - Player Height (to place feet on ground)
        this.mesh.position.copy(this.position);
        this.mesh.position.y -= this.currentHeight;

        // === ROTATION INTERPOLATION ===
        const current = this.mesh.rotation.y;
        const target = this.targetRotation.y;
        let diff = target - current;
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;
        this.mesh.rotation.y = current + diff * this.lerpFactor;

        // Head pitch
        this.headPitch += (this.targetHeadPitch - this.headPitch) * this.lerpFactor;
        // Adjust head pitch to not look weird (invert or clamp might be needed depending on model)
        // Since we fixed orientation to -Z, standard match should work
        this.headMesh.rotation.x = -this.headPitch;
        this.visorMesh.rotation.x = -this.headPitch;

        // === CROUCH ANIMATION ===
        // This handles local squashing of the model, independent of global Y
        const targetCrouchY = this.isCrouching ? -0.4 : 0;
        this.currentCrouchY += (targetCrouchY - this.currentCrouchY) * 0.2;
        this.upperBodyGroup.position.y = 1.1 + this.currentCrouchY; // Move upper body down

        // Legs compress when crouching
        const legScale = this.isCrouching ? 0.6 : 1.0;
        this.leftLegMesh.scale.y = legScale;
        this.rightLegMesh.scale.y = legScale;
        this.leftLegMesh.position.y = this.isCrouching ? 0.2 : 0.35;
        this.rightLegMesh.position.y = this.isCrouching ? 0.2 : 0.35;

        // === PEEK/LEAN ANIMATION ===
        // Rotate entire upper body group (torso + head + arms), legs stay in place
        const targetPeekAngle = -this.peekState * 0.2; // ~11 degrees
        this.currentPeekAngle += (targetPeekAngle - this.currentPeekAngle) * 0.2;
        this.upperBodyGroup.rotation.z = this.currentPeekAngle;

        // === ADS/AIMING ANIMATION ===
        // Push arms forward (-Z) when aiming
        const targetAimOffset = this.isAiming ? -0.15 : 0; // Negative Z = forward
        this.currentAimOffset += (targetAimOffset - this.currentAimOffset) * 0.2;
        this.armsGroup.position.z = this.currentAimOffset;

        // === SHOOT ANIMATION ===
        if (this.shootAnimTime > 0) {
            this.shootAnimTime -= deltaTime;
            const recoil = Math.sin(this.shootAnimTime * 30) * 0.02;
            if (this.gunMesh) {
                // Recoil pushes gun backward (+Z direction in local space)
                this.gunMesh.position.z += recoil;
            }
            this.muzzleFlashMaterial.opacity = this.shootAnimTime > 0.1 ? 1 : 0;
        } else {
            this.muzzleFlashMaterial.opacity = 0;
        }

        // === RELOAD ANIMATION ===
        if (this.reloadAnimTime > 0) {
            this.reloadAnimTime -= deltaTime;
            const reloadPhase = (2.0 - this.reloadAnimTime) / 2.0;
            // Tilt gun down during reload
            if (this.gunMesh) {
                this.gunMesh.rotation.x = Math.sin(reloadPhase * Math.PI) * 0.5;
            }
        }

        // === SPRINT ANIMATION ===
        if (this.isSprinting) {
            const sway = Math.sin(Date.now() * 0.01) * 0.1;
            this.leftArmMesh.rotation.x = sway;
            this.rightArmMesh.rotation.x = -sway;
        } else {
            this.leftArmMesh.rotation.x = 0;
            this.rightArmMesh.rotation.x = 0;
        }
    }

    createMesh() {
        this.mesh = new THREE.Group();

        // Set userData for hit detection
        this.mesh.userData.isPlayer = true;
        this.mesh.userData.playerId = this.id;
        this.mesh.userData.remotePlayer = this;

        // === LEGS (stay in main mesh - don't move when peeking) ===
        const legGeometry = new THREE.BoxGeometry(0.18, 0.7, 0.2);
        const legMaterial = new THREE.MeshLambertMaterial({ color: this.darkenColor(this.color) });

        // Left leg
        const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
        leftLeg.position.set(-0.12, 0.35, 0);
        leftLeg.castShadow = true;
        this.mesh.add(leftLeg);
        this.leftLegMesh = leftLeg;

        // Right leg
        const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
        rightLeg.position.set(0.12, 0.35, 0);
        rightLeg.castShadow = true;
        this.mesh.add(rightLeg);
        this.rightLegMesh = rightLeg;

        // === UPPER BODY GROUP (tilts when peeking) ===
        this.upperBodyGroup = new THREE.Group();
        this.upperBodyGroup.position.y = 0; // Position at hip level
        this.mesh.add(this.upperBodyGroup);

        // === TORSO (in upper body group) ===
        const torsoGeometry = new THREE.BoxGeometry(0.5, 0.6, 0.3);
        const torsoMaterial = new THREE.MeshLambertMaterial({ color: this.color });
        const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
        torso.position.y = 1.1;
        torso.castShadow = true;
        torso.userData.isPlayer = true;
        torso.userData.playerId = this.id;
        this.upperBodyGroup.add(torso);
        this.torsoMesh = torso;

        // === HEAD (in upper body group) ===
        const headGeometry = new THREE.SphereGeometry(0.22, 12, 12);
        const headMaterial = new THREE.MeshLambertMaterial({
            color: this.lightenColor(this.color)
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.55;
        head.castShadow = true;
        head.userData.isHead = true;
        head.userData.isPlayer = true;
        head.userData.playerId = this.id;
        this.upperBodyGroup.add(head);
        this.headMesh = head;

        // Face indicator (visor/eyes area) - faces -Z direction (forward)
        const visorGeometry = new THREE.BoxGeometry(0.3, 0.08, 0.1);
        const visorMaterial = new THREE.MeshBasicMaterial({ color: 0x222222 });
        const visor = new THREE.Mesh(visorGeometry, visorMaterial);
        visor.position.set(0, 1.56, -0.18);
        this.upperBodyGroup.add(visor);
        this.visorMesh = visor;

        // === ARMS (in upper body group) ===
        const armGeometry = new THREE.BoxGeometry(0.12, 0.5, 0.12);
        const armMaterial = new THREE.MeshLambertMaterial({ color: this.lightenColor(this.color) });

        // Arm group (for aiming animation)
        this.armsGroup = new THREE.Group();
        this.armsGroup.position.y = 1.2;
        this.upperBodyGroup.add(this.armsGroup);

        // Left arm
        const leftArm = new THREE.Mesh(armGeometry, armMaterial);
        leftArm.position.set(-0.35, 0, -0.1);
        this.armsGroup.add(leftArm);
        this.leftArmMesh = leftArm;

        // Right arm (holding weapon)
        const rightArm = new THREE.Mesh(armGeometry, armMaterial);
        rightArm.position.set(0.35, 0, -0.1);
        this.armsGroup.add(rightArm);
        this.rightArmMesh = rightArm;

        // === WEAPON ===
        this.createWeaponModel(this.weapon);

        // Set initial position
        this.mesh.position.copy(this.position);

        this.scene.add(this.mesh);
    }

    createWeaponModel(weaponType) {
        // Remove old weapon if exists
        if (this.gunMesh) {
            this.armsGroup.remove(this.gunMesh);
            this.gunMesh.geometry.dispose();
            this.gunMesh.material.dispose();
        }

        const config = WEAPON_MODELS[weaponType] || WEAPON_MODELS.RIFLE;
        const gunGeometry = new THREE.BoxGeometry(0.08, 0.08, config.length);
        const gunMaterial = new THREE.MeshLambertMaterial({ color: config.color });
        const gun = new THREE.Mesh(gunGeometry, gunMaterial);
        // Gun at right arm, facing -Z (forward)
        gun.position.set(0.35, -0.1, -(0.2 + config.length / 2));
        this.armsGroup.add(gun);
        this.gunMesh = gun;

        // Muzzle flash at the front of the gun (-Z direction)
        const flashGeometry = new THREE.SphereGeometry(0.08, 6, 6);
        const flashMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0
        });
        const flash = new THREE.Mesh(flashGeometry, flashMaterial);
        flash.position.z = -(config.length / 2 + 0.1); // Front of gun
        gun.add(flash);
        this.muzzleFlash = flash;
        this.muzzleFlashMaterial = flashMaterial;
    }

    createNameTag() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.roundRect(10, 10, 236, 44, 8);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.name, 128, 32);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false
        });
        this.nameTag = new THREE.Sprite(material);
        this.nameTag.scale.set(1.5, 0.4, 1);
        this.nameTag.position.y = 2.0;
        this.mesh.add(this.nameTag);

        this.nameTexture = texture;
    }

    createHealthBar() {
        const bgGeometry = new THREE.PlaneGeometry(0.6, 0.06);
        const bgMaterial = new THREE.MeshBasicMaterial({
            color: 0x333333,
            transparent: true,
            opacity: 0.8,
            depthTest: false
        });
        const bg = new THREE.Mesh(bgGeometry, bgMaterial);
        bg.position.y = 1.85;
        this.mesh.add(bg);

        const barGeometry = new THREE.PlaneGeometry(0.56, 0.04);
        const barMaterial = new THREE.MeshBasicMaterial({
            color: 0x44ff44,
            depthTest: false
        });
        const bar = new THREE.Mesh(barGeometry, barMaterial);
        bar.position.y = 1.85;
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
            Math.min(1, r + 0.2),
            Math.min(1, g + 0.2),
            Math.min(1, b + 0.2)
        );
    }

    darkenColor(color) {
        const r = ((color >> 16) & 255) / 255;
        const g = ((color >> 8) & 255) / 255;
        const b = (color & 255) / 255;
        return new THREE.Color(
            Math.max(0, r - 0.2),
            Math.max(0, g - 0.2),
            Math.max(0, b - 0.2)
        );
    }

    // === STATE SETTERS ===

    updatePosition(position, rotation) {
        this.targetPosition.set(position.x, 0, position.z);
        this.targetRotation = rotation;
        this.targetHeadPitch = rotation.x || 0;
    }

    updateState(state) {
        if (!state) return;

        this.isCrouching = state.isCrouching || false;
        this.peekState = state.peekState || 0;
        this.isAiming = state.isAiming || false;
        this.isSprinting = state.isSprinting || false;

        if (state.isReloading && !this.isReloading) {
            this.playReloadAnimation();
        }
        this.isReloading = state.isReloading || false;

        if (state.weapon && state.weapon !== this.weapon) {
            this.setWeapon(state.weapon);
        }
    }

    setHealth(health) {
        this.health = health;
        const percent = Math.max(0, health / this.maxHealth);
        this.healthBar.scale.x = percent;
        this.healthBar.position.x = (1 - percent) * -0.28;

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

    setWeapon(weaponType) {
        this.weapon = weaponType;
        this.createWeaponModel(weaponType);
    }

    // === ANIMATIONS ===

    showDamageFlash() {
        const origColor = this.torsoMesh.material.color.getHex();
        this.torsoMesh.material.color.setHex(0xffffff);
        setTimeout(() => {
            this.torsoMesh.material.color.setHex(origColor);
        }, 100);
    }

    showShootEffect() {
        this.shootAnimTime = 0.15;
        this.muzzleFlashMaterial.opacity = 1;

        // Create light flash
        const flash = new THREE.PointLight(0xffff44, 2, 3);
        flash.position.copy(this.mesh.position);
        flash.position.y = 1.2;
        this.scene.add(flash);
        setTimeout(() => this.scene.remove(flash), 50);
    }

    playReloadAnimation() {
        this.reloadAnimTime = 2.0;
    }

    // === UPDATE ===

    update(deltaTime) {
        if (!this.isAlive) return;

        // === POSITION INTERPOLATION ===
        this.position.lerp(this.targetPosition, this.lerpFactor);
        this.mesh.position.copy(this.position);

        // === ROTATION INTERPOLATION ===
        const current = this.mesh.rotation.y;
        const target = this.targetRotation.y;
        let diff = target - current;
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;
        this.mesh.rotation.y = current + diff * this.lerpFactor;

        // Head pitch
        this.headPitch += (this.targetHeadPitch - this.headPitch) * this.lerpFactor;
        this.headMesh.rotation.x = -this.headPitch * 0.5;
        this.visorMesh.rotation.x = -this.headPitch * 0.5;

        // === CROUCH ANIMATION ===
        const targetCrouchY = this.isCrouching ? -0.4 : 0;
        this.currentCrouchY += (targetCrouchY - this.currentCrouchY) * 0.2;
        this.torsoMesh.position.y = 1.1 + this.currentCrouchY;
        this.headMesh.position.y = 1.55 + this.currentCrouchY;
        this.visorMesh.position.y = 1.56 + this.currentCrouchY;
        this.armsGroup.position.y = 1.2 + this.currentCrouchY;
        this.healthBar.position.y = 1.85 + this.currentCrouchY;
        this.nameTag.position.y = 2.0 + this.currentCrouchY;

        // Legs compress when crouching
        const legScale = this.isCrouching ? 0.6 : 1.0;
        this.leftLegMesh.scale.y = legScale;
        this.rightLegMesh.scale.y = legScale;
        this.leftLegMesh.position.y = this.isCrouching ? 0.2 : 0.35;
        this.rightLegMesh.position.y = this.isCrouching ? 0.2 : 0.35;

        // === PEEK/LEAN ANIMATION ===
        // Rotate entire upper body group (torso + head + arms), legs stay in place
        const targetPeekAngle = -this.peekState * 0.2; // ~11 degrees
        this.currentPeekAngle += (targetPeekAngle - this.currentPeekAngle) * 0.2;
        this.upperBodyGroup.rotation.z = this.currentPeekAngle;

        // === ADS/AIMING ANIMATION ===
        // Push arms forward (-Z) when aiming
        const targetAimOffset = this.isAiming ? -0.15 : 0; // Negative Z = forward
        this.currentAimOffset += (targetAimOffset - this.currentAimOffset) * 0.2;
        this.armsGroup.position.z = this.currentAimOffset;

        // === SHOOT ANIMATION ===
        if (this.shootAnimTime > 0) {
            this.shootAnimTime -= deltaTime;
            const recoil = Math.sin(this.shootAnimTime * 30) * 0.02;
            if (this.gunMesh) {
                // Recoil pushes gun backward (+Z direction in local space)
                this.gunMesh.position.z += recoil;
            }
            this.muzzleFlashMaterial.opacity = this.shootAnimTime > 0.1 ? 1 : 0;
        } else {
            this.muzzleFlashMaterial.opacity = 0;
        }

        // === RELOAD ANIMATION ===
        if (this.reloadAnimTime > 0) {
            this.reloadAnimTime -= deltaTime;
            const reloadPhase = (2.0 - this.reloadAnimTime) / 2.0;
            // Tilt gun down during reload
            if (this.gunMesh) {
                this.gunMesh.rotation.x = Math.sin(reloadPhase * Math.PI) * 0.5;
            }
        }

        // === SPRINT ANIMATION ===
        if (this.isSprinting) {
            const sway = Math.sin(Date.now() * 0.01) * 0.1;
            this.leftArmMesh.rotation.x = sway;
            this.rightArmMesh.rotation.x = -sway;
        } else {
            this.leftArmMesh.rotation.x = 0;
            this.rightArmMesh.rotation.x = 0;
        }
    }

    // === GETTERS ===

    getPosition() { return this.position; }
    getMesh() { return this.mesh; }
    getHeadMesh() { return this.headMesh; }

    dispose() {
        this.scene.remove(this.mesh);
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
