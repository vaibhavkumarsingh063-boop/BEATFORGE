import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Sliders,
  Volume2,
  Music2,
  Waves,
  Zap,
  Activity,
  Layers,
  Save,
  RotateCcw,
  Play,
  Square,
  Radio,
  FolderOpen
} from 'lucide-react';
import { DAWProject, Track, SynthPatch } from '../types/daw';
import { BeatForgeModularSynth, DEFAULT_SYNTH_PATCHES } from '../audio/synthEngine';
import { AudioEngine } from '../audio/engine';
import { MIDIManager } from '../audio/midi';
import { APIClient } from '../api/client';
import { Knob } from './Knob';
import * as Tone from 'tone';

interface SynthStudioProps {
  project: DAWProject;
  onUpdateProject: (updater: (prev: DAWProject) => DAWProject) => void;
}

const OSC_WAVEFORMS: { id: SynthPatch['osc1Wave']; label: string }[] = [
  { id: 'sawtooth', label: 'Sawtooth' },
  { id: 'square', label: 'Square' },
  { id: 'sine', label: 'Sine' },
  { id: 'triangle', label: 'Triangle' }
];

export const SynthStudio: React.FC<SynthStudioProps> = ({ project, onUpdateProject }) => {
  const engine = AudioEngine.getInstance();
  const midiManager = MIDIManager.getInstance();

  // Find MIDI tracks or default to first
  const midiTracks = project.tracks.filter((t) => t.type === 'midi');
  const [selectedTrackId, setSelectedTrackId] = useState<string>(
    midiTracks[0]?.id || project.tracks[0]?.id || ''
  );

  const selectedTrack = project.tracks.find((t) => t.id === selectedTrackId) || project.tracks[0];

  const currentPatch: SynthPatch = selectedTrack?.synthPatch || DEFAULT_SYNTH_PATCHES[0];
  const [patch, setPatch] = useState<SynthPatch>(currentPatch);
  const [customPresets, setCustomPresets] = useState<SynthPatch[]>([]);
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set());
  const [isPatchModalOpen, setIsPatchModalOpen] = useState(false);
  const [patchNameInput, setPatchNameInput] = useState('');
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // Synth instance
  const synthRef = useRef<BeatForgeModularSynth | null>(null);

  useEffect(() => {
    APIClient.getInstance()
      .getPresets()
      .then((list) => {
        if (Array.isArray(list)) setCustomPresets(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedTrack?.synthPatch) {
      setPatch(selectedTrack.synthPatch);
    }
  }, [selectedTrack?.id, selectedTrack?.synthPatch]);

  // Instantiate audio engine synth
  useEffect(() => {
    const gainNode = new Tone.Gain(0.9);
    gainNode.connect(engine.masterEq);

    const synth = new BeatForgeModularSynth(gainNode, patch);
    synthRef.current = synth;

    // Listen to incoming hardware MIDI note events
    const unsubMidi = midiManager.onNote((note, velocity, isNoteOn) => {
      if (isNoteOn && velocity > 0) {
        synth.triggerAttack(note, undefined, velocity);
        setActiveNotes((prev) => new Set([...prev, note]));
      } else {
        synth.triggerRelease(note);
        setActiveNotes((prev) => {
          const next = new Set(prev);
          next.delete(note);
          return next;
        });
      }
    });

    return () => {
      unsubMidi();
      synth.dispose();
      gainNode.dispose();
    };
  }, []);

  // Update synth when patch changes
  useEffect(() => {
    if (synthRef.current) {
      synthRef.current.applyPatch(patch);
    }
  }, [patch]);

  // Handle patch parameter change
  const handlePatchChange = <K extends keyof SynthPatch>(key: K, val: SynthPatch[K]) => {
    const updated = { ...patch, [key]: val };
    setPatch(updated);

    // Save into track in project
    if (selectedTrack) {
      onUpdateProject((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) =>
          t.id === selectedTrack.id ? { ...t, synthPatch: updated } : t
        )
      }));
    }
  };

  const handleAmpEnvChange = (key: keyof SynthPatch['ampEnv'], val: number) => {
    const updated = {
      ...patch,
      ampEnv: { ...patch.ampEnv, [key]: val }
    };
    setPatch(updated);
    if (selectedTrack) {
      onUpdateProject((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) =>
          t.id === selectedTrack.id ? { ...t, synthPatch: updated } : t
        )
      }));
    }
  };

  const handleFilterEnvChange = (key: keyof SynthPatch['filterEnv'], val: number) => {
    const updated = {
      ...patch,
      filterEnv: { ...patch.filterEnv, [key]: val }
    };
    setPatch(updated);
    if (selectedTrack) {
      onUpdateProject((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) =>
          t.id === selectedTrack.id ? { ...t, synthPatch: updated } : t
        )
      }));
    }
  };

  const handleSelectPreset = (p: SynthPatch) => {
    setPatch(p);
    if (selectedTrack) {
      onUpdateProject((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) =>
          t.id === selectedTrack.id ? { ...t, synthPatch: p } : t
        )
      }));
    }
  };

  // Audition a note
  const playAuditionNote = async (note: string) => {
    await Tone.start();
    if (synthRef.current) {
      synthRef.current.triggerAttackRelease(note, '8n', undefined, 0.85);
      setActiveNotes((prev) => new Set([...prev, note]));
      setTimeout(() => {
        setActiveNotes((prev) => {
          const next = new Set(prev);
          next.delete(note);
          return next;
        });
      }, 350);
    }
  };

  // Save custom patch persistently
  const handleSaveCustomPatch = async () => {
    if (!patchNameInput.trim()) return;
    const newPatch: SynthPatch = {
      ...patch,
      id: `custom-patch-${Date.now()}`,
      name: patchNameInput.trim(),
      category: 'User Custom'
    };
    setPatch(newPatch);
    setCustomPresets((prev) => [newPatch, ...prev.filter((p) => p.id !== newPatch.id)]);
    await APIClient.getInstance().savePreset(newPatch);
    if (selectedTrack) {
      onUpdateProject((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) =>
          t.id === selectedTrack.id ? { ...t, synthPatch: newPatch } : t
        )
      }));
    }
    setSaveNotice(`Saved preset "${newPatch.name}" to library!`);
    setIsPatchModalOpen(false);
    setPatchNameInput('');
    setTimeout(() => setSaveNotice(null), 3500);
  };

  return (
    <div className="w-full h-full bg-[#0b0d14] text-gray-200 flex flex-col p-5 overflow-y-auto gap-5 select-none">
      {/* Top Synthesizer Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#1d2335]">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-600 to-purple-600 p-[2px] shadow-xl shadow-cyan-950/40">
            <div className="w-full h-full bg-[#0d101a] rounded-[10px] flex items-center justify-center">
              <Waves className="w-5 h-5 text-cyan-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold text-white tracking-wider uppercase">
                BEATFORGE MODULAR SYNTH
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                POLY-ANALOG
              </span>
            </div>
            <p className="text-xs text-gray-400">
              Dual-oscillator subtractive & FM synthesizer with resonant filter envelopes & LFO
            </p>
          </div>
        </div>

        {/* Patch Selector & Save */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Target Track */}
          <div className="flex items-center gap-1.5 text-xs bg-[#121624] px-2.5 py-1.5 rounded-lg border border-[#21293d]">
            <span className="text-gray-400">Track:</span>
            <select
              value={selectedTrackId}
              onChange={(e) => setSelectedTrackId(e.target.value)}
              className="bg-transparent font-bold text-cyan-300 outline-none cursor-pointer"
            >
              {project.tracks.map((t) => (
                <option key={t.id} value={t.id} className="bg-[#121624] text-white">
                  {t.name} ({t.type})
                </option>
              ))}
            </select>
          </div>

          {/* Preset Selector */}
          <div className="flex items-center gap-1.5 text-xs bg-[#121624] px-2.5 py-1.5 rounded-lg border border-[#21293d]">
            <span className="text-gray-400">Patch:</span>
            <select
              value={patch.id}
              onChange={(e) => {
                const allPatches = [...DEFAULT_SYNTH_PATCHES, ...customPresets];
                const found = allPatches.find((p) => p.id === e.target.value);
                if (found) handleSelectPreset(found);
              }}
              className="bg-transparent font-extrabold text-purple-300 outline-none cursor-pointer"
            >
              {DEFAULT_SYNTH_PATCHES.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#121624] text-white">
                  [{p.category}] {p.name}
                </option>
              ))}
              {customPresets.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#121624] text-cyan-300">
                  [Saved] {p.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => handleSelectPreset(DEFAULT_SYNTH_PATCHES[0])}
            title="Reset to Init Patch"
            className="p-1.5 rounded-lg bg-[#181c2a] border border-[#293246] text-gray-400 hover:text-white transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setIsPatchModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-purple-950 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Patch</span>
          </button>
        </div>
      </div>

      {saveNotice && (
        <div className="bg-emerald-950/80 border border-emerald-600 text-emerald-300 text-xs px-4 py-2 rounded-xl flex items-center justify-between shadow-lg">
          <span>{saveNotice}</span>
        </div>
      )}

      {/* Main Synthesizer Rack Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* COL 1: DUAL OSCILLATORS + SUB + NOISE (4 COLS) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* OSCILLATOR 1 */}
          <div className="bg-[#121522] border border-[#20273a] rounded-2xl p-4 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-[#1b2233]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400" />
                <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
                  OSCILLATOR 1 (PRIMARY)
                </h3>
              </div>
              <span className="text-[10px] font-mono text-cyan-400 font-bold">
                VOL: {Math.round(patch.osc1Vol * 100)}%
              </span>
            </div>

            {/* Waveform Selector */}
            <div className="grid grid-cols-4 gap-1.5">
              {OSC_WAVEFORMS.map((wf) => (
                <button
                  key={wf.id}
                  onClick={() => handlePatchChange('osc1Wave', wf.id)}
                  className={`py-1 rounded text-[10px] font-bold font-mono transition-all cursor-pointer ${
                    patch.osc1Wave === wf.id
                      ? 'bg-cyan-600 text-white shadow-md'
                      : 'bg-[#181d2e] text-gray-400 hover:text-white'
                  }`}
                >
                  {wf.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-2 pt-2">
              <Knob
                label="OCTAVE"
                size="sm"
                min={-2}
                max={2}
                step={1}
                value={patch.osc1Octave}
                defaultValue={0}
                color="#06b6d4"
                onChange={(v) => handlePatchChange('osc1Octave', v)}
              />
              <Knob
                label="SEMI"
                size="sm"
                min={-12}
                max={12}
                step={1}
                value={patch.osc1Semi}
                defaultValue={0}
                unit="st"
                color="#06b6d4"
                onChange={(v) => handlePatchChange('osc1Semi', v)}
              />
              <Knob
                label="DETUNE"
                size="sm"
                min={-50}
                max={50}
                step={1}
                value={patch.osc1Detune}
                defaultValue={0}
                unit="c"
                color="#06b6d4"
                onChange={(v) => handlePatchChange('osc1Detune', v)}
              />
              <Knob
                label="OSC VOL"
                size="sm"
                min={0}
                max={1}
                step={0.05}
                value={patch.osc1Vol}
                defaultValue={0.8}
                color="#06b6d4"
                onChange={(v) => handlePatchChange('osc1Vol', v)}
              />
            </div>
          </div>

          {/* OSCILLATOR 2 */}
          <div className="bg-[#121522] border border-[#20273a] rounded-2xl p-4 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-[#1b2233]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shadow-sm shadow-purple-400" />
                <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
                  OSCILLATOR 2 (HARMONIC)
                </h3>
              </div>
              <span className="text-[10px] font-mono text-purple-400 font-bold">
                VOL: {Math.round(patch.osc2Vol * 100)}%
              </span>
            </div>

            {/* Waveform Selector */}
            <div className="grid grid-cols-4 gap-1.5">
              {OSC_WAVEFORMS.map((wf) => (
                <button
                  key={wf.id}
                  onClick={() => handlePatchChange('osc2Wave', wf.id)}
                  className={`py-1 rounded text-[10px] font-bold font-mono transition-all cursor-pointer ${
                    patch.osc2Wave === wf.id
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'bg-[#181d2e] text-gray-400 hover:text-white'
                  }`}
                >
                  {wf.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-2 pt-2">
              <Knob
                label="OCTAVE"
                size="sm"
                min={-2}
                max={2}
                step={1}
                value={patch.osc2Octave}
                defaultValue={0}
                color="#a855f7"
                onChange={(v) => handlePatchChange('osc2Octave', v)}
              />
              <Knob
                label="SEMI"
                size="sm"
                min={-12}
                max={12}
                step={1}
                value={patch.osc2Semi}
                defaultValue={7}
                unit="st"
                color="#a855f7"
                onChange={(v) => handlePatchChange('osc2Semi', v)}
              />
              <Knob
                label="DETUNE"
                size="sm"
                min={-50}
                max={50}
                step={1}
                value={patch.osc2Detune}
                defaultValue={8}
                unit="c"
                color="#a855f7"
                onChange={(v) => handlePatchChange('osc2Detune', v)}
              />
              <Knob
                label="OSC VOL"
                size="sm"
                min={0}
                max={1}
                step={0.05}
                value={patch.osc2Vol}
                defaultValue={0.6}
                color="#a855f7"
                onChange={(v) => handlePatchChange('osc2Vol', v)}
              />
            </div>
          </div>

          {/* SUB OSCILLATOR & NOISE */}
          <div className="bg-[#121522] border border-[#20273a] rounded-2xl p-4 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-[#1b2233]">
              <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
                SUB-OSC & NOISE GENERATOR
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Sub Osc */}
              <div className="flex flex-col gap-2 bg-[#171b2b] p-3 rounded-xl border border-[#242c40]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-200">SUB BASS</span>
                  <input
                    type="checkbox"
                    checked={patch.subOsc}
                    onChange={(e) => handlePatchChange('subOsc', e.target.checked)}
                    className="accent-cyan-400 cursor-pointer w-4 h-4"
                  />
                </div>
                <div className="flex items-center justify-center">
                  <Knob
                    label="SUB VOL"
                    size="sm"
                    min={0}
                    max={1}
                    step={0.05}
                    value={patch.subOscVol}
                    defaultValue={0.5}
                    color="#38bdf8"
                    onChange={(v) => handlePatchChange('subOscVol', v)}
                  />
                </div>
              </div>

              {/* Noise */}
              <div className="flex flex-col gap-2 bg-[#171b2b] p-3 rounded-xl border border-[#242c40]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-200">NOISE</span>
                  <select
                    value={patch.noiseType}
                    onChange={(e) =>
                      handlePatchChange('noiseType', e.target.value as SynthPatch['noiseType'])
                    }
                    className="bg-[#121522] text-[10px] font-mono text-gray-300 rounded px-1.5 py-0.5 outline-none cursor-pointer"
                  >
                    <option value="off">Off</option>
                    <option value="white">White</option>
                    <option value="pink">Pink</option>
                  </select>
                </div>
                <div className="flex items-center justify-center">
                  <Knob
                    label="NOISE VOL"
                    size="sm"
                    min={0}
                    max={1}
                    step={0.05}
                    value={patch.noiseVol}
                    defaultValue={0.05}
                    color="#94a3b8"
                    onChange={(v) => handlePatchChange('noiseVol', v)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* COL 2: RESONANT FILTER & ENVELOPES (5 COLS) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* DUAL RESONANT FILTER */}
          <div className="bg-[#121522] border border-[#20273a] rounded-2xl p-4 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-[#1b2233]">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
                  ANALOG 24dB RESONANT FILTER
                </h3>
              </div>
              <div className="flex gap-1">
                {(['lowpass', 'highpass', 'bandpass'] as const).map((ft) => (
                  <button
                    key={ft}
                    onClick={() => handlePatchChange('filterType', ft)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all ${
                      patch.filterType === ft
                        ? 'bg-emerald-600 text-white shadow'
                        : 'bg-[#181d2e] text-gray-400 hover:text-white'
                    }`}
                  >
                    {ft.replace('pass', '')}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 my-auto py-2">
              <Knob
                label="CUTOFF FREQ"
                size="md"
                min={20}
                max={20000}
                step={50}
                value={patch.filterCutoff}
                defaultValue={3500}
                unit="Hz"
                color="#10b981"
                onChange={(v) => handlePatchChange('filterCutoff', v)}
              />
              <Knob
                label="RESONANCE"
                size="md"
                min={0}
                max={20}
                step={0.2}
                value={patch.filterResonance}
                defaultValue={2.5}
                unit="Q"
                color="#10b981"
                onChange={(v) => handlePatchChange('filterResonance', v)}
              />
            </div>
          </div>

          {/* AMP ADSR ENVELOPE */}
          <div className="bg-[#121522] border border-[#20273a] rounded-2xl p-4 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-[#1b2233]">
              <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
                AMPLITUDE ENVELOPE (AMP ADSR)
              </h3>
              <span className="text-[10px] font-mono text-cyan-400 font-bold">VCA</span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <Knob
                label="ATTACK"
                size="sm"
                min={0.001}
                max={2.5}
                step={0.01}
                value={patch.ampEnv.attack}
                defaultValue={0.01}
                unit="s"
                color="#06b6d4"
                onChange={(v) => handleAmpEnvChange('attack', v)}
              />
              <Knob
                label="DECAY"
                size="sm"
                min={0.01}
                max={4}
                step={0.02}
                value={patch.ampEnv.decay}
                defaultValue={0.3}
                unit="s"
                color="#06b6d4"
                onChange={(v) => handleAmpEnvChange('decay', v)}
              />
              <Knob
                label="SUSTAIN"
                size="sm"
                min={0}
                max={1}
                step={0.05}
                value={patch.ampEnv.sustain}
                defaultValue={0.7}
                color="#06b6d4"
                onChange={(v) => handleAmpEnvChange('sustain', v)}
              />
              <Knob
                label="RELEASE"
                size="sm"
                min={0.01}
                max={5}
                step={0.05}
                value={patch.ampEnv.release}
                defaultValue={0.35}
                unit="s"
                color="#06b6d4"
                onChange={(v) => handleAmpEnvChange('release', v)}
              />
            </div>
          </div>

          {/* FILTER ADSR MODULATION ENVELOPE */}
          <div className="bg-[#121522] border border-[#20273a] rounded-2xl p-4 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-[#1b2233]">
              <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
                FILTER ENVELOPE & MODULATION
              </h3>
              <span className="text-[10px] font-mono text-emerald-400 font-bold">VCF</span>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              <Knob
                label="F-ATTACK"
                size="sm"
                min={0.001}
                max={2.5}
                step={0.01}
                value={patch.filterEnv.attack}
                defaultValue={0.02}
                unit="s"
                color="#10b981"
                onChange={(v) => handleFilterEnvChange('attack', v)}
              />
              <Knob
                label="F-DECAY"
                size="sm"
                min={0.01}
                max={4}
                step={0.02}
                value={patch.filterEnv.decay}
                defaultValue={0.4}
                unit="s"
                color="#10b981"
                onChange={(v) => handleFilterEnvChange('decay', v)}
              />
              <Knob
                label="F-SUSTAIN"
                size="sm"
                min={0}
                max={1}
                step={0.05}
                value={patch.filterEnv.sustain}
                defaultValue={0.3}
                color="#10b981"
                onChange={(v) => handleFilterEnvChange('sustain', v)}
              />
              <Knob
                label="F-RELEASE"
                size="sm"
                min={0.01}
                max={5}
                step={0.05}
                value={patch.filterEnv.release}
                defaultValue={0.4}
                unit="s"
                color="#10b981"
                onChange={(v) => handleFilterEnvChange('release', v)}
              />
              <Knob
                label="ENV DEPTH"
                size="sm"
                min={-8000}
                max={8000}
                step={100}
                value={patch.filterEnv.amount}
                defaultValue={2500}
                unit="Hz"
                color="#f59e0b"
                onChange={(v) => handleFilterEnvChange('amount', v)}
              />
            </div>
          </div>
        </div>

        {/* COL 3: LFO, UNISON, GLIDE & INSTANT AUDITION KEYBOARD (3 COLS) */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          {/* LFO MODULATOR */}
          <div className="bg-[#121522] border border-[#20273a] rounded-2xl p-4 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-[#1b2233]">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-pink-400" />
                <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
                  LFO MODULATOR
                </h3>
              </div>
              <select
                value={patch.lfoTarget}
                onChange={(e) =>
                  handlePatchChange('lfoTarget', e.target.value as SynthPatch['lfoTarget'])
                }
                className="bg-[#171b2b] text-[10px] font-mono text-pink-300 rounded px-1.5 py-0.5 outline-none cursor-pointer"
              >
                <option value="cutoff">Dest: Filter Cutoff</option>
                <option value="pitch">Dest: Pitch Vibrato</option>
                <option value="volume">Dest: Tremolo</option>
                <option value="pan">Dest: Auto-Pan</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 my-auto">
              <Knob
                label="LFO RATE"
                size="sm"
                min={0.1}
                max={20}
                step={0.1}
                value={patch.lfoRate}
                defaultValue={4.5}
                unit="Hz"
                color="#ec4899"
                onChange={(v) => handlePatchChange('lfoRate', v)}
              />
              <Knob
                label="LFO DEPTH"
                size="sm"
                min={0}
                max={1}
                step={0.05}
                value={patch.lfoDepth}
                defaultValue={0.25}
                color="#ec4899"
                onChange={(v) => handlePatchChange('lfoDepth', v)}
              />
            </div>
          </div>

          {/* UNISON SPREAD & GLIDE PORTAMENTO */}
          <div className="bg-[#121522] border border-[#20273a] rounded-2xl p-4 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-[#1b2233]">
              <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
                UNISON & GLIDE
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Knob
                label="UNISON VOICES"
                size="sm"
                min={1}
                max={5}
                step={1}
                value={patch.unison}
                defaultValue={3}
                color="#38bdf8"
                onChange={(v) => handlePatchChange('unison', v)}
              />
              <Knob
                label="GLIDE TIME"
                size="sm"
                min={0}
                max={0.5}
                step={0.01}
                value={patch.portamento}
                defaultValue={0.04}
                unit="s"
                color="#818cf8"
                onChange={(v) => handlePatchChange('portamento', v)}
              />
            </div>
          </div>

          {/* QUICK AUDITION PIANO CHIPS */}
          <div className="bg-[#121522] border border-[#20273a] rounded-2xl p-4 flex flex-col gap-3 shadow-xl flex-1 justify-between">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-[#1b2233]">
                <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
                  INSTANT AUDITION
                </h3>
                <span className="text-[10px] font-mono text-gray-400">OCTAVE 4</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                Click any note or use your computer / MIDI keyboard to play in real-time.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-1.5 my-2">
              {['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'].map((n) => (
                <button
                  key={n}
                  onClick={() => playAuditionNote(n)}
                  className={`py-3 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                    activeNotes.has(n)
                      ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-400/50 scale-95'
                      : 'bg-[#181e2f] text-gray-200 hover:bg-cyan-900/60 hover:text-white border border-[#28324a]'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>

            <div className="text-[10px] text-center font-mono text-gray-500">
              Hardware MIDI controller active & listening
            </div>
          </div>
        </div>
      </div>

      {/* Save Patch Modal */}
      {isPatchModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121522] border border-[#27324c] rounded-2xl p-6 max-w-sm w-full flex flex-col gap-4 shadow-2xl">
            <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">
              SAVE SYNTH PRESET PATCH
            </h3>
            <p className="text-xs text-gray-400">
              Name your custom dual-oscillator patch to store it in your project database.
            </p>
            <input
              type="text"
              placeholder="e.g. Neon Cyber Pluck"
              value={patchNameInput}
              onChange={(e) => setPatchNameInput(e.target.value)}
              className="bg-[#181e2f] border border-[#2b3752] rounded-lg px-3 py-2 text-xs font-bold text-white outline-none focus:border-purple-500"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsPatchModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCustomPatch}
                className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md"
              >
                Save Patch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
