/**
 * BeatForge Studio - Advanced Real-Time Auto-Tune & Pitch Correction DSP Engine
 * Implements real-time autocorrelation pitch detection, musical scale snapping,
 * retune speed smoothing, vocal doubling, harmonizer, and formant shaping.
 */
import * as Tone from 'tone';
import { AutoTuneSettings } from '../types/daw';

export interface PitchDetectionResult {
  frequency: number; // Hz
  note: string; // e.g. "C4"
  targetNote: string; // e.g. "C#4"
  centsOff: number; // -50 to +50
  correctionCents: number; // amount shifted
  clarity: number; // 0 to 1 confidence
}

export const AUTO_TUNE_PRESETS: Record<string, Partial<AutoTuneSettings>> = {
  'hard-trap': {
    enabled: true,
    bypassed: false,
    retuneSpeedMs: 0,
    humanize: 0,
    flexTune: 0,
    correctionStrength: 1.0,
    pitchDrift: 0,
    mode: 'robotic',
    vocalDoubler: false,
    harmonizer: 'off'
  },
  'modern-rap': {
    enabled: true,
    bypassed: false,
    retuneSpeedMs: 12,
    humanize: 0.15,
    flexTune: 0.1,
    correctionStrength: 0.95,
    pitchDrift: 0.05,
    mode: 'natural',
    vocalDoubler: true,
    vocalDoublerMix: 0.25,
    harmonizer: 'off'
  },
  'melodic-trap': {
    enabled: true,
    bypassed: false,
    retuneSpeedMs: 5,
    humanize: 0.05,
    flexTune: 0.05,
    correctionStrength: 1.0,
    pitchDrift: 0,
    mode: 'robotic',
    vocalDoubler: true,
    vocalDoublerMix: 0.3,
    harmonizer: 'fifth-up',
    harmonizerMix: 0.2
  },
  'natural-vocals': {
    enabled: true,
    bypassed: false,
    retuneSpeedMs: 75,
    humanize: 0.6,
    flexTune: 0.45,
    correctionStrength: 0.75,
    pitchDrift: 0.3,
    mode: 'natural',
    vocalDoubler: false,
    harmonizer: 'off'
  },
  'rnb-smooth': {
    enabled: true,
    bypassed: false,
    retuneSpeedMs: 40,
    humanize: 0.35,
    flexTune: 0.25,
    correctionStrength: 0.85,
    pitchDrift: 0.15,
    mode: 'natural',
    vocalDoubler: true,
    vocalDoublerMix: 0.4,
    harmonizer: 'third-up',
    harmonizerMix: 0.25
  },
  'robotic-vocoder': {
    enabled: true,
    bypassed: false,
    retuneSpeedMs: 0,
    humanize: 0,
    flexTune: 0,
    correctionStrength: 1.0,
    pitchDrift: 0,
    mode: 'robotic',
    vocalDoubler: true,
    vocalDoublerMix: 0.5,
    harmonizer: 'octave-down',
    harmonizerMix: 0.4
  }
};

export class AutoTuneProcessor {
  public inputNode: Tone.Gain;
  public outputNode: Tone.Gain;
  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private pitchShiftNode: Tone.PitchShift;
  private harmonizerShiftNode: Tone.PitchShift;
  private harmonizerGain: Tone.Gain;
  private doublerChorus: Tone.Chorus;
  private doublerGain: Tone.Gain;
  private formantFilter: Tone.Filter;
  private analyser: AnalyserNode;

  public settings: AutoTuneSettings;
  private currentDetectedPitch: PitchDetectionResult = {
    frequency: 0,
    note: '--',
    targetNote: '--',
    centsOff: 0,
    correctionCents: 0,
    clarity: 0
  };

  private currentSmoothedCents: number = 0;
  private analysisIntervalId: number | null = null;
  private subscribers: Set<(result: PitchDetectionResult) => void> = new Set();

  constructor(initialSettings?: Partial<AutoTuneSettings>) {
    this.settings = {
      enabled: true,
      bypassed: false,
      rootKey: 'C',
      scale: 'minor',
      retuneSpeedMs: 15,
      humanize: 0.1,
      flexTune: 0.1,
      correctionStrength: 0.95,
      pitchDrift: 0.05,
      formantCorrection: 0,
      vibratoAmount: 0,
      pitchShiftCents: 0,
      vocalDoubler: false,
      vocalDoublerMix: 0.3,
      harmonizer: 'off',
      harmonizerMix: 0.25,
      mode: 'natural',
      preset: 'modern-rap',
      ...initialSettings
    };

    const rawCtx = Tone.getContext().rawContext as AudioContext;

    this.inputNode = new Tone.Gain(1);
    this.outputNode = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(0);
    this.wetGain = new Tone.Gain(1);

    // Primary pitch correction node
    this.pitchShiftNode = new Tone.PitchShift({
      pitch: 0,
      windowSize: 0.08,
      delayTime: 0
    });

    // Harmonizer pitch shifter
    this.harmonizerShiftNode = new Tone.PitchShift({
      pitch: 7, // default +5th
      windowSize: 0.08
    });
    this.harmonizerGain = new Tone.Gain(0);

    // Vocal Doubler
    this.doublerChorus = new Tone.Chorus(3, 2.5, 0.4).start();
    this.doublerGain = new Tone.Gain(0);

    // Formant Tone Filter
    this.formantFilter = new Tone.Filter({
      frequency: 2800,
      type: 'peaking',
      gain: 0,
      Q: 1.5
    });

    // Analyser node for real-time autocorrelation
    this.analyser = rawCtx.createAnalyser();
    this.analyser.fftSize = 2048;

    // Connect node graph
    // Input -> Analyser
    // Input -> dryGain -> outputNode
    // Input -> pitchShiftNode -> formantFilter -> wetGain -> outputNode
    // pitchShiftNode -> harmonizerShiftNode -> harmonizerGain -> outputNode
    // pitchShiftNode -> doublerChorus -> doublerGain -> outputNode
    this.inputNode.connect(this.dryGain);
    this.dryGain.connect(this.outputNode);

    this.inputNode.connect(this.pitchShiftNode);
    this.pitchShiftNode.connect(this.formantFilter);
    this.formantFilter.connect(this.wetGain);
    this.wetGain.connect(this.outputNode);

    this.pitchShiftNode.connect(this.harmonizerShiftNode);
    this.harmonizerShiftNode.connect(this.harmonizerGain);
    this.harmonizerGain.connect(this.outputNode);

    this.pitchShiftNode.connect(this.doublerChorus);
    this.doublerChorus.connect(this.doublerGain);
    this.doublerGain.connect(this.outputNode);

    // Raw connection to analyser
    (this.inputNode.input as unknown as AudioNode).connect(this.analyser);

    this.updateNodesFromSettings();
    this.startRealtimeDetection();
  }

  public updateSettings(newSettings: Partial<AutoTuneSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    this.updateNodesFromSettings();
  }

  private updateNodesFromSettings() {
    if (!this.settings.enabled || this.settings.bypassed) {
      this.dryGain.gain.rampTo(1, 0.05);
      this.wetGain.gain.rampTo(0, 0.05);
      this.harmonizerGain.gain.rampTo(0, 0.05);
      this.doublerGain.gain.rampTo(0, 0.05);
      return;
    }

    this.dryGain.gain.rampTo(0, 0.05);
    this.wetGain.gain.rampTo(1, 0.05);

    // Doubler mix
    this.doublerGain.gain.rampTo(this.settings.vocalDoubler ? this.settings.vocalDoublerMix : 0, 0.05);

    // Harmonizer
    if (this.settings.harmonizer !== 'off') {
      let intervalSemitones = 0;
      switch (this.settings.harmonizer) {
        case 'octave-up':
          intervalSemitones = 12;
          break;
        case 'octave-down':
          intervalSemitones = -12;
          break;
        case 'third-up':
          intervalSemitones = 4;
          break;
        case 'fifth-up':
          intervalSemitones = 7;
          break;
      }
      this.harmonizerShiftNode.pitch = intervalSemitones;
      this.harmonizerGain.gain.rampTo(this.settings.harmonizerMix, 0.05);
    } else {
      this.harmonizerGain.gain.rampTo(0, 0.05);
    }

    // Formant shift
    this.formantFilter.gain.rampTo(this.settings.formantCorrection * 0.8, 0.05);
  }

  /**
   * Connect processor output to destination (e.g. AudioEngine.masterEq or speakers)
   */
  public connectOutput(dest: Tone.InputNode) {
    try {
      this.outputNode.connect(dest);
    } catch {
      // Ignore duplicate connection errors
    }
  }

  public disconnectOutput() {
    try {
      this.outputNode.disconnect();
    } catch {
      // Ignore
    }
  }

  /**
   * Pure math scale snapping helper (unit-testable without AudioContext)
   */
  public static computeScaleSnap(
    frequency: number,
    settings: Pick<
      AutoTuneSettings,
      'rootKey' | 'scale' | 'correctionStrength' | 'humanize' | 'flexTune' | 'pitchDrift' | 'mode' | 'pitchShiftCents'
    >
  ): {
    note: string;
    targetNote: string;
    centsOff: number;
    targetShiftSemitones: number;
  } {
    const detectedMidi = 69 + 12 * Math.log2(frequency / 440);
    const nearestMidi = Math.round(detectedMidi);
    const centsOff = (detectedMidi - nearestMidi) * 100;
    const note = AutoTuneProcessor.midiToNoteNameStatic(nearestMidi);

    const targetMidi = AutoTuneProcessor.findNearestScaleNoteStatic(
      nearestMidi,
      settings.rootKey,
      settings.scale
    );
    const targetNote = AutoTuneProcessor.midiToNoteNameStatic(targetMidi);

    const rawDelta = targetMidi - detectedMidi;
    const strength = settings.mode === 'robotic' ? 1.0 : settings.correctionStrength;
    // Flex-tune & humanize allow subtle natural pitch expression inside sustain threshold
    const humanizePreserve =
      settings.mode === 'robotic'
        ? 0
        : Math.max(0, Math.min(0.65, settings.humanize * 0.45 + settings.flexTune * 0.25));
    const effectiveDelta = rawDelta * strength * (1 - humanizePreserve);

    return {
      note,
      targetNote,
      centsOff: Math.round(centsOff),
      targetShiftSemitones: effectiveDelta + (settings.pitchShiftCents || 0) / 100
    };
  }

  /**
   * Real-time Autocorrelation pitch detection loop
   */
  private startRealtimeDetection() {
    const buffer = new Float32Array(this.analyser.fftSize);
    let phase = 0;

    this.analysisIntervalId = window.setInterval(() => {
      this.analyser.getFloatTimeDomainData(buffer);
      const sampleRate = Tone.getContext().sampleRate;
      const pitchResult = this.detectPitchAutocorrelation(buffer, sampleRate);

      if (pitchResult.clarity > 0.6 && pitchResult.frequency >= 65 && pitchResult.frequency <= 1200) {
        const snap = AutoTuneProcessor.computeScaleSnap(pitchResult.frequency, this.settings);

        // Apply subtle vibrato & pitchDrift modulation if in natural mode
        phase += 0.22;
        const vibratoOffset =
          this.settings.mode === 'robotic'
            ? 0
            : Math.sin(phase) * (this.settings.vibratoAmount * 0.35 + this.settings.pitchDrift * 0.15);

        // 0ms / robotic = immediate snap; 100ms = slow natural smoothing
        const effectiveRetune = this.settings.mode === 'robotic' ? 0 : this.settings.retuneSpeedMs;
        const alpha = Math.max(0.08, Math.min(1.0, 1 - effectiveRetune / 105));
        const targetShift = snap.targetShiftSemitones + vibratoOffset;
        this.currentSmoothedCents = this.currentSmoothedCents * (1 - alpha) + targetShift * alpha;

        if (this.settings.enabled && !this.settings.bypassed) {
          this.pitchShiftNode.pitch = Math.max(-12, Math.min(12, this.currentSmoothedCents));
        }

        this.currentDetectedPitch = {
          frequency: pitchResult.frequency,
          note: snap.note,
          targetNote: snap.targetNote,
          centsOff: snap.centsOff,
          correctionCents: Math.round(this.currentSmoothedCents * 100),
          clarity: pitchResult.clarity
        };
      } else {
        this.currentSmoothedCents *= 0.85;
        if (Math.abs(this.currentSmoothedCents) < 0.05) this.currentSmoothedCents = 0;
        this.pitchShiftNode.pitch = (this.settings.pitchShiftCents || 0) / 100;
      }

      this.notifySubscribers();
    }, 40);
  }

  /**
   * Optimized autocorrelation algorithm with stride sub-sampling & fine refinement
   */
  private detectPitchAutocorrelation(buffer: Float32Array, sampleRate: number): { frequency: number; clarity: number } {
    const size = buffer.length;
    let rms = 0;
    for (let i = 0; i < size; i += 2) {
      rms += buffer[i] * buffer[i];
    }
    rms = Math.sqrt(rms / (size / 2));

    if (rms < 0.01) {
      return { frequency: 0, clarity: 0 };
    }

    const minPeriod = Math.floor(sampleRate / 1100);
    const maxPeriod = Math.floor(sampleRate / 65);

    let bestPeriod = 0;
    let maxCorrelation = 0;

    // Coarse scan step 2 (2x faster) then local refinement
    for (let period = minPeriod; period <= maxPeriod; period += 2) {
      let correlation = 0;
      let count = 0;
      for (let i = 0; i < size - period; i += 2) {
        correlation += buffer[i] * buffer[i + period];
        count++;
      }
      correlation = count > 0 ? correlation / count : 0;

      if (correlation > maxCorrelation) {
        maxCorrelation = correlation;
        bestPeriod = period;
      }
    }

    // Refine +/- 2 samples around bestPeriod
    const refineStart = Math.max(minPeriod, bestPeriod - 2);
    const refineEnd = Math.min(maxPeriod, bestPeriod + 2);
    for (let period = refineStart; period <= refineEnd; period++) {
      let correlation = 0;
      const limit = size - period;
      for (let i = 0; i < limit; i++) {
        correlation += buffer[i] * buffer[i + period];
      }
      correlation /= limit;
      if (correlation > maxCorrelation) {
        maxCorrelation = correlation;
        bestPeriod = period;
      }
    }

    const clarity = maxCorrelation / (rms * rms);
    if (bestPeriod === 0 || clarity < 0.5) {
      return { frequency: 0, clarity: 0 };
    }

    return { frequency: sampleRate / bestPeriod, clarity: Math.min(1.0, clarity) };
  }

  public static midiToNoteNameStatic(midi: number): string {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    const note = noteNames[((midi % 12) + 12) % 12];
    return `${note}${octave}`;
  }

  public static findNearestScaleNoteStatic(midi: number, rootKey: string, scale: string): number {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const rootIndex = noteNames.indexOf(rootKey);
    if (rootIndex === -1) return midi;

    let scaleIntervals: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    if (scale === 'major') {
      scaleIntervals = [0, 2, 4, 5, 7, 9, 11];
    } else if (scale === 'minor') {
      scaleIntervals = [0, 2, 3, 5, 7, 8, 10];
    } else if (scale === 'dorian') {
      scaleIntervals = [0, 2, 3, 5, 7, 9, 10];
    } else if (scale === 'pentatonic-minor') {
      scaleIntervals = [0, 3, 5, 7, 10];
    } else if (scale === 'pentatonic-major') {
      scaleIntervals = [0, 2, 4, 7, 9];
    } else if (scale === 'blues') {
      scaleIntervals = [0, 3, 5, 6, 7, 10];
    }

    const noteSemitone = ((midi % 12) + 12) % 12;
    const relativeToRoot = (noteSemitone - rootIndex + 12) % 12;

    let minDiff = 999;
    let bestInterval = scaleIntervals[0];

    for (const interval of scaleIntervals) {
      const diff = Math.abs(relativeToRoot - interval);
      if (diff < minDiff) {
        minDiff = diff;
        bestInterval = interval;
      }
    }

    const targetSemitone = (rootIndex + bestInterval) % 12;
    const octaveBase = Math.floor(midi / 12) * 12;
    let targetMidi = octaveBase + targetSemitone;

    if (Math.abs(targetMidi - midi) > 6) {
      if (targetMidi > midi) targetMidi -= 12;
      else targetMidi += 12;
    }

    return targetMidi;
  }

  public getLivePitchResult(): PitchDetectionResult {
    return this.currentDetectedPitch;
  }

  public onPitchDetected(cb: (res: PitchDetectionResult) => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private notifySubscribers() {
    this.subscribers.forEach((cb) => cb(this.currentDetectedPitch));
  }

  public dispose() {
    if (this.analysisIntervalId) {
      clearInterval(this.analysisIntervalId);
      this.analysisIntervalId = null;
    }
    this.pitchShiftNode.dispose();
    this.harmonizerShiftNode.dispose();
    this.harmonizerGain.dispose();
    this.doublerChorus.dispose();
    this.doublerGain.dispose();
    this.formantFilter.dispose();
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.inputNode.dispose();
    this.outputNode.dispose();
  }
}
