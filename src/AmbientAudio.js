// AmbientAudio.js - Environmental ambient sound system
// Creates immersive background audio for different arena environments

export class AmbientAudio {
    constructor() {
        this.context = null;
        this.masterGain = null;
        this.initialized = false;
        this.enabled = true;
        this.volume = 0.3;

        // Active ambient layers
        this.layers = new Map();

        // Environment presets
        this.environments = {
            WAREHOUSE: {
                layers: ['industrial_hum', 'distant_machinery', 'wind_light'],
                reverb: 0.3
            },
            COURTYARD: {
                layers: ['wind_outdoor', 'birds_distant', 'rustling'],
                reverb: 0.1
            },
            BUNKER: {
                layers: ['underground_rumble', 'ventilation', 'water_drip'],
                reverb: 0.5
            }
        };
    }

    init() {
        if (this.initialized) return;

        try {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.context.createGain();
            this.masterGain.gain.value = this.volume;
            this.masterGain.connect(this.context.destination);
            this.initialized = true;
        } catch (e) {
            console.warn('Ambient Audio not supported:', e);
            this.enabled = false;
        }
    }

    /**
     * Start ambient audio for an environment
     * @param {string} environment - WAREHOUSE, COURTYARD, or BUNKER
     */
    startEnvironment(environment) {
        if (!this.initialized || !this.enabled) return;

        // Stop current layers
        this.stopAll();

        const env = this.environments[environment];
        if (!env) return;

        // Start new layers
        env.layers.forEach(layer => {
            this._startLayer(layer);
        });
    }

    _startLayer(layerType) {
        if (this.layers.has(layerType)) return;

        const ctx = this.context;
        let source;

        switch (layerType) {
            case 'industrial_hum':
                source = this._createHum(ctx, 60, 0.15);
                break;
            case 'distant_machinery':
                source = this._createMachinery(ctx);
                break;
            case 'wind_light':
                source = this._createWind(ctx, 0.1);
                break;
            case 'wind_outdoor':
                source = this._createWind(ctx, 0.2);
                break;
            case 'birds_distant':
                source = this._createBirds(ctx);
                break;
            case 'rustling':
                source = this._createRustling(ctx);
                break;
            case 'underground_rumble':
                source = this._createRumble(ctx);
                break;
            case 'ventilation':
                source = this._createVentilation(ctx);
                break;
            case 'water_drip':
                source = this._createWaterDrip(ctx);
                break;
            default:
                return;
        }

        if (source) {
            this.layers.set(layerType, source);
        }
    }

    _createHum(ctx, freq, vol) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;

        const gain = ctx.createGain();
        gain.gain.value = vol;

        // Subtle wobble
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.2;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 2;

        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start();
        lfo.start();

        return { osc, lfo, gain, type: 'continuous' };
    }

    _createMachinery(ctx) {
        // Rhythmic mechanical sound
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            const t = i / ctx.sampleRate;
            const rhythm = Math.sin(t * Math.PI * 2) > 0.8 ? 1 : 0.3;
            data[i] = (Math.random() * 2 - 1) * 0.1 * rhythm;
        }

        const source = ctx.createBufferSource();
        source.buffer = noiseBuffer;
        source.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 200;
        filter.Q.value = 2;

        const gain = ctx.createGain();
        gain.gain.value = 0.1;

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        source.start();

        return { source, gain, type: 'buffer' };
    }

    _createWind(ctx, intensity) {
        const bufferSize = ctx.sampleRate * 4;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1);
        }

        const source = ctx.createBufferSource();
        source.buffer = noiseBuffer;
        source.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;

        const gain = ctx.createGain();
        gain.gain.value = intensity;

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        source.start();

        return { source, gain, type: 'buffer' };
    }

    _createBirds(ctx) {
        // Simple chirp-like sounds at random intervals
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 2000;

        const gain = ctx.createGain();
        gain.gain.value = 0;

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();

        // Schedule random chirps
        const scheduleChirp = () => {
            if (!this.layers.has('birds_distant')) return;

            const now = ctx.currentTime;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.05, now + 0.05);
            gain.gain.linearRampToValueAtTime(0, now + 0.1);

            osc.frequency.setValueAtTime(1800 + Math.random() * 400, now);

            setTimeout(scheduleChirp, 2000 + Math.random() * 5000);
        };

        setTimeout(scheduleChirp, 1000);

        return { osc, gain, type: 'continuous' };
    }

    _createRustling(ctx) {
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1);
        }

        const source = ctx.createBufferSource();
        source.buffer = noiseBuffer;
        source.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 2000;

        const gain = ctx.createGain();
        gain.gain.value = 0.03;

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        source.start();

        return { source, gain, type: 'buffer' };
    }

    _createRumble(ctx) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 30;

        const gain = ctx.createGain();
        gain.gain.value = 0.15;

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();

        return { osc, gain, type: 'continuous' };
    }

    _createVentilation(ctx) {
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1);
        }

        const source = ctx.createBufferSource();
        source.buffer = noiseBuffer;
        source.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 150;
        filter.Q.value = 0.5;

        const gain = ctx.createGain();
        gain.gain.value = 0.08;

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        source.start();

        return { source, gain, type: 'buffer' };
    }

    _createWaterDrip(ctx) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 800;

        const gain = ctx.createGain();
        gain.gain.value = 0;

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();

        // Schedule random drips
        const scheduleDrip = () => {
            if (!this.layers.has('water_drip')) return;

            const now = ctx.currentTime;
            const freq = 600 + Math.random() * 400;

            osc.frequency.setValueAtTime(freq, now);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + 0.1);

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.08, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

            setTimeout(scheduleDrip, 1500 + Math.random() * 4000);
        };

        setTimeout(scheduleDrip, 500);

        return { osc, gain, type: 'continuous' };
    }

    /**
     * Stop all ambient layers
     */
    stopAll() {
        this.layers.forEach((layer, key) => {
            try {
                if (layer.type === 'continuous') {
                    layer.osc?.stop();
                    layer.lfo?.stop();
                } else if (layer.type === 'buffer') {
                    layer.source?.stop();
                }
            } catch (e) {
                // Already stopped
            }
        });
        this.layers.clear();
    }

    /**
     * Set ambient volume
     * @param {number} volume - 0.0 to 1.0
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        if (this.masterGain) {
            this.masterGain.gain.value = this.volume;
        }
    }

    /**
     * Enable/disable ambient audio
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.stopAll();
        }
    }

    dispose() {
        this.stopAll();
        if (this.context) {
            this.context.close();
        }
    }
}
