import React, { useState, useEffect, useCallback } from 'react';
import { Keyboard } from 'lucide-react';
import { AudioEngine } from '../audio/engine';
import { DrumSoundId, Track } from '../types/daw';

interface VirtualKeyboardProps {
  activeTrackId: string;
  tracks?: Track[];
  octaveOffset?: number;
}

const KEY_MAPPINGS: Record<string, { note: string; semitoneOffset: number }> = {
  a: { note: 'C', semitoneOffset: 0 },
  w: { note: 'C#', semitoneOffset: 1 },
  s: { note: 'D', semitoneOffset: 2 },
  e: { note: 'D#', semitoneOffset: 3 },
  d: { note: 'E', semitoneOffset: 4 },
  f: { note: 'F', semitoneOffset: 5 },
  t: { note: 'F#', semitoneOffset: 6 },
  g: { note: 'G', semitoneOffset: 7 },
  y: { note: 'G#', semitoneOffset: 8 },
  h: { note: 'A', semitoneOffset: 9 },
  u: { note: 'A#', semitoneOffset: 10 },
  j: { note: 'B', semitoneOffset: 11 },
  k: { note: 'C', semitoneOffset: 12 },
  o: { note: 'C#', semitoneOffset: 13 },
  l: { note: 'D', semitoneOffset: 14 }
};

const DRUM_KEY_SOUNDS: DrumSoundId[] = [
  'kick-punch',
  'kick-808',
  'snare-acoustic',
  'snare-trap',
  'clap',
  'hihat-closed',
  'rimshot',
  'hihat-open',
  'tom-low',
  'perc-shaker',
  'tom-high',
  'crash',
  'sub-808-hit',
  'kick-808',
  'snare-trap'
];

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({ activeTrackId, tracks = [] }) => {
  const engine = AudioEngine.getInstance();
  const [octave, setOctave] = useState<number>(4);
  const [pressedPitches, setPressedPitches] = useState<Set<string>>(new Set());

  const resolvedTrack = tracks.find((t) => t.id === activeTrackId);
  const firstMidiTrack = tracks.find((t) => t.type === 'midi');
  const isDrumMode = resolvedTrack?.type === 'drum';
  const targetTrackId =
    resolvedTrack?.type === 'audio' && firstMidiTrack ? firstMidiTrack.id : activeTrackId;

  const triggerPitchOrDrum = useCallback(
    (fullPitch: string, semitoneOffset: number) => {
      if (isDrumMode) {
        const soundId = DRUM_KEY_SOUNDS[semitoneOffset % DRUM_KEY_SOUNDS.length] || 'kick-punch';
        engine.triggerDirectDrum(targetTrackId, soundId, 0.9, 0);
      } else {
        engine.triggerDirectNote(targetTrackId, fullPitch, 0.85);
      }
      setPressedPitches((prev) => new Set(prev).add(fullPitch));
    },
    [engine, isDrumMode, targetTrackId]
  );

  const releasePitchOrDrum = useCallback(
    (fullPitch: string) => {
      if (!isDrumMode) {
        engine.releaseDirectNote(targetTrackId, fullPitch);
      }
      setPressedPitches((prev) => {
        const next = new Set(prev);
        next.delete(fullPitch);
        return next;
      });
    },
    [engine, isDrumMode, targetTrackId]
  );

  // Listen to physical keyboard events (QWERTY piano)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        e.repeat
      ) {
        return;
      }

      if (e.key === 'z' || e.key === 'Z') {
        setOctave((o) => Math.max(1, o - 1));
        return;
      }
      if (e.key === 'x' || e.key === 'X') {
        setOctave((o) => Math.min(6, o + 1));
        return;
      }

      const key = e.key.toLowerCase();
      const mapped = KEY_MAPPINGS[key];
      if (mapped) {
        const fullPitch =
          mapped.semitoneOffset >= 12
            ? `${mapped.note}${octave + 1}`
            : `${mapped.note}${octave}`;
        triggerPitchOrDrum(fullPitch, mapped.semitoneOffset);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      const mapped = KEY_MAPPINGS[key];
      if (mapped) {
        const fullPitch =
          mapped.semitoneOffset >= 12
            ? `${mapped.note}${octave + 1}`
            : `${mapped.note}${octave}`;
        releasePitchOrDrum(fullPitch);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [octave, triggerPitchOrDrum, releasePitchOrDrum]);

  const keysList = [
    { note: 'C', isBlack: false, keyLabel: 'A', offset: 0 },
    { note: 'C#', isBlack: true, keyLabel: 'W', offset: 1 },
    { note: 'D', isBlack: false, keyLabel: 'S', offset: 2 },
    { note: 'D#', isBlack: true, keyLabel: 'E', offset: 3 },
    { note: 'E', isBlack: false, keyLabel: 'D', offset: 4 },
    { note: 'F', isBlack: false, keyLabel: 'F', offset: 5 },
    { note: 'F#', isBlack: true, keyLabel: 'T', offset: 6 },
    { note: 'G', isBlack: false, keyLabel: 'G', offset: 7 },
    { note: 'G#', isBlack: true, keyLabel: 'Y', offset: 8 },
    { note: 'A', isBlack: false, keyLabel: 'H', offset: 9 },
    { note: 'A#', isBlack: true, keyLabel: 'U', offset: 10 },
    { note: 'B', isBlack: false, keyLabel: 'J', offset: 11 },
    { note: 'C', isBlack: false, keyLabel: 'K', offset: 12, nextOctave: true },
    { note: 'C#', isBlack: true, keyLabel: 'O', offset: 13, nextOctave: true },
    { note: 'D', isBlack: false, keyLabel: 'L', offset: 14, nextOctave: true }
  ];

  return (
    <div className="h-16 bg-[#0f1118] border-t border-[#1c2234] px-4 flex items-center justify-between select-none">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 font-bold uppercase tracking-wider">
          <Keyboard className="w-3.5 h-3.5 text-purple-400" />
          <span className="hidden sm:inline">
            {isDrumMode ? 'Drum Pad Keyboard:' : 'QWERTY Keyboard:'}
          </span>
        </div>

        {/* Octave Selector */}
        <div className="flex items-center bg-[#171b28] border border-[#262c3f] rounded-lg p-0.5">
          <button
            onClick={() => setOctave((o) => Math.max(1, o - 1))}
            className="px-2 py-0.5 text-xs font-mono font-bold text-gray-300 hover:text-white cursor-pointer"
          >
            -Oct [Z]
          </button>
          <span className="text-xs font-mono font-bold text-cyan-400 px-2">Oct {octave}</span>
          <button
            onClick={() => setOctave((o) => Math.min(6, o + 1))}
            className="px-2 py-0.5 text-xs font-mono font-bold text-gray-300 hover:text-white cursor-pointer"
          >
            +Oct [X]
          </button>
        </div>
      </div>

      {/* Mini Interactive Keys Bar */}
      <div className="flex items-start h-12 relative overflow-hidden">
        {keysList.map((k, index) => {
          const currentOct = k.nextOctave ? octave + 1 : octave;
          const fullPitch = `${k.note}${currentOct}`;
          const isPressed = pressedPitches.has(fullPitch);

          return (
            <button
              key={`${k.note}-${index}`}
              onMouseDown={() => triggerPitchOrDrum(fullPitch, k.offset)}
              onMouseUp={() => releasePitchOrDrum(fullPitch)}
              onMouseLeave={() => {
                if (isPressed) releasePitchOrDrum(fullPitch);
              }}
              className={`h-11 rounded-b font-mono text-[9px] font-bold flex flex-col justify-end items-center pb-1 transition-all cursor-pointer ${
                k.isBlack
                  ? 'w-6 -mx-3 bg-[#181c28] text-gray-400 z-10 border-b-2 border-[#0e1017] hover:bg-[#252c40]'
                  : 'w-8 bg-[#2d3448] text-gray-200 border-x border-[#1e2332] border-b-2 border-[#161a26] hover:bg-[#3b445e]'
              } ${
                isPressed
                  ? '!bg-gradient-to-t !from-purple-600 !to-cyan-400 !text-white shadow-lg'
                  : ''
              }`}
            >
              <span>{k.keyLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
