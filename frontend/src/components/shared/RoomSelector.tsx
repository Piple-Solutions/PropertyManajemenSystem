import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { roomService } from '@/services/roomService';
import { roomTypeService } from '@/services/roomTypeService';
import type { Room, RoomType } from '@/types/auth.types';
import { Badge } from './Badge';
import { getRoomTypeColor } from '@/constants/roomTypeColors';

interface RoomSelectorProps {
  selectedRooms: string[];
  onRoomToggle: (roomId: string) => void;
  disabled?: boolean;
  /** Mock availability: rooms booked by other reservations for the selected dates. */
  unavailableRoomIds?: string[];
  unavailableLabel?: string;
  /** Limit visible groups to one room type ('all' shows everything). */
  roomTypeFilter?: string;
}

export function RoomSelector({ selectedRooms, onRoomToggle, disabled = false, unavailableRoomIds = [], unavailableLabel = 'Booked', roomTypeFilter = 'all' }: RoomSelectorProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [types, setTypes] = useState<RoomType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    Promise.all([roomService.getAll(), roomTypeService.getAll()]).then(([r, t]) => {
      if (!cancelled) {
        setRooms(r);
        setTypes(t);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setRooms([]);
        setTypes([]);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const typeNameById = useMemo(() => new Map(types.map((t) => [t.id, t.name])), [types]);

  const getRoomTypeName = (roomTypeId: string) => {
    return typeNameById.get(roomTypeId) || 'Unknown';
  };

  // Group by actual room type; only groups that contain rooms are rendered.
  const groupsMap = new Map<string, { roomTypeId: string; roomTypeName: string; rooms: typeof rooms }>();
  for (const room of rooms) {
    const roomTypeName = getRoomTypeName(room.roomTypeId);
    const existing = groupsMap.get(room.roomTypeId);
    if (existing) {
      existing.rooms.push(room);
    } else {
      groupsMap.set(room.roomTypeId, { roomTypeId: room.roomTypeId, roomTypeName, rooms: [room] });
    }
  }
  const groups = Array.from(groupsMap.values())
    .filter((g) => roomTypeFilter === 'all' || g.roomTypeId === roomTypeFilter)
    .sort((a, b) =>
      a.roomTypeName.localeCompare(b.roomTypeName),
    );

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#232D36', fontFamily: 'var(--font-family-sans)' }}>Select Rooms</h4>
        <p style={{ margin: 0, fontSize: '14px', fontStyle: 'italic', color: '#6B7881' }}>Loading rooms...</p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#232D36', fontFamily: 'var(--font-family-sans)' }}>Select Rooms</h4>
        <p style={{ margin: 0, fontSize: '14px', fontStyle: 'italic', color: '#6B7881' }}>No rooms available.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {groups.map((group) => {
        const color = getRoomTypeColor(group.roomTypeName);
        const availableCount = group.rooms.filter((r) => r.status === 'active').length;
        const selectedCount = group.rooms.filter((r) => selectedRooms.includes(r.id)).length;

        return (
          <section key={group.roomTypeId} aria-label={`${group.roomTypeName} rooms`}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                backgroundColor: color.background,
                border: `1px solid ${color.border}`,
                borderLeft: `4px solid ${color.accent}`,
                borderRadius: '8px',
                padding: '10px 12px',
                marginBottom: '10px',
                flexWrap: 'wrap',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '999px',
                  backgroundColor: color.accent,
                  flexShrink: 0,
                }}
              />
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#232D36', fontFamily: 'var(--font-family-sans)' }}>
                {group.roomTypeName}
              </h4>
              <span style={{ fontSize: '12px', color: '#6B7881' }}>
                {group.rooms.length} room{group.rooms.length === 1 ? '' : 's'} · {availableCount} available
                {selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(160px, 100%), 1fr))', gap: '12px' }}>
              {group.rooms.map((room) => {
                const isSelected = selectedRooms.includes(room.id);
                const isBooked = unavailableRoomIds.includes(room.id);
                const isAvailable = room.status === 'active' && !isBooked;
                const clickable = (isAvailable || (isSelected && isBooked)) && !disabled;

                return (
                  <button
                    key={room.id}
                    type="button"
                    disabled={!clickable}
                    aria-pressed={isSelected}
                    aria-label={`Room ${room.roomNumber}, ${group.roomTypeName}, ${isSelected ? 'selected' : isAvailable ? 'available' : isBooked ? unavailableLabel : room.status}`}
                    onClick={() => clickable && onRoomToggle(room.id)}
                    style={{
                      position: 'relative',
                      textAlign: 'left',
                      padding: '30px 12px 12px 12px',
                      borderRadius: '8px',
                      border: `2px solid ${isSelected ? color.accent : color.border}`,
                      borderTop: `4px solid ${color.accent}`,
                      backgroundColor: isSelected ? color.background : isAvailable ? '#FFFFFF' : '#EEEDE9',
                      cursor: clickable ? 'pointer' : 'not-allowed',
                      opacity: !isAvailable ? 0.6 : 1,
                      transition: 'border-color 150ms ease, background-color 150ms ease',
                      fontFamily: 'var(--font-family-sans)',
                    }}
                    onFocus={(e) => {
                      if (clickable) {
                        e.currentTarget.style.outline = '2px solid #97764D';
                        e.currentTarget.style.outlineOffset = '2px';
                      }
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.outline = 'none';
                    }}
                  >
                    {isSelected && (
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#FFFFFF',
                          backgroundColor: color.accent,
                          borderRadius: '999px',
                          padding: '2px 8px 2px 6px',
                        }}
                      >
                        <Check size={12} aria-hidden="true" /> Selected
                      </span>
                    )}
                    <div style={{ fontWeight: 700, fontSize: '15px', color: '#232D36' }}>
                      Room {room.roomNumber}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6B7881', marginTop: '2px' }}>{group.roomTypeName}</div>
                    <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <Badge variant={isAvailable ? 'success' : 'warning'} size="sm">
                        {isAvailable ? 'Available' : isBooked ? unavailableLabel : room.status}
                      </Badge>
                      {!isAvailable && (
                        <span style={{ fontSize: '11px', color: '#6B7881' }}>{isBooked ? 'Overlaps another reservation' : 'Unavailable'}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
