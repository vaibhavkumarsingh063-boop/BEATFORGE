import React, { useState } from 'react';
import {
  X,
  Download,
  FileAudio,
  Layers,
  Sparkles,
  CheckCircle2,
  Clock,
  Radio,
  Sliders
} from 'lucide-react';
import { DAWProject } from '../types/daw';
import { AudioExporter } from '../audio/exporter';
import { APIClient } from '../api/client';

interface ExportModalProps {
  project: DAWProject;
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ project, isOpen, onClose }) => {
  const [exportFormat, setExportFormat] = useState<'wav' | 'mp3' | 'stems'>('wav');
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [renderProgress, setRenderProgress] = useState<number>(0);
  const [completedMessage, setCompletedMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStartExport = async () => {
    setIsRendering(true);
    setRenderProgress(0.1);
    setCompletedMessage(null);

    try {
      const baseTitle = project.name.replace(/\s+/g, '_');
      if (exportFormat === 'wav') {
        const audioBuffer = await AudioExporter.renderProject(project, undefined, (prog) => setRenderProgress(prog));
        const wavBlob = AudioExporter.audioBufferToWav(audioBuffer);
        const fileName = `${baseTitle}_Master.wav`;
        AudioExporter.downloadBlob(wavBlob, fileName);
        await APIClient.getInstance().incrementExports();
        setCompletedMessage(`Successfully rendered & downloaded 16-bit WAV (${fileName})!`);
      } else if (exportFormat === 'mp3') {
        const audioBuffer = await AudioExporter.renderProject(project, undefined, (prog) =>
          setRenderProgress(prog * 0.7)
        );
        setRenderProgress(0.85);
        const mp3Blob = AudioExporter.audioBufferToMp3(audioBuffer, 320);
        const fileName = `${baseTitle}_Master.mp3`;
        AudioExporter.downloadBlob(mp3Blob, fileName);
        await APIClient.getInstance().incrementExports();
        setRenderProgress(1.0);
        setCompletedMessage(`Successfully encoded 320kbps MP3 (${fileName})!`);
      } else {
        setRenderProgress(0.15);
        for (let i = 0; i < project.tracks.length; i++) {
          const track = project.tracks[i];
          const stemBuffer = await AudioExporter.renderProject(project, [track.id]);
          const stemBlob = AudioExporter.audioBufferToWav(stemBuffer);
          const stemName = `${baseTitle}_Stem_${track.name.replace(/\s+/g, '_')}.wav`;
          AudioExporter.downloadBlob(stemBlob, stemName);
          setRenderProgress(0.15 + ((i + 1) / Math.max(1, project.tracks.length)) * 0.85);
        }
        await APIClient.getInstance().incrementExports();
        setCompletedMessage(`Successfully rendered all ${project.tracks.length} WAV stems!`);
      }
    } catch (err) {
      console.error('Export error', err);
      setCompletedMessage('Export failed. Please check browser audio support.');
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#121522] border border-[#272e42] rounded-2xl w-full max-w-lg p-6 shadow-2xl flex flex-col gap-5 select-none">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1f2537] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/30 border border-emerald-500/50 flex items-center justify-center text-emerald-400">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">
                EXPORT SONG & STEMS
              </h3>
              <p className="text-[11px] text-gray-400">Offline studio-grade audio rendering</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-[#1b2030] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format Selection Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div
            onClick={() => setExportFormat('wav')}
            className={`p-3.5 rounded-xl border flex flex-col items-center gap-2 cursor-pointer transition-all ${
              exportFormat === 'wav'
                ? 'bg-purple-950/60 border-purple-500 shadow-md shadow-purple-950/50'
                : 'bg-[#161a27] border-[#22283a] hover:border-[#35405e]'
            }`}
          >
            <FileAudio className="w-6 h-6 text-purple-400" />
            <span className="text-xs font-bold text-white">Lossless WAV</span>
            <span className="text-[9px] text-gray-400 text-center font-mono">16-bit 44.1kHz</span>
          </div>

          <div
            onClick={() => setExportFormat('mp3')}
            className={`p-3.5 rounded-xl border flex flex-col items-center gap-2 cursor-pointer transition-all ${
              exportFormat === 'mp3'
                ? 'bg-purple-950/60 border-purple-500 shadow-md shadow-purple-950/50'
                : 'bg-[#161a27] border-[#22283a] hover:border-[#35405e]'
            }`}
          >
            <Radio className="w-6 h-6 text-cyan-400" />
            <span className="text-xs font-bold text-white">MP3 Audio</span>
            <span className="text-[9px] text-gray-400 text-center font-mono">320kbps Stream</span>
          </div>

          <div
            onClick={() => setExportFormat('stems')}
            className={`p-3.5 rounded-xl border flex flex-col items-center gap-2 cursor-pointer transition-all ${
              exportFormat === 'stems'
                ? 'bg-purple-950/60 border-purple-500 shadow-md shadow-purple-950/50'
                : 'bg-[#161a27] border-[#22283a] hover:border-[#35405e]'
            }`}
          >
            <Layers className="w-6 h-6 text-amber-400" />
            <span className="text-xs font-bold text-white">All Stems</span>
            <span className="text-[9px] text-gray-400 text-center font-mono">
              {project.tracks.length} Tracks
            </span>
          </div>
        </div>

        {/* Project Summary Info */}
        <div className="bg-[#161a28] border border-[#22293d] rounded-xl p-3 flex justify-between items-center text-xs">
          <div>
            <span className="text-gray-400">Song Title:</span>{' '}
            <span className="font-bold text-white">{project.name}</span>
          </div>
          <div className="font-mono text-gray-400">
            {project.bpm} BPM • {project.timeSignature[0]}/{project.timeSignature[1]}
          </div>
        </div>

        {/* Progress Bar when rendering */}
        {isRendering && (
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-gray-400">Rendering Audio...</span>
              <span className="text-emerald-400 font-bold">{Math.round(renderProgress * 100)}%</span>
            </div>
            <div className="w-full h-2.5 bg-[#0e1017] rounded-full overflow-hidden border border-[#1f2537]">
              <div
                className="h-full bg-gradient-to-r from-purple-500 via-indigo-500 to-emerald-400 transition-all duration-150"
                style={{ width: `${renderProgress * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Success Alert */}
        {completedMessage && (
          <div className="bg-emerald-950/70 border border-emerald-500 rounded-xl p-3 flex items-center gap-2.5 text-emerald-300 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{completedMessage}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-[#1f2537]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            onClick={handleStartExport}
            disabled={isRendering}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-900/40 disabled:opacity-50 cursor-pointer transition-all"
          >
            <Download className="w-4 h-4" />
            <span>{isRendering ? 'Rendering...' : 'Render & Download'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
