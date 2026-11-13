import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Sliders,
  Volume2,
  Mic,
  MicOff,
  Radio,
  Power,
  RotateCcw,
  Check,
  Music2,
  Zap,
  Activity,
  Layers,
  ChevronRight
} from 'lucide-react';
import { AutoTuneSettings, Track, DAWProject } from '../types/daw';
import { AutoTuneProcessor, AUTO_TUNE_PRESETS, PitchDetectionResult } from '../audio/autotune';
import { Knob } from './Knob';
import * as Tone from 'tone';

interface AutoTunePanelProps {
  track: Track;
  project: DAWProject;
  onUpdateTrackAutoTune: (settings: AutoTuneSettings) => void;
  compact?: boolean;
}

const MUSICAL_KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const SCALES: { id: AutoTuneSettings['scale']; label: string }[] = [
  { id: 'chromatic', label: 'Chromatic (All Notes)' },
  { id: 'major', label: 'Major (Natural)' },
  { id: 'minor', label: 'Minor (Aeolian)' },
  { id: 'dorian', label: 'Dorian Mode' },
  { id: 'pentatonic-minor', label: 'Minor Pentatonic' },
  { id: 'pentatonic-major', label: 'Major Pentatonic' },
  { id: 'blues', label: 'Blues Scale' }
];

const PRESETS = [
  { id: 'hard-trap', name: 'Hard Trap (T-Pain Snap 0ms)', desc: 'Ultra-fast retune, pure robotic snap' },
  { id: 'modern-rap', name: 'Modern Rap / Melodic Drill', desc: '12ms retune with subtle doubler' },
  { id: 'melodic-trap', name: 'Melodic Trap + 5th Harmony', desc: '5ms retune with +5th background harmony' },
  { id: 'natural-vocals', name: 'Natural Vocal Polish', desc: '75ms humanized transparent correction' },
  { id: 'rnb-smooth', name: 'R&B Smooth Air (+3rd)', desc: 'Silky 40ms retune with +3rd vocal harmony' },
  { id: 'robotic-vocoder', name: 'Robotic Vocoder Sub', desc: '0ms robotic snap + sub-octave layer' },
  { id: 'warm-vocal', name: 'Warm Vocalist', desc: 'Mid-warmth formant, natural pitch tracking' },
  { id: 'bright-vocal', name: 'Crisp Air Vocalist', desc: 'Boosted high formants, tight tuning' }
];

export const AutoTunePanel: React.FC<AutoTunePanelProps> = ({
  track,
  project,
  onUpdateTrackAutoTune,
  compact = false
}) => {
  const currentSettings: AutoTuneSettings = track.autoTune || {
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
    preset: 'modern-rap'
  };

  const [settings, setSettings] = useState<AutoTuneSettings>(currentSettings);
  const processorRef = useRef<AutoTuneProcessor | null>(null);
  const [pitchData, setPitchData] = useState<PitchDetectionResult>({
    frequency: 0,
    note: '--',
    targetNote: '--',
    centsOff: 0,
    correctionCents: 0,
    clarity: 0
  });

  // Test microphone preview stream
  const [isMicTesting, setIsMicTesting] = useState(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Canvas for live pitch wheel / gauge
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setSettings(track.autoTune || currentSettings);
  }, [track.autoTune]);

  // Instantiate or update the live DSP processor
  useEffect(() => {
    let processor = processorRef.current;
    if (!processor) {
      processor = new AutoTuneProcessor(settings);
      processorRef.current = processor;
    } else {
      processor.updateSettings(settings);
    }

    const unsub = processor.onPitchDetected((result) => {
      setPitchData(result);
    });

    return () => {
      unsub();
    };
  }, [settings]);

  // Animate the pitch deviation gauge on HTML5 Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const renderGauge = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Background grid
      ctx.fillStyle = '#0d101a';
      ctx.fillRect(0, 0, w, h);

      const midX = w / 2;

      // Tick marks (-50, -25, 0, +25, +50 cents)
      const ticks = [-50, -25, 0, 25, 50];
      ctx.textAlign = 'center';
      ctx.font = '9px monospace';

      ticks.forEach((tick) => {
        const x = midX + (tick / 50) * (w / 2 - 20);
        ctx.strokeStyle = tick === 0 ? '#38bdf8' : '#23293e';
        ctx.lineWidth = tick === 0 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x, 10);
        ctx.lineTo(x, h - 16);
        ctx.stroke();

        ctx.fillStyle = tick === 0 ? '#38bdf8' : '#64748b';
        ctx.fillText(`${tick > 0 ? '+' : ''}${tick}c`, x, h - 4);
      });

      // Target note center region (green zone: -10 to +10 cents)
      const targetWidth = (20 / 50) * (w / 2 - 20);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
      ctx.fillRect(midX - targetWidth / 2, 10, targetWidth, h - 26);

      // Active Cent indicator needle
      if (pitchData.clarity > 0.4 && pitchData.frequency > 40) {
        const clampedCents = Math.max(-50, Math.min(50, pitchData.centsOff));
        const indicatorX = midX + (clampedCents / 50) * (w / 2 - 20);

        // Glow
        const grad = ctx.createLinearGradient(midX, 0, indicatorX, 0);
        const inTune = Math.abs(clampedCents) < 8;
        grad.addColorStop(0, inTune ? 'rgba(16, 185, 129, 0.2)' : 'rgba(168, 85, 247, 0.2)');
        grad.addColorStop(1, inTune ? '#10b981' : '#c084fc');

        ctx.fillStyle = grad;
        ctx.fillRect(Math.min(midX, indicatorX), 12, Math.abs(indicatorX - midX), h - 28);

        // Needle line
        ctx.strokeStyle = inTune ? '#34d399' : '#e879f9';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(indicatorX, 8);
        ctx.lineTo(indicatorX, h - 14);
        ctx.stroke();

        // Needle head dot
        ctx.fillStyle = inTune ? '#34d399' : '#f43f5e';
        ctx.beginPath();
        ctx.arc(indicatorX, 10, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(renderGauge);
    };

    renderGauge();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [pitchData]);

  // Handle local parameter change
  const handleChange = <K extends keyof AutoTuneSettings>(key: K, val: AutoTuneSettings[K]) => {
    const updated = { ...settings, [key]: val };
    setSettings(updated);
    onUpdateTrackAutoTune(updated);
  };

  // Preset selector handler
  const handleSelectPreset = (presetKey: string) => {
    const preset = AUTO_TUNE_PRESETS[presetKey];
    if (preset) {
      const updated = {
        ...settings,
        ...preset,
        preset: presetKey
      } as AutoTuneSettings;
      setSettings(updated);
      onUpdateTrackAutoTune(updated);
    } else if (presetKey === 'warm-vocal') {
      const updated: AutoTuneSettings = {
        ...settings,
        retuneSpeedMs: 45,
        humanize: 0.4,
        flexTune: 0.3,
        correctionStrength: 0.85,
        formantCorrection: -1.5,
        mode: 'natural',
        preset: presetKey
      };
      setSettings(updated);
      onUpdateTrackAutoTune(updated);
    } else if (presetKey === 'bright-vocal') {
      const updated: AutoTuneSettings = {
        ...settings,
        retuneSpeedMs: 18,
        humanize: 0.2,
        flexTune: 0.15,
        correctionStrength: 0.95,
        formantCorrection: 2.5,
        vocalDoubler: true,
        vocalDoublerMix: 0.25,
        mode: 'natural',
        preset: presetKey
      };
      setSettings(updated);
      onUpdateTrackAutoTune(updated);
    }
  };

  // Toggle Live Microphone Audition
  const toggleMicTesting = async () => {
    if (isMicTesting) {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      if (micSourceNodeRef.current) {
        micSourceNodeRef.current.disconnect();
        micSourceNodeRef.current = null;
      }
      if (processorRef.current) {
        processorRef.current.disconnectOutput();
      }
      setIsMicTesting(false);
    } else {
      try {
        await Tone.start();
        const rawCtx = Tone.getContext().rawContext as AudioContext;
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });
        micStreamRef.current = stream;
        const source = rawCtx.createMediaStreamSource(stream);
        micSourceNodeRef.current = source;

        if (processorRef.current) {
          source.connect(processorRef.current.inputNode.input as unknown as AudioNode);
          processorRef.current.connectOutput(Tone.getDestination());
        }
        setIsMicTesting(true);
      } catch (err) {
        console.warn('Could not start live Auto-Tune microphone audition:', err);
      }
    }
  };

  const handleReset = () => {
    const defaults: AutoTuneSettings = {
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
      preset: 'modern-rap'
    };
    setSettings(defaults);
    onUpdateTrackAutoTune(defaults);
  };

  // Cleanup mic audition on unmount
  useEffect(() => {
    return () => {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (micSourceNodeRef.current) {
        micSourceNodeRef.current.disconnect();
      }
      if (processorRef.current) {
        processorRef.current.disconnectOutput();
        processorRef.current.dispose();
      }
    };
  }, []);

  return (
    <div className="bg-[#0f121d] border border-[#212739] rounded-2xl p-5 flex flex-col gap-5 shadow-2xl relative select-none">
      {/* Top Header & Status */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1c2234]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-fuchsia-600 to-cyan-400 p-[2px] shadow-lg shadow-purple-950">
            <div className="w-full h-full bg-[#0d101a] rounded-[10px] flex items-center justify-center">
              <Zap className="w-5 h-5 text-purple-400 fill-purple-400/20" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold tracking-wider text-white uppercase flex items-center gap-1.5">
                BEATFORGE AUTO-TUNE PRO
              </h2>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800/60 font-mono">
                DSP v3.4
              </span>
            </div>
            <p className="text-[11px] text-gray-400">
              Real-time autocorrelation pitch tracking & formant-correcting scale snapper
            </p>
          </div>
        </div>

        {/* Global Controls: Power, Bypass, Mic Audition */}
        <div className="flex items-center gap-2">
          {/* Test Mic Audition */}
          <button
            onClick={toggleMicTesting}
            title={isMicTesting ? 'Stop Live Mic Test' : 'Test Live Mic with Auto-Tune'}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
              isMicTesting
                ? 'bg-rose-600/30 border-rose-500 text-rose-300 shadow-md shadow-rose-900/40 animate-pulse'
                : 'bg-[#181c2a] border-[#293246] text-gray-300 hover:text-white hover:border-purple-500'
            }`}
          >
            {isMicTesting ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
            <span>{isMicTesting ? 'MIC LIVE (TUNING)' : 'TEST MIC'}</span>
          </button>

          {/* Bypass A/B Comparison */}
          <button
            onClick={() => handleChange('bypassed', !settings.bypassed)}
            title="Instant A/B comparison (bypasses pitch correction)"
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
              settings.bypassed
                ? 'bg-amber-600/30 border-amber-500 text-amber-300 shadow-md shadow-amber-900/40'
                : 'bg-[#181c2a] border-[#293246] text-gray-400 hover:text-gray-200'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{settings.bypassed ? 'BYPASSED' : 'BYPASS (A/B)'}</span>
          </button>

          {/* Master Enable */}
          <button
            onClick={() => handleChange('enabled', !settings.enabled)}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 border transition-all cursor-pointer ${
              settings.enabled
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 shadow-md shadow-emerald-950'
                : 'bg-[#161a26] text-gray-500 border-[#262c3f]'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{settings.enabled ? 'ACTIVE' : 'OFF'}</span>
          </button>

          {/* Reset */}
          <button
            onClick={handleReset}
            title="Reset Auto-Tune parameters"
            className="p-1.5 rounded-lg bg-[#181c2a] border border-[#293246] text-gray-400 hover:text-white transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Auto-Tune Pitch Radar & Cent Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-[#0a0d15] border border-[#1b2131] rounded-xl p-4 shadow-inner">
        {/* Pitch Center & Detected Notes Display */}
        <div className="lg:col-span-5 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-[#1e2538] pr-0 lg:pr-4 pb-3 lg:pb-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-purple-400" />
              PITCH DETECTION RADAR
            </span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                pitchData.clarity > 0.6
                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                  : 'bg-gray-800 text-gray-400'
              }`}
            >
              CONFIDENCE: {Math.round(pitchData.clarity * 100)}%
            </span>
          </div>

          <div className="flex items-center justify-around my-3">
            {/* Input Note */}
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-gray-500 font-mono">DETECTED</span>
              <div className="w-16 h-16 rounded-xl bg-[#121624] border border-[#232c42] flex items-center justify-center text-2xl font-black font-mono text-gray-300 shadow-md">
                {pitchData.note || '--'}
              </div>
              <span className="text-[10px] font-mono text-gray-500 mt-1">
                {pitchData.frequency > 0 ? `${Math.round(pitchData.frequency)} Hz` : '--'}
              </span>
            </div>

            {/* Snap Arrow */}
            <div className="flex flex-col items-center">
              <ChevronRight className="w-6 h-6 text-purple-400 animate-pulse" />
              <span className="text-[9px] font-mono text-purple-300">
                {pitchData.centsOff !== 0
                  ? `${pitchData.centsOff > 0 ? '+' : ''}${Math.round(pitchData.centsOff)}c`
                  : '0c'}
              </span>
            </div>

            {/* Target Note */}
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-cyan-400 font-mono font-bold">TARGET SCALE NOTE</span>
              <div
                className={`w-16 h-16 rounded-xl border flex items-center justify-center text-2xl font-black font-mono shadow-xl transition-all ${
                  settings.bypassed
                    ? 'bg-[#141724] border-gray-700 text-gray-400'
                    : 'bg-gradient-to-br from-purple-900/60 to-cyan-900/60 border-cyan-400 text-cyan-200 shadow-cyan-950/50'
                }`}
              >
                {pitchData.targetNote || '--'}
              </div>
              <span className="text-[10px] font-mono text-cyan-300 mt-1">
                SNAP: {settings.rootKey} {settings.scale.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Mode Badge (Robotic vs Natural) */}
          <div className="flex items-center justify-between bg-[#111522] rounded-lg p-1.5 border border-[#1e2538]">
            <span className="text-[10px] text-gray-400">CORRECTION ENGINE:</span>
            <div className="flex gap-1">
              <button
                onClick={() => handleChange('mode', 'natural')}
                className={`px-2.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                  settings.mode === 'natural'
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                NATURAL
              </button>
              <button
                onClick={() => handleChange('mode', 'robotic')}
                className={`px-2.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                  settings.mode === 'robotic'
                    ? 'bg-cyan-600 text-white shadow'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                ROBOTIC (T-PAIN)
              </button>
            </div>
          </div>
        </div>

        {/* Live Cent Gauge Canvas & Key/Scale Configuration */}
        <div className="lg:col-span-7 flex flex-col justify-between gap-3">
          {/* Cent Meter Visualizer */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] font-mono text-gray-400">
              <span>FLAT (-50 CENTS)</span>
              <span className="text-emerald-400 font-bold">PERFECT PITCH (0c)</span>
              <span>SHARP (+50 CENTS)</span>
            </div>
            <div className="w-full h-12 rounded-lg border border-[#232b3e] overflow-hidden bg-[#0d101a] shadow-inner">
              <canvas
                ref={canvasRef}
                width={480}
                height={48}
                className="w-full h-full block"
              />
            </div>
          </div>

          {/* Musical Key & Scale Matrix */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            {/* Root Key */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-gray-300">ROOT KEY</label>
              <div className="grid grid-cols-6 gap-1">
                {MUSICAL_KEYS.map((k) => (
                  <button
                    key={k}
                    onClick={() => handleChange('rootKey', k)}
                    className={`py-1 rounded text-xs font-mono font-bold transition-all cursor-pointer ${
                      settings.rootKey === k
                        ? 'bg-purple-600 text-white shadow-md shadow-purple-900/60'
                        : 'bg-[#151928] text-gray-400 hover:text-white hover:bg-[#1d2338]'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>

            {/* Scale Type */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-gray-300">MUSICAL SCALE</label>
              <select
                value={settings.scale}
                onChange={(e) => handleChange('scale', e.target.value as AutoTuneSettings['scale'])}
                className="w-full bg-[#151928] border border-[#293246] rounded-lg px-2.5 py-1.5 text-xs font-bold text-cyan-300 outline-none cursor-pointer focus:border-cyan-500"
              >
                {SCALES.map((s) => (
                  <option key={s.id} value={s.id} className="bg-[#151928] text-white">
                    {s.label}
                  </option>
                ))}
              </select>

              {/* Quick Preset Selector */}
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500 whitespace-nowrap">PRESET:</span>
                <select
                  value={settings.preset || 'modern-rap'}
                  onChange={(e) => handleSelectPreset(e.target.value)}
                  className="w-full bg-[#151928] border border-[#293246] rounded px-2 py-1 text-[11px] font-semibold text-purple-300 outline-none cursor-pointer"
                >
                  {PRESETS.map((p) => (
                    <option key={p.id} value={p.id} className="bg-[#151928] text-white">
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Core Tuning Knobs Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3 p-4 bg-[#111422] border border-[#1f2638] rounded-xl shadow-md">
        <Knob
          label="RETUNE SPEED"
          size="md"
          min={0}
          max={100}
          step={1}
          value={settings.retuneSpeedMs}
          defaultValue={15}
          unit="ms"
          color="#a855f7"
          onChange={(v) => handleChange('retuneSpeedMs', v)}
        />
        <Knob
          label="CORRECTION"
          size="md"
          min={0}
          max={1}
          step={0.05}
          value={settings.correctionStrength}
          defaultValue={0.95}
          color="#06b6d4"
          onChange={(v) => handleChange('correctionStrength', v)}
        />
        <Knob
          label="HUMANIZE"
          size="md"
          min={0}
          max={1}
          step={0.05}
          value={settings.humanize}
          defaultValue={0.1}
          color="#10b981"
          onChange={(v) => handleChange('humanize', v)}
        />
        <Knob
          label="FLEX-TUNE"
          size="md"
          min={0}
          max={1}
          step={0.05}
          value={settings.flexTune}
          defaultValue={0.1}
          color="#f59e0b"
          onChange={(v) => handleChange('flexTune', v)}
        />
        <Knob
          label="PITCH DRIFT"
          size="md"
          min={0}
          max={1}
          step={0.05}
          value={settings.pitchDrift}
          defaultValue={0.05}
          color="#ec4899"
          onChange={(v) => handleChange('pitchDrift', v)}
        />
        <Knob
          label="FORMANT SHIFT"
          size="md"
          min={-12}
          max={12}
          step={0.5}
          value={settings.formantCorrection}
          defaultValue={0}
          unit="st"
          color="#38bdf8"
          onChange={(v) => handleChange('formantCorrection', v)}
        />
        <Knob
          label="VIBRATO"
          size="md"
          min={0}
          max={1}
          step={0.05}
          value={settings.vibratoAmount}
          defaultValue={0}
          color="#c084fc"
          onChange={(v) => handleChange('vibratoAmount', v)}
        />
        <Knob
          label="PITCH CENTS"
          size="md"
          min={-1200}
          max={1200}
          step={25}
          value={settings.pitchShiftCents}
          defaultValue={0}
          unit="c"
          color="#f43f5e"
          onChange={(v) => handleChange('pitchShiftCents', v)}
        />
      </div>

      {/* Advanced Vocal Controls: Vocal Doubler, Harmonizer, Pitch Shifter */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Vocal Doubler Module */}
        <div className="bg-[#111522] border border-[#20273a] rounded-xl p-4 flex flex-col justify-between gap-3 shadow-md">
          <div className="flex items-center justify-between pb-2 border-b border-[#1b2233]">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-gray-200">VOCAL DOUBLER / THICKENER</span>
            </div>
            <button
              onClick={() => handleChange('vocalDoubler', !settings.vocalDoubler)}
              className={`px-2.5 py-0.5 rounded text-[10px] font-extrabold uppercase transition-all ${
                settings.vocalDoubler
                  ? 'bg-cyan-600 text-white shadow-md'
                  : 'bg-[#181c2a] text-gray-500 border border-[#293246]'
              }`}
            >
              {settings.vocalDoubler ? 'ON' : 'OFF'}
            </button>
          </div>

          <p className="text-[11px] text-gray-400">
            Creates a wide stereo vocal chorus layer with micro-pitch detuning for commercial pop & modern trap vocals.
          </p>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-gray-300 font-medium">Doubler Mix:</span>
            <div className="w-40 flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                disabled={!settings.vocalDoubler}
                value={settings.vocalDoublerMix}
                onChange={(e) => handleChange('vocalDoublerMix', parseFloat(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer disabled:opacity-30"
              />
              <span className="text-xs font-mono text-cyan-300 w-10 text-right">
                {Math.round(settings.vocalDoublerMix * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Vocal Harmonizer Module */}
        <div className="bg-[#111522] border border-[#20273a] rounded-xl p-4 flex flex-col justify-between gap-3 shadow-md">
          <div className="flex items-center justify-between pb-2 border-b border-[#1b2233]">
            <div className="flex items-center gap-2">
              <Music2 className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-bold text-gray-200">VOCAL HARMONIZER</span>
            </div>
            <select
              value={settings.harmonizer}
              onChange={(e) =>
                handleChange('harmonizer', e.target.value as AutoTuneSettings['harmonizer'])
              }
              className="bg-[#181c2a] border border-[#2a3449] rounded px-2 py-0.5 text-[11px] font-bold text-purple-300 outline-none cursor-pointer"
            >
              <option value="off">Harmonizer OFF</option>
              <option value="third-up">+3rd Harmony (Major/Minor)</option>
              <option value="fifth-up">+5th Harmony (Power Interval)</option>
              <option value="octave-up">+1 Octave High Double</option>
              <option value="octave-down">-1 Octave Deep Sub</option>
            </select>
          </div>

          <p className="text-[11px] text-gray-400">
            Generates synchronous musical harmony vocals in key behind the main lead performance in real-time.
          </p>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-gray-300 font-medium">Harmony Mix:</span>
            <div className="w-40 flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                disabled={settings.harmonizer === 'off'}
                value={settings.harmonizerMix}
                onChange={(e) => handleChange('harmonizerMix', parseFloat(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer disabled:opacity-30"
              />
              <span className="text-xs font-mono text-purple-300 w-10 text-right">
                {Math.round(settings.harmonizerMix * 100)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
