import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  Plus,
  Trash2,
  Copy,
  Download,
  Upload,
  User,
  Sparkles,
  X,
  Disc3,
  LogOut,
  LogIn
} from 'lucide-react';
import { DAWProject, UserProfile } from '../types/daw';
import { StudioDatabase } from '../storage/db';
import { APIClient } from '../api/client';
import { TEMPLATES, createBlankProject } from '../data/templates';

interface ProjectDashboardProps {
  currentProject: DAWProject;
  isOpen: boolean;
  onClose: () => void;
  onLoadProject: (project: DAWProject) => void;
}

export const ProjectDashboard: React.FC<ProjectDashboardProps> = ({
  currentProject,
  isOpen,
  onClose,
  onLoadProject
}) => {
  const [activeTab, setActiveTab] = useState<'projects' | 'templates' | 'profile'>('projects');
  const [savedProjects, setSavedProjects] = useState<DAWProject[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authName, setAuthName] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [avatarFailed, setAvatarFailed] = useState<boolean>(false);
  const [isSaveAsOpen, setIsSaveAsOpen] = useState<boolean>(false);
  const [saveAsName, setSaveAsName] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      loadSavedProjects();
      APIClient.getInstance().getCurrentUser().then((u) => {
        setUserProfile(u);
        setAvatarFailed(false);
      });
      setSaveAsName(`${currentProject.name} (Copy)`);
      setAuthError(null);
    }
  }, [isOpen, currentProject.name]);

  const loadSavedProjects = async () => {
    try {
      const list = await APIClient.getInstance().getProjects();
      setSavedProjects(list);
    } catch {
      const list = await StudioDatabase.getAllProjects();
      setSavedProjects(list);
    }
  };

  if (!isOpen) return null;

  const uniqueProjectsCount = new Set([...savedProjects.map((p) => p.id), currentProject.id]).size;

  const handleCreateNew = async () => {
    const blank = createBlankProject(`Beat Session ${uniqueProjectsCount + 1}`);
    await APIClient.getInstance().saveProject(blank);
    onLoadProject(blank);
    onClose();
  };

  const handleSaveAsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const copyName = saveAsName.trim() || `${currentProject.name} (Copy)`;
    const cloned: DAWProject = {
      ...currentProject,
      id: `project-${Date.now()}`,
      name: copyName,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await APIClient.getInstance().saveProject(cloned);
    await loadSavedProjects();
    onLoadProject(cloned);
    setIsSaveAsOpen(false);
    onClose();
  };

  const handleSelectTemplate = async (templateProject: DAWProject) => {
    const cloned: DAWProject = {
      ...templateProject,
      id: `project-${Date.now()}`,
      name: `${templateProject.name} (My Version)`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await APIClient.getInstance().saveProject(cloned);
    onLoadProject(cloned);
    onClose();
  };

  const handleDeleteProject = async (id: string) => {
    await APIClient.getInstance().deleteProject(id);
    await loadSavedProjects();
  };

  const handleExportProjectJSON = (proj: DAWProject) => {
    const jsonStr = JSON.stringify(proj, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${proj.name.replace(/\s+/g, '_')}.beatforge`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImportProjectJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        parsed.id = `project-${Date.now()}`;
        parsed.name = `${parsed.name || 'Imported'} (Imported)`;
        await APIClient.getInstance().saveProject(parsed);
        onLoadProject(parsed);
        onClose();
      } catch (err) {
        console.error('Failed to import project', err);
      }
    };
    reader.readAsText(file);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const client = APIClient.getInstance();
      const res =
        authMode === 'signup'
          ? await client.signup(authEmail, authPassword, authName)
          : await client.login(authEmail, authPassword);

      if (!res.success || !res.user) {
        setAuthError(res.error || 'Authentication failed');
      } else {
        setUserProfile(res.user);
        setAuthPassword('');
        setAvatarFailed(false);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await APIClient.getInstance().logout();
    setUserProfile(null);
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((s) => s[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'BF';

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#10131e] border border-[#23293e] rounded-2xl w-full max-w-4xl h-[640px] shadow-2xl flex flex-col select-none overflow-hidden">
        {/* Modal Top Bar */}
        <div className="h-14 bg-[#141826] border-b border-[#21273c] px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-cyan-500 p-[1.5px]">
              <div className="w-full h-full bg-[#0d0f17] rounded-[7px] flex items-center justify-center">
                <Disc3 className="w-4 h-4 text-purple-400" />
              </div>
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white uppercase tracking-wider">
                BEATFORGE STUDIO DASHBOARD
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1f2537] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-[#1f2537] bg-[#121522]">
          <button
            onClick={() => setActiveTab('projects')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'projects'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            <span>My Projects</span>
          </button>

          <button
            onClick={() => setActiveTab('templates')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'templates'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Starter Templates</span>
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'profile'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <User className="w-4 h-4" />
            <span>{userProfile ? userProfile.name : 'Sign In / Account'}</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'projects' && (
            <div className="flex flex-col gap-5">
              {/* Actions Header */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white">Saved Studio Projects</h3>
                  <p className="text-[11px] text-gray-400">
                    Synced with Express Server DB & IndexedDB
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsSaveAsOpen((v) => !v)}
                    className="px-3 py-1.5 rounded-xl bg-[#1b2030] hover:bg-[#252c42] text-cyan-300 text-xs font-bold flex items-center gap-1.5 border border-[#2b334a] transition-all cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Save As...</span>
                  </button>

                  <label className="px-3 py-1.5 rounded-xl bg-[#1b2030] hover:bg-[#252c42] text-gray-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer border border-[#2b334a] transition-all">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Import .beatforge</span>
                    <input
                      type="file"
                      accept=".json,.beatforge"
                      className="hidden"
                      onChange={handleImportProjectJSON}
                    />
                  </label>

                  <button
                    onClick={handleCreateNew}
                    className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-purple-900/40 cursor-pointer transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Project</span>
                  </button>
                </div>
              </div>

              {/* Save As inline bar */}
              {isSaveAsOpen && (
                <form
                  onSubmit={handleSaveAsSubmit}
                  className="bg-[#161a2a] border border-cyan-500/50 rounded-xl p-3 flex items-center gap-3"
                >
                  <span className="text-xs font-bold text-cyan-300 shrink-0">Save Copy As:</span>
                  <input
                    type="text"
                    value={saveAsName}
                    onChange={(e) => setSaveAsName(e.target.value)}
                    placeholder="Enter new project title..."
                    className="flex-1 bg-[#0d1018] border border-[#283148] rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-400"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold cursor-pointer"
                  >
                    Save Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSaveAsOpen(false)}
                    className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                </form>
              )}

              {/* Projects Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#151928] border-2 border-purple-500 rounded-2xl p-4 flex flex-col justify-between shadow-lg shadow-purple-950/40">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-600 font-bold">
                        ACTIVE PROJECT
                      </span>
                      <span className="text-xs font-mono text-cyan-400 font-bold">
                        {currentProject.bpm} BPM
                      </span>
                    </div>
                    <h4 className="text-base font-extrabold text-white mt-2">
                      {currentProject.name}
                    </h4>
                    <p className="text-xs text-gray-400 mt-1">
                      {currentProject.tracks.length} Tracks • {currentProject.author}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-3 mt-4 border-t border-[#23293d]">
                    <span className="text-[10px] text-gray-500 font-mono">
                      Last edited: Just now
                    </span>
                    <button
                      onClick={() => handleExportProjectJSON(currentProject)}
                      className="text-xs text-gray-300 hover:text-white flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>Backup JSON</span>
                    </button>
                  </div>
                </div>

                {savedProjects
                  .filter((p) => p.id !== currentProject.id)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="bg-[#131622] border border-[#202638] hover:border-[#384260] rounded-2xl p-4 flex flex-col justify-between shadow-md transition-all group"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono text-gray-400 font-bold">
                            {p.bpm} BPM
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleExportProjectJSON(p)}
                              title="Export Project File"
                              className="p-1 text-gray-500 hover:text-white cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteProject(p.id)}
                              title="Delete Project"
                              className="p-1 text-gray-500 hover:text-rose-400 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <h4 className="text-sm font-bold text-white mt-1 group-hover:text-purple-300 transition-colors">
                          {p.name}
                        </h4>
                        <p className="text-xs text-gray-400 mt-1">
                          {p.tracks.length} Tracks • {p.timeSignature[0]}/{p.timeSignature[1]}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-3 mt-4 border-t border-[#1a1f2e]">
                        <span className="text-[10px] text-gray-500 font-mono">
                          {new Date(p.updatedAt || p.createdAt).toLocaleDateString()}
                        </span>
                        <button
                          onClick={() => {
                            onLoadProject(p);
                            onClose();
                          }}
                          className="px-3 py-1 rounded-lg bg-[#1f2537] hover:bg-purple-600 text-gray-200 hover:text-white text-xs font-bold transition-all cursor-pointer"
                        >
                          Open Session
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {activeTab === 'templates' && (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-sm font-bold text-white">Starter Genre Templates</h3>
                <p className="text-[11px] text-gray-400">
                  Professionally produced project templates ready to remix or learn from
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {TEMPLATES.map((tmpl) => (
                  <div
                    key={tmpl.name}
                    className="bg-[#131622] border border-[#202638] hover:border-purple-500/60 rounded-2xl p-4 flex flex-col justify-between shadow-md transition-all group"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-purple-950/60 text-purple-300 border border-purple-800 font-bold">
                          {tmpl.genre}
                        </span>
                        <span className="text-xs font-mono font-bold text-cyan-400">
                          {tmpl.bpm} BPM
                        </span>
                      </div>

                      <h4 className="text-sm font-extrabold text-white mt-2 group-hover:text-purple-300 transition-colors">
                        {tmpl.name}
                      </h4>
                      <p className="text-xs text-gray-400 mt-1">
                        Includes custom drum grooves, synthesized basslines, and melody riffs.
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-3 mt-4 border-t border-[#1a1f2e]">
                      <span className="text-[11px] text-gray-400 font-mono">
                        {tmpl.project.tracks.length} Tracks
                      </span>
                      <button
                        onClick={() => handleSelectTemplate(tmpl.project)}
                        className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md cursor-pointer transition-all"
                      >
                        Load Template
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="flex flex-col gap-5 max-w-xl">
              {userProfile ? (
                <>
                  <div className="bg-[#141826] border border-[#23293e] rounded-2xl p-5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      {userProfile.avatar && !avatarFailed ? (
                        <img
                          src={userProfile.avatar}
                          alt={userProfile.name}
                          onError={() => setAvatarFailed(true)}
                          className="w-16 h-16 rounded-2xl object-cover border-2 border-purple-500 shadow-lg shadow-purple-900/30"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center text-white font-black text-xl border-2 border-purple-400">
                          {getInitials(userProfile.name)}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-extrabold text-white">{userProfile.name}</h3>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-600 font-bold">
                            {userProfile.plan}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 font-mono">
                          {userProfile.handle} {userProfile.email ? `• ${userProfile.email}` : ''}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={handleLogout}
                      className="px-3 py-2 rounded-xl bg-[#1b2030] hover:bg-rose-950/70 text-gray-300 hover:text-rose-300 border border-[#2b334a] hover:border-rose-500/50 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Logout</span>
                    </button>
                  </div>

                  {/* Statistics */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#131622] border border-[#202638] rounded-xl p-4">
                      <span className="text-xs text-gray-400">Total Projects</span>
                      <div className="text-2xl font-extrabold text-white mt-1">
                        {uniqueProjectsCount}
                      </div>
                    </div>
                    <div className="bg-[#131622] border border-[#202638] rounded-xl p-4">
                      <span className="text-xs text-gray-400">Master Audio Renders</span>
                      <div className="text-2xl font-extrabold text-cyan-400 mt-1">
                        {userProfile.exportsCount}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-[#141826] border border-[#23293e] rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                      <LogIn className="w-4 h-4 text-purple-400" />
                      <span>{authMode === 'login' ? 'Producer Login' : 'Create Studio Account'}</span>
                    </h3>
                    <button
                      onClick={() => {
                        setAuthMode((m) => (m === 'login' ? 'signup' : 'login'));
                        setAuthError(null);
                      }}
                      className="text-xs text-cyan-400 hover:underline font-semibold cursor-pointer"
                    >
                      {authMode === 'login' ? 'Need an account? Sign Up' : 'Have an account? Sign In'}
                    </button>
                  </div>

                  {authError && (
                    <div className="bg-rose-950/70 border border-rose-500 rounded-xl px-3 py-2 text-xs text-rose-300">
                      {authError}
                    </div>
                  )}

                  <form onSubmit={handleAuthSubmit} className="space-y-3">
                    {authMode === 'signup' && (
                      <div>
                        <label className="block text-[11px] font-mono text-gray-400 mb-1">PRODUCER NAME</label>
                        <input
                          type="text"
                          value={authName}
                          onChange={(e) => setAuthName(e.target.value)}
                          placeholder="e.g. Metro Producer"
                          className="w-full bg-[#0d1018] border border-[#262e45] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-[11px] font-mono text-gray-400 mb-1">EMAIL</label>
                      <input
                        type="email"
                        required
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        placeholder="producer@beatforge.studio"
                        className="w-full bg-[#0d1018] border border-[#262e45] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-mono text-gray-400 mb-1">PASSWORD</label>
                      <input
                        type="password"
                        required
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        placeholder="Enter password (min 4 chars)"
                        className="w-full bg-[#0d1018] border border-[#262e45] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      {authLoading
                        ? 'Authenticating...'
                        : authMode === 'login'
                        ? 'Sign In to BeatForge'
                        : 'Create Producer Account'}
                    </button>
                  </form>
                </div>
              )}

              {/* Settings Info */}
              <div className="bg-[#131622] border border-[#202638] rounded-xl p-4 text-xs space-y-2 text-gray-400">
                <div className="flex justify-between">
                  <span>Audio Engine:</span>
                  <span className="text-white font-mono">Web Audio API + Tone.js 15</span>
                </div>
                <div className="flex justify-between">
                  <span>Sample Rate:</span>
                  <span className="text-white font-mono">44.1 kHz / 32-bit float</span>
                </div>
                <div className="flex justify-between">
                  <span>Storage Engine:</span>
                  <span className="text-white font-mono">Express JSON DB + IndexedDB</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
