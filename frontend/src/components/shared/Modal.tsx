import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import '../../styles/modal-responsive.css';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  titleAddon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
}

export function Modal({ open, onClose, title, titleAddon, children, footer, size = 'md', className = '' }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const widthMap: Record<string, string> = {
    sm: '400px',
    md: '560px',
    lg: '720px',
    xl: '900px',
    full: '100%',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(35,45,54,0.45)',
        animation: 'fadeIn 200ms ease',
        padding: '16px',
      }}
      onClick={onClose}
      className={`pms-modal-overlay ${className}`}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="pms-modal-dialog"
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #C7BBAB',
          boxShadow: '0 1px 2px rgba(35,45,54,0.12)',
          width: widthMap[size],
          maxWidth: '94vw',
          maxHeight: '85vh',
          overflow: 'auto',
          animation: 'scaleIn 200ms ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #C7BBAB',
          }}>
            <h2 style={{
              fontSize: '18px',
              fontWeight: 600,
              color: '#232D36',
              fontFamily: 'var(--font-family-sans)',
              margin: 0,
            }}>
              {title}
            </h2>
            {titleAddon && (
              <span style={{ display: 'inline-flex', marginLeft: 'auto', marginRight: '8px' }}>
                {titleAddon}
              </span>
            )}
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="pms-modal-close"
              style={{
                background: 'transparent',
                border: '1px solid transparent',
                borderRadius: '4px',
                cursor: 'pointer',
                color: '#6B7881',
                padding: '4px',
                lineHeight: 1,
                display: 'inline-flex',
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        )}
        <div style={{ padding: '20px' }}>
          {children}
        </div>
        {footer && (
          <div style={{
            padding: '16px 20px',
            borderTop: '1px solid #C7BBAB',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            flexWrap: 'wrap',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
