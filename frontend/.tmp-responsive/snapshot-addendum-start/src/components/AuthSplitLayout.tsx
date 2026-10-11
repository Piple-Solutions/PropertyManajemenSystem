import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AUTH_HERO_IMAGE, AUTH_HERO_ALT } from '../config/authVisual';

interface AuthSplitLayoutProps {
  heading: string;
  description: string;
  children: ReactNode;
  /** Caption shown over the visual placeholder (hidden when a real image is set). */
  visualTitle?: string;
  visualSubtitle?: string;
}

export function AuthSplitLayout({
  heading,
  description,
  children,
  visualTitle = 'Homestay Joglo Seruni Syariah',
  visualSubtitle = 'Kelola properti, reservasi, dan keuangan dalam satu tempat.',
}: AuthSplitLayoutProps) {
  return (
    <div className="auth-split">
      <div className="auth-panel">
        <div className="auth-panel-inner">
          <Link to="/" className="auth-brand" aria-label="Homestay Joglo Seruni Syariah — home">
            Homestay Joglo Seruni Syariah
          </Link>
          <h1 className="auth-heading">{heading}</h1>
          <p className="auth-description">{description}</p>
          {children}
        </div>
      </div>
      <div className="auth-visual" aria-hidden={AUTH_HERO_IMAGE ? undefined : 'true'}>
        {AUTH_HERO_IMAGE ? (
          <img src={AUTH_HERO_IMAGE} alt={AUTH_HERO_ALT} />
        ) : (
          <div className="auth-visual-placeholder">
            <div className="auth-visual-caption">
              <strong>{visualTitle}</strong>
              <span>{visualSubtitle}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
