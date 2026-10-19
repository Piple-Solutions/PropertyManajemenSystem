export type RoomCategory = 'standard' | 'family' | 'twin' | 'eco' | 'homey' | 'joglo';

export interface CategoryConfig {
  key: RoomCategory;
  label: string;
  color: string;
}

export const CATEGORY_CONFIG: Record<RoomCategory, CategoryConfig> = {
  standard: { key: 'standard', label: 'Standard Room', color: '#CFE2F3' },
  family: { key: 'family', label: 'Family Room', color: '#F9CB9C' },
  twin: { key: 'twin', label: 'Twin Room', color: '#D9EAD3' },
  eco: { key: 'eco', label: 'Eco Room', color: '#EAD1DC' },
  homey: { key: 'homey', label: 'Homey Room', color: '#FFF2CC' },
  joglo: { key: 'joglo', label: 'Joglo (Rental)', color: '#D9D9D9' },
};

export const CATEGORY_LIST: CategoryConfig[] = Object.values(CATEGORY_CONFIG);

export interface FloorArea {
  id: string;
  label: string;
  kind: 'room' | 'info' | 'venue';
  category?: RoomCategory;
  x: number;
  y: number;
  w: number;
  h: number;
  group?: string;
}

export interface FloorGroup {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Floor {
  id: string;
  label: string;
  areas: FloorArea[];
  groups: FloorGroup[];
}

export const FLOOR_PLAN: Floor[] = [
  {
    id: 'floor-1',
    label: 'Floor 1',
    areas: [
      { id: 'room-19', label: '19', kind: 'room', category: 'homey', x: 3.0, y: 5.0, w: 8.3, h: 15.0 },
      { id: 'room-20', label: '20', kind: 'room', category: 'family', x: 13.2, y: 5.0, w: 8.3, h: 15.0 },
      { id: 'lobby', label: 'Lobby', kind: 'info', x: 29.5, y: 15.1, w: 10.8, h: 15.0 },
      { id: 'joglo', label: 'SEWA JOGLO', kind: 'room', category: 'joglo', x: 44.8, y: 14.8, w: 37.7, h: 30.6 },
      { id: 'swimming-pool', label: 'Swimming Pool', kind: 'info', x: 64.4, y: 47.7, w: 18.1, h: 14.9 },
      { id: 'room-01', label: '01', kind: 'room', category: 'standard', x: 29.5, y: 69.9, w: 7.7, h: 15.0 },
      { id: 'room-02', label: '02', kind: 'room', category: 'standard', x: 38.5, y: 69.9, w: 7.7, h: 15.0 },
      { id: 'room-03', label: '03', kind: 'room', category: 'standard', x: 47.6, y: 69.9, w: 7.7, h: 15.0 },
      { id: 'room-04', label: '04', kind: 'room', category: 'family', x: 56.7, y: 69.9, w: 7.7, h: 15.0 },
      { id: 'room-05', label: '05', kind: 'room', category: 'family', x: 65.7, y: 69.9, w: 7.7, h: 15.0 },
      { id: 'room-06', label: '06', kind: 'room', category: 'family', x: 74.8, y: 70.1, w: 7.7, h: 15.0 },
      { id: 'room-08', label: '08', kind: 'room', category: 'standard', x: 87.2, y: 60.5, w: 8.3, h: 15.0, group: 'split-level' },
      { id: 'room-07', label: '07', kind: 'room', category: 'standard', x: 87.2, y: 77.5, w: 8.3, h: 15.0, group: 'split-level' },
    ],
    groups: [
      { id: 'split-level', label: 'SPLIT LEVEL', x: 85.8, y: 57.6, w: 11.2, h: 37.3 },
    ],
  },
  {
    id: 'floor-2',
    label: 'Floor 2',
    areas: [
      { id: 'room-16', label: '16', kind: 'room', category: 'standard', x: 12.2, y: 12.4, w: 8.3, h: 15.0 },
      { id: 'room-18', label: '18', kind: 'room', category: 'eco', x: 25.3, y: 12.4, w: 8.3, h: 15.0 },
      { id: 'room-17', label: '17', kind: 'room', category: 'family', x: 12.2, y: 30.6, w: 8.3, h: 15.0 },
      { id: 'room-15', label: '15', kind: 'room', category: 'standard', x: 40.4, y: 54.9, w: 8.3, h: 15.0 },
      { id: 'room-14', label: '14', kind: 'room', category: 'standard', x: 50.2, y: 54.9, w: 8.3, h: 15.0 },
      { id: 'room-13', label: '13', kind: 'room', category: 'standard', x: 59.8, y: 54.9, w: 8.3, h: 15.0 },
      { id: 'room-12', label: '12', kind: 'room', category: 'twin', x: 69.6, y: 54.9, w: 8.3, h: 15.0 },
      { id: 'room-09', label: '09', kind: 'room', category: 'twin', x: 79.5, y: 54.9, w: 8.3, h: 15.0 },
      { id: 'room-11', label: '11', kind: 'room', category: 'twin', x: 69.6, y: 72.6, w: 8.3, h: 15.0 },
      { id: 'room-10', label: '10', kind: 'room', category: 'twin', x: 79.5, y: 72.6, w: 8.3, h: 15.0 },
    ],
    groups: [],
  },
];

export function findFloorByRoomId(roomId: string): Floor | undefined {
  return FLOOR_PLAN.find((floor) => floor.areas.some((area) => area.id === roomId));
}

export function findAreaByRoomId(roomId: string): FloorArea | undefined {
  for (const floor of FLOOR_PLAN) {
    const area = floor.areas.find((a) => a.id === roomId);
    if (area) return area;
  }
  return undefined;
}
