
// Arena.js - Creates the game arena with collision geometry (Optimized)
// Includes LOD system and spatial partitioning for performance
import * as THREE from 'three';
import { LOD, SPATIAL_HASH } from './config/GameConfig.js';

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

        // === LOD SYSTEM ===
        this.lodEnabled = LOD.ENABLED;
        this.lodObjects = []; // Objects with LOD levels
        this.lastLodUpdate = 0;
        this.lodUpdateInterval = LOD.UPDATE_INTERVAL;

        // === SPATIAL PARTITIONING (Grid-based) ===
        this.collisionGrid = new Map();
        this.gridCellSize = SPATIAL_HASH.COLLIDER_CELL_SIZE;

        // === SHARED MATERIALS (Performance: Create once, reuse) ===
        this._initSharedMaterials();

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

        // Build collision grid after all colliders are added
        this._buildCollisionGrid();
    }

    // === SPATIAL PARTITIONING: Build grid from colliders ===
    _buildCollisionGrid() {
        this.collisionGrid.clear();
        const cellSize = this.gridCellSize;

        for (let i = 0; i < this.colliders.length; i++) {
            const collider = this.colliders[i];
            collider._index = i; // Track original index

            // Get all cells this collider occupies
            const minCX = Math.floor(collider.min.x / cellSize);
            const maxCX = Math.floor(collider.max.x / cellSize);
            const minCZ = Math.floor(collider.min.z / cellSize);
            const maxCZ = Math.floor(collider.max.z / cellSize);

            for (let cx = minCX; cx <= maxCX; cx++) {
                for (let cz = minCZ; cz <= maxCZ; cz++) {
                    const key = `${cx},${cz}`;
                    if (!this.collisionGrid.has(key)) {
                        this.collisionGrid.set(key, []);
                    }
                    this.collisionGrid.get(key).push(collider);
                }
            }
        }
    }

    // === Get colliders near a position (O(1) lookup) ===
    _getCollidersNear(x, z, radius = 0) {
        const cellSize = this.gridCellSize;
        const minCX = Math.floor((x - radius) / cellSize);
        const maxCX = Math.floor((x + radius) / cellSize);
        const minCZ = Math.floor((z - radius) / cellSize);
        const maxCZ = Math.floor((z + radius) / cellSize);

        const seen = new Set();
        const result = [];

        for (let cx = minCX; cx <= maxCX; cx++) {
            for (let cz = minCZ; cz <= maxCZ; cz++) {
                const key = `${cx},${cz}`;
                const cell = this.collisionGrid.get(key);
                if (cell) {
                    for (const collider of cell) {
                        if (!seen.has(collider._index)) {
                            seen.add(collider._index);
                            result.push(collider);
                        }
                    }
                }
            }
        }
        return result;
    }

    // === LOD: Register an object with LOD levels ===
    _registerLOD(mesh, lodMeshes) {
        this.lodObjects.push({
            high: mesh,
            medium: lodMeshes.medium || null,
            low: lodMeshes.low || null,
            currentLevel: 'high',
            position: mesh.position.clone()
        });
    }

    // === LOD: Update LOD levels and frustum culling based on camera ===
    updateLOD(cameraPos, camera = null) {
        if (!this.lodEnabled) return;

        const now = performance.now();
        if (now - this.lastLodUpdate < this.lodUpdateInterval) return;
        this.lastLodUpdate = now;

        // Create frustum for culling if camera provided
        let frustum = null;
        if (camera) {
            if (!this._frustum) {
                this._frustum = new THREE.Frustum();
                this._projScreenMatrix = new THREE.Matrix4();
            }
            this._projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            this._frustum.setFromProjectionMatrix(this._projScreenMatrix);
            frustum = this._frustum;
        }

        for (const obj of this.lodObjects) {
            const dx = obj.position.x - cameraPos.x;
            const dz = obj.position.z - cameraPos.z;
            const distSq = dx * dx + dz * dz;

            // Frustum culling - hide objects outside view
            if (frustum && obj.high) {
                const inFrustum = frustum.containsPoint(obj.position);
                const group = obj.high.parent || obj.high;
                if (group.visible !== inFrustum) {
                    group.visible = inFrustum;
                }
                if (!inFrustum) continue; // Skip LOD update for culled objects
            }

            let targetLevel = 'high';
            if (distSq > LOD.MEDIUM_DISTANCE * LOD.MEDIUM_DISTANCE) {
                targetLevel = 'low';
            } else if (distSq > LOD.HIGH_DISTANCE * LOD.HIGH_DISTANCE) {
                targetLevel = 'medium';
            }

            if (targetLevel !== obj.currentLevel) {
                // Switch LOD level
                if (obj.high) obj.high.visible = (targetLevel === 'high');
                if (obj.medium) obj.medium.visible = (targetLevel === 'medium');
                if (obj.low) obj.low.visible = (targetLevel === 'low');
                obj.currentLevel = targetLevel;
            }
        }
    }

    _initSharedMaterials() {
        // Shared materials for performance - created once
        this.materials = {
            wall: new THREE.MeshStandardMaterial({
                color: 0x4a4a5a,
                roughness: 0.6,
                metalness: 0.3
            }),
            barrel: new THREE.MeshStandardMaterial({
                color: 0x2a4a3a,
                roughness: 0.6,
                metalness: 0.4
            }),
            barrelRing: new THREE.MeshStandardMaterial({
                color: 0x666666,
                metalness: 0.8,
                roughness: 0.3
            }),
            pillar: new THREE.MeshStandardMaterial({
                color: 0x3a3a4a,
                roughness: 0.4,
                metalness: 0.6
            }),
            pillarGlow: new THREE.MeshBasicMaterial({ color: 0x00ff88 }),
            platform: new THREE.MeshStandardMaterial({
                color: 0x3a5a4a,
                roughness: 0.5,
                metalness: 0.4
            }),
            platformLeg: new THREE.MeshStandardMaterial({ color: 0x2a3a2a }),
            ramp: new THREE.MeshStandardMaterial({
                color: 0x5a4a3a,
                roughness: 0.7,
                metalness: 0.2
            }),
            boundary: new THREE.MeshStandardMaterial({
                color: 0x1a1a2e,
                roughness: 1,
                metalness: 0
            }),
            explosiveBarrel: new THREE.MeshStandardMaterial({
                color: 0x8b0000,
                roughness: 0.4,
                metalness: 0.6,
                emissive: 0xff2200,
                emissiveIntensity: 0.15
            }),
            hazardStripe: new THREE.MeshBasicMaterial({ color: 0xffff00 }),
            hazardZone: new THREE.MeshBasicMaterial({
                color: 0x00ff00,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide
            })
        };

        // Shared geometries for instanced objects
        this.sharedGeometries = {
            barrelRing: new THREE.TorusGeometry(0.42, 0.03, 6, 12), // Reduced segments
            pillarGlow: new THREE.SphereGeometry(0.2, 6, 6) // Reduced segments
        };
    }

    createSkybox() {
        // Dark gradient sky - reduced segments for performance
        const skyGeometry = new THREE.SphereGeometry(100, 16, 12);
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
                flickerSpeed: 3 + i * 0.7, // Deterministic instead of random
                phase: i * 1.57 // Deterministic phase offset (PI/2 steps)
            });
        });

        // Add extra warning lights near hazards
        const warningPositions = [[-8, 2, 0], [8, 2, 0], [0, 2, -9]];
        warningPositions.forEach((pos, i) => {
            const light = new THREE.PointLight(0xff0000, 0.4, 6);
            light.position.set(...pos);
            this.scene.add(light);

            this.flickeringLights.push({
                light: light,
                baseIntensity: 0.4,
                flickerSpeed: 8 + i * 0.5, // Deterministic
                phase: i * 2.09 // Deterministic (2PI/3 steps)
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
        // 4 low walls for cover - strategic positions
        const wallConfigs = [
            { pos: [-5, 1, -3], size: [3, 2, 0.5] },
            { pos: [5, 1, 3], size: [3, 2, 0.5] },
            { pos: [-3, 1, 5], size: [0.5, 2, 3] },
            { pos: [3, 1, -5], size: [0.5, 2, 3] }
        ];

        wallConfigs.forEach(config => {
            const geometry = new THREE.BoxGeometry(...config.size);
            const wall = new THREE.Mesh(geometry, this.materials.wall);
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

        // === STRATEGIC CRATE PLACEMENT (No randomness) ===
        // Small crates (0.8): Quick cover, scattered
        // Medium crates (1.0): Standard cover
        // Large crates (1.2): Major cover points
        const crateConfigs = [
            // Cover cluster - Left side depot
            { pos: [-6, 0.5, 0], size: 1.0, rotation: 0 },
            { pos: [-6.8, 0.4, 0.6], size: 0.8, rotation: Math.PI / 4 },
            { pos: [-5.2, 0.6, -0.5], size: 1.2, rotation: 0 },

            // Cover cluster - Right side depot
            { pos: [6, 0.5, 0], size: 1.0, rotation: 0 },
            { pos: [6.6, 0.4, -0.6], size: 0.8, rotation: -Math.PI / 4 },
            { pos: [5.4, 0.6, 0.5], size: 1.2, rotation: Math.PI / 6 },

            // Front defensive line
            { pos: [0, 0.5, 6], size: 1.0, rotation: 0 },
            { pos: [-1.5, 0.4, 6.5], size: 0.8, rotation: Math.PI / 8 },
            { pos: [1.5, 0.4, 6.3], size: 0.8, rotation: -Math.PI / 8 },

            // Back defensive line  
            { pos: [0, 0.5, -6], size: 1.0, rotation: 0 },
            { pos: [-1.3, 0.4, -6.2], size: 0.8, rotation: 0 },
            { pos: [1.3, 0.6, -5.8], size: 1.2, rotation: Math.PI / 3 },

            // Corner cover positions
            { pos: [-4, 0.4, -6], size: 0.8, rotation: Math.PI / 4 },
            { pos: [4, 0.4, 6], size: 0.8, rotation: -Math.PI / 4 },
            { pos: [-8, 0.5, 3], size: 1.0, rotation: Math.PI / 6 },
            { pos: [8, 0.5, -3], size: 1.0, rotation: -Math.PI / 6 }
        ];

        crateConfigs.forEach(config => {
            const geometry = new THREE.BoxGeometry(config.size, config.size, config.size);
            const crate = new THREE.Mesh(geometry, crateMaterial);
            crate.position.set(config.pos[0], config.pos[1] * config.size, config.pos[2]);
            crate.rotation.y = config.rotation;
            crate.castShadow = true;
            crate.receiveShadow = true;
            this.scene.add(crate);

            // Add collider
            const half = config.size / 2;
            this.colliders.push({
                min: new THREE.Vector3(config.pos[0] - half, 0, config.pos[2] - half),
                max: new THREE.Vector3(config.pos[0] + half, config.size, config.pos[2] + half)
            });
        });
    }

    createBarrels() {
        // Strategic barrel placement for cover and visual interest
        const barrelPositions = [
            [-2, 0.6, -8], [2, 0.6, 8], [-8, 0.6, -2], [8, 0.6, 2]
        ];

        const barrelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 8); // Reduced from 12 segments

        barrelPositions.forEach(pos => {
            const barrel = new THREE.Mesh(barrelGeometry, this.materials.barrel);
            barrel.position.set(...pos);
            barrel.castShadow = true;
            this.scene.add(barrel);

            // Metal rings - using shared geometry and material
            [-0.4, 0, 0.4].forEach(y => {
                const ring = new THREE.Mesh(this.sharedGeometries.barrelRing, this.materials.barrelRing);
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
        // Reduced segment count for cylinders
        const pillarGeometry = new THREE.CylinderGeometry(0.5, 0.6, 5, 6); // Reduced from 8

        const pillarPositions = [
            [-12, 2.5, -12], [12, 2.5, -12], [-12, 2.5, 12], [12, 2.5, 12],
            [-12, 2.5, 0], [12, 2.5, 0], [0, 2.5, -12], [0, 2.5, 12]
        ];

        pillarPositions.forEach(pos => {
            const pillar = new THREE.Mesh(pillarGeometry, this.materials.pillar);
            pillar.position.set(...pos);
            pillar.castShadow = true;
            pillar.receiveShadow = true;
            this.scene.add(pillar);

            // Glowing top - using shared geometry and material
            const glow = new THREE.Mesh(this.sharedGeometries.pillarGlow, this.materials.pillarGlow);
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
        const platformConfigs = [
            { pos: [-7, 1.5, -7], size: [3, 0.3, 3] },
            { pos: [7, 1.5, 7], size: [3, 0.3, 3] }
        ];

        const legGeometry = new THREE.BoxGeometry(0.3, 1.5, 0.3);

        platformConfigs.forEach(config => {
            const geometry = new THREE.BoxGeometry(...config.size);
            const platform = new THREE.Mesh(geometry, this.materials.platform);
            platform.position.set(...config.pos);
            platform.castShadow = true;
            platform.receiveShadow = true;
            this.scene.add(platform);

            // Platform legs
            const legPositions = [
                [config.pos[0] - 1.2, 0.75, config.pos[2] - 1.2],
                [config.pos[0] + 1.2, 0.75, config.pos[2] - 1.2],
                [config.pos[0] - 1.2, 0.75, config.pos[2] + 1.2],
                [config.pos[0] + 1.2, 0.75, config.pos[2] + 1.2]
            ];

            legPositions.forEach(pos => {
                const leg = new THREE.Mesh(legGeometry, this.materials.platformLeg);
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
        // Create a ramp using a box with rotation
        const rampGeometry = new THREE.BoxGeometry(2, 0.3, 4);
        const ramp = new THREE.Mesh(rampGeometry, this.materials.ramp);
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
        const boundaryConfigs = [
            { pos: [-10, 1, 0], size: [0.2, 2, 20] },
            { pos: [10, 1, 0], size: [0.2, 2, 20] },
            { pos: [0, 1, -10], size: [20, 2, 0.2] },
            { pos: [0, 1, 10], size: [20, 2, 0.2] }
        ];

        boundaryConfigs.forEach(config => {
            const geometry = new THREE.BoxGeometry(...config.size);
            const wall = new THREE.Mesh(geometry, this.materials.boundary);
            wall.position.set(...config.pos);
            this.scene.add(wall);
        });
    }

    setupWaypoints() {
        // Patrol waypoints for enemy AI - strategic patrol routes
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
        // === STRATEGIC SPAWN POINTS (8 locations around perimeter) ===
        // Corners + edges for varied enemy entry
        this.spawnPoints = [
            // Corners
            new THREE.Vector3(-9, 0, -9),
            new THREE.Vector3(9, 0, -9),
            new THREE.Vector3(-9, 0, 9),
            new THREE.Vector3(9, 0, 9),
            // Edge midpoints
            new THREE.Vector3(0, 0, -9),
            new THREE.Vector3(0, 0, 9),
            new THREE.Vector3(-9, 0, 0),
            new THREE.Vector3(9, 0, 0)
        ];
    }

    getRandomSpawnPoint() {
        return this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)].clone();
    }

    // === NEW: Strategic spawn selection based on player position ===
    getSpawnPointFarFromPlayer(playerPos) {
        if (!playerPos) return this.getRandomSpawnPoint();

        let bestSpawn = this.spawnPoints[0];
        let maxDist = 0;

        for (let i = 0; i < this.spawnPoints.length; i++) {
            const sp = this.spawnPoints[i];
            const dist = playerPos.distanceTo(sp);
            if (dist > maxDist) {
                maxDist = dist;
                bestSpawn = sp;
            }
        }

        return bestSpawn.clone();
    }

    // === NEW: Get spawn point with minimum distance requirement ===
    getSpawnPointWithMinDistance(playerPos, minDistance = 8) {
        if (!playerPos) return this.getRandomSpawnPoint();

        // Collect all valid spawn points
        const validSpawns = [];
        for (let i = 0; i < this.spawnPoints.length; i++) {
            const sp = this.spawnPoints[i];
            const dist = playerPos.distanceTo(sp);
            if (dist >= minDistance) {
                validSpawns.push(sp);
            }
        }

        // If no valid spawns, return the furthest one
        if (validSpawns.length === 0) {
            return this.getSpawnPointFarFromPlayer(playerPos);
        }

        // Return random valid spawn
        return validSpawns[Math.floor(Math.random() * validSpawns.length)].clone();
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

        // Use spatial grid for O(1) lookup
        const nearbyColliders = this._getCollidersNear(position.x, position.z, radius + 1);
        for (const collider of nearbyColliders) {
            if (this.aabbIntersect(playerBox, collider)) {
                return collider;
            }
        }
        return null;
    }

    // === ROBUST COLLISION: Check collision with separate X/Y/Z handling ===
    checkCollisionAxis(position, radius, height, axis, delta) {
        const testPos = this._tempVec.copy(position);
        testPos[axis] += delta;

        // Create player bounding box at test position
        const halfHeight = height / 2;
        const playerMin = {
            x: testPos.x - radius,
            y: testPos.y - halfHeight,
            z: testPos.z - radius
        };
        const playerMax = {
            x: testPos.x + radius,
            y: testPos.y + halfHeight,
            z: testPos.z + radius
        };

        // Use spatial grid for O(1) lookup
        const nearbyColliders = this._getCollidersNear(testPos.x, testPos.z, radius + Math.abs(delta));
        for (const collider of nearbyColliders) {
            if (playerMin.x <= collider.max.x && playerMax.x >= collider.min.x &&
                playerMin.y <= collider.max.y && playerMax.y >= collider.min.y &&
                playerMin.z <= collider.max.z && playerMax.z >= collider.min.z) {
                return collider;
            }
        }
        return null;
    }

    // === SWEPT COLLISION: Test multiple steps to prevent tunneling ===
    checkCollisionSwept(fromPos, toPos, radius, height, maxSteps = 4) {
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const dz = toPos.z - fromPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // If movement is small, just do one check
        if (dist < radius * 0.5) {
            return this.checkCollisionAt(toPos, radius, height);
        }

        // Test multiple steps along path
        const steps = Math.min(Math.ceil(dist / (radius * 0.5)), maxSteps);
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            this._tempVec.set(
                fromPos.x + dx * t,
                fromPos.y + dy * t,
                fromPos.z + dz * t
            );
            const hit = this.checkCollisionAt(this._tempVec, radius, height);
            if (hit) {
                return { collider: hit, t: (i - 1) / steps };
            }
        }
        return null;
    }

    // === Check collision at specific position (uses spatial grid) ===
    checkCollisionAt(position, radius, height) {
        const halfHeight = height / 2;
        const playerMin = {
            x: position.x - radius,
            y: position.y - halfHeight,
            z: position.z - radius
        };
        const playerMax = {
            x: position.x + radius,
            y: position.y + halfHeight,
            z: position.z + radius
        };

        // Use spatial grid for O(1) lookup
        const nearbyColliders = this._getCollidersNear(position.x, position.z, radius + 1);
        for (const collider of nearbyColliders) {
            if (playerMin.x <= collider.max.x && playerMax.x >= collider.min.x &&
                playerMin.y <= collider.max.y && playerMax.y >= collider.min.y &&
                playerMin.z <= collider.max.z && playerMax.z >= collider.min.z) {
                return collider;
            }
        }
        return null;
    }

    // === PUSH OUT: If player is stuck inside a collider, push them out ===
    resolveCollision(position, radius, height) {
        const halfHeight = height / 2;
        let pushed = false;
        let iterations = 0;
        const maxIterations = 5; // Prevent infinite loops

        while (iterations < maxIterations) {
            iterations++;
            let foundCollision = false;

            for (const collider of this.colliders) {
                const playerMin = {
                    x: position.x - radius,
                    y: position.y - halfHeight,
                    z: position.z - radius
                };
                const playerMax = {
                    x: position.x + radius,
                    y: position.y + halfHeight,
                    z: position.z + radius
                };

                // Check intersection
                if (playerMin.x <= collider.max.x && playerMax.x >= collider.min.x &&
                    playerMin.y <= collider.max.y && playerMax.y >= collider.min.y &&
                    playerMin.z <= collider.max.z && playerMax.z >= collider.min.z) {

                    foundCollision = true;

                    // Calculate overlap on each axis
                    const overlapX1 = collider.max.x - playerMin.x; // Push right
                    const overlapX2 = playerMax.x - collider.min.x; // Push left
                    const overlapY1 = collider.max.y - playerMin.y; // Push up
                    const overlapY2 = playerMax.y - collider.min.y; // Push down
                    const overlapZ1 = collider.max.z - playerMin.z; // Push forward
                    const overlapZ2 = playerMax.z - collider.min.z; // Push back

                    // Find minimum push distance
                    const minOverlapX = overlapX1 < overlapX2 ? overlapX1 : -overlapX2;
                    const minOverlapY = overlapY1 < overlapY2 ? overlapY1 : -overlapY2;
                    const minOverlapZ = overlapZ1 < overlapZ2 ? overlapZ1 : -overlapZ2;

                    const absX = Math.abs(minOverlapX);
                    const absY = Math.abs(minOverlapY);
                    const absZ = Math.abs(minOverlapZ);

                    // Push out along the axis with the smallest overlap
                    if (absX <= absY && absX <= absZ) {
                        position.x += minOverlapX + Math.sign(minOverlapX) * 0.01;
                    } else if (absY <= absX && absY <= absZ) {
                        position.y += minOverlapY + Math.sign(minOverlapY) * 0.01;
                    } else {
                        position.z += minOverlapZ + Math.sign(minOverlapZ) * 0.01;
                    }

                    pushed = true;
                    break; // Re-check all colliders from start
                }
            }

            if (!foundCollision) break;
        }

        return pushed;
    }

    // === Check if there's a ceiling above (for head bump) ===
    checkCeilingCollision(position, radius, height, deltaY) {
        if (deltaY <= 0) return null; // Only check when moving up

        const headY = position.y + height / 2 + deltaY;

        for (const collider of this.colliders) {
            // Check if player XZ overlaps with collider
            if (position.x + radius > collider.min.x && position.x - radius < collider.max.x &&
                position.z + radius > collider.min.z && position.z - radius < collider.max.z) {
                // Check if head would hit the bottom of collider
                if (headY >= collider.min.y && position.y + height / 2 < collider.min.y) {
                    return collider;
                }
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

    // === Get floor height with player radius consideration ===
    getFloorHeightWithRadius(x, z, radius) {
        let highestFloor = 0;

        for (const collider of this.colliders) {
            // Check if player (with radius) overlaps collider XZ
            if (x + radius > collider.min.x && x - radius < collider.max.x &&
                z + radius > collider.min.z && z - radius < collider.max.z) {
                const topY = collider.max.y;
                if (topY > highestFloor && topY <= 3) {
                    highestFloor = topY;
                }
            }
        }
        return highestFloor;
    }

    // === ENVIRONMENT FEATURES (Performance Optimized) ===

    createExplosiveBarrels() {
        // Shared geometry (instancing-friendly)
        const barrelGeo = new THREE.CylinderGeometry(0.35, 0.4, 1.0, 6); // Reduced segments
        const hazardGeo = new THREE.BoxGeometry(0.25, 0.08, 0.02);

        // Strategic explosive barrel placement
        const positions = [
            [-4, 0.5, 4], [4, 0.5, -4], [0, 0.5, 8], [-7, 0.5, -2]
        ];

        positions.forEach(pos => {
            const barrel = new THREE.Mesh(barrelGeo, this.materials.explosiveBarrel.clone());
            barrel.position.set(pos[0], pos[1], pos[2]);
            barrel.castShadow = true;
            barrel.userData.isExplosive = true;
            barrel.userData.health = 30;
            this.scene.add(barrel);

            // Hazard stripe (single mesh)
            const stripe = new THREE.Mesh(hazardGeo, this.materials.hazardStripe);
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
        // Toxic floor zones - use shared material
        const zones = [
            { pos: [-8, 0.02, 0], size: [2, 3], damage: 5 },
            { pos: [8, 0.02, 0], size: [2, 3], damage: 5 },
            { pos: [0, 0.02, -9], size: [3, 2], damage: 8 }
        ];

        zones.forEach(zone => {
            const geo = new THREE.PlaneGeometry(zone.size[0], zone.size[1]);
            const mesh = new THREE.Mesh(geo, this.materials.hazardZone);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(zone.pos[0], zone.pos[1], zone.pos[2]);
            this.scene.add(mesh);

            // Bubbling particles effect - reduced count for performance
            const bubbleGeo = new THREE.BufferGeometry();
            const bubbleCount = 5; // Reduced from 8
            const positions = new Float32Array(bubbleCount * 3);
            for (let i = 0; i < bubbleCount; i++) {
                // Deterministic positions based on index
                const angle = (i / bubbleCount) * Math.PI * 2;
                const radius = zone.size[0] * 0.4;
                positions[i * 3] = zone.pos[0] + Math.cos(angle) * radius;
                positions[i * 3 + 1] = 0.1 + (i % 3) * 0.15;
                positions[i * 3 + 2] = zone.pos[2] + Math.sin(angle) * radius * (zone.size[1] / zone.size[0]);
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
        // Reduced particle count for performance (60 instead of 100)
        const particleCount = 60;
        const geometry = new THREE.BufferGeometry();

        const positions = new Float32Array(particleCount * 3);
        const velocities = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            // Deterministic distribution using golden ratio for better spread
            const phi = i * 2.39996; // Golden angle
            const r = Math.sqrt(i / particleCount) * 10;

            positions[i * 3] = Math.cos(phi) * r;
            positions[i * 3 + 1] = (i / particleCount) * 5;
            positions[i * 3 + 2] = Math.sin(phi) * r;

            // Deterministic drift velocities
            velocities[i * 3] = Math.cos(phi * 2) * 0.1;
            velocities[i * 3 + 1] = ((i % 3) - 1) * 0.05;
            velocities[i * 3 + 2] = Math.sin(phi * 2) * 0.1;

            // Warm ember colors - deterministic gradient
            const brightness = 0.5 + (i / particleCount) * 0.5;
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
        if (this.particles && this.particles.visible) {
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

        // Visual explosion effect - reduced segments
        const explosionGeo = new THREE.SphereGeometry(0.5, 6, 6);
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