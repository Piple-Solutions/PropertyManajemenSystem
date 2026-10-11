import { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { Card } from './Card';
import { Input } from './Input';
import { Textarea } from './Textarea';
import { Select } from './Select';
import { Button } from './Button';
import { Badge } from './Badge';
import { Modal } from './Modal';
import { RoomSelector } from './RoomSelector';
import { ReservationPricingPanel } from './ReservationPricingPanel';
import { reservationSources, reservationSourceLabels } from '@/constants/reservationStatuses';
import { roomService } from '@/services/roomService';
import { roomTypeService } from '@/services/roomTypeService';
import type { ReservationPricingController } from '@/hooks/useReservationPricing';
import type { ReservationDraft, WizardStep } from '@/types/reservationDraft.types';
import { WIZARD_STEPS, countNights, isDraftDirty, validateStep1, validateStep2, type Step1Errors } from '@/types/reservationDraft.types';
import {
  applyRateToAllNights,
  buildNightlyRates,
  calculatePricing,
  enumerateNights,
  formatIDR,
  formatNightLong,
  validatePricing,
} from '@/utils/pricingUtils';
import { getBookedRoomIdsForRange, resolveReferenceRate } from '@/utils/reservationDraft';
import '../../styles/reservation-pricing.css';
import '../../styles/reservation-wizard.css';

interface ReservationWizardProps {
  initialDraft: ReservationDraft;
  isEdit?: boolean;
  excludeReservationId?: string;
  saving?: boolean;
  onSave: (draft: ReservationDraft) => void;
  onDiscard: () => void;
  /** Increment to trigger the guarded cancel flow (Modal X / overlay / Escape). */
  externalCloseRequest?: number;
}

function Stepper({ step, highestReached, onStepClick }: { step: WizardStep; highestReached: number; onStepClick: (s: WizardStep) => void }) {
  return (
    <div>
      <p className="wizard-compact" aria-live="polite">Step {step + 1} of 3 — {WIZARD_STEPS[step].label}</p>
      <div className="wizard-stepper" role="list" aria-label="Reservation steps">
        {WIZARD_STEPS.map((s, i) => {
          const status = i === step ? 'current' : (i < step || i <= highestReached) ? 'completed' : 'upcoming';
          const clickable = status === 'completed';
          return (
            <div key={s.key} style={{ display: 'flex', flex: 1, alignItems: 'flex-start' }} role="listitem">
              <button
                type="button"
                className={`wizard-step wizard-step--${status}`}
                disabled={!clickable}
                aria-current={status === 'current' ? 'step' : undefined}
                aria-label={`${s.label}${status === 'completed' ? ', completed' : status === 'current' ? ', current step' : ', upcoming'}`}
                onClick={() => clickable && onStepClick(i as WizardStep)}
              >
                <span className="wizard-step__dot" aria-hidden="true">
                  {status === 'completed' ? <Check size={16} aria-hidden="true" /> : i + 1}
                </span>
                <span className="wizard-step__label">{s.label}</span>
              </button>
              {i < WIZARD_STEPS.length - 1 && (
                <span className={`wizard-step__connector${i < step || i < highestReached ? ' wizard-step__connector--done' : ''}`} aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ReservationWizard({ initialDraft, isEdit = false, excludeReservationId, saving = false, onSave, onDiscard, externalCloseRequest = 0 }: ReservationWizardProps) {
  const [draft, setDraft] = useState<ReservationDraft>(() => ({
    ...initialDraft,
    roomIds: [...initialDraft.roomIds],
    pricing: { ...initialDraft.pricing, nightlyRates: initialDraft.pricing.nightlyRates.map((n) => ({ ...n })) },
  }));
  const [step, setStep] = useState<WizardStep>(0);
  const [highestReached, setHighestReached] = useState(0);
  const [step1Errors, setStep1Errors] = useState<Step1Errors & { notes?: string }>({});
  const [step2Error, setStep2Error] = useState<string | undefined>();
  const [step3Error, setStep3Error] = useState<string | undefined>();
  const [sourceError, setSourceError] = useState<string | undefined>();
  const [cancelStage, setCancelStage] = useState<null | 1 | 2>(null);
  const [roomTypeFilter, setRoomTypeFilter] = useState('all');
  const [pricingTouched, setPricingTouched] = useState(false);
  const [showDateNotice, setShowDateNotice] = useState(false);

  const initialRef = useRef<ReservationDraft>(initialDraft);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const prevNightDatesRef = useRef<string>('');
  const lastCloseRequest = useRef(externalCloseRequest);

  const nightDates = useMemo(() => enumerateNights(draft.checkInDate, draft.checkOutDate), [draft.checkInDate, draft.checkOutDate]);
  const nights = nightDates.length;
  const [allRooms, setAllRooms] = useState<Array<{ id: string; roomNumber: string; roomTypeId: string }>>([]);
  const [allTypes, setAllTypes] = useState<Array<{ id: string; name: string; defaultRate: number }>>([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([roomService.getAll(), roomTypeService.getAll()]).then(([r, t]) => {
      if (!cancelled) {
        setAllRooms(r);
        setAllTypes(t);
      }
    }).catch(() => {
      if (!cancelled) {
        setAllRooms([]);
        setAllTypes([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const roomById = useMemo(() => new Map(allRooms.map((r) => [r.id, r])), [allRooms]);
  const typeById = useMemo(() => new Map(allTypes.map((t) => [t.id, t])), [allTypes]);
  const { referenceRate, roomTypeName } = useMemo(
    () => resolveReferenceRate(draft.roomIds, allRooms as never, allTypes as never),
    [draft.roomIds, allRooms, allTypes],
  );
  const calc = useMemo(() => calculatePricing({ ...draft.pricing }), [draft.pricing]);
  const pricingValidation = useMemo(() => validatePricing(draft.pricing), [draft.pricing]);
  const dirty = useMemo(() => isDraftDirty(draft, initialRef.current), [draft]);
  const [bookedIds, setBookedIds] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    getBookedRoomIdsForRange(draft.checkInDate, draft.checkOutDate, excludeReservationId).then((ids) => {
      if (!cancelled) setBookedIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [draft.checkInDate, draft.checkOutDate, excludeReservationId]);
  const selectedBooked = useMemo(() => draft.roomIds.filter((id) => bookedIds.includes(id)), [draft.roomIds, bookedIds]);

  // Keep nightly rows in sync with dates without losing per-date edits.
  // Reference rate only seeds NEW dates — never overwrites admin-entered rates.
  const datesInitRef = useRef(false);
  useEffect(() => {
    const key = nightDates.join(',');
    if (!datesInitRef.current) {
      datesInitRef.current = true;
      prevNightDatesRef.current = key;
      return;
    }
    if (prevNightDatesRef.current === key) return;
    const hadManualRates = pricingTouched;
    prevNightDatesRef.current = key;
    setDraft((prev) => {
      const fallback =
        prev.pricing.mode === 'same' && prev.pricing.sameRate > 0
          ? prev.pricing.sameRate
          : prev.pricing.nightlyRates.length > 0
            ? prev.pricing.nightlyRates[0].rate
            : referenceRate > 0
              ? referenceRate
              : 0;
      const next = buildNightlyRates(nightDates, fallback, prev.pricing.nightlyRates);
      return { ...prev, pricing: { ...prev.pricing, nightlyRates: next } };
    });
    if (hadManualRates && key !== '') setShowDateNotice(true);
  }, [nightDates.join(',')]);

  const requestCancel = () => {
    if (!dirty) {
      onDiscard();
      return;
    }
    setCancelStage(1);
  };

  useEffect(() => {
    if (externalCloseRequest !== lastCloseRequest.current) {
      lastCloseRequest.current = externalCloseRequest;
      if (externalCloseRequest > 0) requestCancel();
    }
  }, [externalCloseRequest]);

  const focusSummary = () => {
    window.setTimeout(() => errorSummaryRef.current?.focus(), 50);
  };

  // Adapter so Step 3 reuses the proven pricing panel with the single shared draft.
  const pricingController = useMemo((): ReservationPricingController => {
    const touch = () => setPricingTouched(true);
    const patch = (p: Partial<ReservationDraft['pricing']>) => {
      touch();
      setShowDateNotice(false);
      setDraft((prev) => ({ ...prev, pricing: { ...prev.pricing, ...p } }));
    };
    const noop = () => {};
    return {
      pricing: draft.pricing,
      setPricing: noop as never,
      nightDates,
      calc,
      validation: pricingValidation,
      setMode: ((mode: ReservationDraft['pricing']['mode']) => {
        touch();
        setDraft((prev) => {
          if (prev.pricing.mode === mode) return prev;
          if (mode === 'same') {
            const seed = prev.pricing.nightlyRates.length > 0 ? prev.pricing.nightlyRates[0].rate : prev.pricing.sameRate || referenceRate || 0;
            return { ...prev, pricing: { ...prev.pricing, mode, sameRate: seed, nightlyRates: applyRateToAllNights(prev.pricing.nightlyRates.map((n) => n.date), seed) } };
          }
          return { ...prev, pricing: { ...prev.pricing, mode } };
        });
      }) as never,
      setSameRate: ((rate: number) => {
        const safe = Number.isFinite(rate) && rate >= 0 ? Math.round(rate) : 0;
        touch();
        setDraft((prev) => ({
          ...prev,
          pricing: {
            ...prev.pricing,
            sameRate: safe,
            nightlyRates: prev.pricing.mode === 'same' ? applyRateToAllNights(prev.pricing.nightlyRates.map((n) => n.date), safe) : prev.pricing.nightlyRates,
          },
        }));
      }) as never,
      setNightRate: ((date: string, rate: number) => {
        const safe = Number.isFinite(rate) && rate >= 0 ? Math.round(rate) : 0;
        touch();
        setDraft((prev) => ({ ...prev, pricing: { ...prev.pricing, nightlyRates: prev.pricing.nightlyRates.map((n) => (n.date === date ? { ...n, rate: safe } : n)) } }));
      }) as never,
      applyToAllNights: ((rate: number) => {
        const safe = Number.isFinite(rate) && rate >= 0 ? Math.round(rate) : 0;
        touch();
        setDraft((prev) => ({ ...prev, pricing: { ...prev.pricing, nightlyRates: applyRateToAllNights(prev.pricing.nightlyRates.map((n) => n.date), safe) } }));
      }) as never,
      setPaymentType: ((t: ReservationDraft['pricing']['paymentType']) => patch({ paymentType: t })) as never,
      setDpType: ((t: ReservationDraft['pricing']['dpType']) => patch({ dpType: t })) as never,
      setDpPercentage: ((pct: number) => patch({ dpPercentage: Number.isFinite(pct) ? pct : 0 })) as never,
      setDpFixedAmount: ((amount: number) => patch({ dpFixedAmount: Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : 0 })) as never,
    };
  }, [draft.pricing, nightDates, calc, pricingValidation, referenceRate]);

  const applyReferenceRate = () => {
    setPricingTouched(true);
    setDraft((prev) => ({
      ...prev,
      pricing: {
        ...prev.pricing,
        sameRate: prev.pricing.mode === 'same' ? referenceRate : prev.pricing.sameRate,
        nightlyRates: applyRateToAllNights(prev.pricing.nightlyRates.map((n) => n.date), referenceRate),
      },
    }));
  };

  const goTo = (target: WizardStep) => {
    setStep3Error(undefined);
    if (target === step) return;
    if (target < step || target <= highestReached) {
      setStep(target);
      return;
    }
    // Forward navigation always validates the current step first.
    if (target === step + 1) handleContinue();
  };

  const handleContinue = () => {
    if (step === 0) {
      const errors = validateStep1(draft);
      setStep1Errors(errors);
      if (Object.keys(errors).length > 0) {
        focusSummary();
        return;
      }
      setStep(1);
      setHighestReached((h) => Math.max(h, 1));
    } else if (step === 1) {
      if (nights === 0) {
        setStep2Error('Check-in / check-out produces no nights. Go back to Step 1 and fix the dates.');
        focusSummary();
        return;
      }
      const roomErr = validateStep2(draft);
      if (selectedBooked.length > 0) {
        setStep2Error(`Selected room(s) are booked for these dates: ${selectedBooked.map((id) => roomById.get(id)?.roomNumber || id).join(', ')}. Deselect them to continue.`);
        focusSummary();
        return;
      }
      if (roomErr.roomIds) {
        setStep2Error(roomErr.roomIds);
        focusSummary();
        return;
      }
      setStep2Error(undefined);
      setStep(2);
      setHighestReached((h) => Math.max(h, 2));
    }
  };

  const handleSave = () => {
    if (!draft.source) {
      setSourceError('Rate source is required.');
      setStep3Error('Select a rate source before saving.');
      focusSummary();
      return;
    }
    setSourceError(undefined);
    if (!pricingValidation.isValid) {
      setStep3Error('Fix the highlighted pricing fields before saving.');
      focusSummary();
      return;
    }
    if (nights === 0) {
      setStep3Error('No nights in range. Go back to Step 1 and fix the dates.');
      focusSummary();
      return;
    }
    setStep3Error(undefined);
    onSave(draft);
  };

  const toggleRoom = (roomId: string) => {
    setStep2Error(undefined);
    setDraft((prev) => ({
      ...prev,
      roomIds: prev.roomIds.includes(roomId) ? prev.roomIds.filter((id) => id !== roomId) : [...prev.roomIds, roomId],
    }));
  };

  const selectedRoomLabels = draft.roomIds.map((id) => {
    const room = roomById.get(id);
    const rt = room?.roomTypeId ? typeById.get(room.roomTypeId) : undefined;
    return { id, number: room?.roomNumber || id, type: rt?.name || '' };
  });

  const step1ErrorList = Object.entries(step1Errors).filter(([, v]) => !!v) as Array<[string, string]>;
  const showStep1Summary = step1ErrorList.length > 0;
  const roomTypeOptions = allTypes.map((rt) => ({ value: rt.id, label: rt.name }));

  return (
    <div>
      <Stepper step={step} highestReached={highestReached} onStepClick={goTo} />

      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {showStep1Summary && (
            <div ref={errorSummaryRef} tabIndex={-1} role="alert" aria-labelledby="wiz-s1-title" className="wizard-error-summary">
              <h3 id="wiz-s1-title">There is a problem</h3>
              <ul>
                {step1ErrorList.map(([field, msg]) => (
                  <li key={field}><a href={`#wiz-field-${field}`}>{msg}</a></li>
                ))}
              </ul>
            </div>
          )}
          <Card title="Guest Information">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
              <div id="wiz-field-guestName">
                <Input
                  label="Guest Name"
                  placeholder="Enter guest name"
                  value={draft.guestName}
                  onChange={(e) => { setDraft((p) => ({ ...p, guestName: e.target.value })); setStep1Errors((p) => ({ ...p, guestName: undefined })); }}
                  error={!!step1Errors.guestName}
                  errorMessage={step1Errors.guestName}
                />
              </div>
            </div>
          </Card>

          <Card title="Stay Dates">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
              <div id="wiz-field-checkInDate">
                <Input
                  label="Check-in"
                  type="date"
                  value={draft.checkInDate}
                  onChange={(e) => { setDraft((p) => ({ ...p, checkInDate: e.target.value })); setStep1Errors((p) => ({ ...p, checkInDate: undefined, checkOutDate: undefined })); }}
                  error={!!step1Errors.checkInDate}
                  errorMessage={step1Errors.checkInDate}
                />
              </div>
              <div id="wiz-field-checkOutDate">
                <Input
                  label="Check-out"
                  type="date"
                  value={draft.checkOutDate}
                  onChange={(e) => { setDraft((p) => ({ ...p, checkOutDate: e.target.value })); setStep1Errors((p) => ({ ...p, checkOutDate: undefined })); }}
                  error={!!step1Errors.checkOutDate}
                  errorMessage={step1Errors.checkOutDate}
                />
              </div>
            </div>
            <div style={{ marginTop: '12px' }}>
              <Badge variant={nights > 0 ? 'info' : 'default'}>{nights > 0 ? `${nights} Night${nights === 1 ? '' : 's'}` : 'Select dates'}</Badge>
              {nights > 0 && (
                <span style={{ marginLeft: '8px', fontSize: '13px', color: '#6B7881' }}>
                  {formatNightLong(nightDates[0])} — {formatNightLong(draft.checkOutDate)}
                </span>
              )}
            </div>
          </Card>

          <Card title="Notes">
            <div id="wiz-field-notes">
              <Textarea
                label="Notes"
                hint="Optional"
                rows={4}
                placeholder="Special requests, guest notes, internal notes..."
                value={draft.notes}
                onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
                error={!!step1Errors.notes}
                errorMessage={step1Errors.notes}
              />
            </div>
          </Card>

          <div className="wizard-footer">
            <div className="wizard-footer__group">
              <Button type="button" variant="outline" onClick={requestCancel}>Cancel</Button>
            </div>
            <div className="wizard-footer__group">
              <Button type="button" onClick={handleContinue}>Save & Continue →</Button>
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {(step2Error) && (
            <div ref={errorSummaryRef} tabIndex={-1} role="alert" aria-labelledby="wiz-s2-title" className="wizard-error-summary">
              <h3 id="wiz-s2-title">There is a problem</h3>
              <ul><li>{step2Error}</li></ul>
            </div>
          )}
          <Card title="Stay Summary">
            <p style={{ margin: 0, fontSize: '14px', color: '#232D36' }}>
              <strong>{draft.guestName || '—'}</strong>
              {' · '}
              {nights > 0 ? `${formatNightLong(nightDates[0])} — ${formatNightLong(draft.checkOutDate)} · ${countNights(draft.checkInDate, draft.checkOutDate)} night(s)` : 'Dates not set'}
            </p>
          </Card>

          <Card title="Room Selection">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '12px' }}>
              <Select
                label="Room Type"
                value={roomTypeFilter}
                onChange={(e) => setRoomTypeFilter(e.target.value)}
                options={[{ value: 'all', label: 'All Room Types' }, ...roomTypeOptions]}
              />
            </div>
            <RoomSelector
              selectedRooms={draft.roomIds}
              onRoomToggle={toggleRoom}
              unavailableRoomIds={bookedIds}
              roomTypeFilter={roomTypeFilter}
            />
            {selectedRoomLabels.length > 0 && (
              <p style={{ margin: '12px 0 0 0', fontSize: '13px', color: '#232D36' }}>
                Selected: <strong>{selectedRoomLabels.map((r) => `Room ${r.number}${r.type ? ` (${r.type})` : ''}`).join(', ')}</strong>
              </p>
            )}
          </Card>

          <div className="wizard-footer">
            <div className="wizard-footer__group">
              <Button type="button" variant="outline" onClick={requestCancel}>Cancel</Button>
            </div>
            <div className="wizard-footer__group">
              <Button type="button" variant="outline" onClick={() => setStep(0)}>← Back</Button>
              <Button type="button" onClick={handleContinue}>Save & Continue →</Button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {step3Error && (
            <div ref={errorSummaryRef} tabIndex={-1} role="alert" aria-labelledby="wiz-s3-title" className="wizard-error-summary">
              <h3 id="wiz-s3-title">There is a problem</h3>
              <ul><li>{step3Error}</li></ul>
            </div>
          )}
          {showDateNotice && (
            <div className="wizard-notice" role="status">
              Dates changed — nightly rows were regenerated and your per-night edits were preserved where dates still overlap. Please review the rates below.
            </div>
          )}

          <Card title="Rate Source">
            <div style={{ maxWidth: '360px' }}>
              <Select
                label="Rate Source"
                value={draft.source}
                onChange={(e) => { setDraft((p) => ({ ...p, source: e.target.value })); setSourceError(undefined); }}
                options={reservationSources.map((s) => ({ value: s, label: reservationSourceLabels[s] || s }))}
                error={!!sourceError}
              />
              {!!sourceError && <span style={{ fontSize: '12px', color: '#962222' }}>{sourceError}</span>}
            </div>
          </Card>

          <ReservationPricingPanel
            controller={pricingController}
            referenceRate={referenceRate}
            roomTypeName={roomTypeName}
            rateSource={draft.source}
            onApplyReferenceRate={referenceRate > 0 ? applyReferenceRate : undefined}
          />

          <Card title="Review & Save">
            <div className="wizard-review-grid">
              <div>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6B7881', textTransform: 'uppercase' }}>Guest</h4>
                <p style={{ margin: '0 0 8px 0', fontWeight: 600 }}>{draft.guestName || '—'}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => setStep(0)}>Edit Guest & Date</Button>
              </div>
              <div>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6B7881', textTransform: 'uppercase' }}>Stay</h4>
                <p style={{ margin: '0 0 8px 0', fontWeight: 600 }}>
                  {nights > 0 ? `${formatNightLong(nightDates[0])} — ${formatNightLong(draft.checkOutDate)} · ${nights} night(s)` : '—'}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={() => setStep(0)}>Edit Dates</Button>
              </div>
              <div>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6B7881', textTransform: 'uppercase' }}>Room</h4>
                <p style={{ margin: '0 0 8px 0', fontWeight: 600 }}>
                  {selectedRoomLabels.length > 0 ? selectedRoomLabels.map((r) => `Room ${r.number}${r.type ? ` (${r.type})` : ''}`).join(', ') : '—'}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={() => setStep(1)}>Edit Room</Button>
              </div>
              <div>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6B7881', textTransform: 'uppercase' }}>Payment</h4>
                <p style={{ margin: '0 0 8px 0', fontWeight: 600 }}>
                  {formatIDR(calc.roomTotal)} total · {draft.pricing.paymentType === 'dp' ? `DP ${formatIDR(calc.dpAmount)} · Remaining ${formatIDR(calc.remainingBalance)}` : `No DP · Remaining ${formatIDR(calc.remainingBalance)}`}
                </p>
              </div>
            </div>
          </Card>

          <div className="wizard-footer">
            <div className="wizard-footer__group">
              <Button type="button" variant="outline" onClick={requestCancel}>Cancel</Button>
            </div>
            <div className="wizard-footer__group">
              <Button type="button" variant="outline" onClick={() => setStep(1)}>← Back</Button>
              <Button type="button" onClick={handleSave} loading={saving}>{isEdit ? 'Save Changes' : 'Save Reservation'}</Button>
            </div>
          </div>
        </div>
      )}

      <Modal open={cancelStage === 1} onClose={() => setCancelStage(null)} title="Cancel Reservation?" size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelStage(null)}>Keep Editing</Button>
            <Button onClick={() => setCancelStage(2)}>Continue</Button>
          </>
        }>
        <p style={{ margin: 0, fontSize: '14px', color: '#6B7881', lineHeight: 1.6 }}>
          You have entered reservation information. Are you sure you want to cancel?
        </p>
      </Modal>

      <Modal open={cancelStage === 2} onClose={() => setCancelStage(1)} title="Are you absolutely sure?" size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelStage(1)}>Go Back</Button>
            <Button variant="danger" onClick={() => { setCancelStage(null); onDiscard(); }}>Discard Reservation</Button>
          </>
        }>
        <p style={{ margin: 0, fontSize: '14px', color: '#6B7881', lineHeight: 1.6 }}>
          All entered reservation information will be discarded. This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
