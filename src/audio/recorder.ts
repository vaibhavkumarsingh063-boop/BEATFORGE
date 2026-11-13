/**
 * BeatForge Studio - Advanced Audio Recording & Import System
 * Handles microphone capture, pause/resume, multi-format audio importing,
 * audio editing (trim, crop, reverse, normalize, fade), and take management.
 */
import * as Tone from 'tone';
import { UploadedAudioItem } from '../types/daw';

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

export interface RecordingTake {
  id: string;
  name: string;
  timestamp: number;
  durationSeconds: number;
  blob: Blob;
  audioUrl: string;
  buffer: AudioBuffer;
  waveformData: number[];
}

export const SUPPORTED_AUDIO_FORMATS = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
  'audio/x-flac',
  'audio/webm'
];

export const SUPPORTED_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'webm'];

export class VocalRecorder {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private inputSourceNode: MediaStreamAudioSourceNode | null = null;
  private monitorGainNode: GainNode | null = null;
  public liveAnalyser: AnalyserNode | null = null;

  // Recording states
  public isRecording: boolean = false;
  public isPaused: boolean = false;
  public isMonitoring: boolean = false;
  public recordingStartTime: number = 0;
  public recordingElapsedMs: number = 0;
  private pauseStartTime: number = 0;
  private totalPausedDurationMs: number = 0;
  private timerIntervalId: number | null = null;

  public takes: RecordingTake[] = [];
  public selectedDeviceId: string = '';
  public uploadedItems: UploadedAudioItem[] = [];

  private subscribers: Set<() => void> = new Set();

  /**
   * Get list of available audio input devices (microphones)
   */
  public async getAvailableMicrophones(): Promise<AudioInputDevice[]> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return [];
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === 'audioinput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${index + 1}`
        }));
    } catch {
      return [];
    }
  }

  /**
   * Request microphone permission and initialize live input stream
   */
  public async initMicrophone(deviceId?: string): Promise<boolean> {
    try {
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (deviceId) this.selectedDeviceId = deviceId;

      const rawCtx = Tone.getContext().rawContext as AudioContext;
      this.inputSourceNode = rawCtx.createMediaStreamSource(this.mediaStream);

      // Create live Analyser for visualizer
      this.liveAnalyser = rawCtx.createAnalyser();
      this.liveAnalyser.fftSize = 512;
      this.liveAnalyser.smoothingTimeConstant = 0.8;
      this.inputSourceNode.connect(this.liveAnalyser);

      // Create monitor gain (muted by default to avoid feedback loops unless headphones are used)
      this.monitorGainNode = rawCtx.createGain();
      this.monitorGainNode.gain.value = this.isMonitoring ? 1 : 0;
      this.inputSourceNode.connect(this.monitorGainNode);
      this.monitorGainNode.connect(rawCtx.destination);

      this.notifySubscribers();
      return true;
    } catch (err) {
      console.error('Failed to initialize microphone', err);
      return false;
    }
  }

  public toggleMonitoring(): boolean {
    this.isMonitoring = !this.isMonitoring;
    if (this.monitorGainNode) {
      this.monitorGainNode.gain.value = this.isMonitoring ? 1 : 0;
    }
    this.notifySubscribers();
    return this.isMonitoring;
  }

  /**
   * Start recording a new take
   */
  public async startRecording(): Promise<boolean> {
    if (!this.mediaStream) {
      const ok = await this.initMicrophone(this.selectedDeviceId);
      if (!ok) return false;
    }

    this.recordedChunks = [];
    this.recordingElapsedMs = 0;
    this.totalPausedDurationMs = 0;
    this.isPaused = false;

    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      this.mediaRecorder = new MediaRecorder(this.mediaStream!, { mimeType });
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.recordingStartTime = Date.now();
      this.mediaRecorder.start(50);
      this.isRecording = true;

      // Start elapsed timer interval
      if (this.timerIntervalId) clearInterval(this.timerIntervalId);
      this.timerIntervalId = window.setInterval(() => {
        if (this.isRecording && !this.isPaused) {
          this.recordingElapsedMs = Date.now() - this.recordingStartTime - this.totalPausedDurationMs;
          this.notifySubscribers();
        }
      }, 50);

      this.notifySubscribers();
      return true;
    } catch (err) {
      console.error('Failed to start recording', err);
      return false;
    }
  }

  /**
   * Pause recording
   */
  public pauseRecording() {
    if (this.mediaRecorder && this.isRecording && !this.isPaused) {
      try {
        this.mediaRecorder.pause();
        this.isPaused = true;
        this.pauseStartTime = Date.now();
        this.notifySubscribers();
      } catch (err) {
        console.error('Error pausing recording', err);
      }
    }
  }

  /**
   * Resume recording
   */
  public resumeRecording() {
    if (this.mediaRecorder && this.isRecording && this.isPaused) {
      try {
        this.mediaRecorder.resume();
        this.totalPausedDurationMs += Date.now() - this.pauseStartTime;
        this.isPaused = false;
        this.notifySubscribers();
      } catch (err) {
        console.error('Error resuming recording', err);
      }
    }
  }

  /**
   * Stop recording and process the captured take into an AudioBuffer & Waveform
   */
  public async stopRecording(): Promise<RecordingTake | null> {
    if (!this.mediaRecorder || !this.isRecording) return null;

    if (this.timerIntervalId) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }

    return new Promise((resolve) => {
      this.mediaRecorder!.onstop = async () => {
        this.isRecording = false;
        this.isPaused = false;
        const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        const rawCtx = Tone.getContext().rawContext as AudioContext;

        try {
          const audioBuffer = await rawCtx.decodeAudioData(arrayBuffer);
          const waveform = this.extractWaveformData(audioBuffer, 120);
          const takeId = `take-${Date.now()}`;
          const take: RecordingTake = {
            id: takeId,
            name: `Vocal Take ${this.takes.length + 1}`,
            timestamp: Date.now(),
            durationSeconds: audioBuffer.duration,
            blob,
            audioUrl: URL.createObjectURL(blob),
            buffer: audioBuffer,
            waveformData: waveform
          };

          this.takes.push(take);
          this.notifySubscribers();
          resolve(take);
        } catch (err) {
          console.error('Failed to decode recording', err);
          resolve(null);
        }
      };

      this.mediaRecorder!.stop();
    });
  }

  /**
   * Discard the last take or specified take
   */
  public deleteTake(takeId: string) {
    this.takes = this.takes.filter((t) => t.id !== takeId);
    this.notifySubscribers();
  }

  /**
   * Decode an uploaded audio file (MP3, WAV, M4A, AAC, OGG, FLAC, WebM)
   */
  public static async decodeAudioFile(file: File): Promise<UploadedAudioItem> {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isSupported =
      SUPPORTED_EXTENSIONS.includes(ext) ||
      SUPPORTED_AUDIO_FORMATS.some((fmt) => file.type.includes(fmt.split('/')[1]));

    if (!isSupported && !file.type.startsWith('audio/')) {
      throw new Error(
        `Unsupported audio format ".${ext}". Please upload MP3, WAV, M4A, AAC, OGG, FLAC, or WebM.`
      );
    }

    // Limit to 150 MB for performance
    if (file.size > 150 * 1024 * 1024) {
      throw new Error(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max size is 150MB.`);
    }

    const arrayBuffer = await file.arrayBuffer();
    const rawCtx = Tone.getContext().rawContext as AudioContext;

    try {
      const audioBuffer = await rawCtx.decodeAudioData(arrayBuffer);
      const waveform = VocalRecorder.extractWaveformFromBuffer(audioBuffer, 120);
      const audioUrl = URL.createObjectURL(file);

      // Guess category based on filename
      let category: 'beat' | 'vocal' | 'instrumental' | 'fx' | 'other' = 'other';
      const lowerName = file.name.toLowerCase();
      if (lowerName.includes('beat') || lowerName.includes('drum') || lowerName.includes('loop')) {
        category = 'beat';
      } else if (lowerName.includes('vocal') || lowerName.includes('acapella') || lowerName.includes('voice')) {
        category = 'vocal';
      } else if (lowerName.includes('inst') || lowerName.includes('piano') || lowerName.includes('guitar')) {
        category = 'instrumental';
      } else if (lowerName.includes('fx') || lowerName.includes('riser') || lowerName.includes('sweep')) {
        category = 'fx';
      }

      return {
        id: `upload-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: file.name.replace(/\.[^/.]+$/, ''),
        format: ext.toUpperCase() || 'AUDIO',
        sizeBytes: file.size,
        durationSeconds: audioBuffer.duration,
        blob: file,
        audioUrl,
        buffer: audioBuffer,
        waveformData: waveform,
        category,
        uploadedAt: Date.now()
      };
    } catch (err: any) {
      throw new Error(`Failed to decode audio file "${file.name}". Codec may not be supported by this browser.`);
    }
  }

  /**
   * Extract normalized waveform peaks for visual rendering
   */
  public extractWaveformData(buffer: AudioBuffer, points: number = 100): number[] {
    return VocalRecorder.extractWaveformFromBuffer(buffer, points);
  }

  public static extractWaveformFromBuffer(buffer: AudioBuffer, points: number = 100): number[] {
    const rawData = buffer.getChannelData(0);
    const blockSize = Math.floor(rawData.length / points);
    const peaks: number[] = [];

    for (let i = 0; i < points; i++) {
      const start = i * blockSize;
      let max = 0;
      for (let j = 0; j < blockSize; j++) {
        const val = Math.abs(rawData[start + j] || 0);
        if (val > max) max = val;
      }
      peaks.push(Math.min(1, Math.max(0.04, max)));
    }
    return peaks;
  }

  // AUDIO EDITING UTILITIES

  /**
   * Trim / Crop AudioBuffer between startSec and endSec
   */
  public static trimAudioBuffer(buffer: AudioBuffer, startSec: number, endSec: number): AudioBuffer {
    const rawCtx = Tone.getContext().rawContext as AudioContext;
    const sampleRate = buffer.sampleRate;
    const startOffset = Math.max(0, Math.floor(startSec * sampleRate));
    const endOffset = Math.min(buffer.length, Math.floor(endSec * sampleRate));
    const newLength = Math.max(1, endOffset - startOffset);

    const newBuffer = rawCtx.createBuffer(buffer.numberOfChannels, newLength, sampleRate);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const srcChannel = buffer.getChannelData(c);
      const destChannel = newBuffer.getChannelData(c);
      for (let i = 0; i < newLength; i++) {
        destChannel[i] = srcChannel[startOffset + i];
      }
    }
    return newBuffer;
  }

  /**
   * Reverse an AudioBuffer in-place or return a new reversed copy
   */
  public static reverseAudioBuffer(buffer: AudioBuffer): AudioBuffer {
    const rawCtx = Tone.getContext().rawContext as AudioContext;
    const newBuffer = rawCtx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);

    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const srcChannel = buffer.getChannelData(c);
      const destChannel = newBuffer.getChannelData(c);
      const len = buffer.length;
      for (let i = 0; i < len; i++) {
        destChannel[i] = srcChannel[len - 1 - i];
      }
    }
    return newBuffer;
  }

  /**
   * Normalize AudioBuffer peak amplitude to targetPeak (e.g. 0.98 = -0.2 dBFS)
   */
  public static normalizeAudioBuffer(buffer: AudioBuffer, targetPeak: number = 0.98): AudioBuffer {
    let currentMax = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const channel = buffer.getChannelData(c);
      for (let i = 0; i < channel.length; i++) {
        const absVal = Math.abs(channel[i]);
        if (absVal > currentMax) currentMax = absVal;
      }
    }

    if (currentMax === 0) return buffer;
    const multiplier = targetPeak / currentMax;

    const rawCtx = Tone.getContext().rawContext as AudioContext;
    const newBuffer = rawCtx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);

    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const srcChannel = buffer.getChannelData(c);
      const destChannel = newBuffer.getChannelData(c);
      for (let i = 0; i < srcChannel.length; i++) {
        destChannel[i] = srcChannel[i] * multiplier;
      }
    }
    return newBuffer;
  }

  /**
   * Apply linear Fade In and Fade Out to an AudioBuffer
   */
  public static applyFadesToBuffer(
    buffer: AudioBuffer,
    fadeInSec: number,
    fadeOutSec: number
  ): AudioBuffer {
    const rawCtx = Tone.getContext().rawContext as AudioContext;
    const newBuffer = rawCtx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    const fadeInSamples = Math.floor(fadeInSec * buffer.sampleRate);
    const fadeOutSamples = Math.floor(fadeOutSec * buffer.sampleRate);
    const totalSamples = buffer.length;

    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const srcChannel = buffer.getChannelData(c);
      const destChannel = newBuffer.getChannelData(c);

      for (let i = 0; i < totalSamples; i++) {
        let gain = 1;
        if (i < fadeInSamples && fadeInSamples > 0) {
          gain = i / fadeInSamples;
        } else if (i > totalSamples - fadeOutSamples && fadeOutSamples > 0) {
          gain = (totalSamples - i) / fadeOutSamples;
        }
        destChannel[i] = srcChannel[i] * gain;
      }
    }
    return newBuffer;
  }

  public subscribe(cb: () => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private notifySubscribers() {
    this.subscribers.forEach((cb) => cb());
  }

  public dispose() {
    if (this.timerIntervalId) clearInterval(this.timerIntervalId);
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }
    if (this.inputSourceNode) this.inputSourceNode.disconnect();
    if (this.monitorGainNode) this.monitorGainNode.disconnect();
  }
}
