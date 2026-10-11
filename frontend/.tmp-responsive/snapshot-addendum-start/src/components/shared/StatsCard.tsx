import type { ReactNode } from 'react';
import { Card } from './Card';

interface StatsCardProps {
  label: string;
  value: number | string;
  icon: ReactNode;
  color?: string;
  subtitle?: string;
}

export function StatsCard({ label, value, icon, color = '#232D36', subtitle }: StatsCardProps) {
  return (
    <Card style={{ textAlign: 'center' }}>
      <div style={{ marginBottom: '8px', color, display: 'flex', justifyContent: 'center' }} aria-hidden="true">{icon}</div>
      <div style={{ fontSize: '28px', fontWeight: 700, color: '#232D36', marginBottom: '4px', fontFamily: 'var(--font-family-sans)' }}>{value}</div>
      <div style={{ fontSize: '14px', fontWeight: 600, color: '#232D36' }}>{label}</div>
      {subtitle && <div style={{ fontSize: '12px', color: '#6B7881', marginTop: '4px' }}>{subtitle}</div>}
    </Card>
  );
}
