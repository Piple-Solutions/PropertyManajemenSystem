import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Filter, X, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import { reservationService } from '@/services/reservationService';
import { roomService } from '@/services/roomService';
import { roomTypeService } from '@/services/roomTypeService';
import { invoiceService } from '@/services/invoiceService';
import { ReservationCard } from '@/components/shared/ReservationCard';
import { Button } from '@/components/shared/Button';
import { Card } from '@/components/shared/Card';
import { Input } from '@/components/shared/Input';
import { Pagination } from '@/components/shared/Pagination';
import { ReservationWizardModal } from '@/components/shared/ReservationWizardModal';
import { reservationSources, reservationSourceLabels, reservationStatusLabels } from '@/constants/reservationStatuses';
import { paymentStatuses } from '@/constants/invoiceStatuses';
import '../../styles/reservation-boards.css';
import '../../styles/reservation-list.css';

const STATUS_BARS = [
  { key: 'total', label: 'Total Reservasi', color: '#232D36' },
  { key: 'reserved', label: 'Reserved', color: '#97764D' },
  { key: 'checked-in', label: 'Checked In', color: '#2F5D37' },
  { key: 'checked-out', label: 'Checked Out', color: '#6B7881' },
  { key: 'cancelled', label: 'Cancelled', color: '#962222' },
];

interface ReservationFilters {
  status: string;
  source: string;
  date: string;
  roomType: string;
  payment: string;
}

const DEFAULT_FILTERS: ReservationFilters = {
  status: 'all',
  source: 'all',
  date: '',
  roomType: 'all',
  payment: 'all',
};

type FilterCategoryKey = 'status' | 'source' | 'roomType' | 'date' | 'payment';

type QuickRangeKey = 'all' | 'today' | 'weekly' | 'monthly' | 'month';

const QUICK_RANGES: Array<{ key: QuickRangeKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Quick-range bounds for weekly/monthly, anchored on the real today.
 * Week follows the id-ID locale convention (Monday start), consistent with
 * the application's existing date handling. 'all' shows every reservation
 * (no date restriction); overlap uses the same
 * stay-overlaps-day semantics as the main date filter.
 */
function quickRangeBounds(range: QuickRangeKey): { start: Date; end: Date } | null {
  if (range === 'all') return null;
  const today = stripTime(new Date());
  if (range === 'today') return { start: today, end: today };
  if (range === 'weekly') {
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: monday, end: sunday };
  }
  return {
    start: new Date(today.getFullYear(), today.getMonth(), 1),
    end: new Date(today.getFullYear(), today.getMonth() + 1, 0),
  };
}

function staysInRange(checkInDate: string, checkOutDate: string, range: QuickRangeKey, month = ''): boolean {
  if (range === 'all') return true;
  const bounds = range === 'month' ? monthBounds(month) : quickRangeBounds(range);
  if (!bounds) return true;
  const ci = stripTime(new Date(checkInDate));
  const co = stripTime(new Date(checkOutDate));
  return ci <= bounds.end && co >= bounds.start;
}

function monthBounds(ym: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return { start: new Date(y, mo - 1, 1), end: new Date(y, mo, 0) };
}

function monthLabel(ym: string): string {
  const d = new Date(`${ym}-01T00:00:00`);
  if (Number.isNaN(d.getTime())) return ym;
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

const FILTER_CATEGORIES: Array<{ key: FilterCategoryKey; label: string }> = [
  { key: 'status', label: 'Status' },
  { key: 'source', label: 'Source' },
  { key: 'roomType', label: 'Room Type' },
  { key: 'date', label: 'Date' },
  { key: 'payment', label: 'Payment Status' },
];

function countActiveFilters(filters: ReservationFilters): number {
  let count = 0;
  if (filters.status !== 'all') count += 1;
  if (filters.source !== 'all') count += 1;
  if (filters.date) count += 1;
  if (filters.roomType !== 'all') count += 1;
  if (filters.payment !== 'all') count += 1;
  return count;
}

function matchesDate(checkInDate: string, checkOutDate: string, dateFilter: string): boolean {
  if (!dateFilter) return true;
  const day = new Date(`${dateFilter}T00:00:00`);
  if (Number.isNaN(day.getTime())) return true;
  const ci = new Date(checkInDate);
  const co = new Date(checkOutDate);
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const cIn = new Date(ci.getFullYear(), ci.getMonth(), ci.getDate());
  const cOut = new Date(co.getFullYear(), co.getMonth(), co.getDate());
  return d >= cIn && d <= cOut;
}

export default function ReservationListPage() {
  const service = reservationService;
  const [searchParams, setSearchParams] = useSearchParams();
  const [applied, setApplied] = useState<ReservationFilters>(() => ({
    ...DEFAULT_FILTERS,
    date: searchParams.get('date') || '',
  }));
  const [draft, setDraft] = useState<ReservationFilters>(applied);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<FilterCategoryKey | null>(null);
  const [search, setSearch] = useState('');
  const [quickRange, setQuickRange] = useState<QuickRangeKey>('all');
  const [quickMonth, setQuickMonth] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const daftarRef = useRef<HTMLHeadingElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [mounted, setMounted] = useState(false);
  const filterWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const paramDate = searchParams.get('date') || '';
    setApplied((prev) => (prev.date === paramDate ? prev : { ...prev, date: paramDate }));
    setDraft((prev) => (prev.date === paramDate ? prev : { ...prev, date: paramDate }));
  }, [searchParams]);

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
    setDraft(applied);
    setActiveCategory(null);
    setFilterOpen(true);
  };

  const closeFilter = () => {
    setFilterOpen(false);
    setActiveCategory(null);
  };

  const applyFilters = () => {
    setApplied(draft);
    setSearchParams(draft.date ? { date: draft.date } : {}, { replace: true });
    setCurrentPage(1);
    closeFilter();
  };

  const resetFilters = () => {
    setDraft({ ...DEFAULT_FILTERS });
    setApplied({ ...DEFAULT_FILTERS });
    setSearchParams({}, { replace: true });
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    daftarRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  };

  const [reservations, setReservations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [allRooms, setAllRooms] = useState<Array<{ id: string; roomNumber: string; roomTypeId: string }>>([]);
  const [allTypes, setAllTypes] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');
    service.getAll().then((rows) => {
      if (!cancelled) {
        setReservations(rows);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setLoadError('Failed to load reservations');
        setIsLoading(false);
      }
    });
    roomService.getAll().then((rows) => {
      if (!cancelled) setAllRooms(rows);
    }).catch(() => {
      if (!cancelled) setAllRooms([]);
    });
    roomTypeService.getAll().then((rows) => {
      if (!cancelled) setAllTypes(rows);
    }).catch(() => {
      if (!cancelled) setAllTypes([]);
    });
    return () => {
      cancelled = true;
    };
  }, [showForm, service]);
  const invoiceByReservationId = useMemo(() => {
    return new Map(invoiceService.getAll().map((inv) => [inv.reservationId, inv]));
  }, []);

  const filteredReservations = useMemo(() => {
    const roomTypeByRoomId = new Map(allRooms.map((r) => [r.id, r.roomTypeId]));
    return reservations.filter((r) => {
      if (applied.source !== 'all' && r.source !== applied.source) return false;
      if (applied.status !== 'all' && r.status !== applied.status) return false;
      if (!matchesDate(r.checkInDate, r.checkOutDate, applied.date)) return false;
      if (!staysInRange(r.checkInDate, r.checkOutDate, quickRange, quickMonth)) return false;
      const matchesSearch = r.guestName.toLowerCase().includes(search.toLowerCase()) ||
        r.reservationCode.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;
      if (applied.roomType !== 'all') {
        const rooms = (r as any).rooms ?? [];
        const hasType = rooms.some((room: any) => roomTypeByRoomId.get(room.roomId) === applied.roomType);
        if (!hasType) return false;
      }
      if (applied.payment !== 'all') {
        const invoice = invoiceByReservationId.get(r.id);
        if (!invoice || invoice.paymentStatus !== applied.payment) return false;
      }
      return true;
    });
  }, [reservations, applied, search, quickRange, quickMonth, service, invoiceByReservationId, allRooms]);

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    reservations.forEach((r) => {
      months.add(r.checkInDate.substring(0, 7));
      months.add(r.checkOutDate.substring(0, 7));
    });
    return Array.from(months)
      .sort()
      .map((value) => ({ value, label: monthLabel(value) }));
  }, [reservations]);

  const totalPages = Math.max(1, Math.ceil(filteredReservations.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  // Pager stays mounted whenever more than one page exists so the page-size
  // selector (and page buttons) remain clickable after changing the size,
  // even when the result fits on a single page.
  const usePagination = totalPages > 1;
  const visibleReservations = usePagination
    ? filteredReservations.slice((safePage - 1) * pageSize, safePage * pageSize)
    : filteredReservations;

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { total: reservations.length };
    for (const s of STATUS_BARS.slice(1)) {
      counts[s.key] = reservations.filter((r) => r.status === s.key).length;
    }
    return counts;
  }, [reservations]);

  const activeFilterCount = countActiveFilters(applied);

  const isCategoryActive = (key: FilterCategoryKey, filters: ReservationFilters): boolean => {
    if (key === 'date') return filters.date !== '';
    return filters[key] !== 'all';
  };

  const categorySummary = (key: FilterCategoryKey, filters: ReservationFilters): string => {
    if (key === 'status') return filters.status === 'all' ? '' : (reservationStatusLabels[filters.status] || filters.status);
    if (key === 'source') return filters.source === 'all' ? '' : (reservationSourceLabels[filters.source] || filters.source);
    if (key === 'roomType') {
      if (filters.roomType === 'all') return '';
      return allTypes.find((t) => t.id === filters.roomType)?.name || '';
    }
    if (key === 'date') return filters.date;
    return filters.payment === 'all' ? '' : filters.payment;
  };

  const optionsForCategory = (key: FilterCategoryKey): Array<{ value: string; label: string }> => {
    if (key === 'status') {
      return [
        { value: 'all', label: 'All Status' },
        { value: 'reserved', label: 'Reserved' },
        { value: 'checked-in', label: 'Checked In' },
        { value: 'checked-out', label: 'Checked Out' },
        { value: 'cancelled', label: 'Cancelled' },
      ];
    }
    if (key === 'source') {
      return [
        { value: 'all', label: 'All Sources' },
        ...reservationSources.map((s) => ({ value: s, label: reservationSourceLabels[s] || s })),
      ];
    }
    if (key === 'roomType') {
      return [
        { value: 'all', label: 'All Room Types' },
        ...allTypes.map((rt) => ({ value: rt.id, label: rt.name })),
      ];
    }
    return [
      { value: 'all', label: 'All Payments' },
      ...paymentStatuses.map((p) => ({ value: p, label: p })),
    ];
  };

  const activeCategoryLabel = activeCategory
    ? FILTER_CATEGORIES.find((c) => c.key === activeCategory)?.label || ''
    : '';
  const maxCount = Math.max(1, ...Object.values(statusCounts));
  const chartSummary = `Distribusi reservasi. ${STATUS_BARS.map((s) => `${s.label} ${statusCounts[s.key] ?? 0}`).join(', ')}.`;

  return (
    <div style={{ padding: 'var(--space-xl, 20px)', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#232D36', fontFamily: 'var(--font-family-sans)', margin: 0 }}>Reservations</h1>
          <p style={{ color: '#6B7881', margin: '4px 0 0 0', fontSize: '14px' }}>Manage all reservations</p>
        </div>
        <Button onClick={() => setShowForm(true)}>+ New Reservation</Button>
      </div>

      <div className="res-toolbar" role="search">
        <div className="res-toolbar__filterwrap" ref={filterWrapRef}>
          <Button
            onClick={() => (filterOpen ? setFilterOpen(false) : openFilter())}
            aria-expanded={filterOpen}
            aria-controls="reservation-filter-panel"
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
                <div
                  className="res-cascade__panel1"
                  role="dialog"
                  aria-label="Reservation filters"
                >
                  <div className="res-cascade__head">
                    <h2 className="res-cascade__title">Filter</h2>
                    <button
                      type="button"
                      onClick={closeFilter}
                      aria-label="Close filters"
                      className="res-cascade__close"
                    >
                      <X size={18} aria-hidden="true" />
                    </button>
                  </div>
                  <ul className="res-cascade__cats">
                    {FILTER_CATEGORIES.map((cat) => {
                      const active = isCategoryActive(cat.key, draft);
                      const summary = categorySummary(cat.key, draft);
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
                      <button
                        type="button"
                        onClick={closeFilter}
                        aria-label="Close filters"
                        className="res-cascade__close"
                      >
                        <X size={18} aria-hidden="true" />
                      </button>
                    </div>
                    {activeCategory === 'date' ? (
                      <div className="res-cascade__datewrap">
                        <Input
                          label="Select date"
                          type="date"
                          value={draft.date}
                          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                        />
                        {draft.date && (
                          <button
                            type="button"
                            className="res-cascade__clearbtn"
                            onClick={() => setDraft({ ...draft, date: '' })}
                          >
                            Clear date
                          </button>
                        )}
                      </div>
                    ) : (
                      <ul className="res-cascade__opts">
                        {optionsForCategory(activeCategory).map((opt) => {
                          const selected = draft[activeCategory] === opt.value;
                          return (
                            <li key={opt.value}>
                              <button
                                type="button"
                                className="res-cascade__optbtn"
                                aria-pressed={selected}
                                onClick={() => setDraft({ ...draft, [activeCategory]: opt.value })}
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
                    )}
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
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            aria-label="Search reservations"
          />
        </div>
      </div>

      <section className="res-board" aria-labelledby="res-chart-title" style={{ marginBottom: '20px' }}>
        <h2 id="res-chart-title" className="res-board__title">Distribusi Reservasi</h2>
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

      <div className="res-daftarhead">
        <h2 ref={daftarRef} className="res-board__title" style={{ margin: 0, scrollMarginTop: '16px' }}>Daftar Reservasi</h2>
        <div className="res-qpills" role="group" aria-label="Quick date filter">
          {QUICK_RANGES.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => { setQuickRange(opt.key); setQuickMonth(''); setCurrentPage(1); }}
              aria-pressed={quickRange === opt.key}
              className={quickRange === opt.key ? 'res-qpill res-qpill--active' : 'res-qpill'}
            >
              {opt.label}
            </button>
          ))}
          <select
            className={`res-qmonth${quickRange === 'month' ? ' res-qmonth--active' : ''}`}
            aria-label="Filter by specific month"
            value={quickRange === 'month' ? quickMonth : ''}
            onChange={(e) => {
              const v = e.target.value;
              setQuickMonth(v);
              setQuickRange(v ? 'month' : 'all');
              setCurrentPage(1);
            }}
          >
            <option value="">Select month</option>
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="res-toolbar__meta">
        {usePagination
          ? `Showing ${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filteredReservations.length)} of ${filteredReservations.length} result(s)`
          : `${filteredReservations.length} result(s)`}
        {applied.date ? ` · filtered to ${applied.date}` : ''}
        {quickRange === 'month' && quickMonth ? ` · ${monthLabel(quickMonth)}` : ''}
        {activeFilterCount > 0 ? ` · ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'} active` : ''}
      </p>

      {loadError && <div role="alert" style={{ color: '#C85C5C', fontSize: '14px', marginBottom: '12px' }}>{loadError}</div>}

      <div className="res-list">
        {visibleReservations.map((reservation) => {
          const rooms = (reservation as any).rooms ?? [];
          return (
            <ReservationCard
              key={reservation.id}
              reservation={{
                ...reservation,
                rooms: rooms.map((r: any) => ({ roomNumber: r.roomNumber, roomTypeName: r.roomTypeName })),
                paymentStatus: invoiceByReservationId.get(reservation.id)?.paymentStatus,
              }}
            />
          );
        })}
      </div>

      {filteredReservations.length === 0 && (
        <Card style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: '#6B7881', fontSize: '14px' }}>{isLoading ? 'Loading reservations...' : 'No reservations found'}</p>
        </Card>
      )}

      {usePagination && (
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          totalItems={filteredReservations.length}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
        />
      )}

      {showForm && (
        <ReservationWizardModal open={showForm} onClose={() => setShowForm(false)} onSaved={() => setShowForm(false)} />
      )}
    </div>
  );
}
