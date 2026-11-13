import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Trash2,
  Plus,
  RotateCcw,
  Upload,
  SlidersHorizontal,
  ChevronDown,
  Copy,
  Layers
} from 'lucide-react';
import { DAWProject, StepSequence, DrumSoundId, Track } from '../types/daw';
import { AudioEngine } from '../audio/engine';
import { APIClient } from '../api/client';
import { Knob } from './Knob';
import { createDefaultDrums } from '../data/templates';

interface StepSequencerProps {
  project: DAWProject;
  onUpdateProject: (updater: (prev: DAWProject) => DAWProject) => void;
}

const AVAILABLE_SOUNDS: { id: DrumSoundId; name: string }[] = [
  { id: 'kick-punch', name: 'Punchy Kick' },
  { id: 'kick-808', name: '808 Boom Kick' },
  { id: 'snare-trap', name: 'Trap Snare' },
  { id: 'snare-acoustic', name: 'Acoustic Snare' },
  { id: 'hihat-closed', name: 'Closed Hi-Hat' },
  { id: 'hihat-open', name: 'Open Hi-Hat' },
  { id: 'clap', name: 'Layered Clap' },
  { id: 'rimshot', name: 'Wood Rimshot' },
  { id: 'perc-shaker', name: 'Perc Shaker' },
  { id: 'tom-high', name: 'High Tom' },
  { id: 'tom-low', name: 'Low Tom' },
  { id: 'crash', name: 'Crash Cymbal' },
  { id: 'sub-808-hit', name: '808 Sub Hit' }
];

export const StepSequencer: React.FC<StepSequencerProps> = ({ project, onUpdateProject }) => {
  const engine = AudioEngine.getInstance();
  const drumTracks = project.tracks.filter((t) => t.type === 'drum');
  const [selectedDrumTrackId, setSelectedDrumTrackId] = useState<string>(
    drumTracks[0]?.id || project.tracks[0]?.id || ''
  );
  const drumTrack =
    project.tracks.find((t) => t.id === selectedDrumTrackId) || drumTracks[0] || project.tracks[0];
  const drumClip = drumTrack?.clips.find((c) => 'drumSteps' in c) as any;

  const sequences: StepSequence[] = drumClip?.drumSteps || [];
  const activePattern: 'A' | 'B' | 'C' | 'D' = drumTrack?.activeDrumPattern || 'A';
  const stepLength: 16 | 32 | 64 =
    drumTrack?.drumStepLength ||
    ((sequences[0]?.steps.length === 32 ? 32 : sequences[0]?.steps.length === 64 ? 64 : 16) as 16 | 32 | 64);

  const [activeStepIndex, setActiveStepIndex] = useState<number>(-1);
  const [showVelocityEditor, setShowVelocityEditor] = useState<boolean>(false);
  const [showChannelRack, setShowChannelRack] = useState<boolean>(false);
  const [showAddMenu, setShowAddMenu] = useState<boolean>(false);
  const [kitPreset, setKitPreset] = useState<'trap' | 'lofi' | 'edm' | 'desi'>('trap');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetVoiceIdxRef = useRef<number | null>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // Close Add Drum menu on outside click / Escape
  useEffect(() => {
    if (!showAddMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAddMenu(false);
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [showAddMenu]);

  // Follow engine playback position for step light
  useEffect(() => {
    const unsub = engine.subscribe(() => {
      if (!engine.isPlaying) {
        setActiveStepIndex(-1);
        return;
      }
      const beatsPerBar = project.timeSignature[0];
      const sixteenthsPerBar = beatsPerBar * 4;
      const totalSteps = stepLength;
      const currentSixteenth = Math.floor(engine.currentBarPosition * sixteenthsPerBar) % totalSteps;
      setActiveStepIndex(currentSixteenth);
    });

    return () => unsub();
  }, [engine, project.timeSignature, stepLength]);

  const updateSequences = (
    newSeqs: StepSequence[],
    extraTrackPatch?: Partial<Track>
  ) => {
    if (!drumTrack) return;
    onUpdateProject((prev) => {
      const updatedTracks = prev.tracks.map((track) => {
        if (track.id !== drumTrack.id) return track;
        const currentPat = extraTrackPatch?.activeDrumPattern || track.activeDrumPattern || 'A';
        const existingBank: Record<'A' | 'B' | 'C' | 'D', StepSequence[]> = track.drumPatternsBank || {
          A: newSeqs,
          B: [],
          C: [],
          D: []
        };
        const updatedBank = {
          ...existingBank,
          ...(extraTrackPatch?.drumPatternsBank || {}),
          [currentPat]: newSeqs
        };

        let found = false;
        const updatedClips = track.clips.map((clip) => {
          if ('drumSteps' in clip) {
            found = true;
            return { ...clip, drumSteps: newSeqs };
          }
          return clip;
        });

        if (!found) {
          updatedClips.push({
            id: `clip-drum-${Date.now()}`,
            trackId: track.id,
            name: `${track.name} Pattern ${currentPat}`,
            startBar: 0,
            durationBars: 4,
            color: track.color,
            drumSteps: newSeqs
          } as any);
        }

        return {
          ...track,
          ...(extraTrackPatch || {}),
          drumPatternsBank: updatedBank,
          clips: updatedClips
        };
      });
      return { ...prev, tracks: updatedTracks };
    });
  };

  const handleStepToggle = (voiceIndex: number, stepIndex: number) => {
    const newSeqs = sequences.map((seq, vIdx) => {
      if (vIdx !== voiceIndex) return seq;
      const newSteps = [...seq.steps];
      newSteps[stepIndex] = !newSteps[stepIndex];
      return { ...seq, steps: newSteps };
    });
    updateSequences(newSeqs);

    if (!sequences[voiceIndex].steps[stepIndex]) {
      engine.triggerDirectDrum(
        drumTrack.id,
        sequences[voiceIndex].soundId,
        sequences[voiceIndex].volume,
        sequences[voiceIndex].pitch,
        sequences[voiceIndex].customSampleUrl
      );
    }
  };

  const handleAuditionPad = (seq: StepSequence) => {
    engine.triggerDirectDrum(
      drumTrack.id,
      seq.soundId,
      seq.volume,
      seq.pitch,
      seq.customSampleUrl
    );
  };

  const handleVelocityChange = (voiceIndex: number, stepIndex: number, val: number) => {
    const newSeqs = sequences.map((seq, vIdx) => {
      if (vIdx !== voiceIndex) return seq;
      const newVels = seq.velocities ? [...seq.velocities] : new Array(seq.steps.length).fill(0.85);
      newVels[stepIndex] = Math.max(0.1, Math.min(1, val));
      return { ...seq, velocities: newVels };
    });
    updateSequences(newSeqs);
  };

  const handleVoiceParamChange = (voiceIndex: number, param: keyof StepSequence, value: any) => {
    const newSeqs = sequences.map((seq, vIdx) => {
      if (vIdx !== voiceIndex) return seq;
      return { ...seq, [param]: value };
    });
    updateSequences(newSeqs);
  };

  const handleAddVoice = (soundId: DrumSoundId) => {
    const found = AVAILABLE_SOUNDS.find((s) => s.id === soundId);
    const newVoice: StepSequence = {
      soundId,
      name: found ? found.name : 'Drum Voice',
      steps: new Array(stepLength).fill(false),
      velocities: new Array(stepLength).fill(0.85),
      pitch: 0,
      volume: 0.85,
      pan: 0,
      muted: false,
      solo: false
    };
    updateSequences([...sequences, newVoice]);
    setShowAddMenu(false);
  };

  const handleDeleteVoice = (voiceIndex: number) => {
    const newSeqs = sequences.filter((_, idx) => idx !== voiceIndex);
    updateSequences(newSeqs);
  };

  const handleClearPattern = () => {
    const newSeqs = sequences.map((seq) => ({
      ...seq,
      steps: new Array(seq.steps.length).fill(false)
    }));
    updateSequences(newSeqs);
  };

  const handleLoadKit = (preset: 'trap' | 'lofi' | 'edm' | 'desi') => {
    setKitPreset(preset);
    const newKit = createDefaultDrums(preset);
    updateSequences(newKit, { drumStepLength: 16 });
  };

  const handleStepLengthChange = (length: 16 | 32 | 64) => {
    const newSeqs = sequences.map((seq) => {
      const currentLength = seq.steps.length;
      if (currentLength === length) return seq;

      const newSteps = new Array(length).fill(false);
      const newVels = new Array(length).fill(0.85);

      for (let i = 0; i < length; i++) {
        newSteps[i] = seq.steps[i % currentLength] || false;
        newVels[i] = seq.velocities ? seq.velocities[i % currentLength] : 0.85;
      }

      return { ...seq, steps: newSteps, velocities: newVels };
    });
    updateSequences(newSeqs, { drumStepLength: length });
  };

  const handleSwitchPattern = (pat: 'A' | 'B' | 'C' | 'D') => {
    if (!drumTrack || pat === activePattern) return;
    const bank = drumTrack.drumPatternsBank || { A: sequences, B: [], C: [], D: [] };
    const updatedBank = { ...bank, [activePattern]: sequences };
    const nextSeqs =
      updatedBank[pat] && updatedBank[pat].length > 0
        ? updatedBank[pat]
        : sequences.map((s) => ({
            ...s,
            steps: new Array(stepLength).fill(false),
            velocities: new Array(stepLength).fill(0.85)
          }));

    updateSequences(nextSeqs, {
      activeDrumPattern: pat,
      drumPatternsBank: { ...updatedBank, [pat]: nextSeqs }
    });
  };

  const handleDuplicatePatternToNext = () => {
    if (!drumTrack) return;
    const order: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
    const nextPat = order[(order.indexOf(activePattern) + 1) % order.length];
    const cloned = sequences.map((s) => ({
      ...s,
      steps: [...s.steps],
      velocities: s.velocities ? [...s.velocities] : new Array(s.steps.length).fill(0.85)
    }));
    const bank = drumTrack.drumPatternsBank || { A: sequences, B: [], C: [], D: [] };
    updateSequences(cloned, {
      activeDrumPattern: nextPat,
      drumPatternsBank: { ...bank, [activePattern]: sequences, [nextPat]: cloned }
    });
  };

  // Custom Sample Upload to Drum Voice
  const handleTriggerUpload = (vIdx: number) => {
    uploadTargetVoiceIdxRef.current = vIdx;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetIdx = uploadTargetVoiceIdxRef.current;
    if (!file || targetIdx === null || targetIdx === undefined) return;

    try {
      const arrayBuf = await file.arrayBuffer();
      const rawCtx = (window as any).Tone?.getContext()?.rawContext || new AudioContext();
      const audioBuffer = await rawCtx.decodeAudioData(arrayBuf);
      const localUrl = URL.createObjectURL(file);
      const serverUrl = await APIClient.getInstance().uploadAudioClip(file, file.name);
      const sampleUrl = serverUrl || localUrl;

      const channel = engine.channels.get(drumTrack.id);
      if (channel && channel.drumEngine) {
        channel.drumEngine.registerCustomBuffer(sampleUrl, audioBuffer);
      }

      const newSeqs = sequences.map((seq, idx) => {
        if (idx !== targetIdx) return seq;
        return {
          ...seq,
          name: file.name.replace(/\.[^/.]+$/, ''),
          customSampleUrl: sampleUrl
        };
      });
      updateSequences(newSeqs);
    } catch (err) {
      console.error('Error loading custom drum sample', err);
    }
    e.target.value = '';
  };

  // Channel Rack quick updates for any project track
  const handleChannelRackUpdate = (trackId: string, patch: Partial<Track>) => {
    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t))
    }));
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0b0c11] overflow-hidden select-none">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Sequencer Toolbar */}
      <div className="h-12 bg-[#121520] border-b border-[#1f2537] px-4 flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-xs uppercase tracking-wider text-purple-400">
              BEAT MAKER
            </span>
            <span className="text-gray-500 text-xs">|</span>
            {drumTracks.length > 1 ? (
              <select
                value={drumTrack.id}
                onChange={(e) => setSelectedDrumTrackId(e.target.value)}
                className="bg-[#181c2a] border border-[#272e42] rounded px-2 py-0.5 text-xs font-semibold text-gray-200 outline-none cursor-pointer"
              >
                {drumTracks.map((dt) => (
                  <option key={dt.id} value={dt.id}>
                    {dt.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-gray-400 font-semibold">{drumTrack?.name}</span>
            )}
          </div>

          {/* Kit Preset Selector */}
          <div className="flex items-center gap-1 bg-[#181c2a] border border-[#272e42] rounded-lg p-0.5">
            <button
              onClick={() => handleLoadKit('trap')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                kitPreset === 'trap' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              Trap 808
            </button>
            <button
              onClick={() => handleLoadKit('lofi')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                kitPreset === 'lofi' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              Lo-Fi Boom-Bap
            </button>
            <button
              onClick={() => handleLoadKit('desi')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                kitPreset === 'desi' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              Bollywood Drill
            </button>
            <button
              onClick={() => handleLoadKit('edm')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                kitPreset === 'edm' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              EDM 4-on-Floor
            </button>
          </div>
        </div>

        {/* Steps & Controls */}
        <div className="flex items-center gap-2">
          {/* Channel Rack Drawer Toggle */}
          <button
            onClick={() => setShowChannelRack((s) => !s)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              showChannelRack
                ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300'
                : 'bg-[#181c2a] border-[#272e42] text-gray-400 hover:text-white'
            }`}
            title="Toggle Multi-Track Channel Rack"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Rack ({project.tracks.length})</span>
          </button>

          {/* Pattern Chaining: A, B, C, D + Duplicate Pattern */}
          <div className="flex items-center bg-[#181c2a] border border-[#272e42] rounded-lg p-0.5">
            <span className="text-[10px] font-mono text-gray-500 font-bold px-1.5">PAT:</span>
            {(['A', 'B', 'C', 'D'] as const).map((pat) => (
              <button
                key={pat}
                onClick={() => handleSwitchPattern(pat)}
                className={`w-6 h-6 rounded text-[11px] font-mono font-bold transition-all cursor-pointer ${
                  activePattern === pat
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {pat}
              </button>
            ))}
            <button
              onClick={handleDuplicatePatternToNext}
              title={`Clone Pattern ${activePattern} into next slot`}
              className="px-1.5 h-6 text-gray-400 hover:text-cyan-300 cursor-pointer"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>

          {/* 16 / 32 / 64 Steps Switch */}
          <div className="flex items-center bg-[#181c2a] border border-[#272e42] rounded-lg p-0.5">
            {([16, 32, 64] as const).map((len) => (
              <button
                key={len}
                onClick={() => handleStepLengthChange(len)}
                className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                  stepLength === len ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {len}
              </button>
            ))}
          </div>

          {/* Swing Groove Slider */}
          <div className="hidden xl:flex items-center gap-1.5 bg-[#181c2a] border border-[#272e42] rounded-lg px-2.5 py-1">
            <span className="text-[10px] font-mono text-gray-400 font-bold">SWING:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={project.swing || 0}
              onChange={(e) => {
                const s = parseFloat(e.target.value);
                onUpdateProject((prev) => ({ ...prev, swing: s }));
              }}
              className="w-16 accent-purple-500 cursor-pointer"
            />
            <span className="text-[10px] font-mono text-purple-300 w-7 text-right">
              {Math.round((project.swing || 0) * 100)}%
            </span>
          </div>

          {/* Velocity Toggle */}
          <button
            onClick={() => setShowVelocityEditor(!showVelocityEditor)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              showVelocityEditor
                ? 'bg-purple-950/80 border-purple-500 text-purple-300'
                : 'bg-[#181c2a] border-[#272e42] text-gray-400 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Velocity</span>
          </button>

          {/* Clear Pattern */}
          <button
            onClick={handleClearPattern}
            title="Clear all steps in pattern"
            className="p-1.5 rounded-lg bg-[#181c2a] border border-[#272e42] text-gray-400 hover:text-rose-400 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Add Drum Voice Click-Toggle Dropdown */}
          <div ref={addMenuRef} className="relative">
            <button
              onClick={() => setShowAddMenu((s) => !s)}
              className="px-2.5 py-1 rounded-lg bg-[#1e2334] border border-[#303850] text-gray-200 hover:text-white hover:border-purple-500 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Drum</span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {showAddMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-[#141824] border border-[#2b334a] rounded-lg shadow-xl z-30 py-1 max-h-60 overflow-y-auto">
                {AVAILABLE_SOUNDS.map((snd) => (
                  <button
                    key={snd.id}
                    onClick={() => handleAddVoice(snd.id)}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-purple-600/30 hover:text-white transition-colors cursor-pointer"
                  >
                    + {snd.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Collapsible Multi-Track Channel Rack */}
      {showChannelRack && (
        <div className="bg-[#0e111a] border-b border-[#1f2537] px-4 py-2.5 flex items-center gap-3 overflow-x-auto">
          <span className="text-[10px] font-mono uppercase font-bold text-cyan-400 shrink-0">
            CHANNEL RACK:
          </span>
          {project.tracks.map((tr) => (
            <div
              key={tr.id}
              className="bg-[#141824] border border-[#252d42] rounded-lg px-2.5 py-1.5 flex items-center gap-2 shrink-0"
            >
              <button
                onClick={() => {
                  if (tr.type === 'drum') {
                    setSelectedDrumTrackId(tr.id);
                    engine.triggerDirectDrum(tr.id, 'kick-808', 0.85, 0);
                  } else if (tr.type === 'midi') {
                    engine.triggerDirectNote(tr.id, 'C4', 0.85);
                    setTimeout(() => engine.releaseDirectNote(tr.id, 'C4'), 250);
                  }
                }}
                className="w-2.5 h-5 rounded-full cursor-pointer"
                style={{ backgroundColor: tr.color }}
                title="Trigger channel preview"
              />
              <span className="text-xs font-bold text-gray-200 max-w-[90px] truncate">{tr.name}</span>
              <Knob
                label="PAN"
                size="sm"
                min={-1}
                max={1}
                step={0.1}
                value={tr.pan}
                defaultValue={0}
                color="#06b6d4"
                onChange={(v) => handleChannelRackUpdate(tr.id, { pan: v })}
              />
              <Knob
                label="VOL"
                size="sm"
                min={-30}
                max={6}
                step={1}
                value={tr.volume}
                defaultValue={0}
                unit="dB"
                color="#a855f7"
                onChange={(v) => handleChannelRackUpdate(tr.id, { volume: v })}
              />
              <button
                onClick={() => handleChannelRackUpdate(tr.id, { muted: !tr.muted })}
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded cursor-pointer ${
                  tr.muted ? 'bg-rose-700 text-white' : 'bg-[#1d2336] text-gray-400'
                }`}
              >
                M
              </button>
              <button
                onClick={() => handleChannelRackUpdate(tr.id, { solo: !tr.solo })}
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded cursor-pointer ${
                  tr.solo ? 'bg-amber-700 text-white' : 'bg-[#1d2336] text-gray-400'
                }`}
              >
                S
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Step Numbers Ruler Header */}
      <div className="flex bg-[#0f1118] border-b border-[#1b1f2e] text-[10px] font-mono text-gray-400 py-1.5 px-3">
        <div className="w-56 shrink-0 font-bold uppercase tracking-wider text-gray-500 pl-2">
          VOICE & PARAMETERS
        </div>
        <div className="flex-1 flex gap-1">
          {Array.from({ length: stepLength }).map((_, stepIdx) => {
            const isDownbeat = stepIdx % 4 === 0;
            const isCurrent = activeStepIndex === stepIdx;
            return (
              <div
                key={stepIdx}
                className={`flex-1 text-center py-0.5 rounded font-bold transition-all ${
                  isCurrent
                    ? 'bg-cyan-500 text-black font-extrabold shadow-sm shadow-cyan-400'
                    : isDownbeat
                    ? 'text-purple-300 font-extrabold'
                    : 'text-gray-500'
                }`}
              >
                {stepIdx + 1}
              </div>
            );
          })}
        </div>
      </div>

      {/* Sequencer Grid Rows */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {sequences.map((seq, voiceIdx) => {
          return (
            <div
              key={`${seq.soundId}-${voiceIdx}`}
              className="flex items-center bg-[#131620] border border-[#1f2537] hover:border-[#323b56] rounded-xl p-2 gap-2 shadow-sm transition-colors"
            >
              {/* Voice Header / Pad Button */}
              <div className="w-56 shrink-0 flex items-center justify-between pr-2 border-r border-[#1e2335]">
                <div className="flex items-center gap-2 overflow-hidden">
                  <button
                    onClick={() => handleAuditionPad(seq)}
                    title="Click to audition drum voice"
                    className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-700 hover:from-purple-500 hover:to-indigo-600 active:scale-95 text-white flex items-center justify-center font-bold text-xs shadow-md transition-transform shrink-0 cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-current ml-0.5" />
                  </button>

                  <div className="truncate">
                    <div className="text-xs font-bold text-gray-200 truncate">{seq.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <button
                        onClick={() => handleVoiceParamChange(voiceIdx, 'muted', !seq.muted)}
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                          seq.muted
                            ? 'bg-rose-900/60 text-rose-300 border border-rose-600'
                            : 'bg-[#1b2030] text-gray-400 hover:text-white'
                        }`}
                      >
                        M
                      </button>
                      <button
                        onClick={() => handleVoiceParamChange(voiceIdx, 'solo', !seq.solo)}
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                          seq.solo
                            ? 'bg-amber-900/60 text-amber-300 border border-amber-500'
                            : 'bg-[#1b2030] text-gray-400 hover:text-white'
                        }`}
                      >
                        S
                      </button>
                      <button
                        onClick={() => handleTriggerUpload(voiceIdx)}
                        title="Upload custom WAV/MP3 sample to this pad"
                        className="text-gray-500 hover:text-cyan-400 transition-colors cursor-pointer"
                      >
                        <Upload className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Micro knobs for Pitch and Vol */}
                <div className="flex items-center gap-1">
                  <Knob
                    label="PITCH"
                    size="sm"
                    min={-12}
                    max={12}
                    step={1}
                    value={seq.pitch}
                    defaultValue={0}
                    unit="st"
                    color="#06b6d4"
                    onChange={(val) => handleVoiceParamChange(voiceIdx, 'pitch', val)}
                  />
                  <Knob
                    label="VOL"
                    size="sm"
                    min={0}
                    max={1}
                    step={0.05}
                    value={seq.volume}
                    defaultValue={0.85}
                    color="#a855f7"
                    onChange={(val) => handleVoiceParamChange(voiceIdx, 'volume', val)}
                  />
                </div>
              </div>

              {/* Step Buttons Grid */}
              <div className="flex-1 flex gap-1">
                {Array.from({ length: stepLength }).map((_, stepIdx) => {
                  const isActive = seq.steps[stepIdx];
                  const isCurrent = activeStepIndex === stepIdx;
                  const isDownbeat = Math.floor(stepIdx / 4) % 2 === 0;

                  return (
                    <div key={stepIdx} className="flex-1 flex flex-col items-center gap-1">
                      <button
                        onClick={() => handleStepToggle(voiceIdx, stepIdx)}
                        className={`w-full h-10 rounded-lg transition-all relative flex items-center justify-center cursor-pointer ${
                          isActive
                            ? 'bg-gradient-to-t from-purple-600 to-fuchsia-500 shadow-md shadow-purple-900/40 border border-fuchsia-400 scale-[0.98]'
                            : isDownbeat
                            ? 'bg-[#1c2132] hover:bg-[#252c42] border border-[#2b334c]'
                            : 'bg-[#161a27] hover:bg-[#1f2436] border border-[#23283c]'
                        } ${isCurrent ? 'ring-2 ring-cyan-400' : ''}`}
                      >
                        {isActive && (
                          <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_#ffffff]" />
                        )}
                      </button>

                      {showVelocityEditor && (
                        <input
                          type="range"
                          min={0.1}
                          max={1}
                          step={0.05}
                          value={seq.velocities ? seq.velocities[stepIdx] : 0.85}
                          onChange={(e) =>
                            handleVelocityChange(voiceIdx, stepIdx, parseFloat(e.target.value))
                          }
                          className="w-full h-1 daw-slider cursor-pointer"
                          title={`Velocity: ${Math.round(
                            (seq.velocities ? seq.velocities[stepIdx] : 0.85) * 100
                          )}%`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => handleDeleteVoice(voiceIdx)}
                title="Remove voice"
                className="p-1 text-gray-600 hover:text-rose-400 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
