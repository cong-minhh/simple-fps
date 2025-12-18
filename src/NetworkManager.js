// NetworkManager.js - WebSocket client for multiplayer communication
import { Logger } from './utils/Logger.js';

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

        // Reconnection state
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second
        this.maxReconnectDelay = 30000; // Max 30 seconds
        this.lastServerUrl = null;
        this.lastPlayerName = null;
        this.isReconnecting = false;
        this.serverShutdown = false;
    }

    connect(serverUrl, playerName) {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(serverUrl);

                this.ws.onopen = () => {
                    Logger.info('Connected to server');
                    this.isConnected = true;
                    this.reconnectAttempts = 0; // Reset on successful connection
                    this.reconnectDelay = 1000;
                    this.lastServerUrl = serverUrl;
                    this.lastPlayerName = playerName;
                    this.serverShutdown = false;

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
                        Logger.error('Failed to parse message:', e);
                    }
                };

                this.ws.onerror = (error) => {
                    Logger.error('WebSocket error:', error);
                    reject(error);
                };

                this.ws.onclose = (event) => {
                    Logger.info('Disconnected from server', event.code, event.reason);
                    this.isConnected = false;

                    // Handle server shutdown gracefully
                    if (this.serverShutdown) {
                        Logger.info('Server shutdown - not attempting reconnection');
                        this.emit('server_shutdown');
                        return;
                    }

                    // Attempt reconnection for unexpected disconnects
                    if (!this.isReconnecting && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.attemptReconnect();
                    }

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
        // Clear pending messages on disconnect
        this.pendingMessages = [];
    }

    /**
     * Validate message structure before sending
     * @param {Object} message - Message to validate
     * @returns {boolean} True if valid
     */
    validateMessage(message) {
        if (!message || typeof message !== 'object') return false;
        if (!message.type || typeof message.type !== 'string') return false;

        // Type-specific validation
        switch (message.type) {
            case 'position':
                return message.position &&
                    typeof message.position.x === 'number' &&
                    typeof message.position.y === 'number' &&
                    typeof message.position.z === 'number';
            case 'hit':
                return message.targetId &&
                    typeof message.damage === 'number' &&
                    message.damage > 0 && message.damage <= 500;
            case 'shoot':
                return message.weapon && typeof message.weapon === 'string';
            default:
                return true; // Allow other message types
        }
    }

    /**
     * Send message to server with validation
     * @param {Object} message - Message to send
     * @returns {boolean} True if sent successfully
     */
    send(message) {
        // Validate message structure
        if (!this.validateMessage(message)) {
            Logger.warn('Invalid message structure:', message);
            return false;
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify(message));
                return true;
            } catch (error) {
                Logger.error('Send error:', error);
                return false;
            }
        } else {
            // Queue message if not connected (with limit to prevent memory issues)
            const MAX_PENDING = 50;
            if (this.pendingMessages.length < MAX_PENDING) {
                this.pendingMessages.push(message);
            } else {
                Logger.warn('Pending message queue full, dropping message');
            }
            return false;
        }
    }

    /**
     * Flush pending messages after reconnection
     */
    flushPendingMessages() {
        if (!this.isConnected || this.pendingMessages.length === 0) return;

        Logger.debug(`Flushing ${this.pendingMessages.length} pending messages`);
        const messages = [...this.pendingMessages];
        this.pendingMessages = [];

        for (const message of messages) {
            this.send(message);
        }
    }

    handleMessage(message) {
        // Handle pong for latency calculation
        if (message.type === 'pong') {
            this.latency = Date.now() - message.timestamp;
            return;
        }

        // Handle server shutdown notification
        if (message.type === 'server_shutdown') {
            Logger.info('Server shutdown notification received');
            this.serverShutdown = true;
            this.emit('server_shutdown', message);
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
                    Logger.error(`Error in handler for ${type}:`, e);
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

    attemptReconnect() {
        if (this.isReconnecting || !this.lastServerUrl) return;

        this.isReconnecting = true;
        this.reconnectAttempts++;

        // Exponential backoff
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);

        Logger.info(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
        this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });

        setTimeout(async () => {
            try {
                await this.connect(this.lastServerUrl, this.lastPlayerName);
                Logger.info('Reconnection successful');
                this.isReconnecting = false;
                this.emit('reconnected');
            } catch (error) {
                Logger.error('Reconnection failed:', error);
                this.isReconnecting = false;

                if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                    Logger.error('Max reconnection attempts reached');
                    this.emit('reconnect_failed');
                }
            }
        }, delay);
    }

    // Game-specific methods
    sendPosition(position, rotation, state = {}, force = false) {
        const now = Date.now();
        if (!force && now - this.lastPositionUpdate < this.positionUpdateInterval) {
            return; // Throttled
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
            },
            // Player state for visual sync
            state: {
                isCrouching: state.isCrouching || false,
                peekState: state.peekState || 0, // -1 left, 0 none, 1 right
                isAiming: state.isAiming || false,
                isSprinting: state.isSprinting || false,
                isReloading: state.isReloading || false,
                weapon: state.weapon || 'RIFLE'
            }
        });
    }

    sendShoot(weapon, bulletData) {
        this.send({
            type: 'shoot',
            weapon,
            origin: bulletData.origin ? {
                x: bulletData.origin.x,
                y: bulletData.origin.y,
                z: bulletData.origin.z
            } : null,
            target: bulletData.target ? {
                x: bulletData.target.x,
                y: bulletData.target.y,
                z: bulletData.target.z
            } : null
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
