/**
 * BeatForge Studio - Virtual Instrument Engine
 * High quality synthesis for 15+ playable instruments
 */
import * as Tone from 'tone';
import { InstrumentId } from '../types/daw';

export interface ADSREnvelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export class InstrumentInstance {
  public id: InstrumentId;
  public name: string;
  private outputNode: Tone.Gain;
  private synthNode: Tone.PolySynth | Tone.MonoSynth | Tone.PluckSynth | Tone.FMSynth | Tone.AMSynth | Tone.NoiseSynth;
  private filter?: Tone.Filter;
  private fxNodes: Tone.ToneAudioNode[] = [];
  private customAdsr: ADSREnvelope;

  constructor(id: InstrumentId, outputNode: Tone.Gain) {
    this.id = id;
    this.name = this.getInstrumentName(id);
    this.outputNode = outputNode;
    this.customAdsr = this.getDefaultADSR(id);
    this.synthNode = this.buildSynth(id);
  }

  private getInstrumentName(id: InstrumentId): string {
    const names: Record<InstrumentId, string> = {
      'grand-piano': 'Grand Piano',
      'electric-piano': 'Electric Piano (Rhodes)',
      'acoustic-guitar': 'Acoustic Guitar',
      'electric-guitar': 'Electric Guitar',
      'bass-guitar': 'Electric Bass',
      'sub-808': '808 Sub-Bass',
      'lead-synth': 'Cyber Lead Synth',
      'pad-synth': 'Celestial Pad',
      'strings': 'Symphonic Strings',
      'violin': 'Solo Violin',
      'flute': 'Studio Flute',
      'saxophone': 'Jazz Saxophone',
      'organ': 'B3 Tonewheel Organ',
      'orchestral': 'Orchestral Brass & Stabs',
      'sound-fx': 'Sci-Fi Sound FX'
    };
    return names[id] || 'Synthesizer';
  }

  private getDefaultADSR(id: InstrumentId): ADSREnvelope {
    switch (id) {
      case 'grand-piano':
        return { attack: 0.005, decay: 1.2, sustain: 0.2, release: 0.8 };
      case 'electric-piano':
        return { attack: 0.008, decay: 1.5, sustain: 0.35, release: 1.0 };
      case 'acoustic-guitar':
        return { attack: 0.004, decay: 0.8, sustain: 0.1, release: 0.4 };
      case 'electric-guitar':
        return { attack: 0.005, decay: 0.9, sustain: 0.3, release: 0.5 };
      case 'bass-guitar':
        return { attack: 0.01, decay: 0.6, sustain: 0.5, release: 0.3 };
      case 'sub-808':
        return { attack: 0.01, decay: 1.8, sustain: 0.6, release: 0.4 };
      case 'lead-synth':
        return { attack: 0.02, decay: 0.4, sustain: 0.7, release: 0.3 };
      case 'pad-synth':
        return { attack: 0.6, decay: 2.0, sustain: 0.8, release: 2.2 };
      case 'strings':
        return { attack: 0.35, decay: 1.4, sustain: 0.85, release: 1.2 };
      case 'violin':
        return { attack: 0.15, decay: 0.8, sustain: 0.8, release: 0.5 };
      case 'flute':
        return { attack: 0.08, decay: 0.3, sustain: 0.7, release: 0.4 };
      case 'saxophone':
        return { attack: 0.05, decay: 0.4, sustain: 0.75, release: 0.3 };
      case 'organ':
        return { attack: 0.005, decay: 0.1, sustain: 1.0, release: 0.15 };
      case 'orchestral':
        return { attack: 0.08, decay: 0.8, sustain: 0.6, release: 0.9 };
      case 'sound-fx':
        return { attack: 0.1, decay: 0.8, sustain: 0.4, release: 1.5 };
      default:
        return { attack: 0.05, decay: 0.5, sustain: 0.5, release: 0.5 };
    }
  }

  private buildSynth(id: InstrumentId): any {
    switch (id) {
      case 'grand-piano': {
        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'triangle8' },
          envelope: {
            attack: this.customAdsr.attack,
            decay: this.customAdsr.decay,
            sustain: this.customAdsr.sustain,
            release: this.customAdsr.release
          }
        });
        const filter = new Tone.Filter(3500, 'lowpass');
        synth.connect(filter);
        filter.connect(this.outputNode);
        this.filter = filter;
        return synth;
      }

      case 'electric-piano': {
        const synth = new Tone.PolySynth(Tone.FMSynth, {
          harmonicity: 3.01,
          modulationIndex: 2.5,
          oscillator: { type: 'sine' },
          envelope: {
            attack: this.customAdsr.attack,
            decay: this.customAdsr.decay,
            sustain: this.customAdsr.sustain,
            release: this.customAdsr.release
          },
          modulation: { type: 'triangle' },
          modulationEnvelope: { attack: 0.01, decay: 0.8, sustain: 0.1, release: 0.8 }
        });
        const chorus = new Tone.Chorus(2.5, 3.5, 0.4).start();
        synth.connect(chorus);
        chorus.connect(this.outputNode);
        this.fxNodes.push(chorus);
        return synth;
      }

      case 'acoustic-guitar': {
        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sawtooth4' },
          envelope: {
            attack: this.customAdsr.attack,
            decay: this.customAdsr.decay,
            sustain: this.customAdsr.sustain,
            release: this.customAdsr.release
          }
        });
        const filter = new Tone.Filter(2200, 'lowpass');
        synth.connect(filter);
        filter.connect(this.outputNode);
        this.fxNodes.push(filter);
        return synth;
      }

      case 'electric-guitar': {
        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
          envelope: {
            attack: this.customAdsr.attack,
            decay: this.customAdsr.decay,
            sustain: this.customAdsr.sustain,
            release: this.customAdsr.release
          }
        });
        const dist = new Tone.Distortion(0.4);
        const filter = new Tone.Filter(2800, 'lowpass');
        synth.connect(dist);
        dist.connect(filter);
        filter.connect(this.outputNode);
        this.fxNodes.push(dist, filter);
        return synth;
      }

      case 'bass-guitar': {
        const synth = new Tone.PolySynth(Tone.MonoSynth, {
          oscillator: { type: 'triangle' },
          envelope: {
            attack: this.customAdsr.attack,
            decay: this.customAdsr.decay,
            sustain: this.customAdsr.sustain,
            release: this.customAdsr.release
          },
          filterEnvelope: {
            attack: 0.01,
            decay: 0.3,
            sustain: 0.2,
            release: 0.2,
            baseFrequency: 80,
            octaves: 3
          }
        });
        synth.connect(this.outputNode);
        return synth;
      }

      case 'sub-808': {
        const synth = new Tone.PolySynth(Tone.MonoSynth, {
          oscillator: { type: 'sine' },
          envelope: {
            attack: this.customAdsr.attack,
            decay: this.customAdsr.decay,
            sustain: this.customAdsr.sustain,
            release: this.customAdsr.release
          },
          filterEnvelope: {
            attack: 0.005,
            decay: 0.4,
            sustain: 0.1,
            release: 0.3,
            baseFrequency: 45,
            octaves: 2
          }
        });
        const drive = new Tone.Distortion(0.25);
        synth.connect(drive);
        drive.connect(this.outputNode);
        this.fxNodes.push(drive);
        return synth;
      }

      case 'lead-synth': {
        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'fatsawtooth', count: 3, spread: 25 },
          envelope: {
            attack: this.customAdsr.attack,
            decay: this.customAdsr.decay,
            sustain: this.customAdsr.sustain,
            release: this.customAdsr.release
          }
        });
        const filter = new Tone.Filter(4500, 'lowpass');
        synth.connect(filter);
        filter.connect(this.outputNode);
        this.fxNodes.push(filter);
        return synth;
      }

      case 'pad-synth': {
        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'fattriangle', count: 4, spread: 35 },
          envelope: {
            attack: this.customAdsr.attack,
            decay: this.customAdsr.decay,
            sustain: this.customAdsr.sustain,
            release: this.customAdsr.release
          }
        });
        const chorus = new Tone.Chorus(1.5, 4.0, 0.6).start();
        synth.connect(chorus);
        chorus.connect(this.outputNode);
        this.fxNodes.push(chorus);
        return synth;
      }

      case 'strings': {
        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sawtooth8' },
          envelope: {
            attack: this.customAdsr.attack,
            decay: this.customAdsr.decay,
            sustain: this.customAdsr.sustain,
            release: this.customAdsr.release
          }
        });
        const filter = new Tone.Filter(3200, 'lowpass');
        synth.connect(filter);
        filter.connect(this.outputNode);
        this.fxNodes.push(filter);
        return synth;
      }

      case 'violin': {
        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sawtooth' },
          envelope: {
            attack: this.customAdsr.attack,
            decay: this.customAdsr.decay,
            sustain: this.customAdsr.sustain,
            release: this.customAdsr.release
          }
        });
        const vibrato = new Tone.Vibrato(5, 0.2);
        const filter = new Tone.Filter(2800, 'lowpass');
        synth.connect(vibrato);
        vibrato.connect(filter);
        filter.connect(this.outputNode);
        this.fxNodes.push(vibrato, filter);
        return synth;
      }

      case 'flute': {
        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sine' },
          envelope: {
            attack: this.customAdsr.attack,
            decay: this.customAdsr.decay,
            sustain: this.customAdsr.sustain,
            release: this.customAdsr.release
          }
        });
        const vibrato = new Tone.Vibrato(4.5, 0.15);
        synth.connect(vibrato);
        vibrato.connect(this.outputNode);
        this.fxNodes.push(vibrato);
        return synth;
      }

      case 'saxophone': {
        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'square4' },
          envelope: {
            attack: this.customAdsr.attack,
            decay: this.customAdsr.decay,
            sustain: this.customAdsr.sustain,
            release: this.customAdsr.release
          }
        });
        const filter = new Tone.Filter(2400, 'lowpass');
        synth.connect(filter);
        filter.connect(this.outputNode);
        this.fxNodes.push(filter);
        return synth;
      }

      case 'organ': {
        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'pulse', width: 0.4 },
          envelope: {
            attack: this.customAdsr.attack,
            decay: this.customAdsr.decay,
            sustain: this.customAdsr.sustain,
            release: this.customAdsr.release
          }
        });
        const tremolo = new Tone.Tremolo(6, 0.4).start();
        synth.connect(tremolo);
        tremolo.connect(this.outputNode);
        this.fxNodes.push(tremolo);
        return synth;
      }

      case 'orchestral': {
        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'fatsawtooth', count: 4, spread: 30 },
          envelope: {
            attack: this.customAdsr.attack,
            decay: this.customAdsr.decay,
            sustain: this.customAdsr.sustain,
            release: this.customAdsr.release
          }
        });
        synth.connect(this.outputNode);
        return synth;
      }

      case 'sound-fx': {
        const synth = new Tone.PolySynth(Tone.FMSynth, {
          harmonicity: 8.5,
          modulationIndex: 12,
          oscillator: { type: 'sawtooth' },
          envelope: {
            attack: this.customAdsr.attack,
            decay: this.customAdsr.decay,
            sustain: this.customAdsr.sustain,
            release: this.customAdsr.release
          }
        });
        const phaser = new Tone.Phaser({ frequency: 2, octaves: 4, baseFrequency: 300 });
        synth.connect(phaser);
        phaser.connect(this.outputNode);
        this.fxNodes.push(phaser);
        return synth;
      }

      default: {
        const synth = new Tone.PolySynth(Tone.Synth);
        synth.connect(this.outputNode);
        return synth;
      }
    }
  }

  public triggerAttack(note: string, time?: number, velocity: number = 0.8) {
    try {
      const t = time !== undefined ? time : Tone.now();
      if ('triggerAttack' in this.synthNode) {
        (this.synthNode as any).triggerAttack(note, t, velocity);
      }
    } catch {
      // Audio node fallback
    }
  }

  public triggerRelease(note: string, time?: number) {
    try {
      const t = time !== undefined ? time : Tone.now();
      if ('triggerRelease' in this.synthNode) {
        (this.synthNode as any).triggerRelease(note, t);
      }
    } catch {
      // Audio node fallback
    }
  }

  public triggerAttackRelease(note: string, duration: string | number, time?: number, velocity: number = 0.8) {
    try {
      const t = time !== undefined ? time : Tone.now();
      if ('triggerAttackRelease' in this.synthNode) {
        (this.synthNode as any).triggerAttackRelease(note, duration, t, velocity);
      }
    } catch {
      // fallback
    }
  }

  public updateADSR(adsr: Partial<ADSREnvelope>) {
    this.customAdsr = { ...this.customAdsr, ...adsr };
    if ('set' in this.synthNode && (this.synthNode as any).set) {
      try {
        (this.synthNode as any).set({
          envelope: {
            attack: this.customAdsr.attack,
            decay: this.customAdsr.decay,
            sustain: this.customAdsr.sustain,
            release: this.customAdsr.release
          }
        });
      } catch {
        // ignore set errors on specialized nodes
      }
    }
  }

  public getADSR(): ADSREnvelope {
    return { ...this.customAdsr };
  }

  public dispose() {
    try {
      this.synthNode.dispose();
      if (this.filter) this.filter.dispose();
      for (const node of this.fxNodes) {
        node.dispose();
      }
      this.fxNodes = [];
    } catch {
      // disposal safety
    }
  }
}
