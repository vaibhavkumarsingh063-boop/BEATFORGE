import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Copy,
  Trash2,
  Scissors,
  ZoomIn,
  ZoomOut,
  Mic,
  Music2,
  Grid,
  Sliders,
  Crop,
  Edit2,
  Combine
} from 'lucide-react';
import { DAWProject, Track, AudioClip, TrackType, AutomationClip } from '../types/daw';
import { AudioEngine } from '../audio/engine';
import { VocalRecorder } from '../audio/recorder';
import { AudioExporter } from '../audio/exporter';
import { APIClient } from '../api/client';
import { Knob } from './Knob';
import { AudioEditorModal } from './AudioEditorModal';
import { AutomationLaneHeader, AutomationLaneGrid } from './AutomationLane';

interface ArrangementTimelineProps {
  project: DAWProject;
  onUpdateProject: (updater: (prev: DAWProject) => DAWProject) => void;
  onSelectTrack: (trackId: string) => void;
  onEditClip?: (trackId: string, view: 'pianoroll' | 'sequencer') => void;
}

const NOTE_PITCH_MAP: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11
};

function pitchToNormalizedY(pitch: string): number {
  const m = pitch.match(/^([A-G][#b]?)(-?\d+)$/);
  if (!m) return 45;
  const semi = (parseInt(m[2], 10) + 1) * 12 + (NOTE_PITCH_MAP[m[1]] ?? 0);
  // Map MIDI 36 (C2) .. 84 (C6) cleanly to 80% .. 10% height
  const norm = 1 - Math.max(0, Math.min(1, (semi - 36) / 48));
  return 10 + norm * 70;
}

export const ArrangementTimeline: React.FC<ArrangementTimelineProps> = ({
  project,
  onUpdateProject,
  onSelectTrack,
  onEditClip
}) => {
  const engine = AudioEngine.getInstance();
  const [currentBar, setCurrentBar] = useState(engine.currentBarPosition);
  const [zoomLevel, setZoomLevel] = useState<number>(80); // pixels per bar
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string>(project.tracks[0]?.id || '');
  const [activeTool, setActiveTool] = useState<'select' | 'cut'>('select');
  const [snapGrid, setSnapGrid] = useState<number>(0.25); // 0.25 = quarter beat, 1.0 = 1 bar
  const [showAddTrackMenu, setShowAddTrackMenu] = useState<boolean>(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // Automation Lanes open state per track
  const [openAutomationTracks, setOpenAutomationTracks] = useState<Record<string, AutomationClip['targetParam']>>({});
  const [isMerging, setIsMerging] = useState<boolean>(false);

  // Track name editing
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editingTrackName, setEditingTrackName] = useState<string>('');

  // Audio Clip Waveform Editor Modal
  const [editingAudioClip, setEditingAudioClip] = useState<AudioClip | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);

  // Local drag/resize preview so we commit to project undo history once on mouseup
  const [dragPreview, setDragPreview] = useState<{ clipId: string; startBar?: number; durationBars?: number } | null>(null);
  const dragPreviewRef = useRef<{ clipId: string; startBar?: number; durationBars?: number } | null>(null);
  const [draggingClipId, setDraggingClipId] = useState<string | null>(null);
  const dragStartXRef = useRef<number>(0);
  const dragStartBarRef = useRef<number>(0);

  const [resizingClipId, setResizingClipId] = useState<string | null>(null);
  const resizeStartXRef = useRef<number>(0);
  const resizeStartDurationRef = useRef<number>(0);

  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const [isTimelineDragOver, setIsTimelineDragOver] = useState(false);

  // Sync playhead position with audio engine
  useEffect(() => {
    const unsub = engine.subscribe(() => {
      setCurrentBar(engine.currentBarPosition);
    });
    return () => unsub();
  }, [engine]);

  // Close Add Track menu on outside click or Escape
  useEffect(() => {
    if (!showAddTrackMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddTrackMenu(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAddTrackMenu(false);
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [showAddTrackMenu]);

  // Window mousemove / mouseup for clip dragging & resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingClipId) {
        const deltaX = e.clientX - dragStartXRef.current;
        const deltaBars = deltaX / zoomLevel;
        const rawNewBar = Math.max(0, dragStartBarRef.current + deltaBars);
        const snappedBar = Math.round(rawNewBar / snapGrid) * snapGrid;
        const preview = { clipId: draggingClipId, startBar: snappedBar };
        dragPreviewRef.current = preview;
        setDragPreview(preview);
      } else if (resizingClipId) {
        const deltaX = e.clientX - resizeStartXRef.current;
        const deltaBars = deltaX / zoomLevel;
        const rawDuration = Math.max(0.5, resizeStartDurationRef.current + deltaBars);
        const snappedDuration = Math.max(0.5, Math.round(rawDuration / snapGrid) * snapGrid);
        const preview = { clipId: resizingClipId, durationBars: snappedDuration };
        dragPreviewRef.current = preview;
        setDragPreview(preview);
      }
    };

    const handleMouseUp = () => {
      const committed = dragPreviewRef.current;
      if (committed) {
        onUpdateProject((prev) => ({
          ...prev,
          tracks: prev.tracks.map((t) => ({
            ...t,
            clips: t.clips.map((c) => {
              if (c.id !== committed.clipId) return c;
              return {
                ...c,
                ...(committed.startBar !== undefined ? { startBar: committed.startBar } : {}),
                ...(committed.durationBars !== undefined ? { durationBars: committed.durationBars } : {})
              };
            })
          }))
        }));
      }
      dragPreviewRef.current = null;
      setDragPreview(null);
      setDraggingClipId(null);
      setResizingClipId(null);
    };

    if (draggingClipId || resizingClipId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingClipId, resizingClipId, zoomLevel, snapGrid, onUpdateProject]);

  const totalBars = 24;

  // Add new track
  const handleAddTrack = (type: TrackType) => {
    const trackColors = ['#a855f7', '#06b6d4', '#f43f5e', '#10b981', '#f59e0b', '#3b82f6'];
    const newTrack: Track = {
      id: `track-${Date.now()}`,
      name: type === 'drum' ? 'Drum Kit' : type === 'audio' ? 'Vocal / Audio' : 'Synth Melody',
      type,
      color: trackColors[project.tracks.length % trackColors.length],
      volume: 0,
      pan: 0,
      muted: false,
      solo: false,
      armed: type === 'audio',
      instrumentId: type === 'midi' ? 'grand-piano' : 'sub-808',
      effects: {
        eqLow: 0,
        eqMid: 0,
        eqHigh: 0,
        compThreshold: -18,
        compRatio: 3,
        reverbWet: 0.15,
        reverbDecay: 1.5,
        delayWet: 0.1,
        delayTime: '8n',
        delayFeedback: 0.3,
        distortionWet: 0,
        distortionDrive: 0,
        filterCutoff: 18000,
        filterResonance: 1,
        stereoWidth: 1
      },
      clips: []
    };

    onUpdateProject((prev) => ({
      ...prev,
      tracks: [...prev.tracks, newTrack]
    }));
    setSelectedTrackId(newTrack.id);
    onSelectTrack(newTrack.id);
    setShowAddTrackMenu(false);
  };

  // Duplicate track
  const handleDuplicateTrack = (trackId: string) => {
    const track = project.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const duplicated: Track = {
      ...track,
      id: `track-${Date.now()}`,
      name: `${track.name} (Copy)`,
      clips: track.clips.map((c) => ({
        ...c,
        id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
      }))
    };
    onUpdateProject((prev) => ({
      ...prev,
      tracks: [...prev.tracks, duplicated]
    }));
  };

  // Delete track
  const handleDeleteTrack = (trackId: string) => {
    if (project.tracks.length <= 1) return;
    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.filter((t) => t.id !== trackId),
      automationClips: (prev.automationClips || []).filter((a) => a.trackId !== trackId)
    }));
  };

  // Rename track
  const handleSaveTrackRename = (trackId: string) => {
    if (!editingTrackName.trim()) {
      setEditingTrackId(null);
      return;
    }
    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, name: editingTrackName.trim() } : t))
    }));
    setEditingTrackId(null);
  };

  // Toggle Mute / Solo / Arm
  const handleToggleTrackProperty = (trackId: string, property: 'muted' | 'solo' | 'armed') => {
    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, [property]: !t[property] } : t))
    }));
  };

  // Track Volume & Pan
  const handleTrackParamChange = (trackId: string, param: 'volume' | 'pan', val: number) => {
    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, [param]: val } : t))
    }));
  };

  // Click ruler to seek
  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const targetBar = Math.max(0, clickX / zoomLevel);
    const snappedBar = Math.round(targetBar / snapGrid) * snapGrid;
    engine.setPosition(snappedBar);
  };

  // Split / Cut clip at current playhead position
  const handleSplitClip = (trackId: string, clipId: string) => {
    onUpdateProject((prev) => {
      const updatedTracks = prev.tracks.map((t) => {
        if (t.id !== trackId) return t;
        const targetClip = t.clips.find((c) => c.id === clipId);
        if (!targetClip) return t;

        const splitPoint = currentBar - targetClip.startBar;
        if (splitPoint <= 0.25 || splitPoint >= targetClip.durationBars - 0.25) return t;

        const firstHalf = {
          ...targetClip,
          durationBars: splitPoint
        };

        const secondHalf = {
          ...targetClip,
          id: `clip-${Date.now()}`,
          name: `${targetClip.name} (Part 2)`,
          startBar: currentBar,
          durationBars: targetClip.durationBars - splitPoint
        };

        const otherClips = t.clips.filter((c) => c.id !== clipId);
        return { ...t, clips: [...otherClips, firstHalf, secondHalf] };
      });
      return { ...prev, tracks: updatedTracks };
    });
  };

  // Duplicate Clip horizontally
  const handleDuplicateClip = (trackId: string, clipId: string) => {
    onUpdateProject((prev) => {
      const updatedTracks = prev.tracks.map((t) => {
        if (t.id !== trackId) return t;
        const clip = t.clips.find((c) => c.id === clipId);
        if (!clip) return t;

        const newClip = {
          ...clip,
          id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          name: `${clip.name} (Copy)`,
          startBar: clip.startBar + clip.durationBars
        };
        return { ...t, clips: [...t.clips, newClip] };
      });
      return { ...prev, tracks: updatedTracks };
    });
  };

  // Delete clip
  const handleDeleteClip = (trackId: string, clipId: string) => {
    onUpdateProject((prev) => {
      const updatedTracks = prev.tracks.map((t) => {
        if (t.id !== trackId) return t;
        return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
      });
      return { ...prev, tracks: updatedTracks };
    });
    setSelectedClipId(null);
  };

  // Merge multiple audio clips on the currently selected audio track into one composite AudioClip
  const activeTrack = project.tracks.find((t) => t.id === selectedTrackId) || project.tracks[0];
  const mergeableClips = (activeTrack?.clips || []).filter(
    (c): c is AudioClip => 'buffer' in c && Boolean(c.buffer)
  );
  const canMergeSelectedTrack = mergeableClips.length >= 2;

  const handleMergeAudioClips = async () => {
    if (!activeTrack || mergeableClips.length < 2 || isMerging) return;
    setIsMerging(true);
    try {
      const beatsPerBar = project.timeSignature[0] || 4;
      const barSec = beatsPerBar * (60 / project.bpm);
      const minStartBar = Math.min(...mergeableClips.map((c) => c.startBar));
      const maxEndBar = Math.max(...mergeableClips.map((c) => c.startBar + c.durationBars));
      const totalSec = Math.max(0.5, (maxEndBar - minStartBar) * barSec);
      const sampleRate = mergeableClips[0].buffer!.sampleRate || 44100;

      const offlineCtx = new OfflineAudioContext(2, Math.ceil(totalSec * sampleRate), sampleRate);

      for (const clip of mergeableClips) {
        if (!clip.buffer) continue;
        const src = offlineCtx.createBufferSource();
        src.buffer = clip.buffer;
        const rate = clip.playbackRate && clip.playbackRate > 0 ? clip.playbackRate : 1;
        src.playbackRate.value = rate;
        if (clip.pitchShift) src.detune.value = clip.pitchShift * 100;

        const gainNode = offlineCtx.createGain();
        gainNode.gain.value = clip.gain ?? 1;
        src.connect(gainNode);
        gainNode.connect(offlineCtx.destination);

        const relStartSec = Math.max(0, (clip.startBar - minStartBar) * barSec);
        const offsetSec = Math.max(0, clip.cropStart ?? clip.offset ?? 0);
        const clipPlaySec = Math.max(0.05, (clip.durationBars * barSec) / rate);
        src.start(relStartSec, offsetSec, clipPlaySec);
      }

      const mergedBuffer = await offlineCtx.startRendering();
      const wavBlob = AudioExporter.audioBufferToWav(mergedBuffer);
      const localUrl = URL.createObjectURL(wavBlob);
      const serverUrl = await APIClient.getInstance().uploadAudioClip(wavBlob, `${activeTrack.name}-merged.wav`);

      const mergedClip: AudioClip = {
        id: `clip-merged-${Date.now()}`,
        name: `${activeTrack.name} (Merged)`,
        startBar: minStartBar,
        durationBars: maxEndBar - minStartBar,
        offset: 0,
        buffer: mergedBuffer,
        blob: wavBlob,
        audioUrl: serverUrl || localUrl,
        serverAudioUrl: serverUrl || undefined,
        waveformData: VocalRecorder.extractWaveformFromBuffer(mergedBuffer, 120),
        gain: 1,
        originalDuration: mergedBuffer.duration,
        color: activeTrack.color,
        format: 'WAV'
      };

      onUpdateProject((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) => {
          if (t.id !== activeTrack.id) return t;
          const remaining = t.clips.filter((c) => !mergeableClips.some((m) => m.id === c.id));
          return { ...t, clips: [...remaining, mergedClip] };
        })
      }));
    } catch (err) {
      console.error('Failed to merge audio clips:', err);
    } finally {
      setIsMerging(false);
    }
  };

  // Automation Lane helpers
  const toggleAutomationLane = (trackId: string) => {
    setOpenAutomationTracks((prev) => {
      const next = { ...prev };
      if (next[trackId]) {
        delete next[trackId];
      } else {
        const existing = (project.automationClips || []).find((a) => a.trackId === trackId);
        next[trackId] = existing?.targetParam || 'volume';
      }
      return next;
    });
  };

  const handleUpdateAutomationClip = (updatedClip: AutomationClip) => {
    onUpdateProject((prev) => {
      const existing = prev.automationClips || [];
      const idx = existing.findIndex(
        (a) => a.trackId === updatedClip.trackId && a.targetParam === updatedClip.targetParam
      );
      const nextList =
        idx >= 0
          ? existing.map((a, i) => (i === idx ? updatedClip : a))
          : [...existing, updatedClip];
      return { ...prev, automationClips: nextList };
    });
  };

  const handleClearAutomationPoints = (trackId: string, param: AutomationClip['targetParam']) => {
    onUpdateProject((prev) => ({
      ...prev,
      automationClips: (prev.automationClips || []).filter(
        (a) => !(a.trackId === trackId && a.targetParam === param)
      )
    }));
  };

  // Drag and drop audio files directly into timeline lanes
  const handleTimelineDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsTimelineDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        try {
          const item = await VocalRecorder.decodeAudioFile(file);
          const serverAudioUrl = await APIClient.getInstance().uploadAudioClip(file, file.name);
          const clipDurationBars = Math.max(1, Math.ceil(item.durationSeconds / 2));
          const audioClip: AudioClip = {
            id: `clip-drop-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            name: item.name,
            startBar: currentBar,
            durationBars: clipDurationBars,
            offset: 0,
            audioUrl: item.audioUrl,
            serverAudioUrl: serverAudioUrl || undefined,
            buffer: item.buffer,
            blob: item.blob,
            waveformData: item.waveformData,
            gain: 1.0,
            originalDuration: item.durationSeconds,
            color: '#06b6d4',
            format: item.format
          };

          const newTrack: Track = {
            id: `track-audio-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
            name: item.name.substring(0, 18),
            type: 'audio',
            color: '#06b6d4',
            volume: 0,
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
              stereoWidth: 1
            },
            clips: [audioClip]
          };

          onUpdateProject((prev) => ({
            ...prev,
            tracks: [...prev.tracks, newTrack]
          }));
        } catch (err) {
          console.error('Error importing dropped audio', err);
        }
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0b0c11] overflow-hidden select-none">
      {/* Arrangement Toolbar */}
      <div className="h-10 bg-[#121520] border-b border-[#1f2537] px-4 flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#181c2a] border border-[#272e42] rounded-lg p-0.5">
            <button
              onClick={() => setActiveTool('select')}
              className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                activeTool === 'select' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Pointer
            </button>
            <button
              onClick={() => setActiveTool('cut')}
              className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                activeTool === 'cut' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Scissors className="w-3 h-3" />
              <span>Split Tool</span>
            </button>
          </div>

          <div className="h-4 w-[1px] bg-[#22283a]" />

          {/* Snap Selector */}
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <span className="text-[10px] uppercase font-bold text-gray-500">Snap:</span>
            <select
              value={snapGrid}
              onChange={(e) => setSnapGrid(parseFloat(e.target.value))}
              className="bg-[#181c2a] border border-[#272e42] text-xs font-semibold text-gray-200 rounded px-2 py-0.5 outline-none cursor-pointer"
            >
              <option value={1.0}>1 Bar</option>
              <option value={0.5}>1/2 Beat</option>
              <option value={0.25}>1/4 Beat</option>
              <option value={0.125}>1/8 Beat</option>
            </select>
          </div>

          <div className="h-4 w-[1px] bg-[#22283a]" />

          {/* Loop Start/End Range Controls */}
          <div className="flex items-center gap-1.5 bg-[#181c2a] border border-[#272e42] rounded-lg px-2 py-0.5 text-[11px]">
            <span className="text-[10px] uppercase font-bold text-purple-400">Loop Bars:</span>
            <input
              type="number"
              min={0}
              max={Math.max(0, project.loopEndBar - 1)}
              value={project.loopStartBar}
              onChange={(e) => {
                const val = Math.max(0, Math.min(project.loopEndBar - 1, parseInt(e.target.value, 10) || 0));
                onUpdateProject((prev) => ({ ...prev, loopStartBar: val }));
              }}
              className="w-10 bg-[#0f131f] border border-[#293148] rounded px-1 text-center text-white font-mono outline-none"
              title="Loop Start Bar (0-indexed)"
            />
            <span className="text-gray-500">-</span>
            <input
              type="number"
              min={project.loopStartBar + 1}
              max={totalBars}
              value={project.loopEndBar}
              onChange={(e) => {
                const val = Math.max(project.loopStartBar + 1, Math.min(totalBars, parseInt(e.target.value, 10) || 4));
                onUpdateProject((prev) => ({ ...prev, loopEndBar: val }));
              }}
              className="w-10 bg-[#0f131f] border border-[#293148] rounded px-1 text-center text-white font-mono outline-none"
              title="Loop End Bar"
            />
          </div>

          {/* Merge Clips Button */}
          {canMergeSelectedTrack && (
            <button
              onClick={handleMergeAudioClips}
              disabled={isMerging}
              title={`Merge ${mergeableClips.length} audio clips on "${activeTrack.name}"`}
              className="px-2.5 py-1 rounded-lg bg-cyan-950/70 border border-cyan-500/60 text-cyan-300 hover:bg-cyan-600 hover:text-white text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
            >
              <Combine className="w-3.5 h-3.5" />
              <span>{isMerging ? 'Merging...' : 'Merge Audio'}</span>
            </button>
          )}
        </div>

        {/* Right Tools: Zoom & Add Tracks */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#181c2a] border border-[#272e42] rounded-lg p-0.5">
            <button
              onClick={() => setZoomLevel((z) => Math.max(40, z - 15))}
              className="p-1 text-gray-400 hover:text-white cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono text-gray-400 px-1.5">{zoomLevel}px</span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(180, z + 15))}
              className="p-1 text-gray-400 hover:text-white cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Add Track click-toggle dropdown */}
          <div ref={addMenuRef} className="relative">
            <button
              onClick={() => setShowAddTrackMenu((s) => !s)}
              className="px-2.5 py-1 rounded-lg bg-[#1e2334] border border-[#303850] text-gray-200 hover:text-white hover:border-purple-500 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Track</span>
            </button>

            {showAddTrackMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-[#141824] border border-[#2b334a] rounded-lg shadow-xl z-30 py-1">
                <button
                  onClick={() => handleAddTrack('audio')}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-purple-600/30 hover:text-white flex items-center gap-2 cursor-pointer"
                >
                  <Mic className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Audio Track</span>
                </button>
                <button
                  onClick={() => handleAddTrack('midi')}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-purple-600/30 hover:text-white flex items-center gap-2 cursor-pointer"
                >
                  <Music2 className="w-3.5 h-3.5 text-purple-400" />
                  <span>MIDI Track</span>
                </button>
                <button
                  onClick={() => handleAddTrack('drum')}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-purple-600/30 hover:text-white flex items-center gap-2 cursor-pointer"
                >
                  <Grid className="w-3.5 h-3.5 text-rose-400" />
                  <span>Drum Track</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Timeline View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Track Headers Column */}
        <div className="w-64 bg-[#0f1118] border-r border-[#1b1f2e] flex flex-col overflow-y-auto shrink-0 shadow-lg z-10">
          {/* Header Space matching Ruler */}
          <div className="h-8 bg-[#121520] border-b border-[#1b1f2e] flex items-center justify-between px-3 shrink-0">
            <span className="text-[10px] font-extrabold tracking-wider uppercase text-gray-400">
              TRACK LANES ({project.tracks.length})
            </span>
          </div>

          {/* Track Headers + Optional Automation Lane Header */}
          {project.tracks.map((track) => {
            const isEditing = editingTrackId === track.id;
            const autoParam = openAutomationTracks[track.id];
            const isSelected = selectedTrackId === track.id;
            const activeAutoClip = autoParam
              ? (project.automationClips || []).find(
                  (a) => a.trackId === track.id && a.targetParam === autoParam
                )
              : undefined;

            return (
              <React.Fragment key={track.id}>
                <div
                  onClick={() => {
                    setSelectedTrackId(track.id);
                    onSelectTrack(track.id);
                  }}
                  className={`h-20 border-b border-[#1b1f2e] p-2 flex flex-col justify-between transition-colors relative cursor-pointer group shrink-0 ${
                    isSelected ? 'bg-[#1a1f30]' : 'bg-[#131622] hover:bg-[#181c2b]'
                  }`}
                >
                  {/* Left accent strip */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1.5"
                    style={{ backgroundColor: track.color }}
                  />

                  <div className="flex items-center justify-between pl-2">
                    <div className="flex items-center gap-1.5 truncate flex-1">
                      {track.type === 'drum' ? (
                        <Grid className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      ) : track.type === 'audio' ? (
                        <Mic className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <Music2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      )}

                      {isEditing ? (
                        <input
                          type="text"
                          value={editingTrackName}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setEditingTrackName(e.target.value)}
                          onBlur={() => handleSaveTrackRename(track.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveTrackRename(track.id);
                            if (e.key === 'Escape') setEditingTrackId(null);
                          }}
                          className="bg-[#1c2234] border border-purple-500 rounded px-1.5 py-0.5 text-xs text-white outline-none w-32 font-bold"
                        />
                      ) : (
                        <span
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setEditingTrackId(track.id);
                            setEditingTrackName(track.name);
                          }}
                          title="Double-click to rename track"
                          className="text-xs font-bold text-gray-200 truncate cursor-text"
                        >
                          {track.name}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTrackId(track.id);
                          setEditingTrackName(track.name);
                        }}
                        title="Rename Track"
                        className="text-gray-500 hover:text-white cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicateTrack(track.id);
                        }}
                        title="Duplicate Track"
                        className="text-gray-500 hover:text-white cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTrack(track.id);
                        }}
                        title="Delete Track"
                        className="text-gray-500 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Track Controls: Mute, Solo, Arm, Automation, Vol, Pan */}
                  <div className="flex items-center justify-between pl-2 pr-1">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleTrackProperty(track.id, 'muted');
                        }}
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                          track.muted
                            ? 'bg-rose-900/70 text-rose-300 border border-rose-600'
                            : 'bg-[#1e2335] text-gray-400 hover:text-white'
                        }`}
                      >
                        M
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleTrackProperty(track.id, 'solo');
                        }}
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                          track.solo
                            ? 'bg-amber-900/70 text-amber-300 border border-amber-500'
                            : 'bg-[#1e2335] text-gray-400 hover:text-white'
                        }`}
                      >
                        S
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleTrackProperty(track.id, 'armed');
                        }}
                        title="Arm Track for Recording"
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                          track.armed
                            ? 'bg-rose-600 text-white shadow-sm shadow-rose-900/50'
                            : 'bg-[#1e2335] text-gray-400 hover:text-rose-400'
                        }`}
                      >
                        REC
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleAutomationLane(track.id);
                        }}
                        title="Toggle Track Automation Lane"
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-all cursor-pointer flex items-center gap-0.5 ${
                          autoParam
                            ? 'bg-cyan-700 text-white border border-cyan-400'
                            : 'bg-[#1e2335] text-gray-400 hover:text-cyan-300'
                        }`}
                      >
                        <Sliders className="w-2.5 h-2.5" />
                        <span>AUTO</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
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
                      <Knob
                        label="VOL"
                        size="sm"
                        min={-30}
                        max={6}
                        step={1}
                        value={track.volume}
                        defaultValue={0}
                        unit="dB"
                        color="#a855f7"
                        onChange={(val) => handleTrackParamChange(track.id, 'volume', val)}
                      />
                    </div>
                  </div>
                </div>

                {autoParam && (
                  <AutomationLaneHeader
                    track={track}
                    targetParam={autoParam}
                    pointCount={activeAutoClip?.points.length || 0}
                    onTargetParamChange={(newParam) =>
                      setOpenAutomationTracks((prev) => ({ ...prev, [track.id]: newParam }))
                    }
                    onClearPoints={() => handleClearAutomationPoints(track.id, autoParam)}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Right Arrangement Grid & Ruler */}
        <div
          ref={timelineContainerRef}
          onDragOver={(e) => {
            e.preventDefault();
            setIsTimelineDragOver(true);
          }}
          onDragLeave={() => setIsTimelineDragOver(false)}
          onDrop={handleTimelineDrop}
          className={`flex-1 overflow-auto bg-[#0a0b10] relative transition-colors ${
            isTimelineDragOver ? 'bg-cyan-950/20 ring-2 ring-cyan-500 inset-0' : ''
          }`}
        >
          {/* Ruler Header */}
          <div
            onClick={handleRulerClick}
            className="sticky top-0 h-8 bg-[#0f1118] border-b border-[#1b1f2e] flex z-20 cursor-pointer"
            style={{ width: totalBars * zoomLevel }}
          >
            {Array.from({ length: totalBars }).map((_, barIdx) => {
              const isLoopActive =
                project.loopEnabled &&
                barIdx >= project.loopStartBar &&
                barIdx < project.loopEndBar;

              return (
                <div
                  key={barIdx}
                  className={`border-r border-[#1e2334] h-full flex flex-col justify-between px-1 text-[9px] font-mono ${
                    isLoopActive ? 'bg-purple-950/20' : ''
                  }`}
                  style={{ width: zoomLevel }}
                >
                  <div className="flex items-center justify-between text-gray-400 font-bold">
                    <span>{barIdx + 1}</span>
                    <span className="text-[8px] text-gray-600 font-normal">.1</span>
                  </div>
                  <div className="flex justify-between h-1.5 opacity-30">
                    <div className="w-[1px] bg-white h-full" />
                    <div className="w-[1px] bg-white h-1/2" />
                    <div className="w-[1px] bg-white h-2/3" />
                    <div className="w-[1px] bg-white h-1/2" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Vertical Playhead Cursor Line */}
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-cyan-400 pointer-events-none z-30 shadow-[0_0_10px_#06b6d4]"
            style={{ left: currentBar * zoomLevel }}
          >
            <div className="w-3 h-3 bg-cyan-400 -ml-[5px] rotate-45 rounded-xs" />
          </div>

          {/* Loop Region Bar */}
          {project.loopEnabled && (
            <div
              className="absolute top-0 h-1 bg-gradient-to-r from-purple-500 to-cyan-400 z-20"
              style={{
                left: project.loopStartBar * zoomLevel,
                width: (project.loopEndBar - project.loopStartBar) * zoomLevel
              }}
            />
          )}

          {/* Track Lanes */}
          <div className="flex flex-col" style={{ width: totalBars * zoomLevel }}>
            {project.tracks.map((track) => {
              const autoParam = openAutomationTracks[track.id];
              const activeAutoClip = autoParam
                ? (project.automationClips || []).find(
                    (a) => a.trackId === track.id && a.targetParam === autoParam
                  )
                : undefined;

              return (
                <React.Fragment key={track.id}>
                  <div
                    className="h-20 border-b border-[#161a25] relative bg-[#0b0c12] daw-grid-pattern group shrink-0"
                    onClick={() => {
                      if (activeTool === 'cut' && selectedClipId) {
                        handleSplitClip(track.id, selectedClipId);
                      }
                    }}
                  >
                    {/* Render Clips on Lane */}
                    {track.clips.map((clip) => {
                      const isSelected = selectedClipId === clip.id;
                      const previewMatch = dragPreview?.clipId === clip.id ? dragPreview : null;
                      const effectiveStart = previewMatch?.startBar ?? clip.startBar;
                      const effectiveDuration = previewMatch?.durationBars ?? clip.durationBars;
                      const clipWidth = effectiveDuration * zoomLevel;
                      const clipLeft = effectiveStart * zoomLevel;
                      const isAudio = 'buffer' in clip || 'audioUrl' in clip;

                      return (
                        <div
                          key={clip.id}
                          onMouseDown={(e) => {
                            if (e.button === 0 && !(e.target as HTMLElement).closest('.clip-action')) {
                              setDraggingClipId(clip.id);
                              dragStartXRef.current = e.clientX;
                              dragStartBarRef.current = clip.startBar;
                            }
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedClipId(clip.id);
                            setSelectedTrackId(track.id);
                            onSelectTrack(track.id);
                            if (activeTool === 'cut') {
                              handleSplitClip(track.id, clip.id);
                            }
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (isAudio) {
                              setEditingAudioClip(clip as AudioClip);
                              setIsEditorOpen(true);
                            } else if ('notes' in clip) {
                              onEditClip?.(track.id, 'pianoroll');
                            } else if ('drumSteps' in clip) {
                              onEditClip?.(track.id, 'sequencer');
                            }
                          }}
                          className={`absolute top-1 bottom-1 rounded-lg border flex flex-col justify-between overflow-hidden shadow-md cursor-grab active:cursor-grabbing transition-shadow ${
                            isSelected
                              ? 'ring-2 ring-white border-white'
                              : 'border-white/20 hover:border-white/50'
                          }`}
                          style={{
                            left: clipLeft,
                            width: clipWidth,
                            backgroundColor: `${clip.color || track.color}33`,
                            borderColor: clip.color || track.color
                          }}
                        >
                          {/* Clip Title Banner */}
                          <div
                            className="px-2 py-0.5 text-[10px] font-bold text-white flex items-center justify-between"
                            style={{ backgroundColor: clip.color || track.color }}
                          >
                            <span className="truncate flex items-center gap-1">
                              {isAudio && <span className="text-[9px] font-mono opacity-80">[AUDIO]</span>}
                              <span>{clip.name}</span>
                            </span>

                            <div className="flex items-center gap-1 clip-action opacity-0 group-hover:opacity-100">
                              {isAudio && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingAudioClip(clip as AudioClip);
                                    setIsEditorOpen(true);
                                  }}
                                  title="Open Waveform Audio Editor"
                                  className="text-white hover:scale-110 transition-transform cursor-pointer"
                                >
                                  <Crop className="w-2.5 h-2.5" />
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDuplicateClip(track.id, clip.id);
                                }}
                                title="Duplicate clip"
                                className="text-white hover:scale-110 transition-transform cursor-pointer"
                              >
                                <Copy className="w-2.5 h-2.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteClip(track.id, clip.id);
                                }}
                                title="Delete clip"
                                className="text-white hover:scale-110 transition-transform cursor-pointer"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>

                          {/* Clip Visual Content */}
                          <div className="flex-1 flex items-center px-1 overflow-hidden pointer-events-none">
                            {'waveformData' in clip && clip.waveformData ? (
                              <div className="w-full h-full flex items-center gap-[1px]">
                                {clip.waveformData.map((peak, pIdx) => (
                                  <div
                                    key={pIdx}
                                    className="flex-1 rounded-full"
                                    style={{
                                      height: `${peak * 100}%`,
                                      backgroundColor: clip.color || track.color
                                    }}
                                  />
                                ))}
                              </div>
                            ) : 'notes' in clip && clip.notes ? (
                              <div className="w-full h-full relative">
                                {clip.notes.map((note) => (
                                  <div
                                    key={note.id}
                                    className="absolute h-1 bg-white/70 rounded-full"
                                    style={{
                                      left: `${(note.time / (clip.durationBars * 16)) * 100}%`,
                                      width: `${Math.max(
                                        2,
                                        (note.duration / (clip.durationBars * 16)) * 100
                                      )}%`,
                                      top: `${pitchToNormalizedY(note.pitch)}%`
                                    }}
                                  />
                                ))}
                              </div>
                            ) : 'drumSteps' in clip && clip.drumSteps ? (
                              <div className="w-full h-full flex flex-col justify-around py-1">
                                {clip.drumSteps.slice(0, 4).map((seq, sIdx) => (
                                  <div key={sIdx} className="flex justify-between px-1">
                                    {seq.steps.slice(0, 16).map((step, stIdx) => (
                                      <div
                                        key={stIdx}
                                        className={`w-1 h-1 rounded-full ${
                                          step ? 'bg-white' : 'bg-white/10'
                                        }`}
                                      />
                                    ))}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>

                          {/* Right Resize Handle (trim duration) */}
                          <div
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setResizingClipId(clip.id);
                              resizeStartXRef.current = e.clientX;
                              resizeStartDurationRef.current = clip.durationBars;
                            }}
                            className="clip-action absolute right-0 top-0 bottom-0 w-2 hover:w-3 bg-white/20 hover:bg-white/50 cursor-ew-resize transition-all"
                            title="Drag to trim or extend clip length"
                          />
                        </div>
                      );
                    })}
                  </div>

                  {autoParam && (
                    <AutomationLaneGrid
                      track={track}
                      automationClip={
                        activeAutoClip || {
                          id: `auto-${track.id}-${autoParam}`,
                          trackId: track.id,
                          name: `${track.name} ${autoParam}`,
                          targetParam: autoParam,
                          points: [],
                          color: '#06b6d4'
                        }
                      }
                      totalBars={totalBars}
                      zoomLevel={zoomLevel}
                      onChangeClip={handleUpdateAutomationClip}
                      onTargetParamChange={(newParam) =>
                        setOpenAutomationTracks((prev) => ({ ...prev, [track.id]: newParam }))
                      }
                      onClearPoints={handleClearAutomationPoints}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Audio Editor Modal Shortcut */}
      {isEditorOpen && editingAudioClip && (
        <AudioEditorModal
          clip={editingAudioClip}
          trackName={project.tracks.find((t) => t.clips.some((c) => c.id === editingAudioClip.id))?.name}
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          onUpdateClip={(updated) => {
            setEditingAudioClip(updated);
            onUpdateProject((prev) => ({
              ...prev,
              tracks: prev.tracks.map((t) => ({
                ...t,
                clips: t.clips.map((c) => (c.id === updated.id ? updated : c))
              }))
            }));
          }}
          onDuplicateClip={(clipToDup) => {
            const duplicated: AudioClip = {
              ...clipToDup,
              id: `clip-dup-${Date.now()}`,
              name: `${clipToDup.name} (Copy)`,
              startBar: clipToDup.startBar + clipToDup.durationBars
            };
            onUpdateProject((prev) => ({
              ...prev,
              tracks: prev.tracks.map((t) => {
                if (t.clips.some((c) => c.id === clipToDup.id)) {
                  return { ...t, clips: [...t.clips, duplicated] };
                }
                return t;
              })
            }));
          }}
          onSplitClip={(clipToSplit, splitSec) => {
            if (!clipToSplit.buffer) return;
            const b1 = VocalRecorder.trimAudioBuffer(clipToSplit.buffer, 0, splitSec);
            const b2 = VocalRecorder.trimAudioBuffer(clipToSplit.buffer, splitSec, clipToSplit.buffer.duration);

            const c1: AudioClip = {
              ...clipToSplit,
              buffer: b1,
              originalDuration: b1.duration,
              durationBars: Math.max(0.5, Math.ceil(b1.duration / 2)),
              waveformData: VocalRecorder.extractWaveformFromBuffer(b1, 100)
            };
            const c2: AudioClip = {
              ...clipToSplit,
              id: `clip-split-${Date.now()}`,
              name: `${clipToSplit.name} (Pt 2)`,
              startBar: clipToSplit.startBar + c1.durationBars,
              buffer: b2,
              originalDuration: b2.duration,
              durationBars: Math.max(0.5, Math.ceil(b2.duration / 2)),
              waveformData: VocalRecorder.extractWaveformFromBuffer(b2, 100)
            };

            onUpdateProject((prev) => ({
              ...prev,
              tracks: prev.tracks.map((t) => {
                if (t.clips.some((c) => c.id === clipToSplit.id)) {
                  return {
                    ...t,
                    clips: t.clips.map((c) => (c.id === clipToSplit.id ? c1 : c)).concat([c2])
                  };
                }
                return t;
              })
            }));
            setIsEditorOpen(false);
          }}
        />
      )}
    </div>
  );
};
