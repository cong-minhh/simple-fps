// SpatialAudio.js - 3D positional audio system using Web Audio API
import * as THREE from 'three';

/**
 * Spatial audio manager for 3D sound positioning
 * Uses Web Audio API's PannerNode for positional audio
 */
export class SpatialAudio {
    constructor() {
        this.context = null;
        this.listener = null;
        this.masterGain = null;
        this.initialized = false;
        this.enabled = true;
        this.masterVolume = 0.6;

        // Sound pools for frequently played sounds
        this.activeSounds = new Set();

        // Temp vectors for calculations
        this._listenerPos = new THREE.Vector3();
        this._listenerDir = new THREE.Vector3();
        this._listenerUp = new THREE.Vector3(0, 1, 0);
    }

    /**
     * Initialize the spatial audio system
     */
    init() {
        if (this.initialized) return;

        try {
            this.context = new (window.AudioContext || window.webkitAudioContext)();

            // Create master gain
            this.masterGain = this.context.createGain();
            this.masterGain.gain.value = this.masterVolume;
            this.masterGain.connect(this.context.destination);

            // Get listener
            this.listener = this.context.listener;

            this.initialized = true;
        } catch (e) {
            console.warn('Spatial Audio not supported:', e);
            this.enabled = false;
        }
    }

    /**
     * Update listener position and orientation from camera
     * @param {THREE.Camera} camera - The player's camera
     */
    updateListener(camera) {
        if (!this.initialized || !this.enabled) return;

        // Get camera position
        camera.getWorldPosition(this._listenerPos);
        camera.getWorldDirection(this._listenerDir);

        // Update listener position
        if (this.listener.positionX) {
            // Modern API
            this.listener.positionX.setValueAtTime(this._listenerPos.x, this.context.currentTime);
            this.listener.positionY.setValueAtTime(this._listenerPos.y, this.context.currentTime);
            this.listener.positionZ.setValueAtTime(this._listenerPos.z, this.context.currentTime);

            this.listener.forwardX.setValueAtTime(this._listenerDir.x, this.context.currentTime);
            this.listener.forwardY.setValueAtTime(this._listenerDir.y, this.context.currentTime);
            this.listener.forwardZ.setValueAtTime(this._listenerDir.z, this.context.currentTime);

            this.listener.upX.setValueAtTime(this._listenerUp.x, this.context.currentTime);
            this.listener.upY.setValueAtTime(this._listenerUp.y, this.context.currentTime);
            this.listener.upZ.setValueAtTime(this._listenerUp.z, this.context.currentTime);
        } else {
            // Legacy API
            this.listener.setPosition(this._listenerPos.x, this._listenerPos.y, this._listenerPos.z);
            this.listener.setOrientation(
                this._listenerDir.x, this._listenerDir.y, this._listenerDir.z,
                this._listenerUp.x, this._listenerUp.y, this._listenerUp.z
            );
        }
    }

    /**
     * Play a 3D positioned sound
     * @param {string} soundType - Type of sound to play
     * @param {THREE.Vector3} position - World position of the sound
     * @param {object} options - Additional options
     */
    playAt(soundType, position, options = {}) {
        if (!this.initialized || !this.enabled) return null;

        const ctx = this.context;
        const now = ctx.currentTime;

        // Create panner for 3D positioning
        const panner = ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = options.refDistance || 5;
        panner.maxDistance = options.maxDistance || 50;
        panner.rolloffFactor = options.rolloff || 1;
        panner.coneInnerAngle = 360;
        panner.coneOuterAngle = 360;
        panner.coneOuterGain = 0;

        // Set position
        if (panner.positionX) {
            panner.positionX.setValueAtTime(position.x, now);
            panner.positionY.setValueAtTime(position.y, now);
            panner.positionZ.setValueAtTime(position.z, now);
        } else {
            panner.setPosition(position.x, position.y, position.z);
        }

        // Create sound based on type
        const gain = ctx.createGain();
        gain.gain.value = options.volume || 1;

        let sourceNode = null;

        switch (soundType) {
            case 'gunshot':
                sourceNode = this._createGunshotSound(ctx, now, options.weapon || 'RIFLE');
                break;
            case 'footstep':
                sourceNode = this._createFootstepSound(ctx, now, options.surface || 'concrete');
                break;
            case 'explosion':
                sourceNode = this._createExplosionSound(ctx, now);
                break;
            case 'impact':
                sourceNode = this._createImpactSound(ctx, now);
                break;
            default:
                sourceNode = this._createGenericSound(ctx, now);
        }

        if (sourceNode) {
            sourceNode.connect(panner);
            panner.connect(gain);
            gain.connect(this.masterGain);
        }

        return { panner, gain };
    }

    /**
     * Play remote player gunshot with positional audio
     * @param {THREE.Vector3} position - Position of the shooter
     * @param {string} weaponType - Type of weapon
     */
    playRemoteGunshot(position, weaponType = 'RIFLE') {
        return this.playAt('gunshot', position, {
            weapon: weaponType,
            refDistance: 8,
            maxDistance: 80,
            rolloff: 1.2
        });
    }

    /**
     * Play remote footstep
     * @param {THREE.Vector3} position
     * @param {string} surface
     */
    playRemoteFootstep(position, surface = 'concrete') {
        return this.playAt('footstep', position, {
            surface,
            refDistance: 3,
            maxDistance: 20,
            rolloff: 2,
            volume: 0.5
        });
    }

    _createGunshotSound(ctx, now, weaponType) {
        const weapons = {
            RIFLE: { freq: 80, dur: 0.12, crackFreq: 2500 },
            SMG: { freq: 120, dur: 0.08, crackFreq: 3000 },
            SHOTGUN: { freq: 50, dur: 0.2, crackFreq: 1800 },
            PISTOL: { freq: 100, dur: 0.1, crackFreq: 2800 },
            SNIPER: { freq: 60, dur: 0.15, crackFreq: 3500 }
        };

        const w = weapons[weaponType] || weapons.RIFLE;

        // Bass boom
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(w.freq, now);
        osc.frequency.exponentialRampToValueAtTime(w.freq * 0.3, now + w.dur);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + w.dur);

        osc.connect(gain);
        osc.start(now);
        osc.stop(now + w.dur);

        // Crack
        const crackLen = ctx.sampleRate * 0.015;
        const crackBuf = ctx.createBuffer(1, crackLen, ctx.sampleRate);
        const crackData = crackBuf.getChannelData(0);
        for (let i = 0; i < crackLen; i++) {
            crackData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (crackLen * 0.1));
        }

        const crackSrc = ctx.createBufferSource();
        crackSrc.buffer = crackBuf;
        const crackHP = ctx.createBiquadFilter();
        crackHP.type = 'highpass';
        crackHP.frequency.value = w.crackFreq;
        const crackGain = ctx.createGain();
        crackGain.gain.value = 0.6;

        crackSrc.connect(crackHP);
        crackHP.connect(crackGain);
        crackGain.connect(gain);
        crackSrc.start(now);

        return gain;
    }

    _createFootstepSound(ctx, now, surface) {
        const surfaces = {
            concrete: { freq: 80, tapFreq: 600 },
            metal: { freq: 120, tapFreq: 1200 },
            grass: { freq: 50, tapFreq: 300 },
            water: { freq: 40, tapFreq: 200 }
        };

        const s = surfaces[surface] || surfaces.concrete;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(s.freq, now);
        osc.frequency.exponentialRampToValueAtTime(s.freq * 0.5, now + 0.08);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.1);

        return gain;
    }

    _createExplosionSound(ctx, now) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(50, now);
        osc.frequency.exponentialRampToValueAtTime(15, now + 0.5);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.5);

        return gain;
    }

    _createImpactSound(ctx, now) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.05);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.08);

        return gain;
    }

    _createGenericSound(ctx, now) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 440;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.1);

        return gain;
    }

    /**
     * Set master volume
     * @param {number} volume - 0.0 to 1.0
     */
    setVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        if (this.masterGain) {
            this.masterGain.gain.value = this.masterVolume;
        }
    }

    /**
     * Enable/disable spatial audio
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
    }

    /**
     * Dispose of audio resources
     */
    dispose() {
        if (this.context) {
            this.context.close();
            this.context = null;
        }
        this.initialized = false;
    }
}
