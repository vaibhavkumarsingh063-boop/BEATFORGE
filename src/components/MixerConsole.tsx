import React, { useState, useEffect, useRef } from 'react';
import {
  Sliders,
  Volume2,
  Activity,
  Layers,
  Sparkles,
  Zap,
  Gauge,
  Radio,
  Minimize2,
  Maximize2
} from 'lucide-react';
import { DAWProject, Track, TrackEffects } from '../types/daw';
import { AudioEngine } from '../audio/engine';
import { Knob } from './Knob';

interface MixerConsoleProps {
  project: DAWProject;
  onUpdateProject: (updater: (prev: DAWProject) => DAWProject) => void;
}

export const MixerConsole: React.FC<MixerConsoleProps> = ({ project, onUpdateProject }) => {
  const engine = AudioEngine.getInstance();
  const [selectedTrackId, setSelectedTrackId] = useState<string>(project.tracks[0]?.id || 'master');
  const [channelMeters, setChannelMeters] = useState<Record<string, number>>({});
  const animationFrameRef = useRef<number | null>(null);

  const selectedTrack = project.tracks.find((t) => t.id === selectedTrackId);

  // Meter polling loop
  useEffect(() => {
    const updateMeters = () => {
      if (engine.isInitialized) {
        const meters: Record<string, number> = {};
        for (const [trackId, channel] of engine.channels.entries()) {
          const val = channel.meter.getValue();
          const numVal = Array.isArray(val) ? val[0] : val;
          // dB (-48 to 0) to 0-100%
          const pct = Math.max(0, Math.min(100, ((numVal + 48) / 48) * 100));
          meters[trackId] = pct;
        }

        // Master stereo meters
        if (engine.masterMeter) {
          const mVal = engine.masterMeter.getValue();
          const numM = Array.isArray(mVal) ? mVal[0] : mVal;
          meters['master'] = Math.max(0, Math.min(100, ((numM + 48) / 48) * 100));
        }
        if (engine.masterMeterLeft) {
          const lVal = engine.masterMeterLeft.getValue();
          const numL = Array.isArray(lVal) ? lVal[0] : lVal;
          meters['masterL'] = Math.max(0, Math.min(100, ((numL + 48) / 48) * 100));
        }
        if (engine.masterMeterRight) {
          const rVal = engine.masterMeterRight.getValue();
          const numR = Array.isArray(rVal) ? rVal[0] : rVal;
          meters['masterR'] = Math.max(0, Math.min(100, ((numR + 48) / 48) * 100));
        }

        setChannelMeters(meters);
      }
      animationFrameRef.current = requestAnimationFrame(updateMeters);
    };

    animationFrameRef.current = requestAnimationFrame(updateMeters);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [engine]);

  // Update track effects
  const handleEffectChange = (param: keyof TrackEffects, value: any) => {
    if (!selectedTrack) return;
    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => {
        if (t.id !== selectedTrack.id) return t;
        const newFx = { ...t.effects, [param]: value };
        return { ...t, effects: newFx };
      })
    }));
  };

  // Update volume / pan / mute / solo
  const handleTrackParamChange = (trackId: string, param: keyof Track, value: any) => {
    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, [param]: value } : t))
    }));
  };

  // Update master settings
  const handleMasterParamChange = (param: string, value: number) => {
    onUpdateProject((prev) => ({
      ...prev,
      master: { ...prev.master, [param]: value }
    }));
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0b0c11] overflow-hidden select-none">
      {/* Upper Rack: Interactive EQ Visualizer & Selected Track Effects Unit */}
      <div className="h-44 bg-[#10131d] border-b border-[#1f2537] p-3 flex gap-4 overflow-x-auto shrink-0">
        {selectedTrack ? (
          <>
            {/* 3-Band Parametric EQ Graph & Controls */}
            <div className="w-80 bg-[#141824] border border-[#23293d] rounded-xl p-2.5 flex flex-col justify-between shrink-0 shadow-inner">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  3-BAND PARAMETRIC EQ
                </span>
                <span className="text-[10px] text-cyan-400 font-mono font-bold">
                  {selectedTrack.name}
                </span>
              </div>

              {/* Simplified Responsive SVG EQ Curve */}
              <div className="h-16 bg-[#0a0d14] rounded-lg border border-[#1b2030] relative overflow-hidden flex items-center justify-center">
                <svg className="w-full h-full" viewBox="0 0 300 70">
                  {/* Grid lines */}
                  <line x1="0" y1="35" x2="300" y2="35" stroke="#1f2738" strokeWidth="1" strokeDasharray="4" />
                  <line x1="75" y1="0" x2="75" y2="70" stroke="#1f2738" strokeWidth="1" strokeDasharray="2" />
                  <line x1="150" y1="0" x2="150" y2="70" stroke="#1f2738" strokeWidth="1" strokeDasharray="2" />
                  <line x1="225" y1="0" x2="225" y2="70" stroke="#1f2738" strokeWidth="1" strokeDasharray="2" />

                  {/* Dynamic EQ path derived from eqLow, eqMid, eqHigh */}
                  {(() => {
                    const lowY = 35 - (selectedTrack.effects.eqLow / 12) * 25;
                    const midY = 35 - (selectedTrack.effects.eqMid / 12) * 25;
                    const highY = 35 - (selectedTrack.effects.eqHigh / 12) * 25;
                    const pathD = `M 0,${lowY} Q 75,${lowY} 120,${midY} T 200,${midY} Q 250,${highY} 300,${highY}`;
                    return (
                      <>
                        <path d={`${pathD} L 300,70 L 0,70 Z`} fill="rgba(6, 182, 212, 0.15)" />
                        <path d={pathD} fill="none" stroke="#06b6d4" strokeWidth="2.5" />
                        <circle cx="50" cy={lowY} r="4" fill="#a855f7" />
                        <circle cx="150" cy={midY} r="4" fill="#06b6d4" />
                        <circle cx="260" cy={highY} r="4" fill="#ec4899" />
                      </>
                    );
                  })()}
                </svg>
              </div>

              {/* EQ Knobs */}
              <div className="flex justify-around items-center">
                <Knob
                  label="LOW (100Hz)"
                  size="sm"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={selectedTrack.effects.eqLow}
                  defaultValue={0}
                  unit="dB"
                  color="#a855f7"
                  onChange={(val) => handleEffectChange('eqLow', val)}
                />
                <Knob
                  label="MID (1kHz)"
                  size="sm"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={selectedTrack.effects.eqMid}
                  defaultValue={0}
                  unit="dB"
                  color="#06b6d4"
                  onChange={(val) => handleEffectChange('eqMid', val)}
                />
                <Knob
                  label="HIGH (8kHz)"
                  size="sm"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={selectedTrack.effects.eqHigh}
                  defaultValue={0}
                  unit="dB"
                  color="#ec4899"
                  onChange={(val) => handleEffectChange('eqHigh', val)}
                />
              </div>
            </div>

            {/* Dynamic Compressor */}
            <div className="w-64 bg-[#141824] border border-[#23293d] rounded-xl p-2.5 flex flex-col justify-between shrink-0 shadow-inner">
              <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-amber-400" />
                VCA COMPRESSOR
              </span>

              <div className="flex justify-around items-center my-auto">
                <Knob
                  label="THRESH"
                  size="sm"
                  min={-60}
                  max={0}
                  step={1}
                  value={selectedTrack.effects.compThreshold}
                  defaultValue={-18}
                  unit="dB"
                  color="#f59e0b"
                  onChange={(val) => handleEffectChange('compThreshold', val)}
                />
                <Knob
                  label="RATIO"
                  size="sm"
                  min={1}
                  max={20}
                  step={0.5}
                  value={selectedTrack.effects.compRatio}
                  defaultValue={3}
                  unit=":1"
                  color="#f59e0b"
                  onChange={(val) => handleEffectChange('compRatio', val)}
                />
                <Knob
                  label="FILTER"
                  size="sm"
                  min={200}
                  max={20000}
                  step={100}
                  value={selectedTrack.effects.filterCutoff}
                  defaultValue={18000}
                  unit="Hz"
                  color="#10b981"
                  onChange={(val) => handleEffectChange('filterCutoff', val)}
                />
              </div>
            </div>

            {/* Time-Based FX: Reverb, Delay, Modulation, Stereo Width & Limiter */}
            <div className="flex-1 bg-[#141824] border border-[#23293d] rounded-xl p-2.5 flex flex-col justify-between shrink-0 shadow-inner min-w-[520px]">
              <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                SPATIAL & COLOR FX RACK
              </span>

              <div className="flex justify-around items-center my-auto gap-1.5">
                <Knob
                  label="REV WET"
                  size="sm"
                  min={0}
                  max={1}
                  step={0.05}
                  value={selectedTrack.effects.reverbWet}
                  defaultValue={0.15}
                  color="#c084fc"
                  onChange={(val) => handleEffectChange('reverbWet', val)}
                />
                <Knob
                  label="REV DECAY"
                  size="sm"
                  min={0.5}
                  max={8}
                  step={0.2}
                  value={selectedTrack.effects.reverbDecay}
                  defaultValue={1.5}
                  unit="s"
                  color="#c084fc"
                  onChange={(val) => handleEffectChange('reverbDecay', val)}
                />
                <Knob
                  label="DELAY WET"
                  size="sm"
                  min={0}
                  max={1}
                  step={0.05}
                  value={selectedTrack.effects.delayWet}
                  defaultValue={0.1}
                  color="#38bdf8"
                  onChange={(val) => handleEffectChange('delayWet', val)}
                />
                <Knob
                  label="DELAY FDBK"
                  size="sm"
                  min={0}
                  max={0.85}
                  step={0.05}
                  value={selectedTrack.effects.delayFeedback}
                  defaultValue={0.3}
                  color="#38bdf8"
                  onChange={(val) => handleEffectChange('delayFeedback', val)}
                />
                <Knob
                  label="CHORUS"
                  size="sm"
                  min={0}
                  max={1}
                  step={0.05}
                  value={selectedTrack.effects.chorusWet ?? 0}
                  defaultValue={0}
                  color="#22d3ee"
                  onChange={(val) => handleEffectChange('chorusWet', val)}
                />
                <Knob
                  label="PHASER"
                  size="sm"
                  min={0}
                  max={1}
                  step={0.05}
                  value={selectedTrack.effects.phaserWet ?? 0}
                  defaultValue={0}
                  color="#a855f7"
                  onChange={(val) => handleEffectChange('phaserWet', val)}
                />
                <Knob
                  label="WIDTH"
                  size="sm"
                  min={0}
                  max={2}
                  step={0.05}
                  value={selectedTrack.effects.stereoWidth ?? 1}
                  defaultValue={1}
                  color="#10b981"
                  onChange={(val) => handleEffectChange('stereoWidth', val)}
                />
                <Knob
                  label="DIST DRIVE"
                  size="sm"
                  min={0}
                  max={1}
                  step={0.05}
                  value={selectedTrack.effects.distortionDrive}
                  defaultValue={0}
                  color="#f43f5e"
                  onChange={(val) => handleEffectChange('distortionDrive', val)}
                />
                <Knob
                  label="CH LIMIT"
                  size="sm"
                  min={-12}
                  max={0}
                  step={0.5}
                  value={selectedTrack.effects.limiterThreshold ?? -0.5}
                  defaultValue={-0.5}
                  unit="dB"
                  color="#ef4444"
                  onChange={(val) => handleEffectChange('limiterThreshold', val)}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center w-full text-gray-500 text-xs">
            Select a channel strip below to tweak EQ, Compression, and Effects.
          </div>
        )}
      </div>

      {/* Lower Console: Mixer Channel Strips */}
      <div className="flex-1 overflow-x-auto p-4 flex gap-3 items-stretch bg-[#0a0b10]">
        {/* Track Channel Strips */}
        {project.tracks.map((track) => {
          const isSelected = selectedTrackId === track.id;
          const meterLevel = channelMeters[track.id] || 0;

          return (
            <div
              key={track.id}
              onClick={() => setSelectedTrackId(track.id)}
              className={`w-32 bg-[#121520] rounded-xl border flex flex-col justify-between p-2 shadow-lg transition-all cursor-pointer ${
                isSelected
                  ? 'border-purple-500 shadow-purple-950/40'
                  : 'border-[#1e2334] hover:border-[#2f3852]'
              }`}
            >
              {/* Channel Header */}
              <div className="flex flex-col items-center pb-2 border-b border-[#1c2132]">
                <div
                  className="w-full h-1.5 rounded-full mb-1"
                  style={{ backgroundColor: track.color }}
                />
                <span className="text-xs font-bold text-gray-200 truncate w-full text-center">
                  {track.name}
                </span>
                <span className="text-[9px] font-mono uppercase text-gray-500">
                  {track.type}
                </span>
              </div>

              {/* Pan Knob */}
              <div className="flex justify-center py-2">
                <Knob
                  label="PAN"
                  size="sm"
                  min={-1}
                  max={1}
                  step={0.1}
                  value={track.pan}
                  defaultValue={0}
                  color="#06b6d4"
                  onChange={(val) => handleTrackParamChange(track.id, 'pan', val)}
                />
              </div>

              {/* Fader & Stereo VU Meter */}
              <div className="flex-1 flex items-center justify-center gap-2 py-2">
                {/* VU Meter Bar */}
                <div className="w-2.5 h-44 bg-[#0a0c12] rounded-full overflow-hidden flex flex-col justify-end p-[1px] border border-[#1b2030]">
                  <div
                    className="w-full vu-meter-bg rounded-full transition-all duration-75"
                    style={{ height: `${meterLevel}%` }}
                  />
                </div>

                {/* Vertical Slider Fader */}
                <div className="h-44 flex flex-col items-center justify-between">
                  <span className="text-[8px] font-mono text-gray-500">+6</span>
                  <input
                    type="range"
                    min={-40}
                    max={6}
                    step={1}
                    value={track.volume}
                    onChange={(e) =>
                      handleTrackParamChange(track.id, 'volume', parseFloat(e.target.value))
                    }
                    className="h-32 -rotate-90 w-32 daw-slider cursor-pointer"
                  />
                  <span className="text-[8px] font-mono text-gray-500">-40</span>
                </div>
              </div>

              {/* Volume dB value readout */}
              <div className="text-center font-mono text-[10px] font-bold text-purple-300 pb-1">
                {track.volume > 0 ? `+${track.volume}` : track.volume} dB
              </div>

              {/* Mute & Solo Buttons */}
              <div className="flex gap-1 pt-2 border-t border-[#1c2132]">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTrackParamChange(track.id, 'muted', !track.muted);
                  }}
                  className={`flex-1 py-1 rounded text-[10px] font-bold transition-all ${
                    track.muted
                      ? 'bg-rose-900 text-rose-200 border border-rose-500'
                      : 'bg-[#1b2030] text-gray-400 hover:text-white'
                  }`}
                >
                  MUTE
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTrackParamChange(track.id, 'solo', !track.solo);
                  }}
                  className={`flex-1 py-1 rounded text-[10px] font-bold transition-all ${
                    track.solo
                      ? 'bg-amber-900 text-amber-200 border border-amber-500'
                      : 'bg-[#1b2030] text-gray-400 hover:text-white'
                  }`}
                >
                  SOLO
                </button>
              </div>
            </div>
          );
        })}

        {/* Master Channel Strip */}
        <div className="w-36 bg-[#161a29] rounded-xl border-2 border-indigo-500/60 flex flex-col justify-between p-2 shadow-xl shadow-indigo-950/40">
          <div className="flex flex-col items-center pb-2 border-b border-[#23293e]">
            <div className="w-full h-1.5 rounded-full mb-1 bg-gradient-to-r from-purple-500 to-cyan-400" />
            <span className="text-xs font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400 uppercase">
              MASTER BUS
            </span>
            <span className="text-[9px] font-mono uppercase text-gray-400">
              MAIN OUTPUT
            </span>
          </div>

          {/* Master Limiter Threshold Knob */}
          <div className="flex justify-center py-2">
            <Knob
              label="LIMITER"
              size="sm"
              min={-6}
              max={0}
              step={0.1}
              value={project.master.limiterThreshold}
              defaultValue={-0.2}
              unit="dB"
              color="#ef4444"
              onChange={(val) => handleMasterParamChange('limiterThreshold', val)}
            />
          </div>

          {/* Dual Stereo Master VU Meters & Fader */}
          <div className="flex-1 flex items-center justify-center gap-2 py-2">
            {/* L & R Meters */}
            <div className="flex gap-1">
              <div className="w-2 h-44 bg-[#0a0c12] rounded-full overflow-hidden flex flex-col justify-end p-[1px] border border-[#1b2030]">
                <div
                  className="w-full vu-meter-bg rounded-full transition-all duration-75"
                  style={{ height: `${channelMeters['masterL'] ?? channelMeters['master'] ?? 0}%` }}
                />
              </div>
              <div className="w-2 h-44 bg-[#0a0c12] rounded-full overflow-hidden flex flex-col justify-end p-[1px] border border-[#1b2030]">
                <div
                  className="w-full vu-meter-bg rounded-full transition-all duration-75"
                  style={{
                    height: `${channelMeters['masterR'] ?? channelMeters['master'] ?? 0}%`
                  }}
                />
              </div>
            </div>

            {/* Master Fader */}
            <div className="h-44 flex flex-col items-center justify-between">
              <span className="text-[8px] font-mono text-gray-400">+6</span>
              <input
                type="range"
                min={-40}
                max={6}
                step={1}
                value={project.master.volume}
                onChange={(e) =>
                  handleMasterParamChange('volume', parseFloat(e.target.value))
                }
                className="h-32 -rotate-90 w-32 daw-slider cursor-pointer"
              />
              <span className="text-[8px] font-mono text-gray-400">-40</span>
            </div>
          </div>

          <div className="text-center font-mono text-[10px] font-bold text-cyan-300 pb-1">
            {project.master.volume > 0 ? `+${project.master.volume}` : project.master.volume} dB
          </div>

          <div className="text-[9px] font-bold text-center py-1 bg-indigo-950/60 border border-indigo-700/50 rounded text-indigo-300">
            0 dBFS TRUE PEAK
          </div>
        </div>
      </div>
    </div>
  );
};
