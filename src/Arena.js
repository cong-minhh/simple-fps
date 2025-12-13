
// Arena.js - Creates the game arena with collision geometry
import * as THREE from 'three';

export class Arena {
    constructor(scene) {
        this.scene = scene;
        this.colliders = []; // AABB collision boxes
        this.spawnPoints = [];
        this.waypoints = [];

        // Performance: Pool arrays for dynamic elements
        this.flickeringLights = [];
        this.explosiveBarrels = [];
        this.hazardZones = [];
        this.particles = null; // Single instanced particle system

        // Pre-allocate reusable objects for update loop
        this._tempVec = new THREE.Vector3();

        // Settings flags
        this.flickerEnabled = true;

        this.createSkybox();
        this.createFloor();
        this.createWalls();
        this.createCrates();
        this.createBarrels();
        this.createExplosiveBarrels();
        this.createPlatforms();
        this.createRamp();
        this.createPillars();
        this.createHazardZones();
        this.createBoundaryWalls();
        this.createAtmosphericParticles();
        this.setupWaypoints();
        this.setupSpawnPoints();
        this.addAtmosphere();
    }

    createSkybox() {
        // Dark gradient sky
        const skyGeometry = new THREE.SphereGeometry(100, 32, 32);
        const skyMaterial = new THREE.MeshBasicMaterial({
            color: 0x0a0a1a,
            side: THREE.BackSide
        });
        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        this.scene.add(sky);
    }

    addAtmosphere() {
        // Fog for atmosphere
        this.scene.fog = new THREE.Fog(0x0a0a1a, 15, 50);

        // Ambient light boost
        const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
        this.scene.add(ambientLight);

        // Colored flickering point lights for industrial atmosphere
        const lightColors = [0xff4444, 0x44ff44, 0x4444ff, 0xffaa00];
        const lightPositions = [[-8, 3, -8], [8, 3, -8], [-8, 3, 8], [8, 3, 8]];

        lightPositions.forEach((pos, i) => {
            const light = new THREE.PointLight(lightColors[i], 0.3, 15);
            light.position.set(...pos);
            this.scene.add(light);

            // Add to flickering lights for animation
            this.flickeringLights.push({
                light: light,
                baseIntensity: 0.3,
                flickerSpeed: 3 + Math.random() * 4, // 3-7 Hz flicker
                phase: Math.random() * Math.PI * 2  // Random start phase
            });
        });

        // Add extra warning lights near hazards
        const warningPositions = [[-8, 2, 0], [8, 2, 0], [0, 2, -9]];
        warningPositions.forEach(pos => {
            const light = new THREE.PointLight(0xff0000, 0.4, 6);
            light.position.set(...pos);
            this.scene.add(light);

            this.flickeringLights.push({
                light: light,
                baseIntensity: 0.4,
                flickerSpeed: 8 + Math.random() * 4, // Fast warning flicker
                phase: Math.random() * Math.PI * 2
            });
        });
    }

    createFloor() {
        // Create grid texture procedurally
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Dark base
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, 512, 512);

        // Grid lines
        ctx.strokeStyle = '#2a3a4a';
        ctx.lineWidth = 2;
        const gridSize = 32;
        for (let i = 0; i <= 512; i += gridSize) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, 512);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(512, i);
            ctx.stroke();
        }

        // Add some detail squares
        ctx.fillStyle = '#252540';
        for (let x = 0; x < 512; x += 64) {
            for (let y = 0; y < 512; y += 64) {
                if ((x + y) % 128 === 0) {
                    ctx.fillRect(x + 4, y + 4, 56, 56);
                }
            }
        }

        const floorTexture = new THREE.CanvasTexture(canvas);
        floorTexture.wrapS = THREE.RepeatWrapping;
        floorTexture.wrapT = THREE.RepeatWrapping;
        floorTexture.repeat.set(4, 4);

        const floorGeometry = new THREE.PlaneGeometry(40, 40);
        const floorMaterial = new THREE.MeshStandardMaterial({
            map: floorTexture,
            roughness: 0.7,
            metalness: 0.3
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);
    }

    createWalls() {
        // 4 low walls for cover - positioned around the arena
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a4a5a,
            roughness: 0.6,
            metalness: 0.3
        });

        const wallConfigs = [
            { pos: [-5, 1, -3], size: [3, 2, 0.5] },
            { pos: [5, 1, 3], size: [3, 2, 0.5] },
            { pos: [-3, 1, 5], size: [0.5, 2, 3] },
            { pos: [3, 1, -5], size: [0.5, 2, 3] }
        ];

        wallConfigs.forEach(config => {
            const geometry = new THREE.BoxGeometry(...config.size);
            const wall = new THREE.Mesh(geometry, wallMaterial);
            wall.position.set(...config.pos);
            wall.castShadow = true;
            wall.receiveShadow = true;
            this.scene.add(wall);

            // Add collider
            this.colliders.push({
                min: new THREE.Vector3(
                    config.pos[0] - config.size[0] / 2,
                    config.pos[1] - config.size[1] / 2,
                    config.pos[2] - config.size[2] / 2
                ),
                max: new THREE.Vector3(
                    config.pos[0] + config.size[0] / 2,
                    config.pos[1] + config.size[1] / 2,
                    config.pos[2] + config.size[2] / 2
                )
            });
        });
    }

    createCrates() {
        // Wooden crate texture
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#5a4030';
        ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = '#3a2818';
        ctx.lineWidth = 4;
        ctx.strokeRect(4, 4, 120, 120);
        ctx.strokeRect(32, 32, 64, 64);

        const crateTexture = new THREE.CanvasTexture(canvas);

        const crateMaterial = new THREE.MeshStandardMaterial({
            map: crateTexture,
            roughness: 0.9,
            metalness: 0.1
        });

        const cratePositions = [
            [-6, 0.5, 0], [6, 0.5, 0], [0, 0.5, 6], [0, 0.5, -6],
            [-4, 0.5, -6], [4, 0.5, 6], [-8, 0.5, 3], [8, 0.5, -3]
        ];

        cratePositions.forEach(pos => {
            const size = 0.8 + Math.random() * 0.4;
            const geometry = new THREE.BoxGeometry(size, size, size);
            const crate = new THREE.Mesh(geometry, crateMaterial);
            crate.position.set(pos[0], pos[1] * size, pos[2]);
            crate.rotation.y = Math.random() * 0.5;
            crate.castShadow = true;
            crate.receiveShadow = true;
            this.scene.add(crate);

            // Add collider
            const half = size / 2;
            this.colliders.push({
                min: new THREE.Vector3(pos[0] - half, 0, pos[2] - half),
                max: new THREE.Vector3(pos[0] + half, size, pos[2] + half)
            });
        });
    }

    createBarrels() {
        const barrelMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a4a3a,
            roughness: 0.6,
            metalness: 0.4
        });

        const barrelPositions = [
            [-2, 0.6, -8], [2, 0.6, 8], [-8, 0.6, -2], [8, 0.6, 2]
        ];

        barrelPositions.forEach(pos => {
            const geometry = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 12);
            const barrel = new THREE.Mesh(geometry, barrelMaterial);
            barrel.position.set(...pos);
            barrel.castShadow = true;
            this.scene.add(barrel);

            // Metal rings
            const ringMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.8 });
            [-0.4, 0, 0.4].forEach(y => {
                const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 8, 16), ringMat);
                ring.rotation.x = Math.PI / 2;
                ring.position.set(pos[0], pos[1] + y, pos[2]);
                this.scene.add(ring);
            });

            this.colliders.push({
                min: new THREE.Vector3(pos[0] - 0.4, 0, pos[2] - 0.4),
                max: new THREE.Vector3(pos[0] + 0.4, 1.2, pos[2] + 0.4)
            });
        });
    }

    createPillars() {
        const pillarMaterial = new THREE.MeshStandardMaterial({
            color: 0x3a3a4a,
            roughness: 0.4,
            metalness: 0.6
        });

        const pillarPositions = [
            [-12, 2.5, -12], [12, 2.5, -12], [-12, 2.5, 12], [12, 2.5, 12],
            [-12, 2.5, 0], [12, 2.5, 0], [0, 2.5, -12], [0, 2.5, 12]
        ];

        pillarPositions.forEach(pos => {
            const geometry = new THREE.CylinderGeometry(0.5, 0.6, 5, 8);
            const pillar = new THREE.Mesh(geometry, pillarMaterial);
            pillar.position.set(...pos);
            pillar.castShadow = true;
            pillar.receiveShadow = true;
            this.scene.add(pillar);

            // Glowing top
            const glowMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
            const glow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), glowMat);
            glow.position.set(pos[0], 5.2, pos[2]);
            this.scene.add(glow);

            // Point light at top
            const light = new THREE.PointLight(0x00ff88, 0.5, 8);
            light.position.set(pos[0], 5, pos[2]);
            this.scene.add(light);

            this.colliders.push({
                min: new THREE.Vector3(pos[0] - 0.6, 0, pos[2] - 0.6),
                max: new THREE.Vector3(pos[0] + 0.6, 5, pos[2] + 0.6)
            });
        });
    }

    createPlatforms() {
        const platformMaterial = new THREE.MeshStandardMaterial({
            color: 0x3a5a4a,
            roughness: 0.5,
            metalness: 0.4
        });

        const platformConfigs = [
            { pos: [-7, 1.5, -7], size: [3, 0.3, 3] },
            { pos: [7, 1.5, 7], size: [3, 0.3, 3] }
        ];

        platformConfigs.forEach(config => {
            const geometry = new THREE.BoxGeometry(...config.size);
            const platform = new THREE.Mesh(geometry, platformMaterial);
            platform.position.set(...config.pos);
            platform.castShadow = true;
            platform.receiveShadow = true;
            this.scene.add(platform);

            // Platform legs
            const legGeometry = new THREE.BoxGeometry(0.3, 1.5, 0.3);
            const legMaterial = new THREE.MeshStandardMaterial({ color: 0x2a3a2a });

            const legPositions = [
                [config.pos[0] - 1.2, 0.75, config.pos[2] - 1.2],
                [config.pos[0] + 1.2, 0.75, config.pos[2] - 1.2],
                [config.pos[0] - 1.2, 0.75, config.pos[2] + 1.2],
                [config.pos[0] + 1.2, 0.75, config.pos[2] + 1.2]
            ];

            legPositions.forEach(pos => {
                const leg = new THREE.Mesh(legGeometry, legMaterial);
                leg.position.set(...pos);
                leg.castShadow = true;
                this.scene.add(leg);
            });

            // Add collider for platform top
            this.colliders.push({
                min: new THREE.Vector3(
                    config.pos[0] - config.size[0] / 2,
                    config.pos[1] - config.size[1] / 2,
                    config.pos[2] - config.size[2] / 2
                ),
                max: new THREE.Vector3(
                    config.pos[0] + config.size[0] / 2,
                    config.pos[1] + config.size[1] / 2,
                    config.pos[2] + config.size[2] / 2
                ),
                isPlatform: true
            });
        });
    }

    createRamp() {
        const rampMaterial = new THREE.MeshStandardMaterial({
            color: 0x5a4a3a,
            roughness: 0.7,
            metalness: 0.2
        });

        // Create a ramp using a box with rotation
        const rampGeometry = new THREE.BoxGeometry(2, 0.3, 4);
        const ramp = new THREE.Mesh(rampGeometry, rampMaterial);
        ramp.position.set(0, 0.5, -7);
        ramp.rotation.x = Math.PI / 8;
        ramp.castShadow = true;
        ramp.receiveShadow = true;
        this.scene.add(ramp);
    }

    createBoundaryWalls() {
        // Invisible boundary walls to keep player in arena
        const boundarySize = 10.5;
        const boundaries = [
            { min: new THREE.Vector3(-boundarySize, 0, -100), max: new THREE.Vector3(-boundarySize + 0.5, 10, 100) },
            { min: new THREE.Vector3(boundarySize - 0.5, 0, -100), max: new THREE.Vector3(boundarySize, 10, 100) },
            { min: new THREE.Vector3(-100, 0, -boundarySize), max: new THREE.Vector3(100, 10, -boundarySize + 0.5) },
            { min: new THREE.Vector3(-100, 0, boundarySize - 0.5), max: new THREE.Vector3(100, 10, boundarySize) }
        ];

        boundaries.forEach(b => this.colliders.push(b));

        // Visual boundary indicators
        const boundaryMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a2e,
            roughness: 1,
            metalness: 0
        });

        const boundaryConfigs = [
            { pos: [-10, 1, 0], size: [0.2, 2, 20] },
            { pos: [10, 1, 0], size: [0.2, 2, 20] },
            { pos: [0, 1, -10], size: [20, 2, 0.2] },
            { pos: [0, 1, 10], size: [20, 2, 0.2] }
        ];

        boundaryConfigs.forEach(config => {
            const geometry = new THREE.BoxGeometry(...config.size);
            const wall = new THREE.Mesh(geometry, boundaryMaterial);
            wall.position.set(...config.pos);
            this.scene.add(wall);
        });
    }

    setupWaypoints() {
        // Patrol waypoints for enemy AI
        this.waypoints = [
            new THREE.Vector3(-6, 0, -6),
            new THREE.Vector3(6, 0, -6),
            new THREE.Vector3(6, 0, 6),
            new THREE.Vector3(-6, 0, 6),
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(-3, 0, 0),
            new THREE.Vector3(3, 0, 0),
            new THREE.Vector3(0, 0, -3),
            new THREE.Vector3(0, 0, 3)
        ];
    }

    setupSpawnPoints() {
        // Enemy spawn points at arena edges
        this.spawnPoints = [
            new THREE.Vector3(-9, 0, -9),
            new THREE.Vector3(9, 0, -9),
            new THREE.Vector3(-9, 0, 9),
            new THREE.Vector3(9, 0, 9)
        ];
    }

    getRandomSpawnPoint() {
        return this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)].clone();
    }

    getRandomWaypoint() {
        return this.waypoints[Math.floor(Math.random() * this.waypoints.length)].clone();
    }

    checkCollision(position, radius = 0.5) {
        const playerBox = {
            min: new THREE.Vector3(
                position.x - radius,
                position.y - 1,
                position.z - radius
            ),
            max: new THREE.Vector3(
                position.x + radius,
                position.y + 0.5,
                position.z + radius
            )
        };

        for (const collider of this.colliders) {
            if (this.aabbIntersect(playerBox, collider)) {
                return collider;
            }
        }
        return null;
    }

    aabbIntersect(a, b) {
        return (
            a.min.x <= b.max.x && a.max.x >= b.min.x &&
            a.min.y <= b.max.y && a.max.y >= b.min.y &&
            a.min.z <= b.max.z && a.max.z >= b.min.z
        );
    }

    getFloorHeight(x, z) {
        let highestFloor = 0;

        // Check all colliders for standing surfaces
        for (const collider of this.colliders) {
            // Check if player XZ is within collider bounds
            if (x >= collider.min.x && x <= collider.max.x &&
                z >= collider.min.z && z <= collider.max.z) {
                // Only count if it's a valid platform height (not too tall to climb)
                const topY = collider.max.y;
                if (topY > highestFloor && topY <= 3) { // Max climbable height
                    highestFloor = topY;
                }
            }
        }
        return highestFloor;
    }

    // === NEW ENVIRONMENT FEATURES (Performance Optimized) ===

    createExplosiveBarrels() {
        // Shared geometry and material (instancing-friendly)
        const barrelGeo = new THREE.CylinderGeometry(0.35, 0.4, 1.0, 8);
        const barrelMat = new THREE.MeshStandardMaterial({
            color: 0x8b0000,
            roughness: 0.4,
            metalness: 0.6,
            emissive: 0xff2200,
            emissiveIntensity: 0.15
        });

        const hazardMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const hazardGeo = new THREE.BoxGeometry(0.25, 0.08, 0.02);

        const positions = [
            [-4, 0.5, 4], [4, 0.5, -4], [0, 0.5, 8], [-7, 0.5, -2]
        ];

        positions.forEach(pos => {
            const barrel = new THREE.Mesh(barrelGeo, barrelMat.clone());
            barrel.position.set(pos[0], pos[1], pos[2]);
            barrel.castShadow = true;
            barrel.userData.isExplosive = true;
            barrel.userData.health = 30;
            this.scene.add(barrel);

            // Hazard stripe (single mesh)
            const stripe = new THREE.Mesh(hazardGeo, hazardMat);
            stripe.position.set(pos[0], pos[1] + 0.2, pos[2] + 0.36);
            this.scene.add(stripe);

            // Glow light (low intensity, no shadows)
            const glow = new THREE.PointLight(0xff4400, 0.3, 4);
            glow.position.set(pos[0], pos[1] + 0.8, pos[2]);
            this.scene.add(glow);

            this.explosiveBarrels.push({
                mesh: barrel,
                light: glow,
                position: new THREE.Vector3(pos[0], pos[1], pos[2]),
                health: 30,
                isExploded: false
            });

            // Add thin collider
            this.colliders.push({
                min: new THREE.Vector3(pos[0] - 0.4, 0, pos[2] - 0.4),
                max: new THREE.Vector3(pos[0] + 0.4, 1.0, pos[2] + 0.4),
                isExplosive: true,
                barrelIndex: this.explosiveBarrels.length - 1
            });
        });
    }

    createHazardZones() {
        // Toxic floor zones - use single shared material
        const hazardMat = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });

        const zones = [
            { pos: [-8, 0.02, 0], size: [2, 3], damage: 5 },
            { pos: [8, 0.02, 0], size: [2, 3], damage: 5 },
            { pos: [0, 0.02, -9], size: [3, 2], damage: 8 }
        ];

        zones.forEach(zone => {
            const geo = new THREE.PlaneGeometry(zone.size[0], zone.size[1]);
            const mesh = new THREE.Mesh(geo, hazardMat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(zone.pos[0], zone.pos[1], zone.pos[2]);
            this.scene.add(mesh);

            // Bubbling particles effect using point sprite
            const bubbleGeo = new THREE.BufferGeometry();
            const bubbleCount = 8;
            const positions = new Float32Array(bubbleCount * 3);
            for (let i = 0; i < bubbleCount; i++) {
                positions[i * 3] = zone.pos[0] + (Math.random() - 0.5) * zone.size[0];
                positions[i * 3 + 1] = 0.1 + Math.random() * 0.3;
                positions[i * 3 + 2] = zone.pos[2] + (Math.random() - 0.5) * zone.size[1];
            }
            bubbleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            const bubbleMat = new THREE.PointsMaterial({
                color: 0x44ff44,
                size: 0.15,
                transparent: true,
                opacity: 0.6
            });
            const bubbles = new THREE.Points(bubbleGeo, bubbleMat);
            this.scene.add(bubbles);

            this.hazardZones.push({
                mesh,
                bubbles,
                bounds: {
                    minX: zone.pos[0] - zone.size[0] / 2,
                    maxX: zone.pos[0] + zone.size[0] / 2,
                    minZ: zone.pos[2] - zone.size[1] / 2,
                    maxZ: zone.pos[2] + zone.size[1] / 2
                },
                damage: zone.damage,
                lastDamageTime: 0
            });
        });
    }

    createAtmosphericParticles() {
        // Single instanced particle system for dust/embers (one draw call)
        const particleCount = 100;
        const geometry = new THREE.BufferGeometry();

        const positions = new Float32Array(particleCount * 3);
        const velocities = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            // Spread across arena
            positions[i * 3] = (Math.random() - 0.5) * 20;
            positions[i * 3 + 1] = Math.random() * 5;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 20;

            // Slow drift velocities (stored for update)
            velocities[i * 3] = (Math.random() - 0.5) * 0.2;
            velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.1;
            velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.2;

            // Warm ember colors
            const brightness = 0.5 + Math.random() * 0.5;
            colors[i * 3] = brightness;
            colors[i * 3 + 1] = brightness * 0.4;
            colors[i * 3 + 2] = brightness * 0.1;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.08,
            vertexColors: true,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending
        });

        this.particles = new THREE.Points(geometry, material);
        this.particles.userData.velocities = velocities;
        this.scene.add(this.particles);
    }

    // Call this in game loop - highly optimized (no allocations)
    update(deltaTime, playerPos = null) {
        const time = performance.now() * 0.001;

        // Update flickering lights (cheap - just intensity changes)
        if (this.flickerEnabled) {
            for (let i = 0; i < this.flickeringLights.length; i++) {
                const fl = this.flickeringLights[i];
                // Fast flicker using sin + noise approximation
                fl.light.intensity = fl.baseIntensity * (0.7 + 0.3 * Math.sin(time * fl.flickerSpeed + fl.phase));
            }
        }

        // Update atmospheric particles (single buffer update)
        if (this.particles) {
            const positions = this.particles.geometry.attributes.position.array;
            const velocities = this.particles.userData.velocities;
            const count = positions.length / 3;

            for (let i = 0; i < count; i++) {
                const i3 = i * 3;
                positions[i3] += velocities[i3] * deltaTime;
                positions[i3 + 1] += velocities[i3 + 1] * deltaTime;
                positions[i3 + 2] += velocities[i3 + 2] * deltaTime;

                // Wrap particles to stay in arena (no conditionals where possible)
                if (positions[i3] > 10) positions[i3] = -10;
                if (positions[i3] < -10) positions[i3] = 10;
                if (positions[i3 + 1] > 5) positions[i3 + 1] = 0;
                if (positions[i3 + 1] < 0) positions[i3 + 1] = 5;
                if (positions[i3 + 2] > 10) positions[i3 + 2] = -10;
                if (positions[i3 + 2] < -10) positions[i3 + 2] = 10;
            }
            this.particles.geometry.attributes.position.needsUpdate = true;
        }

        // Update hazard zone bubbles (simple Y oscillation)
        for (let i = 0; i < this.hazardZones.length; i++) {
            const hz = this.hazardZones[i];
            const positions = hz.bubbles.geometry.attributes.position.array;
            const count = positions.length / 3;
            for (let j = 0; j < count; j++) {
                positions[j * 3 + 1] = 0.1 + Math.abs(Math.sin(time * 2 + j)) * 0.4;
            }
            hz.bubbles.geometry.attributes.position.needsUpdate = true;
        }

        // Check player in hazard zones (if playerPos provided)
        let hazardDamage = 0;
        if (playerPos) {
            for (let i = 0; i < this.hazardZones.length; i++) {
                const hz = this.hazardZones[i];
                if (playerPos.x >= hz.bounds.minX && playerPos.x <= hz.bounds.maxX &&
                    playerPos.z >= hz.bounds.minZ && playerPos.z <= hz.bounds.maxZ) {
                    if (time - hz.lastDamageTime > 0.5) { // Damage every 0.5s
                        hazardDamage += hz.damage;
                        hz.lastDamageTime = time;
                    }
                }
            }
        }

        return { hazardDamage };
    }

    // Explode a barrel at given index
    explodeBarrel(barrelIndex, onExplosion = null) {
        const barrel = this.explosiveBarrels[barrelIndex];
        if (!barrel || barrel.isExploded) return null;

        barrel.isExploded = true;
        const pos = barrel.position;

        // Visual explosion effect
        const explosionGeo = new THREE.SphereGeometry(0.5, 8, 8);
        const explosionMat = new THREE.MeshBasicMaterial({
            color: 0xff6600,
            transparent: true,
            opacity: 1
        });
        const explosion = new THREE.Mesh(explosionGeo, explosionMat);
        explosion.position.copy(pos);
        this.scene.add(explosion);

        // Animate explosion (no interval - use requestAnimationFrame pattern)
        const startTime = performance.now();
        const animate = () => {
            const elapsed = (performance.now() - startTime) / 1000;
            if (elapsed < 0.5) {
                const scale = 1 + elapsed * 8;
                explosion.scale.setScalar(scale);
                explosion.material.opacity = 1 - elapsed * 2;
                requestAnimationFrame(animate);
            } else {
                this.scene.remove(explosion);
                explosionGeo.dispose();
                explosionMat.dispose();
            }
        };
        animate();

        // Remove barrel mesh
        this.scene.remove(barrel.mesh);
        this.scene.remove(barrel.light);

        // Return explosion data for damage calculation
        return {
            position: pos.clone(),
            radius: 4,
            damage: 50
        };
    }

    // Check if position is near explosive barrel, return barrel index or -1
    getExplosiveBarrelNear(position, radius = 1) {
        for (let i = 0; i < this.explosiveBarrels.length; i++) {
            const barrel = this.explosiveBarrels[i];
            if (barrel.isExploded) continue;
            const dist = position.distanceTo(barrel.position);
            if (dist < radius) return i;
        }
        return -1;
    }

    // Damage a barrel, returns explosion data if destroyed
    damageBarrel(barrelIndex, damage) {
        const barrel = this.explosiveBarrels[barrelIndex];
        if (!barrel || barrel.isExploded) return null;

        barrel.health -= damage;
        if (barrel.health <= 0) {
            return this.explodeBarrel(barrelIndex);
        }
        return null;
    }

    // === SETTINGS TOGGLE METHODS ===

    setParticlesEnabled(enabled) {
        if (this.particles) {
            this.particles.visible = enabled;
        }
    }

    setFlickerEnabled(enabled) {
        this.flickerEnabled = enabled;
        // If disabled, reset all lights to base intensity
        if (!enabled) {
            for (let i = 0; i < this.flickeringLights.length; i++) {
                const fl = this.flickeringLights[i];
                fl.light.intensity = fl.baseIntensity;
            }
        }
    }

    applySettings(settings) {
        this.setParticlesEnabled(settings.particles);
        this.setFlickerEnabled(settings.flickerLights);
    }
}