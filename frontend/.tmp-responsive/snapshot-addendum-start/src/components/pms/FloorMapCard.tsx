import { useState, useRef, useEffect, useMemo, type CSSProperties } from 'react';
import { CATEGORY_CONFIG, CATEGORY_LIST, FLOOR_PLAN, FloorArea, RoomCategory } from '@/data/floorPlan';
import { Room } from '@/types/auth.types';
import { useRoomOccupancy } from '@/hooks/useRoomOccupancy';
import { RoomOccupancyPopup } from '@/components/pms/RoomOccupancyPopup';

interface FloorMapCardProps {
  rooms: Room[];
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string | null) => void;
}

export function FloorMapCard({ rooms, selectedRoomId, onSelectRoom }: FloorMapCardProps) {
  const [activeFloorId, setActiveFloorId] = useState(FLOOR_PLAN[0].id);
  const [activeCategories, setActiveCategories] = useState<Set<RoomCategory>>(new Set());
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  const activeFloor = FLOOR_PLAN.find((f) => f.id === activeFloorId) || FLOOR_PLAN[0];

  const getRoomData = (area: FloorArea): Room | undefined => {
    if (area.kind !== 'room') return undefined;
    return rooms.find((r) => r.roomNumber === area.label);
  };

  const isRoomSelected = (area: FloorArea): boolean => {
    const room = getRoomData(area);
    return room ? room.id === selectedRoomId : area.id === selectedRoomId;
  };

  const isCategoryDimmed = (category: RoomCategory): boolean => {
    if (activeCategories.size === 0) return false;
    return !activeCategories.has(category);
  };

  const toggleCategory = (category: RoomCategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const clearCategories = () => setActiveCategories(new Set());

  const handleAreaClick = (area: FloorArea) => {
    if (area.kind === 'info') return;
    const room = getRoomData(area);
    if (room) {
      onSelectRoom(room.id === selectedRoomId ? null : room.id);
    } else {
      onSelectRoom(area.id === selectedRoomId ? null : area.id);
    }
  };

  const handleAreaHover = (area: FloorArea, isEntering: boolean) => {
    if (area.kind === 'info') return;
    setHoveredRoomId(isEntering ? area.id : null);
  };

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId),
    [rooms, selectedRoomId],
  );

  const selectedAreaInfo = useMemo(() => {
    if (!selectedRoomId) return null;
    if (selectedRoom) {
      for (const floor of FLOOR_PLAN) {
        const area = floor.areas.find((a) => a.kind === 'room' && a.label === selectedRoom.roomNumber);
        if (area) return { floor, area };
      }
    }
    for (const floor of FLOOR_PLAN) {
      const area = floor.areas.find((a) => a.id === selectedRoomId);
      if (area) return { floor, area };
    }
    return null;
  }, [selectedRoom, selectedRoomId]);

  // Cross-floor sync: jump the map to the floor containing the selected room.
  useEffect(() => {
    if (selectedAreaInfo && selectedAreaInfo.floor.id !== activeFloorId) {
      setActiveFloorId(selectedAreaInfo.floor.id);
    }
  }, [selectedAreaInfo, activeFloorId]);

  const selectedArea =
    selectedAreaInfo && selectedAreaInfo.floor.id === activeFloorId ? selectedAreaInfo.area : null;

  const { occupancy, loading: occupancyLoading } = useRoomOccupancy(selectedRoom?.id ?? null);

  const popupStyle = useMemo<CSSProperties | undefined>(() => {
    if (!selectedArea) return undefined;
    const { x, y, w, h } = selectedArea;
    const cx = x + w / 2;
    const style: CSSProperties = {};
    if (cx > 70) style.right = '2%';
    else if (cx < 30) style.left = '2%';
    else {
      style.left = `${cx}%`;
      style.transform = 'translateX(-50%)';
    }
    if (y < 55) style.top = `${y + h + 1.5}%`;
    else style.bottom = `${100 - y + 1.5}%`;
    return style;
  }, [selectedArea]);

  useEffect(() => {
    if (!selectedArea || !mapRef.current) return;
    const el = mapRef.current.querySelector(`[data-room-id="${selectedArea.id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedArea, activeFloorId]);

  useEffect(() => {
    if (!selectedArea) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSelectRoom(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedArea, onSelectRoom]);

  // Auto-dismiss: clicking anything outside the popup closes it, except
  // map tiles and table rows which manage selection themselves.
  useEffect(() => {
    if (!selectedArea) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[role="dialog"]')) return;
      if (target.closest('[data-room-id]')) return;
      if (target.closest('[data-room-row]')) return;
      onSelectRoom(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [selectedArea, onSelectRoom]);

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #C7BBAB',
        borderRadius: '8px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#232D36', margin: 0 }}>Floor Map Plan</h2>
      </div>

      <div className="fmc-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '12px' }} role="tablist" aria-label="Floor selection">
        {FLOOR_PLAN.map((floor) => (
          <button
            key={floor.id}
            className="fmc-btn"
            role="tab"
            aria-selected={activeFloorId === floor.id}
            onClick={() => setActiveFloorId(floor.id)}
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              border: '1px solid #C7BBAB',
              backgroundColor: activeFloorId === floor.id ? '#97764D' : '#FFFFFF',
              color: activeFloorId === floor.id ? '#FFFFFF' : '#232D36',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
          >
            {floor.label}
          </button>
        ))}
      </div>

      <p className="fmc-hint">Geser ke samping untuk melihat seluruh denah.</p>
      <div className="fmc-scroll">
      <div
        ref={mapRef}
        className="fmc-map"
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          backgroundColor: '#F8F6F2',
          border: '1px solid #E3DED6',
          borderRadius: '6px',
          overflow: 'hidden',
          marginBottom: '12px',
        }}
      >
        {activeFloor.groups.map((group) => (
          <div
            key={group.id}
            style={{
              position: 'absolute',
              left: `${group.x}%`,
              top: `${group.y}%`,
              width: `${group.w}%`,
              height: `${group.h}%`,
              border: '2px dashed #97764D',
              borderRadius: '4px',
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: '-10px',
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: '8px',
                fontWeight: 700,
                color: '#97764D',
                backgroundColor: '#F8F6F2',
                padding: '0 4px',
                letterSpacing: '0.05em',
                whiteSpace: 'nowrap',
              }}
            >
              {group.label}
            </span>
          </div>
        ))}

        {activeFloor.areas.map((area) => {
          const isSelected = isRoomSelected(area);
          const isHovered = hoveredRoomId === area.id;
          const isDimmed = area.category ? isCategoryDimmed(area.category) : false;
          const categoryColor = area.category ? CATEGORY_CONFIG[area.category].color : '#D9D9D9';
          const isInfo = area.kind === 'info';

          return (
            <div
              key={area.id}
              data-room-id={area.id}
              role={isInfo ? undefined : 'button'}
              tabIndex={isInfo ? undefined : 0}
              aria-label={isInfo ? undefined : `${area.label}, ${area.category ? CATEGORY_CONFIG[area.category].label : 'Info'}`}
              aria-pressed={isInfo ? undefined : isSelected}
              onClick={() => handleAreaClick(area)}
              onMouseEnter={() => handleAreaHover(area, true)}
              onMouseLeave={() => handleAreaHover(area, false)}
              onKeyDown={(e) => {
                if (!isInfo && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  handleAreaClick(area);
                }
              }}
              style={{
                position: 'absolute',
                left: `${area.x}%`,
                top: `${area.y}%`,
                width: `${area.w}%`,
                height: `${area.h}%`,
                backgroundColor: isInfo ? '#E8E0D4' : categoryColor,
                border: isSelected ? '3px solid #232D36' : '1px solid rgba(0,0,0,0.15)',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isInfo ? 'default' : 'pointer',
                opacity: isDimmed ? 0.3 : 1,
                transform: isHovered && !isInfo ? 'scale(1.05)' : 'scale(1)',
                transition: 'all 150ms ease',
                boxShadow: isSelected ? '0 0 0 2px rgba(35,45,54,0.3)' : isHovered && !isInfo ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                zIndex: isSelected ? 10 : isHovered ? 5 : 1,
              }}
            >
              <span
                style={{
                  fontSize: area.w > 15 ? '14px' : '11px',
                  fontWeight: 700,
                  color: '#232D36',
                  textAlign: 'center',
                  lineHeight: 1.2,
                  padding: '2px',
                }}
              >
                {area.label}
              </span>
            </div>
          );
        })}

        {selectedArea && (
          <RoomOccupancyPopup
            area={selectedArea}
            room={selectedRoom}
            occupancy={occupancy}
            loading={occupancyLoading}
            style={popupStyle}
            onClose={() => onSelectRoom(null)}
          />
        )}
      </div>
      </div>

      <div className="fmc-legend" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }} role="group" aria-label="Category legend">
        {CATEGORY_LIST.map((cat) => {
          const isActive = activeCategories.has(cat.key);
          const isDimmed = activeCategories.size > 0 && !isActive;
          return (
            <button
              key={cat.key}
              className="fmc-btn"
              onClick={() => toggleCategory(cat.key)}
              aria-pressed={isActive}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '999px',
                border: `1px solid ${isActive ? '#232D36' : '#C7BBAB'}`,
                backgroundColor: isActive ? '#F2F0EB' : '#FFFFFF',
                opacity: isDimmed ? 0.4 : 1,
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                color: '#232D36',
                transition: 'all 150ms ease',
              }}
            >
              <span
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '3px',
                  backgroundColor: cat.color,
                  border: '1px solid rgba(0,0,0,0.1)',
                  flexShrink: 0,
                }}
              />
              {cat.label}
            </button>
          );
        })}
        {activeCategories.size > 0 && (
          <button
            className="fmc-btn"
            onClick={clearCategories}
            style={{
              padding: '4px 10px',
              borderRadius: '999px',
              border: '1px solid #C7BBAB',
              backgroundColor: '#FFFFFF',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
              color: '#6B7881',
            }}
          >
            Clear
          </button>
        )}
      </div>

    </div>
  );
}
