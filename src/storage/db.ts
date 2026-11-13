/**
 * BeatForge Studio - Local IndexedDB Storage
 * Stores projects, custom audio takes, user samples, and settings offline
 */
import * as Tone from 'tone';
import { DAWProject, UserProfile, SampleItem, SynthPatch } from '../types/daw';

const DB_NAME = 'BeatForgeStudioDB';
const DB_VERSION = 2;

export class StudioDatabase {
  private static dbPromise: Promise<IDBDatabase> | null = null;

  public static getDB(): Promise<IDBDatabase> {
    if (!StudioDatabase.dbPromise) {
      StudioDatabase.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('projects')) {
            db.createObjectStore('projects', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('custom_samples')) {
            db.createObjectStore('custom_samples', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('user_profile')) {
            db.createObjectStore('user_profile', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('presets')) {
            db.createObjectStore('presets', { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return StudioDatabase.dbPromise;
  }

  public static async saveProject(project: DAWProject): Promise<void> {
    const db = await StudioDatabase.getDB();
    // In IndexedDB, Blob can be stored directly. Omit non-serializable AudioBuffer and ephemeral blob: URLs.
    const sanitizedTracks = project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        if ('buffer' in clip || 'blob' in clip || 'gain' in clip) {
          const { buffer, audioUrl, ...rest } = clip as any;
          const persistentUrl =
            audioUrl && (audioUrl.startsWith('/api/audio/') || audioUrl.startsWith('data:'))
              ? audioUrl
              : (clip as any).serverAudioUrl;
          return {
            ...rest,
            audioUrl: persistentUrl,
            blob: (clip as any).blob
          };
        }
        return clip;
      })
    }));

    const cleanProject = {
      ...project,
      tracks: sanitizedTracks,
      updatedAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      store.put(cleanProject);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public static async getAllProjects(): Promise<DAWProject[]> {
    const db = await StudioDatabase.getDB();
    const rawProjects: DAWProject[] = await new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readonly');
      const store = tx.objectStore('projects');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    return Promise.all(rawProjects.map((proj) => StudioDatabase.restoreProjectAudioBuffers(proj)));
  }

  public static async getProject(id: string): Promise<DAWProject | null> {
    const db = await StudioDatabase.getDB();
    const rawProject: DAWProject | null = await new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readonly');
      const store = tx.objectStore('projects');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });

    if (!rawProject) return null;
    return StudioDatabase.restoreProjectAudioBuffers(rawProject);
  }

  /**
   * Rehydrate stored audio clip blobs or persistent /api/audio URLs back into playable AudioBuffers and URLs
   */
  public static async restoreProjectAudioBuffers(project: DAWProject): Promise<DAWProject> {
    const rawCtx = (Tone.getContext().rawContext as AudioContext) || undefined;
    if (!rawCtx) return project;

    const restoredTracks = await Promise.all(
      (project.tracks || []).map(async (track) => {
        const restoredClips = await Promise.all(
          (track.clips || []).map(async (clip) => {
            const anyClip = clip as any;
            if (anyClip.buffer) return clip;

            // Case 1: Local IndexedDB Blob
            if (anyClip.blob instanceof Blob) {
              try {
                const arrayBuffer = await anyClip.blob.arrayBuffer();
                const buffer = await rawCtx.decodeAudioData(arrayBuffer);
                const audioUrl = URL.createObjectURL(anyClip.blob);
                return { ...clip, buffer, audioUrl };
              } catch {
                return clip;
              }
            }

            // Case 2: Persistent server URL (/api/audio/...) or data URL
            const remoteUrl = anyClip.serverAudioUrl || anyClip.audioUrl;
            if (remoteUrl && typeof remoteUrl === 'string' && !remoteUrl.startsWith('blob:')) {
              try {
                const res = await fetch(remoteUrl);
                if (res.ok) {
                  const blob = await res.blob();
                  const arrayBuffer = await blob.arrayBuffer();
                  const buffer = await rawCtx.decodeAudioData(arrayBuffer);
                  const audioUrl = URL.createObjectURL(blob);
                  return { ...clip, blob, buffer, audioUrl, serverAudioUrl: remoteUrl };
                }
              } catch {
                // Keep clip metadata intact if offline
              }
            }

            return clip;
          })
        );
        return { ...track, clips: restoredClips };
      })
    );

    return { ...project, tracks: restoredTracks };
  }

  public static async deleteProject(id: string): Promise<void> {
    const db = await StudioDatabase.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public static async saveUserProfile(profile: UserProfile | null): Promise<void> {
    const db = await StudioDatabase.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('user_profile', 'readwrite');
      const store = tx.objectStore('user_profile');
      store.clear();
      if (profile) {
        store.put({ ...profile, id: profile.id || 'usr_default' });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public static async getUserProfile(): Promise<UserProfile | null> {
    const db = await StudioDatabase.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('user_profile', 'readonly');
      const store = tx.objectStore('user_profile');
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        resolve(list[0] || null);
      };
      req.onerror = () => reject(req.error);
    });
  }

  public static async saveCustomSample(sample: SampleItem): Promise<void> {
    const db = await StudioDatabase.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('custom_samples', 'readwrite');
      tx.objectStore('custom_samples').put(sample);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public static async getCustomSamples(): Promise<SampleItem[]> {
    const db = await StudioDatabase.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('custom_samples', 'readonly');
      const req = tx.objectStore('custom_samples').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  public static async savePreset(preset: SynthPatch): Promise<void> {
    const db = await StudioDatabase.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('presets', 'readwrite');
      tx.objectStore('presets').put(preset);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public static async getPresets(): Promise<SynthPatch[]> {
    const db = await StudioDatabase.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('presets', 'readonly');
      const req = tx.objectStore('presets').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  public static async deletePreset(id: string): Promise<void> {
    const db = await StudioDatabase.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('presets', 'readwrite');
      tx.objectStore('presets').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
