// RemotePlayer.js - Represents other players in the game with full state sync
import * as THREE from 'three';

// Weapon model configurations - more distinctive shapes
const WEAPON_MODELS = {
    PISTOL: {
        length: 0.2,
        height: 0.12,
        width: 0.05,
        color: 0x444444,
        hasScope: false,
        hasMag: true,
        magSize: 0.06
    },
    RIFLE: {
        length: 0.7,
        height: 0.1,
        width: 0.06,
        color: 0x2a2a2a,
        hasScope: true,
        hasMag: true,
        magSize: 0.1
    },
    SMG: {
        length: 0.35,
        height: 0.1,
        width: 0.06,
        color: 0x3a3a3a,
        hasScope: false,
        hasMag: true,
        magSize: 0.08
    },
    SHOTGUN: {
        length: 0.6,
        height: 0.08,
        width: 0.08,
        color: 0x5a3a20,
        hasScope: false,
        hasMag: false
    }
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
        this.peekState = 0;
        this.isAiming = false;
        this.isSprinting = false;
        this.isReloading = false;

        // Animation states
        this.currentCrouchY = 0;
        this.currentPeekAngle = 0;
        this.currentAimOffset = 0;
        this.shootAnimTime = 0;
        this.reloadAnimTime = 0;

        // Position interpolation - store camera position
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

        // Height offset for camera-to-feet conversion
        this.currentHeight = 1.6;

        // Interpolation settings
        this.lerpFactor = 0.2; // Slightly faster for better jump visibility

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

        // === LEGS (stay in main mesh - don't move when peeking) ===
        const legGeometry = new THREE.BoxGeometry(0.16, 0.7, 0.16);
        const legMaterial = new THREE.MeshLambertMaterial({ color: this.darkenColor(this.color) });

        const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
        leftLeg.position.set(-0.12, 0.35, 0);
        leftLeg.castShadow = true;
        leftLeg.userData.isPlayer = true;
        leftLeg.userData.playerId = this.id;
        leftLeg.userData.bodyPart = 'leg';
        this.mesh.add(leftLeg);
        this.leftLegMesh = leftLeg;

        const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
        rightLeg.position.set(0.12, 0.35, 0);
        rightLeg.castShadow = true;
        rightLeg.userData.isPlayer = true;
        rightLeg.userData.playerId = this.id;
        rightLeg.userData.bodyPart = 'leg';
        this.mesh.add(rightLeg);
        this.rightLegMesh = rightLeg;

        // === UPPER BODY GROUP (tilts when peeking) ===
        this.upperBodyGroup = new THREE.Group();
        this.mesh.add(this.upperBodyGroup);

        // === TORSO ===
        const torsoGeometry = new THREE.BoxGeometry(0.45, 0.55, 0.25);
        const torsoMaterial = new THREE.MeshLambertMaterial({ color: this.color });
        const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
        torso.position.y = 1.05;
        torso.castShadow = true;
        torso.userData.isPlayer = true;
        torso.userData.playerId = this.id;
        torso.userData.bodyPart = 'torso';
        this.upperBodyGroup.add(torso);
        this.torsoMesh = torso;

        // === HEAD ===
        const headGeometry = new THREE.SphereGeometry(0.2, 12, 12);
        const headMaterial = new THREE.MeshLambertMaterial({ color: this.lightenColor(this.color) });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.5;
        head.castShadow = true;
        head.userData.isHead = true;
        head.userData.isPlayer = true;
        head.userData.playerId = this.id;
        head.userData.bodyPart = 'head';
        this.upperBodyGroup.add(head);
        this.headMesh = head;

        // Face visor (direction indicator) - positioned at FRONT of head
        const visorGeometry = new THREE.BoxGeometry(0.28, 0.06, 0.08);
        const visorMaterial = new THREE.MeshBasicMaterial({ color: 0x111111 });
        const visor = new THREE.Mesh(visorGeometry, visorMaterial);
        visor.position.set(0, 1.52, -0.16); // In front of head (-Z)
        this.upperBodyGroup.add(visor);
        this.visorMesh = visor;

        // === ARMS GROUP ===
        this.armsGroup = new THREE.Group();
        this.armsGroup.position.y = 1.1;
        this.upperBodyGroup.add(this.armsGroup);

        const armGeometry = new THREE.BoxGeometry(0.1, 0.45, 0.1);
        const armMaterial = new THREE.MeshLambertMaterial({ color: this.lightenColor(this.color) });

        // Left arm
        const leftArm = new THREE.Mesh(armGeometry, armMaterial);
        leftArm.position.set(-0.3, 0, -0.05);
        leftArm.userData.isPlayer = true;
        leftArm.userData.playerId = this.id;
        leftArm.userData.bodyPart = 'arm';
        this.armsGroup.add(leftArm);
        this.leftArmMesh = leftArm;

        // Right arm (weapon arm)
        const rightArm = new THREE.Mesh(armGeometry, armMaterial);
        rightArm.position.set(0.3, 0, -0.05);
        rightArm.userData.isPlayer = true;
        rightArm.userData.playerId = this.id;
        rightArm.userData.bodyPart = 'arm';
        this.armsGroup.add(rightArm);
        this.rightArmMesh = rightArm;

        // === WEAPON ===
        this.createWeaponModel(this.weapon);

        // Set initial position
        this.mesh.position.copy(this.position);
        this.mesh.position.y -= this.currentHeight;

        this.scene.add(this.mesh);
    }

    createWeaponModel(weaponType) {
        // Remove old weapon
        if (this.gunGroup) {
            this.armsGroup.remove(this.gunGroup);
            this.gunGroup.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        }

        const config = WEAPON_MODELS[weaponType] || WEAPON_MODELS.RIFLE;

        // Gun group for all weapon parts
        this.gunGroup = new THREE.Group();
        this.gunGroup.position.set(0.3, -0.15, -0.3); // In front of right arm
        this.armsGroup.add(this.gunGroup);

        // Main gun body
        const bodyGeometry = new THREE.BoxGeometry(config.width, config.height, config.length);
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: config.color });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.z = -config.length / 2;
        this.gunGroup.add(body);
        this.gunMesh = body;

        // Stock (for rifles/shotguns)
        if (config.length > 0.4) {
            const stockGeometry = new THREE.BoxGeometry(config.width * 0.8, config.height * 1.5, 0.15);
            const stock = new THREE.Mesh(stockGeometry, bodyMaterial);
            stock.position.set(0, -config.height * 0.3, 0.1);
            this.gunGroup.add(stock);
        }

        // Barrel
        const barrelGeometry = new THREE.CylinderGeometry(0.015, 0.02, config.length * 0.4, 8);
        const barrelMaterial = new THREE.MeshLambertMaterial({ color: 0x111111 });
        const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.02, -(config.length + config.length * 0.2));
        this.gunGroup.add(barrel);

        // Magazine (if applicable)
        if (config.hasMag) {
            const magGeometry = new THREE.BoxGeometry(config.width * 0.6, config.magSize, config.width * 0.8);
            const magMaterial = new THREE.MeshLambertMaterial({ color: 0x222222 });
            const mag = new THREE.Mesh(magGeometry, magMaterial);
            mag.position.set(0, -config.height / 2 - config.magSize / 2, -config.length * 0.4);
            this.gunGroup.add(mag);
        }

        // Scope (if applicable)
        if (config.hasScope) {
            const scopeGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8);
            const scopeMaterial = new THREE.MeshLambertMaterial({ color: 0x111111 });
            const scope = new THREE.Mesh(scopeGeometry, scopeMaterial);
            scope.rotation.z = Math.PI / 2;
            scope.position.set(0, config.height / 2 + 0.03, -config.length * 0.3);
            this.gunGroup.add(scope);
        }

        // Muzzle flash
        const flashGeometry = new THREE.SphereGeometry(0.06, 6, 6);
        const flashMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0
        });
        const flash = new THREE.Mesh(flashGeometry, flashMaterial);
        flash.position.set(0, 0, -(config.length + config.length * 0.4));
        this.gunGroup.add(flash);
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
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.name, 128, 32);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        this.nameTag = new THREE.Sprite(material);
        this.nameTag.scale.set(1.5, 0.4, 1);
        this.nameTag.position.y = 2.0;
        this.mesh.add(this.nameTag);
        this.nameTexture = texture;
    }

    createHealthBar() {
        const bgGeometry = new THREE.PlaneGeometry(0.6, 0.06);
        const bgMaterial = new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.8, depthTest: false });
        const bg = new THREE.Mesh(bgGeometry, bgMaterial);
        bg.position.y = 1.85;
        this.mesh.add(bg);

        const barGeometry = new THREE.PlaneGeometry(0.56, 0.04);
        const barMaterial = new THREE.MeshBasicMaterial({ color: 0x44ff44, depthTest: false });
        const bar = new THREE.Mesh(barGeometry, barMaterial);
        bar.position.y = 1.85;
        bar.position.z = 0.01;
        this.mesh.add(bar);

        this.healthBar = bar;
        this.healthBarMaterial = barMaterial;
    }

    lightenColor(color) {
        const r = Math.min(1, ((color >> 16) & 255) / 255 + 0.2);
        const g = Math.min(1, ((color >> 8) & 255) / 255 + 0.2);
        const b = Math.min(1, (color & 255) / 255 + 0.2);
        return new THREE.Color(r, g, b);
    }

    darkenColor(color) {
        const r = Math.max(0, ((color >> 16) & 255) / 255 - 0.2);
        const g = Math.max(0, ((color >> 8) & 255) / 255 - 0.2);
        const b = Math.max(0, (color & 255) / 255 - 0.2);
        return new THREE.Color(r, g, b);
    }

    // === STATE UPDATES ===

    updatePosition(position, rotation) {
        // Store full camera position including Y for jump sync
        this.targetPosition.set(position.x, position.y, position.z);
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

        if (percent > 0.5) this.healthBarMaterial.color.setHex(0x44ff44);
        else if (percent > 0.25) this.healthBarMaterial.color.setHex(0xffff44);
        else this.healthBarMaterial.color.setHex(0xff4444);
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
        setTimeout(() => this.torsoMesh.material.color.setHex(origColor), 100);
    }

    showShootEffect() {
        this.shootAnimTime = 0.15;
        this.muzzleFlashMaterial.opacity = 1;

        const flash = new THREE.PointLight(0xffff44, 2, 3);
        flash.position.copy(this.mesh.position);
        flash.position.y = 1.2;
        this.scene.add(flash);
        setTimeout(() => this.scene.remove(flash), 50);
    }

    playReloadAnimation() {
        this.reloadAnimTime = 2.0;
    }

    // === MAIN UPDATE LOOP ===

    update(deltaTime) {
        if (!this.isAlive) return;

        // === POSITION INTERPOLATION ===
        this.position.lerp(this.targetPosition, this.lerpFactor);

        // === MESH POSITION (keep feet at ground level) ===
        // When crouching, camera Y drops 0.6m (1.6 -> 1.0), but we want feet to stay planted
        // Compensate by adding back the crouch offset, synced with body animation
        if (this.crouchHeightOffset === undefined) this.crouchHeightOffset = 0;
        const targetCrouchOffset = this.isCrouching ? 0.6 : 0; // Add back the 0.6m when crouching
        this.crouchHeightOffset += (targetCrouchOffset - this.crouchHeightOffset) * 0.3; // Same speed as body anim

        this.mesh.position.set(
            this.position.x,
            this.position.y - 1.6 + this.crouchHeightOffset, // Compensate for crouch
            this.position.z
        );

        // === ROTATION ===
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

        // === CROUCH ANIMATION (fast, no jump) ===
        const targetCrouchY = this.isCrouching ? -0.35 : 0;
        this.currentCrouchY += (targetCrouchY - this.currentCrouchY) * 0.3; // Fast crouch

        // Smooth crouch progress (0 = standing, 1 = crouching)
        if (this.crouchProgress === undefined) this.crouchProgress = 0;
        const targetCrouchProgress = this.isCrouching ? 1 : 0;
        this.crouchProgress += (targetCrouchProgress - this.crouchProgress) * 0.3; // Fast

        // Move upper body down when crouching
        this.torsoMesh.position.y = 1.05 + this.currentCrouchY;
        this.headMesh.position.y = 1.5 + this.currentCrouchY;
        this.visorMesh.position.y = 1.52 + this.currentCrouchY;
        this.armsGroup.position.y = 1.1 + this.currentCrouchY;

        // Compress legs smoothly (using interpolated progress)
        // Legs shrink but stay above ground (bottom at Y=0)
        const legScale = 1.0 - (this.crouchProgress * 0.4); // 1.0 -> 0.6
        this.leftLegMesh.scale.y = legScale;
        this.rightLegMesh.scale.y = legScale;
        // When legs shrink, move them UP so bottom stays at ground level
        // Standing leg height: 0.7, center at 0.35. When scaled to 0.6, height is 0.42, center should be 0.21
        const legY = 0.35 * legScale; // Keep bottom at ground level
        this.leftLegMesh.position.y = legY;
        this.rightLegMesh.position.y = legY;

        // === PEEK/LEAN (smooth, natural movement) ===
        // peekState: -1 = left (Q), +1 = right (E)
        const targetPeekOffset = this.peekState * 0.5;
        const targetPeekTilt = this.peekState * 0.15;

        // Smooth interpolation - faster but natural feeling
        this.currentPeekAngle += (targetPeekOffset - this.currentPeekAngle) * 0.08;

        // Smooth tilt interpolation (initialize if needed)
        if (this.currentPeekTilt === undefined) this.currentPeekTilt = 0;
        this.currentPeekTilt += (targetPeekTilt - this.currentPeekTilt) * 0.08;

        // Upper body: shift + smooth tilt
        this.upperBodyGroup.position.x = this.currentPeekAngle;
        this.upperBodyGroup.rotation.z = -this.currentPeekTilt;

        // Legs: follow body smoothly
        const legShift = this.currentPeekAngle * 0.8;
        this.leftLegMesh.position.x = -0.12 + legShift;
        this.rightLegMesh.position.x = 0.12 + legShift;
        this.leftLegMesh.rotation.z = -this.currentPeekTilt;
        this.rightLegMesh.rotation.z = -this.currentPeekTilt;

        // === ADS/SCOPING ANIMATION (third-person view) ===
        // When aiming: gun centers in front of chin, arms at chest level
        const aimProgress = this.isAiming ? 1 : 0;
        const currentAimProgress = this.currentAimOffset || 0;
        this.currentAimOffset += (aimProgress - currentAimProgress) * 0.12;

        // Arms group - push forward, stay at chest level (not raised too high)
        this.armsGroup.position.z = -0.05 + (this.currentAimOffset * -0.35); // Push forward
        this.armsGroup.position.y = 1.1 + this.currentCrouchY + (this.currentAimOffset * 0.1); // Slight raise only

        // Arms come together and center when aiming
        this.leftArmMesh.position.x = -0.3 + (this.currentAimOffset * 0.1); // Move toward center
        this.rightArmMesh.position.x = 0.3 - (this.currentAimOffset * 0.1); // Move toward center

        // Gun - close to body, centered
        if (this.gunGroup) {
            // Gun closer to center of body
            this.gunGroup.position.x = 0.3 - (this.currentAimOffset * 0.15); // Closer to center
            this.gunGroup.position.y = 0 + (this.currentAimOffset * 0.1); // Higher up
            // Keep gun pointing straight forward
            this.gunGroup.rotation.x = this.currentAimOffset * -0.05;
        }

        // === SHOOT ANIMATION ===
        // Use ADS offset as new base for gun position
        const adsGunZ = this.isAiming ? 0.15 : 0.15; // Gun close to body in both stances
        if (this.shootAnimTime > 0) {
            this.shootAnimTime -= deltaTime;
            const recoil = Math.sin(this.shootAnimTime * 30) * 0.015;
            if (this.gunGroup) this.gunGroup.position.z = adsGunZ + recoil;
            this.muzzleFlashMaterial.opacity = this.shootAnimTime > 0.08 ? 1 : 0;
        } else {
            this.muzzleFlashMaterial.opacity = 0;
            if (this.gunGroup) this.gunGroup.position.z = adsGunZ;
        }

        // === RELOAD ANIMATION ===
        if (this.reloadAnimTime > 0) {
            this.reloadAnimTime -= deltaTime;
            const phase = (2.0 - this.reloadAnimTime) / 2.0;
            if (this.gunGroup) this.gunGroup.rotation.x = Math.sin(phase * Math.PI) * 0.4;
        } else if (this.gunGroup) {
            this.gunGroup.rotation.x = 0;
        }

        // === SPRINT ANIMATION ===
        if (this.isSprinting) {
            const sway = Math.sin(Date.now() * 0.012) * 0.08;
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
