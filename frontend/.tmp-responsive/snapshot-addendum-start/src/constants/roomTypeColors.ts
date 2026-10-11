export type RoomTypeColorKey = 'standard' | 'twin' | 'family' | 'homy' | 'eco' | 'neutral';

export interface RoomTypeColor {
  key: RoomTypeColorKey;
  /** Soft background tint for group header / selected card */
  background: string;
  /** Border tint derived from the same hue */
  border: string;
  /** Deeper accent for dots, header bar and selected border (never saturated primary) */
  accent: string;
  /** Text color that keeps contrast on the soft background */
  text: string;
}

/**
 * Soft/light background accents per Phase 2 spec.
 * Deliberately muted so the brown/warm-neutral PMS identity stays dominant.
 */
export const roomTypeColors: Record<RoomTypeColorKey, RoomTypeColor> = {
  standard: {
    key: 'standard',
    background: '#E4EDF7',
    border: '#BCCFE6',
    accent: '#375466',
    text: '#2F4A5E',
  },
  twin: {
    key: 'twin',
    background: '#E3F0E4',
    border: '#BDD9C0',
    accent: '#2F5D37',
    text: '#2F5D37',
  },
  family: {
    key: 'family',
    background: '#FBEAD2',
    border: '#EFD2A8',
    accent: '#7A5A1E',
    text: '#6F4528',
  },
  homy: {
    key: 'homy',
    background: '#FBF3CF',
    border: '#EADF9E',
    accent: '#7A5A1E',
    text: '#6F4528',
  },
  eco: {
    key: 'eco',
    background: '#F6DEDE',
    border: '#E4BCBC',
    accent: '#962222',
    text: '#962222',
  },
  neutral: {
    key: 'neutral',
    background: '#F2F0EB',
    border: '#C7BBAB',
    accent: '#97764D',
    text: '#232D36',
  },
};

/**
 * Map any room-type display name to one of the five spec colors:
 * Standard (light blue), Twin (light green), Family (light orange),
 * Homy (light yellow), Eco (light red). Unknown names fall
 * back to the warm-neutral bronze tint to preserve elegance.
 */
export function getRoomTypeColorKey(roomTypeName: string): RoomTypeColorKey {
  const name = (roomTypeName || '').toLowerCase();
  if (name.includes('standard')) return 'standard';
  if (name.includes('twin')) return 'twin';
  if (name.includes('family')) return 'family';
  if (name.includes('homy') || name.includes('homey') || name.includes('homi')) return 'homy';
  if (name.includes('eco')) return 'eco';
  return 'neutral';
}

export function getRoomTypeColor(roomTypeName: string): RoomTypeColor {
  return roomTypeColors[getRoomTypeColorKey(roomTypeName)];
}
