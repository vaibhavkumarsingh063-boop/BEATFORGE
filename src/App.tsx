/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { DAWProject, Track } from './types/daw';
import { AudioEngine } from './audio/engine';
import { StudioDatabase } from './storage/db';
import { TEMPLATES } from './data/templates';
import { HeaderBar, DAWView } from './components/HeaderBar';
import { ArrangementTimeline } from './components/ArrangementTimeline';
import { StepSequencer } from './components/StepSequencer';
import { PianoRoll } from './components/PianoRoll';
import { MixerConsole } from './components/MixerConsole';
import { VocalStudio } from './components/VocalStudio';
import { SynthStudio } from './components/SynthStudio';
import { MasteringStudio } from './components/MasteringStudio';
import { SampleLibrary } from './components/SampleLibrary';
import { VirtualKeyboard } from './components/VirtualKeyboard';
import { ExportModal } from './components/ExportModal';
import { ProjectDashboard } from './components/ProjectDashboard';
import { APIClient } from './api/client';
import { Disc3 } from 'lucide-react';

export default function App() {
  const engine = AudioEngine.getInstance();
  const apiClient = APIClient.getInstance();

  // Initialize with the rich Trap & 808 template
  const [project, setProject] = useState<DAWProject>(() => TEMPLATES[0].project);
  const [activeView, setActiveView] = useState<DAWView>('arrangement');
  const [selectedTrackId, setSelectedTrackId] = useState<string>(project.tracks[0]?.id || '');
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);

  // Undo / Redo history stacks
  const [undoStack, setUndoStack] = useState<DAWProject[]>([]);
  const [redoStack, setRedoStack] = useState<DAWProject[]>([]);

  // Startup initialization: verify backend health & load recent project if present
  useEffect(() => {
    let isMounted = true;
    const initializeApp = async () => {
      try {
        await apiClient.checkHealth();
        const projects = await apiClient.getProjects();
        if (isMounted && projects.length > 0) {
          const recent = projects[0];
          if (recent && recent.tracks && recent.tracks.length > 0) {
            setProject(recent);
          }
        }
      } catch (err) {
        console.warn('[BEATFORGE STUDIO] Startup load notice:', err);
      } finally {
        if (isMounted) setIsReady(true);
      }
    };

    initializeApp();
    return () => {
      isMounted = false;
    };
  }, [apiClient]);

  // Sync project to AudioEngine and persistence whenever project state changes
  useEffect(() => {
    if (!project) return;
    engine.syncProject(project);
    // Autosave project with fallback
    apiClient.saveProject(project).catch(() => {});
  }, [project, engine, apiClient]);

  // Project updater with undo stack recording
  const handleUpdateProject = (updater: (prev: DAWProject) => DAWProject) => {
    setProject((prev) => {
      const next = updater(prev);
      setUndoStack((hist) => [...hist.slice(-25), prev]);
      setRedoStack([]);
      return next;
    });
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((hist) => hist.slice(0, hist.length - 1));
    setRedoStack((hist) => [project, ...hist]);
    setProject(previous);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    setRedoStack((hist) => hist.slice(1));
    setUndoStack((hist) => [...hist, project]);
    setProject(next);
  };

  // Global DAW Keyboard Hotkeys (Space for play/pause, hotkeys for switching views)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is inside an input or select
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Spacebar: Play / Pause
      if (e.code === 'Space') {
        e.preventDefault();
        if (engine.isPlaying) {
          engine.pause();
        } else {
          engine.play();
        }
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        handleRedo();
      }

      // Number keys for View Switching (1 to 8)
      if (e.key === '1') setActiveView('arrangement');
      if (e.key === '2') setActiveView('sequencer');
      if (e.key === '3') setActiveView('pianoroll');
      if (e.key === '4') setActiveView('synth');
      if (e.key === '5') setActiveView('mixer');
      if (e.key === '6') setActiveView('vocal');
      if (e.key === '7') setActiveView('mastering');
      if (e.key === '8') setActiveView('samples');
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [engine, undoStack, redoStack, project]);

  if (!isReady) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#0b0c10] text-[#e0e6ed] select-none">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-400 p-[2px] shadow-2xl shadow-purple-900/50">
            <div className="w-full h-full bg-[#0b0c11] rounded-[14px] flex items-center justify-center">
              <Disc3 className="w-7 h-7 text-purple-400 animate-spin" />
            </div>
          </div>
          <div className="text-center">
            <h1 className="font-extrabold text-sm tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-fuchsia-300 to-cyan-400 uppercase">
              BEATFORGE STUDIO
            </h1>
            <p className="text-[10px] font-mono tracking-widest text-gray-500 uppercase mt-1">
              INITIALIZING AUDIO ENGINE & CLOUD DATABASE...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen flex flex-col bg-[#0b0c10] text-[#e0e6ed] overflow-hidden select-none font-sans">
      {/* Top Studio Transport Header */}
      <HeaderBar
        project={project}
        activeView={activeView}
        onViewChange={setActiveView}
        onUpdateProject={handleUpdateProject}
        onOpenDashboard={() => setIsDashboardOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
      />

      {/* Main Workspace Body */}
      <main className="flex-1 flex overflow-hidden relative">
        {activeView === 'arrangement' && (
          <ArrangementTimeline
            project={project}
            onUpdateProject={handleUpdateProject}
            onSelectTrack={(tId) => setSelectedTrackId(tId)}
            onEditClip={(tId, view) => {
              setSelectedTrackId(tId);
              setActiveView(view);
            }}
          />
        )}

        {activeView === 'sequencer' && (
          <StepSequencer project={project} onUpdateProject={handleUpdateProject} />
        )}

        {activeView === 'pianoroll' && (
          <PianoRoll
            project={project}
            onUpdateProject={handleUpdateProject}
            activeTrackId={selectedTrackId}
          />
        )}

        {activeView === 'synth' && (
          <SynthStudio project={project} onUpdateProject={handleUpdateProject} />
        )}

        {activeView === 'mixer' && (
          <MixerConsole project={project} onUpdateProject={handleUpdateProject} />
        )}

        {activeView === 'vocal' && (
          <VocalStudio project={project} onUpdateProject={handleUpdateProject} />
        )}

        {activeView === 'mastering' && (
          <MasteringStudio project={project} onUpdateProject={handleUpdateProject} />
        )}

        {activeView === 'samples' && (
          <SampleLibrary project={project} onUpdateProject={handleUpdateProject} />
        )}
      </main>

      {/* Bottom Virtual Keyboard Bar (available across views for instant playing) */}
      <VirtualKeyboard activeTrackId={selectedTrackId || project.tracks[0]?.id} />

      {/* Modals */}
      <ExportModal
        project={project}
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
      />

      <ProjectDashboard
        currentProject={project}
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
        onLoadProject={(loaded) => {
          setProject(loaded);
          setUndoStack([]);
          setRedoStack([]);
        }}
      />
    </div>
  );
}
