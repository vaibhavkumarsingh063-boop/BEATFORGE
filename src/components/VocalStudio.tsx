import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Radio,
  Play,
  Pause,
  Download,
  Trash2,
  Plus,
  Headphones,
  Sliders,
  Volume2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Upload,
  FileAudio,
  FolderOpen,
  Music2,
  Layers,
  Repeat,
  RotateCcw,
  Crop,
  Scissors,
  Check
} from 'lucide-react';
import { DAWProject, AudioClip, Track, UploadedAudioItem, TrackEffects, AutoTuneSettings } from '../types/daw';
import { VocalRecorder, RecordingTake, AudioInputDevice } from '../audio/recorder';
import { AudioEngine } from '../audio/engine';
import { AudioExporter } from '../audio/exporter';
import { APIClient } from '../api/client';
import { Knob } from './Knob';
import { AudioEditorModal } from './AudioEditorModal';
import { AutoTunePanel } from './AutoTunePanel';

interface VocalStudioProps {
  project: DAWProject;
  onUpdateProject: (updater: (prev: DAWProject) => DAWProject) => void;
}

export const VocalStudio: React.FC<VocalStudioProps> = ({ project, onUpdateProject }) => {
  const engine = AudioEngine.getInstance();
  const recorderRef = useRef<VocalRecorder | null>(null);
  const [recorder, setRecorder] = useState<VocalRecorder | null>(null);

  // Active sub-tab: Record, Upload, or Auto-Tune
  const [activeTab, setActiveTab] = useState<'record' | 'upload' | 'autotune'>('record');

  // Mic & Recording states
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isMonitoring, setIsMonitoring] = useState<boolean>(false);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [recordWithBeat, setRecordWithBeat] = useState<boolean>(true);
  const [micError, setMicError] = useState<string | null>(null);

  // Takes & Uploads
  const [takes, setTakes] = useState<RecordingTake[]>([]);
  const [uploadedItems, setUploadedItems] = useState<UploadedAudioItem[]>([]);
  const [activeAuditionId, setActiveAuditionId] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  // Target track
  const audioTracks = project.tracks.filter((t) => t.type === 'audio');
  const [targetTrackId, setTargetTrackId] = useState<string>(
    audioTracks[0]?.id || project.tracks[0]?.id || ''
  );

  useEffect(() => {
    if (!project.tracks.some((t) => t.id === targetTrackId)) {
      const fallback = project.tracks.find((t) => t.type === 'audio')?.id || project.tracks[0]?.id || '';
      setTargetTrackId(fallback);
    }
  }, [project.tracks, targetTrackId]);

  // Selected Clip for Audio Editor
  const [editingClip, setEditingClip] = useState<AudioClip | null>(null);
  const [editingClipTrackId, setEditingClipTrackId] = useState<string>('');
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);

  // Drag and drop state
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const auditionAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const rec = new VocalRecorder();
    recorderRef.current = rec;
    setRecorder(rec);

    rec.getAvailableMicrophones().then((devs) => {
      setDevices(devs);
      if (devs.length > 0) {
        setSelectedDevice(devs[0].deviceId);
      }
    });

    const unsub = rec.subscribe(() => {
      setIsRecording(rec.isRecording);
      setIsPaused(rec.isPaused);
      setIsMonitoring(rec.isMonitoring);
      setElapsedMs(rec.recordingElapsedMs);
      setTakes([...rec.takes]);
    });

    return () => {
      unsub();
      rec.dispose();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  // Real-time oscilloscope visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      const rec = recorderRef.current;

      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (!rec || !rec.liveAnalyser) {
        ctx.strokeStyle = '#23293e';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
        return;
      }

      const bufferLength = rec.liveAnalyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      rec.liveAnalyser.getByteTimeDomainData(dataArray);

      ctx.lineWidth = 2.5;
      ctx.strokeStyle = isRecording ? (isPaused ? '#f59e0b' : '#ef4444') : '#10b981';
      ctx.beginPath();

      const sliceWidth = (canvas.width * 1.0) / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    draw();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isRecording, isPaused]);

  // MICROPHONE CONTROLS
  const handleDeviceChange = async (devId: string) => {
    setSelectedDevice(devId);
    if (recorder) {
      const ok = await recorder.initMicrophone(devId);
      if (!ok) {
        setMicError('Could not access selected microphone. Please check browser permissions.');
      } else {
        setMicError(null);
      }
    }
  };

  const handleStartRecording = async () => {
    if (!recorder) return;
    setMicError(null);

    // If "Record With Beat" is enabled, start playback of the DAW arrangement in sync
    if (recordWithBeat) {
      await engine.play();
    }

    const ok = await recorder.startRecording();
    if (!ok) {
      setMicError('Microphone permission denied or microphone is unavailable.');
      if (recordWithBeat) engine.pause();
    }
  };

  const handlePauseResumeRecording = () => {
    if (!recorder) return;
    if (isPaused) {
      recorder.resumeRecording();
      if (recordWithBeat) engine.play();
    } else {
      recorder.pauseRecording();
      if (recordWithBeat) engine.pause();
    }
  };

  const handleStopRecording = async () => {
    if (!recorder) return;

    if (recordWithBeat) {
      engine.pause();
    }

    const take = await recorder.stopRecording();
    if (take) {
      setNoticeMessage(`Recorded "${take.name}" (${take.durationSeconds.toFixed(1)}s)!`);
      setTimeout(() => setNoticeMessage(null), 3000);

      // Automatically add to armed / target track on timeline
      handleAddTakeToTimeline(take, targetTrackId);
    }
  };

  // Add take to timeline & persist to server audio store
  const handleAddTakeToTimeline = async (take: RecordingTake, trackId: string) => {
    const startBar = Number(engine.currentBarPosition.toFixed(2));
    const secondsPerBar = (60 / project.bpm) * project.timeSignature[0];
    const durationBars = Math.max(0.5, parseFloat((take.durationSeconds / secondsPerBar).toFixed(2)));
    const serverAudioUrl = await APIClient.getInstance().uploadAudioClip(
      take.blob,
      `${take.name.replace(/\s+/g, '_')}.webm`
    );

    const newClip: AudioClip = {
      id: `audio-take-${Date.now()}`,
      name: take.name,
      startBar,
      durationBars,
      offset: 0,
      audioUrl: serverAudioUrl || take.audioUrl,
      serverAudioUrl: serverAudioUrl || undefined,
      buffer: take.buffer,
      blob: take.blob,
      waveformData: take.waveformData,
      gain: 1.0,
      originalDuration: take.durationSeconds,
      color: '#10b981',
      format: 'WEBM'
    };

    onUpdateProject((prev) => {
      const trackExists = prev.tracks.some((t) => t.id === trackId);
      if (!trackExists) {
        const newTrack: Track = {
          id: `track-${Date.now()}`,
          name: `Vocal Lead`,
          type: 'audio',
          color: '#10b981',
          volume: 0,
          pan: 0,
          muted: false,
          solo: false,
          armed: true,
          instrumentId: 'grand-piano',
          effects: {
            eqLow: -1,
            eqMid: 1.5,
            eqHigh: 3.5,
            compThreshold: -20,
            compRatio: 3.5,
            reverbWet: 0.2,
            reverbDecay: 1.8,
            delayWet: 0.15,
            delayTime: '8n',
            delayFeedback: 0.25,
            distortionWet: 0,
            distortionDrive: 0,
            filterCutoff: 18000,
            filterResonance: 1,
            stereoWidth: 1,
            noiseGateThreshold: -60
          },
          clips: [newClip]
        };
        return { ...prev, tracks: [...prev.tracks, newTrack] };
      }

      const updatedTracks = prev.tracks.map((t) => {
        if (t.id !== trackId) return t;
        return { ...t, clips: [...t.clips, newClip] };
      });
      return { ...prev, tracks: updatedTracks };
    });
  };

  // UPLOAD AND IMPORT AUDIO
  const handleProcessUploadedFiles = async (files: FileList | File[]) => {
    const fileList = Array.from(files);
    for (const file of fileList) {
      try {
        const item = await VocalRecorder.decodeAudioFile(file);
        setUploadedItems((prev) => [item, ...prev]);

        // Automatically create a new multitrack audio timeline lane & persist audio
        await handleImportItemToNewTrack(item);

        setNoticeMessage(
          `Imported "${item.name}" (${item.format}, ${(item.sizeBytes / (1024 * 1024)).toFixed(1)}MB)!`
        );
        setTimeout(() => setNoticeMessage(null), 3500);
      } catch (err: any) {
        setMicError(err.message || `Failed to import ${file.name}`);
      }
    }
  };

  const handleImportItemToNewTrack = async (item: UploadedAudioItem) => {
    const colors = ['#06b6d4', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#10b981'];
    const secondsPerBar = (60 / project.bpm) * project.timeSignature[0];
    const clipDurationBars = Math.max(0.5, parseFloat((item.durationSeconds / secondsPerBar).toFixed(2)));
    const serverAudioUrl = await APIClient.getInstance().uploadAudioClip(
      item.blob,
      `${item.name.replace(/\s+/g, '_')}.${item.format.toLowerCase()}`
    );

    const newTrackId = `track-audio-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    onUpdateProject((prev) => {
      const trackColor = colors[prev.tracks.length % colors.length];
      const audioClip: AudioClip = {
        id: `clip-upload-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: item.name,
        startBar: 0,
        durationBars: clipDurationBars,
        offset: 0,
        audioUrl: serverAudioUrl || item.audioUrl,
        serverAudioUrl: serverAudioUrl || undefined,
        buffer: item.buffer,
        blob: item.blob,
        waveformData: item.waveformData,
        gain: 1.0,
        originalDuration: item.durationSeconds,
        color: trackColor,
        format: item.format,
        fileSizeBytes: item.sizeBytes
      };

      const newTrack: Track = {
        id: newTrackId,
        name: item.name.substring(0, 20),
        type: 'audio',
        color: trackColor,
        volume: item.category === 'beat' ? -2 : 0,
        pan: 0,
        muted: false,
        solo: false,
        armed: false,
        instrumentId: 'grand-piano',
        effects: {
          eqLow: 0,
          eqMid: 0,
          eqHigh: 0,
          compThreshold: -16,
          compRatio: 3,
          reverbWet: 0.1,
          reverbDecay: 1.5,
          delayWet: 0,
          delayTime: '8n',
          delayFeedback: 0.2,
          distortionWet: 0,
          distortionDrive: 0,
          filterCutoff: 18000,
          filterResonance: 1,
          stereoWidth: 1,
          noiseGateThreshold: -65
        },
        clips: [audioClip]
      };

      return {
        ...prev,
        tracks: [...prev.tracks, newTrack]
      };
    });
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleProcessUploadedFiles(e.dataTransfer.files);
    }
  };

  // Audition player
  const handleToggleAudition = (url: string, id: string) => {
    if (activeAuditionId === id) {
      auditionAudioRef.current?.pause();
      setActiveAuditionId(null);
      return;
    }

    if (auditionAudioRef.current) {
      auditionAudioRef.current.pause();
    }

    const audio = new Audio(url);
    audio.onended = () => setActiveAuditionId(null);
    audio.play();
    auditionAudioRef.current = audio;
    setActiveAuditionId(id);
  };

  // Target track effects
  const targetTrack = project.tracks.find((t) => t.id === targetTrackId) || project.tracks[0];

  const handleUpdateAutoTune = (settings: AutoTuneSettings) => {
    if (!targetTrack) return;
    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === targetTrack.id ? { ...t, autoTune: settings } : t))
    }));
  };

  const handleEffectChange = (param: keyof TrackEffects, value: any) => {
    if (!targetTrack) return;
    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => {
        if (t.id !== targetTrack.id) return t;
        return { ...t, effects: { ...t.effects, [param]: value } };
      })
    }));
  };

  // Format timer ms to 00:00.0
  const formatTimer = (ms: number) => {
    const totalSec = ms / 1000;
    const minutes = Math.floor(totalSec / 60);
    const seconds = Math.floor(totalSec % 60);
    const tenths = Math.floor((ms % 1000) / 100);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0b0c11] overflow-hidden select-none p-4 gap-4">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleProcessUploadedFiles(e.target.files);
        }}
      />

      {/* Notifications and Errors */}
      {micError && (
        <div className="bg-rose-950/80 border border-rose-500 rounded-xl px-4 py-2.5 flex items-center justify-between text-rose-200 text-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{micError}</span>
          </div>
          <button onClick={() => setMicError(null)} className="text-gray-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {noticeMessage && (
        <div className="bg-emerald-950/80 border border-emerald-500 rounded-xl px-4 py-2.5 flex items-center gap-2.5 text-emerald-300 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{noticeMessage}</span>
        </div>
      )}

      {/* Top Workflow Banner & Mode Switcher */}
      <div className="bg-[#121520] border border-[#1f2537] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 via-purple-600 to-cyan-400 flex items-center justify-center text-white shadow-lg shadow-purple-900/40">
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-white tracking-wider uppercase flex items-center gap-2">
              <span>AUDIO RECORDING & IMPORT STUDIO</span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-700">
                PRO MULTITRACK
              </span>
            </h2>
            <p className="text-[11px] text-gray-400">
              Record microphone vocals over instrumentals or import MP3, WAV, M4A, FLAC, and OGG stems
            </p>
          </div>
        </div>

        {/* Three Prominent Options Tabs */}
        <div className="flex items-center bg-[#171b28] border border-[#272e42] rounded-xl p-1 gap-1">
          <button
            onClick={() => setActiveTab('record')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'record'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-950/50'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>OPTION A: RECORD AUDIO</span>
          </button>

          <button
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'upload'
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/50'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>OPTION B: UPLOAD AUDIO</span>
          </button>

          <button
            onClick={() => setActiveTab('autotune')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'autotune'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-950/50'
                : 'text-purple-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>OPTION C: AUTO-TUNE PRO</span>
          </button>
        </div>
      </div>

      {/* Main Studio Body: Option A (Record), Option B (Upload), or Option C (Auto-Tune) */}
      {activeTab === 'record' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left 2 Cols: Live Microphone Booth */}
          <div className="lg:col-span-2 bg-[#121520] border border-[#1f2537] rounded-2xl p-5 flex flex-col justify-between shadow-xl gap-4">
            {/* Mic Controls Row */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1c2132]">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-rose-400" />
                <select
                  value={selectedDevice}
                  onChange={(e) => handleDeviceChange(e.target.value)}
                  className="bg-[#181c2a] border border-[#293246] text-xs font-semibold text-gray-200 rounded-lg px-2.5 py-1.5 outline-none max-w-xs"
                >
                  {devices.length > 0 ? (
                    devices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId} className="bg-[#181c2a] text-white">
                        {d.label}
                      </option>
                    ))
                  ) : (
                    <option value="">Default Microphone</option>
                  )}
                </select>
              </div>

              {/* Headphone Live Monitor */}
              <button
                onClick={() => {
                  if (recorder) recorder.toggleMonitoring();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all ${
                  isMonitoring
                    ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300'
                    : 'bg-[#181c2a] border-[#293246] text-gray-400 hover:text-white'
                }`}
                title="Use headphones to prevent feedback loop"
              >
                <Headphones className="w-3.5 h-3.5" />
                <span>Live Monitor: {isMonitoring ? 'ON' : 'OFF'}</span>
              </button>

              {/* Record with Beat Toggle */}
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-300">
                <input
                  type="checkbox"
                  checked={recordWithBeat}
                  onChange={(e) => setRecordWithBeat(e.target.checked)}
                  className="rounded border-gray-600 text-purple-600 focus:ring-purple-500 w-4 h-4"
                />
                <span className="text-purple-300">Play Beat While Recording</span>
              </label>
            </div>

            {/* Live Oscilloscope Canvas */}
            <div className="rounded-xl overflow-hidden border border-[#20273a] bg-[#0a0c12] relative">
              <canvas ref={canvasRef} width={640} height={160} className="w-full h-44 block" />

              {/* Recording Status & Timer Overlay */}
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <span
                  className={`flex items-center gap-1.5 text-[11px] font-mono font-bold px-2.5 py-1 rounded-full ${
                    isRecording
                      ? isPaused
                        ? 'bg-amber-950/90 text-amber-300 border border-amber-600'
                        : 'bg-rose-950/90 text-rose-300 border border-rose-600 animate-pulse'
                      : 'bg-[#151928] text-gray-400 border border-[#2b334a]'
                  }`}
                >
                  <Radio className="w-3 h-3" />
                  <span>
                    {isRecording
                      ? isPaused
                        ? 'PAUSED'
                        : 'RECORDING VOCALS'
                      : 'MIC READY'}
                  </span>
                </span>

                {isRecording && (
                  <span className="font-mono text-sm font-extrabold text-white bg-black/60 px-3 py-0.5 rounded-lg border border-white/20">
                    {formatTimer(elapsedMs)}
                  </span>
                )}
              </div>
            </div>

            {/* Recording Transport Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                {!isRecording ? (
                  <button
                    onClick={handleStartRecording}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-rose-900/50 cursor-pointer transition-all"
                  >
                    <Radio className="w-4 h-4" />
                    <span>START RECORDING</span>
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handlePauseResumeRecording}
                      className="px-4 py-2.5 rounded-xl bg-[#202638] hover:bg-[#2c354d] text-white font-bold text-xs flex items-center gap-2 border border-[#323d58] cursor-pointer"
                    >
                      {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4" />}
                      <span>{isPaused ? 'RESUME' : 'PAUSE'}</span>
                    </button>

                    <button
                      onClick={handleStopRecording}
                      className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-rose-900/50 cursor-pointer"
                    >
                      <span>STOP & SAVE TAKE</span>
                    </button>
                  </>
                )}
              </div>

              {/* Target Recording Track */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-400">Target Track:</span>
                <select
                  value={targetTrackId}
                  onChange={(e) => setTargetTrackId(e.target.value)}
                  className="bg-[#181c2a] border border-[#293246] text-xs font-bold text-emerald-400 rounded-lg px-2.5 py-1 outline-none"
                >
                  {project.tracks.map((t) => (
                    <option key={t.id} value={t.id} className="bg-[#181c2a] text-white">
                      {t.name} ({t.type.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Right Col: Vocal FX Processing Rack */}
          <div className="bg-[#121520] border border-[#1f2537] rounded-2xl p-5 flex flex-col justify-between shadow-xl gap-4">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-[#1c2132]">
                <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-purple-400" />
                  REAL-TIME VOCAL FX RACK
                </span>
                <span className="text-[10px] text-purple-400 font-mono font-bold truncate max-w-[100px]">
                  {targetTrack?.name}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                3-Band EQ, Optical Compression, Reverb, Delay & Noise Gate
              </p>
            </div>

            {/* Knobs Grid */}
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 gap-2.5 my-auto">
              <Knob
                label="AIR EQ (8k)"
                size="sm"
                min={-12}
                max={12}
                step={0.5}
                value={targetTrack?.effects.eqHigh || 0}
                defaultValue={3.0}
                unit="dB"
                color="#ec4899"
                onChange={(v) => handleEffectChange('eqHigh', v)}
              />
              <Knob
                label="MID (1k)"
                size="sm"
                min={-12}
                max={12}
                step={0.5}
                value={targetTrack?.effects.eqMid || 0}
                defaultValue={1.0}
                unit="dB"
                color="#06b6d4"
                onChange={(v) => handleEffectChange('eqMid', v)}
              />
              <Knob
                label="LOW CUT"
                size="sm"
                min={-12}
                max={6}
                step={0.5}
                value={targetTrack?.effects.eqLow || 0}
                defaultValue={-2.0}
                unit="dB"
                color="#a855f7"
                onChange={(v) => handleEffectChange('eqLow', v)}
              />
              <Knob
                label="COMP"
                size="sm"
                min={-60}
                max={0}
                step={1}
                value={targetTrack?.effects.compThreshold || -18}
                defaultValue={-20}
                unit="dB"
                color="#f59e0b"
                onChange={(v) => handleEffectChange('compThreshold', v)}
              />
              <Knob
                label="REVERB"
                size="sm"
                min={0}
                max={1}
                step={0.05}
                value={targetTrack?.effects.reverbWet || 0.15}
                defaultValue={0.2}
                color="#c084fc"
                onChange={(v) => handleEffectChange('reverbWet', v)}
              />
              <Knob
                label="DELAY"
                size="sm"
                min={0}
                max={1}
                step={0.05}
                value={targetTrack?.effects.delayWet || 0.1}
                defaultValue={0.15}
                color="#38bdf8"
                onChange={(v) => handleEffectChange('delayWet', v)}
              />
              <Knob
                label="GATE"
                size="sm"
                min={-90}
                max={-20}
                step={2}
                value={targetTrack?.effects.noiseGateThreshold ?? -65}
                defaultValue={-65}
                unit="dB"
                color="#10b981"
                onChange={(v) => handleEffectChange('noiseGateThreshold', v)}
              />
            </div>

            {/* Vocal Preset Chops */}
            <div className="pt-2 border-t border-[#1c2132] flex items-center justify-between text-[11px]">
              <span className="text-gray-400">Quick FX:</span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    handleEffectChange('eqHigh', 4);
                    handleEffectChange('eqLow', -3);
                    handleEffectChange('compThreshold', -22);
                    handleEffectChange('reverbWet', 0.25);
                  }}
                  className="px-2 py-0.5 rounded bg-[#1c2234] hover:bg-purple-600 text-gray-300 hover:text-white transition-colors"
                >
                  Pop Air
                </button>
                <button
                  onClick={() => {
                    handleEffectChange('eqHigh', 5);
                    handleEffectChange('delayWet', 0.25);
                    handleEffectChange('compThreshold', -24);
                    handleEffectChange('distortionDrive', 0.1);
                  }}
                  className="px-2 py-0.5 rounded bg-[#1c2234] hover:bg-purple-600 text-gray-300 hover:text-white transition-colors"
                >
                  Trap Lead
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'upload' ? (
        /* Option B: Upload Existing Audio */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Drag & Drop Upload Zone (2 Cols) */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`lg:col-span-2 rounded-2xl border-2 border-dashed p-8 flex flex-col items-center justify-center text-center transition-all ${
              isDraggingOver
                ? 'border-cyan-400 bg-cyan-950/30 scale-[0.99]'
                : 'border-[#283248] bg-[#121520] hover:border-[#3d4c6e]'
            }`}
          >
            <div className="w-16 h-16 rounded-2xl bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 mb-3 shadow-lg">
              <Upload className="w-8 h-8" />
            </div>

            <h3 className="text-base font-extrabold text-white">
              Drag & Drop Audio Files Here
            </h3>
            <p className="text-xs text-gray-400 mt-1 max-w-md">
              Upload full beats, instrumentals, vocal tracks, background loops or sound effects.
              Every file automatically becomes a multitrack timeline audio lane!
            </p>

            {/* Supported Formats Badges */}
            <div className="flex flex-wrap justify-center gap-1.5 my-4">
              {['MP3', 'WAV', 'M4A', 'AAC', 'OGG', 'FLAC', 'WEBM'].map((fmt) => (
                <span
                  key={fmt}
                  className="px-2 py-0.5 rounded-md bg-[#191e2e] border border-[#2b354d] text-[10px] font-mono font-bold text-cyan-300"
                >
                  {fmt}
                </span>
              ))}
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-cyan-900/40 flex items-center gap-2 cursor-pointer transition-all"
            >
              <FolderOpen className="w-4 h-4" />
              <span>Browse Audio Files</span>
            </button>
          </div>

          {/* Uploaded Audio Files Tray */}
          <div className="bg-[#121520] border border-[#1f2537] rounded-2xl p-4 flex flex-col justify-between shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-[#1c2132]">
              <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                <FileAudio className="w-4 h-4 text-cyan-400" />
                IMPORTED AUDIO FILES ({uploadedItems.length})
              </span>
            </div>

            <div className="flex-1 overflow-y-auto my-2 space-y-2 max-h-72">
              {uploadedItems.length === 0 ? (
                <div className="h-44 flex flex-col items-center justify-center text-gray-500 text-xs gap-1.5">
                  <FileAudio className="w-8 h-8 opacity-30 text-gray-400" />
                  <span>No audio files uploaded yet.</span>
                  <span className="text-[10px] text-gray-600">Drag or select files to begin</span>
                </div>
              ) : (
                uploadedItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-[#161a28] border border-[#242b3e] rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-sm"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <button
                        onClick={() => handleToggleAudition(item.audioUrl, item.id)}
                        className="w-7 h-7 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center shrink-0 cursor-pointer"
                      >
                        {activeAuditionId === item.id ? (
                          <Pause className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        )}
                      </button>

                      <div className="truncate">
                        <div className="text-xs font-bold text-white truncate">{item.name}</div>
                        <div className="text-[10px] text-gray-400 font-mono">
                          {item.format} • {item.durationSeconds.toFixed(1)}s •{' '}
                          {(item.sizeBytes / (1024 * 1024)).toFixed(1)}MB
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleImportItemToNewTrack(item)}
                      title="Add to New Track"
                      className="px-2 py-1 rounded bg-[#20273a] hover:bg-cyan-600 text-gray-300 hover:text-white text-[10px] font-bold shrink-0 transition-colors"
                    >
                      + Track
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="text-[10px] text-gray-500 text-center font-mono pt-1 border-t border-[#1c2132]">
              Files automatically saved with project in IndexedDB
            </div>
          </div>
        </div>
      ) : (
        <AutoTunePanel
          track={targetTrack}
          project={project}
          onUpdateTrackAutoTune={handleUpdateAutoTune}
        />
      )}

      {/* Bottom Section: Takes & Active Timeline Audio Clips Management */}
      {(() => {
        const timelineAudioClips = project.tracks.flatMap((t) =>
          t.clips
            .filter((c): c is AudioClip => 'gain' in c)
            .map((clip) => ({ trackId: t.id, trackName: t.name, clip }))
        );
        return (
          <div className="bg-[#121520] border border-[#1f2537] rounded-2xl p-4 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-[#1c2132]">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-gray-200 tracking-wider uppercase">
                  RECORDED TAKES & TIMELINE AUDIO CLIPS
                </span>
                <span className="text-[10px] font-mono text-purple-400 font-bold">
                  ({takes.length} Takes • {timelineAudioClips.length} Timeline Clips)
                </span>
              </div>

              <span className="text-[11px] text-gray-400">
                Click &quot;Edit Waveform&quot; to open the waveform editor (crop, trim, normalize, reverse, fades)
              </span>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {takes.length === 0 && timelineAudioClips.length === 0 ? (
                <div className="py-6 flex flex-col items-center justify-center text-gray-500 text-xs gap-1.5">
                  <Mic className="w-6 h-6 opacity-40 text-gray-400" />
                  <span>No recorded takes or audio clips yet. Press &quot;START RECORDING&quot; or upload audio!</span>
                </div>
              ) : (
                <>
                  {takes.map((take) => (
                    <div
                      key={take.id}
                      className="bg-[#151927] border border-[#232a3d] rounded-xl p-3 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleToggleAudition(take.audioUrl, take.id)}
                          className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-md cursor-pointer"
                        >
                          {activeAuditionId === take.id ? (
                            <Pause className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                          )}
                        </button>

                        <div>
                          <div className="text-xs font-bold text-white">{take.name}</div>
                          <div className="text-[10px] text-gray-400 font-mono">
                            {take.durationSeconds.toFixed(1)}s •{' '}
                            {new Date(take.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>

                      <div className="hidden sm:flex items-center gap-[1px] w-48 h-6 bg-[#0a0c12] rounded px-2">
                        {take.waveformData.slice(0, 36).map((peak, idx) => (
                          <div
                            key={idx}
                            className="flex-1 bg-emerald-400 rounded-full"
                            style={{ height: `${peak * 100}%` }}
                          />
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const clip: AudioClip = {
                              id: `take-clip-${take.id}`,
                              name: take.name,
                              startBar: 0,
                              durationBars: Math.max(1, Math.ceil(take.durationSeconds / 2)),
                              offset: 0,
                              audioUrl: take.audioUrl,
                              buffer: take.buffer,
                              blob: take.blob,
                              waveformData: take.waveformData,
                              gain: 1.0,
                              originalDuration: take.durationSeconds,
                              color: '#10b981'
                            };
                            setEditingClip(clip);
                            setEditingClipTrackId(targetTrackId);
                            setIsEditorOpen(true);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#20273a] hover:bg-purple-600 text-gray-200 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Crop className="w-3.5 h-3.5" />
                          <span>Edit Waveform</span>
                        </button>

                        <button
                          onClick={() => handleAddTakeToTimeline(take, targetTrackId)}
                          className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-purple-900/30 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add to Track</span>
                        </button>

                        <button
                          onClick={() => AudioExporter.downloadBlob(take.blob, `${take.name}.webm`)}
                          title="Download Take Audio"
                          className="p-1.5 rounded-lg bg-[#20273a] text-gray-300 hover:text-white transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => {
                            if (recorder) recorder.deleteTake(take.id);
                          }}
                          title="Delete Take"
                          className="p-1.5 rounded-lg text-gray-500 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {timelineAudioClips.map(({ trackId, trackName, clip }) => {
                    const previewUrl = clip.serverAudioUrl || clip.audioUrl;
                    return (
                      <div
                        key={clip.id}
                        className="bg-[#131826] border border-[#222c42] rounded-xl p-3 flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {previewUrl ? (
                            <button
                              onClick={() => handleToggleAudition(previewUrl, clip.id)}
                              className="w-8 h-8 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center shadow-md cursor-pointer shrink-0"
                            >
                              {activeAuditionId === clip.id ? (
                                <Pause className="w-4 h-4" />
                              ) : (
                                <Play className="w-4 h-4 fill-current ml-0.5" />
                              )}
                            </button>
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-[#1d2436] flex items-center justify-center text-gray-500 shrink-0">
                              <FileAudio className="w-4 h-4" />
                            </div>
                          )}

                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate">{clip.name}</div>
                            <div className="text-[10px] text-gray-400 font-mono truncate">
                              Track: {trackName} • Bar {(clip.startBar + 1).toFixed(1)} • {clip.durationBars} bars
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => {
                              setEditingClip(clip);
                              setEditingClipTrackId(trackId);
                              setIsEditorOpen(true);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[#20273a] hover:bg-purple-600 text-gray-200 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <Crop className="w-3.5 h-3.5" />
                            <span>Edit Waveform</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Waveform Audio Clip Editor Modal */}
      {isEditorOpen && editingClip && (
        <AudioEditorModal
          clip={editingClip}
          trackName={
            project.tracks.find((t) => t.id === editingClipTrackId)?.name || targetTrack?.name
          }
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          onUpdateClip={async (updated) => {
            let finalClip = updated;
            if (updated.buffer) {
              const wavBlob = AudioExporter.audioBufferToWav(updated.buffer);
              const serverUrl = await APIClient.getInstance().uploadAudioClip(
                wavBlob,
                `${updated.name.replace(/\s+/g, '_')}.wav`
              );
              finalClip = {
                ...updated,
                blob: wavBlob,
                serverAudioUrl: serverUrl || updated.serverAudioUrl,
                audioUrl: serverUrl || URL.createObjectURL(wavBlob)
              };
            }
            setEditingClip(finalClip);
            onUpdateProject((prev) => ({
              ...prev,
              tracks: prev.tracks.map((t) => ({
                ...t,
                clips: t.clips.map((c) => (c.id === finalClip.id ? finalClip : c))
              }))
            }));
          }}
          onDuplicateClip={(clipToDup) => {
            const ownerTrackId = editingClipTrackId || targetTrackId;
            const duplicated: AudioClip = {
              ...clipToDup,
              id: `clip-dup-${Date.now()}`,
              name: `${clipToDup.name} (Copy)`,
              startBar: clipToDup.startBar + clipToDup.durationBars
            };
            onUpdateProject((prev) => ({
              ...prev,
              tracks: prev.tracks.map((t) => {
                if (t.id !== ownerTrackId) return t;
                return { ...t, clips: [...t.clips, duplicated] };
              })
            }));
          }}
          onSplitClip={async (clipToSplit, splitSec) => {
            if (!clipToSplit.buffer) return;
            const ownerTrackId = editingClipTrackId || targetTrackId;
            const secondsPerBar = (60 / project.bpm) * project.timeSignature[0];
            const b1 = VocalRecorder.trimAudioBuffer(clipToSplit.buffer, 0, splitSec);
            const b2 = VocalRecorder.trimAudioBuffer(
              clipToSplit.buffer,
              splitSec,
              clipToSplit.buffer.duration
            );

            const blob1 = AudioExporter.audioBufferToWav(b1);
            const blob2 = AudioExporter.audioBufferToWav(b2);
            const api = APIClient.getInstance();
            const [url1, url2] = await Promise.all([
              api.uploadAudioClip(blob1, `${clipToSplit.name}_pt1.wav`),
              api.uploadAudioClip(blob2, `${clipToSplit.name}_pt2.wav`)
            ]);

            const durBars1 = Math.max(0.25, parseFloat((b1.duration / secondsPerBar).toFixed(2)));
            const durBars2 = Math.max(0.25, parseFloat((b2.duration / secondsPerBar).toFixed(2)));

            const c1: AudioClip = {
              ...clipToSplit,
              buffer: b1,
              blob: blob1,
              serverAudioUrl: url1 || undefined,
              audioUrl: url1 || URL.createObjectURL(blob1),
              originalDuration: b1.duration,
              durationBars: durBars1,
              waveformData: VocalRecorder.extractWaveformFromBuffer(b1, 100)
            };
            const c2: AudioClip = {
              ...clipToSplit,
              id: `clip-split-${Date.now()}`,
              name: `${clipToSplit.name} (Pt 2)`,
              startBar: clipToSplit.startBar + durBars1,
              buffer: b2,
              blob: blob2,
              serverAudioUrl: url2 || undefined,
              audioUrl: url2 || URL.createObjectURL(blob2),
              originalDuration: b2.duration,
              durationBars: durBars2,
              waveformData: VocalRecorder.extractWaveformFromBuffer(b2, 100)
            };

            onUpdateProject((prev) => ({
              ...prev,
              tracks: prev.tracks.map((t) => {
                if (t.id !== ownerTrackId) return t;
                return {
                  ...t,
                  clips: t.clips.map((c) => (c.id === clipToSplit.id ? c1 : c)).concat([c2])
                };
              })
            }));
            setIsEditorOpen(false);
          }}
        />
      )}
    </div>
  );
};
