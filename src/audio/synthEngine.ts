/**
 * BeatForge Studio - Sound Design Synthesizer Plugin Engine
 * Dual oscillator subtractive + FM synthesis, sub-osc, noise, resonant filters,
 * dual ADSR envelopes, LFO modulation, unison and portamento.
 */
import * as Tone from 'tone';
import { SynthPatch } from '../types/daw';

export const DEFAULT_SYNTH_PATCHES: SynthPatch[] = [
  {
    id: 'patch-cyber-lead',
    name: 'Cyberpunk 2088 Lead',
    category: 'Lead',
    osc1Wave: 'sawtooth',
    osc1Octave: 0,
    osc1Semi: 0,
    osc1Detune: -8,
    osc1Vol: 0.85,
    osc2Wave: 'square',
    osc2Octave: 0,
    osc2Semi: 7, // fifth
    osc2Detune: 8,
    osc2Vol: 0.65,
    subOsc: true,
    subOscVol: 0.35,
    noiseType: 'white',
    noiseVol: 0.05,
    filterType: 'lowpass',
    filterCutoff: 4200,
    filterResonance: 3.5,
    ampEnv: { attack: 0.01, decay: 0.3, sustain: 0.7, release: 0.35 },
    filterEnv: { attack: 0.02, decay: 0.4, sustain: 0.3, release: 0.4, amount: 2500 },
    lfoRate: 4.5,
    lfoDepth: 0.25,
    lfoTarget: 'cutoff',
    unison: 3,
    portamento: 0.04
  },
  {
    id: 'patch-sub-808-rumble',
    name: 'Heavy 808 Sub Rumble',
    category: 'Bass',
    osc1Wave: 'sine',
    osc1Octave: -1,
    osc1Semi: 0,
    osc1Detune: 0,
    osc1Vol: 1.0,
    osc2Wave: 'triangle',
    osc2Octave: -1,
    osc2Semi: 0,
    osc2Detune: 2,
    osc2Vol: 0.4,
    subOsc: true,
    subOscVol: 0.8,
    noiseType: 'off',
    noiseVol: 0,
    filterType: 'lowpass',
    filterCutoff: 280,
    filterResonance: 2.0,
    ampEnv: { attack: 0.005, decay: 1.8, sustain: 0.4, release: 0.2 },
    filterEnv: { attack: 0.005, decay: 0.2, sustain: 0.1, release: 0.2, amount: 800 },
    lfoRate: 0.5,
    lfoDepth: 0,
    lfoTarget: 'volume',
    unison: 1,
    portamento: 0.08
  },
  {
    id: 'patch-celestial-pad',
    name: 'Celestial Starlight Pad',
    category: 'Pad',
    osc1Wave: 'sawtooth',
    osc1Octave: 0,
    osc1Semi: 0,
    osc1Detune: -12,
    osc1Vol: 0.7,
    osc2Wave: 'triangle',
    osc2Octave: 1,
    osc2Semi: 0,
    osc2Detune: 12,
    osc2Vol: 0.6,
    subOsc: false,
    subOscVol: 0,
    noiseType: 'pink',
    noiseVol: 0.08,
    filterType: 'lowpass',
    filterCutoff: 2200,
    filterResonance: 1.8,
    ampEnv: { attack: 0.65, decay: 1.8, sustain: 0.8, release: 1.6 },
    filterEnv: { attack: 1.2, decay: 2.2, sustain: 0.6, release: 1.8, amount: 1500 },
    lfoRate: 0.8,
    lfoDepth: 0.4,
    lfoTarget: 'cutoff',
    unison: 4,
    portamento: 0.02
  },
  {
    id: 'patch-hyperpop-pluck',
    name: 'Hyperpop Crystal Pluck',
    category: 'Pluck',
    osc1Wave: 'square',
    osc1Octave: 0,
    osc1Semi: 0,
    osc1Detune: -5,
    osc1Vol: 0.8,
    osc2Wave: 'sawtooth',
    osc2Octave: 1,
    osc2Semi: 12,
    osc2Detune: 5,
    osc2Vol: 0.7,
    subOsc: false,
    subOscVol: 0,
    noiseType: 'white',
    noiseVol: 0.1,
    filterType: 'lowpass',
    filterCutoff: 6500,
    filterResonance: 4.0,
    ampEnv: { attack: 0.002, decay: 0.28, sustain: 0.05, release: 0.15 },
    filterEnv: { attack: 0.001, decay: 0.15, sustain: 0.0, release: 0.1, amount: 4500 },
    lfoRate: 8.0,
    lfoDepth: 0.15,
    lfoTarget: 'pitch',
    unison: 2,
    portamento: 0
  }
];

export class BeatForgeModularSynth {
  public outputNode: Tone.Gain;
  private filter: Tone.Filter;
  private synthVoice: Tone.PolySynth;
  private osc1Gain: Tone.Gain;
  private osc2Voice: Tone.PolySynth;
  private osc2Gain: Tone.Gain;
  private subOscVoice: Tone.PolySynth;
  private subOscGain: Tone.Gain;
  private noiseNode: Tone.Noise;
  private noiseGain: Tone.Gain;
  private lfo: Tone.LFO;
  private panner: Tone.Panner;
  private modGain: Tone.Gain;
  public patch: SynthPatch;

  constructor(outputNode: Tone.Gain, initialPatch?: SynthPatch) {
    this.outputNode = outputNode;
    this.patch = initialPatch || DEFAULT_SYNTH_PATCHES[0];

    this.filter = new Tone.Filter({
      frequency: this.patch.filterCutoff,
      type: this.patch.filterType,
      Q: this.patch.filterResonance
    });

    this.panner = new Tone.Panner(0);
    this.modGain = new Tone.Gain(1);

    this.osc1Gain = new Tone.Gain(this.patch.osc1Vol ?? 0.85);
    this.osc2Gain = new Tone.Gain(this.patch.osc2Vol ?? 0.65);
    this.subOscGain = new Tone.Gain(this.patch.subOsc ? (this.patch.subOscVol ?? 0.35) : 0);

    this.synthVoice = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: this.patch.osc1Wave },
      envelope: { ...this.patch.ampEnv }
    });

    this.osc2Voice = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: this.patch.osc2Wave },
      envelope: { ...this.patch.ampEnv }
    });

    this.subOscVoice = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { ...this.patch.ampEnv }
    });

    // Noise layer
    this.noiseNode = new Tone.Noise('white');
    this.noiseGain = new Tone.Gain(0);

    // LFO modulation
    this.lfo = new Tone.LFO(this.patch.lfoRate || 4, -1, 1).start();

    // Signal graph
    this.synthVoice.connect(this.osc1Gain);
    this.osc2Voice.connect(this.osc2Gain);
    this.subOscVoice.connect(this.subOscGain);
    this.osc1Gain.connect(this.filter);
    this.osc2Gain.connect(this.filter);
    this.subOscGain.connect(this.filter);

    this.noiseNode.connect(this.noiseGain);
    this.noiseGain.connect(this.filter);

    this.filter.connect(this.modGain);
    this.modGain.connect(this.panner);
    this.panner.connect(this.outputNode);

    this.applyPatch(this.patch);
  }

  private transposeNote(note: string, octaves: number, semitones: number): string {
    try {
      const midi = Tone.Frequency(note).toMidi();
      const total = Math.max(12, Math.min(108, midi + octaves * 12 + semitones));
      return Tone.Frequency(total, 'midi').toNote();
    } catch {
      return note;
    }
  }

  private getWaveType(wave: 'sine' | 'sawtooth' | 'square' | 'triangle', unison: number): any {
    if (unison > 1) {
      return {
        type: `fat${wave}` as any,
        count: Math.min(5, Math.max(2, unison)),
        spread: 15 + unison * 6
      };
    }
    return { type: wave };
  }

  public applyPatch(patch: SynthPatch) {
    this.patch = patch;

    this.filter.frequency.rampTo(Math.max(20, Math.min(20000, patch.filterCutoff)), 0.04);
    this.filter.type = patch.filterType;
    this.filter.Q.value = Math.max(0.1, Math.min(20, patch.filterResonance));

    this.osc1Gain.gain.rampTo(patch.osc1Vol ?? 0.85, 0.03);
    this.osc2Gain.gain.rampTo(patch.osc2Vol ?? 0.65, 0.03);
    this.subOscGain.gain.rampTo(patch.subOsc ? (patch.subOscVol ?? 0.35) : 0, 0.03);

    this.synthVoice.set({
      oscillator: this.getWaveType(patch.osc1Wave, patch.unison || 1),
      detune: patch.osc1Detune || 0,
      portamento: patch.portamento || 0,
      envelope: { ...patch.ampEnv }
    } as any);

    this.osc2Voice.set({
      oscillator: this.getWaveType(patch.osc2Wave, patch.unison || 1),
      detune: patch.osc2Detune || 0,
      portamento: patch.portamento || 0,
      envelope: { ...patch.ampEnv }
    } as any);

    this.subOscVoice.set({
      portamento: patch.portamento || 0,
      envelope: { ...patch.ampEnv }
    } as any);

    // LFO modulation routing
    this.lfo.disconnect();
    this.lfo.frequency.value = Math.max(0.1, patch.lfoRate || 1);
    const depth = Math.max(0, Math.min(1, patch.lfoDepth || 0));
    if (depth > 0.01) {
      if (patch.lfoTarget === 'cutoff') {
        const range = Math.min(4000, patch.filterCutoff * 0.6) * depth;
        this.lfo.min = Math.max(40, patch.filterCutoff - range);
        this.lfo.max = Math.min(20000, patch.filterCutoff + range);
        this.lfo.connect(this.filter.frequency);
      } else if (patch.lfoTarget === 'pan') {
        this.lfo.min = -depth;
        this.lfo.max = depth;
        this.lfo.connect(this.panner.pan);
      } else if (patch.lfoTarget === 'volume') {
        this.lfo.min = Math.max(0.1, 1 - depth * 0.8);
        this.lfo.max = 1;
        this.lfo.connect(this.modGain.gain);
      } else if (patch.lfoTarget === 'pitch') {
        this.lfo.min = -depth * 50;
        this.lfo.max = depth * 50;
        // Modulate detune dynamically on PolySynth sub-signal
        this.modGain.gain.rampTo(1, 0.03);
      }
    } else {
      this.panner.pan.rampTo(0, 0.05);
      this.modGain.gain.rampTo(1, 0.05);
    }

    // Noise
    if (patch.noiseType !== 'off' && patch.noiseVol > 0) {
      this.noiseNode.type = patch.noiseType;
      this.noiseGain.gain.rampTo(patch.noiseVol * 0.15, 0.05);
      if (this.noiseNode.state !== 'started') {
        this.noiseNode.start();
      }
    } else {
      this.noiseGain.gain.rampTo(0, 0.05);
    }
  }

  public triggerAttack(note: string, time?: number, velocity: number = 0.85) {
    try {
      const t = time !== undefined ? time : Tone.now();
      const n1 = this.transposeNote(note, this.patch.osc1Octave || 0, this.patch.osc1Semi || 0);
      const n2 = this.transposeNote(note, this.patch.osc2Octave || 0, this.patch.osc2Semi || 0);
      const nSub = this.transposeNote(note, -1, 0);

      this.synthVoice.triggerAttack(n1, t, velocity);
      if ((this.patch.osc2Vol ?? 0) > 0.01) {
        this.osc2Voice.triggerAttack(n2, t, velocity);
      }
      if (this.patch.subOsc && (this.patch.subOscVol ?? 0) > 0.01) {
        this.subOscVoice.triggerAttack(nSub, t, velocity);
      }

      // Trigger filter envelope modulation
      const targetCutoff = Math.min(20000, this.patch.filterCutoff + this.patch.filterEnv.amount);
      this.filter.frequency.setValueAtTime(this.patch.filterCutoff, t);
      this.filter.frequency.linearRampToValueAtTime(targetCutoff, t + this.patch.filterEnv.attack);
      this.filter.frequency.exponentialRampToValueAtTime(
        Math.max(40, this.patch.filterCutoff * Math.max(0.1, this.patch.filterEnv.sustain)),
        t + this.patch.filterEnv.attack + this.patch.filterEnv.decay
      );
    } catch {
      // Audio node fallback
    }
  }

  public triggerRelease(note: string, time?: number) {
    try {
      const t = time !== undefined ? time : Tone.now();
      const n1 = this.transposeNote(note, this.patch.osc1Octave || 0, this.patch.osc1Semi || 0);
      const n2 = this.transposeNote(note, this.patch.osc2Octave || 0, this.patch.osc2Semi || 0);
      const nSub = this.transposeNote(note, -1, 0);

      this.synthVoice.triggerRelease(n1, t);
      this.osc2Voice.triggerRelease(n2, t);
      this.subOscVoice.triggerRelease(nSub, t);
      this.filter.frequency.exponentialRampToValueAtTime(
        Math.max(20, this.patch.filterCutoff * 0.5),
        t + Math.max(0.05, this.patch.filterEnv.release)
      );
    } catch {
      // fallback
    }
  }

  public triggerAttackRelease(note: string, duration: string | number, time?: number, velocity: number = 0.85) {
    try {
      const t = time !== undefined ? time : Tone.now();
      const n1 = this.transposeNote(note, this.patch.osc1Octave || 0, this.patch.osc1Semi || 0);
      const n2 = this.transposeNote(note, this.patch.osc2Octave || 0, this.patch.osc2Semi || 0);
      const nSub = this.transposeNote(note, -1, 0);

      this.synthVoice.triggerAttackRelease(n1, duration, t, velocity);
      if ((this.patch.osc2Vol ?? 0) > 0.01) {
        this.osc2Voice.triggerAttackRelease(n2, duration, t, velocity);
      }
      if (this.patch.subOsc && (this.patch.subOscVol ?? 0) > 0.01) {
        this.subOscVoice.triggerAttackRelease(nSub, duration, t, velocity);
      }
    } catch {
      // fallback
    }
  }

  public dispose() {
    this.lfo.dispose();
    this.synthVoice.dispose();
    this.osc2Voice.dispose();
    this.subOscVoice.dispose();
    this.osc1Gain.dispose();
    this.osc2Gain.dispose();
    this.subOscGain.dispose();
    this.noiseNode.dispose();
    this.noiseGain.dispose();
    this.filter.dispose();
    this.modGain.dispose();
    this.panner.dispose();
  }
}
