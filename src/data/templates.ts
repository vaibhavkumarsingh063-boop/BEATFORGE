/**
 * BeatForge Studio - Starter Project Templates
 * Richly orchestrated starter projects ready to play immediately
 */
import { DAWProject, Track, TrackEffects, StepSequence, Note } from '../types/daw';

const defaultEffects: TrackEffects = {
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  compThreshold: -18,
  compRatio: 3,
  reverbWet: 0.15,
  reverbDecay: 1.5,
  delayWet: 0.1,
  delayTime: '8n',
  delayFeedback: 0.3,
  distortionWet: 0,
  distortionDrive: 0,
  filterCutoff: 18000,
  filterResonance: 1,
  stereoWidth: 1
};

export function createDefaultDrums(genre: 'trap' | 'lofi' | 'edm' | 'desi'): StepSequence[] {
  const steps16 = (pattern: number[]): boolean[] => {
    const arr = new Array(16).fill(false);
    pattern.forEach((idx) => {
      if (idx >= 0 && idx < 16) arr[idx] = true;
    });
    return arr;
  };

  if (genre === 'trap' || genre === 'desi') {
    return [
      {
        soundId: 'kick-808',
        name: '808 Kick',
        steps: steps16([0, 6, 8, 14]),
        velocities: new Array(16).fill(0.9),
        pitch: 0,
        volume: 0.95,
        pan: 0,
        muted: false,
        solo: false
      },
      {
        soundId: 'snare-trap',
        name: 'Trap Snare',
        steps: steps16([4, 12]),
        velocities: new Array(16).fill(0.85),
        pitch: 0,
        volume: 0.9,
        pan: 0,
        muted: false,
        solo: false
      },
      {
        soundId: 'hihat-closed',
        name: 'Hi-Hat (16ths)',
        steps: steps16([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
        velocities: [0.9, 0.6, 0.8, 0.6, 0.9, 0.6, 0.8, 0.6, 0.9, 0.6, 0.8, 0.6, 0.9, 0.6, 0.8, 0.6],
        pitch: 0,
        volume: 0.75,
        pan: -0.1,
        muted: false,
        solo: false
      },
      {
        soundId: 'clap',
        name: 'Accent Clap',
        steps: steps16([12]),
        velocities: new Array(16).fill(0.8),
        pitch: 0,
        volume: 0.8,
        pan: 0.1,
        muted: false,
        solo: false
      },
      {
        soundId: 'perc-shaker',
        name: 'Perc Shaker',
        steps: steps16([2, 5, 10, 13]),
        velocities: new Array(16).fill(0.65),
        pitch: 0,
        volume: 0.7,
        pan: 0.25,
        muted: false,
        solo: false
      }
    ];
  } else if (genre === 'lofi') {
    return [
      {
        soundId: 'kick-punch',
        name: 'Dusty Kick',
        steps: steps16([0, 5, 10]),
        velocities: [0.9, 0.7, 0.85, 0.6, 0.6, 0.7, 0.6, 0.6, 0.6, 0.6, 0.8, 0.6, 0.6, 0.6, 0.6, 0.6],
        pitch: -2,
        volume: 0.9,
        pan: 0,
        muted: false,
        solo: false
      },
      {
        soundId: 'snare-acoustic',
        name: 'Wood Snare',
        steps: steps16([4, 12]),
        velocities: new Array(16).fill(0.8),
        pitch: -1,
        volume: 0.85,
        pan: 0,
        muted: false,
        solo: false
      },
      {
        soundId: 'hihat-closed',
        name: 'Swung Hat',
        steps: steps16([0, 2, 4, 6, 8, 10, 12, 14]),
        velocities: [0.75, 0.5, 0.75, 0.5, 0.75, 0.5, 0.75, 0.5, 0.75, 0.5, 0.75, 0.5, 0.75, 0.5, 0.75, 0.5],
        pitch: 0,
        volume: 0.6,
        pan: -0.15,
        muted: false,
        solo: false
      },
      {
        soundId: 'rimshot',
        name: 'Rim Click',
        steps: steps16([7, 15]),
        velocities: new Array(16).fill(0.6),
        pitch: 0,
        volume: 0.65,
        pan: 0.2,
        muted: false,
        solo: false
      }
    ];
  } else {
    // EDM 4 on floor
    return [
      {
        soundId: 'kick-punch',
        name: 'Club 4-on-Floor',
        steps: steps16([0, 4, 8, 12]),
        velocities: new Array(16).fill(1.0),
        pitch: 0,
        volume: 1.0,
        pan: 0,
        muted: false,
        solo: false
      },
      {
        soundId: 'clap',
        name: 'Main Clap',
        steps: steps16([4, 12]),
        velocities: new Array(16).fill(0.9),
        pitch: 0,
        volume: 0.85,
        pan: 0,
        muted: false,
        solo: false
      },
      {
        soundId: 'hihat-open',
        name: 'Offbeat Hat',
        steps: steps16([2, 6, 10, 14]),
        velocities: new Array(16).fill(0.85),
        pitch: 0,
        volume: 0.8,
        pan: 0.1,
        muted: false,
        solo: false
      },
      {
        soundId: 'perc-shaker',
        name: 'Groove Shaker',
        steps: steps16([1, 3, 5, 7, 9, 11, 13, 15]),
        velocities: new Array(16).fill(0.6),
        pitch: 0,
        volume: 0.6,
        pan: -0.2,
        muted: false,
        solo: false
      }
    ];
  }
}

export const TEMPLATES: { name: string; genre: string; bpm: number; project: DAWProject }[] = [
  {
    name: 'Trap & 808 Anthem',
    genre: 'Trap / Hip-Hop',
    bpm: 140,
    project: {
      id: 'template-trap-heat',
      name: 'Trap & 808 Anthem',
      bpm: 140,
      timeSignature: [4, 4],
      swing: 0.05,
      loopEnabled: true,
      loopStartBar: 0,
      loopEndBar: 4,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      author: 'BeatForge Studio',
      master: {
        volume: 0,
        limiterThreshold: -0.2,
        eqLow: 1.0,
        eqMid: 0,
        eqHigh: 1.5
      },
      tracks: [
        {
          id: 'track-drums',
          name: 'Trap Drum Kit',
          type: 'drum',
          color: '#f43f5e',
          volume: -2,
          pan: 0,
          muted: false,
          solo: false,
          armed: false,
          instrumentId: 'sub-808',
          effects: { ...defaultEffects, eqLow: 2, eqHigh: 2, compThreshold: -14 },
          clips: [
            {
              id: 'clip-drums-1',
              trackId: 'track-drums',
              name: 'Trap Main Beat',
              startBar: 0,
              durationBars: 4,
              color: '#f43f5e',
              drumSteps: createDefaultDrums('trap')
            }
          ]
        },
        {
          id: 'track-bass',
          name: '808 Sub-Bass',
          type: 'midi',
          color: '#8b5cf6',
          volume: 0,
          pan: 0,
          muted: false,
          solo: false,
          armed: false,
          instrumentId: 'sub-808',
          effects: { ...defaultEffects, eqLow: 3.5, distortionDrive: 0.2, distortionWet: 0.15 },
          clips: [
            {
              id: 'clip-bass-1',
              trackId: 'track-bass',
              name: '808 Glides',
              startBar: 0,
              durationBars: 4,
              color: '#8b5cf6',
              notes: [
                { id: 'n1', pitch: 'C2', time: 0, duration: 6, velocity: 0.95 },
                { id: 'n2', pitch: 'D#2', time: 6, duration: 2, velocity: 0.9 },
                { id: 'n3', pitch: 'F2', time: 8, duration: 6, velocity: 0.95 },
                { id: 'n4', pitch: 'G2', time: 14, duration: 2, velocity: 0.85 },
                { id: 'n5', pitch: 'G#2', time: 16, duration: 8, velocity: 0.95 },
                { id: 'n6', pitch: 'A#2', time: 24, duration: 4, velocity: 0.9 },
                { id: 'n7', pitch: 'G2', time: 28, duration: 4, velocity: 0.85 }
              ]
            }
          ]
        },
        {
          id: 'track-flute',
          name: 'Metro Dark Flute',
          type: 'midi',
          color: '#06b6d4',
          volume: -3,
          pan: 0.15,
          muted: false,
          solo: false,
          armed: false,
          instrumentId: 'flute',
          effects: { ...defaultEffects, reverbWet: 0.35, reverbDecay: 2.5, delayWet: 0.25 },
          clips: [
            {
              id: 'clip-flute-1',
              trackId: 'track-flute',
              name: 'Dark Lead Riff',
              startBar: 0,
              durationBars: 4,
              color: '#06b6d4',
              notes: [
                { id: 'f1', pitch: 'C5', time: 0, duration: 2, velocity: 0.85 },
                { id: 'f2', pitch: 'D#5', time: 2, duration: 2, velocity: 0.8 },
                { id: 'f3', pitch: 'G5', time: 4, duration: 4, velocity: 0.9 },
                { id: 'f4', pitch: 'F5', time: 8, duration: 2, velocity: 0.8 },
                { id: 'f5', pitch: 'D#5', time: 10, duration: 2, velocity: 0.75 },
                { id: 'f6', pitch: 'C5', time: 12, duration: 4, velocity: 0.85 },
                { id: 'f7', pitch: 'G#5', time: 16, duration: 4, velocity: 0.9 },
                { id: 'f8', pitch: 'G5', time: 20, duration: 4, velocity: 0.85 },
                { id: 'f9', pitch: 'D#5', time: 24, duration: 4, velocity: 0.8 },
                { id: 'f10', pitch: 'D5', time: 28, duration: 4, velocity: 0.8 }
              ]
            }
          ]
        },
        {
          id: 'track-pad',
          name: 'Atmospheric Pad',
          type: 'midi',
          color: '#ec4899',
          volume: -6,
          pan: -0.2,
          muted: false,
          solo: false,
          armed: false,
          instrumentId: 'pad-synth',
          effects: { ...defaultEffects, reverbWet: 0.45, reverbDecay: 3.5, filterCutoff: 4000 },
          clips: [
            {
              id: 'clip-pad-1',
              trackId: 'track-pad',
              name: 'Minor Chords',
              startBar: 0,
              durationBars: 4,
              color: '#ec4899',
              notes: [
                // C minor triad
                { id: 'p1', pitch: 'C4', time: 0, duration: 16, velocity: 0.7 },
                { id: 'p2', pitch: 'D#4', time: 0, duration: 16, velocity: 0.65 },
                { id: 'p3', pitch: 'G4', time: 0, duration: 16, velocity: 0.7 },
                // G# major triad
                { id: 'p4', pitch: 'G#3', time: 16, duration: 16, velocity: 0.7 },
                { id: 'p5', pitch: 'C4', time: 16, duration: 16, velocity: 0.65 },
                { id: 'p6', pitch: 'D#4', time: 16, duration: 16, velocity: 0.7 }
              ]
            }
          ]
        },
        {
          id: 'track-vocal',
          name: 'Vocal Studio Track',
          type: 'audio',
          color: '#10b981',
          volume: 0,
          pan: 0,
          muted: false,
          solo: false,
          armed: true,
          instrumentId: 'grand-piano',
          effects: { ...defaultEffects, eqHigh: 2.5, compThreshold: -20, reverbWet: 0.25 },
          clips: []
        }
      ]
    }
  },
  {
    name: 'Midnight Lo-Fi Chill',
    genre: 'Lo-Fi / Chillhop',
    bpm: 85,
    project: {
      id: 'template-lofi-chill',
      name: 'Midnight Lo-Fi Chill',
      bpm: 85,
      timeSignature: [4, 4],
      swing: 0.2,
      loopEnabled: true,
      loopStartBar: 0,
      loopEndBar: 4,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      author: 'BeatForge Studio',
      master: {
        volume: 0,
        limiterThreshold: -0.5,
        eqLow: 0.5,
        eqMid: -1,
        eqHigh: -1.5
      },
      tracks: [
        {
          id: 'track-lofi-drums',
          name: 'Dusty Boom-Bap Drums',
          type: 'drum',
          color: '#f97316',
          volume: -1,
          pan: 0,
          muted: false,
          solo: false,
          armed: false,
          instrumentId: 'electric-piano',
          effects: { ...defaultEffects, filterCutoff: 8500, distortionDrive: 0.15, distortionWet: 0.1 },
          clips: [
            {
              id: 'clip-lofi-d1',
              trackId: 'track-lofi-drums',
              name: 'Lo-Fi Swing Beat',
              startBar: 0,
              durationBars: 4,
              color: '#f97316',
              drumSteps: createDefaultDrums('lofi')
            }
          ]
        },
        {
          id: 'track-rhodes',
          name: 'Warm Electric Piano',
          type: 'midi',
          color: '#eab308',
          volume: -2,
          pan: 0,
          muted: false,
          solo: false,
          armed: false,
          instrumentId: 'electric-piano',
          effects: { ...defaultEffects, reverbWet: 0.35, chorus: true } as any,
          clips: [
            {
              id: 'clip-rhodes-1',
              trackId: 'track-rhodes',
              name: 'Lo-fi 7th Chords',
              startBar: 0,
              durationBars: 4,
              color: '#eab308',
              notes: [
                // Ebmaj7
                { id: 'r1', pitch: 'Eb3', time: 0, duration: 14, velocity: 0.75 },
                { id: 'r2', pitch: 'G3', time: 0, duration: 14, velocity: 0.7 },
                { id: 'r3', pitch: 'Bb3', time: 0, duration: 14, velocity: 0.7 },
                { id: 'r4', pitch: 'D4', time: 0, duration: 14, velocity: 0.7 },
                // Cm7
                { id: 'r5', pitch: 'C3', time: 16, duration: 14, velocity: 0.75 },
                { id: 'r6', pitch: 'Eb3', time: 16, duration: 14, velocity: 0.7 },
                { id: 'r7', pitch: 'G3', time: 16, duration: 14, velocity: 0.7 },
                { id: 'r8', pitch: 'Bb3', time: 16, duration: 14, velocity: 0.7 }
              ]
            }
          ]
        },
        {
          id: 'track-lofi-bass',
          name: 'Smooth Electric Bass',
          type: 'midi',
          color: '#3b82f6',
          volume: -1,
          pan: 0,
          muted: false,
          solo: false,
          armed: false,
          instrumentId: 'bass-guitar',
          effects: { ...defaultEffects, filterCutoff: 1200 },
          clips: [
            {
              id: 'clip-lofi-b1',
              trackId: 'track-lofi-bass',
              name: 'Walking Bass',
              startBar: 0,
              durationBars: 4,
              color: '#3b82f6',
              notes: [
                { id: 'b1', pitch: 'Eb2', time: 0, duration: 4, velocity: 0.8 },
                { id: 'b2', pitch: 'G2', time: 6, duration: 2, velocity: 0.75 },
                { id: 'b3', pitch: 'Bb2', time: 8, duration: 4, velocity: 0.8 },
                { id: 'b4', pitch: 'D3', time: 12, duration: 4, velocity: 0.75 },
                { id: 'b5', pitch: 'C2', time: 16, duration: 4, velocity: 0.8 },
                { id: 'b6', pitch: 'Eb2', time: 22, duration: 2, velocity: 0.75 },
                { id: 'b7', pitch: 'G2', time: 24, duration: 4, velocity: 0.8 },
                { id: 'b8', pitch: 'Bb2', time: 28, duration: 4, velocity: 0.75 }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    name: 'Desi Fusion & Bollywood Drill',
    genre: 'Bollywood / Drill',
    bpm: 138,
    project: {
      id: 'template-desi-fusion',
      name: 'Desi Fusion & Bollywood Drill',
      bpm: 138,
      timeSignature: [4, 4],
      swing: 0.08,
      loopEnabled: true,
      loopStartBar: 0,
      loopEndBar: 4,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      author: 'BeatForge Studio',
      master: {
        volume: 0,
        limiterThreshold: -0.2,
        eqLow: 2,
        eqMid: 0.5,
        eqHigh: 2
      },
      tracks: [
        {
          id: 'track-desi-drums',
          name: 'Dholak & Drill Kit',
          type: 'drum',
          color: '#f59e0b',
          volume: -1,
          pan: 0,
          muted: false,
          solo: false,
          armed: false,
          instrumentId: 'sub-808',
          effects: { ...defaultEffects, eqLow: 2.5, eqHigh: 3 },
          clips: [
            {
              id: 'clip-desi-d1',
              trackId: 'track-desi-drums',
              name: 'Desi Drill Beat',
              startBar: 0,
              durationBars: 4,
              color: '#f59e0b',
              drumSteps: createDefaultDrums('desi')
            }
          ]
        },
        {
          id: 'track-sitar',
          name: 'Mystic Sitar & Strings',
          type: 'midi',
          color: '#d946ef',
          volume: -2,
          pan: 0.1,
          muted: false,
          solo: false,
          armed: false,
          instrumentId: 'strings',
          effects: { ...defaultEffects, reverbWet: 0.35, delayWet: 0.2 },
          clips: [
            {
              id: 'clip-sitar-1',
              trackId: 'track-sitar',
              name: 'Bhairav Raga Scale',
              startBar: 0,
              durationBars: 4,
              color: '#d946ef',
              notes: [
                { id: 's1', pitch: 'C4', time: 0, duration: 2, velocity: 0.9 },
                { id: 's2', pitch: 'C#4', time: 2, duration: 2, velocity: 0.85 },
                { id: 's3', pitch: 'E4', time: 4, duration: 4, velocity: 0.9 },
                { id: 's4', pitch: 'F4', time: 8, duration: 2, velocity: 0.85 },
                { id: 's5', pitch: 'G4', time: 10, duration: 2, velocity: 0.9 },
                { id: 's6', pitch: 'G#4', time: 12, duration: 2, velocity: 0.85 },
                { id: 's7', pitch: 'B4', time: 14, duration: 2, velocity: 0.9 },
                { id: 's8', pitch: 'C5', time: 16, duration: 8, velocity: 0.95 },
                { id: 's9', pitch: 'G4', time: 24, duration: 4, velocity: 0.85 },
                { id: 's10', pitch: 'E4', time: 28, duration: 4, velocity: 0.85 }
              ]
            }
          ]
        },
        {
          id: 'track-desi-808',
          name: 'Hard Drill 808',
          type: 'midi',
          color: '#ef4444',
          volume: 0,
          pan: 0,
          muted: false,
          solo: false,
          armed: false,
          instrumentId: 'sub-808',
          effects: { ...defaultEffects, eqLow: 3.5, distortionDrive: 0.3, distortionWet: 0.2 },
          clips: [
            {
              id: 'clip-desi-808-1',
              trackId: 'track-desi-808',
              name: 'Drill Sub Glides',
              startBar: 0,
              durationBars: 4,
              color: '#ef4444',
              notes: [
                { id: 'd8_1', pitch: 'C2', time: 0, duration: 4, velocity: 0.95 },
                { id: 'd8_2', pitch: 'C#2', time: 6, duration: 2, velocity: 0.9 },
                { id: 'd8_3', pitch: 'C2', time: 8, duration: 4, velocity: 0.95 },
                { id: 'd8_4', pitch: 'F2', time: 14, duration: 2, velocity: 0.9 },
                { id: 'd8_5', pitch: 'E2', time: 16, duration: 6, velocity: 0.95 },
                { id: 'd8_6', pitch: 'C#2', time: 24, duration: 4, velocity: 0.9 },
                { id: 'd8_7', pitch: 'C2', time: 28, duration: 4, velocity: 0.95 }
              ]
            }
          ]
        }
      ]
    }
  }
];

export function createBlankProject(name = 'Untitled Beat'): DAWProject {
  return {
    id: `project-${Date.now()}`,
    name,
    bpm: 128,
    timeSignature: [4, 4],
    swing: 0,
    loopEnabled: true,
    loopStartBar: 0,
    loopEndBar: 4,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    author: 'Producer',
    master: {
      volume: 0,
      limiterThreshold: -0.2,
      eqLow: 0,
      eqMid: 0,
      eqHigh: 0
    },
    tracks: [
      {
        id: 'track-1',
        name: 'Drums',
        type: 'drum',
        color: '#f43f5e',
        volume: 0,
        pan: 0,
        muted: false,
        solo: false,
        armed: false,
        instrumentId: 'grand-piano',
        effects: { ...defaultEffects },
        clips: [
          {
            id: 'clip-d-1',
            trackId: 'track-1',
            name: 'Pattern 1',
            startBar: 0,
            durationBars: 4,
            color: '#f43f5e',
            drumSteps: createDefaultDrums('edm')
          }
        ]
      },
      {
        id: 'track-2',
        name: 'Bass',
        type: 'midi',
        color: '#8b5cf6',
        volume: 0,
        pan: 0,
        muted: false,
        solo: false,
        armed: false,
        instrumentId: 'sub-808',
        effects: { ...defaultEffects },
        clips: []
      },
      {
        id: 'track-3',
        name: 'Grand Piano',
        type: 'midi',
        color: '#3b82f6',
        volume: -2,
        pan: 0,
        muted: false,
        solo: false,
        armed: false,
        instrumentId: 'grand-piano',
        effects: { ...defaultEffects },
        clips: []
      },
      {
        id: 'track-4',
        name: 'Vocal Track',
        type: 'audio',
        color: '#10b981',
        volume: 0,
        pan: 0,
        muted: false,
        solo: false,
        armed: true,
        instrumentId: 'grand-piano',
        effects: { ...defaultEffects },
        clips: []
      }
    ]
  };
}
