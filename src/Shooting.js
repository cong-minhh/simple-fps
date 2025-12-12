// Shooting.js - Weapon system with multiple guns, ADS, and recoil
import * as THREE from 'three';

// Weapon definitions
const WEAPONS = {
    PISTOL: {
        name: 'Pistol',
        fireRate: 5,
        damage: 25,
        headMultiplier: 2.5,
        magazineSize: 12,
        reloadTime: 1500,
        recoilAmount: 0.02,
        recoilRecovery: 5,
        spread: 0.01,
        adsSpread: 0.002,
        adsZoom: 1.2,
        automatic: false,
        model: { bodySize: [0.08, 0.15, 0.3], barrelSize: [0.05, 0.05, 0.15], color: 0x2a2a2a }
    },
    RIFLE: {
        name: 'Rifle',
        fireRate: 10,
        damage: 30,
        headMultiplier: 3,
        magazineSize: 30,
        reloadTime: 2500,
        recoilAmount: 0.035,
        recoilRecovery: 8,
        spread: 0.02,
        adsSpread: 0.005,
        adsZoom: 1.5,
        automatic: true,
        model: { bodySize: [0.06, 0.12, 0.5], barrelSize: [0.04, 0.04, 0.3], color: 0x1a1a1a }
    },
    SMG: {
        name: 'SMG',
        fireRate: 15,
        damage: 18,
        headMultiplier: 2,
        magazineSize: 25,
        reloadTime: 2000,
        recoilAmount: 0.025,
        recoilRecovery: 12,
        spread: 0.03,
        adsSpread: 0.015,
        adsZoom: 1.3,
        automatic: true,
        model: { bodySize: [0.07, 0.1, 0.35], barrelSize: [0.035, 0.035, 0.12], color: 0x3a3a3a }
    },
    SHOTGUN: {
        name: 'Shotgun',
        fireRate: 1.5,
        damage: 15, // Per pellet, 8 pellets
        pellets: 8,
        headMultiplier: 2,
        magazineSize: 6,
        reloadTime: 3000,
        recoilAmount: 0.08,
        recoilRecovery: 3,
        spread: 0.08,
        adsSpread: 0.05,
        adsZoom: 1.1,
        automatic: false,
        model: { bodySize: [0.08, 0.12, 0.55], barrelSize: [0.06, 0.06, 0.25], color: 0x4a3020 }
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

        // Raycaster
        this.raycaster = new THREE.Raycaster();
        this.raycaster.far = 100;

        // Callbacks
        this.onHit = null;
        this.onShoot = null;
        this.onWeaponChange = null;

        // Enemy meshes
        this.enemyMeshes = [];

        // Gun model
        this.gunModel = null;
        this.defaultGunPos = new THREE.Vector3(0.25, -0.2, -0.4);
        this.adsGunPos = new THREE.Vector3(0, -0.12, -0.35);

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
        if (this.isReloading || weaponKey === this.currentWeaponKey) return;

        this.currentWeaponKey = weaponKey;
        this.weapon = WEAPONS[weaponKey];
        this.ammo = this.weapon.magazineSize;
        this.minTimeBetweenShots = 1000 / this.weapon.fireRate;
        this.shotsFired = 0;
        this.recoilPitch = 0;
        this.recoilYaw = 0;

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
        if (this.isReloading || this.ammo === this.weapon.magazineSize) return;

        this.isReloading = true;

        setTimeout(() => {
            this.ammo = this.weapon.magazineSize;
            this.isReloading = false;
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

        // Position gun
        gunGroup.position.copy(this.defaultGunPos);
        gunGroup.rotation.y = -0.1;

        this.gunModel = gunGroup;
        this.camera.add(gunGroup);
    }

    setEnemyMeshes(meshes) {
        this.enemyMeshes = meshes;
    }

    update(dt) {
        // ADS transition
        const adsTarget = this.isAiming ? 1 : 0;
        this.adsTransition += (adsTarget - this.adsTransition) * this.adsSpeed * dt;

        // Update gun position (lerp between hip and ADS)
        if (this.gunModel) {
            this.gunModel.position.lerpVectors(this.defaultGunPos, this.adsGunPos, this.adsTransition);
            this.gunModel.rotation.y = -0.1 * (1 - this.adsTransition);
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
        if (this.isReloading) return false;
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
        // Recoil pattern - gets worse with consecutive shots
        const recoilMultiplier = 1 + this.shotsFired * 0.1;
        const baseRecoil = this.weapon.recoilAmount * (this.isAiming ? 0.6 : 1);

        // Vertical recoil (always up)
        this.recoilPitch += baseRecoil * recoilMultiplier;

        // Horizontal recoil (random sway)
        this.recoilYaw += (Math.random() - 0.5) * baseRecoil * 0.5;

        // Direct camera kick
        this.camera.rotation.x -= baseRecoil * 0.5;
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
        const flash = document.getElementById('muzzle-flash');
        if (flash) {
            flash.style.opacity = '1';
            setTimeout(() => flash.style.opacity = '0', 50);
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
