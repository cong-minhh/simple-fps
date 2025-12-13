// Audio.js - Realistic weapon sound effects using Web Audio API
export class Audio {
    constructor() {
        this.context = null;
        this.sounds = {};
        this.enabled = true;
        this.masterVolume = 0.6;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;

        try {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API not supported');
            this.enabled = false;
        }
    }

    // Battlefield 6 style gunshot - punchy, full, powerful
    playGunshot(weaponType = 'RIFLE') {
        if (!this.enabled || !this.context) return;

        const ctx = this.context;
        const now = ctx.currentTime;

        // BF6-style weapon characteristics - punchy and powerful
        const weapons = {
            PISTOL: {
                // Punchy 9mm - snappy with good crack
                bassFreq: 120, bassVol: 0.6, bassDur: 0.08,
                midFreq: 500, midVol: 0.5, midDur: 0.1,
                crackFreq: 2500, crackVol: 0.8,
                punchFreq: 200, punchVol: 0.7,
                tailVol: 0.2, tailDur: 0.15
            },
            RIFLE: {
                // Heavy 7.62 AK style - massive punch, iconic crack
                bassFreq: 60, bassVol: 1.0, bassDur: 0.15,
                midFreq: 350, midVol: 0.8, midDur: 0.12,
                crackFreq: 2800, crackVol: 1.0,
                punchFreq: 120, punchVol: 1.0,
                tailVol: 0.35, tailDur: 0.25
            },
            SMG: {
                // Quick rattling SMG - tight and snappy
                bassFreq: 150, bassVol: 0.5, bassDur: 0.06,
                midFreq: 600, midVol: 0.6, midDur: 0.07,
                crackFreq: 3500, crackVol: 0.7,
                punchFreq: 250, punchVol: 0.5,
                tailVol: 0.15, tailDur: 0.1
            },
            SHOTGUN: {
                // Devastating 12ga - earth-shaking boom
                bassFreq: 35, bassVol: 1.2, bassDur: 0.25,
                midFreq: 180, midVol: 1.0, midDur: 0.2,
                crackFreq: 1500, crackVol: 0.9,
                punchFreq: 80, punchVol: 1.2,
                tailVol: 0.5, tailDur: 0.4
            }
        };

        const w = weapons[weaponType] || weapons.RIFLE;
        const vol = this.masterVolume * 1.2; // Louder overall

        // === Layer 1: Sub-bass punch (chest thump) ===
        const punchOsc = ctx.createOscillator();
        punchOsc.type = 'sine';
        punchOsc.frequency.setValueAtTime(w.punchFreq, now);
        punchOsc.frequency.exponentialRampToValueAtTime(w.punchFreq * 0.3, now + 0.04);
        const punchGain = ctx.createGain();
        punchGain.gain.setValueAtTime(vol * w.punchVol, now);
        punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        punchOsc.connect(punchGain);
        punchGain.connect(ctx.destination);
        punchOsc.start(now);
        punchOsc.stop(now + 0.06);

        // === Layer 2: Bass boom ===
        const bassOsc = ctx.createOscillator();
        bassOsc.type = 'sine';
        bassOsc.frequency.setValueAtTime(w.bassFreq, now);
        bassOsc.frequency.exponentialRampToValueAtTime(w.bassFreq * 0.4, now + w.bassDur);
        const bassGain = ctx.createGain();
        bassGain.gain.setValueAtTime(vol * w.bassVol, now + 0.005);
        bassGain.gain.exponentialRampToValueAtTime(0.001, now + w.bassDur);
        bassOsc.connect(bassGain);
        bassGain.connect(ctx.destination);
        bassOsc.start(now);
        bassOsc.stop(now + w.bassDur);

        // === Layer 3: Sharp crack/transient ===
        const crackLen = ctx.sampleRate * 0.012;
        const crackBuf = ctx.createBuffer(1, crackLen, ctx.sampleRate);
        const crackData = crackBuf.getChannelData(0);
        for (let i = 0; i < crackLen; i++) {
            const env = Math.exp(-i / (crackLen * 0.08));
            crackData[i] = (Math.random() * 2 - 1) * env;
        }
        const crackSrc = ctx.createBufferSource();
        crackSrc.buffer = crackBuf;
        const crackHP = ctx.createBiquadFilter();
        crackHP.type = 'highpass';
        crackHP.frequency.value = w.crackFreq;
        const crackGain = ctx.createGain();
        crackGain.gain.value = vol * w.crackVol;
        crackSrc.connect(crackHP);
        crackHP.connect(crackGain);
        crackGain.connect(ctx.destination);
        crackSrc.start(now);

        // === Layer 4: Mid-range body ===
        const midLen = ctx.sampleRate * w.midDur;
        const midBuf = ctx.createBuffer(1, midLen, ctx.sampleRate);
        const midData = midBuf.getChannelData(0);
        for (let i = 0; i < midLen; i++) {
            const t = i / midLen;
            const env = Math.exp(-t * 10);
            midData[i] = (Math.random() * 2 - 1) * env;
        }
        const midSrc = ctx.createBufferSource();
        midSrc.buffer = midBuf;
        const midBP = ctx.createBiquadFilter();
        midBP.type = 'bandpass';
        midBP.frequency.value = w.midFreq;
        midBP.Q.value = 1.2;
        const midGain = ctx.createGain();
        midGain.gain.value = vol * w.midVol;
        midSrc.connect(midBP);
        midBP.connect(midGain);
        midGain.connect(ctx.destination);
        midSrc.start(now);

        // === Layer 5: Distance/room tail ===
        const tailLen = ctx.sampleRate * w.tailDur;
        const tailBuf = ctx.createBuffer(1, tailLen, ctx.sampleRate);
        const tailData = tailBuf.getChannelData(0);
        for (let i = 0; i < tailLen; i++) {
            const t = i / tailLen;
            tailData[i] = (Math.random() * 2 - 1) * Math.exp(-t * 3) * 0.4;
        }
        const tailSrc = ctx.createBufferSource();
        tailSrc.buffer = tailBuf;
        const tailLP = ctx.createBiquadFilter();
        tailLP.type = 'lowpass';
        tailLP.frequency.value = w.midFreq * 2;
        const tailGain = ctx.createGain();
        tailGain.gain.value = vol * w.tailVol;
        tailSrc.connect(tailLP);
        tailLP.connect(tailGain);
        tailGain.connect(ctx.destination);
        tailSrc.start(now + 0.02);
        tailSrc.stop(now + 0.02 + w.tailDur);
    }

    // Realistic reload sound sequence
    playReload() {
        if (!this.enabled || !this.context) return;

        const ctx = this.context;
        const now = ctx.currentTime;
        const vol = this.masterVolume;

        // Helper to create metallic click/clack sounds
        const createClick = (time, freq, duration, volume, qValue = 8) => {
            const len = ctx.sampleRate * duration;
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < len; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.2));
            }
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = freq;
            bp.Q.value = qValue;
            const gain = ctx.createGain();
            gain.gain.value = vol * volume;
            src.connect(bp);
            bp.connect(gain);
            gain.connect(ctx.destination);
            src.start(now + time);
        };

        // Helper for sliding metal sounds
        const createSlide = (time, duration, freqStart, freqEnd, volume) => {
            const len = ctx.sampleRate * duration;
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < len; i++) {
                const t = i / len;
                data[i] = (Math.random() * 2 - 1) * (0.3 + t * 0.4);
            }
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.setValueAtTime(freqStart, now + time);
            bp.frequency.linearRampToValueAtTime(freqEnd, now + time + duration);
            bp.Q.value = 2;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, now + time);
            gain.gain.linearRampToValueAtTime(vol * volume, now + time + duration * 0.3);
            gain.gain.linearRampToValueAtTime(0, now + time + duration);
            src.connect(bp);
            bp.connect(gain);
            gain.connect(ctx.destination);
            src.start(now + time);
            src.stop(now + time + duration);
        };

        // Helper for thuds/impacts
        const createThud = (time, freq, duration, volume) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + time);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.3, now + time + duration);
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(vol * volume, now + time);
            gain.gain.exponentialRampToValueAtTime(0.001, now + time + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + time);
            osc.stop(now + time + duration);
        };

        // === Reload sequence ===
        // 1. Magazine release button press
        createClick(0.12, 1200, 0.02, 0.4, 6);

        // 2. Magazine sliding out
        createSlide(0.14, 0.06, 600, 900, 0.3);

        // 3. Magazine falls/drops
        createThud(0.22, 120, 0.08, 0.35);

        // 4. Hand grabs new magazine (fabric/metal touch)
        createClick(0.45, 800, 0.015, 0.2, 4);

        // 5. Magazine slides into magwell
        createSlide(0.55, 0.1, 500, 1000, 0.4);

        // 6. Magazine locks in place - two-part sound
        createClick(0.66, 1800, 0.025, 0.6, 10); // High click
        createThud(0.66, 100, 0.05, 0.45); // Low thump

        // 7. Hand moves to charging handle
        createClick(0.78, 600, 0.01, 0.15, 3);

        // 8. Charging handle pull back
        createSlide(0.82, 0.08, 400, 800, 0.5);

        // 9. Bolt release - heavy metallic slam
        createClick(0.95, 1400, 0.03, 0.7, 8);
        createThud(0.95, 80, 0.1, 0.6);
    }

    playHit() {
        // Disabled - no hit sound
    }

    playPlayerHurt() {
        if (!this.enabled || !this.context) return;

        const ctx = this.context;
        const now = ctx.currentTime;

        // Impact thud
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(60, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(this.masterVolume * 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
    }

    // Battlefield 6 style enemy death - body impact, grunt, gear rattle
    playEnemyDeath() {
        if (!this.enabled || !this.context) return;

        const ctx = this.context;
        const now = ctx.currentTime;
        const vol = this.masterVolume;

        // Layer 1: Body impact thud (heavy)
        const impactOsc = ctx.createOscillator();
        impactOsc.type = 'sine';
        impactOsc.frequency.setValueAtTime(80, now);
        impactOsc.frequency.exponentialRampToValueAtTime(25, now + 0.15);
        const impactGain = ctx.createGain();
        impactGain.gain.setValueAtTime(vol * 0.7, now);
        impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        impactOsc.connect(impactGain);
        impactGain.connect(ctx.destination);
        impactOsc.start(now);
        impactOsc.stop(now + 0.2);

        // Layer 2: Brief grunt/exhale
        const gruntLen = ctx.sampleRate * 0.08;
        const gruntBuf = ctx.createBuffer(1, gruntLen, ctx.sampleRate);
        const gruntData = gruntBuf.getChannelData(0);
        for (let i = 0; i < gruntLen; i++) {
            const t = i / gruntLen;
            gruntData[i] = (Math.random() * 2 - 1) * Math.exp(-t * 8) * 0.6;
        }
        const gruntSrc = ctx.createBufferSource();
        gruntSrc.buffer = gruntBuf;
        const gruntBP = ctx.createBiquadFilter();
        gruntBP.type = 'bandpass';
        gruntBP.frequency.value = 250;
        gruntBP.Q.value = 2;
        const gruntGain = ctx.createGain();
        gruntGain.gain.value = vol * 0.5;
        gruntSrc.connect(gruntBP);
        gruntBP.connect(gruntGain);
        gruntGain.connect(ctx.destination);
        gruntSrc.start(now + 0.02);

        // Layer 3: Equipment/gear rattle
        const rattleLen = ctx.sampleRate * 0.12;
        const rattleBuf = ctx.createBuffer(1, rattleLen, ctx.sampleRate);
        const rattleData = rattleBuf.getChannelData(0);
        for (let i = 0; i < rattleLen; i++) {
            const t = i / rattleLen;
            rattleData[i] = (Math.random() * 2 - 1) * Math.exp(-t * 6) * 0.4;
        }
        const rattleSrc = ctx.createBufferSource();
        rattleSrc.buffer = rattleBuf;
        const rattleBP = ctx.createBiquadFilter();
        rattleBP.type = 'bandpass';
        rattleBP.frequency.value = 1500;
        rattleBP.Q.value = 3;
        const rattleGain = ctx.createGain();
        rattleGain.gain.value = vol * 0.35;
        rattleSrc.connect(rattleBP);
        rattleBP.connect(rattleGain);
        rattleGain.connect(ctx.destination);
        rattleSrc.start(now + 0.05);

        // Layer 4: Secondary thump (body settling)
        const settleOsc = ctx.createOscillator();
        settleOsc.type = 'sine';
        settleOsc.frequency.setValueAtTime(50, now + 0.15);
        settleOsc.frequency.exponentialRampToValueAtTime(20, now + 0.25);
        const settleGain = ctx.createGain();
        settleGain.gain.setValueAtTime(vol * 0.4, now + 0.15);
        settleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        settleOsc.connect(settleGain);
        settleGain.connect(ctx.destination);
        settleOsc.start(now + 0.15);
        settleOsc.stop(now + 0.3);
    }

    setVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
    }

    // Footstep sound - varies slightly each time
    playFootstep(isSprinting = false) {
        if (!this.enabled || !this.context) return;

        const ctx = this.context;
        const now = ctx.currentTime;
        const vol = this.masterVolume * (isSprinting ? 0.35 : 0.25);

        // Random variation for natural feel
        const pitchVar = 0.9 + Math.random() * 0.2;

        // Low thud component
        const thudOsc = ctx.createOscillator();
        thudOsc.type = 'sine';
        thudOsc.frequency.setValueAtTime(80 * pitchVar, now);
        thudOsc.frequency.exponentialRampToValueAtTime(40 * pitchVar, now + 0.08);
        const thudGain = ctx.createGain();
        thudGain.gain.setValueAtTime(vol, now);
        thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        thudOsc.connect(thudGain);
        thudGain.connect(ctx.destination);
        thudOsc.start(now);
        thudOsc.stop(now + 0.1);

        // Higher tap/scrape component
        const tapLen = ctx.sampleRate * 0.03;
        const tapBuf = ctx.createBuffer(1, tapLen, ctx.sampleRate);
        const tapData = tapBuf.getChannelData(0);
        for (let i = 0; i < tapLen; i++) {
            tapData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (tapLen * 0.3));
        }
        const tapSrc = ctx.createBufferSource();
        tapSrc.buffer = tapBuf;
        const tapFilter = ctx.createBiquadFilter();
        tapFilter.type = 'bandpass';
        tapFilter.frequency.value = 600 * pitchVar;
        tapFilter.Q.value = 2;
        const tapGain = ctx.createGain();
        tapGain.gain.value = vol * 0.6;
        tapSrc.connect(tapFilter);
        tapFilter.connect(tapGain);
        tapGain.connect(ctx.destination);
        tapSrc.start(now);
    }

    // Jump takeoff sound
    playJump() {
        if (!this.enabled || !this.context) return;

        const ctx = this.context;
        const now = ctx.currentTime;
        const vol = this.masterVolume * 0.3;

        // Whoosh up
        const whooshLen = ctx.sampleRate * 0.1;
        const whooshBuf = ctx.createBuffer(1, whooshLen, ctx.sampleRate);
        const whooshData = whooshBuf.getChannelData(0);
        for (let i = 0; i < whooshLen; i++) {
            const t = i / whooshLen;
            whooshData[i] = (Math.random() * 2 - 1) * (1 - t) * 0.5;
        }
        const whooshSrc = ctx.createBufferSource();
        whooshSrc.buffer = whooshBuf;
        const whooshFilter = ctx.createBiquadFilter();
        whooshFilter.type = 'bandpass';
        whooshFilter.frequency.setValueAtTime(200, now);
        whooshFilter.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        whooshFilter.Q.value = 1;
        const whooshGain = ctx.createGain();
        whooshGain.gain.value = vol;
        whooshSrc.connect(whooshFilter);
        whooshFilter.connect(whooshGain);
        whooshGain.connect(ctx.destination);
        whooshSrc.start(now);
        whooshSrc.stop(now + 0.1);

        // Effort grunt/push (low frequency)
        const pushOsc = ctx.createOscillator();
        pushOsc.type = 'sine';
        pushOsc.frequency.setValueAtTime(100, now);
        pushOsc.frequency.exponentialRampToValueAtTime(60, now + 0.08);
        const pushGain = ctx.createGain();
        pushGain.gain.setValueAtTime(vol * 0.5, now);
        pushGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        pushOsc.connect(pushGain);
        pushGain.connect(ctx.destination);
        pushOsc.start(now);
        pushOsc.stop(now + 0.1);
    }

    // Landing sound
    playLand() {
        if (!this.enabled || !this.context) return;

        const ctx = this.context;
        const now = ctx.currentTime;
        const vol = this.masterVolume * 0.4;

        // Heavy impact thud
        const thudOsc = ctx.createOscillator();
        thudOsc.type = 'sine';
        thudOsc.frequency.setValueAtTime(100, now);
        thudOsc.frequency.exponentialRampToValueAtTime(30, now + 0.15);
        const thudGain = ctx.createGain();
        thudGain.gain.setValueAtTime(vol, now);
        thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        thudOsc.connect(thudGain);
        thudGain.connect(ctx.destination);
        thudOsc.start(now);
        thudOsc.stop(now + 0.15);

        // Surface noise
        const noiseLen = ctx.sampleRate * 0.05;
        const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
        const noiseData = noiseBuf.getChannelData(0);
        for (let i = 0; i < noiseLen; i++) {
            noiseData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (noiseLen * 0.2));
        }
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = noiseBuf;
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.value = 800;
        const noiseGain = ctx.createGain();
        noiseGain.gain.value = vol * 0.4;
        noiseSrc.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noiseSrc.start(now);
    }

    enable() {
        this.enabled = true;
    }

    disable() {
        this.enabled = false;
    }
}
