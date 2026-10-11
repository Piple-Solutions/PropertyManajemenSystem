import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PublicShell } from '../layouts/PublicLayout';
import { usePublic } from '@/components/public/PublicContext';
import { nav, notFound } from '@/content/publicContent';
import { OrnamentDivider, usePageTitle } from '@/components/public/kit';
import '../styles/public.css';

function NotFoundContent() {
  const { markReady } = usePublic();
  usePageTitle(notFound.title);
  // No route fallback runs on this page, so tell the shell it can load header/footer now.
  useEffect(() => markReady(), [markReady]);

  const others = nav.filter((item) => item.to !== '/');

  return (
    <section className="pub-section pub-notfound" aria-labelledby="notfound-title">
      <div className="pub-container pub-notfound__inner">
        <p className="pub-notfound__code" aria-hidden="true">
          {notFound.code}
        </p>
        <h1 id="notfound-title" className="pub-h2 pub-notfound__title">
          {notFound.title}
        </h1>
        <p className="pub-body">{notFound.text}</p>
        <div className="pub-notfound__actions">
          <Link className="pub-btn pub-btn--primary" to="/">
            {notFound.home}
          </Link>
          <Link className="pub-btn pub-btn--outline" to="/rooms">
            {notFound.rooms}
          </Link>
        </div>
        <OrnamentDivider />
        <nav aria-label={notFound.linksTitle} className="pub-notfound__links">
          <ul>
            {others.map((item) => (
              <li key={item.to}>
                <Link className="pub-link-arrow" to={item.to}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}

/** Catch-all route page: it sits outside PublicLayout, so it renders the public shell itself. */
export default function NotFoundPage() {
  return (
    <PublicShell>
      <NotFoundContent />
    </PublicShell>
  );
}
