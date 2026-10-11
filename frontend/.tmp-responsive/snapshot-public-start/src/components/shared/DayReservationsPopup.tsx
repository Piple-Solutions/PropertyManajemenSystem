import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { reservationService, type ApiCalendarEntry } from '@/services/reservationService';
import { holidayService, type HolidayDay } from '@/services/holidayService';
import { invoiceService } from '@/services/invoiceService';
import { reservationStatusLabels } from '@/constants/reservationStatuses';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

interface DayReservationsPopupProps {
  date: Date | null;
  filterRoomId?: string;
  filterStatus?: string;
  onClose: () => void;
  onViewAll: (date: Date) => void;
}

const statusVariantMap: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  reserved: 'warning',
  'checked-in': 'success',
  'checked-out': 'info',
  cancelled: 'danger',
};

export function formatPopupDate(date: Date): string {
  return format(date, 'd MMMM yyyy');
}

export function DayReservationsPopup({ date, filterRoomId, filterStatus, onClose, onViewAll }: DayReservationsPopupProps) {
  const open = date !== null;
  const [entries, setEntries] = useState<ApiCalendarEntry[]>([]);
  const [holiday, setHoliday] = useState<HolidayDay | null>(null);

  // Single-DAY range query instead of pulling every reservation on each open.
  // The backend rejects `to <= from`, so `to` is the following day.
  useEffect(() => {
    if (!open || !date) return;
    let cancelled = false;
    const day = format(date, 'yyyy-MM-dd');
    const next = new Date(date);
    next.setDate(next.getDate() + 1);

    reservationService
      .getCalendar(day, format(next, 'yyyy-MM-dd'), { roomId: filterRoomId, status: filterStatus })
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });

    holidayService.getYear(date.getFullYear()).then((payload) => {
      if (cancelled || !payload) return;
      setHoliday(holidayService.toDateMap(payload.days).get(day) ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [open, date, filterRoomId, filterStatus]);

  // Half-open overlap, matching the backend: checkout day is not occupied.
  const dayReservations = useMemo(() => {
    if (!date) return [];
    const key = format(date, 'yyyy-MM-dd');
    return entries.filter((r) => r.checkInDate <= key && key < r.checkOutDate);
  }, [entries, date]);

  const invoices = invoiceService.getAll();
  const invoiceByReservationId = new Map(invoices.map((inv) => [inv.reservationId, inv]));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={date ? `Reservations — ${formatPopupDate(date)}` : 'Reservations'}
      size="lg"
      footer={
        date ? (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={() => onViewAll(date)}>View All Reservations</Button>
          </div>
        ) : undefined
      }
    >
      {date && holiday && (
        <div
          data-testid="popup-holiday"
          style={{
            border: '1px solid #C7BBAB',
            borderRadius: '8px',
            padding: '10px 12px',
            marginBottom: '12px',
            backgroundColor: '#FFFFFF',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '14px', color: '#232D36' }}>{holiday.name}</strong>
            {holiday.kind === 'observance' ? (
              <Badge variant="default" size="sm">Perayaan</Badge>
            ) : (
              <Badge variant="danger" size="sm">Libur Nasional</Badge>
            )}
            {holiday.isCutiBersama && <Badge variant="warning" size="sm">Cuti Bersama</Badge>}
            {holiday.isTentative && <Badge variant="info" size="sm">Belum Pasti</Badge>}
          </div>
        </div>
      )}

      {date && dayReservations.length === 0 && (
        <EmptyState
          icon={<CalendarDays size={32} aria-hidden="true" />}
          title="No reservations for this date."
          description={`There are no reservations on ${formatPopupDate(date)}.`}
        />
      )}

      {date && dayReservations.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {dayReservations.map((r) => {
            const rooms = r.rooms ?? [];
            const invoice = invoiceByReservationId.get(r.id);
            return (
              <div
                key={r.id}
                style={{
                  border: '1px solid #C7BBAB',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  backgroundColor: '#FFFFFF',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <div>
                    <Link
                      to={`/dashboard/reservations/${r.id}`}
                      style={{ fontSize: '15px', fontWeight: 700, color: '#232D36', textDecoration: 'none', fontFamily: 'var(--font-family-sans)' }}
                    >
                      {r.reservationCode}
                    </Link>
                    <p style={{ margin: '2px 0 0 0', fontSize: '14px', color: '#232D36', fontWeight: 600 }}>{r.guestName}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <Badge variant={statusVariantMap[r.status] || 'default'}>
                      {reservationStatusLabels[r.status] || r.status}
                    </Badge>
                    {invoice && (
                      <Badge variant={invoice.paymentStatus === 'Paid' ? 'success' : invoice.paymentStatus === 'Overdue' ? 'danger' : invoice.paymentStatus === 'Pending' ? 'warning' : 'info'}>
                        {invoice.paymentStatus}
                      </Badge>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: '#6B7881' }}>
                  <span>
                    {rooms.length > 0
                      ? rooms.map((room) => `Room ${room.roomNumber} (${room.roomTypeName})`).join(', ')
                      : 'No rooms'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: '#6B7881', marginTop: '4px' }}>
                  <span>Check-in: {r.checkInDate}</span>
                  <span>Check-out: {r.checkOutDate}</span>
                  {invoice && <span>Invoice: {invoice.invoiceNumber}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}