/**
 * BeatForge Studio - Full-Stack Express Server & API Backend
 * Serves REST API endpoints, persistent database storage, and mounts Vite in dev mode.
 */
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Ensure data and uploads directories exist for persistent database and audio files
const DATA_DIR = path.resolve(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

interface StoredUser {
  id: string;
  email: string;
  name: string;
  handle: string;
  avatar: string;
  plan: string;
  passwordHash?: string;
  projectsCount?: number;
  exportsCount?: number;
  createdAt: number;
}

// Initial Database Schema
interface DatabaseSchema {
  users: StoredUser[];
  projects: Array<any>;
  samples: Array<any>;
  presets: Array<any>;
  sessions?: Record<string, { userId: string; createdAt: number }>;
}

const defaultDB: DatabaseSchema = {
  users: [
    {
      id: 'usr_default',
      email: 'producer@beatforge.studio',
      name: 'Alex Beatmaker',
      handle: '@producer_alex',
      avatar: '',
      plan: 'Studio Pro',
      exportsCount: 0,
      createdAt: Date.now()
    }
  ],
  projects: [
    {
      id: 'template-trap-heat',
      name: 'Trap & 808 Anthem',
      bpm: 140,
      timeSignature: [4, 4],
      swing: 0.05,
      loopEnabled: true,
      loopStartBar: 0,
      loopEndBar: 4,
      author: 'BeatForge Studio',
      userId: 'usr_default',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      master: { volume: 0, limiterThreshold: -0.2, eqLow: 1.0, eqMid: 0, eqHigh: 1.5 },
      tracks: []
    }
  ],
  samples: [],
  presets: [],
  sessions: {}
};

// Password Hashing Helpers
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derived = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derived.length) return false;
  return crypto.timingSafeEqual(keyBuf, derived);
}

function sanitizeUser(user: StoredUser, db: DatabaseSchema) {
  const { passwordHash, ...safe } = user;
  return {
    ...safe,
    projectsCount: db.projects.length,
    exportsCount: user.exportsCount || 0
  };
}

// Safe Database File Helpers (preserves all existing fields/records)
function readDB(): DatabaseSchema {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2), 'utf-8');
      return defaultDB;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : defaultDB.users,
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      samples: Array.isArray(parsed.samples) ? parsed.samples : [],
      presets: Array.isArray(parsed.presets) ? parsed.presets : [],
      sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {}
    };
  } catch (err) {
    console.error('[Database Error] Failed to read db.json, recovering with default schema:', err);
    return defaultDB;
  }
}

function writeDB(data: DatabaseSchema): boolean {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[Database Error] Failed to write db.json:', err);
    return false;
  }
}

function getSessionToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return null;
}

function resolveUserFromRequest(req: Request, db: DatabaseSchema): StoredUser | null {
  const token = getSessionToken(req);
  if (token) {
    if (token === 'logged_out') return null;
    const session = db.sessions?.[token];
    if (!session) return null;
    return db.users.find((u) => u.id === session.userId) || null;
  }
  return db.users[0] || defaultDB.users[0];
}

// Initialize DB file if not exists (non-destructive)
readDB();

// Middleware: Request Body Parsing with large payload support (for project JSON and audio uploads)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Middleware: CORS & Security Headers
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware: Structured API Request Logger
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api')) {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[API] ${req.method} ${req.path} -> ${res.statusCode} (${duration}ms)`);
    });
  }
  next();
});

/* ==========================================================================
   REST API ROUTES
   ========================================================================== */

// 1. Health & Status
app.get('/api/health', (req: Request, res: Response) => {
  try {
    const db = readDB();
    res.status(200).json({
      status: 'ok',
      service: 'BEATFORGE STUDIO API',
      version: '1.1.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        status: 'connected',
        projectsCount: db.projects.length,
        usersCount: db.users.length,
        samplesCount: db.samples.length,
        presetsCount: db.presets.length
      }
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: 'Database check failed',
      error: error.message
    });
  }
});

// 2. Auth: Current User / Login / Signup / Logout / Stats
app.get('/api/auth/me', (req: Request, res: Response) => {
  try {
    const db = readDB();
    const user = resolveUserFromRequest(req, db);
    if (!user) {
      return res.status(401).json({ success: false, authenticated: false, error: 'Not authenticated' });
    }
    res.status(200).json({ success: true, authenticated: true, user: sanitizeUser(user, db) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/auth/signup', (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Valid email is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ success: false, error: 'Password must be at least 4 characters' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const db = readDB();
    const existing = db.users.find((u) => u.email.toLowerCase() === normalizedEmail);
    if (existing) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists' });
    }

    const baseHandle = normalizedEmail.split('@')[0].replace(/[^a-z0-9_]/gi, '').toLowerCase() || 'producer';
    const newUser: StoredUser = {
      id: `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      email: normalizedEmail,
      name: (name && String(name).trim()) || baseHandle,
      handle: `@${baseHandle}`,
      avatar: '',
      plan: 'Studio Pro',
      passwordHash: hashPassword(password),
      exportsCount: 0,
      createdAt: Date.now()
    };

    const token = `tok_${crypto.randomBytes(24).toString('hex')}`;
    db.sessions = db.sessions || {};
    db.sessions[token] = { userId: newUser.id, createdAt: Date.now() };
    db.users.push(newUser);
    writeDB(db);

    res.status(201).json({
      success: true,
      token,
      user: sanitizeUser(newUser, db)
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const db = readDB();
    const user = db.users.find((u) => u.email.toLowerCase() === normalizedEmail);

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    if (user.passwordHash) {
      if (!password || !verifyPassword(String(password), user.passwordHash)) {
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
      }
    }

    const token = `tok_${crypto.randomBytes(24).toString('hex')}`;
    db.sessions = db.sessions || {};
    db.sessions[token] = { userId: user.id, createdAt: Date.now() };
    writeDB(db);

    res.status(200).json({
      success: true,
      token,
      user: sanitizeUser(user, db)
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  try {
    const token = getSessionToken(req);
    if (token && token !== 'logged_out') {
      const db = readDB();
      if (db.sessions && db.sessions[token]) {
        delete db.sessions[token];
        writeDB(db);
      }
    }
    res.status(200).json({ success: true, message: 'Logged out' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/auth/stats', (req: Request, res: Response) => {
  try {
    const db = readDB();
    const user = resolveUserFromRequest(req, db);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    if (req.body?.incrementExports) {
      user.exportsCount = (user.exportsCount || 0) + 1;
      writeDB(db);
    }
    res.status(200).json({ success: true, user: sanitizeUser(user, db) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Projects CRUD
app.get('/api/projects', (req: Request, res: Response) => {
  try {
    const db = readDB();
    res.status(200).json({
      success: true,
      projects: db.projects
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/projects/:id', (req: Request, res: Response) => {
  try {
    const db = readDB();
    const project = db.projects.find((p) => p.id === req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    res.status(200).json({ success: true, project });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/projects', (req: Request, res: Response) => {
  try {
    const projectData = req.body;
    if (!projectData || !projectData.name) {
      return res.status(400).json({ success: false, error: 'Invalid project data or missing name' });
    }

    const db = readDB();
    const id = projectData.id || `proj_${Date.now()}`;
    const newProject = {
      ...projectData,
      id,
      updatedAt: Date.now(),
      createdAt: projectData.createdAt || Date.now()
    };

    const existingIndex = db.projects.findIndex((p) => p.id === id);
    if (existingIndex >= 0) {
      db.projects[existingIndex] = newProject;
    } else {
      db.projects.unshift(newProject);
    }

    writeDB(db);
    res.status(200).json({ success: true, project: newProject });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/projects/:id', (req: Request, res: Response) => {
  try {
    const db = readDB();
    const index = db.projects.findIndex((p) => p.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    db.projects[index] = {
      ...db.projects[index],
      ...req.body,
      id: req.params.id,
      updatedAt: Date.now()
    };

    writeDB(db);
    res.status(200).json({ success: true, project: db.projects[index] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/projects/:id', (req: Request, res: Response) => {
  try {
    const db = readDB();
    const initialLen = db.projects.length;
    db.projects = db.projects.filter((p) => p.id !== req.params.id);

    if (db.projects.length === initialLen) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    writeDB(db);
    res.status(200).json({ success: true, message: 'Project deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Audio File Upload & Persistent Serving (/api/audio)
const ALLOWED_AUDIO_EXTS = new Set(['wav', 'mp3', 'ogg', 'webm', 'm4a', 'flac', 'aac']);

app.post('/api/audio', (req: Request, res: Response) => {
  try {
    const { filename, base64Data } = req.body || {};
    if (!base64Data || typeof base64Data !== 'string') {
      return res.status(400).json({ success: false, error: 'Audio base64Data is required' });
    }

    // Strip optional data URI prefix (e.g. "data:audio/wav;base64,...")
    const commaIdx = base64Data.indexOf(',');
    const rawBase64 = commaIdx >= 0 ? base64Data.slice(commaIdx + 1) : base64Data;
    const buffer = Buffer.from(rawBase64, 'base64');

    if (buffer.length === 0) {
      return res.status(400).json({ success: false, error: 'Empty audio payload' });
    }

    const rawExt = (filename && String(filename).split('.').pop()?.toLowerCase()) || 'wav';
    const ext = ALLOWED_AUDIO_EXTS.has(rawExt) ? rawExt : 'wav';
    const safeFilename = `audio_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, safeFilename);

    fs.writeFileSync(filePath, buffer);

    res.status(201).json({
      success: true,
      filename: safeFilename,
      audioUrl: `/api/audio/${safeFilename}`,
      sizeBytes: buffer.length
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/audio/:filename', (req: Request, res: Response) => {
  try {
    const safeName = path.basename(req.params.filename);
    const filePath = path.join(UPLOADS_DIR, safeName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Audio file not found' });
    }
    res.sendFile(filePath);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/audio/:filename', (req: Request, res: Response) => {
  try {
    const safeName = path.basename(req.params.filename);
    const filePath = path.join(UPLOADS_DIR, safeName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Audio file not found' });
    }
    fs.unlinkSync(filePath);
    res.status(200).json({ success: true, message: 'Audio file deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Samples & Presets API
app.get('/api/samples', (req: Request, res: Response) => {
  try {
    const db = readDB();
    res.status(200).json({ success: true, samples: db.samples });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/samples', (req: Request, res: Response) => {
  try {
    const sample = req.body;
    if (!sample || !sample.title) {
      return res.status(400).json({ success: false, error: 'Sample title is required' });
    }

    const db = readDB();
    const newSample = {
      ...sample,
      id: sample.id || `sample_${Date.now()}`,
      createdAt: Date.now()
    };

    db.samples.unshift(newSample);
    writeDB(db);
    res.status(201).json({ success: true, sample: newSample });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/samples/:id', (req: Request, res: Response) => {
  try {
    const db = readDB();
    const initialLen = db.samples.length;
    db.samples = db.samples.filter((s) => s.id !== req.params.id);
    if (db.samples.length === initialLen) {
      return res.status(404).json({ success: false, error: 'Sample not found' });
    }
    writeDB(db);
    res.status(200).json({ success: true, message: 'Sample deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/presets', (req: Request, res: Response) => {
  try {
    const db = readDB();
    res.status(200).json({ success: true, presets: db.presets || [] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/presets', (req: Request, res: Response) => {
  try {
    const preset = req.body;
    if (!preset || !preset.name) {
      return res.status(400).json({ success: false, error: 'Preset name is required' });
    }
    const db = readDB();
    db.presets = db.presets || [];
    const newPreset = {
      ...preset,
      id: preset.id || `preset_${Date.now()}`,
      updatedAt: Date.now()
    };
    const existingIdx = db.presets.findIndex((p) => p.id === newPreset.id);
    if (existingIdx >= 0) {
      db.presets[existingIdx] = newPreset;
    } else {
      db.presets.unshift(newPreset);
    }
    writeDB(db);
    res.status(201).json({ success: true, preset: newPreset });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/presets/:id', (req: Request, res: Response) => {
  try {
    const db = readDB();
    db.presets = db.presets || [];
    const initialLen = db.presets.length;
    db.presets = db.presets.filter((p) => p.id !== req.params.id);
    if (db.presets.length === initialLen) {
      return res.status(404).json({ success: false, error: 'Preset not found' });
    }
    writeDB(db);
    res.status(200).json({ success: true, message: 'Preset deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Global API 404 Handler for undefined /api routes
app.all('/api/*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `API route ${req.method} ${req.path} not found`
  });
});

// Global Backend Error Handler Middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[Backend Unhandled Error]', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

/* ==========================================================================
   FRONTEND VITE MIDDLEWARE / STATIC ASSETS
   ========================================================================== */

async function startServer() {
  if (!isProduction) {
    // Development mode: Mount Vite middleware on the same Express server
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true'
      },
      appType: 'spa'
    });

    app.use(vite.middlewares);
  } else {
    // Production mode: Serve built client assets
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[BEATFORGE STUDIO] Server running on http://0.0.0.0:${PORT} (Mode: ${isProduction ? 'Production' : 'Development'})`);
  });
}

startServer().catch((err) => {
  console.error('[Fatal Server Startup Error]', err);
  process.exit(1);
});
