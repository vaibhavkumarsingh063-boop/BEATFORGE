/**
 * BeatForge Studio - Drum Sound Synthesis Engine
 * Generates punchy, authentic drum sounds using Tone.js and Web Audio API
 */
import * as Tone from 'tone';
import { DrumSoundId } from '../types/daw';

export class DrumEngine {
  private outputNode: Tone.Gain;
  private customBuffers: Map<string, AudioBuffer> = new Map();

  constructor(outputNode: Tone.Gain) {
    this.outputNode = outputNode;
  }

  /**
   * Set custom sample buffer for custom uploaded samples
   */
  public registerCustomBuffer(url: string, buffer: AudioBuffer) {
    this.customBuffers.set(url, buffer);
  }

  public async loadCustomBuffer(url: string): Promise<AudioBuffer | null> {
    if (this.customBuffers.has(url)) return this.customBuffers.get(url)!;
    try {
      const res = await fetch(url);
      const ab = await res.arrayBuffer();
      const buf = await (Tone.getContext().rawContext as AudioContext).decodeAudioData(ab);
      this.customBuffers.set(url, buf);
      return buf;
    } catch {
      return null;
    }
  }

  /**
   * Trigger a drum sound by ID with pitch, velocity, and time
   */
  public triggerSound(
    soundId: DrumSoundId,
    time?: number,
    velocity: number = 0.85,
    pitchSemitones: number = 0,
    customUrl?: string
  ) {
    const triggerTime = time !== undefined ? time : Tone.now();
    const vel = Math.max(0.05, Math.min(1.2, velocity));
    const pitchRatio = Math.pow(2, pitchSemitones / 12);

    // If custom sample is assigned, play the custom buffer (or lazy-fetch for next hits)
    if (customUrl) {
      if (this.customBuffers.has(customUrl)) {
        const buf = this.customBuffers.get(customUrl)!;
        const source = (Tone.getContext().rawContext as AudioContext).createBufferSource();
        source.buffer = buf;
        source.playbackRate.value = pitchRatio;

        const gain = (Tone.getContext().rawContext as AudioContext).createGain();
        gain.gain.value = vel;
        source.connect(gain);
        gain.connect(this.outputNode.input as unknown as AudioNode);
        source.start(triggerTime);
        return;
      } else {
        this.loadCustomBuffer(customUrl).catch(() => {});
      }
    }

    switch (soundId) {
      case 'kick-punch':
        this.playPunchKick(triggerTime, vel, pitchRatio);
        break;
      case 'kick-808':
        this.play808Kick(triggerTime, vel, pitchRatio);
        break;
      case 'snare-acoustic':
        this.playAcousticSnare(triggerTime, vel, pitchRatio);
        break;
      case 'snare-trap':
        this.playTrapSnare(triggerTime, vel, pitchRatio);
        break;
      case 'hihat-closed':
        this.playClosedHiHat(triggerTime, vel, pitchRatio);
        break;
      case 'hihat-open':
        this.playOpenHiHat(triggerTime, vel, pitchRatio);
        break;
      case 'clap':
        this.playClap(triggerTime, vel, pitchRatio);
        break;
      case 'rimshot':
        this.playRimshot(triggerTime, vel, pitchRatio);
        break;
      case 'perc-shaker':
        this.playShaker(triggerTime, vel, pitchRatio);
        break;
      case 'tom-high':
        this.playTom(triggerTime, vel, 220 * pitchRatio, 0.28);
        break;
      case 'tom-low':
        this.playTom(triggerTime, vel, 110 * pitchRatio, 0.42);
        break;
      case 'crash':
        this.playCrash(triggerTime, vel, pitchRatio);
        break;
      case 'sub-808-hit':
        this.play808SubHit(triggerTime, vel, pitchRatio);
        break;
      default:
        this.playPunchKick(triggerTime, vel, pitchRatio);
    }
  }

  // PUNCHY ACOUSTIC / CLUB KICK
  private playPunchKick(time: number, vel: number, pitchRatio: number) {
    const osc = new Tone.Oscillator(160 * pitchRatio, 'sine');
    const env = new Tone.FrequencyEnvelope({
      attack: 0.001,
      decay: 0.25,
      sustain: 0,
      release: 0.05,
      baseFrequency: 45 * pitchRatio,
      octaves: 2.8,
      exponent: 4
    });

    const gainEnv = new Tone.AmplitudeEnvelope({
      attack: 0.002,
      decay: 0.28,
      sustain: 0,
      release: 0.05
    });

    const gainNode = new Tone.Gain(vel * 1.1).connect(this.outputNode);
    env.connect(osc.frequency);
    osc.connect(gainEnv);
    gainEnv.connect(gainNode);

    // Initial click for snap
    const click = new Tone.Oscillator(800 * pitchRatio, 'triangle');
    const clickEnv = new Tone.AmplitudeEnvelope({ attack: 0.001, decay: 0.015, sustain: 0 });
    click.connect(clickEnv);
    clickEnv.connect(gainNode);

    osc.start(time);
    env.triggerAttack(time);
    gainEnv.triggerAttack(time);
    click.start(time);
    clickEnv.triggerAttack(time);

    osc.stop(time + 0.35);
    click.stop(time + 0.05);
    setTimeout(() => {
      osc.dispose();
      env.dispose();
      gainEnv.dispose();
      gainNode.dispose();
      click.dispose();
      clickEnv.dispose();
    }, 500);
  }

  // 808 DEEP BOOM KICK
  private play808Kick(time: number, vel: number, pitchRatio: number) {
    const osc = new Tone.Oscillator(130 * pitchRatio, 'sine');
    const freqEnv = new Tone.FrequencyEnvelope({
      attack: 0.001,
      decay: 0.4,
      sustain: 0,
      release: 0.1,
      baseFrequency: 38 * pitchRatio,
      octaves: 2.5,
      exponent: 3
    });

    const gainEnv = new Tone.AmplitudeEnvelope({
      attack: 0.002,
      decay: 0.75,
      sustain: 0,
      release: 0.2
    });

    const dist = new Tone.Distortion(0.15);
    const gainNode = new Tone.Gain(vel * 1.15).connect(this.outputNode);

    freqEnv.connect(osc.frequency);
    osc.connect(dist);
    dist.connect(gainEnv);
    gainEnv.connect(gainNode);

    osc.start(time);
    freqEnv.triggerAttack(time);
    gainEnv.triggerAttack(time);

    osc.stop(time + 0.95);
    setTimeout(() => {
      osc.dispose();
      freqEnv.dispose();
      gainEnv.dispose();
      dist.dispose();
      gainNode.dispose();
    }, 1100);
  }

  // CRISP ACOUSTIC SNARE
  private playAcousticSnare(time: number, vel: number, pitchRatio: number) {
    // Body tone
    const osc = new Tone.Oscillator(240 * pitchRatio, 'triangle');
    const oscEnv = new Tone.AmplitudeEnvelope({ attack: 0.001, decay: 0.14, sustain: 0 });

    // Snare wires noise
    const noise = new Tone.Noise('white');
    const filter = new Tone.Filter(3200, 'bandpass');
    const noiseEnv = new Tone.AmplitudeEnvelope({ attack: 0.002, decay: 0.22, sustain: 0 });

    const gain = new Tone.Gain(vel * 0.9).connect(this.outputNode);

    osc.connect(oscEnv);
    oscEnv.connect(gain);

    noise.connect(filter);
    filter.connect(noiseEnv);
    noiseEnv.connect(gain);

    osc.start(time);
    oscEnv.triggerAttack(time);
    noise.start(time);
    noiseEnv.triggerAttack(time);

    osc.stop(time + 0.25);
    noise.stop(time + 0.28);

    setTimeout(() => {
      osc.dispose();
      oscEnv.dispose();
      noise.dispose();
      filter.dispose();
      noiseEnv.dispose();
      gain.dispose();
    }, 400);
  }

  // TRAP 808 SNARE
  private playTrapSnare(time: number, vel: number, pitchRatio: number) {
    const osc = new Tone.Oscillator(330 * pitchRatio, 'sine');
    const oscEnv = new Tone.AmplitudeEnvelope({ attack: 0.001, decay: 0.08, sustain: 0 });

    const noise = new Tone.Noise('pink');
    const filter = new Tone.Filter(5000 * pitchRatio, 'highpass');
    const noiseEnv = new Tone.AmplitudeEnvelope({ attack: 0.001, decay: 0.16, sustain: 0 });

    const gain = new Tone.Gain(vel * 0.95).connect(this.outputNode);

    osc.connect(oscEnv);
    oscEnv.connect(gain);
    noise.connect(filter);
    filter.connect(noiseEnv);
    noiseEnv.connect(gain);

    osc.start(time);
    oscEnv.triggerAttack(time);
    noise.start(time);
    noiseEnv.triggerAttack(time);

    osc.stop(time + 0.2);
    noise.stop(time + 0.2);

    setTimeout(() => {
      osc.dispose();
      oscEnv.dispose();
      noise.dispose();
      filter.dispose();
      noiseEnv.dispose();
      gain.dispose();
    }, 350);
  }

  // CLOSED HI-HAT
  private playClosedHiHat(time: number, vel: number, pitchRatio: number) {
    const noise = new Tone.Noise('white');
    const filter = new Tone.Filter(8000 * pitchRatio, 'highpass');
    const env = new Tone.AmplitudeEnvelope({ attack: 0.001, decay: 0.045, sustain: 0 });
    const gain = new Tone.Gain(vel * 0.75).connect(this.outputNode);

    noise.connect(filter);
    filter.connect(env);
    env.connect(gain);

    noise.start(time);
    env.triggerAttack(time);
    noise.stop(time + 0.06);

    setTimeout(() => {
      noise.dispose();
      filter.dispose();
      env.dispose();
      gain.dispose();
    }, 200);
  }

  // OPEN HI-HAT
  private playOpenHiHat(time: number, vel: number, pitchRatio: number) {
    const noise = new Tone.Noise('white');
    const filter = new Tone.Filter(6500 * pitchRatio, 'highpass');
    const env = new Tone.AmplitudeEnvelope({ attack: 0.002, decay: 0.38, sustain: 0, release: 0.1 });
    const gain = new Tone.Gain(vel * 0.8).connect(this.outputNode);

    noise.connect(filter);
    filter.connect(env);
    env.connect(gain);

    noise.start(time);
    env.triggerAttack(time);
    noise.stop(time + 0.45);

    setTimeout(() => {
      noise.dispose();
      filter.dispose();
      env.dispose();
      gain.dispose();
    }, 550);
  }

  // MULTI-BURST HAND CLAP
  private playClap(time: number, vel: number, pitchRatio: number) {
    const bursts = [0, 0.012, 0.024];
    const gain = new Tone.Gain(vel * 0.85).connect(this.outputNode);
    const filter = new Tone.Filter(1500 * pitchRatio, 'bandpass');
    filter.connect(gain);

    bursts.forEach((burstOffset, index) => {
      const isLast = index === bursts.length - 1;
      const decay = isLast ? 0.22 : 0.015;
      const noise = new Tone.Noise('pink');
      const env = new Tone.AmplitudeEnvelope({ attack: 0.001, decay, sustain: 0 });

      noise.connect(env);
      env.connect(filter);

      noise.start(time + burstOffset);
      env.triggerAttack(time + burstOffset);
      noise.stop(time + burstOffset + decay + 0.05);

      setTimeout(() => {
        noise.dispose();
        env.dispose();
      }, 450);
    });

    setTimeout(() => {
      filter.dispose();
      gain.dispose();
    }, 600);
  }

  // WOODEN / METALLIC RIMSHOT
  private playRimshot(time: number, vel: number, pitchRatio: number) {
    const osc = new Tone.Oscillator(600 * pitchRatio, 'triangle');
    const noise = new Tone.Noise('white');
    const filter = new Tone.Filter(3500 * pitchRatio, 'bandpass');

    const oscEnv = new Tone.AmplitudeEnvelope({ attack: 0.001, decay: 0.03, sustain: 0 });
    const noiseEnv = new Tone.AmplitudeEnvelope({ attack: 0.001, decay: 0.025, sustain: 0 });
    const gain = new Tone.Gain(vel * 0.8).connect(this.outputNode);

    osc.connect(oscEnv);
    oscEnv.connect(gain);
    noise.connect(filter);
    filter.connect(noiseEnv);
    noiseEnv.connect(gain);

    osc.start(time);
    oscEnv.triggerAttack(time);
    noise.start(time);
    noiseEnv.triggerAttack(time);

    osc.stop(time + 0.05);
    noise.stop(time + 0.05);

    setTimeout(() => {
      osc.dispose();
      oscEnv.dispose();
      noise.dispose();
      filter.dispose();
      noiseEnv.dispose();
      gain.dispose();
    }, 200);
  }

  // SHAKER / PERCUSSION
  private playShaker(time: number, vel: number, pitchRatio: number) {
    const noise = new Tone.Noise('white');
    const filter = new Tone.Filter(7500 * pitchRatio, 'bandpass');
    const env = new Tone.AmplitudeEnvelope({ attack: 0.008, decay: 0.06, sustain: 0 });
    const gain = new Tone.Gain(vel * 0.7).connect(this.outputNode);

    noise.connect(filter);
    filter.connect(env);
    env.connect(gain);

    noise.start(time);
    env.triggerAttack(time);
    noise.stop(time + 0.08);

    setTimeout(() => {
      noise.dispose();
      filter.dispose();
      env.dispose();
      gain.dispose();
    }, 200);
  }

  // TOM DRUM (HIGH & LOW)
  private playTom(time: number, vel: number, startFreq: number, decayTime: number) {
    const osc = new Tone.Oscillator(startFreq, 'sine');
    const freqEnv = new Tone.FrequencyEnvelope({
      attack: 0.001,
      decay: decayTime * 0.6,
      sustain: 0,
      baseFrequency: startFreq * 0.45,
      octaves: 1.2
    });

    const gainEnv = new Tone.AmplitudeEnvelope({
      attack: 0.002,
      decay: decayTime,
      sustain: 0
    });

    const gain = new Tone.Gain(vel * 0.9).connect(this.outputNode);
    freqEnv.connect(osc.frequency);
    osc.connect(gainEnv);
    gainEnv.connect(gain);

    osc.start(time);
    freqEnv.triggerAttack(time);
    gainEnv.triggerAttack(time);
    osc.stop(time + decayTime + 0.1);

    setTimeout(() => {
      osc.dispose();
      freqEnv.dispose();
      gainEnv.dispose();
      gain.dispose();
    }, 600);
  }

  // CRASH CYMBAL
  private playCrash(time: number, vel: number, pitchRatio: number) {
    const noise = new Tone.Noise('white');
    const filter = new Tone.Filter(4500 * pitchRatio, 'highpass');
    const env = new Tone.AmplitudeEnvelope({ attack: 0.005, decay: 1.4, sustain: 0, release: 0.4 });
    const gain = new Tone.Gain(vel * 0.75).connect(this.outputNode);

    noise.connect(filter);
    filter.connect(env);
    env.connect(gain);

    noise.start(time);
    env.triggerAttack(time);
    noise.stop(time + 1.8);

    setTimeout(() => {
      noise.dispose();
      filter.dispose();
      env.dispose();
      gain.dispose();
    }, 2000);
  }

  // 808 SUB BASS HIT
  private play808SubHit(time: number, vel: number, pitchRatio: number) {
    const osc = new Tone.Oscillator(75 * pitchRatio, 'sine');
    const freqEnv = new Tone.FrequencyEnvelope({
      attack: 0.001,
      decay: 0.2,
      sustain: 0,
      baseFrequency: 42 * pitchRatio,
      octaves: 1.5
    });

    const gainEnv = new Tone.AmplitudeEnvelope({
      attack: 0.005,
      decay: 1.1,
      sustain: 0.1,
      release: 0.2
    });

    const dist = new Tone.Distortion(0.25);
    const gain = new Tone.Gain(vel * 1.2).connect(this.outputNode);

    freqEnv.connect(osc.frequency);
    osc.connect(dist);
    dist.connect(gainEnv);
    gainEnv.connect(gain);

    osc.start(time);
    freqEnv.triggerAttack(time);
    gainEnv.triggerAttack(time);
    osc.stop(time + 1.3);

    setTimeout(() => {
      osc.dispose();
      freqEnv.dispose();
      gainEnv.dispose();
      dist.dispose();
      gainNodeClean(gain, dist);
    }, 1500);

    function gainNodeClean(g: Tone.Gain, d: Tone.Distortion) {
      g.dispose();
      d.dispose();
    }
  }
}
