// MusicSystem.js - Dynamic music system with intensity-based layers
// Generates procedural background music that adapts to gameplay intensity

export class MusicSystem {
    constructor() {
        this.context = null;
        this.masterGain = null;
        this.initialized = false;
        this.enabled = true;
        this.volume = 0.3;
        this.playing = false;

        // Intensity level (0.0 to 1.0)
        this.intensity = 0;
        this.targetIntensity = 0;
        this.intensitySmoothing = 0.5;

        // Music layers
        this.layers = {
            bass: null,
            pad: null,
            drums: null,
            lead: null
        };

        // Timing
        this.bpm = 120;
        this.beatInterval = 60 / this.bpm;
        this.lastBeatTime = 0;
        this.beatCount = 0;

        // Musical parameters
        this.key = 0; // C
        this.scale = [0, 2, 3, 5, 7, 8, 10]; // Minor scale
        this.chordProgression = [0, 3, 4, 0]; // i - iv - v - i
        this.chordIndex = 0;
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
            console.warn('Music system not supported:', e);
            this.enabled = false;
        }
    }

    /**
     * Start playing music
     */
    start() {
        if (!this.initialized || !this.enabled || this.playing) return;

        this.playing = true;
        this.lastBeatTime = this.context.currentTime;
        this._startLayers();
    }

    /**
     * Stop playing music
     */
    stop() {
        this.playing = false;
        this._stopLayers();
    }

    /**
     * Set combat intensity (0.0 = calm, 1.0 = intense combat)
     * @param {number} intensity - Intensity level
     */
    setIntensity(intensity) {
        this.targetIntensity = Math.max(0, Math.min(1, intensity));
    }

    /**
     * Update music system
     * @param {number} dt - Delta time
     */
    update(dt) {
        if (!this.playing || !this.initialized) return;

        // Smooth intensity transition
        const intensityDiff = this.targetIntensity - this.intensity;
        this.intensity += intensityDiff * this.intensitySmoothing * dt;

        // Update layer volumes based on intensity
        this._updateLayerVolumes();

        // Check for beat
        const now = this.context.currentTime;
        if (now - this.lastBeatTime >= this.beatInterval) {
            this.lastBeatTime = now;
            this.beatCount++;
            this._onBeat();
        }
    }

    _startLayers() {
        const ctx = this.context;

        // Bass layer - always present
        this.layers.bass = this._createBassLayer(ctx);

        // Pad layer - ambient atmosphere
        this.layers.pad = this._createPadLayer(ctx);

        // Drums layer - kicks in at higher intensity
        this.layers.drums = this._createDrumsLayer(ctx);

        // Lead layer - highest intensity only
        this.layers.lead = this._createLeadLayer(ctx);
    }

    _stopLayers() {
        Object.values(this.layers).forEach(layer => {
            if (layer && layer.stop) {
                try { layer.stop(); } catch (e) { }
            }
        });
        this.layers = { bass: null, pad: null, drums: null, lead: null };
    }

    _createBassLayer(ctx) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = this._noteToFreq(this.key + this.scale[0] + 24);

        const gain = ctx.createGain();
        gain.gain.value = 0.2;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 150;

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start();

        return { osc, gain, filter, type: 'bass' };
    }

    _createPadLayer(ctx) {
        const osc1 = ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc1.frequency.value = this._noteToFreq(this.key + this.scale[0] + 48);

        const osc2 = ctx.createOscillator();
        osc2.type = 'sawtooth';
        osc2.frequency.value = this._noteToFreq(this.key + this.scale[2] + 48);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        filter.Q.value = 2;

        const gain = ctx.createGain();
        gain.gain.value = 0.05;

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc1.start();
        osc2.start();

        return { osc1, osc2, filter, gain, type: 'pad' };
    }

    _createDrumsLayer(ctx) {
        // Create a kick pattern that triggers on beat
        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.connect(this.masterGain);

        return { gain, type: 'drums', active: false };
    }

    _createLeadLayer(ctx) {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = this._noteToFreq(this.key + this.scale[4] + 60);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1500;

        const gain = ctx.createGain();
        gain.gain.value = 0;

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start();

        return { osc, filter, gain, type: 'lead' };
    }

    _updateLayerVolumes() {
        const ctx = this.context;
        const now = ctx.currentTime;

        // Bass - always on, gets louder with intensity
        if (this.layers.bass) {
            this.layers.bass.gain.gain.setTargetAtTime(
                0.15 + this.intensity * 0.1,
                now, 0.1
            );
        }

        // Pad - fades in/out with intensity
        if (this.layers.pad) {
            this.layers.pad.gain.gain.setTargetAtTime(
                0.03 + this.intensity * 0.08,
                now, 0.2
            );
            // Open filter with intensity
            this.layers.pad.filter.frequency.setTargetAtTime(
                500 + this.intensity * 1500,
                now, 0.1
            );
        }

        // Lead - only at high intensity
        if (this.layers.lead) {
            const leadVol = this.intensity > 0.6 ? (this.intensity - 0.6) * 0.15 : 0;
            this.layers.lead.gain.gain.setTargetAtTime(leadVol, now, 0.1);
        }
    }

    _onBeat() {
        // Change chord every 4 beats
        if (this.beatCount % 4 === 0) {
            this.chordIndex = (this.chordIndex + 1) % this.chordProgression.length;
            this._updateChord();
        }

        // Trigger drum sounds at high intensity
        if (this.intensity > 0.3 && this.layers.drums) {
            this._triggerDrum();
        }
    }

    _updateChord() {
        const root = this.key + this.chordProgression[this.chordIndex];
        const ctx = this.context;
        const now = ctx.currentTime;

        // Update bass note
        if (this.layers.bass) {
            const freq = this._noteToFreq(root + 24);
            this.layers.bass.osc.frequency.setTargetAtTime(freq, now, 0.1);
        }

        // Update pad chord
        if (this.layers.pad) {
            const freq1 = this._noteToFreq(root + 48);
            const freq2 = this._noteToFreq(root + this.scale[2] + 48);
            this.layers.pad.osc1.frequency.setTargetAtTime(freq1, now, 0.1);
            this.layers.pad.osc2.frequency.setTargetAtTime(freq2, now, 0.1);
        }
    }

    _triggerDrum() {
        const ctx = this.context;
        const now = ctx.currentTime;

        // Kick on beats 1 and 3
        if (this.beatCount % 2 === 0) {
            const kickOsc = ctx.createOscillator();
            kickOsc.type = 'sine';
            kickOsc.frequency.setValueAtTime(150, now);
            kickOsc.frequency.exponentialRampToValueAtTime(30, now + 0.1);

            const kickGain = ctx.createGain();
            kickGain.gain.setValueAtTime(this.intensity * 0.4, now);
            kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

            kickOsc.connect(kickGain);
            kickGain.connect(this.masterGain);
            kickOsc.start(now);
            kickOsc.stop(now + 0.2);
        }

        // Hi-hat on every beat at higher intensity
        if (this.intensity > 0.5) {
            const hatLen = ctx.sampleRate * 0.05;
            const hatBuf = ctx.createBuffer(1, hatLen, ctx.sampleRate);
            const hatData = hatBuf.getChannelData(0);
            for (let i = 0; i < hatLen; i++) {
                hatData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (hatLen * 0.2));
            }

            const hatSrc = ctx.createBufferSource();
            hatSrc.buffer = hatBuf;

            const hatHP = ctx.createBiquadFilter();
            hatHP.type = 'highpass';
            hatHP.frequency.value = 8000;

            const hatGain = ctx.createGain();
            hatGain.gain.value = (this.intensity - 0.5) * 0.2;

            hatSrc.connect(hatHP);
            hatHP.connect(hatGain);
            hatGain.connect(this.masterGain);
            hatSrc.start(now);
        }
    }

    _noteToFreq(note) {
        return 440 * Math.pow(2, (note - 69) / 12);
    }

    /**
     * Set music volume
     * @param {number} volume - 0.0 to 1.0
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        if (this.masterGain) {
            this.masterGain.gain.value = this.volume;
        }
    }

    /**
     * Enable/disable music
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.stop();
        }
    }

    dispose() {
        this.stop();
        if (this.context) {
            this.context.close();
        }
    }
}
