// Arena.js - Creates the game arena with collision geometry
import * as THREE from 'three';

export class Arena {
    constructor(scene) {
        this.scene = scene;
        this.colliders = []; // AABB collision boxes
        this.spawnPoints = [];
        this.waypoints = [];

        this.createFloor();
        this.createWalls();
        this.createPlatforms();
        this.createRamp();
        this.createBoundaryWalls();
        this.setupWaypoints();
        this.setupSpawnPoints();
    }

    createFloor() {
        const floorGeometry = new THREE.PlaneGeometry(20, 20);
        const floorMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a2a3a,
            roughness: 0.8,
            metalness: 0.2
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
        // Check if on a platform
        for (const collider of this.colliders) {
            if (collider.isPlatform) {
                if (x >= collider.min.x && x <= collider.max.x &&
                    z >= collider.min.z && z <= collider.max.z) {
                    return collider.max.y;
                }
            }
        }
        return 0;
    }
}
