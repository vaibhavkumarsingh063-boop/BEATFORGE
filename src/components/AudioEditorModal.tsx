import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Play,
  Pause,
  Scissors,
  Crop,
  Sparkles,
  RotateCcw,
  Volume2,
  Sliders,
  Copy,
  Download,
  CheckCircle2,
  FastForward,
  Repeat,
  ArrowLeftRight
} from 'lucide-react';
import { AudioClip, DAWProject } from '../types/daw';
import { VocalRecorder } from '../audio/recorder';
import { AudioExporter } from '../audio/exporter';
import { Knob } from './Knob';

interface AudioEditorModalProps {
  clip: AudioClip | null;
  trackName?: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdateClip: (updatedClip: AudioClip) => void;
  onDuplicateClip: (clip: AudioClip) => void;
  onSplitClip: (clip: AudioClip, splitSec: number) => void;
}

export const AudioEditorModal: React.FC<AudioEditorModalProps> = ({
  clip,
  trackName,
  isOpen,
  onClose,
  onUpdateClip,
  onDuplicateClip,
  onSplitClip
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playProgress, setPlayProgress] = useState<number>(0);
  const [trimStartSec, setTrimStartSec] = useState<number>(clip?.cropStart || 0);
  const [trimEndSec, setTrimEndSec] = useState<number>(
    clip?.cropEnd || clip?.originalDuration || (clip?.buffer ? clip.buffer.duration : 4)
  );
  const [fadeInSec, setFadeInSec] = useState<number>(clip?.fadeIn || 0);
  const [fadeOutSec, setFadeOutSec] = useState<number>(clip?.fadeOut || 0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(clip?.playbackRate || 1.0);
  const [pitchSemitones, setPitchSemitones] = useState<number>(clip?.pitchShift || 0);
  const [isReversed, setIsReversed] = useState<boolean>(clip?.reversed || false);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [gainLevel, setGainLevel] = useState<number>(clip?.gain ?? 1.0);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const totalDuration = clip?.originalDuration || (clip?.buffer ? clip.buffer.duration : 4);

  // Reset local editor state & preview audio whenever clip or open state changes
  useEffect(() => {
    if (!clip) return;
    setIsPlaying(false);
    setPlayProgress(0);
    setTrimStartSec(clip.cropStart || 0);
    setTrimEndSec(clip.cropEnd || clip.originalDuration || (clip.buffer ? clip.buffer.duration : 4));
    setFadeInSec(clip.fadeIn || 0);
    setFadeOutSec(clip.fadeOut || 0);
    setPlaybackSpeed(clip.playbackRate || 1.0);
    setPitchSemitones(clip.pitchShift || 0);
    setIsReversed(clip.reversed || false);
    setGainLevel(clip.gain ?? 1.0);
    setNoticeMessage(null);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, [clip?.id, clip?.audioUrl, isOpen]);

  // Sync Audio preview player
  useEffect(() => {
    if (!isOpen || !clip?.audioUrl) return;
    const audio = new Audio(clip.audioUrl);
    audioRef.current = audio;
    audio.playbackRate = playbackSpeed;
    audio.loop = isLooping;

    const handleTimeUpdate = () => {
      const current = audio.currentTime;
      setPlayProgress(totalDuration > 0 ? current / totalDuration : 0);

      if (current >= trimEndSec) {
        if (isLooping) {
          audio.currentTime = trimStartSec;
        } else {
          audio.pause();
          setIsPlaying(false);
          setPlayProgress(totalDuration > 0 ? trimStartSec / totalDuration : 0);
        }
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setPlayProgress(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
      audioRef.current = null;
    };
  }, [isOpen, clip?.id, clip?.audioUrl, totalDuration, trimStartSec, trimEndSec, playbackSpeed, isLooping]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
      audioRef.current.loop = isLooping;
    }
  }, [playbackSpeed, isLooping]);

  // Draw Waveform and Trim / Playhead Markers
  useEffect(() => {
    if (!isOpen || !clip) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#0d0f17';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#1e2436';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    const peaks = clip.waveformData || [];
    if (peaks.length > 0) {
      const sliceWidth = width / peaks.length;
      ctx.fillStyle = isReversed ? '#06b6d4' : '#a855f7';

      for (let i = 0; i < peaks.length; i++) {
        const peak = peaks[i] * gainLevel;
        const barHeight = peak * (height / 2);
        const x = isReversed ? width - (i + 1) * sliceWidth : i * sliceWidth;

        ctx.fillRect(x, height / 2 - barHeight, Math.max(1, sliceWidth - 0.5), barHeight * 2);
      }
    }

    const startX = (trimStartSec / Math.max(0.01, totalDuration)) * width;
    const endX = (trimEndSec / Math.max(0.01, totalDuration)) * width;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    if (startX > 0) ctx.fillRect(0, 0, startX, height);
    if (endX < width) ctx.fillRect(endX, 0, width - endX, height);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, height);
    ctx.stroke();

    if (fadeInSec > 0) {
      const fadeStartX = startX;
      const fadeEndX = Math.min(width, startX + (fadeInSec / Math.max(0.01, totalDuration)) * width);
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(fadeStartX, height);
      ctx.lineTo(fadeEndX, 10);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const playheadX = playProgress * width;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
  }, [isOpen, clip, gainLevel, playProgress, trimStartSec, trimEndSec, totalDuration, fadeInSec, isReversed]);

  if (!isOpen || !clip) return null;

  const handlePlayToggle = () => {
    let audio = audioRef.current;
    if (!audio) {
      if (clip.audioUrl) {
        audio = new Audio(clip.audioUrl);
        audioRef.current = audio;
      } else {
        return;
      }
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if (audio.currentTime < trimStartSec || audio.currentTime >= trimEndSec) {
        audio.currentTime = trimStartSec;
      }
      audio.play().catch(console.error);
      setIsPlaying(true);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const progress = Math.max(0, Math.min(1, clickX / rect.width));
    const targetSec = progress * totalDuration;

    if (audioRef.current) {
      audioRef.current.currentTime = targetSec;
    }
    setPlayProgress(progress);
  };

  // NORMALIZE
  const handleNormalize = () => {
    if (!clip.buffer) return;
    const normalizedBuffer = VocalRecorder.normalizeAudioBuffer(clip.buffer, 0.98);
    const newWaveform = VocalRecorder.extractWaveformFromBuffer(normalizedBuffer, 120);

    const updated: AudioClip = {
      ...clip,
      buffer: normalizedBuffer,
      waveformData: newWaveform,
      gain: 1.0
    };
    onUpdateClip(updated);
    setNoticeMessage('Clip normalized to 0 dBFS peak amplitude!');
    setTimeout(() => setNoticeMessage(null), 3000);
  };

  // REVERSE
  const handleReverse = () => {
    if (!clip.buffer) return;
    const reversedBuffer = VocalRecorder.reverseAudioBuffer(clip.buffer);
    const newWaveform = [...(clip.waveformData || [])].reverse();

    const updated: AudioClip = {
      ...clip,
      buffer: reversedBuffer,
      waveformData: newWaveform,
      reversed: !isReversed
    };
    setIsReversed(!isReversed);
    onUpdateClip(updated);
    setNoticeMessage(`Audio reversed ${!isReversed ? 'ON' : 'OFF'}!`);
    setTimeout(() => setNoticeMessage(null), 3000);
  };

  // CROP TO TRIM
  const handleCropToSelection = () => {
    if (!clip.buffer) return;
    const croppedBuffer = VocalRecorder.trimAudioBuffer(clip.buffer, trimStartSec, trimEndSec);
    const newWaveform = VocalRecorder.extractWaveformFromBuffer(croppedBuffer, 120);
    const croppedDuration = croppedBuffer.duration;

    const updated: AudioClip = {
      ...clip,
      buffer: croppedBuffer,
      waveformData: newWaveform,
      originalDuration: croppedDuration,
      durationBars: Math.max(0.5, Math.ceil(croppedDuration / 2)),
      cropStart: 0,
      cropEnd: croppedDuration
    };

    setTrimStartSec(0);
    setTrimEndSec(croppedDuration);
    onUpdateClip(updated);
    setNoticeMessage(`Audio cropped to selection (${croppedDuration.toFixed(1)}s)!`);
    setTimeout(() => setNoticeMessage(null), 3000);
  };

  // APPLY CHANGES
  const handleSaveAndApply = () => {
    const updated: AudioClip = {
      ...clip,
      gain: gainLevel,
      cropStart: trimStartSec,
      cropEnd: trimEndSec,
      fadeIn: fadeInSec,
      fadeOut: fadeOutSec,
      playbackRate: playbackSpeed,
      pitchShift: pitchSemitones,
      reversed: isReversed
    };
    onUpdateClip(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#10131e] border border-[#23293e] rounded-2xl w-full max-w-4xl p-6 shadow-2xl flex flex-col gap-5 select-none overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1f2537] pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-purple-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                <span>AUDIO CLIP EDITOR</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700">
                  {clip.name}
                </span>
              </h3>
              <p className="text-[11px] text-gray-400">
                Track: {trackName || 'Audio Track'} • {totalDuration.toFixed(2)}s •{' '}
                {clip.format || 'PCM'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1f2537] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notice alert */}
        {noticeMessage && (
          <div className="bg-emerald-950/80 border border-emerald-500 rounded-xl px-3 py-2 flex items-center gap-2 text-emerald-300 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{noticeMessage}</span>
          </div>
        )}

        {/* Interactive Waveform Canvas Container */}
        <div className="flex flex-col gap-1.5 bg-[#0a0c12] border border-[#1e2335] rounded-xl p-3 shadow-inner">
          <div className="flex items-center justify-between text-[11px] font-mono text-gray-400">
            <span>0.00s</span>
            <span className="text-cyan-400 font-bold">
              Current: {(playProgress * totalDuration).toFixed(2)}s
            </span>
            <span>{totalDuration.toFixed(2)}s</span>
          </div>

          <canvas
            ref={canvasRef}
            width={820}
            height={160}
            onClick={handleCanvasClick}
            className="w-full h-36 rounded-lg cursor-pointer block"
            title="Click anywhere to scrub playhead"
          />

          {/* Transport Bar under Canvas */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePlayToggle}
                className="w-9 h-9 rounded-xl bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center shadow-md transition-transform active:scale-95 cursor-pointer"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
              </button>

              <button
                onClick={() => setIsLooping(!isLooping)}
                className={`p-2 rounded-xl text-xs font-bold border transition-all ${
                  isLooping
                    ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300'
                    : 'bg-[#181c2a] border-[#252c3e] text-gray-400 hover:text-white'
                }`}
                title="Loop playback between trim markers"
              >
                <Repeat className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Editing Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleCropToSelection}
                className="px-3 py-1.5 rounded-xl bg-[#1a2030] hover:bg-purple-600 text-gray-200 hover:text-white text-xs font-bold flex items-center gap-1.5 border border-[#2b334a] transition-all cursor-pointer"
                title="Crop audio buffer to active selection"
              >
                <Crop className="w-3.5 h-3.5" />
                <span>Crop Selection</span>
              </button>

              <button
                onClick={handleNormalize}
                className="px-3 py-1.5 rounded-xl bg-[#1a2030] hover:bg-emerald-600 text-gray-200 hover:text-white text-xs font-bold flex items-center gap-1.5 border border-[#2b334a] transition-all cursor-pointer"
                title="Normalize amplitude to 0 dBFS peak"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Normalize</span>
              </button>

              <button
                onClick={handleReverse}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                  isReversed
                    ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300'
                    : 'bg-[#1a2030] border-[#2b334a] text-gray-200 hover:text-white'
                }`}
                title="Reverse audio playback"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Reverse</span>
              </button>

              <button
                onClick={() => onDuplicateClip(clip)}
                className="px-3 py-1.5 rounded-xl bg-[#1a2030] hover:bg-[#252c42] text-gray-200 hover:text-white text-xs font-bold flex items-center gap-1.5 border border-[#2b334a] transition-all cursor-pointer"
                title="Duplicate clip on timeline"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Duplicate</span>
              </button>
            </div>
          </div>
        </div>

        {/* Editing Controls Rack */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Trim & Crop Boundaries */}
          <div className="bg-[#141826] border border-[#22293e] rounded-xl p-3 flex flex-col justify-between gap-2.5">
            <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
              <Scissors className="w-3.5 h-3.5 text-cyan-400" />
              TRIM & REGION BOUNDARIES
            </span>

            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-[11px] font-mono text-gray-400">
                  <span>Start Cut:</span>
                  <span className="text-white font-bold">{trimStartSec.toFixed(2)}s</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={totalDuration - 0.1}
                  step={0.05}
                  value={trimStartSec}
                  onChange={(e) => setTrimStartSec(Math.min(parseFloat(e.target.value), trimEndSec - 0.1))}
                  className="w-full daw-slider h-1 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono text-gray-400">
                  <span>End Cut:</span>
                  <span className="text-white font-bold">{trimEndSec.toFixed(2)}s</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={totalDuration}
                  step={0.05}
                  value={trimEndSec}
                  onChange={(e) => setTrimEndSec(Math.max(parseFloat(e.target.value), trimStartSec + 0.1))}
                  className="w-full daw-slider h-1 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Fade In & Fade Out */}
          <div className="bg-[#141826] border border-[#22293e] rounded-xl p-3 flex flex-col justify-between gap-2.5">
            <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
              <FastForward className="w-3.5 h-3.5 text-pink-400" />
              FADE IN & OUT CURVES
            </span>

            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-[11px] font-mono text-gray-400">
                  <span>Fade In:</span>
                  <span className="text-white font-bold">{fadeInSec.toFixed(2)}s</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.min(5, (trimEndSec - trimStartSec) / 2)}
                  step={0.05}
                  value={fadeInSec}
                  onChange={(e) => setFadeInSec(parseFloat(e.target.value))}
                  className="w-full daw-slider h-1 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono text-gray-400">
                  <span>Fade Out:</span>
                  <span className="text-white font-bold">{fadeOutSec.toFixed(2)}s</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.min(5, (trimEndSec - trimStartSec) / 2)}
                  step={0.05}
                  value={fadeOutSec}
                  onChange={(e) => setFadeOutSec(parseFloat(e.target.value))}
                  className="w-full daw-slider h-1 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Speed, Pitch & Gain Knobs */}
          <div className="bg-[#141826] border border-[#22293e] rounded-xl p-3 flex flex-col justify-between gap-2">
            <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-purple-400" />
              GAIN, PITCH & SPEED
            </span>

            <div className="flex justify-around items-center my-auto">
              <Knob
                label="GAIN"
                size="sm"
                min={0}
                max={2}
                step={0.05}
                value={gainLevel}
                defaultValue={1.0}
                unit="x"
                color="#a855f7"
                onChange={(val) => setGainLevel(val)}
              />

              <Knob
                label="PITCH"
                size="sm"
                min={-12}
                max={12}
                step={1}
                value={pitchSemitones}
                defaultValue={0}
                unit="st"
                color="#06b6d4"
                onChange={(val) => setPitchSemitones(Math.round(val))}
              />

              <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold text-gray-400 uppercase">SPEED</span>
                <select
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                  className="bg-[#1c2234] border border-[#2e3752] text-xs font-bold text-cyan-400 rounded-lg px-2 py-1 mt-1 outline-none"
                >
                  <option value={0.5}>0.5x</option>
                  <option value={0.75}>0.75x</option>
                  <option value={1.0}>1.0x</option>
                  <option value={1.25}>1.25x</option>
                  <option value={1.5}>1.5x</option>
                  <option value={2.0}>2.0x</option>
                </select>
              </div>

              {clip.blob && (
                <button
                  onClick={() => AudioExporter.downloadBlob(clip.blob!, `${clip.name}_Edited.wav`)}
                  title="Download clip WAV"
                  className="p-2 rounded-xl bg-[#202638] text-gray-300 hover:text-white transition-colors"
                >
                  <Download className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex justify-end gap-3 pt-3 border-t border-[#1f2537]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            onClick={handleSaveAndApply}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-purple-900/40 cursor-pointer transition-all"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Apply Changes to Clip</span>
          </button>
        </div>
      </div>
    </div>
  );
};
