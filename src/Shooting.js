// Shooting.js - Weapon system with multiple guns, ADS, and CS:GO-style recoil
import * as THREE from 'three';

// Weapon definitions with CS:GO-style recoil patterns
const WEAPONS = {
    PISTOL: {
        name: 'Pistol',
        fireRate: 5,
        damage: 25,
        headMultiplier: 2.5,
        magazineSize: 12,
        reloadTime: 1500,
        recoilAmount: 0.025,
        recoilRecovery: 8,
        spread: 0.01,
        adsSpread: 0.002,
        adsZoom: 1.2,
        adsOffsetY: -0.12, // Baseline (working)
        automatic: false,
        model: { bodySize: [0.08, 0.15, 0.3], barrelSize: [0.05, 0.05, 0.15], color: 0x2a2a2a },
        // Pistol pattern - consistent upward kick
        recoilPattern: [
            [0.015, 0], [0.018, 0.002], [0.02, -0.003], [0.022, 0.001],
            [0.025, -0.002], [0.025, 0.003], [0.028, 0], [0.028, -0.002],
            [0.03, 0.002], [0.03, -0.001], [0.032, 0], [0.032, 0.002]
        ]
    },
    RIFLE: {
        name: 'Rifle',
        fireRate: 10,
        damage: 30,
        headMultiplier: 3,
        magazineSize: 30,
        reloadTime: 2500,
        recoilAmount: 0.04,
        recoilRecovery: 6,
        spread: 0.02,
        adsSpread: 0.005,
        adsZoom: 1.5,
        adsOffsetY: -0.105, // Adjusted for height difference
        automatic: true,
        model: { bodySize: [0.06, 0.12, 0.5], barrelSize: [0.04, 0.04, 0.3], color: 0x1a1a1a },
        // Rifle pattern - like AK-47: up, then left, then right
        recoilPattern: [
            [0.025, 0], [0.03, 0], [0.035, 0], [0.04, 0], [0.045, 0],           // First 5: straight up
            [0.045, -0.015], [0.04, -0.02], [0.035, -0.025], [0.03, -0.02],     // Shots 6-9: pull left
            [0.025, -0.01], [0.02, 0], [0.02, 0.01], [0.025, 0.02],             // Shots 10-13: center
            [0.03, 0.025], [0.035, 0.03], [0.04, 0.025], [0.035, 0.02],         // Shots 14-17: pull right
            [0.03, 0.01], [0.025, 0], [0.02, -0.01], [0.025, -0.015],           // Shots 18-21: back left
            [0.03, -0.02], [0.03, -0.01], [0.025, 0.01], [0.03, 0.02],          // Shots 22-25: oscillate
            [0.035, 0.01], [0.03, -0.01], [0.025, 0], [0.02, 0.01], [0.02, -0.01] // Shots 26-30
        ]
    },
    SMG: {
        name: 'SMG',
        fireRate: 15,
        damage: 18,
        headMultiplier: 2,
        magazineSize: 25,
        reloadTime: 2000,
        recoilAmount: 0.03,
        recoilRecovery: 10,
        spread: 0.03,
        adsSpread: 0.015,
        adsZoom: 1.3,
        adsOffsetY: -0.095, // Adjusted for height difference
        automatic: true,
        model: { bodySize: [0.07, 0.1, 0.35], barrelSize: [0.035, 0.035, 0.12], color: 0x3a3a3a },
        // SMG pattern - fast but more random, moderate climb
        recoilPattern: [
            [0.015, 0], [0.02, 0.005], [0.022, -0.005], [0.025, 0.008],
            [0.025, -0.01], [0.028, 0.012], [0.028, -0.008], [0.03, 0.005],
            [0.028, -0.012], [0.025, 0.01], [0.025, -0.005], [0.028, 0.008],
            [0.03, -0.01], [0.028, 0.012], [0.025, -0.008], [0.025, 0.005],
            [0.028, -0.01], [0.03, 0.01], [0.028, -0.005], [0.025, 0.008],
            [0.025, -0.008], [0.028, 0.005], [0.03, -0.01], [0.028, 0.012], [0.025, 0]
        ]
    },
    SHOTGUN: {
        name: 'Shotgun',
        fireRate: 1.5,
        damage: 15, // Per pellet, 8 pellets
        pellets: 8,
        headMultiplier: 2,
        magazineSize: 6,
        reloadTime: 3000,
        recoilAmount: 0.12,
        recoilRecovery: 4,
        spread: 0.08,
        adsSpread: 0.05,
        adsZoom: 1.1,
        adsOffsetY: -0.105, // Adjusted for height difference
        automatic: false,
        model: { bodySize: [0.08, 0.12, 0.55], barrelSize: [0.06, 0.06, 0.25], color: 0x4a3020 },
        // Shotgun pattern - heavy single kick
        recoilPattern: [
            [0.08, 0.01], [0.09, -0.02], [0.1, 0.015], [0.09, -0.01], [0.08, 0.01], [0.07, 0]
        ]
    }
};

export class Shooting {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene = scene;

        // Current weapon
        this.currentWeaponKey = 'RIFLE';
        this.weapon = WEAPONS.RIFLE;

        // Ammo
        this.ammo = this.weapon.magazineSize;
        this.isReloading = false;

        // Shooting state
        this.lastShotTime = 0;
        this.minTimeBetweenShots = 1000 / this.weapon.fireRate;
        this.isShooting = false;

        // ADS (Aim Down Sights)
        this.isAiming = false;
        this.adsTransition = 0; // 0 = hip, 1 = full ADS
        this.adsSpeed = 6;
        this.defaultFOV = 75;
        this.currentFOV = 75;

        // Recoil
        this.recoilPitch = 0; // Accumulated vertical recoil
        this.recoilYaw = 0;   // Accumulated horizontal recoil
        this.shotsFired = 0;  // For recoil pattern

        // Player reference for crouch state
        this.player = null;

        // Reload animation
        this.reloadStartTime = 0;
        this.reloadProgress = 0;
        this.reloadTimeoutId = null; // Track reload timeout for cancellation
        this.onReloadProgress = null; // Callback for HUD

        // Weapon switch animation
        this.isSwitchingWeapon = false;
        this.switchProgress = 0;
        this.switchStartTime = 0;
        this.pendingWeaponKey = null;
        this.switchDuration = 400; // ms for full switch animation

        // Raycaster
        this.raycaster = new THREE.Raycaster();
        this.raycaster.far = 100;

        // Callbacks
        this.onHit = null;
        this.onShoot = null;
        this.onWeaponChange = null;
        this.onReload = null; // For reload sound

        // Enemy meshes
        this.enemyMeshes = [];

        // Gun model
        this.gunModel = null;
        this.defaultGunPos = new THREE.Vector3(0.25, -0.2, -0.4);
        this.adsGunPos = new THREE.Vector3(0, this.weapon.adsOffsetY || -0.12, -0.35);

        this.setupEventListeners();
        this.createGunModel();
    }

    setupEventListeners() {
        // Left click - shoot
        document.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this.isShooting = true;
                this.tryShoot();
            }
            // Right click - ADS
            if (e.button === 2) {
                this.isAiming = true;
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this.isShooting = false;
                this.shotsFired = 0; // Reset recoil pattern
            }
            if (e.button === 2) {
                this.isAiming = false;
            }
        });

        // Prevent context menu on right click
        document.addEventListener('contextmenu', (e) => e.preventDefault());

        // Weapon switching (1-4 keys)
        document.addEventListener('keydown', (e) => {
            switch (e.code) {
                case 'Digit1': this.switchWeapon('RIFLE'); break;
                case 'Digit2': this.switchWeapon('SMG'); break;
                case 'Digit3': this.switchWeapon('SHOTGUN'); break;
                case 'Digit4': this.switchWeapon('PISTOL'); break;
                case 'KeyR': this.reload(); break;
            }
        });
    }

    switchWeapon(weaponKey) {
        if (this.isSwitchingWeapon || weaponKey === this.currentWeaponKey) return;

        // Cancel reload if switching weapons during reload
        if (this.isReloading) {
            this.cancelReload();
        }

        // Start weapon switch animation
        this.isSwitchingWeapon = true;
        this.switchProgress = 0;
        this.switchStartTime = performance.now();
        this.pendingWeaponKey = weaponKey;
    }

    cancelReload() {
        if (!this.isReloading) return;

        this.isReloading = false;
        this.reloadProgress = 0;

        // Clear the reload timeout
        if (this.reloadTimeoutId) {
            clearTimeout(this.reloadTimeoutId);
            this.reloadTimeoutId = null;
        }

        // Notify HUD that reload cancelled
        if (this.onReloadProgress) {
            this.onReloadProgress(0, false);
        }
    }

    // Actually apply the weapon switch (called at midpoint of animation)
    applyWeaponSwitch() {
        const weaponKey = this.pendingWeaponKey;
        this.currentWeaponKey = weaponKey;
        this.weapon = WEAPONS[weaponKey];
        this.ammo = this.weapon.magazineSize;
        this.minTimeBetweenShots = 1000 / this.weapon.fireRate;
        this.shotsFired = 0;
        this.recoilPitch = 0;
        this.recoilYaw = 0;

        // Update ADS position for new weapon
        this.adsGunPos.y = this.weapon.adsOffsetY || -0.12;

        // Recreate gun model
        if (this.gunModel) {
            this.camera.remove(this.gunModel);
        }
        this.createGunModel();

        if (this.onWeaponChange) {
            this.onWeaponChange(this.weapon, this.ammo);
        }
    }

    reload() {
        if (this.isReloading || this.isSwitchingWeapon || this.ammo === this.weapon.magazineSize) return;

        this.isReloading = true;
        this.reloadStartTime = performance.now();
        this.reloadProgress = 0;

        // Notify HUD that reload started
        if (this.onReloadProgress) {
            this.onReloadProgress(0, true);
        }

        // Play reload sound
        if (this.onReload) {
            this.onReload();
        }

        this.reloadTimeoutId = setTimeout(() => {
            this.ammo = this.weapon.magazineSize;
            this.isReloading = false;
            this.reloadProgress = 0;
            this.reloadTimeoutId = null;

            // Notify HUD that reload finished
            if (this.onReloadProgress) {
                this.onReloadProgress(1, false);
            }

            if (this.onWeaponChange) {
                this.onWeaponChange(this.weapon, this.ammo);
            }
        }, this.weapon.reloadTime);
    }

    createGunModel() {
        const gunGroup = new THREE.Group();
        const model = this.weapon.model;

        // Gun body
        const bodyGeometry = new THREE.BoxGeometry(...model.bodySize);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: model.color,
            roughness: 0.3,
            metalness: 0.8
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        gunGroup.add(body);

        // Barrel
        const barrelGeometry = new THREE.BoxGeometry(...model.barrelSize);
        const barrel = new THREE.Mesh(barrelGeometry, bodyMaterial);
        barrel.position.set(0, 0.02, -(model.bodySize[2] / 2 + model.barrelSize[2] / 2));
        gunGroup.add(barrel);

        // Grip
        const gripGeometry = new THREE.BoxGeometry(0.05, 0.1, 0.06);
        const gripMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a3a2a,
            roughness: 0.7,
            metalness: 0.2
        });
        const grip = new THREE.Mesh(gripGeometry, gripMaterial);
        grip.position.set(0, -0.1, 0.04);
        grip.rotation.x = 0.2;
        gunGroup.add(grip);

        // Sight (for ADS reference)
        const sightGeometry = new THREE.BoxGeometry(0.02, 0.04, 0.02);
        const sightMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const sight = new THREE.Mesh(sightGeometry, sightMaterial);
        sight.position.set(0, model.bodySize[1] / 2 + 0.02, 0);
        gunGroup.add(sight);

        // 3D Muzzle flash at barrel tip
        const muzzleFlashTexture = this.createMuzzleFlashTexture();
        const muzzleFlashMaterial = new THREE.SpriteMaterial({
            map: muzzleFlashTexture,
            color: 0xffcc44,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.muzzleFlashSprite = new THREE.Sprite(muzzleFlashMaterial);
        this.muzzleFlashSprite.scale.set(0.15, 0.15, 0.15);
        // Position at barrel tip
        const barrelTipZ = -(model.bodySize[2] / 2 + model.barrelSize[2] + 0.02);
        this.muzzleFlashSprite.position.set(0, 0.02, barrelTipZ);
        this.muzzleFlashSprite.visible = false;
        gunGroup.add(this.muzzleFlashSprite);

        // Position gun
        gunGroup.position.copy(this.defaultGunPos);
        gunGroup.rotation.y = -0.1;

        this.gunModel = gunGroup;
        this.camera.add(gunGroup);
    }

    createMuzzleFlashTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Create radial gradient for flash
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 200, 1)');
        gradient.addColorStop(0.3, 'rgba(255, 200, 50, 0.8)');
        gradient.addColorStop(0.6, 'rgba(255, 150, 0, 0.4)');
        gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    setEnemyMeshes(meshes) {
        this.enemyMeshes = meshes;
    }

    setPlayer(player) {
        this.player = player;
    }

    update(dt) {
        const now = performance.now();

        // === Weapon Switch Animation (Realistic tactical swap) ===
        if (this.isSwitchingWeapon) {
            this.switchProgress = Math.min(1, (now - this.switchStartTime) / this.switchDuration);

            // At 50% progress, actually swap the weapon
            if (this.switchProgress >= 0.5 && this.pendingWeaponKey) {
                this.applyWeaponSwitch();
                this.pendingWeaponKey = null;
            }

            // Realistic weapon swap animation
            if (this.gunModel) {
                // Smooth easing
                const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                const easeOut = (t) => 1 - Math.pow(1 - t, 3);

                if (this.switchProgress < 0.5) {
                    // Phase 1: Lower and rotate current weapon down/right (holstering)
                    const t = easeInOut(this.switchProgress * 2);
                    this.gunModel.position.y = this.defaultGunPos.y - t * 0.35;
                    this.gunModel.position.x = this.defaultGunPos.x + t * 0.2;
                    this.gunModel.rotation.x = -t * 0.6;
                    this.gunModel.rotation.z = -t * 0.3;
                    this.gunModel.rotation.y = -0.1 - t * 0.4;
                } else {
                    // Phase 2: Bring up new weapon from below/left
                    const t = easeOut((this.switchProgress - 0.5) * 2);
                    this.gunModel.position.y = this.defaultGunPos.y - 0.35 + t * 0.35;
                    this.gunModel.position.x = this.defaultGunPos.x - 0.15 + t * 0.15;
                    this.gunModel.rotation.x = -0.4 + t * 0.4;
                    this.gunModel.rotation.z = 0.2 - t * 0.2;
                    this.gunModel.rotation.y = -0.3 + t * 0.2;
                }
            }

            // End switch animation
            if (this.switchProgress >= 1) {
                this.isSwitchingWeapon = false;
                this.switchProgress = 0;
                if (this.gunModel) {
                    this.gunModel.position.copy(this.defaultGunPos);
                    this.gunModel.rotation.set(0, -0.1, 0);
                }
            }
            return; // Block other gun updates during switch
        }

        // === Reload Animation (Realistic tactical reload) ===
        if (this.isReloading) {
            this.reloadProgress = Math.min(1, (now - this.reloadStartTime) / this.weapon.reloadTime);

            // Notify HUD about progress
            if (this.onReloadProgress) {
                this.onReloadProgress(this.reloadProgress, true);
            }

            // Realistic reload animation phases
            if (this.gunModel) {
                // Easing for smooth motion
                const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

                if (this.reloadProgress < 0.15) {
                    // Phase 1: Tilt gun to eject/access magazine (0-15%)
                    const t = easeInOut(this.reloadProgress / 0.15);
                    this.gunModel.rotation.x = -t * 0.3;
                    this.gunModel.rotation.z = t * 0.4;
                    this.gunModel.position.y = this.defaultGunPos.y - t * 0.08;
                    this.gunModel.position.x = this.defaultGunPos.x - t * 0.1;
                } else if (this.reloadProgress < 0.35) {
                    // Phase 2: Drop magazine - quick downward motion (15-35%)
                    const t = easeInOut((this.reloadProgress - 0.15) / 0.2);
                    this.gunModel.rotation.x = -0.3 - t * 0.15;
                    this.gunModel.rotation.z = 0.4;
                    this.gunModel.position.y = this.defaultGunPos.y - 0.08 - t * 0.05;
                } else if (this.reloadProgress < 0.6) {
                    // Phase 3: Insert new magazine - gun stays tilted (35-60%)
                    const t = easeInOut((this.reloadProgress - 0.35) / 0.25);
                    this.gunModel.rotation.x = -0.45 + t * 0.2;
                    this.gunModel.rotation.z = 0.4 - t * 0.1;
                    // Slight upward push as mag clicks in
                    this.gunModel.position.y = this.defaultGunPos.y - 0.13 + t * 0.03;
                } else if (this.reloadProgress < 0.8) {
                    // Phase 4: Slap/release bolt - quick motion (60-80%)
                    const t = easeInOut((this.reloadProgress - 0.6) / 0.2);
                    this.gunModel.rotation.x = -0.25 + t * 0.15;
                    this.gunModel.rotation.z = 0.3 - t * 0.2;
                    this.gunModel.position.x = this.defaultGunPos.x - 0.1 + t * 0.05;
                    // Quick jolt for bolt release
                    const jolt = Math.sin(t * Math.PI) * 0.02;
                    this.gunModel.position.z = this.defaultGunPos.z + jolt;
                } else {
                    // Phase 5: Return to ready position (80-100%)
                    const t = easeInOut((this.reloadProgress - 0.8) / 0.2);
                    this.gunModel.rotation.x = -0.1 * (1 - t);
                    this.gunModel.rotation.z = 0.1 * (1 - t);
                    this.gunModel.position.x = this.defaultGunPos.x - 0.05 * (1 - t);
                    this.gunModel.position.y = this.defaultGunPos.y - 0.05 * (1 - t);
                    this.gunModel.position.z = this.defaultGunPos.z;
                }
            }
        } else if (this.gunModel) {
            // Reset reload animation when not reloading
            this.gunModel.rotation.z = 0;
        }

        // ADS transition
        const adsTarget = this.isAiming ? 1 : 0;
        this.adsTransition += (adsTarget - this.adsTransition) * this.adsSpeed * dt;

        // Update gun position (lerp between hip and ADS) - only if not in reload animation
        if (this.gunModel && !this.isReloading) {
            this.gunModel.position.lerpVectors(this.defaultGunPos, this.adsGunPos, this.adsTransition);
            this.gunModel.rotation.y = -0.1 * (1 - this.adsTransition);
            this.gunModel.rotation.x = 0;
        }

        // Update FOV for zoom
        const targetFOV = this.defaultFOV / (1 + (this.weapon.adsZoom - 1) * this.adsTransition);
        this.currentFOV += (targetFOV - this.currentFOV) * this.adsSpeed * dt;
        this.camera.fov = this.currentFOV;
        this.camera.updateProjectionMatrix();

        // Recoil recovery
        if (!this.isShooting) {
            const recovery = this.weapon.recoilRecovery * dt;
            this.recoilPitch = Math.max(0, this.recoilPitch - recovery);
            this.recoilYaw *= 0.9;
        }

        // Apply recoil to camera
        this.camera.rotation.x = Math.max(-1.5, Math.min(1.5,
            this.camera.rotation.x + this.recoilPitch * dt * 2));
        this.camera.rotation.y += this.recoilYaw * dt;

        // Auto-fire for automatic weapons
        if (this.isShooting && this.weapon.automatic) {
            this.tryShoot();
        }
    }

    tryShoot() {
        if (this.isReloading || this.isSwitchingWeapon) return false;
        if (this.ammo <= 0) {
            this.reload();
            return false;
        }

        const currentTime = performance.now();
        if (currentTime - this.lastShotTime < this.minTimeBetweenShots) {
            return false;
        }

        this.lastShotTime = currentTime;
        this.shoot();
        return true;
    }

    shoot() {
        this.ammo--;
        this.shotsFired++;

        // Calculate spread (reduced when ADS)
        const spread = this.isAiming ? this.weapon.adsSpread : this.weapon.spread;

        // Shotgun fires multiple pellets
        const pellets = this.weapon.pellets || 1;

        for (let p = 0; p < pellets; p++) {
            // Apply spread
            const spreadX = (Math.random() - 0.5) * spread;
            const spreadY = (Math.random() - 0.5) * spread;

            this.raycaster.setFromCamera(new THREE.Vector2(spreadX, spreadY), this.camera);

            const intersects = this.raycaster.intersectObjects(this.enemyMeshes, true);

            if (intersects.length > 0) {
                const hit = intersects[0];
                const isHeadshot = hit.object.userData.isHead === true;
                const damage = isHeadshot
                    ? this.weapon.damage * this.weapon.headMultiplier
                    : this.weapon.damage;

                let hitObject = hit.object;
                while (hitObject.parent && !hitObject.userData.enemy) {
                    hitObject = hitObject.parent;
                }

                if (hitObject.userData.enemy && this.onHit) {
                    this.onHit(hitObject.userData.enemy, damage, hit.point, isHeadshot);
                }

                this.createHitEffect(hit.point, isHeadshot);
            }
        }

        // Apply recoil
        this.applyRecoil();

        // Gun animation
        this.animateRecoil();
        this.showMuzzleFlash();

        if (this.onShoot) {
            this.onShoot();
        }

        if (this.onWeaponChange) {
            this.onWeaponChange(this.weapon, this.ammo);
        }
    }

    applyRecoil() {
        // CS:GO-style recoil pattern system
        const pattern = this.weapon.recoilPattern;
        const patternIndex = Math.min(this.shotsFired - 1, pattern.length - 1);
        const [patternPitch, patternYaw] = pattern[patternIndex];

        // ADS reduces recoil by 40%
        const adsMultiplier = this.isAiming ? 0.6 : 1;

        // Crouching reduces recoil by 30% (like CS:GO)
        const isCrouching = this.player && this.player.isCrouching;
        const crouchMultiplier = isCrouching ? 0.7 : 1;

        // Add slight randomness for natural feel (±10% variation)
        const randomFactor = 0.9 + Math.random() * 0.2;

        // Calculate final recoil values with all multipliers
        const totalMultiplier = adsMultiplier * crouchMultiplier * randomFactor;
        const recoilPitch = patternPitch * totalMultiplier;
        const recoilYaw = patternYaw * totalMultiplier;

        // Accumulate recoil for recovery system
        this.recoilPitch += recoilPitch;
        this.recoilYaw += recoilYaw;

        // Apply immediate camera kick (direct visual feedback)
        // Positive rotation.x = look up (recoil kicks view upward)
        this.camera.rotation.x += recoilPitch * 1.5;
        this.camera.rotation.y += recoilYaw * 1.2;
    }

    animateRecoil() {
        if (!this.gunModel) return;

        const recoilZ = 0.05;
        const recoilRotX = -0.1;

        // Store original
        const origZ = this.gunModel.position.z;
        const origRotX = this.gunModel.rotation.x;

        // Quick recoil
        this.gunModel.position.z += recoilZ;
        this.gunModel.rotation.x = recoilRotX;

        // Return
        setTimeout(() => {
            this.gunModel.position.z = origZ;
            this.gunModel.rotation.x = origRotX;
        }, 50);
    }

    showMuzzleFlash() {
        // Use 3D muzzle flash sprite attached to gun barrel
        if (this.muzzleFlashSprite) {
            this.muzzleFlashSprite.visible = true;
            // Random rotation and slight scale variation for visual variety
            this.muzzleFlashSprite.material.rotation = Math.random() * Math.PI * 2;
            const scale = 0.12 + Math.random() * 0.06;
            this.muzzleFlashSprite.scale.set(scale, scale, scale);

            // Hide after brief flash
            setTimeout(() => {
                if (this.muzzleFlashSprite) {
                    this.muzzleFlashSprite.visible = false;
                }
            }, 50);
        }
    }

    createHitEffect(position, isHeadshot = false) {
        const particleCount = isHeadshot ? 8 : 5;
        const particles = new THREE.Group();
        const color = isHeadshot ? 0xffff00 : 0xff6600;

        for (let i = 0; i < particleCount; i++) {
            const geometry = new THREE.SphereGeometry(0.03, 4, 4);
            const material = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 1
            });
            const particle = new THREE.Mesh(geometry, material);
            particle.position.copy(position);
            particle.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                Math.random() * 2,
                (Math.random() - 0.5) * 2
            );
            particles.add(particle);
        }

        this.scene.add(particles);

        let startTime = performance.now();
        const animate = () => {
            const elapsed = (performance.now() - startTime) / 1000;
            if (elapsed > 0.3) {
                this.scene.remove(particles);
                particles.traverse(obj => {
                    if (obj.geometry) obj.geometry.dispose();
                    if (obj.material) obj.material.dispose();
                });
                return;
            }
            particles.children.forEach(p => {
                p.position.add(p.velocity.clone().multiplyScalar(0.016));
                p.velocity.y -= 0.2;
                p.material.opacity = 1 - elapsed / 0.3;
            });
            requestAnimationFrame(animate);
        };
        animate();
    }

    getWeaponInfo() {
        return {
            name: this.weapon.name,
            ammo: this.ammo,
            maxAmmo: this.weapon.magazineSize,
            isReloading: this.isReloading
        };
    }

    reset() {
        this.lastShotTime = 0;
        this.ammo = this.weapon.magazineSize;
        this.isReloading = false;
        this.shotsFired = 0;
        this.recoilPitch = 0;
        this.recoilYaw = 0;
        this.isAiming = false;
        this.adsTransition = 0;
    }
}
