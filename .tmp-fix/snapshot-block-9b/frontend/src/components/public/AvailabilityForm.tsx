import { useRef, useState, type FormEvent } from 'react';
import { CalendarDays } from 'lucide-react';
import { buildWhatsAppUrl, home } from '@/content/publicContent';

interface FormErrors {
  checkIn?: string;
  checkOut?: string;
}

/**
 * Availability request. Behaviour is unchanged from the previous Home page:
 * client-side validation, then a WhatsApp message is opened in a new tab.
 * No API call and no submission logic is added.
 */
export function AvailabilityForm() {
  const t = home.availability;
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [adults, setAdults] = useState('2');
  const [children, setChildren] = useState('0');
  const [errors, setErrors] = useState<FormErrors>({});
  const [showSummary, setShowSummary] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next: FormErrors = {};
    if (!checkIn) next.checkIn = t.errCheckIn;
    if (!checkOut) next.checkOut = t.errCheckOut;
    if (checkIn && checkOut && checkOut <= checkIn) next.checkOut = t.errOrder;
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setShowSummary(true);
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setShowSummary(false);
    const message = `Halo, saya ingin cek ketersediaan kamar. Check-in: ${checkIn}, Check-out: ${checkOut}, Dewasa: ${adults}, Anak: ${children}.`;
    window.open(buildWhatsAppUrl(message), '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="pub-avail" id="availability">
      <div className="pub-avail__head">
        <h2 className="pub-avail__title">{t.title}</h2>
        <p className="pub-avail__sub">{t.subtitle}</p>
      </div>
      {showSummary && Object.keys(errors).length > 0 && (
        <div className="pub-avail__summary" role="alert" tabIndex={-1} ref={summaryRef} aria-labelledby="av-error-title">
          <p id="av-error-title" className="pub-avail__summary-title">{t.errorTitle}</p>
          <ul>
            {errors.checkIn && (
              <li>
                <a href="#av-checkin">{t.checkIn}: {errors.checkIn}</a>
              </li>
            )}
            {errors.checkOut && (
              <li>
                <a href="#av-checkout">{t.checkOut}: {errors.checkOut}</a>
              </li>
            )}
          </ul>
        </div>
      )}
      <form className="pub-avail__form" onSubmit={handleSubmit} noValidate>
        <div className={`pub-field${errors.checkIn ? ' has-error' : ''}`}>
          <label htmlFor="av-checkin">{t.checkIn}</label>
          <input
            id="av-checkin"
            type="date"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            aria-invalid={Boolean(errors.checkIn)}
            aria-describedby={errors.checkIn ? 'av-checkin-error' : undefined}
          />
          {errors.checkIn && (
            <span className="pub-field__error" id="av-checkin-error">
              {errors.checkIn}
            </span>
          )}
        </div>
        <div className={`pub-field${errors.checkOut ? ' has-error' : ''}`}>
          <label htmlFor="av-checkout">{t.checkOut}</label>
          <input
            id="av-checkout"
            type="date"
            value={checkOut}
            min={checkIn || undefined}
            onChange={(e) => setCheckOut(e.target.value)}
            aria-invalid={Boolean(errors.checkOut)}
            aria-describedby={errors.checkOut ? 'av-checkout-error' : undefined}
          />
          {errors.checkOut && (
            <span className="pub-field__error" id="av-checkout-error">
              {errors.checkOut}
            </span>
          )}
        </div>
        <div className="pub-field">
          <label htmlFor="av-adults">{t.adults}</label>
          <select id="av-adults" value={adults} onChange={(e) => setAdults(e.target.value)}>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4+">4+</option>
          </select>
        </div>
        <div className="pub-field">
          <label htmlFor="av-children">{t.children}</label>
          <select id="av-children" value={children} onChange={(e) => setChildren(e.target.value)}>
            <option value="0">0</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4+">4+</option>
          </select>
        </div>
        <button type="submit" className="pub-btn pub-btn--primary pub-avail__submit">
          <CalendarDays size={20} aria-hidden="true" />
          {t.submit}
        </button>
      </form>
    </div>
  );
}
