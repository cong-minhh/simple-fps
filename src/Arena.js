// Arena.js - Creates the game arena with collision geometry
import * as THREE from 'three';

export class Arena {
    constructor(scene) {
        this.scene = scene;
        this.colliders = []; // AABB collision boxes
        this.spawnPoints = [];
        this.waypoints = [];

        this.createSkybox();
        this.createFloor();
        this.createWalls();
        this.createCrates();
        this.createBarrels();
        this.createPlatforms();
        this.createRamp();
        this.createPillars();
        this.createBoundaryWalls();
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

        // Colored point lights for atmosphere
        const lightColors = [0xff4444, 0x44ff44, 0x4444ff, 0xffaa00];
        const lightPositions = [[-8, 3, -8], [8, 3, -8], [-8, 3, 8], [8, 3, 8]];

        lightPositions.forEach((pos, i) => {
            const light = new THREE.PointLight(lightColors[i], 0.3, 15);
            light.position.set(...pos);
            this.scene.add(light);
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
}
