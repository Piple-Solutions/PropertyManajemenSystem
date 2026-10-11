import type { CSSProperties } from 'react';
import { CATEGORY_CONFIG } from '@/data/floorPlan';
import type { FloorArea } from '@/data/floorPlan';
import type { Room } from '@/types/auth.types';
import { Badge } from '@/components/shared/Badge';
import { reservationStatusLabels } from '@/constants/reservationStatuses';
import { occupancyNights, type RoomOccupancy } from '@/hooks/useRoomOccupancy';

interface RoomOccupancyPopupProps {
  area: FloorArea;
  room?: Room;
  occupancy: RoomOccupancy;
  loading: boolean;
  style?: CSSProperties;
  onClose: () => void;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function RoomOccupancyPopup({ area, room, occupancy, loading, style, onClose }: RoomOccupancyPopupProps) {
  const { current, next } = occupancy;
  return (
    <div
      role="dialog"
      aria-label={`Room ${area.label} details`}
      style={{
        position: 'absolute',
        width: '250px',
        maxWidth: '85%',
        backgroundColor: '#FFFFFF',
        border: '1px solid #C7BBAB',
        borderRadius: '8px',
        boxShadow: '0 8px 24px rgba(35,45,54,0.25)',
        padding: '12px',
        zIndex: 20,
        ...style,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: '#232D36' }}>Room {area.label}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          {room && (
            <Badge
              size="sm"
              variant={room.status === 'active' ? 'success' : room.status === 'maintenance' ? 'warning' : 'danger'}
            >
              {room.status}
            </Badge>
          )}
          <button
            onClick={onClose}
            aria-label="Close room details"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#6B7881', padding: '0 2px', lineHeight: 1 }}
          >
            ×
          </button>
        </span>
      </div>

      <div style={{ fontSize: '12px', color: '#6B7881', marginBottom: '8px' }}>
        {area.category ? CATEGORY_CONFIG[area.category].label : 'Info area'}
      </div>

      {loading ? (
        <div style={{ fontSize: '13px', color: '#6B7881' }}>Loading stay info…</div>
      ) : current ? (
        <div style={{ borderTop: '1px solid #E3DED6', paddingTop: '8px' }}>
          <div style={{ marginBottom: '6px' }}>
            <Badge size="sm" variant={current.status === 'checked-in' ? 'success' : 'warning'}>
              {current.status === 'checked-in' ? 'Occupied' : reservationStatusLabels[current.status]}
            </Badge>
          </div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#232D36' }}>{current.guestName}</div>
          <div style={{ fontSize: '12px', color: '#6B7881' }}>{current.reservationCode}</div>
          <div style={{ fontSize: '12px', color: '#232D36', marginTop: '4px' }}>
            {formatDate(current.checkInDate)} → {formatDate(current.checkOutDate)}
            <span style={{ color: '#6B7881' }}> · {occupancyNights(current)} night{occupancyNights(current) === 1 ? '' : 's'}</span>
          </div>
          {next && (
            <div style={{ borderTop: '1px solid #E3DED6', marginTop: '8px', paddingTop: '8px', fontSize: '12px' }}>
              <span style={{ color: '#6B7881' }}>Next: </span>
              <span style={{ fontWeight: 600, color: '#232D36' }}>{next.guestName}</span>
              <span style={{ color: '#6B7881' }}> · from {formatDate(next.checkInDate)}</span>
            </div>
          )}
        </div>
      ) : (
        <div style={{ borderTop: '1px solid #E3DED6', paddingTop: '8px' }}>
          <div style={{ marginBottom: '6px' }}>
            <Badge size="sm" variant="default">Available</Badge>
          </div>
          {next ? (
            <div style={{ fontSize: '12px' }}>
              <span style={{ color: '#6B7881' }}>Next: </span>
              <span style={{ fontWeight: 600, color: '#232D36' }}>{next.guestName}</span>
              <span style={{ color: '#6B7881' }}> · {formatDate(next.checkInDate)} → {formatDate(next.checkOutDate)}</span>
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: '#6B7881' }}>No upcoming bookings.</div>
          )}
        </div>
      )}
    </div>
  );
}
