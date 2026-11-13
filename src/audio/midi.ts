/**
 * BeatForge Studio - Web MIDI API Integration
 * Connects physical MIDI keyboards/pads directly to BeatForge instruments
 */
export interface MIDIDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
}

export type MIDINoteCallback = (note: string, velocity: number, isNoteOn: boolean) => void;

export class MIDIManager {
  private static instance: MIDIManager | null = null;
  public isSupported: boolean = false;
  public devices: MIDIDeviceInfo[] = [];
  public activeDeviceName: string = 'None';
  private midiAccess: any = null;
  private noteCallbacks: Set<MIDINoteCallback> = new Set();

  private constructor() {
    this.checkSupport();
  }

  public static getInstance(): MIDIManager {
    if (!MIDIManager.instance) {
      MIDIManager.instance = new MIDIManager();
    }
    return MIDIManager.instance;
  }

  private checkSupport() {
    if (typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator) {
      this.isSupported = true;
    }
  }

  public async init(): Promise<boolean> {
    if (!this.isSupported) return false;

    try {
      this.midiAccess = await (navigator as any).requestMIDIAccess({ sysex: false });
      this.updateDeviceList();

      this.midiAccess.onstatechange = () => {
        this.updateDeviceList();
      };

      return true;
    } catch {
      return false;
    }
  }

  private updateDeviceList() {
    if (!this.midiAccess) return;
    const inputs = this.midiAccess.inputs.values();
    const list: MIDIDeviceInfo[] = [];

    for (const input of inputs) {
      list.push({
        id: input.id,
        name: input.name || 'Generic MIDI Device',
        manufacturer: input.manufacturer || 'Unknown',
        state: input.state
      });

      input.onmidimessage = (msg: any) => this.handleMIDIMessage(msg);
    }

    this.devices = list;
    if (list.length > 0) {
      this.activeDeviceName = list[0].name;
    } else {
      this.activeDeviceName = 'None';
    }
  }

  private handleMIDIMessage(event: any) {
    const data = event.data;
    if (!data || data.length < 2) return;

    const status = data[0] >> 4;
    const noteNumber = data[1];
    const velocity = data[2] ? data[2] / 127 : 0;
    const noteName = this.midiNoteToPitch(noteNumber);

    // 9 = Note On, 8 = Note Off
    if (status === 9) {
      if (velocity > 0) {
        this.emitNote(noteName, velocity, true);
      } else {
        this.emitNote(noteName, 0, false);
      }
    } else if (status === 8) {
      this.emitNote(noteName, 0, false);
    }
  }

  private midiNoteToPitch(noteNumber: number): string {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(noteNumber / 12) - 1;
    const note = notes[noteNumber % 12];
    return `${note}${octave}`;
  }

  public onNote(callback: MIDINoteCallback): () => void {
    this.noteCallbacks.add(callback);
    return () => {
      this.noteCallbacks.delete(callback);
    };
  }

  private emitNote(note: string, velocity: number, isNoteOn: boolean) {
    this.noteCallbacks.forEach((cb) => cb(note, velocity, isNoteOn));
  }
}
