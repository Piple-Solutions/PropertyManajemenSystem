import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { startOfMonth, parseISO, format, isValid } from 'date-fns';
import { Filter, X, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import { CalendarView } from '@/components/shared/CalendarView';
import { DayReservationsPopup } from '@/components/shared/DayReservationsPopup';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { roomService } from '@/services/roomService';
import { reservationService } from '@/services/reservationService';
import '../../styles/reservation-boards.css';
import '../../styles/reservation-list.css';

const STATUS_BARS = [
  { key: 'total', label: 'Total Reservasi', color: '#232D36' },
  { key: 'reserved', label: 'Reserved', color: '#97764D' },
  { key: 'checked-in', label: 'Checked In', color: '#2F5D37' },
  { key: 'checked-out', label: 'Checked Out', color: '#6B7881' },
  { key: 'cancelled', label: 'Cancelled', color: '#962222' },
];

type CalCategoryKey = 'room' | 'status';

const CAL_CATEGORIES: Array<{ key: CalCategoryKey; label: string }> = [
  { key: 'room', label: 'Room' },
  { key: 'status', label: 'Status' },
];

const CAL_STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'checked-in', label: 'Checked In' },
  { value: 'checked-out', label: 'Checked Out' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function ReservationCalendarPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [appliedRoom, setAppliedRoom] = useState('all');
  const [appliedStatus, setAppliedStatus] = useState('all');
  const [draftRoom, setDraftRoom] = useState('all');
  const [draftStatus, setDraftStatus] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CalCategoryKey | null>(null);
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);
  const filterWrapRef = useRef<HTMLDivElement>(null);

  // The visible month is real "now" unless `?month=YYYY-MM` deep-links one.
  // Parsed once on mount; later navigation is driven by the prev/next buttons.
  const [month, setMonth] = useState<Date>(() => {
    const raw = searchParams.get('month');
    if (raw && /^\d{4}-\d{2}$/.test(raw)) {
      const parsed = parseISO(`${raw}-01`);
      if (isValid(parsed)) return startOfMonth(parsed);
    }
    return startOfMonth(new Date());
  });

  const handleMonthChange = useCallback(
    (next: Date) => {
      setMonth(startOfMonth(next));
      setSearchParams({ month: format(next, 'yyyy-MM') }, { replace: true });
    },
    [setSearchParams],
  );

  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 60);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!filterOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (filterWrapRef.current && !filterWrapRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
        setActiveCategory(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFilterOpen(false);
        setActiveCategory(null);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [filterOpen]);

  const openFilter = () => {
    setDraftRoom(appliedRoom);
    setDraftStatus(appliedStatus);
    setActiveCategory(null);
    setFilterOpen(true);
  };

  const closeFilter = () => {
    setFilterOpen(false);
    setActiveCategory(null);
  };

  const applyFilters = () => {
    setAppliedRoom(draftRoom);
    setAppliedStatus(draftStatus);
    closeFilter();
  };

  const resetFilters = () => {
    setDraftRoom('all');
    setDraftStatus('all');
    setAppliedRoom('all');
    setAppliedStatus('all');
  };

  const [rooms, setRooms] = useState<Array<{ id: string; roomNumber: string; status: string }>>([]);
  const [reservations, setReservations] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    roomService.getAll().then((rows) => {
      if (!cancelled) setRooms(rows);
    }).catch(() => {
      if (!cancelled) setRooms([]);
    });
    reservationService.getAll().then((rows) => {
      if (!cancelled) setReservations(rows);
    }).catch(() => {
      if (!cancelled) setReservations([]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeRooms = rooms.filter((r) => r.status === 'active').length;
  const activeFilterCount = (appliedRoom !== 'all' ? 1 : 0) + (appliedStatus !== 'all' ? 1 : 0);

  const draftActive = (key: CalCategoryKey): boolean =>
    key === 'room' ? draftRoom !== 'all' : draftStatus !== 'all';

  const draftSummary = (key: CalCategoryKey): string => {
    if (key === 'room') {
      return draftRoom === 'all' ? '' : (rooms.find((r) => r.id === draftRoom)?.roomNumber || '');
    }
    if (draftStatus === 'all') return '';
    return CAL_STATUS_OPTIONS.find((o) => o.value === draftStatus)?.label || draftStatus;
  };

  const optionsForCategory = (key: CalCategoryKey): Array<{ value: string; label: string }> => {
    if (key === 'room') {
      return [
        { value: 'all', label: 'All Rooms' },
        ...rooms.map((r) => ({ value: r.id, label: `Room ${r.roomNumber}` })),
      ];
    }
    return CAL_STATUS_OPTIONS;
  };

  const draftValue = (key: CalCategoryKey): string => (key === 'room' ? draftRoom : draftStatus);

  const setDraftValue = (key: CalCategoryKey, value: string) => {
    if (key === 'room') setDraftRoom(value);
    else setDraftStatus(value);
  };

  const activeCategoryLabel = activeCategory === 'room' ? 'Room' : activeCategory === 'status' ? 'Status' : '';

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { total: reservations.length };
    for (const s of STATUS_BARS.slice(1)) {
      counts[s.key] = reservations.filter((r) => r.status === s.key).length;
    }
    return counts;
  }, [reservations]);

  const maxCount = Math.max(1, ...Object.values(statusCounts));
  const chartSummary = `Distribusi reservasi. ${STATUS_BARS.map((s) => `${s.label} ${statusCounts[s.key] ?? 0}`).join(', ')}.`;

  const handleViewAll = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    setSelectedDate(null);
    navigate(`/dashboard/reservations?date=${y}-${m}-${d}`);
  };

  return (
    <div style={{ padding: 'var(--space-xl, 20px)', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#232D36', fontFamily: 'var(--font-family-sans)', margin: 0 }}>Reservation Calendar</h1>
          <p style={{ color: '#6B7881', margin: '4px 0 0 0', fontSize: '14px' }}>Visualize reservations by date</p>
        </div>
      </div>

      <div className="res-toolbar" role="search">
        <div className="res-toolbar__filterwrap" ref={filterWrapRef}>
          <Button
            onClick={() => (filterOpen ? setFilterOpen(false) : openFilter())}
            aria-expanded={filterOpen}
            aria-label={activeFilterCount > 0 ? `Filter, ${activeFilterCount} active` : 'Filter'}
          >
            <Filter size={16} aria-hidden="true" />
            <span style={{ marginLeft: '8px' }}>Filter</span>
            {activeFilterCount > 0 && (
              <span className="res-filterbtn-count" aria-hidden="true">{activeFilterCount}</span>
            )}
          </Button>

          {filterOpen && (
            <>
              <button
                type="button"
                className="res-filter-scrim"
                aria-label="Close filters"
                onClick={closeFilter}
                tabIndex={-1}
              />
              <div className={`res-cascade${activeCategory ? ' res-cascade--split res-cascade--detail' : ''}`}>
                <div className="res-cascade__panel1" role="dialog" aria-label="Calendar filters">
                  <div className="res-cascade__head">
                    <h2 className="res-cascade__title">Filter</h2>
                    <button type="button" onClick={closeFilter} aria-label="Close filters" className="res-cascade__close">
                      <X size={18} aria-hidden="true" />
                    </button>
                  </div>
                  <ul className="res-cascade__cats">
                    {CAL_CATEGORIES.map((cat) => {
                      const active = draftActive(cat.key);
                      const summary = draftSummary(cat.key);
                      const selected = activeCategory === cat.key;
                      return (
                        <li key={cat.key}>
                          <button
                            type="button"
                            className={`res-cascade__catbtn${active ? ' res-cascade__catbtn--active' : ''}`}
                            aria-expanded={selected}
                            onClick={() => setActiveCategory(selected ? null : cat.key)}
                          >
                            <span className="res-cascade__catlabel">{cat.label}</span>
                            {summary && <span className="res-cascade__catsub">{summary}</span>}
                            {active && (
                              <span className="res-cascade__check" aria-hidden="true">
                                <Check size={16} aria-hidden="true" />
                              </span>
                            )}
                            <span className="res-cascade__chev" aria-hidden="true">
                              <ChevronRight size={16} aria-hidden="true" />
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="res-cascade__actions">
                    <Button variant="outline" onClick={resetFilters}>Reset</Button>
                    <Button onClick={applyFilters}>Apply</Button>
                  </div>
                </div>

                {activeCategory && (
                  <div className="res-cascade__panel2" aria-label={`${activeCategoryLabel} options`}>
                    <div className="res-cascade__head">
                      <button
                        type="button"
                        onClick={() => setActiveCategory(null)}
                        aria-label="Back to filter categories"
                        className="res-cascade__back"
                      >
                        <ChevronLeft size={18} aria-hidden="true" />
                        {activeCategoryLabel}
                      </button>
                      <h3 className="res-cascade__title">{activeCategoryLabel}</h3>
                      <button type="button" onClick={closeFilter} aria-label="Close filters" className="res-cascade__close">
                        <X size={18} aria-hidden="true" />
                      </button>
                    </div>
                    <ul className="res-cascade__opts">
                      {optionsForCategory(activeCategory).map((opt) => {
                        const selected = draftValue(activeCategory) === opt.value;
                        return (
                          <li key={opt.value}>
                            <button
                              type="button"
                              className="res-cascade__optbtn"
                              aria-pressed={selected}
                              onClick={() => setDraftValue(activeCategory, opt.value)}
                            >
                              <span className="res-cascade__optlabel">{opt.label}</span>
                              {selected && (
                                <span className="res-cascade__check" aria-hidden="true">
                                  <Check size={16} aria-hidden="true" />
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="res-cascade__actions2">
                      <Button variant="outline" onClick={resetFilters}>Reset</Button>
                      <Button onClick={applyFilters}>Apply</Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <div className="res-toolbar__search">
          <Input
            placeholder="Search reservations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search reservations"
          />
        </div>
      </div>
      <p className="res-toolbar__meta">
        {activeRooms} kamar aktif
        {activeFilterCount > 0 ? ` · ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'} active` : ''}
      </p>

      <CalendarView
        month={month}
        onMonthChange={handleMonthChange}
        filterRoomId={appliedRoom !== 'all' ? appliedRoom : undefined}
        filterStatus={appliedStatus !== 'all' ? appliedStatus : undefined}
        filterSearch={search}
        onDateClick={(day) => setSelectedDate(day)}
      />

      <section className="res-board" aria-labelledby="res-cal-chart-title" style={{ marginTop: '20px' }}>
        <h2 id="res-cal-chart-title" className="res-board__title">Distribusi Reservasi</h2>
        <p className="res-board__sub">Jumlah reservasi per status · Total {statusCounts.total}</p>
        <div role="img" aria-label={chartSummary}>
          {STATUS_BARS.map((s) => (
            <div className="res-bar" key={s.key} title={`${s.label}: ${statusCounts[s.key] ?? 0}`}>
              <span className="res-bar__label">{s.label}</span>
              <span className="res-bar__track">
                <span
                  className="res-bar__fill"
                  style={{
                    display: 'block',
                    width: mounted ? `${Math.max((statusCounts[s.key] ?? 0) > 0 ? 2 : 0, ((statusCounts[s.key] ?? 0) / maxCount) * 100)}%` : '0%',
                    backgroundColor: s.color,
                  }}
                />
              </span>
              <span className="res-bar__value">{statusCounts[s.key] ?? 0}</span>
            </div>
          ))}
        </div>
      </section>

      <DayReservationsPopup
        date={selectedDate}
        filterRoomId={appliedRoom !== 'all' ? appliedRoom : undefined}
        filterStatus={appliedStatus !== 'all' ? appliedStatus : undefined}
        onClose={() => setSelectedDate(null)}
        onViewAll={handleViewAll}
      />
    </div>
  );
}
