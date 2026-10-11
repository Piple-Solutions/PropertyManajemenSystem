import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import { reservationService, type ApiReservation } from '@/services/reservationService';
import { reservationPricingService } from '@/services/reservationPricingService';
import { roomTypeService } from '@/services/roomTypeService';
import { Button } from '@/components/shared/Button';
import { Badge } from '@/components/shared/Badge';
import { Card } from '@/components/shared/Card';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { reservationStatusLabels, reservationSourceLabels } from '@/constants/reservationStatuses';
import { ReservationWizardModal } from '@/components/shared/ReservationWizardModal';
import { ReservationPricingPanel } from '@/components/shared/ReservationPricingPanel';
import { calculatePricing } from '@/utils/pricingUtils';
import type { ReservationPricingController } from '@/hooks/useReservationPricing';

const statusVariantMap: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  reserved: 'warning',
  'checked-in': 'success',
  'checked-out': 'info',
  cancelled: 'danger',
};

export default function ReservationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const service = reservationService;
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [reservation, setReservation] = useState<ApiReservation | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setIsLoading(true);
    service.getFullById(id).then((r) => {
      if (!cancelled) {
        setReservation(r ?? null);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setReservation(null);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id, showEdit, service]);

  const rooms = useMemo(() => reservation?.rooms ?? [], [reservation]);
  const [allTypes, setAllTypes] = useState<Array<{ id: string; name: string; defaultRate: number }>>([]);

  useEffect(() => {
    let cancelled = false;
    roomTypeService.getAll().then((t) => {
      if (!cancelled) setAllTypes(t);
    }).catch(() => {
      if (!cancelled) setAllTypes([]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { referenceRate, roomTypeName } = useMemo(() => {
    let total = 0;
    const names = new Set<string>();
    const typeById = new Map(allTypes.map((t) => [t.id, t]));
    for (const r of rooms) {
      const rt = (r as unknown as { roomTypeId?: string }).roomTypeId
        ? typeById.get((r as unknown as { roomTypeId: string }).roomTypeId)
        : undefined;
      if (rt) {
        total += Number(rt.defaultRate) || 0;
        names.add(rt.name);
      } else if (r.roomTypeName) {
        names.add(r.roomTypeName);
      }
    }
    if (total === 0 && rooms.length > 0) {
      // Fallback: derive per-night reference from stored total when room-type lookup fails
      const nights = Math.max(
        1,
        Math.ceil((new Date(reservation?.checkOutDate || '').getTime() - new Date(reservation?.checkInDate || '').getTime()) / (1000 * 60 * 60 * 24)) || 1,
      );
      total = Math.round((reservation?.totalAmount || 0) / nights);
    }
    return {
      referenceRate: total,
      roomTypeName: names.size === 1 ? [...names][0] : names.size > 1 ? `${names.size} room types` : rooms[0]?.roomTypeName || '',
    };
  }, [rooms, reservation, allTypes]);

  const pricingState = useMemo(() => {
    if (!id || !reservation) return null;
    return reservationPricingService.getState(reservation, {
      checkInDate: reservation.checkInDate,
      checkOutDate: reservation.checkOutDate,
      referenceRate,
      rateSource: reservation.source,
    });
  }, [id, reservation, referenceRate]);

  const calc = useMemo(() => {
    if (!pricingState) return null;
    return calculatePricing(pricingState);
  }, [pricingState]);

  const readOnlyController = useMemo((): ReservationPricingController | null => {
    if (!pricingState || !calc) return null;
    const noop = () => {};
    return {
      pricing: pricingState,
      setPricing: noop as never,
      nightDates: pricingState.nightlyRates.map((n) => n.date),
      calc,
      validation: { nightlyErrors: {}, isValid: true },
      setMode: noop as never,
      setSameRate: noop as never,
      setNightRate: noop as never,
      applyToAllNights: noop as never,
      setPaymentType: noop as never,
      setDpType: noop as never,
      setDpPercentage: noop as never,
      setDpFixedAmount: noop as never,
    };
  }, [pricingState, calc]);

  if (isLoading) {
    return (
      <div style={{ padding: 'var(--space-xl, 20px)', textAlign: 'center' }}>
        <p style={{ color: '#6B7881' }}>Loading reservation...</p>
      </div>
    );
  }

  if (!reservation) {
    return (
      <div style={{ padding: 'var(--space-xl, 20px)', textAlign: 'center' }}>
        <h2 style={{ color: '#232D36', fontFamily: 'var(--font-family-sans)' }}>Reservation not found</h2>
        <Button onClick={() => navigate('/dashboard/reservations')}>Back to Reservations</Button>
      </div>
    );
  }

  const handleCheckIn = async () => {
    await service.checkIn(reservation.id);
    setConfirmAction(null);
    navigate(0);
  };

  const handleCheckOut = async () => {
    await service.checkOut(reservation.id);
    setConfirmAction(null);
    navigate(0);
  };

  const handleCancel = async () => {
    await service.cancel(reservation.id);
    setConfirmAction(null);
    navigate(0);
  };

  const displayTotal = calc?.roomTotal ?? reservation.totalAmount;

  return (
    <div style={{ padding: 'var(--space-xl, 20px)', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <Button variant="outline" onClick={() => navigate('/dashboard/reservations')}><ArrowLeft size={14} aria-hidden="true" /> Back</Button>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#232D36', fontFamily: 'var(--font-family-sans)', margin: 0 }}>
          {reservation.reservationCode}
        </h1>
        <div style={{ flex: '1 1 0', minWidth: '24px', maxWidth: '120px' }}></div>
      </div>

      <Card style={{ marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6B7881', textTransform: 'uppercase' }}>Guest</h4>
            <p style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#232D36' }}>{reservation.guestName}</p>
          </div>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6B7881', textTransform: 'uppercase' }}>Rate Source</h4>
            <p style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#232D36' }}>{reservationSourceLabels[reservation.source] || reservation.source}</p>
          </div>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6B7881', textTransform: 'uppercase' }}>Status</h4>
            <Badge variant={statusVariantMap[reservation.status] || 'default'}>{reservationStatusLabels[reservation.status]}</Badge>
          </div>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6B7881', textTransform: 'uppercase' }}>Room Total</h4>
            <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#232D36' }}>Rp {displayTotal.toLocaleString('id-ID')}</p>
          </div>
        </div>
      </Card>

      <Card title="Reservation Details" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6B7881', textTransform: 'uppercase' }}>Check-in</h4>
            <p style={{ margin: 0, fontSize: '14px', color: '#232D36' }}>{reservation.checkInDate}</p>
          </div>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6B7881', textTransform: 'uppercase' }}>Check-out</h4>
            <p style={{ margin: 0, fontSize: '14px', color: '#232D36' }}>{reservation.checkOutDate}</p>
          </div>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6B7881', textTransform: 'uppercase' }}>Nights</h4>
            <p style={{ margin: 0, fontSize: '14px', color: '#232D36' }}>
              {Math.ceil((new Date(reservation.checkOutDate).getTime() - new Date(reservation.checkInDate).getTime()) / (1000 * 60 * 60 * 24))}
            </p>
          </div>
        </div>
      </Card>

      <Card title="Notes" style={{ marginBottom: '16px' }}>
        <div
          style={{
            backgroundColor: '#F2F0EB',
            borderLeft: '3px solid #97764D',
            borderRadius: '0 8px 8px 0',
            padding: '12px 14px',
          }}
        >
          {reservation.notes && reservation.notes.trim() ? (
            <p style={{ margin: 0, fontSize: '14px', color: '#232D36', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {reservation.notes}
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: '14px', fontStyle: 'italic', color: '#6B7881' }}>
              No notes added.
            </p>
          )}
        </div>
      </Card>

      <Card title="Rooms" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {rooms.map((room) => {
            return (
              <div key={room.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderRadius: '8px', backgroundColor: '#FFFFFF', border: '1px solid #C7BBAB' }}>
                <div>
                  <span style={{ fontWeight: 600, color: '#232D36' }}>{room.roomNumber}</span>
                  <span style={{ marginLeft: '12px', fontSize: '13px', color: '#6B7881' }}>{room.roomTypeName}</span>
                </div>
                <span style={{ fontWeight: 700, color: '#232D36' }}>Rp {room.rate.toLocaleString('id-ID')}</span>
              </div>
            );
          })}
          {rooms.length === 0 && (
            <p style={{ margin: 0, fontSize: '14px', fontStyle: 'italic', color: '#6B7881' }}>No rooms assigned.</p>
          )}
        </div>
      </Card>

      {readOnlyController && (
        <div style={{ marginBottom: '16px' }}>
          <ReservationPricingPanel
            controller={readOnlyController}
            referenceRate={referenceRate}
            roomTypeName={roomTypeName}
            rateSource={reservation.source}
            readOnly
          />
        </div>
      )}

      <Card style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {reservation.status === 'reserved' && (
            <>
              <ConfirmDialog
                open={confirmAction === 'checkin'}
                onClose={() => setConfirmAction(null)}
                onConfirm={handleCheckIn}
                title="Confirm Check-In"
                message={`Are you sure you want to check in ${reservation.guestName}?`}
                confirmText="Check In"
              />
              <Button onClick={() => setConfirmAction('checkin')}>Check In</Button>
            </>
          )}
          {reservation.status === 'checked-in' && (
            <>
              <ConfirmDialog
                open={confirmAction === 'checkout'}
                onClose={() => setConfirmAction(null)}
                onConfirm={handleCheckOut}
                title="Confirm Check-Out"
                message={`Are you sure you want to check out ${reservation.guestName}?`}
                confirmText="Check Out"
              />
              <Button onClick={() => setConfirmAction('checkout')}>Check Out</Button>
            </>
          )}
          {reservation.status === 'reserved' && (
            <>
              <ConfirmDialog
                open={confirmAction === 'cancel'}
                onClose={() => setConfirmAction(null)}
                onConfirm={handleCancel}
                title="Cancel Reservation"
                message={`Are you sure you want to cancel this reservation for ${reservation.guestName}?`}
                confirmText="Cancel"
                destructive
              />
              <Button variant="danger" onClick={() => setConfirmAction('cancel')}>Cancel</Button>
            </>
          )}
          <Button variant="outline" aria-label="Edit reservation" onClick={() => setShowEdit(true)}><Pencil size={14} aria-hidden="true" /></Button>
        </div>
      </Card>

      {showEdit && (
        <ReservationWizardModal open={showEdit} id={reservation.id} onClose={() => setShowEdit(false)} onSaved={() => setShowEdit(false)} />
      )}
    </div>
  );
}
