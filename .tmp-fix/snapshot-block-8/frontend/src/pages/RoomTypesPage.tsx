import { useRef, useState } from 'react';
import { MessageCircle, Users } from 'lucide-react';
import { buildWhatsAppUrl, roomsPage } from '@/content/publicContent';
import { Accordion, ICONS, OrnamentDivider, PageCta, PageHero, PlaceholderMedia, Reveal, RoomSkeleton, usePageTitle, usePublicTone, useRoomTypes } from '@/components/public/kit';
import '../styles/public.css';

/** Room types are revealed in batches so a long catalog never inflates the DOM. */
const BATCH = 6;

export default function RoomTypesPage() {
  usePublicTone('dark');
  usePageTitle(roomsPage.title);

  const { rooms, loaded, sample } = useRoomTypes();
  const [limit, setLimit] = useState(BATCH);
  const countRef = useRef<HTMLParagraphElement>(null);
  const { list, included, rules } = roomsPage;

  const shown = rooms.slice(0, limit);
  const hasMore = rooms.length > shown.length;

  const showMore = () => {
    const next = limit + BATCH;
    setLimit(next);
    // The button disappears once everything is shown: keep keyboard focus on the status line.
    if (next >= rooms.length) window.setTimeout(() => countRef.current?.focus(), 0);
  };

  return (
    <>
      <PageHero id="rooms-title" content={roomsPage.hero} />

      {/* Room types */}
      <section className="pub-section" aria-labelledby="rooms-list-title">
        <div className="pub-container">
          <Reveal immediate className="pub-sh">
            <h2 id="rooms-list-title" className="pub-h2">
              {list.title}
            </h2>
          </Reveal>

          <Reveal as="ul" immediate className="pub-rooms pub-rooms--page">
            {!loaded && [0, 1, 2].map((i) => <RoomSkeleton key={i} />)}
            {loaded &&
              shown.map((room) => (
                <li className="pub-room" key={room.id}>
                  <PlaceholderMedia variant="card" label={list.photo} />
                  <div className="pub-room__body">
                    <h3 className="pub-h3">{room.name}</h3>
                    <p className="pub-room__cap">
                      <Users size={16} aria-hidden="true" />
                      {room.capacity} {list.capacity}
                    </p>
                    <p className="pub-room__desc">{room.description}</p>
                    <ul className="pub-chips" aria-label={`Fasilitas ${room.name}`}>
                      {room.facilities.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                    <p className="pub-room__price">
                      <strong>{room.price}</strong>
                      <span>{list.price}</span>
                    </p>
                    <a
                      className="pub-btn pub-btn--outline pub-room__cta"
                      href={buildWhatsAppUrl(list.askMessage.replace('{room}', room.name))}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle size={18} aria-hidden="true" />
                      {list.ask}
                      <span className="pub-sr">{room.name}</span>
                    </a>
                  </div>
                </li>
              ))}
          </Reveal>

          {/* Below the list on purpose: it appears after load and must not push the cards down. */}
          {loaded && sample ? <p className="pub-muted pub-listnote">{list.sampleNote}</p> : null}

          {loaded && rooms.length > BATCH ? (
            <div className="pub-more">
              <p ref={countRef} tabIndex={-1} className="pub-muted" aria-live="polite">
                {list.shown.replace('{shown}', String(shown.length)).replace('{total}', String(rooms.length))}
              </p>
              {hasMore ? (
                <button type="button" className="pub-btn pub-btn--outline" onClick={showMore}>
                  {list.more}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {/* Included in every room */}
      <section className="pub-section pub-section--warm" aria-labelledby="rooms-included-title">
        <div className="pub-container">
          <Reveal className="pub-sh">
            <h2 id="rooms-included-title" className="pub-h2">
              {included.title}
            </h2>
          </Reveal>
          <ul className="pub-highlights">
            {included.items.map((item, index) => {
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

      {/* House rules */}
      <section className="pub-section" aria-labelledby="rooms-rules-title">
        <div className="pub-container pub-faq">
          <Reveal className="pub-faq__head">
            <h2 id="rooms-rules-title" className="pub-h2">
              {rules.title}
            </h2>
            <p className="pub-body pub-muted">{rules.note}</p>
            <OrnamentDivider />
          </Reveal>
          <Reveal delay={1}>
            <Accordion items={rules.items} />
          </Reveal>
        </div>
      </section>

      <PageCta id="rooms-cta-title" content={roomsPage.cta} />
    </>
  );
}
