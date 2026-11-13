/**
 * BeatForge Studio - Central Audio Engine & Transport Coordinator
 * Built on Web Audio API and Tone.js
 */
import * as Tone from 'tone';
import {
  DAWProject,
  Track,
  DrumSoundId,
  Note,
  MasteringSettings,
  AutomationClip
} from '../types/daw';
import { DrumEngine } from './drums';
import { InstrumentInstance } from './instruments';
import { BeatForgeModularSynth } from './synthEngine';
import { AutoTuneProcessor } from './autotune';

export interface ChannelStrip {
  trackId: string;
  inputNode: Tone.Gain;
  autoTune?: AutoTuneProcessor;
  autoTuneActive: boolean;
  filter: Tone.Filter;
  distortion: Tone.Distortion;
  chorus: Tone.Chorus;
  phaser: Tone.Phaser;
  eq: Tone.EQ3;
  compressor: Tone.Compressor;
  delay: Tone.FeedbackDelay;
  reverb: Tone.Reverb;
  widener: Tone.StereoWidener;
  panner: Tone.Panner;
  channelLimiter: Tone.Limiter;
  volume: Tone.Volume;
  meter: Tone.Meter;
  instrument?: InstrumentInstance;
  modularSynth?: BeatForgeModularSynth;
  drumEngine?: DrumEngine;
}

export class AudioEngine {
  private static instance: AudioEngine | null = null;

  // Master & Mastering bus
  public masterHpf!: Tone.Filter;
  public masterEq!: Tone.EQ3;
  public masterAirFilter!: Tone.Filter;
  public masterSaturation!: Tone.Distortion;
  public masterCompressor!: Tone.Compressor;
  public masterWidener!: Tone.StereoWidener;
  public masterGain!: Tone.Volume;
  public masterMasteringTrim!: Tone.Volume;
  public masterLimiter!: Tone.Limiter;
  public masterMeter!: Tone.Meter;
  public masterMeterLeft!: Tone.Meter;
  public masterMeterRight!: Tone.Meter;
  private masterSplitter!: Tone.Split;
  public masterWaveformAnalyser!: AnalyserNode;

  // Metronome
  public metronomeGain!: Tone.Gain;
  public isMetronomeEnabled: boolean = false;
  private metronomeTickHigh!: Tone.Synth;
  private metronomeTickLow!: Tone.Synth;

  // Channel strips
  public channels: Map<string, ChannelStrip> = new Map();

  // State
  public isInitialized: boolean = false;
  public isPlaying: boolean = false;
  public isRecording: boolean = false;
  public isCountIn: boolean = false;
  public bpm: number = 128;
  public timeSignature: [number, number] = [4, 4];
  public loopEnabled: boolean = true;
  public loopStartBar: number = 0;
  public loopEndBar: number = 4;
  public currentBarPosition: number = 0;

  // Scheduling & Diffing
  private subscribers: Set<() => void> = new Set();
  private activeProject: DAWProject | null = null;
  private lastScheduleSignature: string = '';

  private constructor() {
    this.initMasterNodes();
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  /**
   * Synchronously initialize Master bus + Mastering DSP chain + Stereo Meters
   */
  private initMasterNodes() {
    this.masterHpf = new Tone.Filter({ frequency: 24, type: 'highpass', rolloff: -12 });
    this.masterEq = new Tone.EQ3({ low: 0, mid: 0, high: 0 });
    this.masterAirFilter = new Tone.Filter({ frequency: 12000, type: 'highshelf', gain: 0 });
    this.masterSaturation = new Tone.Distortion({ distortion: 0.15, wet: 0 });
    this.masterCompressor = new Tone.Compressor({ threshold: -12, ratio: 2, attack: 0.015, release: 0.2 });
    this.masterWidener = new Tone.StereoWidener(0.5);
    this.masterGain = new Tone.Volume(0);
    this.masterMasteringTrim = new Tone.Volume(0);
    this.masterLimiter = new Tone.Limiter(-0.2);

    this.masterMeter = new Tone.Meter({ smoothing: 0.8 });
    this.masterMeterLeft = new Tone.Meter({ smoothing: 0.78 });
    this.masterMeterRight = new Tone.Meter({ smoothing: 0.78 });
    this.masterSplitter = new Tone.Split();

    // Signal flow: masterEq -> masterHpf -> masterAirFilter -> masterSaturation -> masterCompressor -> masterWidener -> masterGain -> masterMasteringTrim -> masterLimiter -> output + meters
    this.masterEq.connect(this.masterHpf);
    this.masterHpf.connect(this.masterAirFilter);
    this.masterAirFilter.connect(this.masterSaturation);
    this.masterSaturation.connect(this.masterCompressor);
    this.masterCompressor.connect(this.masterWidener);
    this.masterWidener.connect(this.masterGain);
    this.masterGain.connect(this.masterMasteringTrim);
    this.masterMasteringTrim.connect(this.masterLimiter);

    this.masterLimiter.connect(this.masterMeter);
    this.masterLimiter.connect(this.masterSplitter);
    this.masterSplitter.connect(this.masterMeterLeft, 0, 0);
    this.masterSplitter.connect(this.masterMeterRight, 1, 0);
    this.masterLimiter.toDestination();

    // Metronome bypasses mastering compression/EQ directly to masterGain
    this.metronomeGain = new Tone.Gain(0.55).connect(this.masterLimiter);
    this.metronomeTickHigh = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 }
    }).connect(this.metronomeGain);

    this.metronomeTickLow = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 }
    }).connect(this.metronomeGain);

    Tone.getTransport().bpm.value = this.bpm;
    Tone.getTransport().timeSignature = this.timeSignature[0];
  }

  /**
   * Resume Tone.js AudioContext upon first user interaction
   */
  public async initAudioContext(): Promise<void> {
    if (this.isInitialized) return;

    await Tone.start();
    const ctx = Tone.getContext();
    if (ctx.state !== 'running') {
      await ctx.resume();
    }

    if (!this.masterWaveformAnalyser && ctx.rawContext) {
      this.masterWaveformAnalyser = ctx.rawContext.createAnalyser();
      this.masterWaveformAnalyser.fftSize = 1024;
      this.masterWaveformAnalyser.smoothingTimeConstant = 0.82;
      this.masterLimiter.connect(this.masterWaveformAnalyser);
    }

    this.isInitialized = true;
    this.setupTransportTicks();
  }

  /**
   * Apply Mastering Studio DSP parameters in real time
   */
  public updateMastering(settings?: MasteringSettings) {
    if (!settings || !settings.enabled || settings.bypassed) {
      this.masterHpf.frequency.value = 20;
      this.masterAirFilter.gain.value = 0;
      this.masterSaturation.wet.value = 0;
      this.masterCompressor.threshold.value = 0;
      this.masterCompressor.ratio.value = 1;
      this.masterWidener.width.value = 0.5;
      this.masterMasteringTrim.volume.value = 0;
      if (this.activeProject) {
        this.masterEq.low.value = this.activeProject.master.eqLow;
        this.masterEq.mid.value = this.activeProject.master.eqMid;
        this.masterEq.high.value = this.activeProject.master.eqHigh;
        this.masterLimiter.threshold.value = this.activeProject.master.limiterThreshold;
      }
      return;
    }

    const baseEq = this.activeProject?.master || { eqLow: 0, eqMid: 0, eqHigh: 0 };
    this.masterHpf.frequency.value = Math.max(20, Math.min(120, settings.eqLowCut || 24));
    this.masterEq.low.value = baseEq.eqLow + (settings.eqLowGain || 0);
    this.masterEq.mid.value = baseEq.eqMid + (settings.eqMidGain || 0);
    this.masterEq.high.value = baseEq.eqHigh + (settings.eqHighGain || 0);
    this.masterAirFilter.gain.value = settings.eqAirGain || 0;
    this.masterSaturation.wet.value = Math.max(0, Math.min(1, settings.tapeSaturation || 0));
    this.masterCompressor.threshold.value = Math.max(-60, Math.min(0, settings.compMidThreshold ?? -14));
    this.masterCompressor.ratio.value = Math.max(1, Math.min(20, settings.compMidRatio ?? 2.5));
    // UI stereoWidth is 0..2 (1 = normal) -> Tone.StereoWidener expects 0..1 (0.5 = normal)
    this.masterWidener.width.value = Math.max(0, Math.min(1, (settings.stereoWidth ?? 1) * 0.5));
    this.masterMasteringTrim.volume.value = Math.max(-12, Math.min(12, settings.limiterGain || 0));
    this.masterLimiter.threshold.value = Math.max(-12, Math.min(0, settings.limiterCeiling ?? -0.2));
  }

  /**
   * Build deterministic signature for events that require Transport rescheduling
   */
  private computeScheduleSignature(project: DAWProject): string {
    return JSON.stringify({
      bpm: project.bpm,
      ts: project.timeSignature,
      swing: project.swing,
      loop: [project.loopEnabled, project.loopStartBar, project.loopEndBar],
      auto: project.automationClips,
      tracks: project.tracks.map((t) => ({
        id: t.id,
        type: t.type,
        muted: t.muted,
        solo: t.solo,
        inst: t.instrumentId,
        hasPatch: !!t.synthPatch,
        clips: t.clips.map((c: any) => ({
          id: c.id,
          startBar: c.startBar,
          durationBars: c.durationBars,
          offset: c.offset,
          cropStart: c.cropStart,
          cropEnd: c.cropEnd,
          playbackRate: c.playbackRate,
          pitchShift: c.pitchShift,
          reversed: c.reversed,
          fadeIn: c.fadeIn,
          fadeOut: c.fadeOut,
          gain: c.gain,
          hasBuffer: !!c.buffer,
          notes: c.notes,
          drumSteps: c.drumSteps
        }))
      }))
    });
  }

  /**
   * Synchronize engine channels with active project tracks without interrupting transport on knob moves
   */
  public syncProject(project: DAWProject) {
    this.activeProject = project;
    this.bpm = project.bpm;
    this.timeSignature = project.timeSignature;
    this.loopEnabled = project.loopEnabled;
    this.loopStartBar = project.loopStartBar;
    this.loopEndBar = project.loopEndBar;

    Tone.getTransport().bpm.value = project.bpm;
    Tone.getTransport().timeSignature = project.timeSignature[0];
    Tone.getTransport().swing = Math.max(0, Math.min(1, project.swing || 0));
    Tone.getTransport().swingSubdivision = '16n';

    if (this.masterGain && this.masterEq && this.masterLimiter) {
      this.masterGain.volume.value = project.master.volume;
      this.updateMastering(project.mastering);
    }

    // Clean up channels that no longer exist
    const projectTrackIds = new Set(project.tracks.map((t) => t.id));
    for (const [trackId, channel] of this.channels.entries()) {
      if (!projectTrackIds.has(trackId)) {
        this.disposeChannel(channel);
        this.channels.delete(trackId);
      }
    }

    const anyTrackSolo = project.tracks.some((t) => t.solo);

    // Build or update channels
    for (const track of project.tracks) {
      if (!this.channels.has(track.id)) {
        this.createChannel(track, anyTrackSolo);
      } else {
        this.updateChannel(track, anyTrackSolo);
      }
    }

    const nextSig = this.computeScheduleSignature(project);
    if (nextSig !== this.lastScheduleSignature) {
      this.lastScheduleSignature = nextSig;
      this.rebuildSchedule();
    }
  }

  private createChannel(track: Track, anyTrackSolo: boolean = false): ChannelStrip {
    const inputNode = new Tone.Gain(1);
    const filter = new Tone.Filter({
      frequency: track.effects.filterCutoff,
      Q: track.effects.filterResonance,
      type: 'lowpass'
    });
    const distortion = new Tone.Distortion({
      distortion: track.effects.distortionDrive,
      wet: track.effects.distortionWet
    });
    const chorus = new Tone.Chorus({
      frequency: 1.8,
      delayTime: 3.5,
      depth: 0.6,
      wet: track.effects.chorusWet || 0
    }).start();
    const phaser = new Tone.Phaser({
      frequency: 0.8,
      octaves: 3,
      baseFrequency: 400,
      wet: track.effects.phaserWet || 0
    });
    const eq = new Tone.EQ3({
      low: track.effects.eqLow,
      mid: track.effects.eqMid,
      high: track.effects.eqHigh
    });
    const compressor = new Tone.Compressor({
      threshold: track.effects.compThreshold,
      ratio: track.effects.compRatio,
      attack: 0.01,
      release: 0.15
    });
    const delay = new Tone.FeedbackDelay({
      delayTime: track.effects.delayTime,
      feedback: track.effects.delayFeedback,
      wet: track.effects.delayWet
    });
    const reverb = new Tone.Reverb({
      decay: Math.max(0.5, track.effects.reverbDecay),
      wet: track.effects.reverbWet
    });
    const widener = new Tone.StereoWidener(Math.max(0, Math.min(1, (track.effects.stereoWidth ?? 1) * 0.5)));
    const panner = new Tone.Panner(track.pan);
    const channelLimiter = new Tone.Limiter(track.effects.limiterThreshold ?? 0);

    const isSilenced = track.muted || (anyTrackSolo && !track.solo);
    const volume = new Tone.Volume(isSilenced ? -Infinity : track.volume);
    const meter = new Tone.Meter({ smoothing: 0.8 });

    // Signal flow
    let autoTune: AutoTuneProcessor | undefined;
    const autoTuneActive = Boolean(track.type === 'audio' && track.autoTune?.enabled && !track.autoTune?.bypassed);
    if (autoTuneActive) {
      autoTune = new AutoTuneProcessor(track.autoTune);
      inputNode.connect(autoTune.inputNode);
      autoTune.outputNode.connect(filter);
    } else {
      inputNode.connect(filter);
    }

    filter.connect(distortion);
    distortion.connect(chorus);
    chorus.connect(phaser);
    phaser.connect(eq);
    eq.connect(compressor);
    compressor.connect(delay);
    delay.connect(reverb);
    reverb.connect(widener);
    widener.connect(panner);
    panner.connect(channelLimiter);
    channelLimiter.connect(volume);
    volume.connect(meter);
    volume.connect(this.masterEq);

    let instrument: InstrumentInstance | undefined;
    let modularSynth: BeatForgeModularSynth | undefined;
    let drumEngine: DrumEngine | undefined;

    if (track.type === 'midi') {
      if (track.synthPatch) {
        modularSynth = new BeatForgeModularSynth(inputNode, track.synthPatch);
      } else {
        instrument = new InstrumentInstance(track.instrumentId, inputNode);
      }
    } else if (track.type === 'drum') {
      drumEngine = new DrumEngine(inputNode);
    }

    const channel: ChannelStrip = {
      trackId: track.id,
      inputNode,
      autoTune,
      autoTuneActive,
      filter,
      distortion,
      chorus,
      phaser,
      eq,
      compressor,
      delay,
      reverb,
      widener,
      panner,
      channelLimiter,
      volume,
      meter,
      instrument,
      modularSynth,
      drumEngine
    };

    this.channels.set(track.id, channel);
    return channel;
  }

  public updateChannel(track: Track, anyTrackSolo: boolean = false) {
    const channel = this.channels.get(track.id);
    if (!channel) return;

    const isSilenced = track.muted || (anyTrackSolo && !track.solo);
    channel.volume.volume.value = isSilenced ? -Infinity : track.volume;
    channel.panner.pan.value = track.pan;

    channel.eq.low.value = track.effects.eqLow;
    channel.eq.mid.value = track.effects.eqMid;
    channel.eq.high.value = track.effects.eqHigh;

    channel.compressor.threshold.value = track.effects.compThreshold;
    channel.compressor.ratio.value = track.effects.compRatio;

    channel.reverb.wet.value = track.effects.reverbWet;
    channel.reverb.decay = Math.max(0.5, track.effects.reverbDecay);

    channel.delay.wet.value = track.effects.delayWet;
    channel.delay.feedback.value = track.effects.delayFeedback;

    channel.distortion.distortion = track.effects.distortionDrive;
    channel.distortion.wet.value = track.effects.distortionWet;

    channel.chorus.wet.value = track.effects.chorusWet || 0;
    channel.phaser.wet.value = track.effects.phaserWet || 0;
    channel.widener.width.value = Math.max(0, Math.min(1, (track.effects.stereoWidth ?? 1) * 0.5));
    channel.channelLimiter.threshold.value = track.effects.limiterThreshold ?? 0;

    channel.filter.frequency.value = track.effects.filterCutoff;
    channel.filter.Q.value = track.effects.filterResonance;

    // Audio track Auto-Tune insert toggle/update
    const shouldAutoTune = Boolean(track.type === 'audio' && track.autoTune?.enabled && !track.autoTune?.bypassed);
    if (shouldAutoTune && !channel.autoTune) {
      channel.autoTune = new AutoTuneProcessor(track.autoTune);
      channel.inputNode.disconnect(channel.filter);
      channel.inputNode.connect(channel.autoTune.inputNode);
      channel.autoTune.outputNode.connect(channel.filter);
      channel.autoTuneActive = true;
    } else if (shouldAutoTune && channel.autoTune && track.autoTune) {
      channel.autoTune.updateSettings(track.autoTune);
      channel.autoTuneActive = true;
    } else if (!shouldAutoTune && channel.autoTune && channel.autoTuneActive) {
      channel.inputNode.disconnect(channel.autoTune.inputNode);
      channel.autoTune.outputNode.disconnect(channel.filter);
      channel.inputNode.connect(channel.filter);
      channel.autoTune.dispose();
      channel.autoTune = undefined;
      channel.autoTuneActive = false;
    }

    // MIDI synth/instrument synchronization
    if (track.type === 'midi') {
      if (track.synthPatch) {
        if (channel.instrument) {
          channel.instrument.dispose();
          channel.instrument = undefined;
        }
        if (!channel.modularSynth) {
          channel.modularSynth = new BeatForgeModularSynth(channel.inputNode, track.synthPatch);
        } else {
          channel.modularSynth.applyPatch(track.synthPatch);
        }
      } else {
        if (channel.modularSynth) {
          channel.modularSynth.dispose();
          channel.modularSynth = undefined;
        }
        if (!channel.instrument || channel.instrument.id !== track.instrumentId) {
          if (channel.instrument) channel.instrument.dispose();
          channel.instrument = new InstrumentInstance(track.instrumentId, channel.inputNode);
        }
      }
    }
  }

  private disposeChannel(channel: ChannelStrip) {
    channel.inputNode.dispose();
    channel.filter.dispose();
    channel.distortion.dispose();
    channel.chorus.dispose();
    channel.phaser.dispose();
    channel.eq.dispose();
    channel.compressor.dispose();
    channel.delay.dispose();
    channel.reverb.dispose();
    channel.widener.dispose();
    channel.panner.dispose();
    channel.channelLimiter.dispose();
    channel.volume.dispose();
    channel.meter.dispose();
    if (channel.autoTune) channel.autoTune.dispose();
    if (channel.instrument) channel.instrument.dispose();
    if (channel.modularSynth) channel.modularSynth.dispose();
  }

  /**
   * Set up high-precision tick listener for metronome and position notification
   */
  private setupTransportTicks() {
    Tone.getTransport().scheduleRepeat((time) => {
      const sixteenthsPerBeat = 4;
      const beatsPerBar = this.timeSignature[0];
      const sixteenthsPerBar = beatsPerBar * sixteenthsPerBeat;

      const positionStr = Tone.getTransport().position.toString();
      const parts = positionStr.split(':');
      const bar = parseInt(parts[0] || '0', 10);
      const beat = parseInt(parts[1] || '0', 10);
      const sixteenth = parseFloat(parts[2] || '0');

      this.currentBarPosition = bar + beat / beatsPerBar + sixteenth / sixteenthsPerBar;

      if (this.isMetronomeEnabled && this.isPlaying) {
        if (Math.abs(sixteenth) < 0.05) {
          if (beat === 0) {
            this.metronomeTickHigh.triggerAttackRelease('C6', '32n', time, 0.9);
          } else {
            this.metronomeTickLow.triggerAttackRelease('G5', '32n', time, 0.6);
          }
        }
      }

      this.notifySubscribers();
    }, '16n');
  }

  /**
   * Schedule all pattern clips, MIDI notes, drum steps, audio clips, and automation lanes
   */
  public rebuildSchedule() {
    if (!this.activeProject) return;

    Tone.getTransport().cancel();
    this.setupTransportTicks();

    const project = this.activeProject;
    const beatsPerBar = project.timeSignature[0];
    const sixteenthsPerBar = beatsPerBar * 4;

    if (project.loopEnabled) {
      Tone.getTransport().loop = true;
      Tone.getTransport().loopStart = `${project.loopStartBar}:0:0`;
      Tone.getTransport().loopEnd = `${project.loopEndBar}:0:0`;
    } else {
      Tone.getTransport().loop = false;
    }

    for (const track of project.tracks) {
      const channel = this.channels.get(track.id);
      if (!channel) continue;

      for (const clip of track.clips) {
        if ('drumSteps' in clip && clip.drumSteps && channel.drumEngine) {
          this.scheduleDrumClip(clip, channel.drumEngine, clip.startBar, beatsPerBar, sixteenthsPerBar);
        }

        if ('notes' in clip && clip.notes && (channel.modularSynth || channel.instrument)) {
          this.scheduleMidiClip(
            clip,
            (channel.modularSynth || channel.instrument)!,
            clip.startBar,
            sixteenthsPerBar
          );
        }

        if ('buffer' in clip && clip.buffer) {
          this.scheduleAudioClip(clip, channel.inputNode, clip.startBar, beatsPerBar);
        }
      }
    }

    // Schedule automation clips
    if (project.automationClips && project.automationClips.length > 0) {
      for (const autoClip of project.automationClips) {
        this.scheduleAutomationClip(autoClip, beatsPerBar);
      }
    }
  }

  private scheduleAutomationClip(autoClip: AutomationClip, beatsPerBar: number) {
    const channel = this.channels.get(autoClip.trackId);
    if (!channel || !autoClip.points || autoClip.points.length === 0) return;

    const sorted = [...autoClip.points].sort((a, b) => a.bar - b.bar);
    sorted.forEach((pt, idx) => {
      const fullBars = Math.floor(pt.bar);
      const frac = pt.bar - fullBars;
      const beats = Math.floor(frac * beatsPerBar);
      const sixteenths = (frac * beatsPerBar - beats) * 4;
      const timeStr = `${fullBars}:${beats}:${sixteenths.toFixed(2)}`;

      const nextPt = sorted[idx + 1];
      const rampSec = nextPt ? Math.max(0.02, (nextPt.bar - pt.bar) * beatsPerBar * (60 / this.bpm)) : 0.05;

      Tone.getTransport().schedule((time) => {
        const val = Math.max(0, Math.min(1, pt.value));
        if (autoClip.targetParam === 'volume') {
          const db = -48 + val * 54;
          channel.volume.volume.setValueAtTime(db, time);
          if (nextPt) {
            const nextDb = -48 + Math.max(0, Math.min(1, nextPt.value)) * 54;
            channel.volume.volume.linearRampToValueAtTime(nextDb, time + rampSec);
          }
        } else if (autoClip.targetParam === 'pan') {
          const p = val * 2 - 1;
          channel.panner.pan.setValueAtTime(p, time);
          if (nextPt) {
            channel.panner.pan.linearRampToValueAtTime(nextPt.value * 2 - 1, time + rampSec);
          }
        } else if (autoClip.targetParam === 'filterCutoff') {
          const hz = 80 * Math.pow(250, val);
          channel.filter.frequency.setValueAtTime(hz, time);
          if (nextPt) {
            const nextHz = 80 * Math.pow(250, Math.max(0, Math.min(1, nextPt.value)));
            channel.filter.frequency.exponentialRampToValueAtTime(Math.max(40, nextHz), time + rampSec);
          }
        } else if (autoClip.targetParam === 'reverbWet') {
          channel.reverb.wet.setValueAtTime(val, time);
          if (nextPt) channel.reverb.wet.linearRampToValueAtTime(nextPt.value, time + rampSec);
        } else if (autoClip.targetParam === 'delayWet') {
          channel.delay.wet.setValueAtTime(val, time);
          if (nextPt) channel.delay.wet.linearRampToValueAtTime(nextPt.value, time + rampSec);
        }
      }, timeStr);
    });
  }

  private scheduleDrumClip(
    clip: any,
    drumEngine: DrumEngine,
    startBar: number,
    _beatsPerBar: number,
    sixteenthsPerBar: number
  ) {
    const totalBars = clip.durationBars || 2;
    const totalSixteenths = totalBars * sixteenthsPerBar;
    const anyDrumSolo = clip.drumSteps.some((s: any) => s.solo);

    for (const seq of clip.drumSteps) {
      if (seq.muted || (anyDrumSolo && !seq.solo)) continue;
      const stepCount = seq.steps.length;

      for (let s = 0; s < totalSixteenths; s++) {
        const stepIndex = s % stepCount;
        if (seq.steps[stepIndex]) {
          const barOffset = Math.floor(s / sixteenthsPerBar);
          const remSixteenths = s % sixteenthsPerBar;
          const beatOffset = Math.floor(remSixteenths / 4);
          const sixteenthOffset = remSixteenths % 4;

          const timeString = `${startBar + barOffset}:${beatOffset}:${sixteenthOffset}`;
          const vel = seq.velocities ? seq.velocities[stepIndex] : 0.85;
          const pitch = seq.pitch || 0;

          Tone.getTransport().schedule((time) => {
            drumEngine.triggerSound(seq.soundId, time, vel * seq.volume, pitch, seq.customSampleUrl);
          }, timeString);
        }
      }
    }
  }

  private scheduleMidiClip(
    clip: any,
    instrument: InstrumentInstance | BeatForgeModularSynth,
    startBar: number,
    sixteenthsPerBar: number
  ) {
    for (const note of clip.notes as Note[]) {
      const barOffset = Math.floor(note.time / sixteenthsPerBar);
      const remSixteenths = note.time % sixteenthsPerBar;
      const beatOffset = Math.floor(remSixteenths / 4);
      const sixteenthOffset = remSixteenths % 4;

      const timeString = `${startBar + barOffset}:${beatOffset}:${sixteenthOffset}`;
      const durationSeconds = Math.max(0.04, (note.duration * (60 / this.bpm)) / 4);

      Tone.getTransport().schedule((time) => {
        instrument.triggerAttackRelease(note.pitch, durationSeconds, time, note.velocity);
      }, timeString);
    }
  }

  private scheduleAudioClip(clip: any, targetInput: Tone.Gain, startBar: number, beatsPerBar: number) {
    const fullBars = Math.floor(startBar);
    const frac = startBar - fullBars;
    const beats = Math.floor(frac * beatsPerBar);
    const sixteenths = (frac * beatsPerBar - beats) * 4;
    const timeString = `${fullBars}:${beats}:${sixteenths.toFixed(2)}`;

    Tone.getTransport().schedule((time) => {
      if (!clip.buffer) return;
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      const source = rawCtx.createBufferSource();

      // Handle reverse safely using cached reversed buffer
      let playBuffer: AudioBuffer = clip.buffer;
      if (clip.reversed) {
        const rev = rawCtx.createBuffer(playBuffer.numberOfChannels, playBuffer.length, playBuffer.sampleRate);
        for (let ch = 0; ch < playBuffer.numberOfChannels; ch++) {
          const src = playBuffer.getChannelData(ch);
          const dst = rev.getChannelData(ch);
          for (let i = 0, len = src.length; i < len; i++) {
            dst[i] = src[len - 1 - i];
          }
        }
        playBuffer = rev;
      }

      source.buffer = playBuffer;

      const rate = clip.playbackRate && clip.playbackRate > 0 ? clip.playbackRate : 1;
      source.playbackRate.value = rate;

      if (clip.pitchShift && Math.abs(clip.pitchShift) > 0.01) {
        source.detune.value = clip.pitchShift * 100;
      }

      const gainNode = rawCtx.createGain();
      const baseGain = clip.gain ?? 1;

      const startOffset = Math.max(0, clip.cropStart ?? clip.offset ?? 0);
      const maxFromCrop =
        clip.cropEnd !== undefined && clip.cropEnd > startOffset
          ? (clip.cropEnd - startOffset) / rate
          : Infinity;
      const timelineDurationSec = (clip.durationBars * (beatsPerBar * (60 / this.bpm))) / rate;
      const availableInBuf = Math.max(0.05, (playBuffer.duration - startOffset) / rate);
      const durationSec = Math.max(0.05, Math.min(timelineDurationSec, maxFromCrop, availableInBuf));

      if (clip.fadeIn && clip.fadeIn > 0) {
        gainNode.gain.setValueAtTime(0, time);
        gainNode.gain.linearRampToValueAtTime(baseGain, time + Math.min(clip.fadeIn, durationSec * 0.5));
      } else {
        gainNode.gain.setValueAtTime(baseGain, time);
      }

      if (clip.fadeOut && clip.fadeOut > 0) {
        const fadeOutDur = Math.min(clip.fadeOut, durationSec * 0.5);
        const fadeStart = Math.max(time, time + durationSec - fadeOutDur);
        gainNode.gain.setValueAtTime(baseGain, fadeStart);
        gainNode.gain.linearRampToValueAtTime(0, time + durationSec);
      }

      source.connect(gainNode);
      gainNode.connect(targetInput.input as unknown as AudioNode);
      source.start(time, startOffset, durationSec);
    }, timeString);
  }

  /**
   * Transport controls
   */
  public async play() {
    await this.initAudioContext();
    Tone.getTransport().start();
    this.isPlaying = true;
    this.notifySubscribers();
  }

  public async playWithCountIn(bars: number = 1) {
    await this.initAudioContext();
    if (bars <= 0) {
      await this.play();
      return;
    }

    this.isCountIn = true;
    this.notifySubscribers();

    const beatsPerBar = this.timeSignature[0];
    const totalBeats = bars * beatsPerBar;
    const beatMs = (60 / this.bpm) * 1000;

    for (let b = 0; b < totalBeats; b++) {
      if (!this.isCountIn) return;
      const isDownbeat = b % beatsPerBar === 0;
      if (isDownbeat) {
        this.metronomeTickHigh.triggerAttackRelease('C6', '32n', undefined, 0.95);
      } else {
        this.metronomeTickLow.triggerAttackRelease('G5', '32n', undefined, 0.65);
      }
      await new Promise((res) => setTimeout(res, beatMs));
    }

    this.isCountIn = false;
    await this.play();
  }

  public pause() {
    this.isCountIn = false;
    Tone.getTransport().pause();
    this.isPlaying = false;
    this.notifySubscribers();
  }

  public stop() {
    this.isCountIn = false;
    Tone.getTransport().stop();
    Tone.getTransport().position = '0:0:0';
    this.currentBarPosition = 0;
    this.isPlaying = false;
    this.isRecording = false;
    this.notifySubscribers();
  }

  public setPosition(bar: number) {
    const beatsPerBar = this.timeSignature[0];
    const clampedBar = Math.max(0, bar);
    const fullBars = Math.floor(clampedBar);
    const fraction = clampedBar - fullBars;
    const beats = Math.floor(fraction * beatsPerBar);
    const sixteenths = Math.floor((fraction * beatsPerBar - beats) * 4);

    Tone.getTransport().position = `${fullBars}:${beats}:${sixteenths}`;
    this.currentBarPosition = clampedBar;
    this.notifySubscribers();
  }

  public setBpm(newBpm: number) {
    this.bpm = Math.max(40, Math.min(300, newBpm));
    if (this.isInitialized) {
      Tone.getTransport().bpm.value = this.bpm;
    }
    this.notifySubscribers();
  }

  public toggleMetronome(): boolean {
    this.isMetronomeEnabled = !this.isMetronomeEnabled;
    this.notifySubscribers();
    return this.isMetronomeEnabled;
  }

  public triggerDirectNote(trackId: string, note: string, velocity: number = 0.8) {
    if (!this.isInitialized) {
      this.initAudioContext().catch(() => {});
    }
    const ch = this.channels.get(trackId);
    if (!ch) return;
    if (ch.modularSynth) {
      ch.modularSynth.triggerAttack(note, undefined, velocity);
    } else if (ch.instrument) {
      ch.instrument.triggerAttack(note, undefined, velocity);
    }
  }

  public releaseDirectNote(trackId: string, note: string) {
    const ch = this.channels.get(trackId);
    if (!ch) return;
    if (ch.modularSynth) {
      ch.modularSynth.triggerRelease(note);
    } else if (ch.instrument) {
      ch.instrument.triggerRelease(note);
    }
  }

  public triggerDirectDrum(
    trackId: string,
    soundId: DrumSoundId,
    velocity: number = 0.85,
    pitch: number = 0,
    customSampleUrl?: string
  ) {
    if (!this.isInitialized) {
      this.initAudioContext().catch(() => {});
    }
    const ch = this.channels.get(trackId);
    if (ch && ch.drumEngine) {
      ch.drumEngine.triggerSound(soundId, undefined, velocity, pitch, customSampleUrl);
    }
  }

  public subscribe(cb: () => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private notifySubscribers() {
    this.subscribers.forEach((cb) => cb());
  }
}
