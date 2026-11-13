/**
 * BeatForge Studio - Offline Audio Exporter & Stem Generator
 * Renders multitrack arrangements to master WAV/MP3 files and individual stems
 */
import { DAWProject } from '../types/daw';
import { Mp3Encoder } from '@breezystack/lamejs';

export class AudioExporter {
  /**
   * Render project to an AudioBuffer using OfflineAudioContext
   */
  public static async renderProject(
    project: DAWProject,
    tracksToInclude?: string[],
    onProgress?: (progress: number) => void
  ): Promise<AudioBuffer> {
    const sampleRate = 44100;
    const bpm = project.bpm;
    const secondsPerBeat = 60 / bpm;
    const beatsPerBar = project.timeSignature[0];
    const secondsPerBar = beatsPerBar * secondsPerBeat;

    let maxBar = 8;
    for (const track of project.tracks) {
      if (tracksToInclude && !tracksToInclude.includes(track.id)) continue;
      for (const clip of track.clips) {
        const endBar = clip.startBar + clip.durationBars;
        if (endBar > maxBar) maxBar = endBar;
      }
    }

    const totalBars = maxBar + 2;
    const totalSeconds = Math.max(4, totalBars * secondsPerBar);
    const totalLengthFrames = Math.ceil(totalSeconds * sampleRate);

    const offlineCtx = new OfflineAudioContext(2, totalLengthFrames, sampleRate);

    // Master bus + Mastering DSP in offline context
    const masteringActive = Boolean(project.mastering && project.mastering.enabled && !project.mastering.bypassed);
    const masterGain = offlineCtx.createGain();
    const trimDb = masteringActive ? (project.mastering?.limiterGain || 0) : 0;
    masterGain.gain.value = Math.pow(10, (project.master.volume + trimDb) / 20);

    const limiter = offlineCtx.createDynamicsCompressor();
    limiter.threshold.value = masteringActive ? (project.mastering?.limiterCeiling ?? -0.2) : project.master.limiterThreshold;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.05;

    const hpf = offlineCtx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = masteringActive ? (project.mastering?.eqLowCut || 24) : 20;

    const lowFilter = offlineCtx.createBiquadFilter();
    lowFilter.type = 'lowshelf';
    lowFilter.frequency.value = 350;
    lowFilter.gain.value = project.master.eqLow + (masteringActive ? (project.mastering?.eqLowGain || 0) : 0);

    const midFilter = offlineCtx.createBiquadFilter();
    midFilter.type = 'peaking';
    midFilter.frequency.value = 1200;
    midFilter.Q.value = 0.8;
    midFilter.gain.value = project.master.eqMid + (masteringActive ? (project.mastering?.eqMidGain || 0) : 0);

    const highFilter = offlineCtx.createBiquadFilter();
    highFilter.type = 'highshelf';
    highFilter.frequency.value = 4500;
    highFilter.gain.value = project.master.eqHigh + (masteringActive ? (project.mastering?.eqHighGain || 0) : 0);

    hpf.connect(lowFilter);
    lowFilter.connect(midFilter);
    midFilter.connect(highFilter);
    highFilter.connect(masterGain);
    masterGain.connect(limiter);
    limiter.connect(offlineCtx.destination);

    const tracks = project.tracks.filter((t) => !tracksToInclude || tracksToInclude.includes(t.id));
    const anyTrackSolo = !tracksToInclude && project.tracks.some((t) => t.solo);

    tracks.forEach((track, trackIndex) => {
      if (track.muted || (anyTrackSolo && !track.solo)) return;

      const trackFilter = offlineCtx.createBiquadFilter();
      trackFilter.type = 'lowpass';
      trackFilter.frequency.value = track.effects.filterCutoff || 18000;
      trackFilter.Q.value = track.effects.filterResonance || 1;

      const trackGain = offlineCtx.createGain();
      trackGain.gain.value = Math.pow(10, track.volume / 20);

      const panner = offlineCtx.createStereoPanner();
      panner.pan.value = track.pan;

      // Apply volume/pan/filter automation clips if present
      if (project.automationClips) {
        const trackAutos = project.automationClips.filter((a) => a.trackId === track.id);
        for (const auto of trackAutos) {
          const sorted = [...auto.points].sort((a, b) => a.bar - b.bar);
          sorted.forEach((pt, idx) => {
            const tSec = pt.bar * secondsPerBar;
            const val = Math.max(0, Math.min(1, pt.value));
            if (auto.targetParam === 'volume') {
              const lin = Math.pow(10, (-48 + val * 54) / 20);
              if (idx === 0) trackGain.gain.setValueAtTime(lin, tSec);
              else trackGain.gain.linearRampToValueAtTime(lin, tSec);
            } else if (auto.targetParam === 'pan') {
              const p = val * 2 - 1;
              if (idx === 0) panner.pan.setValueAtTime(p, tSec);
              else panner.pan.linearRampToValueAtTime(p, tSec);
            } else if (auto.targetParam === 'filterCutoff') {
              const hz = 80 * Math.pow(250, val);
              if (idx === 0) trackFilter.frequency.setValueAtTime(hz, tSec);
              else trackFilter.frequency.exponentialRampToValueAtTime(Math.max(40, hz), tSec);
            }
          });
        }
      }

      trackFilter.connect(trackGain);
      trackGain.connect(panner);
      panner.connect(hpf);

      for (const clip of track.clips) {
        if ('buffer' in clip && clip.buffer) {
          const startTime = clip.startBar * secondsPerBar;
          const source = offlineCtx.createBufferSource();

          let buf = clip.buffer;
          if (clip.reversed) {
            const rev = offlineCtx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
            for (let ch = 0; ch < buf.numberOfChannels; ch++) {
              const src = buf.getChannelData(ch);
              const dst = rev.getChannelData(ch);
              for (let i = 0, len = src.length; i < len; i++) {
                dst[i] = src[len - 1 - i];
              }
            }
            buf = rev;
          }

          source.buffer = buf;
          const rate = clip.playbackRate && clip.playbackRate > 0 ? clip.playbackRate : 1;
          source.playbackRate.value = rate;
          if (clip.pitchShift && Math.abs(clip.pitchShift) > 0.01) {
            source.detune.value = clip.pitchShift * 100;
          }

          const clipGain = offlineCtx.createGain();
          const baseGain = clip.gain ?? 1;
          const startOffset = Math.max(0, clip.cropStart ?? clip.offset ?? 0);
          const maxFromCrop =
            clip.cropEnd !== undefined && clip.cropEnd > startOffset
              ? (clip.cropEnd - startOffset) / rate
              : Infinity;
          const durationSec = Math.max(
            0.05,
            Math.min((clip.durationBars * secondsPerBar) / rate, maxFromCrop, (buf.duration - startOffset) / rate)
          );

          if (clip.fadeIn && clip.fadeIn > 0) {
            clipGain.gain.setValueAtTime(0, startTime);
            clipGain.gain.linearRampToValueAtTime(baseGain, startTime + Math.min(clip.fadeIn, durationSec * 0.5));
          } else {
            clipGain.gain.setValueAtTime(baseGain, startTime);
          }

          if (clip.fadeOut && clip.fadeOut > 0) {
            const fadeDur = Math.min(clip.fadeOut, durationSec * 0.5);
            const fadeStart = Math.max(startTime, startTime + durationSec - fadeDur);
            clipGain.gain.setValueAtTime(baseGain, fadeStart);
            clipGain.gain.linearRampToValueAtTime(0, startTime + durationSec);
          }

          source.connect(clipGain);
          clipGain.connect(trackFilter);
          source.start(startTime, startOffset, durationSec);
        }

        if ('drumSteps' in clip && clip.drumSteps) {
          const sixteenthsPerBar = beatsPerBar * 4;
          const secondsPerSixteenth = secondsPerBar / sixteenthsPerBar;
          const clipStartSec = clip.startBar * secondsPerBar;
          const swingOffsetSec = (project.swing || 0) * secondsPerSixteenth * 0.5;
          const anyDrumSolo = clip.drumSteps.some((s) => s.solo);

          clip.drumSteps.forEach((seq) => {
            if (seq.muted || (anyDrumSolo && !seq.solo)) return;
            const stepCount = seq.steps.length;
            const totalSixteenths = clip.durationBars * sixteenthsPerBar;

            for (let s = 0; s < totalSixteenths; s++) {
              if (seq.steps[s % stepCount]) {
                const swingShift = s % 2 === 1 ? swingOffsetSec : 0;
                const noteTime = clipStartSec + s * secondsPerSixteenth + swingShift;
                const vel = (seq.velocities ? seq.velocities[s % stepCount] : 0.8) * seq.volume;
                AudioExporter.renderSynthesizedDrumHit(offlineCtx, trackFilter, seq.soundId, noteTime, vel);
              }
            }
          });
        }

        if ('notes' in clip && clip.notes) {
          const sixteenthsPerBar = beatsPerBar * 4;
          const secondsPerSixteenth = secondsPerBar / sixteenthsPerBar;
          const clipStartSec = clip.startBar * secondsPerBar;

          clip.notes.forEach((note) => {
            const noteStart = clipStartSec + note.time * secondsPerSixteenth;
            const noteDur = note.duration * secondsPerSixteenth;
            AudioExporter.renderSynthesizedMidiNote(
              offlineCtx,
              trackFilter,
              note.pitch,
              noteStart,
              noteDur,
              note.velocity,
              track.instrumentId
            );
          });
        }
      }

      if (onProgress) {
        onProgress(Math.min(0.5, ((trackIndex + 1) / Math.max(1, tracks.length)) * 0.5));
      }
    });

    if (onProgress) onProgress(0.7);
    const renderedBuffer = await offlineCtx.startRendering();
    if (onProgress) onProgress(1.0);
    return renderedBuffer;
  }

  private static renderSynthesizedDrumHit(
    ctx: OfflineAudioContext,
    destination: AudioNode,
    soundId: string,
    time: number,
    velocity: number
  ) {
    if (soundId.includes('kick')) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, time);
      osc.frequency.exponentialRampToValueAtTime(45, time + 0.18);
      gain.gain.setValueAtTime(velocity * 1.2, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
      osc.connect(gain);
      gain.connect(destination);
      osc.start(time);
      osc.stop(time + 0.35);
    } else if (soundId.includes('snare') || soundId.includes('clap')) {
      // Noise + tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, time);
      gain.gain.setValueAtTime(velocity * 0.8, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
      osc.connect(gain);
      gain.connect(destination);
      osc.start(time);
      osc.stop(time + 0.18);
    } else if (soundId.includes('hihat')) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(6000, time);
      gain.gain.setValueAtTime(velocity * 0.4, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      osc.connect(gain);
      gain.connect(destination);
      osc.start(time);
      osc.stop(time + 0.08);
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, time);
      gain.gain.setValueAtTime(velocity * 0.7, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
      osc.connect(gain);
      gain.connect(destination);
      osc.start(time);
      osc.stop(time + 0.22);
    }
  }

  private static renderSynthesizedMidiNote(
    ctx: OfflineAudioContext,
    destination: AudioNode,
    pitch: string,
    time: number,
    duration: number,
    velocity: number,
    instrumentId: string
  ) {
    const freq = AudioExporter.pitchToFrequency(pitch);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (instrumentId.includes('bass') || instrumentId.includes('808')) {
      osc.type = 'sawtooth';
    } else if (instrumentId.includes('piano')) {
      osc.type = 'triangle';
    } else if (instrumentId.includes('pad') || instrumentId.includes('string')) {
      osc.type = 'sawtooth';
    } else {
      osc.type = 'sine';
    }

    osc.frequency.setValueAtTime(freq, time);

    const attack = 0.02;
    const release = 0.1;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(velocity * 0.7, time + attack);
    gain.gain.setValueAtTime(velocity * 0.5, time + duration - release);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(gain);
    gain.connect(destination);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  public static pitchToFrequency(pitch: string): number {
    const notes: Record<string, number> = {
      C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
      'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11
    };
    const match = pitch.match(/^([A-G][#b]?)(-?\d+)$/);
    if (!match) return 440;
    const noteName = match[1];
    const octave = parseInt(match[2], 10);
    const semitones = (octave - 4) * 12 + notes[noteName] - 9;
    return 440 * Math.pow(2, semitones / 12);
  }

  /**
   * Convert AudioBuffer to WAV Blob
   */
  public static audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    let result: Float32Array;
    if (numChannels === 2) {
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);
      result = new Float32Array(left.length + right.length);
      for (let i = 0; i < left.length; i++) {
        result[i * 2] = left[i];
        result[i * 2 + 1] = right[i];
      }
    } else {
      result = buffer.getChannelData(0);
    }

    const dataLength = result.length * (bitDepth / 8);
    const bufferArray = new ArrayBuffer(44 + dataLength);
    const view = new DataView(bufferArray);

    function writeString(view: DataView, offset: number, string: string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');

    // "fmt " sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
    view.setUint16(32, numChannels * (bitDepth / 8), true);
    view.setUint16(34, bitDepth, true);

    // "data" sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // Write samples as 16-bit PCM
    let offset = 44;
    for (let i = 0; i < result.length; i++) {
      let sample = Math.max(-1, Math.min(1, result[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  /**
   * Convert AudioBuffer to real MP3 Blob using @breezystack/lamejs
   */
  public static audioBufferToMp3(buffer: AudioBuffer, kbps: number = 320): Blob {
    const numChannels = Math.min(2, buffer.numberOfChannels);
    const sampleRate = buffer.sampleRate;
    const mp3Encoder = new Mp3Encoder(numChannels, sampleRate, kbps);

    const floatToInt16 = (arr: Float32Array): Int16Array => {
      const out = new Int16Array(arr.length);
      for (let i = 0; i < arr.length; i++) {
        const s = Math.max(-1, Math.min(1, arr[i]));
        out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      return out;
    };

    const leftPCM = floatToInt16(buffer.getChannelData(0));
    const rightPCM = numChannels > 1 ? floatToInt16(buffer.getChannelData(1)) : leftPCM;

    const mp3Chunks: BlobPart[] = [];
    const blockSize = 1152;

    for (let i = 0; i < leftPCM.length; i += blockSize) {
      const leftChunk = leftPCM.subarray(i, i + blockSize);
      const rightChunk = rightPCM.subarray(i, i + blockSize);
      const encoded =
        numChannels === 2
          ? mp3Encoder.encodeBuffer(leftChunk, rightChunk)
          : mp3Encoder.encodeBuffer(leftChunk);
      if (encoded && encoded.length > 0) {
        mp3Chunks.push(new Uint8Array(encoded));
      }
    }

    const flushed = mp3Encoder.flush();
    if (flushed && flushed.length > 0) {
      mp3Chunks.push(new Uint8Array(flushed));
    }

    return new Blob(mp3Chunks, { type: 'audio/mpeg' });
  }

  /**
   * Helper to download file
   */
  public static downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}
