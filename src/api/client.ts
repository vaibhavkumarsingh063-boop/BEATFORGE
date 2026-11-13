/**
 * BeatForge Studio - Resilient API Client with Local Fallback
 * Provides unified communication with backend API and fallback to IndexedDB.
 */
import { DAWProject, UserProfile, SampleItem, SynthPatch } from '../types/daw';
import { StudioDatabase } from '../storage/db';

export interface BackendStatus {
  online: boolean;
  message: string;
  projectsCount?: number;
}

const AUTH_TOKEN_KEY = 'beatforge_auth_token';

export class APIClient {
  private static instance: APIClient | null = null;
  public isServerOnline: boolean = false;
  private statusListeners: Set<(status: BackendStatus) => void> = new Set();

  private constructor() {
    this.checkHealth();
  }

  public static getInstance(): APIClient {
    if (!APIClient.instance) {
      APIClient.instance = new APIClient();
    }
    return APIClient.instance;
  }

  private getToken(): string | null {
    try {
      return localStorage.getItem(AUTH_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  private setToken(token: string | null) {
    try {
      if (token) {
        localStorage.setItem(AUTH_TOKEN_KEY, token);
      } else {
        localStorage.removeItem(AUTH_TOKEN_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }

  private authHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...(extra || {}) };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Health check to detect if backend Express server is running
   */
  public async checkHealth(): Promise<BackendStatus> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const res = await fetch('/api/health', { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        this.isServerOnline = true;
        const status = {
          online: true,
          message: 'Cloud Database Connected',
          projectsCount: data.database?.projectsCount
        };
        this.notifyStatus(status);
        return status;
      }
    } catch {
      // Fallback
    }

    this.isServerOnline = false;
    const offlineStatus = {
      online: false,
      message: 'Offline Studio Mode (Local IndexedDB Active)'
    };
    this.notifyStatus(offlineStatus);
    return offlineStatus;
  }

  /**
   * Fetch current authenticated user
   */
  public async getCurrentUser(): Promise<UserProfile | null> {
    const token = this.getToken();
    if (token === 'logged_out') return null;

    try {
      if (this.isServerOnline) {
        const res = await fetch('/api/auth/me', { headers: this.authHeaders() });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.user) {
            await StudioDatabase.saveUserProfile(json.user);
            return json.user;
          }
        } else if (res.status === 401) {
          this.setToken('logged_out');
          await StudioDatabase.saveUserProfile(null);
          return null;
        }
      }
    } catch {
      // Fallback
    }

    const local = await StudioDatabase.getUserProfile();
    if (local) return local;

    return {
      id: 'usr_default',
      email: 'producer@beatforge.studio',
      name: 'Alex Beatmaker',
      handle: '@producer_alex',
      avatar: '',
      plan: 'Studio Pro',
      projectsCount: 1,
      exportsCount: 0
    };
  }

  public async login(email: string, password: string): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: json.error || 'Login failed' };
      }
      if (json.token) this.setToken(json.token);
      if (json.user) await StudioDatabase.saveUserProfile(json.user);
      return { success: true, user: json.user };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error' };
    }
  }

  public async signup(email: string, password: string, name: string): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: json.error || 'Signup failed' };
      }
      if (json.token) this.setToken(json.token);
      if (json.user) await StudioDatabase.saveUserProfile(json.user);
      return { success: true, user: json.user };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error' };
    }
  }

  public async logout(): Promise<void> {
    try {
      if (this.isServerOnline) {
        await fetch('/api/auth/logout', { method: 'POST', headers: this.authHeaders() });
      }
    } catch {
      // Ignore network error on logout
    }
    this.setToken('logged_out');
    await StudioDatabase.saveUserProfile(null);
  }

  public async incrementExports(): Promise<UserProfile | null> {
    try {
      if (this.isServerOnline) {
        const res = await fetch('/api/auth/stats', {
          method: 'POST',
          headers: this.authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ incrementExports: true })
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.user) {
            await StudioDatabase.saveUserProfile(json.user);
            return json.user;
          }
        }
      }
    } catch {
      // Fallback locally
    }
    const local = await StudioDatabase.getUserProfile();
    if (local) {
      const updated = { ...local, exportsCount: (local.exportsCount || 0) + 1 };
      await StudioDatabase.saveUserProfile(updated);
      return updated;
    }
    return null;
  }

  /**
   * Upload binary audio blob to server /api/audio for reload persistence
   */
  public async uploadAudioClip(blob: Blob, filename: string): Promise<string | null> {
    try {
      if (!this.isServerOnline) return null;
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });

      const res = await fetch('/api/audio', {
        method: 'POST',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ filename, mimeType: blob.type, base64Data })
      });
      if (res.ok) {
        const json = await res.json();
        return json.audioUrl || null;
      }
    } catch (err) {
      console.warn('[Audio Upload Fallback] Stored locally only:', err);
    }
    return null;
  }

  /**
   * Fetch all projects (combining backend + local offline storage while preserving local AudioBuffers/Blobs)
   */
  public async getProjects(): Promise<DAWProject[]> {
    let serverProjects: DAWProject[] = [];

    try {
      if (this.isServerOnline) {
        const res = await fetch('/api/projects', { headers: this.authHeaders() });
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.projects)) {
            serverProjects = json.projects;
          }
        }
      }
    } catch {
      // Ignore and proceed to local
    }

    const localProjects = await StudioDatabase.getAllProjects();
    const localById = new Map<string, DAWProject>();
    localProjects.forEach((p) => localById.set(p.id, p));

    const merged = new Map<string, DAWProject>();
    localProjects.forEach((p) => merged.set(p.id, p));

    for (const sp of serverProjects) {
      const lp = localById.get(sp.id);
      if (lp) {
        // Merge local clip audio blobs/buffers onto server project if server copy is missing runtime buffers
        const mergedTracks = (sp.tracks || []).map((st) => {
          const lt = (lp.tracks || []).find((t) => t.id === st.id);
          if (!lt) return st;
          const mergedClips = (st.clips || []).map((sc: any) => {
            const lc: any = (lt.clips || []).find((c) => c.id === sc.id);
            if (lc && (lc.buffer || lc.blob)) {
              return {
                ...sc,
                blob: sc.blob || lc.blob,
                buffer: sc.buffer || lc.buffer,
                audioUrl: lc.audioUrl || sc.audioUrl,
                serverAudioUrl: sc.serverAudioUrl || lc.serverAudioUrl,
                waveformData: sc.waveformData || lc.waveformData
              };
            }
            return sc;
          });
          return { ...st, clips: mergedClips };
        });
        const hydrated = await StudioDatabase.restoreProjectAudioBuffers({ ...sp, tracks: mergedTracks });
        merged.set(sp.id, hydrated);
      } else {
        const hydrated = await StudioDatabase.restoreProjectAudioBuffers(sp);
        merged.set(sp.id, hydrated);
      }
    }

    return Array.from(merged.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  /**
   * Save project to backend API and local IndexedDB
   */
  public async saveProject(project: DAWProject): Promise<void> {
    await StudioDatabase.saveProject(project);

    if (this.isServerOnline) {
      try {
        // Strip non-serializable buffer/blob objects cleanly while keeping serverAudioUrl
        const jsonReady: DAWProject = {
          ...project,
          tracks: project.tracks.map((track) => ({
            ...track,
            clips: track.clips.map((clip: any) => {
              if ('buffer' in clip || 'blob' in clip || 'gain' in clip) {
                const { buffer, blob, ...rest } = clip;
                const persistentUrl =
                  rest.serverAudioUrl ||
                  (rest.audioUrl && !rest.audioUrl.startsWith('blob:') ? rest.audioUrl : undefined);
                return { ...rest, audioUrl: persistentUrl, serverAudioUrl: persistentUrl };
              }
              return clip;
            })
          }))
        };

        await fetch('/api/projects', {
          method: 'POST',
          headers: this.authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(jsonReady)
        });
      } catch (err) {
        console.warn('[Sync Error] Could not save project to backend, kept in local storage:', err);
      }
    }
  }

  /**
   * Delete project
   */
  public async deleteProject(id: string): Promise<void> {
    await StudioDatabase.deleteProject(id);
    if (this.isServerOnline) {
      try {
        await fetch(`/api/projects/${id}`, { method: 'DELETE', headers: this.authHeaders() });
      } catch (err) {
        console.warn('[Sync Error] Could not delete from backend:', err);
      }
    }
  }

  /**
   * Custom Samples Sync
   */
  public async getCustomSamples(): Promise<SampleItem[]> {
    const local = await StudioDatabase.getCustomSamples();
    if (this.isServerOnline) {
      try {
        const res = await fetch('/api/samples', { headers: this.authHeaders() });
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.samples)) {
            const map = new Map<string, SampleItem>();
            local.forEach((s) => map.set(s.id, s));
            json.samples.forEach((s: SampleItem) => map.set(s.id, s));
            return Array.from(map.values());
          }
        }
      } catch {
        // Ignore
      }
    }
    return local;
  }

  public async saveCustomSample(sample: SampleItem): Promise<void> {
    await StudioDatabase.saveCustomSample(sample);
    if (this.isServerOnline) {
      try {
        await fetch('/api/samples', {
          method: 'POST',
          headers: this.authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(sample)
        });
      } catch {
        // Kept locally
      }
    }
  }

  /**
   * Synth Presets Sync
   */
  public async getPresets(): Promise<SynthPatch[]> {
    const local = await StudioDatabase.getPresets();
    if (this.isServerOnline) {
      try {
        const res = await fetch('/api/presets', { headers: this.authHeaders() });
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.presets)) {
            const map = new Map<string, SynthPatch>();
            local.forEach((p) => map.set(p.id, p));
            json.presets.forEach((p: SynthPatch) => map.set(p.id, p));
            return Array.from(map.values());
          }
        }
      } catch {
        // Ignore
      }
    }
    return local;
  }

  public async savePreset(preset: SynthPatch): Promise<void> {
    await StudioDatabase.savePreset(preset);
    if (this.isServerOnline) {
      try {
        await fetch('/api/presets', {
          method: 'POST',
          headers: this.authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(preset)
        });
      } catch {
        // Kept locally
      }
    }
  }

  public onStatusChange(cb: (status: BackendStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  private notifyStatus(status: BackendStatus) {
    this.statusListeners.forEach((cb) => cb(status));
  }
}
