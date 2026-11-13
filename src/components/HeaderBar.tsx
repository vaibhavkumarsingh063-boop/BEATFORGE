import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Square,
  Circle,
  Volume2,
  Undo2,
  Redo2,
  Download,
  FolderOpen,
  Sliders,
  Music2,
  Grid,
  Mic,
  Disc3,
  Layers,
  Sparkles,
  Wifi,
  Database,
  Waves,
  Gauge,
  Save,
  Check
} from 'lucide-react';
import { DAWProject } from '../types/daw';
import { AudioEngine } from '../audio/engine';
import { MIDIManager } from '../audio/midi';
import { APIClient, BackendStatus } from '../api/client';

export type DAWView =
  | 'arrangement'
  | 'sequencer'
  | 'pianoroll'
  | 'synth'
  | 'mixer'
  | 'vocal'
  | 'mastering'
  | 'samples';

interface HeaderBarProps {
  project: DAWProject;
  activeView: DAWView;
  onViewChange: (view: DAWView) => void;
  onUpdateProject: (updater: (prev: DAWProject) => DAWProject) => void;
  onOpenDashboard: () => void;
  onOpenExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  project,
  activeView,
  onViewChange,
  onUpdateProject,
  onOpenDashboard,
  onOpenExport,
  onUndo,
  onRedo,
  canUndo,
  canRedo
}) => {
  const engine = AudioEngine.getInstance();
  const midiManager = MIDIManager.getInstance();

  const [isPlaying, setIsPlaying] = useState(engine.isPlaying);
  const [isRecording, setIsRecording] = useState(engine.isRecording);
  const [isMetronome, setIsMetronome] = useState(engine.isMetronomeEnabled);
  const [currentBar, setCurrentBar] = useState(engine.currentBarPosition);
  const [isEditingName, setIsEditingName] = useState(false);
  const [projectName, setProjectName] = useState(project.name);
  const [leftMeterVal, setLeftMeterVal] = useState(0);
  const [rightMeterVal, setRightMeterVal] = useState(0);
  const [midiConnected, setMidiConnected] = useState(false);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>({
    online: false,
    message: 'Checking...'
  });
  const [justSaved, setJustSaved] = useState(false);
  const [isCountIn, setIsCountIn] = useState(engine.isCountIn);

  const tapTimesRef = useRef<number[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    setProjectName(project.name);
  }, [project.name]);

  // Sync engine events, meters, and API client status
  useEffect(() => {
    const unsub = engine.subscribe(() => {
      setIsPlaying(engine.isPlaying);
      setIsRecording(engine.isRecording);
      setIsMetronome(engine.isMetronomeEnabled);
      setIsCountIn(engine.isCountIn);
      setCurrentBar(engine.currentBarPosition);
    });

    const apiClient = APIClient.getInstance();
    apiClient.checkHealth().then(setBackendStatus);
    const unsubStatus = apiClient.onStatusChange(setBackendStatus);

    midiManager.init().then(() => {
      setMidiConnected(midiManager.devices.length > 0);
    });

    const toPercent = (rawVal: number | number[]) => {
      const db = Array.isArray(rawVal) ? rawVal[0] : rawVal;
      if (!Number.isFinite(db)) return 0;
      return Math.max(0, Math.min(100, ((db + 48) / 48) * 100));
    };

    const updateMeter = () => {
      if (engine.isInitialized && engine.masterMeterLeft && engine.masterMeterRight) {
        setLeftMeterVal(toPercent(engine.masterMeterLeft.getValue()));
        setRightMeterVal(toPercent(engine.masterMeterRight.getValue()));
      } else {
        setLeftMeterVal(0);
        setRightMeterVal(0);
      }
      animationFrameRef.current = requestAnimationFrame(updateMeter);
    };

    animationFrameRef.current = requestAnimationFrame(updateMeter);

    return () => {
      unsub();
      unsubStatus();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [engine, midiManager]);

  const handlePlayToggle = async () => {
    if (isPlaying || isCountIn) {
      engine.pause();
    } else if (project.countInBars && project.countInBars > 0 && currentBar === 0) {
      await engine.playWithCountIn(project.countInBars);
    } else {
      await engine.play();
    }
  };

  const handleStop = () => {
    engine.stop();
  };

  const handleRecordToggle = async () => {
    if (isRecording) {
      engine.isRecording = false;
      setIsRecording(false);
    } else {
      await engine.playWithCountIn(project.countInBars || 0);
      engine.isRecording = true;
      setIsRecording(true);
    }
  };

  const handleManualSave = async () => {
    await APIClient.getInstance().saveProject(project);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
  };

  const handleMetronomeToggle = () => {
    const state = engine.toggleMetronome();
    setIsMetronome(state);
  };

  const handleLoopToggle = () => {
    onUpdateProject((prev) => ({
      ...prev,
      loopEnabled: !prev.loopEnabled
    }));
  };

  const handleBpmChange = (newBpm: number) => {
    const bpm = Math.max(40, Math.min(300, newBpm));
    engine.setBpm(bpm);
    onUpdateProject((prev) => ({ ...prev, bpm }));
  };

  const handleTapTempo = () => {
    const now = Date.now();
    const times = tapTimesRef.current.filter((t) => now - t < 2500);
    times.push(now);
    tapTimesRef.current = times;

    if (times.length > 1) {
      const diffs = [];
      for (let i = 1; i < times.length; i++) {
        diffs.push(times[i] - times[i - 1]);
      }
      const avgMs = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const calculatedBpm = Math.round(60000 / avgMs);
      if (calculatedBpm >= 40 && calculatedBpm <= 300) {
        handleBpmChange(calculatedBpm);
      }
    }
  };

  // Convert current bar to Bars:Beats:Ticks string
  const formatBarTime = (barVal: number) => {
    const beatsPerBar = project.timeSignature[0];
    const bar = Math.floor(barVal) + 1;
    const fraction = barVal - Math.floor(barVal);
    const beat = Math.floor(fraction * beatsPerBar) + 1;
    const tick = Math.floor((fraction * beatsPerBar - (beat - 1)) * 4) + 1;
    return `${String(bar).padStart(3, '0')} : ${String(beat).padStart(2, '0')} : ${String(tick).padStart(2, '0')}`;
  };

  return (
    <header className="h-14 bg-[#0e1017] border-b border-[#1d2230] px-3 flex items-center justify-between text-sm select-none z-30">
      {/* Brand & Project Info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 group cursor-pointer" onClick={onOpenDashboard}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-400 p-[1.5px] shadow-lg shadow-purple-900/30">
            <div className="w-full h-full bg-[#0b0c11] rounded-[7px] flex items-center justify-center">
              <Disc3 className="w-4 h-4 text-purple-400 group-hover:rotate-180 transition-transform duration-700" />
            </div>
          </div>
          <div className="hidden sm:block">
            <div className="font-extrabold text-xs tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-fuchsia-300 to-cyan-400 uppercase">
              BEATFORGE
            </div>
            <div className="text-[9px] font-mono tracking-widest text-gray-500 uppercase -mt-0.5">
              STUDIO DAW
            </div>
          </div>
        </div>

        <div className="h-5 w-[1px] bg-[#222738]" />

        {/* Project Name editable */}
        {isEditingName ? (
          <input
            type="text"
            value={projectName}
            autoFocus
            onBlur={() => {
              setIsEditingName(false);
              onUpdateProject((p) => ({ ...p, name: projectName || 'Untitled Beat' }));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setIsEditingName(false);
                onUpdateProject((p) => ({ ...p, name: projectName || 'Untitled Beat' }));
              }
            }}
            onChange={(e) => setProjectName(e.target.value)}
            className="bg-[#181c28] border border-purple-500 rounded px-2 py-0.5 text-xs text-white outline-none w-36 font-semibold"
          />
        ) : (
          <div
            onClick={() => setIsEditingName(true)}
            className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-[#181c28] cursor-pointer text-xs font-semibold text-gray-200 transition-colors"
            title="Click to rename project"
          >
            <span className="max-w-[130px] truncate">{project.name}</span>
            <span className="text-[10px] text-gray-500">✎</span>
          </div>
        )}

        {/* Undo / Redo */}
        <div className="hidden md:flex items-center gap-1">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-[#1b202e] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-[#1b202e] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Transport & Tempo Section */}
      <div className="flex items-center gap-2 lg:gap-4">
        {/* Playback Controls */}
        <div className="flex items-center bg-[#141722] border border-[#23293d] rounded-lg p-1 shadow-inner gap-1">
          <button
            onClick={handleStop}
            title="Stop & Return to Zero"
            className="p-1.5 rounded hover:bg-[#202638] text-gray-400 hover:text-white transition-colors"
          >
            <Square className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handlePlayToggle}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            className={`px-3 py-1.5 rounded flex items-center gap-1.5 font-semibold text-xs transition-all ${
              isPlaying
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50'
                : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white'
            }`}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span className="hidden sm:inline">{isPlaying ? 'PAUSE' : 'PLAY'}</span>
          </button>

          <button
            onClick={handleRecordToggle}
            title="Record Audio / MIDI"
            className={`p-1.5 rounded transition-all flex items-center justify-center ${
              isRecording
                ? 'bg-rose-600 text-white animate-pulse shadow-lg shadow-rose-900/50'
                : 'hover:bg-[#202638] text-rose-400 hover:text-rose-300'
            }`}
          >
            <Circle className={`w-3.5 h-3.5 ${isRecording ? 'fill-current' : ''}`} />
          </button>
        </div>

        {/* LED Time & Bar Display */}
        <div className="hidden sm:flex flex-col items-center justify-center px-3 py-1 bg-[#090b10] border border-[#1d2334] rounded-lg shadow-inner">
          <span className="font-mono text-xs font-bold text-cyan-400 tracking-wider">
            {formatBarTime(currentBar)}
          </span>
          <span className="text-[8px] uppercase tracking-widest text-gray-500 font-mono -mt-0.5">
            BAR : BEAT : TICK
          </span>
        </div>

        {/* BPM & Time Signature */}
        <div className="flex items-center gap-1.5 bg-[#141722] border border-[#23293d] rounded-lg px-2 py-1">
          <div className="flex flex-col">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400 font-mono font-bold">BPM</span>
              <input
                type="number"
                min={40}
                max={300}
                value={project.bpm}
                onChange={(e) => handleBpmChange(Number(e.target.value))}
                className="w-11 bg-[#0b0d14] text-center font-mono font-bold text-xs text-purple-300 rounded border border-[#2b3248] focus:border-purple-400 outline-none"
              />
            </div>
            <button
              onClick={handleTapTempo}
              className="text-[8px] text-gray-500 hover:text-purple-300 font-mono tracking-wider uppercase text-left transition-colors"
              title="Click repeatedly to tap tempo"
            >
              TAP TEMPO
            </button>
          </div>

          <div className="h-6 w-[1px] bg-[#22283a]" />

          {/* Interactive Time Signature */}
          <div className="text-center px-1">
            <select
              value={`${project.timeSignature[0]}/${project.timeSignature[1]}`}
              onChange={(e) => {
                const [num, den] = e.target.value.split('/').map(Number);
                onUpdateProject((p) => ({ ...p, timeSignature: [num, den] as [number, number] }));
              }}
              title="Time Signature"
              className="bg-transparent text-xs font-mono font-bold text-gray-200 hover:text-cyan-300 outline-none cursor-pointer"
            >
              <option value="4/4" className="bg-[#121520]">4/4</option>
              <option value="3/4" className="bg-[#121520]">3/4</option>
              <option value="6/8" className="bg-[#121520]">6/8</option>
            </select>
            <div className="text-[8px] text-gray-500 font-mono">METER</div>
          </div>
        </div>

        {/* Metronome, Count-In & Loop Toggles */}
        <div className="hidden md:flex items-center gap-1">
          <button
            onClick={handleMetronomeToggle}
            title="Toggle Metronome (C)"
            className={`px-2 py-1.5 rounded text-xs font-mono font-semibold transition-all border cursor-pointer ${
              isMetronome
                ? 'bg-purple-950/70 border-purple-500 text-purple-300 shadow-sm shadow-purple-900/30'
                : 'bg-[#141722] border-[#23293d] text-gray-400 hover:text-white'
            }`}
          >
            METRO
          </button>

          <button
            onClick={() =>
              onUpdateProject((p) => ({
                ...p,
                countInBars: p.countInBars ? 0 : 1
              }))
            }
            title="Toggle 1-Bar Count-In Pre-Roll"
            className={`px-2 py-1.5 rounded text-xs font-mono font-semibold transition-all border cursor-pointer ${
              project.countInBars
                ? 'bg-amber-950/70 border-amber-500 text-amber-300'
                : 'bg-[#141722] border-[#23293d] text-gray-400 hover:text-white'
            }`}
          >
            {isCountIn ? 'COUNT...' : '1-BAR'}
          </button>

          <button
            onClick={handleLoopToggle}
            title="Toggle Loop Mode (L)"
            className={`px-2 py-1.5 rounded text-xs font-mono font-semibold transition-all border cursor-pointer ${
              project.loopEnabled
                ? 'bg-cyan-950/70 border-cyan-500 text-cyan-300 shadow-sm shadow-cyan-900/30'
                : 'bg-[#141722] border-[#23293d] text-gray-400 hover:text-white'
            }`}
          >
            LOOP
          </button>
        </div>

        {/* Master Stereo Peak VU Meter */}
        <div className="hidden xl:flex items-center gap-2 bg-[#0d0f17] border border-[#1e2334] rounded-lg px-2.5 py-1">
          <Volume2 className="w-3.5 h-3.5 text-gray-400" />
          <div className="flex flex-col gap-1 w-20">
            {/* L Bar */}
            <div className="h-1.5 bg-[#181b28] rounded-full overflow-hidden flex">
              <div
                className="h-full vu-meter-bg transition-all duration-75"
                style={{ width: `${leftMeterVal}%` }}
              />
            </div>
            {/* R Bar */}
            <div className="h-1.5 bg-[#181b28] rounded-full overflow-hidden flex">
              <div
                className="h-full vu-meter-bg transition-all duration-75"
                style={{ width: `${rightMeterVal}%` }}
              />
            </div>
          </div>
          <span className="text-[9px] font-mono text-gray-500">MSTR</span>
        </div>
      </div>

      {/* Navigation Switcher & Actions */}
      <div className="flex items-center gap-2">
        {/* View Switchers */}
        <div className="flex items-center bg-[#121520] border border-[#212739] rounded-lg p-0.5">
          <button
            onClick={() => onViewChange('arrangement')}
            title="Arrangement Timeline"
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all ${
              activeView === 'arrangement'
                ? 'bg-purple-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Arranger</span>
          </button>

          <button
            onClick={() => onViewChange('sequencer')}
            title="Drum Beat Maker & Step Sequencer"
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all ${
              activeView === 'sequencer'
                ? 'bg-purple-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Drums</span>
          </button>

          <button
            onClick={() => onViewChange('pianoroll')}
            title="Piano Roll & Melody Composer"
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
              activeView === 'pianoroll'
                ? 'bg-purple-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Music2 className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Piano Roll</span>
          </button>

          <button
            onClick={() => onViewChange('synth')}
            title="Modular Sound Design Synthesizer"
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
              activeView === 'synth'
                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Waves className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Synth</span>
          </button>

          <button
            onClick={() => onViewChange('mixer')}
            title="Mixer Console & Channel Strip FX"
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
              activeView === 'mixer'
                ? 'bg-purple-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Mixer</span>
          </button>

          <button
            onClick={() => onViewChange('vocal')}
            title="Audio Recording, Import & Auto-Tune Studio"
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
              activeView === 'vocal'
                ? 'bg-purple-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Vocals & FX</span>
          </button>

          <button
            onClick={() => onViewChange('mastering')}
            title="Dedicated Professional Mastering Studio"
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
              activeView === 'mastering'
                ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Gauge className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Mastering</span>
          </button>

          <button
            onClick={() => onViewChange('samples')}
            title="Built-in Sample Library"
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all ${
              activeView === 'samples'
                ? 'bg-purple-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Samples</span>
          </button>
        </div>

        {/* Database / Cloud status badge */}
        <div
          title={backendStatus.online ? 'Cloud Database Connected (Synced)' : 'Offline Studio Mode (Local IndexedDB Active)'}
          className={`hidden xl:flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded border transition-colors ${
            backendStatus.online
              ? 'border-emerald-600/40 bg-emerald-950/40 text-emerald-400'
              : 'border-amber-600/40 bg-amber-950/30 text-amber-400'
          }`}
        >
          <Database className="w-3 h-3" />
          <span>{backendStatus.online ? 'DB: SYNCED' : 'LOCAL DB'}</span>
        </div>

        {/* MIDI status badge */}
        <div
          title={midiConnected ? 'MIDI Keyboard Connected' : 'No hardware MIDI keyboard detected'}
          className={`hidden 2xl:flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded border ${
            midiConnected
              ? 'border-emerald-600/40 bg-emerald-950/40 text-emerald-400'
              : 'border-[#23293d] bg-[#121520] text-gray-500'
          }`}
        >
          <Wifi className="w-3 h-3" />
          <span>MIDI</span>
        </div>

        {/* Quick Save Button */}
        <button
          onClick={handleManualSave}
          title="Save Project Now (Cloud + Local)"
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
            justSaved
              ? 'bg-emerald-950/70 border-emerald-500 text-emerald-300'
              : 'bg-[#181c28] border-[#2b3248] text-gray-300 hover:text-white hover:border-purple-500'
          }`}
        >
          {justSaved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          <span className="hidden 2xl:inline">{justSaved ? 'Saved' : 'Save'}</span>
        </button>

        {/* Export Button */}
        <button
          onClick={onOpenExport}
          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-900/30 transition-all cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Export</span>
        </button>

        {/* Projects / Dashboard Modal */}
        <button
          onClick={onOpenDashboard}
          title="Project Manager & Account Dashboard"
          className="p-1.5 rounded-lg bg-[#181c28] border border-[#2b3248] text-gray-300 hover:text-white hover:border-purple-500 transition-colors cursor-pointer"
        >
          <FolderOpen className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
