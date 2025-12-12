// Shooting.js - Raycast shooting system
import * as THREE from 'three';

export class Shooting {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene = scene;

        // Shooting settings
        this.fireRate = 6; // shots per second
        this.damage = 20;
        this.lastShotTime = 0;
        this.minTimeBetweenShots = 1000 / this.fireRate;

        // Raycaster for hit detection
        this.raycaster = new THREE.Raycaster();
        this.raycaster.far = 100;

        // Muzzle flash reference
        this.muzzleFlash = null;

        // Callbacks
        this.onHit = null;
        this.onShoot = null;

        // Enemy meshes to check against
        this.enemyMeshes = [];

        this.setupEventListeners();
        this.createGunModel();
    }

    setupEventListeners() {
        document.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left click
                this.tryShoot();
            }
        });
    }

    createGunModel() {
        // Simple low-poly pistol
        const gunGroup = new THREE.Group();

        // Gun body
        const bodyGeometry = new THREE.BoxGeometry(0.08, 0.15, 0.3);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a2a2a,
            roughness: 0.3,
            metalness: 0.8
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        gunGroup.add(body);

        // Gun barrel
        const barrelGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.15);
        const barrel = new THREE.Mesh(barrelGeometry, bodyMaterial);
        barrel.position.set(0, 0.03, -0.2);
        gunGroup.add(barrel);

        // Gun grip
        const gripGeometry = new THREE.BoxGeometry(0.06, 0.12, 0.08);
        const gripMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a3a2a,
            roughness: 0.7,
            metalness: 0.2
        });
        const grip = new THREE.Mesh(gripGeometry, gripMaterial);
        grip.position.set(0, -0.12, 0.05);
        grip.rotation.x = 0.2;
        gunGroup.add(grip);

        // Position gun in view
        gunGroup.position.set(0.25, -0.2, -0.4);
        gunGroup.rotation.y = -0.1;

        this.gunModel = gunGroup;
        this.camera.add(gunGroup);
    }

    setEnemyMeshes(meshes) {
        this.enemyMeshes = meshes;
    }

    tryShoot() {
        const currentTime = performance.now();

        if (currentTime - this.lastShotTime < this.minTimeBetweenShots) {
            return false;
        }

        this.lastShotTime = currentTime;
        this.shoot();
        return true;
    }

    shoot() {
        // Cast ray from center of screen
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

        // Check for hits
        const intersects = this.raycaster.intersectObjects(this.enemyMeshes, true);

        if (intersects.length > 0) {
            const hit = intersects[0];

            // Find the enemy this mesh belongs to
            let hitObject = hit.object;
            while (hitObject.parent && !hitObject.userData.enemy) {
                hitObject = hitObject.parent;
            }

            if (hitObject.userData.enemy) {
                // Notify hit callback
                if (this.onHit) {
                    this.onHit(hitObject.userData.enemy, this.damage, hit.point);
                }

                // Create hit effect
                this.createHitEffect(hit.point);
            }
        }

        // Gun recoil animation
        this.animateRecoil();

        // Muzzle flash
        this.showMuzzleFlash();

        // Shoot callback (for audio)
        if (this.onShoot) {
            this.onShoot();
        }
    }

    animateRecoil() {
        if (!this.gunModel) return;

        const originalZ = -0.4;
        const recoilZ = -0.35;
        const originalRotX = 0;
        const recoilRotX = -0.1;

        // Quick recoil back
        this.gunModel.position.z = recoilZ;
        this.gunModel.rotation.x = recoilRotX;

        // Smooth return
        setTimeout(() => {
            this.gunModel.position.z = originalZ;
            this.gunModel.rotation.x = originalRotX;
        }, 50);
    }

    showMuzzleFlash() {
        const flash = document.getElementById('muzzle-flash');
        if (flash) {
            flash.style.opacity = '1';
            setTimeout(() => {
                flash.style.opacity = '0';
            }, 50);
        }
    }

    createHitEffect(position) {
        // Create small particle burst at hit location
        const particleCount = 5;
        const particles = new THREE.Group();

        for (let i = 0; i < particleCount; i++) {
            const geometry = new THREE.SphereGeometry(0.03, 4, 4);
            const material = new THREE.MeshBasicMaterial({
                color: 0xff6600,
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

        // Animate and remove particles
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

    reset() {
        this.lastShotTime = 0;
    }
}
