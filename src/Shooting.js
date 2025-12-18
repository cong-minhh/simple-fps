// Shooting.js - Weapon system with multiple guns, ADS, and CS:GO-style recoil
import * as THREE from 'three';
import { WEAPONS } from './config/GameConfig.js';

export class Shooting {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene = scene;
        this.arena = null; // Set via setArena() for wall collision checking
        this.canvas = null; // Canvas element for wheel events (Chrome fix)

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
        this.onScopeChange = null; // Callback for scope overlay (sniper)

        // Scope state
        this.isScoped = false;
        this.scopeZoomLevel = 4.0; // Current zoom level (adjustable with scroll)
        this.minScopeZoom = 2.0;   // Minimum zoom (2x)
        this.maxScopeZoom = 8.0;   // Maximum zoom (8x)
        this.targetScopeZoom = 4.0; // Target for smooth interpolation

        // Enemy meshes
        this.enemyMeshes = [];

        // Bullet tracer manager (set externally)
        this.bulletTracerManager = null;

        // Last bullet trajectory data for network sync
        this.lastBulletData = { origin: null, target: null };

        // Hit effect particle pool (performance optimization)
        this._hitEffectPool = [];
        this._hitEffectPoolSize = 20;
        this._hitEffectGeometry = new THREE.SphereGeometry(0.03, 4, 4);
        this._initHitEffectPool();

        // Gun model
        this.gunModel = null;
        this.defaultGunPos = new THREE.Vector3(0.25, -0.2, -0.4);
        this.adsGunPos = new THREE.Vector3(0, this.weapon.adsOffsetY || -0.12, -0.35);

        // Weapon sway parameters
        this.swayTime = 0;
        this.breathTime = 0;
        this.swayOffset = new THREE.Vector3();
        this.swayRotation = new THREE.Euler();
        this.lastPlayerVelocity = new THREE.Vector3();

        // Camera effects reference (set from main.js)
        this.cameraEffects = null;

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

        // Weapon switching (1-5 keys)
        document.addEventListener('keydown', (e) => {
            switch (e.code) {
                case 'Digit1': this.switchWeapon('RIFLE'); break;
                case 'Digit2': this.switchWeapon('SMG'); break;
                case 'Digit3': this.switchWeapon('SHOTGUN'); break;
                case 'Digit4': this.switchWeapon('PISTOL'); break;
                case 'Digit5': this.switchWeapon('SNIPER'); break;
                case 'KeyR': this.reload(); break;
            }
        });

        // Scroll wheel handler for scope zoom (initialized when canvas is set)
        this.wheelHandler = (e) => {
            // Work as soon as aiming starts (not waiting for full scope)
            if (this.isAiming && this.weapon.hasScope) {
                e.preventDefault();
                e.stopPropagation();
                const zoomStep = 0.5;
                if (e.deltaY < 0) {
                    this.targetScopeZoom = Math.min(this.maxScopeZoom, this.targetScopeZoom + zoomStep);
                } else if (e.deltaY > 0) {
                    this.targetScopeZoom = Math.max(this.minScopeZoom, this.targetScopeZoom - zoomStep);
                }
            }
        };
    }

    // Set canvas for wheel events (fixes Chrome pointer lock issue)
    setCanvas(canvas) {
        this.canvas = canvas;
        // Chrome needs wheel listener directly on locked element
        canvas.addEventListener('wheel', this.wheelHandler, { passive: false });
        // Also add to document as fallback for Firefox
        document.addEventListener('wheel', this.wheelHandler, { passive: false });
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

        // Store muzzle position for bullet tracer reference
        gunGroup.userData.muzzleOffset = new THREE.Vector3(0, 0.02, barrelTipZ);

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

    setArena(arena) {
        this.arena = arena;
    }

    setBulletTracerManager(manager) {
        this.bulletTracerManager = manager;
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

        // ADS transition (use weapon-specific speed if available)
        const adsTarget = this.isAiming ? 1 : 0;
        const adsSpeedToUse = this.weapon.adsSpeed || this.adsSpeed;
        this.adsTransition += (adsTarget - this.adsTransition) * adsSpeedToUse * dt;

        // === Sniper Scope Overlay ===
        if (this.weapon.hasScope) {
            // Scope activates smoothly when ADS transition > 85%
            const scopeThreshold = 0.85;
            const newScopedState = this.adsTransition > scopeThreshold;

            // Calculate scope opacity (0 to 1 based on transition)
            const scopeOpacity = this.adsTransition > scopeThreshold
                ? Math.min(1, (this.adsTransition - scopeThreshold) / (1 - scopeThreshold))
                : 0;

            // Notify HUD about scope change with opacity for smooth transition
            if (this.onScopeChange) {
                this.onScopeChange(newScopedState, scopeOpacity);
            }

            // Hide gun model when fully scoped (for clean scope view)
            if (this.gunModel) {
                this.gunModel.visible = this.adsTransition < 0.95;
            }

            this.isScoped = newScopedState;
        } else {
            // Non-scoped weapon - ensure scope is hidden and gun is visible
            if (this.isScoped && this.onScopeChange) {
                this.onScopeChange(false, 0);
            }
            this.isScoped = false;
            if (this.gunModel) {
                this.gunModel.visible = true;
            }
        }

        // Update gun position (lerp between hip and ADS) - only if not in reload animation
        if (this.gunModel && !this.isReloading) {
            this.gunModel.position.lerpVectors(this.defaultGunPos, this.adsGunPos, this.adsTransition);
            this.gunModel.rotation.y = -0.1 * (1 - this.adsTransition);
            this.gunModel.rotation.x = 0;
        }

        // Update FOV for zoom (with dynamic scope zoom support)
        let effectiveZoom = this.weapon.adsZoom;

        // For scoped weapons, smoothly interpolate to target zoom level
        if (this.weapon.hasScope && this.isScoped) {
            // Smoothly interpolate current zoom to target
            this.scopeZoomLevel += (this.targetScopeZoom - this.scopeZoomLevel) * 8 * dt;
            effectiveZoom = this.scopeZoomLevel;
        } else if (this.weapon.hasScope) {
            // Reset zoom when not scoped
            this.scopeZoomLevel = this.targetScopeZoom;
        }

        const targetFOV = this.defaultFOV / (1 + (effectiveZoom - 1) * this.adsTransition);
        this.currentFOV += (targetFOV - this.currentFOV) * adsSpeedToUse * dt;
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

        // === Weapon Sway (breathing and movement) ===
        if (this.gunModel && !this.isReloading && !this.isSwitchingWeapon) {
            this.updateWeaponSway(dt);
        }

        // Auto-fire for automatic weapons
        if (this.isShooting && this.weapon.automatic) {
            this.tryShoot();
        }
    }

    /**
     * Update weapon sway for natural movement feel
     * @param {number} dt - Delta time
     */
    updateWeaponSway(dt) {
        // Update time accumulators
        this.breathTime += dt * 2;
        this.swayTime += dt;

        // Get player velocity if available
        let speed = 0;
        let isSprinting = false;
        if (this.player) {
            // Approximate velocity from position changes
            const pos = this.player.getPosition();
            if (this.lastPlayerVelocity.lengthSq() > 0) {
                this.lastPlayerVelocity.subVectors(pos, this.lastPlayerVelocity);
                speed = this.lastPlayerVelocity.length() / dt;
            }
            this.lastPlayerVelocity.copy(pos);
            isSprinting = this.player.isSprinting;
        }

        // Breathing sway (always present but subtle)
        const breathX = Math.sin(this.breathTime) * 0.003;
        const breathY = Math.cos(this.breathTime * 0.7) * 0.002;

        // Movement sway (weapon bob when walking/running)
        const moveIntensity = Math.min(1, speed / 6); // Normalize to max speed
        const bobFrequency = isSprinting ? 12 : 8;
        const bobAmount = isSprinting ? 0.015 : 0.008;
        const moveSwayX = Math.sin(this.swayTime * bobFrequency) * bobAmount * moveIntensity;
        const moveSwayY = Math.abs(Math.sin(this.swayTime * bobFrequency * 2)) * bobAmount * 0.5 * moveIntensity;

        // Sprint weapon lowering
        const sprintLower = isSprinting ? 0.05 : 0;
        const sprintTilt = isSprinting ? 0.1 : 0;

        // Reduce sway when aiming (more stable)
        const aimMultiplier = 1 - this.adsTransition * 0.8;

        // Apply sway to gun position
        this.swayOffset.x = (breathX + moveSwayX) * aimMultiplier;
        this.swayOffset.y = (breathY + moveSwayY - sprintLower) * aimMultiplier;
        this.swayOffset.z = 0;

        // Apply sway rotation
        this.swayRotation.x = sprintTilt * aimMultiplier;
        this.swayRotation.z = moveSwayX * 2 * aimMultiplier;

        // Add sway to gun model (additive to current position)
        this.gunModel.position.x += this.swayOffset.x;
        this.gunModel.position.y += this.swayOffset.y;
        this.gunModel.rotation.x += this.swayRotation.x;
        this.gunModel.rotation.z += this.swayRotation.z;
    }

    tryShoot() {
        // Check if player is dead (multiplayer respawn state)
        if (this.player && this.player.isDead) return false;

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

        // Body part damage multipliers
        const BODY_PART_MULTIPLIERS = {
            head: 3.0,   // Headshot
            torso: 1.0,  // Base damage
            arm: 0.7,    // Reduced
            leg: 0.6     // Most reduced
        };

        // Calculate spread (reduced when ADS)
        const spread = this.isAiming ? this.weapon.adsSpread : this.weapon.spread;

        // Shotgun fires multiple pellets
        const pellets = this.weapon.pellets || 1;

        // Calculate muzzle position for network sync (use first pellet only for network)
        let muzzlePos = null;
        if (this.gunModel && this.gunModel.userData.muzzleOffset) {
            muzzlePos = new THREE.Vector3();
            this.gunModel.localToWorld(muzzlePos.copy(this.gunModel.userData.muzzleOffset));
        } else {
            // Fallback: use camera position offset
            muzzlePos = this.camera.position.clone();
            const forward = new THREE.Vector3(0, 0, -1);
            forward.applyQuaternion(this.camera.quaternion);
            muzzlePos.add(forward.multiplyScalar(0.5));
        }

        // Reset last bullet data for this shot
        this.lastBulletData = { origin: muzzlePos.clone(), target: null };

        for (let p = 0; p < pellets; p++) {
            // Apply spread
            const spreadX = (Math.random() - 0.5) * spread;
            const spreadY = (Math.random() - 0.5) * spread;

            this.raycaster.setFromCamera(new THREE.Vector2(spreadX, spreadY), this.camera);

            // Raycast against ALL scene objects to detect walls/obstacles
            // Include both enemy/player meshes and all other scene objects (walls, arena, boxes)
            const allObjects = [];

            // Add all enemy/player meshes
            for (const mesh of this.enemyMeshes) {
                allObjects.push(mesh);
            }

            // Add all scene children for wall checking (excludes camera which has no geometry)
            for (const obj of this.scene.children) {
                // Skip lights, cameras, and objects already in enemyMeshes
                if (obj.isLight || obj.isCamera || this.enemyMeshes.includes(obj)) continue;
                allObjects.push(obj);
            }

            const intersects = this.raycaster.intersectObjects(allObjects, true);

            if (intersects.length > 0) {
                // Find relevant hits - ignore floor, ceiling, particles, transparent objects
                let playerHit = null;
                let wallHit = null;

                for (const hit of intersects) {
                    // Skip very close hits (probably camera/local player geometry)
                    if (hit.distance < 0.5) continue;

                    // Check if this is a player/enemy hit
                    let checkObj = hit.object;
                    while (checkObj.parent && !checkObj.userData.enemy && !checkObj.userData.isPlayer) {
                        checkObj = checkObj.parent;
                    }

                    if (checkObj.userData.isPlayer || checkObj.userData.enemy) {
                        // This is a player/enemy hit
                        if (!playerHit) playerHit = { hit, rootObj: checkObj };
                    } else {
                        // Potential wall/obstacle - check if it's actually a solid blocking object
                        // Skip if it's a floor (mostly horizontal), transparent, or very small
                        const obj = hit.object;

                        // Skip particles, sprites, non-mesh objects
                        if (!obj.isMesh) continue;

                        // Skip floors/ceilings (check normal - floor normals point up/down)
                        if (hit.face && hit.face.normal) {
                            const normal = hit.face.normal.clone();
                            normal.transformDirection(obj.matrixWorld);
                            // Skip if normal is mostly vertical (floor/ceiling)
                            if (Math.abs(normal.y) > 0.8) continue;
                        }

                        // Skip if material is transparent
                        if (obj.material && obj.material.transparent && obj.material.opacity < 0.5) continue;

                        // This is a valid wall/obstacle
                        if (!wallHit) wallHit = hit;
                    }

                    // If we found both, we can stop
                    if (playerHit && wallHit) break;
                }

                // Only register hit if player is closer than any wall
                if (playerHit && (!wallHit || playerHit.hit.distance < wallHit.distance)) {
                    const hit = playerHit.hit;
                    const hitObject = playerHit.rootObj;

                    // Fire visual tracer to hit point
                    if (this.bulletTracerManager) {
                        this.bulletTracerManager.fireFromCamera(
                            hit.point,
                            this.gunModel,
                            this.currentWeaponKey,
                            this.raycaster.far,
                            this.raycaster.ray.direction
                        );
                    }
                    // Store target for network sync (first pellet only)
                    if (p === 0) {
                        this.lastBulletData.target = hit.point.clone();
                    }

                    // Determine body part and calculate damage
                    const bodyPart = hit.object.userData.bodyPart || 'torso';
                    const isHeadshot = bodyPart === 'head';
                    const multiplier = BODY_PART_MULTIPLIERS[bodyPart] || 1.0;
                    const damage = Math.round(this.weapon.damage * multiplier);

                    // Handle remote player hits
                    if (hitObject.userData.isPlayer && this.onHit) {
                        this.onHit({
                            playerId: hitObject.userData.playerId,
                            isPlayer: true,
                            remotePlayer: hitObject.userData.remotePlayer,
                            bodyPart: bodyPart
                        }, damage, hit.point, isHeadshot);
                        this.createHitEffect(hit.point, isHeadshot);
                    }
                    // Handle enemy hits (single player mode)
                    else if (hitObject.userData.enemy && this.onHit) {
                        this.onHit(hitObject.userData.enemy, damage, hit.point, isHeadshot);
                        this.createHitEffect(hit.point, isHeadshot);
                    }
                } else if (wallHit) {
                    // Hit a wall - fire tracer to wall hit point
                    if (this.bulletTracerManager) {
                        this.bulletTracerManager.fireFromCamera(
                            wallHit.point,
                            this.gunModel,
                            this.currentWeaponKey,
                            this.raycaster.far,
                            this.raycaster.ray.direction
                        );
                    }
                    // Store target for network sync (first pellet only)
                    if (p === 0) {
                        this.lastBulletData.target = wallHit.point.clone();
                    }
                } else {
                    // No valid hit found in intersects - fire tracer along ray direction
                    if (this.bulletTracerManager) {
                        this.bulletTracerManager.fireFromCamera(
                            null,
                            this.gunModel,
                            this.currentWeaponKey,
                            this.raycaster.far,
                            this.raycaster.ray.direction
                        );
                    }
                    // Store target for network sync (first pellet only) - use max range
                    if (p === 0) {
                        const targetPos = this.lastBulletData.origin.clone().add(
                            this.raycaster.ray.direction.clone().normalize().multiplyScalar(this.raycaster.far)
                        );
                        this.lastBulletData.target = targetPos;
                    }
                }
            } else {
                // No intersects at all - fire tracer along ray direction
                if (this.bulletTracerManager) {
                    this.bulletTracerManager.fireFromCamera(
                        null,
                        this.gunModel,
                        this.currentWeaponKey,
                        this.raycaster.far,
                        this.raycaster.ray.direction
                    );
                }
                // Store target for network sync (first pellet only) - use max range
                if (p === 0) {
                    const targetPos = this.lastBulletData.origin.clone().add(
                        this.raycaster.ray.direction.clone().normalize().multiplyScalar(this.raycaster.far)
                    );
                    this.lastBulletData.target = targetPos;
                }
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

    // Initialize hit effect particle pool (call once in constructor)
    _initHitEffectPool() {
        for (let i = 0; i < this._hitEffectPoolSize; i++) {
            const material = new THREE.MeshBasicMaterial({
                color: 0xff6600,
                transparent: true,
                opacity: 1
            });
            const mesh = new THREE.Mesh(this._hitEffectGeometry, material);
            mesh.visible = false;
            mesh.userData.velocity = new THREE.Vector3();
            mesh.userData.active = false;
            mesh.userData.startTime = 0;
            this.scene.add(mesh);
            this._hitEffectPool.push(mesh);
        }
    }

    // Get an inactive particle from pool
    _getPooledParticle() {
        for (const p of this._hitEffectPool) {
            if (!p.userData.active) return p;
        }
        return null; // Pool exhausted
    }

    createHitEffect(position, isHeadshot = false) {
        const particleCount = isHeadshot ? 8 : 5;
        const color = isHeadshot ? 0xffff00 : 0xff6600;
        const startTime = performance.now();
        const activatedParticles = [];

        for (let i = 0; i < particleCount; i++) {
            const particle = this._getPooledParticle();
            if (!particle) break; // Pool exhausted

            particle.position.copy(position);
            particle.material.color.setHex(color);
            particle.material.opacity = 1;
            particle.userData.velocity.set(
                (Math.random() - 0.5) * 2,
                Math.random() * 2,
                (Math.random() - 0.5) * 2
            );
            particle.userData.active = true;
            particle.userData.startTime = startTime;
            particle.visible = true;
            activatedParticles.push(particle);
        }

        // Animate pooled particles
        const animate = () => {
            const now = performance.now();
            let anyActive = false;

            for (const p of activatedParticles) {
                if (!p.userData.active) continue;

                const elapsed = (now - p.userData.startTime) / 1000;
                if (elapsed > 0.3) {
                    // Return to pool
                    p.visible = false;
                    p.userData.active = false;
                } else {
                    anyActive = true;
                    p.position.x += p.userData.velocity.x * 0.016;
                    p.position.y += p.userData.velocity.y * 0.016;
                    p.position.z += p.userData.velocity.z * 0.016;
                    p.userData.velocity.y -= 0.2;
                    p.material.opacity = 1 - elapsed / 0.3;
                }
            }

            if (anyActive) {
                requestAnimationFrame(animate);
            }
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
