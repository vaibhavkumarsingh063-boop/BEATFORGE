import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Search,
  Play,
  Pause,
  Upload,
  Plus,
  CheckCircle2
} from 'lucide-react';
import { SampleItem, DAWProject, DrumSoundId, AudioClip } from '../types/daw';
import { SAMPLE_CATEGORIES, BUILT_IN_SAMPLES } from '../data/sampleLibrary';
import { AudioEngine } from '../audio/engine';
import { VocalRecorder } from '../audio/recorder';
import { AudioExporter } from '../audio/exporter';
import { APIClient } from '../api/client';
import * as Tone from 'tone';

interface SampleLibraryProps {
  project: DAWProject;
  onUpdateProject: (updater: (prev: DAWProject) => DAWProject) => void;
}

export const SampleLibrary: React.FC<SampleLibraryProps> = ({ project, onUpdateProject }) => {
  const engine = AudioEngine.getInstance();
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [customSamples, setCustomSamples] = useState<SampleItem[]>([]);
  const [addedNotice, setAddedNotice] = useState<string | null>(null);
  const [insertingId, setInsertingId] = useState<string | null>(null);

  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const sampleBuffersRef = useRef<
    Map<string, { buffer: AudioBuffer; blob: Blob; waveformData: number[]; serverAudioUrl?: string }>
  >(new Map());

  useEffect(() => {
    APIClient.getInstance()
      .getCustomSamples()
      .then((list) => {
        if (Array.isArray(list)) setCustomSamples(list);
      })
      .catch(() => {});
  }, []);

  const allSamples = [...customSamples, ...BUILT_IN_SAMPLES];

  const filteredSamples = allSamples.filter((sample) => {
    const matchesCategory =
      selectedCategory === 'All' || sample.category.toLowerCase() === selectedCategory.toLowerCase();
    const matchesSearch =
      searchQuery === '' ||
      sample.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sample.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const handlePreviewSample = (sample: SampleItem) => {
    if (previewingId === sample.id) {
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
      }
      setPreviewingId(null);
      return;
    }

    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
    }

    setPreviewingId(sample.id);

    if (sample.dataUrl) {
      const audio = new Audio(sample.dataUrl);
      audio.onended = () => setPreviewingId(null);
      audio.onerror = () => setPreviewingId(null);
      audio.play().catch(() => setPreviewingId(null));
      audioPreviewRef.current = audio;
      return;
    }

    // Play synthetic preview using AudioEngine
    let drumSoundId: DrumSoundId = 'kick-808';
    const titleLower = sample.title.toLowerCase();
    if (titleLower.includes('kick')) drumSoundId = 'kick-808';
    else if (titleLower.includes('snare')) drumSoundId = 'snare-trap';
    else if (titleLower.includes('hihat')) drumSoundId = 'hihat-closed';
    else if (titleLower.includes('clap')) drumSoundId = 'clap';
    else if (
      titleLower.includes('flute') ||
      titleLower.includes('melody') ||
      titleLower.includes('piano') ||
      titleLower.includes('guitar') ||
      titleLower.includes('pad') ||
      titleLower.includes('synth') ||
      titleLower.includes('sitar')
    ) {
      const track = project.tracks.find((t) => t.type === 'midi') || project.tracks[0];
      if (track) {
        engine.triggerDirectNote(track.id, 'C5', 0.85);
        setTimeout(() => {
          engine.releaseDirectNote(track.id, 'C5');
          setPreviewingId(null);
        }, 500);
        return;
      }
    }

    const drumTrack = project.tracks.find((t) => t.type === 'drum') || project.tracks[0];
    if (drumTrack) {
      engine.triggerDirectDrum(drumTrack.id, drumSoundId, 0.9);
    }
    setTimeout(() => {
      setPreviewingId(null);
    }, 600);
  };

  const handleUploadSample = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const decoded = await VocalRecorder.decodeAudioFile(file);
      const api = APIClient.getInstance();
      const serverAudioUrl = await api.uploadAudioClip(file, file.name);
      const persistentUrl = serverAudioUrl || decoded.audioUrl;

      const newSample: SampleItem = {
        id: `custom-sample-${Date.now()}`,
        title: decoded.name,
        category: selectedCategory !== 'All' ? selectedCategory : 'Hip-hop',
        type: decoded.durationSeconds > 3 ? 'loop' : 'one-shot',
        duration: parseFloat(decoded.durationSeconds.toFixed(2)),
        tags: ['user', 'custom', decoded.format.toLowerCase()],
        isCustom: true,
        dataUrl: persistentUrl
      };

      sampleBuffersRef.current.set(newSample.id, {
        buffer: decoded.buffer,
        blob: decoded.blob,
        waveformData: decoded.waveformData,
        serverAudioUrl: serverAudioUrl || undefined
      });

      setCustomSamples((prev) => [newSample, ...prev]);
      await api.saveCustomSample(newSample);
      setAddedNotice(`Sample "${newSample.title}" uploaded & saved!`);
      setTimeout(() => setAddedNotice(null), 3000);
    } catch (err) {
      console.error('Failed to upload sample', err);
    } finally {
      e.target.value = '';
    }
  };

  const synthesizeBuiltInSampleBuffer = async (sample: SampleItem): Promise<AudioBuffer> => {
    const sampleRate = 44100;
    const duration = Math.max(0.5, Math.min(8, sample.duration || 2));
    const offline = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
    const title = sample.title.toLowerCase();

    if (title.includes('808') || title.includes('bass') || title.includes('kick')) {
      const osc = offline.createOscillator();
      const gain = offline.createGain();
      osc.type = title.includes('bass') ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(140, 0);
      osc.frequency.exponentialRampToValueAtTime(42, Math.min(0.25, duration * 0.4));
      gain.gain.setValueAtTime(0.95, 0);
      gain.gain.exponentialRampToValueAtTime(0.001, Math.min(duration - 0.02, 1.4));
      osc.connect(gain);
      gain.connect(offline.destination);
      osc.start(0);
      osc.stop(duration);
    } else if (title.includes('snare') || title.includes('clap') || title.includes('hihat') || title.includes('tabla') || title.includes('perc')) {
      const noiseBuf = offline.createBuffer(1, Math.ceil(duration * sampleRate), sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noiseSrc = offline.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      const filter = offline.createBiquadFilter();
      filter.type = title.includes('hihat') ? 'highpass' : 'bandpass';
      filter.frequency.value = title.includes('hihat') ? 6500 : 1800;
      const gain = offline.createGain();
      gain.gain.setValueAtTime(0.75, 0);
      gain.gain.exponentialRampToValueAtTime(0.001, Math.min(duration - 0.01, title.includes('hihat') ? 0.16 : 0.35));
      noiseSrc.connect(filter);
      filter.connect(gain);
      gain.connect(offline.destination);
      noiseSrc.start(0);
      noiseSrc.stop(duration);
    } else {
      const rootHz = AudioExporter.pitchToFrequency(
        sample.key ? `${sample.key.replace('m', '')}4` : 'C4'
      );
      const ratios = [1, 1.2, 1.5, 2];
      const stepDur = sample.type === 'loop' ? Math.max(0.25, duration / 4) : duration;
      const count = sample.type === 'loop' ? 4 : 1;
      for (let i = 0; i < count; i++) {
        const osc = offline.createOscillator();
        const filter = offline.createBiquadFilter();
        const gain = offline.createGain();
        osc.type = title.includes('pad') || title.includes('string') ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(rootHz * ratios[i % ratios.length], i * stepDur);
        filter.type = 'lowpass';
        filter.frequency.value = 2800;
        const start = i * stepDur;
        const end = Math.min(duration, start + stepDur);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.4, start + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, Math.max(start + 0.06, end - 0.02));
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(offline.destination);
        osc.start(start);
        osc.stop(end);
      }
    }

    return offline.startRendering();
  };

  const handleAddToArrangement = async (sample: SampleItem) => {
    const audioTrack = project.tracks.find((t) => t.type === 'audio') || project.tracks[0];
    if (!audioTrack) return;

    setInsertingId(sample.id);
    try {
      await Tone.start();
      const api = APIClient.getInstance();
      let cached = sampleBuffersRef.current.get(sample.id);

      if (!cached) {
        let buffer: AudioBuffer;
        let blob: Blob;
        let serverAudioUrl: string | undefined;

        if (sample.dataUrl) {
          const res = await fetch(sample.dataUrl);
          const arr = await res.arrayBuffer();
          const rawCtx = Tone.getContext().rawContext as AudioContext;
          buffer = await rawCtx.decodeAudioData(arr);
          blob = new Blob([arr], { type: 'audio/wav' });
          serverAudioUrl = sample.dataUrl.startsWith('/api/audio') ? sample.dataUrl : undefined;
        } else {
          buffer = await synthesizeBuiltInSampleBuffer(sample);
          blob = AudioExporter.audioBufferToWav(buffer);
          const uploaded = await api.uploadAudioClip(blob, `${sample.title.replace(/\s+/g, '_')}.wav`);
          serverAudioUrl = uploaded || undefined;
        }

        const waveformData = VocalRecorder.extractWaveformFromBuffer(buffer, 100);
        cached = { buffer, blob, waveformData, serverAudioUrl };
        sampleBuffersRef.current.set(sample.id, cached);
      }

      const secondsPerBar = (60 / project.bpm) * project.timeSignature[0];
      const durationBars = Math.max(0.5, parseFloat((cached.buffer.duration / secondsPerBar).toFixed(2)));
      const localUrl = cached.serverAudioUrl || URL.createObjectURL(cached.blob);

      const newClip: AudioClip = {
        id: `clip-sample-${Date.now()}`,
        name: sample.title,
        startBar: Number(AudioEngine.getInstance().currentBarPosition.toFixed(2)),
        durationBars,
        offset: 0,
        audioUrl: localUrl,
        serverAudioUrl: cached.serverAudioUrl,
        buffer: cached.buffer,
        blob: cached.blob,
        waveformData: cached.waveformData,
        gain: 1,
        originalDuration: cached.buffer.duration,
        color: '#38bdf8',
        format: 'WAV'
      };

      onUpdateProject((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) => {
          if (t.id !== audioTrack.id) return t;
          return {
            ...t,
            clips: [...t.clips, newClip]
          };
        })
      }));

      setAddedNotice(`Inserted "${sample.title}" into ${audioTrack.name}!`);
      setTimeout(() => setAddedNotice(null), 3000);
    } catch (err) {
      console.error('Failed to insert sample into timeline:', err);
    } finally {
      setInsertingId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0b0c11] overflow-hidden select-none p-4 gap-4">
      {/* Hidden file upload input */}
      <input
        ref={uploadInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleUploadSample}
      />

      {/* Top Banner & Search */}
      <div className="bg-[#121520] border border-[#1f2537] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-cyan-900/40">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-white tracking-wider uppercase">
              BEATFORGE SAMPLE LIBRARY
            </h2>
            <p className="text-[11px] text-gray-400">
              Royalty-free sounds across Bollywood, Trap, Drill, Lo-fi, EDM, and Cinema
            </p>
          </div>
        </div>

        {/* Search & Upload */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#181c2a] border border-[#272e42] rounded-xl px-3 py-1.5 w-64">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search samples, kicks, loops..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-xs text-white placeholder-gray-500 outline-none w-full"
            />
          </div>

          <button
            onClick={() => uploadInputRef.current?.click()}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-purple-900/40 cursor-pointer transition-all"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Sample</span>
          </button>
        </div>
      </div>

      {/* Added Notification Toast */}
      {addedNotice && (
        <div className="bg-emerald-950/80 border border-emerald-500 rounded-xl px-4 py-2 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{addedNotice}</span>
        </div>
      )}

      {/* Categories Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {SAMPLE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
              selectedCategory === cat
                ? 'bg-cyan-950/70 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-950/40'
                : 'bg-[#141824] border-[#22283a] text-gray-400 hover:text-white'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Samples Grid / List */}
      <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filteredSamples.map((sample) => {
          const isPlaying = previewingId === sample.id;

          return (
            <div
              key={sample.id}
              className="bg-[#121520] border border-[#1f2537] hover:border-cyan-500/50 rounded-xl p-3 flex flex-col justify-between gap-3 shadow-md transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handlePreviewSample(sample)}
                    className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white flex items-center justify-center shadow-md transition-transform active:scale-95 cursor-pointer"
                  >
                    {isPlaying ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    )}
                  </button>

                  <div>
                    <h3 className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">
                      {sample.title}
                    </h3>
                    <div className="text-[10px] text-gray-400 flex items-center gap-2 mt-0.5">
                      <span className="font-semibold text-purple-400">{sample.category}</span>
                      <span>•</span>
                      <span>{sample.type.toUpperCase()}</span>
                      {sample.key && (
                        <>
                          <span>•</span>
                          <span className="font-mono text-cyan-400">{sample.key}</span>
                        </>
                      )}
                      {sample.bpm && (
                        <>
                          <span>•</span>
                          <span className="font-mono">{sample.bpm} BPM</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleAddToArrangement(sample)}
                  disabled={insertingId === sample.id}
                  title="Add to Timeline Arrangement"
                  className="px-2.5 py-1.5 rounded-lg bg-[#1a2030] hover:bg-cyan-600 text-gray-300 hover:text-white text-xs font-bold flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{insertingId === sample.id ? 'Adding...' : 'Insert'}</span>
                </button>
              </div>

              {/* Tags */}
              <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-[#1a1f2e]">
                {sample.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-[#181d2c] text-gray-400 border border-[#22293d]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
