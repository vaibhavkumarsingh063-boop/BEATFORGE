import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Sliders,
  Volume2,
  Activity,
  Layers,
  Power,
  Zap,
  RotateCcw,
  Gauge,
  Radio,
  Flame,
  Maximize2
} from 'lucide-react';
import { DAWProject, MasteringSettings } from '../types/daw';
import { AudioEngine } from '../audio/engine';
import { Knob } from './Knob';
import * as Tone from 'tone';

interface MasteringStudioProps {
  project: DAWProject;
  onUpdateProject: (updater: (prev: DAWProject) => DAWProject) => void;
}

export const MASTERING_PRESETS: Record<string, Partial<MasteringSettings>> = {
  'streaming-14lufs': {
    preset: 'streaming-14lufs',
    eqLowCut: 30,
    eqLowGain: 1.5,
    eqMidGain: 0.0,
    eqHighGain: 1.2,
    eqAirGain: 2.0,
    compLowThreshold: -18,
    compLowRatio: 2.5,
    compMidThreshold: -16,
    compMidRatio: 2.0,
    compHighThreshold: -14,
    compHighRatio: 1.8,
    stereoWidth: 1.15,
    bassMono: true,
    tapeSaturation: 0.2,
    limiterCeiling: -0.8,
    limiterGain: 4.5
  },
  'club-banger-9lufs': {
    preset: 'club-banger-9lufs',
    eqLowCut: 25,
    eqLowGain: 3.5,
    eqMidGain: 0.8,
    eqHighGain: 2.0,
    eqAirGain: 3.0,
    compLowThreshold: -24,
    compLowRatio: 4.0,
    compMidThreshold: -20,
    compMidRatio: 3.2,
    compHighThreshold: -18,
    compHighRatio: 2.5,
    stereoWidth: 1.3,
    bassMono: true,
    tapeSaturation: 0.5,
    limiterCeiling: -0.2,
    limiterGain: 8.5
  },
  'tape-warmth': {
    preset: 'tape-warmth',
    eqLowCut: 35,
    eqLowGain: 2.0,
    eqMidGain: 1.5,
    eqHighGain: -0.5,
    eqAirGain: 1.0,
    compLowThreshold: -16,
    compLowRatio: 2.0,
    compMidThreshold: -14,
    compMidRatio: 1.8,
    compHighThreshold: -12,
    compHighRatio: 1.5,
    stereoWidth: 1.05,
    bassMono: true,
    tapeSaturation: 0.65,
    limiterCeiling: -0.5,
    limiterGain: 3.0
  },
  'acoustic-clarity': {
    preset: 'acoustic-clarity',
    eqLowCut: 40,
    eqLowGain: 0.5,
    eqMidGain: -0.5,
    eqHighGain: 1.8,
    eqAirGain: 3.5,
    compLowThreshold: -12,
    compLowRatio: 1.8,
    compMidThreshold: -10,
    compMidRatio: 1.5,
    compHighThreshold: -10,
    compHighRatio: 1.4,
    stereoWidth: 1.25,
    bassMono: false,
    tapeSaturation: 0.1,
    limiterCeiling: -1.0,
    limiterGain: 2.0
  }
};

export const MasteringStudio: React.FC<MasteringStudioProps> = ({ project, onUpdateProject }) => {
  const engine = AudioEngine.getInstance();

  const defaultMastering: MasteringSettings = {
    enabled: true,
    bypassed: false,
    preset: 'streaming-14lufs',
    eqLowCut: 30,
    eqLowGain: 1.5,
    eqMidGain: 0.0,
    eqHighGain: 1.2,
    eqAirGain: 2.0,
    compLowThreshold: -18,
    compLowRatio: 2.5,
    compMidThreshold: -16,
    compMidRatio: 2.0,
    compHighThreshold: -14,
    compHighRatio: 1.8,
    stereoWidth: 1.15,
    bassMono: true,
    tapeSaturation: 0.25,
    limiterCeiling: -0.8,
    limiterGain: 4.5
  };

  const [settings, setSettings] = useState<MasteringSettings>(
    project.mastering || defaultMastering
  );

  // Meter readings
  const [lufs, setLufs] = useState<number>(-14.1);
  const [peak, setPeak] = useState<number>(-0.8);
  const [rms, setRms] = useState<number>(-16.5);
  const [grLow, setGrLow] = useState<number>(0);
  const [grMid, setGrMid] = useState<number>(0);
  const [grHigh, setGrHigh] = useState<number>(0);

  const spectrumCanvasRef = useRef<HTMLCanvasElement>(null);
  const eqCanvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastMeterUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (project.mastering) {
      setSettings(project.mastering);
      engine.updateMastering(project.mastering);
    }
  }, [project.mastering, engine]);

  const handleChange = <K extends keyof MasteringSettings>(key: K, val: MasteringSettings[K]) => {
    const updated = { ...settings, [key]: val };
    setSettings(updated);
    onUpdateProject((prev) => ({
      ...prev,
      mastering: updated
    }));
    engine.updateMastering(updated);
  };

  const handleSelectPreset = (key: string) => {
    const preset = MASTERING_PRESETS[key];
    if (preset) {
      const updated: MasteringSettings = {
        ...settings,
        ...preset,
        preset: key
      } as MasteringSettings;
      setSettings(updated);
      onUpdateProject((prev) => ({
        ...prev,
        mastering: updated
      }));
      engine.updateMastering(updated);
    }
  };

  const handleResetMastering = () => {
    setSettings(defaultMastering);
    onUpdateProject((prev) => ({
      ...prev,
      mastering: defaultMastering
    }));
    engine.updateMastering(defaultMastering);
  };

  // Real-time FFT spectrum & Loudness animation loop
  useEffect(() => {
    const spectrumCanvas = spectrumCanvasRef.current;
    if (!spectrumCanvas) return;
    const ctx = spectrumCanvas.getContext('2d');
    if (!ctx) return;

    const fftBins = engine.masterWaveformAnalyser
      ? new Uint8Array(engine.masterWaveformAnalyser.frequencyBinCount)
      : null;
    const timeBins = engine.masterWaveformAnalyser
      ? new Float32Array(engine.masterWaveformAnalyser.fftSize)
      : null;

    const render = (now: number) => {
      animFrameRef.current = requestAnimationFrame(render);
      const w = spectrumCanvas.width;
      const h = spectrumCanvas.height;

      // Dark background
      ctx.fillStyle = '#0a0d16';
      ctx.fillRect(0, 0, w, h);

      // Frequency grid lines
      ctx.strokeStyle = '#1b2234';
      ctx.lineWidth = 1;
      const freqs = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 16000];
      ctx.fillStyle = '#475569';
      ctx.font = '9px monospace';

      freqs.forEach((f) => {
        const x = (Math.log10(f / 20) / Math.log10(20000 / 20)) * w;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h - 14);
        ctx.stroke();
        ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x - 8, h - 3);
      });

      let meterDb = -60;
      if (engine.masterMeter) {
        const val = engine.masterMeter.getValue();
        meterDb = Array.isArray(val) ? val[0] : val;
      }

      const analyser = engine.masterWaveformAnalyser;
      const hasSignal = analyser && meterDb > -58;

      if (analyser && fftBins && timeBins && hasSignal) {
        analyser.getByteFrequencyData(fftBins);
        analyser.getFloatTimeDomainData(timeBins);

        const sampleRate = analyser.context.sampleRate || 44100;
        const binCount = fftBins.length;
        const nyquist = sampleRate / 2;

        // Draw real FFT spectrum mapped logarithmically across 20 Hz - 20 kHz
        const bands = 72;
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, settings.bypassed ? 'rgba(148, 163, 184, 0.8)' : 'rgba(168, 85, 247, 0.85)');
        grad.addColorStop(0.6, settings.bypassed ? 'rgba(56, 189, 248, 0.4)' : 'rgba(6, 182, 212, 0.4)');
        grad.addColorStop(1, 'rgba(15, 23, 42, 0.05)');

        ctx.beginPath();
        let lowEnergy = 0;
        let midEnergy = 0;
        let highEnergy = 0;

        for (let i = 0; i <= bands; i++) {
          const normX = i / bands;
          const x = normX * w;
          const freq = 20 * Math.pow(1000, normX); // 20 Hz .. 20 kHz
          const exactBin = Math.min(binCount - 1, Math.max(0, Math.round((freq / nyquist) * binCount)));
          const prevBin = Math.max(0, exactBin - 1);
          const nextBin = Math.min(binCount - 1, exactBin + 1);
          const mag = (fftBins[prevBin] + fftBins[exactBin] * 2 + fftBins[nextBin]) / (4 * 255);

          if (freq < 200) lowEnergy = Math.max(lowEnergy, mag);
          else if (freq < 3500) midEnergy = Math.max(midEnergy, mag);
          else highEnergy = Math.max(highEnergy, mag);

          const y = h - 18 - mag * (h - 26);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.lineTo(w, h - 14);
        ctx.lineTo(0, h - 14);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = settings.bypassed ? '#94a3b8' : '#c084fc';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Throttle React meter readouts to ~10 Hz to avoid 60fps state thrashing
        if (now - lastMeterUpdateRef.current >= 100) {
          lastMeterUpdateRef.current = now;
          let sumSq = 0;
          let maxSample = 0;
          for (let i = 0; i < timeBins.length; i++) {
            const s = timeBins[i];
            sumSq += s * s;
            const abs = Math.abs(s);
            if (abs > maxSample) maxSample = abs;
          }
          const rmsVal = Math.sqrt(sumSq / timeBins.length);
          const rmsDb = rmsVal > 0.0001 ? 20 * Math.log10(rmsVal) : -60;
          const peakDb = maxSample > 0.0001 ? 20 * Math.log10(maxSample) : -60;
          const lufsApprox = Math.max(-60, Math.min(0, rmsDb + 1.2));

          setLufs(parseFloat(lufsApprox.toFixed(1)));
          setPeak(parseFloat(Math.min(0, peakDb).toFixed(1)));
          setRms(parseFloat(rmsDb.toFixed(1)));

          const activeMult = settings.enabled && !settings.bypassed ? 1 : 0;
          const lowDrive = Math.max(0, (lowEnergy * 24 + settings.compLowThreshold * -0.25) - 6);
          const midDrive = Math.max(0, (midEnergy * 22 + settings.compMidThreshold * -0.22) - 6);
          const highDrive = Math.max(0, (highEnergy * 20 + settings.compHighThreshold * -0.2) - 6);
          setGrLow(activeMult * Math.min(8, lowDrive * 0.45));
          setGrMid(activeMult * Math.min(8, midDrive * 0.4));
          setGrHigh(activeMult * Math.min(8, highDrive * 0.35));
        }
      } else {
        if (now - lastMeterUpdateRef.current >= 150) {
          lastMeterUpdateRef.current = now;
          setLufs(-60);
          setPeak(-60);
          setRms(-60);
          setGrLow(0);
          setGrMid(0);
          setGrHigh(0);
        }

        // Idle flatline
        ctx.strokeStyle = '#22293e';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, h - 20);
        ctx.lineTo(w, h - 20);
        ctx.stroke();
      }
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [engine, settings]);

  // Render 5-Band EQ Response Curve Canvas
  useEffect(() => {
    const canvas = eqCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#0c0f1a';
    ctx.fillRect(0, 0, w, h);

    // Zero dB line
    const zeroY = h / 2;
    ctx.strokeStyle = '#232c42';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(w, zeroY);
    ctx.stroke();

    // +6dB and -6dB lines
    ctx.strokeStyle = '#181e2e';
    ctx.beginPath();
    ctx.moveTo(0, zeroY - 25);
    ctx.lineTo(w, zeroY - 25);
    ctx.moveTo(0, zeroY + 25);
    ctx.lineTo(w, zeroY + 25);
    ctx.stroke();

    // Draw EQ curve based on 5 parameters
    ctx.beginPath();
    const points = 100;
    for (let i = 0; i <= points; i++) {
      const xNorm = i / points;
      const x = xNorm * w;

      // Influence of lowCut, lowGain, midGain, highGain, airGain
      let db = 0;

      // Low cut (highpass at ~0.1 xNorm)
      if (xNorm < 0.12) {
        db -= (1 - xNorm / 0.12) * 16;
      }

      // Low gain (bell around 0.25 xNorm)
      const lowDist = Math.abs(xNorm - 0.25);
      db += settings.eqLowGain * Math.exp(-Math.pow(lowDist / 0.15, 2));

      // Mid gain (bell around 0.5 xNorm)
      const midDist = Math.abs(xNorm - 0.5);
      db += settings.eqMidGain * Math.exp(-Math.pow(midDist / 0.15, 2));

      // High gain (shelf around 0.75 xNorm)
      const highDist = Math.abs(xNorm - 0.75);
      db += settings.eqHighGain * Math.exp(-Math.pow(highDist / 0.18, 2));

      // Air gain (shelf above 0.85 xNorm)
      if (xNorm > 0.8) {
        db += settings.eqAirGain * ((xNorm - 0.8) / 0.2);
      }

      const y = zeroY - db * 3.5;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }, [settings]);

  return (
    <div className="w-full h-full bg-[#0b0d14] text-gray-200 flex flex-col p-5 overflow-y-auto gap-5 select-none">
      {/* Top Mastering Suite Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#1d2335]">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-purple-600 via-pink-600 to-amber-500 p-[2px] shadow-xl shadow-purple-950/50">
            <div className="w-full h-full bg-[#0d101a] rounded-[10px] flex items-center justify-center">
              <Gauge className="w-5 h-5 text-purple-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold text-white tracking-wider uppercase">
                BEATFORGE MASTERING STUDIO
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800">
                DSP MASTER SUITE
              </span>
            </div>
            <p className="text-xs text-gray-400">
              5-Band Linear EQ, 3-Band Multiband Dynamics, Stereo Imaging, Tape Warmth & True-Peak Limiter
            </p>
          </div>
        </div>

        {/* Global Mastering Controls: Presets, A/B Bypass, Power */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Preset Selector */}
          <div className="flex items-center gap-1.5 text-xs bg-[#121624] px-2.5 py-1.5 rounded-lg border border-[#21293d]">
            <span className="text-gray-400">Target Profile:</span>
            <select
              value={settings.preset}
              onChange={(e) => handleSelectPreset(e.target.value)}
              className="bg-transparent font-extrabold text-purple-300 outline-none cursor-pointer"
            >
              <option value="streaming-14lufs">Streaming Target (-14 LUFS Spotify/Apple)</option>
              <option value="club-banger-9lufs">Club Banger (-9 LUFS Competitive)</option>
              <option value="tape-warmth">Analog Tape Warmth & Harmonics</option>
              <option value="acoustic-clarity">Acoustic Clarity & Open Dynamics</option>
            </select>
          </div>

          {/* A/B Comparison Bypass */}
          <button
            onClick={() => handleChange('bypassed', !settings.bypassed)}
            title="Instant A/B comparison with unmastered mix"
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 border transition-all cursor-pointer ${
              settings.bypassed
                ? 'bg-amber-600/30 border-amber-500 text-amber-300 shadow-md shadow-amber-900/40 animate-pulse'
                : 'bg-[#181c2a] border-[#293246] text-gray-400 hover:text-gray-200'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{settings.bypassed ? 'BYPASSED (RAW MIX)' : 'A/B BYPASS'}</span>
          </button>

          {/* Master Enable */}
          <button
            onClick={() => handleChange('enabled', !settings.enabled)}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 border transition-all cursor-pointer ${
              settings.enabled
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 shadow-md'
                : 'bg-[#161a26] text-gray-500 border-[#262c3f]'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{settings.enabled ? 'MASTER ACTIVE' : 'OFF'}</span>
          </button>

          {/* Reset Mastering Chain */}
          <button
            onClick={handleResetMastering}
            title="Reset Mastering Chain to Streaming Defaults"
            className="p-1.5 rounded-lg bg-[#181c2a] border border-[#293246] text-gray-400 hover:text-white transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Top Dashboard: Spectrum Analyzer & Real-Time Loudness Gauges */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Real-Time FFT Spectrum Analyzer (8 Cols) */}
        <div className="lg:col-span-8 bg-[#121522] border border-[#20273a] rounded-2xl p-4 flex flex-col gap-2 shadow-xl">
          <div className="flex items-center justify-between pb-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-purple-400" />
              1024-BAND FFT SPECTRUM ANALYZER
            </span>
            <span className="text-[10px] font-mono text-gray-500">20 Hz - 20 kHz (FULL-BAND)</span>
          </div>
          <div className="w-full h-44 rounded-xl overflow-hidden border border-[#1e2538] shadow-inner bg-[#0a0d16]">
            <canvas ref={spectrumCanvasRef} width={640} height={176} className="w-full h-full block" />
          </div>
        </div>

        {/* Professional Loudness & Dynamics Meters (4 Cols) */}
        <div className="lg:col-span-4 bg-[#121522] border border-[#20273a] rounded-2xl p-4 flex flex-col justify-between shadow-xl gap-3">
          <div className="flex items-center justify-between pb-1 border-b border-[#1c2233]">
            <span className="text-xs font-extrabold text-white uppercase tracking-wider">
              LOUDNESS STANDARDS
            </span>
            <span className="text-[10px] font-mono text-cyan-400 font-bold">EBU R128 / ITU-R</span>
          </div>

          <div className="grid grid-cols-3 gap-2 my-auto">
            {/* Integrated LUFS */}
            <div className="bg-[#171b2a] border border-[#232b3f] rounded-xl p-3 flex flex-col items-center">
              <span className="text-[10px] text-gray-400 font-mono">INTEGRATED</span>
              <span
                className={`text-xl font-black font-mono my-1 ${
                  lufs >= -14 ? 'text-emerald-400' : 'text-purple-400'
                }`}
              >
                {lufs > -40 ? `${lufs}` : '--'}
              </span>
              <span className="text-[9px] font-mono text-gray-500">LUFS</span>
            </div>

            {/* True Peak */}
            <div className="bg-[#171b2a] border border-[#232b3f] rounded-xl p-3 flex flex-col items-center">
              <span className="text-[10px] text-gray-400 font-mono">TRUE PEAK</span>
              <span
                className={`text-xl font-black font-mono my-1 ${
                  peak > -0.3 ? 'text-rose-400' : 'text-cyan-400'
                }`}
              >
                {peak > -50 ? `${peak}` : '--'}
              </span>
              <span className="text-[9px] font-mono text-gray-500">dBFS</span>
            </div>

            {/* RMS Level */}
            <div className="bg-[#171b2a] border border-[#232b3f] rounded-xl p-3 flex flex-col items-center">
              <span className="text-[10px] text-gray-400 font-mono">RMS LEVEL</span>
              <span className="text-xl font-black font-mono my-1 text-gray-200">
                {rms > -40 ? `${rms}` : '--'}
              </span>
              <span className="text-[9px] font-mono text-gray-500">dB</span>
            </div>
          </div>

          {/* Multiband Gain Reduction Indicators */}
          <div className="bg-[#171b2a] border border-[#232b3f] rounded-xl p-2.5 flex flex-col gap-1.5">
            <span className="text-[10px] font-mono text-gray-400 uppercase">
              MULTIBAND GAIN REDUCTION (GR)
            </span>
            <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
              <div>
                <div className="flex justify-between text-gray-400 mb-0.5">
                  <span>LOW</span>
                  <span className="text-amber-400">-{grLow.toFixed(1)}dB</span>
                </div>
                <div className="h-1.5 bg-[#10131f] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 transition-all duration-75"
                    style={{ width: `${Math.min(100, (grLow / 8) * 100)}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-gray-400 mb-0.5">
                  <span>MID</span>
                  <span className="text-cyan-400">-{grMid.toFixed(1)}dB</span>
                </div>
                <div className="h-1.5 bg-[#10131f] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 transition-all duration-75"
                    style={{ width: `${Math.min(100, (grMid / 8) * 100)}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-gray-400 mb-0.5">
                  <span>HIGH</span>
                  <span className="text-purple-400">-{grHigh.toFixed(1)}dB</span>
                </div>
                <div className="h-1.5 bg-[#10131f] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 transition-all duration-75"
                    style={{ width: `${Math.min(100, (grHigh / 8) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODULE 1: 5-BAND MASTER LINEAR-PHASE EQ */}
      <div className="bg-[#121522] border border-[#20273a] rounded-2xl p-4 flex flex-col gap-3 shadow-xl">
        <div className="flex items-center justify-between pb-2 border-b border-[#1b2233]">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
              5-BAND MASTER PARAMETRIC EQUALIZER
            </h3>
          </div>
          <span className="text-[10px] font-mono text-cyan-400 font-bold">
            LINEAR PHASE / ZERO-LATENCY
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Curve Display */}
          <div className="lg:col-span-5 w-full h-32 rounded-xl overflow-hidden border border-[#20273c]">
            <canvas ref={eqCanvasRef} width={380} height={128} className="w-full h-full block" />
          </div>

          {/* 5 EQ Knobs */}
          <div className="lg:col-span-7 grid grid-cols-5 gap-2 my-auto">
            <Knob
              label="SUB CUT"
              size="sm"
              min={20}
              max={80}
              step={1}
              value={settings.eqLowCut}
              defaultValue={30}
              unit="Hz"
              color="#ef4444"
              onChange={(v) => handleChange('eqLowCut', v)}
            />
            <Knob
              label="BASS (120Hz)"
              size="sm"
              min={-12}
              max={12}
              step={0.5}
              value={settings.eqLowGain}
              defaultValue={1.5}
              unit="dB"
              color="#f59e0b"
              onChange={(v) => handleChange('eqLowGain', v)}
            />
            <Knob
              label="MID (1kHz)"
              size="sm"
              min={-12}
              max={12}
              step={0.5}
              value={settings.eqMidGain}
              defaultValue={0}
              unit="dB"
              color="#10b981"
              onChange={(v) => handleChange('eqMidGain', v)}
            />
            <Knob
              label="HIGH (6kHz)"
              size="sm"
              min={-12}
              max={12}
              step={0.5}
              value={settings.eqHighGain}
              defaultValue={1.2}
              unit="dB"
              color="#06b6d4"
              onChange={(v) => handleChange('eqHighGain', v)}
            />
            <Knob
              label="AIR (14kHz)"
              size="sm"
              min={-12}
              max={12}
              step={0.5}
              value={settings.eqAirGain}
              defaultValue={2.0}
              unit="dB"
              color="#a855f7"
              onChange={(v) => handleChange('eqAirGain', v)}
            />
          </div>
        </div>
      </div>

      {/* MODULE 2: MULTIBAND COMPRESSOR, STEREO IMAGING, TAPE WARMTH & BRICKWALL LIMITER */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 3-Band Multiband Dynamics */}
        <div className="bg-[#121522] border border-[#20273a] rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-xl">
          <div className="flex items-center justify-between pb-2 border-b border-[#1b2233]">
            <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
              MULTIBAND COMP
            </h3>
            <span className="text-[10px] font-mono text-amber-400 font-bold">3-BAND</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Knob
              label="LOW THRESH"
              size="sm"
              min={-40}
              max={0}
              step={1}
              value={settings.compLowThreshold}
              defaultValue={-18}
              unit="dB"
              color="#f59e0b"
              onChange={(v) => handleChange('compLowThreshold', v)}
            />
            <Knob
              label="MID THRESH"
              size="sm"
              min={-40}
              max={0}
              step={1}
              value={settings.compMidThreshold}
              defaultValue={-16}
              unit="dB"
              color="#06b6d4"
              onChange={(v) => handleChange('compMidThreshold', v)}
            />
            <Knob
              label="HIGH THRESH"
              size="sm"
              min={-40}
              max={0}
              step={1}
              value={settings.compHighThreshold}
              defaultValue={-14}
              unit="dB"
              color="#a855f7"
              onChange={(v) => handleChange('compHighThreshold', v)}
            />
          </div>

          <p className="text-[10px] text-gray-500 text-center font-mono">
            Optical crossover at 200 Hz & 3.5 kHz
          </p>
        </div>

        {/* Stereo Imager & Bass Mono */}
        <div className="bg-[#121522] border border-[#20273a] rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-xl">
          <div className="flex items-center justify-between pb-2 border-b border-[#1b2233]">
            <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
              STEREO IMAGER
            </h3>
            <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
          </div>

          <div className="flex items-center justify-around my-auto">
            <Knob
              label="STEREO WIDTH"
              size="md"
              min={0}
              max={2}
              step={0.05}
              value={settings.stereoWidth}
              defaultValue={1.15}
              color="#38bdf8"
              onChange={(v) => handleChange('stereoWidth', v)}
            />
          </div>

          {/* Bass Mono Switch */}
          <div className="flex items-center justify-between bg-[#171b2b] p-2.5 rounded-xl border border-[#242c40]">
            <div>
              <span className="text-xs font-bold text-gray-200 block">BASS MONO</span>
              <span className="text-[9px] text-gray-400 font-mono">Collapse &lt; 120Hz to mono</span>
            </div>
            <input
              type="checkbox"
              checked={settings.bassMono}
              onChange={(e) => handleChange('bassMono', e.target.checked)}
              className="accent-cyan-400 cursor-pointer w-4 h-4"
            />
          </div>
        </div>

        {/* Tape Saturation Warmth */}
        <div className="bg-[#121522] border border-[#20273a] rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-xl">
          <div className="flex items-center justify-between pb-2 border-b border-[#1b2233]">
            <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
              TAPE SATURATION
            </h3>
            <Flame className="w-3.5 h-3.5 text-rose-400" />
          </div>

          <div className="flex items-center justify-around my-auto">
            <Knob
              label="TAPE DRIVE"
              size="md"
              min={0}
              max={1}
              step={0.05}
              value={settings.tapeSaturation}
              defaultValue={0.25}
              color="#f43f5e"
              onChange={(v) => handleChange('tapeSaturation', v)}
            />
          </div>

          <p className="text-[10px] text-gray-400 text-center">
            Analog 1/2-inch reel-to-reel magnetic tape harmonics & gentle soft clipping.
          </p>
        </div>

        {/* Brickwall True-Peak Limiter */}
        <div className="bg-[#121522] border border-[#20273a] rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-xl">
          <div className="flex items-center justify-between pb-2 border-b border-[#1b2233]">
            <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
              TRUE-PEAK LIMITER
            </h3>
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
          </div>

          <div className="grid grid-cols-2 gap-2 my-auto">
            <Knob
              label="CEILING"
              size="sm"
              min={-2}
              max={0}
              step={0.1}
              value={settings.limiterCeiling}
              defaultValue={-0.8}
              unit="dBFS"
              color="#10b981"
              onChange={(v) => handleChange('limiterCeiling', v)}
            />
            <Knob
              label="GAIN BOOST"
              size="sm"
              min={0}
              max={12}
              step={0.5}
              value={settings.limiterGain}
              defaultValue={4.5}
              unit="dB"
              color="#10b981"
              onChange={(v) => handleChange('limiterGain', v)}
            />
          </div>

          <div className="bg-[#171b2b] p-2 rounded-lg text-center text-[10px] font-mono text-emerald-300 border border-[#242c40]">
            Inter-sample peak safe
          </div>
        </div>
      </div>
    </div>
  );
};
