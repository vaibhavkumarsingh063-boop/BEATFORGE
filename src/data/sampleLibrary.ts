/**
 * BeatForge Studio - Curated Built-in Sound Library
 * 100% royalty-free, across all requested genres
 */
import { SampleItem } from '../types/daw';

export const SAMPLE_CATEGORIES = [
  'All',
  'Hip-hop',
  'Trap',
  'Drill',
  'Lo-fi',
  'EDM',
  'House',
  'Techno',
  'Bollywood',
  'Cinematic',
  'Ambient',
  'Acoustic'
] as const;

export const BUILT_IN_SAMPLES: SampleItem[] = [
  // TRAP & DRILL
  {
    id: 'sample-trap-808-spin',
    title: 'Spinz 808 Hard Hit',
    category: 'Trap',
    type: 'one-shot',
    key: 'C',
    bpm: 140,
    duration: 1.8,
    tags: ['808', 'sub', 'hard', 'saturated']
  },
  {
    id: 'sample-drill-hihat-roll',
    title: 'UK Drill Triplet Hat Roll',
    category: 'Drill',
    type: 'loop',
    key: 'F#m',
    bpm: 142,
    duration: 3.4,
    tags: ['hihat', 'triplet', 'drill', 'rolls']
  },
  {
    id: 'sample-drill-snare-snap',
    title: 'Ghost Snare Snip',
    category: 'Drill',
    type: 'one-shot',
    key: 'A',
    bpm: 142,
    duration: 0.5,
    tags: ['snare', 'ghost', 'tight']
  },
  {
    id: 'sample-trap-flute-loop',
    title: 'Dark Metro Flute Melody',
    category: 'Trap',
    type: 'loop',
    key: 'Gm',
    bpm: 130,
    duration: 7.4,
    tags: ['flute', 'melody', 'dark', 'metro']
  },

  // HIP-HOP & LO-FI
  {
    id: 'sample-lofi-vinyl-rhodes',
    title: 'Rainy Night Rhodes Chords',
    category: 'Lo-fi',
    type: 'loop',
    key: 'Ebmaj7',
    bpm: 85,
    duration: 11.2,
    tags: ['rhodes', 'chords', 'nostalgic', 'tape']
  },
  {
    id: 'sample-lofi-crackling-drums',
    title: 'Dusty Boom-Bap Drum Break',
    category: 'Lo-fi',
    type: 'loop',
    bpm: 88,
    duration: 5.4,
    tags: ['drums', 'dusty', 'vintage', 'swing']
  },
  {
    id: 'sample-hiphop-boom-kick',
    title: 'Golden Era 90s Kick',
    category: 'Hip-hop',
    type: 'one-shot',
    bpm: 92,
    duration: 0.8,
    tags: ['kick', 'punch', 'classic', 'mpc']
  },
  {
    id: 'sample-hiphop-brass-hit',
    title: 'Vintage Soul Brass Stab',
    category: 'Hip-hop',
    type: 'one-shot',
    key: 'Bb',
    duration: 1.2,
    tags: ['brass', 'stab', 'soul', 'orchestral']
  },

  // BOLLYWOOD & DESI FUSION
  {
    id: 'sample-bolly-tabla-groove',
    title: 'Royal Keherwa Tabla Loop',
    category: 'Bollywood',
    type: 'loop',
    bpm: 105,
    duration: 4.5,
    tags: ['tabla', 'desi', 'groove', 'indian', 'percussion']
  },
  {
    id: 'sample-bolly-dholak-roll',
    title: 'Dholak Uptempo Fill',
    category: 'Bollywood',
    type: 'loop',
    bpm: 112,
    duration: 2.1,
    tags: ['dholak', 'fill', 'bhangra', 'punjabi']
  },
  {
    id: 'sample-bolly-sitar-riff',
    title: 'Raga Bhairav Sitar Lead',
    category: 'Bollywood',
    type: 'loop',
    key: 'C#m',
    bpm: 98,
    duration: 9.8,
    tags: ['sitar', 'raga', 'melody', 'mystic']
  },
  {
    id: 'sample-bolly-vocal-alaap',
    title: 'Sufi Vocal Chant Chop',
    category: 'Bollywood',
    type: 'vocal',
    key: 'Dm',
    bpm: 120,
    duration: 4.0,
    tags: ['vocal', 'alaap', 'sufi', 'desi']
  },

  // EDM & HOUSE & TECHNO
  {
    id: 'sample-edm-festival-supersaw',
    title: 'Peak Festival Supersaw Drop',
    category: 'EDM',
    type: 'loop',
    key: 'Fm',
    bpm: 128,
    duration: 7.5,
    tags: ['supersaw', 'drop', 'festival', 'uplifting']
  },
  {
    id: 'sample-house-punchy-4onfloor',
    title: 'Tech House 4-on-the-Floor Kick',
    category: 'House',
    type: 'one-shot',
    bpm: 126,
    duration: 0.6,
    tags: ['kick', 'house', 'punch', 'sub']
  },
  {
    id: 'sample-house-funky-bassline',
    title: 'Slap Bass Groove Chicago',
    category: 'House',
    type: 'loop',
    key: 'Am',
    bpm: 124,
    duration: 7.7,
    tags: ['bass', 'funky', 'house', 'groove']
  },
  {
    id: 'sample-techno-berlin-rumble',
    title: 'Berghain Dark Sub Rumble Kick',
    category: 'Techno',
    type: 'loop',
    bpm: 135,
    duration: 3.5,
    tags: ['rumble', 'dark', 'industrial', 'techno']
  },

  // CINEMATIC & AMBIENT & ACOUSTIC
  {
    id: 'sample-cine-trailer-braam',
    title: 'Inception Trailer Braam Impact',
    category: 'Cinematic',
    type: 'one-shot',
    key: 'D',
    duration: 3.2,
    tags: ['braam', 'trailer', 'sub', 'epic', 'cinema']
  },
  {
    id: 'sample-ambient-crystal-shimmer',
    title: 'Aurora Borealis Shimmer Drone',
    category: 'Ambient',
    type: 'loop',
    key: 'C',
    bpm: 70,
    duration: 13.5,
    tags: ['drone', 'shimmer', 'ethereal', 'chill']
  },
  {
    id: 'sample-acoustic-fingerpick',
    title: 'Warm Acoustic Guitar Picking',
    category: 'Acoustic',
    type: 'loop',
    key: 'G',
    bpm: 96,
    duration: 10.0,
    tags: ['guitar', 'fingerpicking', 'warm', 'folk']
  }
];
