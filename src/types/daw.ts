/**
 * BeatForge Studio - Comprehensive DAW Type Definitions
 */

export type TrackType = 'midi' | 'drum' | 'audio';

export type InstrumentId = 
  | 'grand-piano'
  | 'electric-piano'
  | 'acoustic-guitar'
  | 'electric-guitar'
  | 'bass-guitar'
  | 'sub-808'
  | 'lead-synth'
  | 'pad-synth'
  | 'strings'
  | 'violin'
  | 'flute'
  | 'saxophone'
  | 'organ'
  | 'orchestral'
  | 'sound-fx';

export type DrumSoundId =
  | 'kick-punch'
  | 'kick-808'
  | 'snare-acoustic'
  | 'snare-trap'
  | 'hihat-closed'
  | 'hihat-open'
  | 'clap'
  | 'rimshot'
  | 'perc-shaker'
  | 'tom-high'
  | 'tom-low'
  | 'crash'
  | 'sub-808-hit';

export interface Note {
  id: string;
  pitch: string; // e.g. "C4", "F#3"
  time: number; // in sixteenth-notes from clip start (or bar fractions)
  duration: number; // in sixteenth-notes (e.g. 1 = 16th, 2 = 8th, 4 = quarter)
  velocity: number; // 0 to 1
}

export interface StepSequence {
  soundId: DrumSoundId;
  name: string;
  steps: boolean[]; // 16 or 32 steps
  velocities: number[]; // 0 to 1
  pitch: number; // semitones (-12 to +12)
  volume: number; // 0 to 1
  pan: number; // -1 to 1
  muted: boolean;
  solo: boolean;
  customSampleUrl?: string;
}

export interface AudioClip {
  id: string;
  name: string;
  startBar: number; // position on timeline in bars (e.g. 1.0, 2.5)
  durationBars: number;
  offset: number; // offset in seconds inside the audio buffer
  audioUrl?: string; // object URL, /api/audio URL, or data URL
  serverAudioUrl?: string; // persistent server audio path
  buffer?: AudioBuffer;
  blob?: Blob;
  waveformData?: number[]; // normalized peaks for visualization
  gain: number; // 0 to 2
  color: string;
  fadeIn?: number; // seconds
  fadeOut?: number; // seconds
  reversed?: boolean;
  playbackRate?: number; // 0.5 to 2.0
  pitchShift?: number; // semitones (-12 to +12)
  cropStart?: number; // seconds
  cropEnd?: number; // seconds
  originalDuration?: number; // seconds
  format?: string; // mp3, wav, m4a, etc.
  fileSizeBytes?: number;
}

export interface UploadedAudioItem {
  id: string;
  name: string;
  format: string;
  sizeBytes: number;
  durationSeconds: number;
  blob: Blob;
  audioUrl: string;
  buffer: AudioBuffer;
  waveformData: number[];
  category: 'beat' | 'vocal' | 'instrumental' | 'fx' | 'other';
  uploadedAt: number;
}

export interface PatternClip {
  id: string;
  trackId: string;
  name: string;
  startBar: number;
  durationBars: number; // typically 2 or 4 bars
  notes?: Note[];
  drumSteps?: StepSequence[];
  color: string;
}

export interface TrackEffects {
  eqLow: number; // dB (-12 to +12)
  eqMid: number; // dB (-12 to +12)
  eqHigh: number; // dB (-12 to +12)
  compThreshold: number; // dB (-60 to 0)
  compRatio: number; // 1 to 20
  reverbWet: number; // 0 to 1
  reverbDecay: number; // seconds (0.5 to 10)
  delayWet: number; // 0 to 1
  delayTime: string; // "8n", "4n", "16n"
  delayFeedback: number; // 0 to 0.9
  distortionWet: number; // 0 to 1
  distortionDrive: number; // 0 to 1
  filterCutoff: number; // Hz (20 to 20000)
  filterResonance: number; // Q (0 to 10)
  stereoWidth: number; // 0 to 2 (1 = normal)
  chorusWet?: number; // 0 to 1
  phaserWet?: number; // 0 to 1
  noiseGateThreshold?: number; // dB (-100 to -20)
  limiterThreshold?: number; // dB (-12 to 0)
  busId?: string;
}

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  color: string;
  volume: number; // in dB (-60 to +6)
  pan: number; // -1 to +1
  muted: boolean;
  solo: boolean;
  armed: boolean; // armed for vocal/audio recording or MIDI record
  instrumentId: InstrumentId;
  clips: (PatternClip | AudioClip)[];
  effects: TrackEffects;
  autoTune?: AutoTuneSettings;
  synthPatch?: SynthPatch;
  groupName?: string;
  activeDrumPattern?: 'A' | 'B' | 'C' | 'D';
  drumStepLength?: 16 | 32 | 64;
  drumPatternsBank?: Record<'A' | 'B' | 'C' | 'D', StepSequence[]>;
}

export interface DrumKit {
  id: string;
  name: string;
  genre: string;
  description: string;
}

export interface AutoTuneSettings {
  enabled: boolean;
  bypassed: boolean;
  rootKey: string; // 'C', 'C#', etc.
  scale: 'chromatic' | 'major' | 'minor' | 'dorian' | 'pentatonic-major' | 'pentatonic-minor' | 'blues' | 'custom';
  retuneSpeedMs: number; // 0 (hard/t-pain) to 100 (natural)
  humanize: number; // 0 to 1
  flexTune: number; // 0 to 1
  correctionStrength: number; // 0 to 1
  pitchDrift: number; // 0 to 1
  formantCorrection: number; // -12 to +12
  vibratoAmount: number; // 0 to 1
  pitchShiftCents: number; // -1200 to +1200 cents
  vocalDoubler: boolean;
  vocalDoublerMix: number; // 0 to 1
  harmonizer: 'off' | 'octave-up' | 'octave-down' | 'third-up' | 'fifth-up';
  harmonizerMix: number; // 0 to 1
  mode: 'natural' | 'robotic';
  preset: string;
}

export interface SynthPatch {
  id: string;
  name: string;
  category: string;
  osc1Wave: 'sine' | 'sawtooth' | 'square' | 'triangle';
  osc1Octave: number; // -2 to +2
  osc1Semi: number; // -12 to +12
  osc1Detune: number; // -50 to +50 cents
  osc1Vol: number; // 0 to 1
  osc2Wave: 'sine' | 'sawtooth' | 'square' | 'triangle';
  osc2Octave: number;
  osc2Semi: number;
  osc2Detune: number;
  osc2Vol: number;
  subOsc: boolean;
  subOscVol: number;
  noiseType: 'white' | 'pink' | 'off';
  noiseVol: number;
  filterType: 'lowpass' | 'highpass' | 'bandpass';
  filterCutoff: number; // Hz (20 to 20000)
  filterResonance: number; // Q (0 to 20)
  ampEnv: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  filterEnv: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
    amount: number;
  };
  lfoRate: number; // 0.1 to 20 Hz
  lfoDepth: number; // 0 to 1
  lfoTarget: 'cutoff' | 'pitch' | 'volume' | 'pan';
  unison: number; // 1 to 5
  portamento: number; // 0 to 1 (glide in seconds)
}

export interface AutomationPoint {
  id: string;
  bar: number; // bar position (e.g. 1.25)
  value: number; // normalized 0 to 1
  curve?: number; // -1 to 1 (curvature)
}

export interface AutomationClip {
  id: string;
  trackId: string;
  name: string;
  targetParam: 'volume' | 'pan' | 'filterCutoff' | 'reverbWet' | 'delayWet' | 'pitchShift';
  points: AutomationPoint[];
  color: string;
}

export interface MasteringSettings {
  enabled: boolean;
  bypassed: boolean;
  preset: string;
  eqLowCut: number; // 20 - 80 Hz
  eqLowGain: number; // -12 to +12 dB
  eqMidGain: number; // -12 to +12 dB
  eqHighGain: number; // -12 to +12 dB
  eqAirGain: number; // -12 to +12 dB
  compLowThreshold: number; // dB
  compLowRatio: number;
  compMidThreshold: number;
  compMidRatio: number;
  compHighThreshold: number;
  compHighRatio: number;
  stereoWidth: number; // 0 to 2
  bassMono: boolean;
  tapeSaturation: number; // 0 to 1
  limiterCeiling: number; // -0.5 to 0 dBFS
  limiterGain: number; // 0 to 12 dB
}

export interface MasterBusSettings {
  volume: number; // dB
  limiterThreshold: number; // dB
  eqLow: number;
  eqMid: number;
  eqHigh: number;
}

export interface DAWProject {
  id: string;
  name: string;
  bpm: number;
  timeSignature: [number, number]; // e.g. [4, 4]
  swing: number; // 0 to 1
  tracks: Track[];
  master: MasterBusSettings;
  mastering?: MasteringSettings;
  automationClips?: AutomationClip[];
  loopEnabled: boolean;
  loopStartBar: number;
  loopEndBar: number;
  countInBars?: number;
  createdAt: number;
  updatedAt: number;
  author: string;
  userId?: string;
}

export interface SampleItem {
  id: string;
  title: string;
  category: string; // Hip-Hop, Trap, Drill, Lo-fi, EDM, House, Techno, Bollywood, Cinematic, Ambient, Acoustic
  type: 'one-shot' | 'loop' | 'vocal' | 'drum' | 'instrument';
  key?: string;
  bpm?: number;
  duration: number; // seconds
  tags: string[];
  isCustom?: boolean;
  dataUrl?: string;
}

export interface UserProfile {
  id: string;
  email?: string;
  name: string;
  handle: string;
  avatar: string;
  plan: 'Studio Pro' | 'Producer' | 'Free';
  projectsCount: number;
  exportsCount: number;
}
