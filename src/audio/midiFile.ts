/**
 * BeatForge Studio - Standard MIDI File (SMF .mid) Exporter & Parser
 * Handles binary creation and decoding of Type 0 / Type 1 MIDI files.
 */
import { Note } from '../types/daw';

const NOTE_TO_MIDI: Record<string, number> = {};
const MIDI_TO_NOTE: string[] = [];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

for (let i = 0; i < 128; i++) {
  const octave = Math.floor(i / 12) - 1;
  const name = NOTE_NAMES[i % 12];
  const str = `${name}${octave}`;
  NOTE_TO_MIDI[str] = i;
  MIDI_TO_NOTE[i] = str;
}

export function pitchToMidiNumber(pitch: string): number {
  if (NOTE_TO_MIDI[pitch] !== undefined) return NOTE_TO_MIDI[pitch];
  const match = pitch.match(/^([A-G][#b]?)(-?\d+)$/);
  if (!match) return 60; // Middle C
  const noteName = match[1];
  const oct = parseInt(match[2], 10);
  const idx = NOTE_NAMES.indexOf(noteName);
  return (oct + 1) * 12 + (idx >= 0 ? idx : 0);
}

export function midiNumberToPitch(num: number): string {
  if (MIDI_TO_NOTE[num]) return MIDI_TO_NOTE[num];
  const oct = Math.floor(num / 12) - 1;
  const name = NOTE_NAMES[num % 12];
  return `${name}${oct}`;
}

/**
 * Write variable-length quantity (VLQ) used in MIDI
 */
function writeVarLength(value: number): number[] {
  const buffer: number[] = [];
  buffer.push(value & 0x7f);
  while ((value >>= 7) > 0) {
    buffer.unshift((value & 0x7f) | 0x80);
  }
  return buffer;
}

/**
 * Generate a valid Standard MIDI File (SMF Format 0) from DAW Notes
 */
export function exportNotesToMidiFile(
  notes: Note[],
  trackName: string = 'BeatForge Track',
  bpm: number = 120
): Blob {
  const ticksPerQuarter = 480;
  // In our DAW, 1 sixteenth-note = 1 step
  // 1 quarter note = 4 sixteenth-notes => 1 step = 480 / 4 = 120 ticks
  const ticksPerStep = ticksPerQuarter / 4;

  // Build MIDI events
  interface MidiEvent {
    tick: number;
    type: 'on' | 'off';
    noteNum: number;
    velocity: number;
  }

  const events: MidiEvent[] = [];

  notes.forEach((n) => {
    const startTick = Math.round(n.time * ticksPerStep);
    const endTick = Math.round((n.time + n.duration) * ticksPerStep);
    const noteNum = Math.max(0, Math.min(127, pitchToMidiNumber(n.pitch)));
    const vel = Math.max(1, Math.min(127, Math.round(n.velocity * 127)));

    events.push({ tick: startTick, type: 'on', noteNum, velocity: vel });
    events.push({ tick: endTick, type: 'off', noteNum, velocity: 0 });
  });

  // Sort events by tick
  events.sort((a, b) => a.tick - b.tick);

  // Encode Track Chunk
  const trackData: number[] = [];

  // Track Name Meta Event (FF 03 len text)
  const nameBytes = Array.from(new TextEncoder().encode(trackName));
  trackData.push(0x00, 0xff, 0x03, nameBytes.length, ...nameBytes);

  // Set Tempo Meta Event (FF 51 03 tttttt)
  const microsecondsPerQuarter = Math.round(60000000 / bpm);
  trackData.push(
    0x00,
    0xff,
    0x51,
    0x03,
    (microsecondsPerQuarter >> 16) & 0xff,
    (microsecondsPerQuarter >> 8) & 0xff,
    microsecondsPerQuarter & 0xff
  );

  let lastTick = 0;
  events.forEach((ev) => {
    const delta = ev.tick - lastTick;
    lastTick = ev.tick;

    trackData.push(...writeVarLength(delta));

    if (ev.type === 'on') {
      trackData.push(0x90, ev.noteNum, ev.velocity);
    } else {
      trackData.push(0x80, ev.noteNum, 0x00);
    }
  });

  // End of Track Meta Event (00 FF 2F 00)
  trackData.push(0x00, 0xff, 0x2f, 0x00);

  // Track Chunk Header: 'MTrk' + 4-byte length
  const trackLen = trackData.length;
  const trackChunk: number[] = [
    0x4d, 0x54, 0x72, 0x6b,
    (trackLen >> 24) & 0xff,
    (trackLen >> 16) & 0xff,
    (trackLen >> 8) & 0xff,
    trackLen & 0xff,
    ...trackData
  ];

  // MIDI Header Chunk: 'MThd' + length 6 + format 0 (1 track) + 1 track + ticksPerQuarter
  const headerChunk: number[] = [
    0x4d, 0x54, 0x68, 0x64, // 'MThd'
    0x00, 0x00, 0x00, 0x06, // chunk length = 6
    0x00, 0x00,             // format 0
    0x00, 0x01,             // 1 track
    (ticksPerQuarter >> 8) & 0xff,
    ticksPerQuarter & 0xff
  ];

  const fullFile = new Uint8Array([...headerChunk, ...trackChunk]);
  return new Blob([fullFile], { type: 'audio/midi' });
}

/**
 * Parse an uploaded standard MIDI file (.mid) into DAW Note objects
 */
export async function parseMidiFileToNotes(file: File): Promise<Note[]> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Validate MThd
  if (
    bytes[0] !== 0x4d ||
    bytes[1] !== 0x54 ||
    bytes[2] !== 0x68 ||
    bytes[3] !== 0x64
  ) {
    throw new Error('Not a valid Standard MIDI file');
  }

  const ticksPerQuarter = (bytes[12] << 8) | bytes[13] || 480;
  const ticksPerStep = ticksPerQuarter / 4;

  const notes: Note[] = [];
  let pos = 14; // header length is 14

  while (pos < bytes.length) {
    if (pos + 8 > bytes.length) break;

    // Look for 'MTrk'
    const isMTrk =
      bytes[pos] === 0x4d &&
      bytes[pos + 1] === 0x54 &&
      bytes[pos + 2] === 0x72 &&
      bytes[pos + 3] === 0x6b;

    if (!isMTrk) {
      pos++;
      continue;
    }

    const chunkLen =
      (bytes[pos + 4] << 24) |
      (bytes[pos + 5] << 16) |
      (bytes[pos + 6] << 8) |
      bytes[pos + 7];

    pos += 8;
    const endPos = pos + chunkLen;

    let currentTick = 0;
    const activeNoteOns: Map<number, { tick: number; velocity: number }> = new Map();

    while (pos < endPos && pos < bytes.length) {
      // Read VLQ delta-time
      let delta = 0;
      let b = 0;
      do {
        b = bytes[pos++];
        delta = (delta << 7) | (b & 0x7f);
      } while (b & 0x80 && pos < bytes.length);

      currentTick += delta;

      let status = bytes[pos++];

      // Handle running status
      if ((status & 0x80) === 0) {
        pos--; // backtrack
        status = 0x90; // default note-on running
      }

      const eventType = status & 0xf0;

      if (eventType === 0x90) {
        // Note On
        const noteNum = bytes[pos++];
        const vel = bytes[pos++];
        if (vel > 0) {
          activeNoteOns.set(noteNum, { tick: currentTick, velocity: vel / 127 });
        } else {
          // Note Off via vel 0
          const onData = activeNoteOns.get(noteNum);
          if (onData) {
            const startStep = Math.max(0, Math.round(onData.tick / ticksPerStep));
            const durationSteps = Math.max(1, Math.round((currentTick - onData.tick) / ticksPerStep));
            notes.push({
              id: `imported-midi-${Date.now()}-${Math.random()}`,
              pitch: midiNumberToPitch(noteNum),
              time: startStep,
              duration: durationSteps,
              velocity: onData.velocity
            });
            activeNoteOns.delete(noteNum);
          }
        }
      } else if (eventType === 0x80) {
        // Note Off
        const noteNum = bytes[pos++];
        pos++; // skip vel
        const onData = activeNoteOns.get(noteNum);
        if (onData) {
          const startStep = Math.max(0, Math.round(onData.tick / ticksPerStep));
          const durationSteps = Math.max(1, Math.round((currentTick - onData.tick) / ticksPerStep));
          notes.push({
            id: `imported-midi-${Date.now()}-${Math.random()}`,
            pitch: midiNumberToPitch(noteNum),
            time: startStep,
            duration: durationSteps,
            velocity: onData.velocity
          });
          activeNoteOns.delete(noteNum);
        }
      } else if (status === 0xff) {
        // Meta event
        pos++; // type
        let len = 0;
        let lb = 0;
        do {
          lb = bytes[pos++];
          len = (len << 7) | (lb & 0x7f);
        } while (lb & 0x80 && pos < bytes.length);
        pos += len;
      } else if (status === 0xf0 || status === 0xf7) {
        // SysEx
        let len = 0;
        let lb = 0;
        do {
          lb = bytes[pos++];
          len = (len << 7) | (lb & 0x7f);
        } while (lb & 0x80 && pos < bytes.length);
        pos += len;
      } else if (eventType === 0xc0 || eventType === 0xd0) {
        // 1-byte events (Program Change, Channel Pressure)
        pos++;
      } else {
        // 2-byte events (Control Change, Pitch Bend, Poly Pressure)
        pos += 2;
      }
    }
  }

  return notes;
}
