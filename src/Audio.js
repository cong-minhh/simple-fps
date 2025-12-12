// Audio.js - Web Audio API sound effects
export class Audio {
    constructor() {
        this.context = null;
        this.sounds = {};
        this.enabled = true;
        this.masterVolume = 0.5;

        // Initialize audio context on first user interaction
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;

        try {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
            this.initialized = true;
            this.createSounds();
        } catch (e) {
            console.warn('Web Audio API not supported');
            this.enabled = false;
        }
    }

    createSounds() {
        // Generate sounds programmatically to avoid loading external files
        // This keeps bundle size minimal
    }

    playGunshot() {
        if (!this.enabled || !this.context) return;

        const ctx = this.context;
        const now = ctx.currentTime;

        // Create noise burst for gunshot
        const bufferSize = ctx.sampleRate * 0.1;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            // White noise with exponential decay
            const decay = 1 - (i / bufferSize);
            data[i] = (Math.random() * 2 - 1) * decay * decay;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;

        // Low pass filter for bass punch
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, now);
        filter.frequency.exponentialRampToValueAtTime(200, now + 0.1);

        // Gain control
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(this.masterVolume * 0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        source.start(now);
        source.stop(now + 0.1);
    }

    playHit() {
        if (!this.enabled || !this.context) return;

        const ctx = this.context;
        const now = ctx.currentTime;

        // Oscillator for hit sound
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(this.masterVolume * 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.15);
    }

    playPlayerHurt() {
        if (!this.enabled || !this.context) return;

        const ctx = this.context;
        const now = ctx.currentTime;

        // Low rumble for damage
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(this.masterVolume * 0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.2);
    }

    playEnemyDeath() {
        if (!this.enabled || !this.context) return;

        const ctx = this.context;
        const now = ctx.currentTime;

        // Descending tone for death
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.3);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(this.masterVolume * 0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.3);
    }

    setVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
    }

    enable() {
        this.enabled = true;
    }

    disable() {
        this.enabled = false;
    }
}
