import React, { useState, useEffect, useRef } from 'react';
import {
  Music2,
  Trash2,
  Sparkles,
  ChevronDown,
  Zap,
  ArrowUp,
  ArrowDown,
  Download,
  Upload,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { DAWProject, Note, InstrumentId } from '../types/daw';
import { AudioEngine } from '../audio/engine';
import { exportNotesToMidiFile, parseMidiFileToNotes } from '../audio/midiFile';

interface PianoRollProps {
  project: DAWProject;
  onUpdateProject: (updater: (prev: DAWProject) => DAWProject) => void;
  activeTrackId?: string;
}

const OCTAVES = [5, 4, 3, 2];
const NOTE_NAMES = ['B', 'A#', 'A', 'G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#', 'C'];

const PITCH_LIST: string[] = [];
OCTAVES.forEach((oct) => {
  NOTE_NAMES.forEach((n) => {
    PITCH_LIST.push(`${n}${oct}`);
  });
});

const SCALES: { id: string; name: string; intervals: number[] }[] = [
  { id: 'chromatic', name: 'Chromatic (All)', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { id: 'major', name: 'Natural Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'minor', name: 'Natural Minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'harmonic-minor', name: 'Harmonic Minor', intervals: [0, 2, 3, 5, 7, 8, 11] },
  { id: 'pentatonic-minor', name: 'Minor Pentatonic', intervals: [0, 3, 5, 7, 10] },
  { id: 'pentatonic-major', name: 'Major Pentatonic', intervals: [0, 2, 4, 7, 9] },
  { id: 'blues', name: 'Blues Scale', intervals: [0, 3, 5, 6, 7, 10] },
  { id: 'dorian', name: 'Dorian Mode', intervals: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'bhairav', name: 'Indian Bhairav (Hijaz)', intervals: [0, 1, 4, 5, 7, 8, 11] }
];

const ROOT_KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const INSTRUMENTS_LIST: { id: InstrumentId; name: string; category: string }[] = [
  { id: 'grand-piano', name: 'Grand Piano', category: 'Keyboard' },
  { id: 'electric-piano', name: 'Electric Piano (Rhodes)', category: 'Keyboard' },
  { id: 'acoustic-guitar', name: 'Acoustic Guitar', category: 'Plucked' },
  { id: 'electric-guitar', name: 'Electric Guitar', category: 'Plucked' },
  { id: 'bass-guitar', name: 'Electric Bass', category: 'Bass' },
  { id: 'sub-808', name: '808 Sub-Bass', category: 'Bass' },
  { id: 'lead-synth', name: 'Cyber Lead Synth', category: 'Synth' },
  { id: 'pad-synth', name: 'Celestial Pad', category: 'Synth' },
  { id: 'strings', name: 'Symphonic Strings', category: 'Orchestral' },
  { id: 'violin', name: 'Solo Violin', category: 'Orchestral' },
  { id: 'flute', name: 'Studio Flute', category: 'Wind' },
  { id: 'saxophone', name: 'Jazz Saxophone', category: 'Wind' },
  { id: 'organ', name: 'B3 Tonewheel Organ', category: 'Keyboard' },
  { id: 'orchestral', name: 'Orchestral Stabs', category: 'Orchestral' },
  { id: 'sound-fx', name: 'Sci-Fi Sound FX', category: 'FX' }
];

export const PianoRoll: React.FC<PianoRollProps> = ({
  project,
  onUpdateProject,
  activeTrackId
}) => {
  const engine = AudioEngine.getInstance();

  const midiTracks = project.tracks.filter((t) => t.type === 'midi');
  const [selectedTrackId, setSelectedTrackId] = useState<string>(
    (activeTrackId && midiTracks.some((t) => t.id === activeTrackId) ? activeTrackId : undefined) ||
      midiTracks[0]?.id ||
      project.tracks[0]?.id ||
      ''
  );

  useEffect(() => {
    if (activeTrackId && midiTracks.some((t) => t.id === activeTrackId)) {
      setSelectedTrackId(activeTrackId);
    } else if (!project.tracks.some((t) => t.id === selectedTrackId)) {
      setSelectedTrackId(midiTracks[0]?.id || project.tracks[0]?.id || '');
    }
  }, [activeTrackId, project.tracks]);

  const activeTrack = project.tracks.find((t) => t.id === selectedTrackId) || project.tracks[0];
  const activeClip = activeTrack?.clips.find((c) => 'notes' in c) as any;

  const [selectedRoot, setSelectedRoot] = useState<string>('C');
  const [selectedScaleId, setSelectedScaleId] = useState<string>('minor');
  const [activePlayheadStep, setActivePlayheadStep] = useState<number>(-1);
  const [drawDuration, setDrawDuration] = useState<number>(4);
  const [noteVelocity, setNoteVelocity] = useState<number>(0.85);
  const [stepWidthPx, setStepWidthPx] = useState<number>(24);
  const [showChordMenu, setShowChordMenu] = useState<boolean>(false);
  const [arpMode, setArpMode] = useState<'up' | 'down' | 'updown'>('up');

  // Right-edge note resize preview
  const [resizingNote, setResizingNote] = useState<{ id: string; duration: number } | null>(null);
  const resizingNoteRef = useRef<{ id: string; startX: number; initialDuration: number; duration: number } | null>(null);

  const gridContainerRef = useRef<HTMLDivElement>(null);
  const chordMenuRef = useRef<HTMLDivElement>(null);
  const midiFileInputRef = useRef<HTMLInputElement>(null);

  // Close Chords dropdown on outside click or Escape
  useEffect(() => {
    if (!showChordMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (chordMenuRef.current && !chordMenuRef.current.contains(e.target as Node)) {
        setShowChordMenu(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowChordMenu(false);
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [showChordMenu]);

  // Sync playhead step cursor
  useEffect(() => {
    const unsub = engine.subscribe(() => {
      if (!engine.isPlaying) {
        setActivePlayheadStep(-1);
        return;
      }
      const beatsPerBar = project.timeSignature[0];
      const sixteenthsPerBar = beatsPerBar * 4;
      const totalSteps = 64;
      const currentStep = Math.floor(engine.currentBarPosition * sixteenthsPerBar) % totalSteps;
      setActivePlayheadStep(currentStep);
    });

    return () => unsub();
  }, [engine, project.timeSignature]);

  const notes: Note[] = activeClip?.notes || [];

  const updateNotes = (newNotes: Note[]) => {
    onUpdateProject((prev) => {
      const updatedTracks = prev.tracks.map((track) => {
        if (track.id !== selectedTrackId) return track;
        let clipFound = false;
        const updatedClips = track.clips.map((clip) => {
          if ('notes' in clip) {
            clipFound = true;
            return { ...clip, notes: newNotes };
          }
          return clip;
        });

        if (!clipFound) {
          updatedClips.push({
            id: `clip-${Date.now()}`,
            trackId: track.id,
            name: `${track.name} Melody`,
            startBar: 0,
            durationBars: 4,
            color: track.color,
            notes: newNotes
          } as any);
        }

        return { ...track, clips: updatedClips };
      });
      return { ...prev, tracks: updatedTracks };
    });
  };

  // Drag-resize note duration handler
  useEffect(() => {
    if (!resizingNote) return;

    const handleMove = (e: MouseEvent) => {
      const state = resizingNoteRef.current;
      if (!state) return;
      const deltaSteps = Math.round((e.clientX - state.startX) / stepWidthPx);
      const nextDur = Math.max(1, Math.min(32, state.initialDuration + deltaSteps));
      state.duration = nextDur;
      setResizingNote({ id: state.id, duration: nextDur });
    };

    const handleUp = () => {
      const state = resizingNoteRef.current;
      if (state) {
        updateNotes(notes.map((n) => (n.id === state.id ? { ...n, duration: state.duration } : n)));
      }
      resizingNoteRef.current = null;
      setResizingNote(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [resizingNote, stepWidthPx, notes]);

  const handleCellClick = (pitch: string, stepIndex: number) => {
    const existingIndex = notes.findIndex(
      (n) => n.pitch === pitch && n.time <= stepIndex && n.time + n.duration > stepIndex
    );

    if (existingIndex >= 0) {
      const filtered = notes.filter((_, idx) => idx !== existingIndex);
      updateNotes(filtered);
    } else {
      const newNote: Note = {
        id: `note-${Date.now()}-${Math.random()}`,
        pitch,
        time: stepIndex,
        duration: drawDuration,
        velocity: noteVelocity
      };
      updateNotes([...notes, newNote]);

      engine.triggerDirectNote(selectedTrackId, pitch, noteVelocity);
      setTimeout(() => {
        engine.releaseDirectNote(selectedTrackId, pitch);
      }, 200);
    }
  };

  const handleAuditionKey = (pitch: string) => {
    engine.triggerDirectNote(selectedTrackId, pitch, noteVelocity);
    setTimeout(() => {
      engine.releaseDirectNote(selectedTrackId, pitch);
    }, 350);
  };

  const handleInstrumentChange = (newInstId: InstrumentId) => {
    onUpdateProject((prev) => {
      const updatedTracks = prev.tracks.map((t) => {
        if (t.id !== selectedTrackId) return t;
        return { ...t, instrumentId: newInstId };
      });
      return { ...prev, tracks: updatedTracks };
    });
  };

  const handleGenerateProgression = (preset: 'pop' | 'trap' | 'lofi' | 'uplift') => {
    let generatedNotes: Note[] = [];

    if (preset === 'pop') {
      const chords = [
        { pitches: ['C4', 'E4', 'G4'], time: 0 },
        { pitches: ['G3', 'B3', 'D4'], time: 16 },
        { pitches: ['A3', 'C4', 'E4'], time: 32 },
        { pitches: ['F3', 'A3', 'C4'], time: 48 }
      ];
      chords.forEach((c) => {
        c.pitches.forEach((p) => {
          generatedNotes.push({
            id: `pop-${c.time}-${p}`,
            pitch: p,
            time: c.time,
            duration: 14,
            velocity: 0.8
          });
        });
      });
    } else if (preset === 'trap') {
      const chords = [
        { pitches: ['C4', 'D#4', 'G4'], time: 0 },
        { pitches: ['G#3', 'C4', 'D#4'], time: 16 },
        { pitches: ['D#4', 'G4', 'A#4'], time: 32 },
        { pitches: ['A#3', 'D4', 'F4'], time: 48 }
      ];
      chords.forEach((c) => {
        c.pitches.forEach((p) => {
          generatedNotes.push({
            id: `trap-${c.time}-${p}`,
            pitch: p,
            time: c.time,
            duration: 14,
            velocity: 0.85
          });
        });
      });
    } else if (preset === 'lofi') {
      const chords = [
        { pitches: ['D3', 'F3', 'A3', 'C4'], time: 0 },
        { pitches: ['G3', 'B3', 'D4', 'F4'], time: 16 },
        { pitches: ['C3', 'E3', 'G3', 'B3'], time: 32 },
        { pitches: ['A3', 'C#4', 'E4', 'G4'], time: 48 }
      ];
      chords.forEach((c) => {
        c.pitches.forEach((p) => {
          generatedNotes.push({
            id: `lofi-${c.time}-${p}`,
            pitch: p,
            time: c.time,
            duration: 14,
            velocity: 0.75
          });
        });
      });
    } else {
      const arpNotes = ['C4', 'G4', 'D#4', 'G4', 'G#3', 'D#4', 'C4', 'D#4'];
      for (let bar = 0; bar < 4; bar++) {
        arpNotes.forEach((p, idx) => {
          generatedNotes.push({
            id: `arp-${bar}-${idx}`,
            pitch: p,
            time: bar * 16 + idx * 2,
            duration: 2,
            velocity: 0.85
          });
        });
      }
    }

    updateNotes(generatedNotes);
    setShowChordMenu(false);
  };

  // Arpeggiate stacked chords into 16th-note runs (cycles up -> down -> updown)
  const handleArpeggiate = () => {
    if (notes.length === 0) return;
    const byTime = new Map<number, Note[]>();
    notes.forEach((n) => {
      const arr = byTime.get(n.time) || [];
      arr.push(n);
      byTime.set(n.time, arr);
    });

    const pitchOrder = (p: string) => {
      const idx = PITCH_LIST.indexOf(p);
      return idx === -1 ? 999 : PITCH_LIST.length - idx;
    };

    const nextNotes: Note[] = [];
    Array.from(byTime.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([startTime, group]) => {
        const sorted = [...group].sort((a, b) => pitchOrder(a.pitch) - pitchOrder(b.pitch));
        if (sorted.length <= 1) {
          nextNotes.push(...sorted);
          return;
        }

        const seq =
          arpMode === 'down'
            ? [...sorted].reverse()
            : arpMode === 'updown' && sorted.length > 2
            ? [...sorted, ...sorted.slice(1, -1).reverse()]
            : sorted;

        const span = Math.max(seq.length * 2, sorted[0].duration);
        const stepSize = 2;
        const stepsCount = Math.max(seq.length, Math.floor(span / stepSize));

        for (let i = 0; i < stepsCount; i++) {
          const src = seq[i % seq.length];
          const time = startTime + i * stepSize;
          if (time >= 64) break;
          nextNotes.push({
            id: `arp-${startTime}-${i}-${Math.random().toString(36).slice(2, 5)}`,
            pitch: src.pitch,
            time,
            duration: stepSize,
            velocity: src.velocity
          });
        }
      });

    updateNotes(nextNotes);
    setArpMode((m) => (m === 'up' ? 'down' : m === 'down' ? 'updown' : 'up'));
  };

  const handleTranspose = (semitones: number) => {
    const updated = notes.map((n) => {
      const match = n.pitch.match(/^([A-G][#b]?)(-?\d+)$/);
      if (!match) return n;
      const noteName = match[1];
      const oct = parseInt(match[2], 10);
      const noteIndex = ROOT_KEYS.indexOf(noteName);
      if (noteIndex === -1) return n;

      const totalSemi = oct * 12 + noteIndex + semitones;
      const newOct = Math.floor(totalSemi / 12);
      const newNoteIdx = ((totalSemi % 12) + 12) % 12;
      return { ...n, pitch: `${ROOT_KEYS[newNoteIdx]}${newOct}` };
    });
    updateNotes(updated);
  };

  const isPitchInScale = (pitch: string) => {
    const match = pitch.match(/^([A-G][#b]?)/);
    if (!match) return true;
    const noteName = match[1];
    const rootIndex = ROOT_KEYS.indexOf(selectedRoot);
    const noteIndex = ROOT_KEYS.indexOf(noteName);
    if (rootIndex === -1 || noteIndex === -1) return true;

    const scale = SCALES.find((s) => s.id === selectedScaleId) || SCALES[0];
    const semitonesFromRoot = (noteIndex - rootIndex + 12) % 12;
    return scale.intervals.includes(semitonesFromRoot);
  };

  const handleQuantize = (gridDivision: 1 | 2 | 4) => {
    const quantized = notes.map((n) => ({
      ...n,
      time: Math.round(n.time / gridDivision) * gridDivision
    }));
    updateNotes(quantized);
  };

  const handleExportMidi = () => {
    const blob = exportNotesToMidiFile(
      notes,
      `${activeTrack?.name || 'BeatForge'}_Melody`,
      project.bpm
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeTrack?.name || 'BeatForge_Melody').toLowerCase().replace(/\s+/g, '_')}.mid`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportMidiFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsedNotes = await parseMidiFileToNotes(file);
      if (parsedNotes.length > 0) {
        updateNotes(parsedNotes);
      }
    } catch (err) {
      console.warn('Failed to parse MIDI file:', err);
    }
    e.target.value = '';
  };

  const handleStepVelocityAdjust = (stepIdx: number, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const val = Math.max(0.1, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    setNoteVelocity(parseFloat(val.toFixed(2)));
    const hasNotesAtStep = notes.some((n) => n.time === stepIdx);
    if (hasNotesAtStep) {
      updateNotes(
        notes.map((n) => (n.time === stepIdx ? { ...n, velocity: parseFloat(val.toFixed(2)) } : n))
      );
    }
  };

  const isRootPitch = (pitch: string) => pitch.startsWith(selectedRoot);
  const gridTotalWidth = 64 * stepWidthPx;

  return (
    <div className="flex-1 flex flex-col bg-[#0b0c11] overflow-hidden select-none">
      {/* Piano Roll Toolbar */}
      <div className="h-12 bg-[#121520] border-b border-[#1f2537] px-4 flex items-center justify-between gap-3 overflow-x-auto">
        {/* Track & Instrument Selectors */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-xs uppercase tracking-wider text-purple-400 flex items-center gap-1">
              <Music2 className="w-3.5 h-3.5" />
              PIANO ROLL
            </span>
            <span className="text-gray-500 text-xs">|</span>

            <select
              value={selectedTrackId}
              onChange={(e) => setSelectedTrackId(e.target.value)}
              className="bg-[#181c2a] border border-[#293146] text-xs font-semibold text-white rounded-lg px-2.5 py-1 outline-none cursor-pointer"
            >
              {project.tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.type.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500 font-bold uppercase">Instrument:</span>
            <select
              value={activeTrack?.instrumentId || 'grand-piano'}
              onChange={(e) => handleInstrumentChange(e.target.value as InstrumentId)}
              className="bg-[#181c2a] border border-purple-500/50 text-xs font-semibold text-purple-300 rounded-lg px-2 py-1 outline-none cursor-pointer"
            >
              {INSTRUMENTS_LIST.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Scales, Chords, Arp, Quantize, Zoom */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#181c2a] border border-[#272e42] rounded-lg px-2 py-0.5">
            <span className="text-[10px] text-gray-400 font-bold">SCALE:</span>
            <select
              value={selectedRoot}
              onChange={(e) => setSelectedRoot(e.target.value)}
              className="bg-transparent text-xs font-mono font-bold text-cyan-400 outline-none cursor-pointer"
            >
              {ROOT_KEYS.map((k) => (
                <option key={k} value={k} className="bg-[#181c2a] text-white">
                  {k}
                </option>
              ))}
            </select>
            <select
              value={selectedScaleId}
              onChange={(e) => setSelectedScaleId(e.target.value)}
              className="bg-transparent text-xs font-semibold text-gray-300 outline-none cursor-pointer"
            >
              {SCALES.map((s) => (
                <option key={s.id} value={s.id} className="bg-[#181c2a] text-white">
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Note Duration */}
          <div className="flex items-center bg-[#181c2a] border border-[#272e42] rounded-lg p-0.5">
            {[
              { dur: 2, label: '1/8' },
              { dur: 4, label: '1/4' },
              { dur: 8, label: '1/2' }
            ].map((item) => (
              <button
                key={item.dur}
                onClick={() => setDrawDuration(item.dur)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer ${
                  drawDuration === item.dur ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Chord Generator Click-Toggle Menu */}
          <div ref={chordMenuRef} className="relative">
            <button
              onClick={() => setShowChordMenu((s) => !s)}
              className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-1 shadow-sm cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Chords</span>
              <ChevronDown className="w-3 h-3 text-purple-200" />
            </button>

            {showChordMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-[#141824] border border-[#2b334a] rounded-lg shadow-xl z-30 py-1">
                <button
                  onClick={() => handleGenerateProgression('pop')}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-purple-600/30 hover:text-white cursor-pointer"
                >
                  Pop (I - V - vi - IV)
                </button>
                <button
                  onClick={() => handleGenerateProgression('trap')}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-purple-600/30 hover:text-white cursor-pointer"
                >
                  Dark Trap (i - VI - III - VII)
                </button>
                <button
                  onClick={() => handleGenerateProgression('lofi')}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-purple-600/30 hover:text-white cursor-pointer"
                >
                  Lo-Fi Jazz 7ths (ii - V - I)
                </button>
                <button
                  onClick={() => handleGenerateProgression('uplift')}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-purple-600/30 hover:text-white cursor-pointer"
                >
                  EDM Arpeggiator Run
                </button>
              </div>
            )}
          </div>

          {/* Arpeggiator */}
          <button
            onClick={handleArpeggiate}
            title={`Arpeggiate chords (Next mode: ${arpMode.toUpperCase()})`}
            className="px-2 py-1 rounded bg-[#181c2a] border border-[#272e42] text-amber-300 hover:border-amber-500 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <Zap className="w-3 h-3" />
            <span>Arp ({arpMode.toUpperCase()})</span>
          </button>

          {/* Transpose Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleTranspose(1)}
              title="Transpose Up 1 Semitone"
              className="p-1 rounded bg-[#181c2a] border border-[#272e42] text-gray-300 hover:text-white cursor-pointer"
            >
              <ArrowUp className="w-3 h-3" />
            </button>
            <button
              onClick={() => handleTranspose(-1)}
              title="Transpose Down 1 Semitone"
              className="p-1 rounded bg-[#181c2a] border border-[#272e42] text-gray-300 hover:text-white cursor-pointer"
            >
              <ArrowDown className="w-3 h-3" />
            </button>
          </div>

          {/* Quantize Menu */}
          <div className="flex items-center bg-[#181c2a] border border-[#272e42] rounded-lg p-0.5">
            <span className="text-[9px] font-mono font-bold text-gray-400 px-1">Q:</span>
            {([1, 2, 4] as const).map((div) => (
              <button
                key={div}
                onClick={() => handleQuantize(div)}
                title={`Quantize to 1/${div === 1 ? '16' : div === 2 ? '8' : '4'} Grid`}
                className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-gray-300 hover:text-white hover:bg-purple-600/40 cursor-pointer"
              >
                1/{div === 1 ? '16' : div === 2 ? '8' : '4'}
              </button>
            ))}
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center bg-[#181c2a] border border-[#272e42] rounded-lg p-0.5">
            <button
              onClick={() => setStepWidthPx((w) => Math.max(16, w - 4))}
              className="p-1 text-gray-400 hover:text-white cursor-pointer"
              title="Zoom Out Grid"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <button
              onClick={() => setStepWidthPx((w) => Math.min(48, w + 4))}
              className="p-1 text-gray-400 hover:text-white cursor-pointer"
              title="Zoom In Grid"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
          </div>

          {/* MIDI File Import & Export */}
          <input
            type="file"
            ref={midiFileInputRef}
            accept=".mid,.midi"
            onChange={handleImportMidiFile}
            className="hidden"
          />
          <button
            onClick={() => midiFileInputRef.current?.click()}
            title="Import Standard MIDI File (.mid)"
            className="px-2 py-1 rounded bg-[#181c2a] border border-[#272e42] text-gray-300 hover:text-cyan-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <Upload className="w-3 h-3" />
            <span className="hidden sm:inline">Import MIDI</span>
          </button>

          <button
            onClick={handleExportMidi}
            title="Export Track to Standard MIDI File (.mid)"
            className="px-2 py-1 rounded bg-[#181c2a] border border-[#272e42] text-gray-300 hover:text-emerald-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3 h-3" />
            <span className="hidden sm:inline">Export MIDI</span>
          </button>

          <button
            onClick={() => updateNotes([])}
            title="Clear all notes"
            className="p-1.5 rounded-lg bg-[#181c2a] border border-[#272e42] text-gray-400 hover:text-rose-400 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Piano Roll Grid & Keys Container */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Virtual Piano Keys */}
          <div className="w-20 bg-[#0f1118] border-r border-[#1b1f2e] flex flex-col overflow-y-auto select-none shrink-0 z-10 shadow-lg">
            <div className="h-6 border-b border-[#1b1f2e] bg-[#0f1118] shrink-0" />
            {PITCH_LIST.map((pitch) => {
              const isBlackKey = pitch.includes('#');
              const inScale = isPitchInScale(pitch);
              const isRoot = isRootPitch(pitch);

              return (
                <button
                  key={pitch}
                  onClick={() => handleAuditionKey(pitch)}
                  className={`h-6 shrink-0 text-[10px] font-mono font-bold flex items-center justify-between px-2 transition-all border-b border-[#1b1e2a] cursor-pointer ${
                    isBlackKey
                      ? 'bg-[#151822] hover:bg-[#202535] text-gray-300'
                      : 'bg-[#222838] hover:bg-[#2e374d] text-gray-100'
                  } ${isRoot ? 'border-l-4 border-l-cyan-400 text-cyan-300 font-extrabold' : ''} ${
                    !inScale ? 'opacity-40' : ''
                  }`}
                >
                  <span>{pitch}</span>
                  {isRoot && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
                </button>
              );
            })}
          </div>

          {/* Right Area: 4-Bar Sixteenths Grid */}
          <div ref={gridContainerRef} className="flex-1 overflow-auto bg-[#0a0b10] relative">
            {/* Step Timeline Header */}
            <div
              className="sticky top-0 h-6 bg-[#0f1118] border-b border-[#1b1f2e] flex z-10"
              style={{ width: gridTotalWidth }}
            >
              {Array.from({ length: 64 }).map((_, stepIdx) => {
                const barNum = Math.floor(stepIdx / 16) + 1;
                const beatNum = Math.floor((stepIdx % 16) / 4) + 1;
                const isBarStart = stepIdx % 16 === 0;
                const isBeatStart = stepIdx % 4 === 0;
                const isPlayhead = activePlayheadStep === stepIdx;

                return (
                  <div
                    key={stepIdx}
                    style={{ width: stepWidthPx }}
                    className={`shrink-0 text-[9px] font-mono text-center flex items-center justify-center border-r border-[#161924] ${
                      isPlayhead
                        ? 'bg-cyan-500 text-black font-extrabold'
                        : isBarStart
                        ? 'text-purple-400 font-bold bg-[#141824]'
                        : isBeatStart
                        ? 'text-gray-400'
                        : 'text-gray-600'
                    }`}
                  >
                    {isBarStart ? `Bar ${barNum}` : isBeatStart ? `.${beatNum}` : ''}
                  </div>
                );
              })}
            </div>

            {/* Grid Rows */}
            <div className="flex flex-col" style={{ width: gridTotalWidth }}>
              {PITCH_LIST.map((pitch) => {
                const inScale = isPitchInScale(pitch);
                const isBlackKey = pitch.includes('#');

                return (
                  <div
                    key={pitch}
                    className={`h-6 flex border-b border-[#161a25] relative ${
                      isBlackKey ? 'bg-[#0b0d13]' : 'bg-[#0e1017]'
                    } ${!inScale ? 'bg-opacity-40' : ''}`}
                  >
                    {Array.from({ length: 64 }).map((_, stepIdx) => {
                      const isBeat = stepIdx % 4 === 0;
                      const isBar = stepIdx % 16 === 0;
                      const isPlayhead = activePlayheadStep === stepIdx;

                      const noteStarting = notes.find(
                        (n) => n.pitch === pitch && n.time === stepIdx
                      );
                      const effDur =
                        noteStarting && resizingNote?.id === noteStarting.id
                          ? resizingNote.duration
                          : noteStarting?.duration || 1;

                      return (
                        <div
                          key={stepIdx}
                          onClick={() => handleCellClick(pitch, stepIdx)}
                          style={{ width: stepWidthPx }}
                          className={`shrink-0 h-full border-r relative cursor-pointer transition-colors ${
                            isBar
                              ? 'border-r-[#252d42]'
                              : isBeat
                              ? 'border-r-[#1a1f2e]'
                              : 'border-r-[#131622]'
                          } ${isPlayhead ? 'bg-cyan-900/20' : 'hover:bg-purple-900/20'}`}
                        >
                          {noteStarting && (
                            <div
                              className="absolute top-0.5 bottom-0.5 left-0.5 rounded flex items-center justify-between pl-1.5 pr-1 text-[9px] font-mono font-bold text-white shadow-md z-10 bg-gradient-to-r from-purple-500 to-indigo-500 border border-purple-300"
                              style={{ width: Math.max(stepWidthPx - 4, effDur * stepWidthPx - 3) }}
                            >
                              <span className="truncate">{noteStarting.pitch}</span>
                              {/* Right-edge duration resize handle */}
                              <div
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  resizingNoteRef.current = {
                                    id: noteStarting.id,
                                    startX: e.clientX,
                                    initialDuration: noteStarting.duration,
                                    duration: noteStarting.duration
                                  };
                                  setResizingNote({
                                    id: noteStarting.id,
                                    duration: noteStarting.duration
                                  });
                                }}
                                onClick={(e) => e.stopPropagation()}
                                title="Drag right edge to resize note duration"
                                className="w-1.5 h-full bg-white/30 hover:bg-cyan-300 rounded-r cursor-ew-resize shrink-0"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Velocity Lane */}
        <div className="h-16 bg-[#0d1018] border-t border-[#1f2537] flex shrink-0">
          <div className="w-20 shrink-0 border-r border-[#1b1f2e] flex flex-col items-center justify-center px-1">
            <span className="text-[9px] font-mono font-bold uppercase text-purple-400">VEL</span>
            <span className="text-[10px] font-mono text-gray-300">
              {Math.round(noteVelocity * 100)}%
            </span>
          </div>
          <div className="flex-1 overflow-x-auto flex items-end" style={{ minWidth: 0 }}>
            <div className="h-full flex items-end" style={{ width: gridTotalWidth }}>
              {Array.from({ length: 64 }).map((_, stepIdx) => {
                const notesHere = notes.filter((n) => n.time === stepIdx);
                const maxVel =
                  notesHere.length > 0 ? Math.max(...notesHere.map((n) => n.velocity)) : 0;

                return (
                  <div
                    key={stepIdx}
                    onClick={(e) => handleStepVelocityAdjust(stepIdx, e)}
                    style={{ width: stepWidthPx }}
                    title={
                      notesHere.length > 0
                        ? `Step ${stepIdx + 1} Velocity: ${Math.round(maxVel * 100)}% (click height to change)`
                        : `Step ${stepIdx + 1}`
                    }
                    className={`shrink-0 h-full border-r border-[#161a25] flex items-end justify-center pb-0.5 cursor-ns-resize ${
                      notesHere.length > 0 ? 'bg-purple-950/20' : ''
                    }`}
                  >
                    {maxVel > 0 && (
                      <div
                        className="w-2 rounded-t bg-gradient-to-t from-purple-600 to-cyan-400 pointer-events-none"
                        style={{ height: `${Math.max(12, maxVel * 90)}%` }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
