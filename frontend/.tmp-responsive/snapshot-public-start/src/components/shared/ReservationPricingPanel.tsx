import { useState, type ReactNode } from 'react';
import { Card } from './Card';
import { Input } from './Input';
import { Button } from './Button';
import { Badge } from './Badge';
import type { ReservationPricingController } from '@/hooks/useReservationPricing';
import { formatIDR, formatNightLabel, formatNightLong, parseRupiahInput } from '@/utils/pricingUtils';
import { reservationSourceLabels } from '@/constants/reservationStatuses';
import '../../styles/reservation-pricing.css';

interface ReservationPricingPanelProps {
  controller: ReservationPricingController;
  referenceRate: number;
  roomTypeName?: string;
  rateSource: string;
  readOnly?: boolean;
  /** Wizard mode: explicit opt-in to overwrite actual rates with the reference rate. */
  onApplyReferenceRate?: () => void;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#6B7881', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {children}
    </h4>
  );
}

export function ReservationPricingPanel({
  controller,
  referenceRate,
  roomTypeName,
  rateSource,
  readOnly = false,
  onApplyReferenceRate,
}: ReservationPricingPanelProps) {
  const { pricing, calc, validation, setMode, setSameRate, setNightRate, applyToAllNights, setPaymentType, setDpType, setDpPercentage, setDpFixedAmount } = controller;
  const [bulkRateRaw, setBulkRateRaw] = useState('');

  const sourceLabel = reservationSourceLabels[rateSource] || rateSource || '—';

  if (readOnly) {
    return (
      <div className="pricing-panel">
        <Card title="Pricing Summary">
          <div className="pricing-grid-2">
            <div>
              <SectionLabel>Rate Source</SectionLabel>
              <p style={{ margin: 0, fontWeight: 600 }}>{sourceLabel}</p>
            </div>
            <div>
              <SectionLabel>Pricing Mode</SectionLabel>
              <p style={{ margin: 0, fontWeight: 600 }}>
                {pricing.mode === 'same' ? 'Same rate for all nights' : 'Different rate per night'}
              </p>
            </div>
            <div>
              <SectionLabel>Reference Rate</SectionLabel>
              <p style={{ margin: 0 }}>
                {formatIDR(referenceRate)} / night{roomTypeName ? ` · ${roomTypeName}` : ''}
              </p>
              <span className="pricing-hint">Reference only — admin decides the actual price.</span>
            </div>
            <div>
              <SectionLabel>Nights</SectionLabel>
              <p style={{ margin: 0, fontWeight: 600 }}>{calc.nights} night(s)</p>
            </div>
          </div>

          <div style={{ marginTop: '12px' }}>
            <SectionLabel>Actual Rates</SectionLabel>
            <div className="pricing-nightly-list">
              {pricing.nightlyRates.map((n) => (
                <div key={n.date} className="pricing-nightly-row">
                  <span className="pricing-nightly-row__date" style={{ fontWeight: 600 }}>
                    {formatNightLong(n.date)}
                  </span>
                  <span style={{ fontWeight: 700 }}>{formatIDR(n.rate)}</span>
                </div>
              ))}
              {pricing.nightlyRates.length === 0 && (
                <p style={{ color: '#6B7881', fontStyle: 'italic' }}>No nights in range.</p>
              )}
            </div>
          </div>
        </Card>

        <Card title="Payment">
          <div className="pricing-summary">
            <div className="pricing-summary__section">
              <div className="pricing-summary__row">
                <span>Room Total</span>
                <strong>{formatIDR(calc.roomTotal)}</strong>
              </div>
              <div className="pricing-summary__row">
                <span>Payment Term</span>
                <Badge variant={pricing.paymentType === 'dp' ? 'warning' : 'default'}>
                  {pricing.paymentType === 'dp' ? `DP — ${pricing.dpType === 'percentage' ? `${pricing.dpPercentage}%` : formatIDR(pricing.dpType === 'fixed' ? controller.pricing.dpFixedAmount : 0)}` : 'No DP'}
                </Badge>
              </div>
              {pricing.paymentType === 'dp' && (
                <div className="pricing-summary__row">
                  <span>DP Amount</span>
                  <strong>{formatIDR(calc.dpAmount)}</strong>
                </div>
              )}
            </div>
            <div className="pricing-summary__total">
              <div className="pricing-summary__row">
                <span>Remaining Balance</span>
                <strong style={{ fontSize: '18px' }}>{formatIDR(calc.remainingBalance)}</strong>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const bulkRateParsed = bulkRateRaw.trim() === '' ? NaN : parseRupiahInput(bulkRateRaw);

  return (
    <div className="pricing-panel">
      <Card title="Pricing">
        <div className="pricing-ref" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'baseline' }}>
            <span style={{ fontSize: '12px', color: '#6B7881', textTransform: 'uppercase', fontWeight: 700 }}>
              Reference Rate
            </span>
            <strong style={{ fontSize: '16px' }}>{formatIDR(referenceRate)} / night</strong>
            {roomTypeName && <span style={{ fontSize: '13px', color: '#6B7881' }}>{roomTypeName}</span>}
          </div>
          <span className="pricing-hint">Reference only — the admin decides the actual reservation price.</span>
          {onApplyReferenceRate && referenceRate > 0 && (
            <div style={{ marginTop: '8px' }}>
              <Button type="button" variant="outline" size="sm" onClick={onApplyReferenceRate}>
                Use reference rate ({formatIDR(referenceRate)})
              </Button>
            </div>
          )}
        </div>

        <fieldset style={{ border: 0, padding: 0, margin: '0 0 16px 0' }}>
          <legend style={{ fontSize: '12px', color: '#6B7881', textTransform: 'uppercase', fontWeight: 700, marginBottom: '8px' }}>
            Pricing Mode
          </legend>
          <div className="pricing-radio-group" role="radiogroup" aria-label="Pricing mode">
            <label className={`pricing-radio${pricing.mode === 'same' ? ' pricing-radio--active' : ''}`}>
              <input
                type="radio"
                name="pricing-mode"
                checked={pricing.mode === 'same'}
                onChange={() => setMode('same')}
              />
              Same rate for all nights
            </label>
            <label className={`pricing-radio${pricing.mode === 'different' ? ' pricing-radio--active' : ''}`}>
              <input
                type="radio"
                name="pricing-mode"
                checked={pricing.mode === 'different'}
                onChange={() => setMode('different')}
              />
              Different rate per night
            </label>
          </div>
        </fieldset>

        {pricing.mode === 'same' ? (
          <div>
            <Input
              label="Actual Rate (applies to every night)"
              type="text"
              inputMode="numeric"
              value={pricing.sameRate === 0 ? '' : String(pricing.sameRate)}
              placeholder="e.g. 450000"
              onChange={(e) => {
                const parsed = parseRupiahInput(e.target.value);
                setSameRate(Number.isNaN(parsed) ? 0 : parsed);
              }}
              error={!!validation.sameRateError}
              errorMessage={validation.sameRateError}
              aria-describedby="same-rate-hint"
            />
            <span id="same-rate-hint" className="pricing-hint">
              {pricing.sameRate > 0 ? `= ${formatIDR(pricing.sameRate)} / night` : 'Enter the admin-determined rate.'} Applied to all {calc.nights} night(s) automatically.
            </span>

            {pricing.nightlyRates.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <SectionLabel>Nightly Breakdown</SectionLabel>
                <div className="pricing-nightly-list">
                  {pricing.nightlyRates.map((n) => (
                    <div key={n.date} className="pricing-nightly-row">
                      <span style={{ fontWeight: 600 }}>{formatNightLong(n.date)}</span>
                      <span style={{ fontWeight: 700 }}>{formatIDR(n.rate)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '12px' }}>
              <div style={{ flex: '1 1 220px', minWidth: '200px' }}>
                <Input
                  label="Rate"
                  type="text"
                  inputMode="numeric"
                  value={bulkRateRaw}
                  placeholder="e.g. 450000"
                  onChange={(e) => setBulkRateRaw(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!Number.isNaN(bulkRateParsed)) applyToAllNights(bulkRateParsed);
                }}
                disabled={Number.isNaN(bulkRateParsed) || pricing.nightlyRates.length === 0}
              >
                Apply to all nights
              </Button>
            </div>
            {bulkRateRaw.trim() !== '' && !Number.isNaN(bulkRateParsed) && (
              <span className="pricing-hint" style={{ display: 'block', marginBottom: '12px' }}>
                Will set every night to {formatIDR(bulkRateParsed)}. You can then edit nights individually.
              </span>
            )}

            <SectionLabel>Nightly Rates ({calc.nights})</SectionLabel>
            <div className="pricing-nightly-list">
              {pricing.nightlyRates.map((n) => (
                <div key={n.date} className="pricing-nightly-row">
                  <div className="pricing-nightly-row__date">
                    <div style={{ fontWeight: 600 }}>{formatNightLong(n.date)}</div>
                    <div style={{ fontSize: '12px', color: '#6B7881' }}>{formatNightLabel(n.date)}</div>
                  </div>
                  <div className="pricing-nightly-row__input">
                    <Input
                      label={`Rate for ${formatNightLabel(n.date)}`}
                      type="text"
                      inputMode="numeric"
                      value={n.rate === 0 ? '' : String(n.rate)}
                      placeholder="0"
                      onChange={(e) => {
                        const parsed = parseRupiahInput(e.target.value);
                        setNightRate(n.date, Number.isNaN(parsed) ? 0 : parsed);
                      }}
                      error={!!validation.nightlyErrors[n.date]}
                      errorMessage={validation.nightlyErrors[n.date]}
                    />
                  </div>
                </div>
              ))}
              {pricing.nightlyRates.length === 0 && (
                <p style={{ color: '#6B7881', fontStyle: 'italic' }}>
                  Select a valid check-in / check-out range to edit nightly rates.
                </p>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card title="Payment Term">
        <fieldset style={{ border: 0, padding: 0, margin: '0 0 16px 0' }}>
          <legend style={{ fontSize: '12px', color: '#6B7881', textTransform: 'uppercase', fontWeight: 700, marginBottom: '8px' }}>
            Payment Term
          </legend>
          <div className="pricing-radio-group" role="radiogroup" aria-label="Payment term">
            <label className={`pricing-radio${pricing.paymentType === 'no_dp' ? ' pricing-radio--active' : ''}`}>
              <input
                type="radio"
                name="payment-term"
                checked={pricing.paymentType === 'no_dp'}
                onChange={() => setPaymentType('no_dp')}
              />
              No DP
            </label>
            <label className={`pricing-radio${pricing.paymentType === 'dp' ? ' pricing-radio--active' : ''}`}>
              <input
                type="radio"
                name="payment-term"
                checked={pricing.paymentType === 'dp'}
                onChange={() => setPaymentType('dp')}
              />
              DP
            </label>
          </div>
        </fieldset>

        {pricing.paymentType === 'dp' && (
          <>
            <fieldset style={{ border: 0, padding: 0, margin: '0 0 16px 0' }}>
              <legend style={{ fontSize: '12px', color: '#6B7881', textTransform: 'uppercase', fontWeight: 700, marginBottom: '8px' }}>
                DP Type
              </legend>
              <div className="pricing-radio-group" role="radiogroup" aria-label="DP type">
                <label className={`pricing-radio${pricing.dpType === 'percentage' ? ' pricing-radio--active' : ''}`}>
                  <input
                    type="radio"
                    name="dp-type"
                    checked={pricing.dpType === 'percentage'}
                    onChange={() => setDpType('percentage')}
                  />
                  Percentage
                </label>
                <label className={`pricing-radio${pricing.dpType === 'fixed' ? ' pricing-radio--active' : ''}`}>
                  <input
                    type="radio"
                    name="dp-type"
                    checked={pricing.dpType === 'fixed'}
                    onChange={() => setDpType('fixed')}
                  />
                  Fixed Amount
                </label>
              </div>
            </fieldset>

            {pricing.dpType === 'percentage' ? (
              <div>
                <Input
                  label="DP (%)"
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={String(pricing.dpPercentage)}
                  onChange={(e) => setDpPercentage(Number(e.target.value))}
                  error={!!validation.dpPercentageError}
                  errorMessage={validation.dpPercentageError}
                />
                <span className="pricing-hint">
                  {formatIDR(calc.roomTotal)} × {Number(pricing.dpPercentage) || 0}% = {formatIDR(calc.dpAmount)}
                </span>
              </div>
            ) : (
              <div>
                <Input
                  label="DP Amount (IDR)"
                  type="text"
                  inputMode="numeric"
                  value={pricing.dpFixedAmount === 0 ? '' : String(pricing.dpFixedAmount)}
                  placeholder="e.g. 500000"
                  onChange={(e) => {
                    const parsed = parseRupiahInput(e.target.value);
                    setDpFixedAmount(Number.isNaN(parsed) ? 0 : parsed);
                  }}
                  error={!!validation.dpFixedError}
                  errorMessage={validation.dpFixedError}
                />
                <span className="pricing-hint">Must not exceed {formatIDR(calc.roomTotal)}.</span>
              </div>
            )}
          </>
        )}
      </Card>

      <Card title="Payment Summary">
        <div className="pricing-summary">
          <div className="pricing-summary__section">
            <div className="pricing-summary__row">
              <span>Room Total ({calc.nights} night{calc.nights === 1 ? '' : 's'})</span>
              <strong>{formatIDR(calc.roomTotal)}</strong>
            </div>
            <div className="pricing-summary__row">
              <span>Payment Term</span>
              <span style={{ fontWeight: 600 }}>{pricing.paymentType === 'dp' ? 'DP' : 'No DP'}</span>
            </div>
            {pricing.paymentType === 'dp' ? (
              <>
                <div className="pricing-summary__row">
                  <span>DP {pricing.dpType === 'percentage' ? `(${Number(pricing.dpPercentage) || 0}%)` : '(Fixed)'}</span>
                  <strong>{formatIDR(calc.dpAmount)}</strong>
                </div>
              </>
            ) : (
              <div className="pricing-summary__row">
                <span>DP</span>
                <strong>{formatIDR(0)}</strong>
              </div>
            )}
          </div>
          <div className="pricing-summary__total">
            <div className="pricing-summary__row">
              <span>Remaining Balance</span>
              <strong style={{ fontSize: '18px' }}>{formatIDR(calc.remainingBalance)}</strong>
            </div>
          </div>
        </div>
        {!validation.isValid && (
          <p role="alert" style={{ color: '#962222', fontSize: '13px', marginTop: '12px' }}>
            Please fix the highlighted pricing fields before saving.
          </p>
        )}
      </Card>
    </div>
  );
}
