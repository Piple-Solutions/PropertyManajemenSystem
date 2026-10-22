import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MessageCircle, Quote, Users } from 'lucide-react';
import { buildWhatsAppUrl, home } from '@/content/publicContent';
import { AvailabilityForm } from '@/components/public/AvailabilityForm';
import { Accordion, ICONS, OrnamentDivider, PlaceholderMedia, Reveal, RoomSkeleton, usePageTitle, usePublicTone, useRoomTypes } from '@/components/public/kit';
import '../styles/public.css';

/**
 * Staged mount: 0 = hero only, 1 = first batch below the fold, 2 = everything.
 * Each step waits for the previous one to be painted (two frames), so the hero
 * commits first and no single task has to render the whole page (long tasks hurt
 * input latency on phones). A timer covers tabs where requestAnimationFrame is paused.
 */
function useStagedMount(stages: number): number {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (stage >= stages) return undefined;
    let done = false;
    let raf2 = 0;
    const advance = () => {
      if (done) return;
      done = true;
      setStage(stage + 1);
    };
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(advance);
    });
    const timer = window.setTimeout(advance, 400);
    return () => {
      done = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(timer);
    };
  }, [stage, stages]);
  return stage;
}

/** Stagger index for the entrance animation (CSS custom property). */
function step(n: number): CSSProperties {
  return { ['--pub-i' as string]: n } as CSSProperties;
}

export default function HomePage() {
  usePublicTone('dark');
  usePageTitle(home.title);
  const stage = useStagedMount(2);

  // Featured rooms: first three active room types (shared with the Rooms page).
  const { rooms: allRooms, loaded: roomsLoaded } = useRoomTypes();
  const rooms = allRooms.slice(0, 3);
  const { hero, highlights, about, facilities, gallery, testimonials, faq, cta } = home;

  return (
    <>
      {/* 1. Hero */}
      <section className="pub-hero" aria-labelledby="home-title">
        <div className="pub-hero__pattern" aria-hidden="true" />
        <div className="pub-container pub-hero__grid">
          <div className="pub-hero__copy">
            <p className="pub-eyebrow pub-enter" style={step(0)}>
              {hero.eyebrow}
            </p>
            <h1 id="home-title" className="pub-display">
              {hero.title}
            </h1>
            <p className="pub-lead">
              {hero.subtitle}
            </p>
            <div className="pub-actions pub-enter" style={step(3)}>
              <a
                className="pub-btn pub-btn--primary"
                href={buildWhatsAppUrl(hero.primaryMessage)}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle size={20} aria-hidden="true" />
                {hero.primaryCta}
              </a>
              <Link className="pub-btn pub-btn--outline-light" to="/rooms">
                {hero.secondaryCta}
              </Link>
            </div>
          </div>
          <div className="pub-hero__media pub-enter" style={step(2)} aria-hidden="true">
            <PlaceholderMedia variant="arch" label={hero.mediaLabel} />
          </div>
        </div>
      </section>

      {/* 2. Availability (overlaps the hero edge) */}
      <section className="pub-avail-wrap" aria-label={home.availability.title}>
        <div className="pub-container">
          <Reveal immediate>
            <AvailabilityForm />
          </Reveal>
        </div>
      </section>

      {stage < 2 && <div className="pub-fallback" style={{ minHeight: '100dvh' }} aria-hidden="true" />}
      {stage >= 1 && (
        <>
          {/* 3. Highlights */}
          <section className="pub-section pub-section--tight" aria-label="Sorotan">
            <div className="pub-container">
              <ul className="pub-highlights">
                {highlights.map((item, index) => {
                  const Icon = ICONS[item.icon];
                  return (
                    <Reveal as="li" delay={index} className="pub-highlight" key={item.title}>
                      <span className="pub-icon-chip" aria-hidden="true">
                        <Icon size={22} />
                      </span>
                      <p className="pub-highlight__title">{item.title}</p>
                      <p>{item.text}</p>
                    </Reveal>
                  );
                })}
              </ul>
            </div>
          </section>

          {/* 4. About teaser */}
          <section className="pub-section pub-section--sand" aria-labelledby="home-about-title">
            <div className="pub-container pub-about">
              <Reveal className="pub-about__copy">
                <p className="pub-eyebrow pub-eyebrow--dark">{about.eyebrow}</p>
                <h2 id="home-about-title" className="pub-h2">
                  {about.title}
                </h2>
                {about.paragraphs.map((p) => (
                  <p className="pub-body" key={p}>
                    {p}
                  </p>
                ))}
                <Link className="pub-link-arrow" to="/about">
                  {about.cta}
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
              </Reveal>
              <Reveal delay={2} className="pub-about__visual">
                <PlaceholderMedia variant="wide" />
                <div className="pub-about__card">
                  <p className="pub-about__card-title">{about.cardTitle}</p>
                  <p>{about.cardText}</p>
                </div>
              </Reveal>
            </div>
          </section>

          {/* 5. Featured rooms */}
          <section className="pub-section pub-section--warm" aria-labelledby="home-rooms-title">
            <div className="pub-container">
              <Reveal className="pub-sh">
                <h2 id="home-rooms-title" className="pub-h2">
                  {home.rooms.title}
                </h2>
                <p className="pub-body">{home.rooms.subtitle}</p>
              </Reveal>
              <Reveal as="ul" className="pub-rooms">
                {!roomsLoaded && [0, 1, 2].map((i) => <RoomSkeleton key={i} />)}
                {roomsLoaded && rooms.map((room) => (
                  <li className="pub-room" key={room.id}>
                    <PlaceholderMedia variant="card" label={hero.mediaLabel} />
                    <div className="pub-room__body">
                      <h3 className="pub-h3">
                        <Link to="/rooms">{room.name}</Link>
                      </h3>
                      <p className="pub-room__cap">
                        <Users size={16} aria-hidden="true" />
                        {room.capacity} {home.rooms.capacity}
                      </p>
                      <p className="pub-room__desc">{room.description}</p>
                      <ul className="pub-chips" aria-label={`Fasilitas ${room.name}`}>
                        {room.facilities.slice(0, 3).map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                        {room.facilities.length > 3 && <li>+{room.facilities.length - 3} {home.rooms.more}</li>}
                      </ul>
                      <p className="pub-room__price">
                        <strong>{room.price}</strong>
                        <span>{home.rooms.priceFrom}</span>
                      </p>
                    </div>
                  </li>
                ))}
              </Reveal>
              <div className="pub-center">
                <Link className="pub-btn pub-btn--primary" to="/rooms">
                  {home.rooms.all}
                </Link>
              </div>
            </div>
          </section>

        </>
      )}
      {stage >= 2 && (
        <>
          {/* 6. Facilities (varied tiles) */}
          <section className="pub-section" aria-labelledby="home-fac-title">
            <div className="pub-container">
              <Reveal className="pub-sh">
                <h2 id="home-fac-title" className="pub-h2">
                  {facilities.title}
                </h2>
                <p className="pub-body">{facilities.subtitle}</p>
              </Reveal>
              <ul className="pub-bento">
                {facilities.items.map((item, index) => {
                  const Icon = ICONS[item.icon];
                  return (
                    <Reveal
                      as="li"
                      delay={index % 3}
                      className={`pub-tile pub-tile--${item.tone} pub-tile--${index + 1}`}
                      key={item.title}
                    >
                      <span className="pub-icon-chip" aria-hidden="true">
                        <Icon size={22} />
                      </span>
                      <h3 className="pub-tile__title">{item.title}</h3>
                      <p>{item.text}</p>
                    </Reveal>
                  );
                })}
              </ul>
            </div>
          </section>

          {/* 7. Gallery preview */}
          <section className="pub-section pub-section--sand" aria-labelledby="home-gallery-title">
            <div className="pub-container">
              <Reveal className="pub-sh">
                <p className="pub-eyebrow pub-eyebrow--dark">{gallery.eyebrow}</p>
                <h2 id="home-gallery-title" className="pub-h2">
                  {gallery.title}
                </h2>
                <p className="pub-body">{gallery.subtitle}</p>
              </Reveal>
              <ul className="pub-gallery-grid">
                {gallery.tiles.map((tile, index) => (
                  <Reveal as="li" delay={index} className={`pub-gtile pub-gtile--${index + 1}`} key={tile.id}>
                    <PlaceholderMedia variant="fill" label={tile.label} />
                  </Reveal>
                ))}
              </ul>
              <div className="pub-center">
                <Link className="pub-link-arrow" to="/gallery">
                  {gallery.cta}
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </section>

          {/* 8. Testimonials */}
          <section className="pub-section pub-section--warm" aria-labelledby="home-quotes-title">
            <div className="pub-container">
              <Reveal className="pub-sh">
                <h2 id="home-quotes-title" className="pub-h2">
                  {testimonials.title}
                </h2>
                <p className="pub-body pub-muted">{testimonials.note}</p>
              </Reveal>
              <Reveal as="ul" className="pub-quotes">
                {testimonials.items.map((item, index) => (
                  <li className={`pub-quote pub-quote--${index + 1}`} key={item.who}>
                    <Quote size={26} aria-hidden="true" className="pub-quote__mark" />
                    <blockquote>{item.quote}</blockquote>
                    <p className="pub-quote__who">{item.who}</p>
                  </li>
                ))}
              </Reveal>
            </div>
          </section>

          {/* 9. FAQ */}
          <section className="pub-section" aria-labelledby="home-faq-title">
            <div className="pub-container pub-faq">
              <Reveal className="pub-faq__head">
                <h2 id="home-faq-title" className="pub-h2">
                  {faq.title}
                </h2>
                <OrnamentDivider />
              </Reveal>
              <Reveal delay={1}>
                <Accordion items={faq.items} />
              </Reveal>
            </div>
          </section>

          {/* 10. Closing CTA */}
          <section className="pub-cta" aria-labelledby="home-cta-title">
            <div className="pub-hero__pattern" aria-hidden="true" />
            <div className="pub-container pub-cta__inner">
              <Reveal>
                <p className="pub-eyebrow">{hero.eyebrow}</p>
                <h2 id="home-cta-title" className="pub-h2 pub-h2--light">
                  {cta.title}
                </h2>
                <p className="pub-lead">{cta.subtitle}</p>
              </Reveal>
              <Reveal delay={2} className="pub-actions">
                <a
                  className="pub-btn pub-btn--primary"
                  href={buildWhatsAppUrl(cta.primaryMessage)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle size={20} aria-hidden="true" />
                  {cta.primary}
                </a>
                <Link className="pub-btn pub-btn--outline-light" to="/contact">
                  {cta.secondary}
                </Link>
              </Reveal>
            </div>
          </section>
        </>
      )}
    </>
  );
}
