// NetworkManager.js - WebSocket client for multiplayer communication
export class NetworkManager {
    constructor() {
        this.ws = null;
        this.playerId = null;
        this.isConnected = false;
        this.messageHandlers = new Map();
        this.pendingMessages = [];
        this.lastPingTime = 0;
        this.latency = 0;

        // Position update throttling
        this.lastPositionUpdate = 0;
        this.positionUpdateInterval = 50; // 20 updates per second
    }

    connect(serverUrl, playerName) {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(serverUrl);

                this.ws.onopen = () => {
                    console.log('Connected to server');
                    this.isConnected = true;

                    // Send join message
                    this.send({
                        type: 'join',
                        name: playerName
                    });

                    // Start ping loop
                    this.startPingLoop();
                };

                this.ws.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        this.handleMessage(message);

                        // Resolve on successful join
                        if (message.type === 'joined') {
                            this.playerId = message.playerId;
                            resolve(message);
                        }
                    } catch (e) {
                        console.error('Failed to parse message:', e);
                    }
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    reject(error);
                };

                this.ws.onclose = () => {
                    console.log('Disconnected from server');
                    this.isConnected = false;
                    this.emit('disconnected');
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.playerId = null;
    }

    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            this.pendingMessages.push(message);
        }
    }

    handleMessage(message) {
        // Handle pong for latency calculation
        if (message.type === 'pong') {
            this.latency = Date.now() - message.timestamp;
            return;
        }

        // Emit to registered handlers
        this.emit(message.type, message);
    }

    on(type, callback) {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, []);
        }
        this.messageHandlers.get(type).push(callback);
    }

    off(type, callback) {
        if (this.messageHandlers.has(type)) {
            const handlers = this.messageHandlers.get(type);
            const index = handlers.indexOf(callback);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    emit(type, data = null) {
        if (this.messageHandlers.has(type)) {
            this.messageHandlers.get(type).forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    console.error(`Error in handler for ${type}:`, e);
                }
            });
        }
    }

    startPingLoop() {
        setInterval(() => {
            if (this.isConnected) {
                this.lastPingTime = Date.now();
                this.send({ type: 'ping', timestamp: this.lastPingTime });
            }
        }, 2000);
    }

    // Game-specific methods
    sendPosition(position, rotation) {
        const now = Date.now();
        if (now - this.lastPositionUpdate < this.positionUpdateInterval) {
            return;
        }
        this.lastPositionUpdate = now;

        this.send({
            type: 'position',
            position: {
                x: position.x,
                y: position.y,
                z: position.z
            },
            rotation: {
                x: rotation.x,
                y: rotation.y
            }
        });
    }

    sendShoot(weapon, direction) {
        this.send({
            type: 'shoot',
            weapon,
            direction: {
                x: direction.x,
                y: direction.y,
                z: direction.z
            }
        });
    }

    sendHit(targetId, damage, isHeadshot) {
        this.send({
            type: 'hit',
            targetId,
            damage,
            isHeadshot
        });
    }

    sendWeaponChange(weapon) {
        this.send({
            type: 'weapon_change',
            weapon
        });
    }

    getLatency() {
        return this.latency;
    }

    getPlayerId() {
        return this.playerId;
    }
}
