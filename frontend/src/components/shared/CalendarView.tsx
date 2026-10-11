import { useEffect, useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
} from 'date-fns';
import { reservationService, type ApiCalendarEntry } from '@/services/reservationService';
import { holidayService, type HolidayDay } from '@/services/holidayService';
import { Button } from './Button';
import { Card } from './Card';

interface CalendarViewProps {
  /** Month shown. Controlled by the page so navigation + deep links stay in sync. */
  month: Date;
  onMonthChange?: (month: Date) => void;
  filterRoomId?: string;
  filterStatus?: string;
  filterSearch?: string;
  onDateClick?: (date: Date) => void;
}

const statusFillMap: Record<string, { bg: string; text: string }> = {
  reserved: { bg: '#F0E7D3', text: '#7A5A1E' },
  'checked-in': { bg: '#E3EDE4', text: '#2F5D37' },
  'checked-out': { bg: '#DDE5EC', text: '#2F4A5E' },
  cancelled: { bg: '#F3DEDE', text: '#962222' },
};

/**
 * Holiday marker is a single 4px strip bar across the top of the day cell.
 * Colour is intentionally NOT per-kind: a national day off and an observance
 * both render red. The distinction still reaches the user through the `title`
 * tooltip, the `aria-label`, and the day popup badges (`Libur Nasional` /
 * `Perayaan` / `Cuti Bersama` / `Belum Pasti`).
 */
const HOLIDAY_BAR_COLOR = '#962222';
const HOLIDAY_BAR_HEIGHT = 8;

/**
 * Top padding for EVERY day cell, holiday or not. The strip bar is absolutely
 * positioned, so it paints above static content; this reserves space for it and
 * keeps the day number clear of the bar. Applied uniformly on purpose —
 * conditional padding would change row heights as holidays appear/disappear
 * during month navigation.
 */
const DAY_CELL_PADDING_TOP = HOLIDAY_BAR_HEIGHT + 4;

/** Monday-first, matching ReservationListPage's Indonesian weekday order. */
const dayNames = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

/**
 * How many blanks precede day 1 so that day 1 lands under its real weekday
 * column (Monday = column 0).
 */
function leadingBlankCount(firstOfMonth: Date): number {
  const jsDay = firstOfMonth.getDay(); // 0 = Sunday
  return (jsDay + 6) % 7;
}

function addDaysSafe(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** `YYYY-MM-DD` in LOCAL time — avoids the UTC shift of `toISOString()`. */
function toIso(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function CalendarView({
  month,
  onMonthChange,
  filterRoomId,
  filterStatus,
  filterSearch,
  onDateClick,
}: CalendarViewProps) {
  const [entries, setEntries] = useState<ApiCalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [holidays, setHolidays] = useState<Map<string, HolidayDay>>(new Map());
  const [holidaysAvailable, setHolidaysAvailable] = useState(true);
  /** Total holidays published for the whole year, to tell an empty year from an empty month. */
  const [holidaysYearCount, setHolidaysYearCount] = useState(0);
  const [showCutiBersama, setShowCutiBersama] = useState(true);

  const year = month.getFullYear();

  // Live reservation data for the visible month. Half-open range: the server
  // matches `checkInDate < to` AND `checkOutDate > from`, so `to` must be the
  // first day of the NEXT month to cover the final night.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const from = toIso(startOfMonth(month));
    const to = toIso(startOfMonth(addMonths(month, 1)));
    reservationService
      .getCalendar(from, to, { roomId: filterRoomId, status: filterStatus })
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month, filterRoomId, filterStatus]);

  // Holidays for the visible year. Fetched once per year — navigating months
  // within a year does not re-request (the backend caches per TTL window too).
  useEffect(() => {
    let cancelled = false;
    holidayService.getYear(year).then((payload) => {
      if (cancelled) return;
      if (!payload) {
        setHolidays(new Map());
        setHolidaysAvailable(false);
        setHolidaysYearCount(0);
        return;
      }
      setHolidaysAvailable(payload.available);
      setHolidaysYearCount(payload.days.length);
      setHolidays(holidayService.toDateMap(payload.days));
    });
    return () => {
      cancelled = true;
    };
  }, [year]);

  const filteredEntries = useMemo(() => {
    const q = (filterSearch || '').trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (r) => r.guestName.toLowerCase().includes(q) || r.reservationCode.toLowerCase().includes(q),
    );
  }, [entries, filterSearch]);

  const gridDays = useMemo(() => {
    const first = startOfMonth(month);
    const blanks = leadingBlankCount(first);
    const start = addDaysSafe(first, -blanks);
    const totalCells = Math.ceil((blanks + endOfMonth(month).getDate()) / 7) * 7;
    return eachDayOfInterval({ start, end: addDaysSafe(start, totalCells - 1) });
  }, [month]);

  const monthHolidays = useMemo(
    () =>
      Array.from(holidays.values()).filter(
        (h) => h.date.startsWith(`${year}-`) && Number(h.date.slice(5, 7)) === month.getMonth() + 1,
      ),
    [holidays, month, year],
  );

  const visibleMonthHolidays = useMemo(
    () => (showCutiBersama ? monthHolidays : monthHolidays.filter((h) => !h.isCutiBersama)),
    [monthHolidays, showCutiBersama],
  );

  const cutiBersamaCount = useMemo(
    () => monthHolidays.filter((h) => h.isCutiBersama).length,
    [monthHolidays],
  );

  /** Half-open overlap: a guest checks out on `checkOutDate`, so that day is free. */
  const entriesForDay = (day: Date) => {
    const key = toIso(day);
    return filteredEntries.filter((r) => r.checkInDate <= key && key < r.checkOutDate);
  };

  const monthLabel = format(month, 'MMMM yyyy');

  return (
    <div>
      <Card className="cal-card">
        <div className="cal-nav">
          <Button variant="outline" onClick={() => onMonthChange?.(addMonths(month, -1))}>← Prev</Button>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#232D36', fontFamily: 'var(--font-family-sans)' }}>
            {monthLabel}
          </h3>
          <Button variant="outline" onClick={() => onMonthChange?.(addMonths(month, 1))}>Next →</Button>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '14px',
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: '12px',
            fontSize: '12px',
            color: '#6B7881',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: '16px',
                height: HOLIDAY_BAR_HEIGHT,
                borderRadius: '2px',
                backgroundColor: HOLIDAY_BAR_COLOR,
              }}
            />
            Libur nasional &amp; Perayaan ({monthHolidays.length})
          </span>
          {cutiBersamaCount > 0 && (
            <label className="cal-legend__toggle" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showCutiBersama}
                onChange={(e) => setShowCutiBersama(e.target.checked)}
              />
              Cuti bersama ({cutiBersamaCount})
            </label>
          )}
          {/* Never fabricate holidays. Distinguish "upstream unreachable" from
              "that year has nothing published" from "quiet month". */}
          {!holidaysAvailable && <span>Holiday data unavailable for {year}.</span>}
          {holidaysAvailable && holidaysYearCount === 0 && (
            <span>No holiday data published for {year}.</span>
          )}
          {holidaysAvailable && holidaysYearCount > 0 && visibleMonthHolidays.length === 0 && (
            <span>No holidays this month.</span>
          )}
          {loading && <span>Loading reservations…</span>}
        </div>

        <div className="cal-scroll">
          <div className="cal-grid">
            {dayNames.map((day) => (
              <div key={day} className="cal-dayname" style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#6B7881', borderBottom: '1px solid #C7BBAB' }}>
                {day}
              </div>
            ))}
            {gridDays.map((day) => {
              const inMonth = isSameMonth(day, month);
              const isToday = isSameDay(day, new Date());
              const dayEntries = entriesForDay(day);
              const key = toIso(day);
              const holiday = holidays.get(key);
              const showHoliday = holiday && (showCutiBersama || !holiday.isCutiBersama);
              const holidayLabel = holiday
                ? `${holiday.name}${holiday.isTentative ? ' (belum pasti)' : ''}${
                    holiday.kind === 'observance' ? ' — observance, not a public holiday' : ''
                  }`
                : '';
              const label = `${key}, ${holidayLabel ? `${holidayLabel}. ` : ''}${
                dayEntries.length
              } reservation${dayEntries.length === 1 ? '' : 's'}`;

              return (
                <button
                  key={key}
                  type="button"
                  className="cal-cell"
                  title={holidayLabel || undefined}
                  onClick={() => onDateClick?.(day)}
                  aria-label={label}
                  style={{
                    padding: `${DAY_CELL_PADDING_TOP}px 4px 4px`,
                    border: isToday ? '2px solid #97764D' : '1px solid #C7BBAB',
                    borderRadius: '8px',
                    backgroundColor: inMonth ? '#FFFFFF' : '#EEEDE9',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'var(--font-family-sans)',
                    transition: 'border-color 150ms ease',
                    // Positioning context for the holiday strip bar; `hidden`
                    // clips that bar to the rounded corners. It clips content,
                    // not the focus outline, so focus styling is unaffected.
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.outline = '2px solid #97764D';
                    e.currentTarget.style.outlineOffset = '2px';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.outline = 'none';
                  }}
                >
                  {/* Painted before the day number so the strip sits behind the content. */}
                  {showHoliday && (
                    <span
                      data-testid="holiday-marker"
                      data-holiday-kind={holiday.kind}
                      data-holiday-name={holiday.name}
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: HOLIDAY_BAR_HEIGHT,
                        backgroundColor: HOLIDAY_BAR_COLOR,
                        borderRadius: '7px 7px 0 0',
                        // Let hover tooltips resolve to the parent button's
                        // `title` (which carries the full holiday label).
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                  <div style={{ marginBottom: '2px' }}>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: isToday ? 700 : 400,
                        color: inMonth ? '#232D36' : '#6B7881',
                      }}
                    >
                      {day.getDate()}
                    </span>
                  </div>
                  {/* Chips stack as blocks on tablet/desktop; below 768px the
                      stylesheet turns them into compact status dots. */}
                  <div className="cal-chips">
                    {dayEntries.slice(0, 3).map((r) => {
                      const fill = statusFillMap[r.status] || { bg: '#EEEDE9', text: '#232D36' };
                      return (
                        <div
                          key={r.id}
                          className="cal-chip"
                          title={`${r.reservationCode}`}
                          style={{ backgroundColor: fill.bg, color: fill.text }}
                        >
                          {r.reservationCode}
                        </div>
                      );
                    })}
                  </div>
                  {dayEntries.length > 3 && (
                    <div className="cal-more">
                      +{dayEntries.length - 3}
                      <span className="cal-more__sfx"> more</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}