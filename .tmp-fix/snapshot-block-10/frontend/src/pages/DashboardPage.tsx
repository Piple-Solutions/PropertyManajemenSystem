import { useEffect, useMemo, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BedDouble,
  CalendarCheck,
  Check,
  ChevronRight,
  Clock,
  FileWarning,
  LayoutDashboard,
  Plus,
  Receipt,
  Wallet,
  X,
} from 'lucide-react';
import { reservationSourceLabels, reservationStatusLabels } from '@/constants/reservationStatuses';
import { usePermissions } from '@/hooks/usePermissions';
import { salesService } from '@/services/salesService';
import { invoiceService } from '@/services/invoiceService';
import { expenseService } from '@/services/expenseService';
import { dashboardService, type DashboardOverview, type DashboardRecentReservation } from '@/services/dashboardService';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { Expense, Invoice, Sale } from '@/types/auth.types';
import { Badge } from '@/components/shared/Badge';
import { Table } from '@/components/shared/Table';
import { shiftISODate, todayLocalISO } from '@/utils/localDate';
import '../styles/dashboard-modern.css';
import '../styles/reservation-list.css';

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function usePrefersReducedMotion(): boolean {
  return useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);
}

function useCountUp(target: number, format: (n: number) => string, duration = 800): string {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(() => (reduced ? target : 0));
  useEffect(() => {
    if (reduced) {
      setDisplay(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduced]);
  return format(display);
}

export default function DashboardPage() {
  // Visibility of Quick Actions and stat cards follows the logged-in user's
  // effective permissions — never the role. Each item maps to the existing
  // page it opens and the permission that page already requires.
  const { hasPermission } = usePermissions();
  // Server-computed reservation + room aggregates (single overview call).
  // Revenue/sales/invoice/expense sections intentionally stay on their
  // existing mock services (Finance backend deferred).
  const [overview, setOverview] = useState<DashboardOverview | null>(null);

  useEffect(() => {
    let cancelled = false;
    dashboardService.getOverview().then((data) => {
      if (!cancelled) setOverview(data);
    }).catch(() => {
      if (!cancelled) setOverview(null);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  // FE-001: real finance figures (async). Every signed-in user opens the
  // dashboard; a user without the finance permission gets empty lists (the
  // tiles then read 0) instead of the mock numbers shown before.
  const { data: sales } = useAsyncData<Sale[]>(() => salesService.getAllIfPermitted(), []);
  const { data: invoices } = useAsyncData<Invoice[]>(() => invoiceService.getAllIfPermitted(), []);
  const { data: expenses } = useAsyncData<Expense[]>(() => expenseService.getAllIfPermitted(), []);

  const [mounted, setMounted] = useState(false);
  const [revenueMode, setRevenueMode] = useState<'weekly' | 'monthly' | 'yearly' | 'custom'>('weekly');
  const [revenueFilterOpen, setRevenueFilterOpen] = useState(false);
  const [revenueCustomPanelOpen, setRevenueCustomPanelOpen] = useState(false);
  const [revenueMonthStart, setRevenueMonthStart] = useState('2026-06');
  const [revenueMonthEnd, setRevenueMonthEnd] = useState('2026-09');
  const filterWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 60);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!revenueFilterOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (filterWrapRef.current && !filterWrapRef.current.contains(e.target as Node)) {
        setRevenueFilterOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRevenueFilterOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [revenueFilterOpen]);

  // Real "today": the server's business day (Asia/Jakarta); falls back to the
  // local calendar day while the overview loads (FE-005: no UTC day shift).
  const today = overview?.today ?? todayLocalISO();
  const monthPrefix = today.slice(0, 7);

  const todayCheckins = overview?.reservations.todayCheckins ?? 0;
  const checkedInCount = overview?.reservations.checkedIn ?? 0;
  const upcomingCount = overview?.reservations.upcoming ?? 0;
  const recentReservations = overview?.recent ?? [];
  const totalReservations = overview?.reservations.total ?? 0;

  const todaySales = useMemo(() => sales.filter((s) => s.date === today).reduce((sum, s) => sum + s.amount, 0), [sales, today]);
  const monthSales = useMemo(() => sales.filter((s) => s.date.startsWith(monthPrefix)).reduce((sum, s) => sum + s.amount, 0), [sales, monthPrefix]);

  const pendingInvoices = invoices.filter((inv) => inv.invoiceStatus === 'Draft').length;
  const overdueInvoices = invoices.filter((inv) => inv.paymentStatus === 'Overdue').length;
  const paidInvoices = invoices.filter((inv) => inv.invoiceStatus === 'Completed').length;

  const activeRooms = overview?.rooms.active ?? 0;
  const totalRooms = overview?.rooms.total ?? 0;
  const maintenanceRooms = overview?.rooms.maintenance ?? 0;
  const inactiveRooms = overview?.rooms.inactive ?? 0;
  const occupancyRate = overview?.occupancy.rate ?? 0;

  const revenueBuckets = useMemo(() => {
    const sumByDate = (items: Array<{ date: string; amount: number }>, date: string) =>
      items.filter((i) => i.date === date).reduce((sum, i) => sum + i.amount, 0);

    if (revenueMode === 'weekly') {
      const labels: string[] = [];
      const earn: number[] = [];
      const exp: number[] = [];
      for (let i = 6; i >= 0; i--) {
        const key = shiftISODate(today, -i);
        const d = new Date(`${key}T00:00:00`);
        labels.push(d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));
        earn.push(sumByDate(sales, key));
        exp.push(sumByDate(expenses, key));
      }
      return { labels, earn, exp };
    }

    if (revenueMode === 'monthly') {
      const labels = ['Pekan 1', 'Pekan 2', 'Pekan 3', 'Pekan 4'];
      const earn = [0, 0, 0, 0];
      const exp = [0, 0, 0, 0];
      const weekOf = (day: number) => (day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : 3);
      sales.forEach((s) => {
        const d = new Date(s.date).getDate();
        if (!Number.isNaN(d) && s.date.startsWith(monthPrefix)) earn[weekOf(d)] += s.amount;
      });
      expenses.forEach((e) => {
        const d = new Date(e.date).getDate();
        if (!Number.isNaN(d) && e.date.startsWith(monthPrefix)) exp[weekOf(d)] += e.amount;
      });
      return { labels, earn, exp };
    }

    if (revenueMode === 'yearly') {
      const labels = ['Q1', 'Q2', 'Q3', 'Q4'];
      const earn = [0, 0, 0, 0];
      const exp = [0, 0, 0, 0];
      sales.forEach((s) => {
        const m = new Date(s.date).getMonth();
        if (!Number.isNaN(m)) earn[Math.floor(m / 3)] += s.amount;
      });
      expenses.forEach((e) => {
        const m = new Date(e.date).getMonth();
        if (!Number.isNaN(m)) exp[Math.floor(m / 3)] += e.amount;
      });
      return { labels, earn, exp };
    }

    const labels: string[] = [];
    const earn: number[] = [];
    const exp: number[] = [];
    const [sy, sm] = revenueMonthStart.split('-').map(Number);
    const [ey, em] = revenueMonthEnd.split('-').map(Number);
    let y = sy, m = sm;
    while (y < ey || (y === ey && m <= em)) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      labels.push(new Date(y, m - 1).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }));
      earn.push(sales.filter((s) => s.date.startsWith(key)).reduce((sum, s) => sum + s.amount, 0));
      exp.push(expenses.filter((e) => e.date.startsWith(key)).reduce((sum, e) => sum + e.amount, 0));
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return { labels, earn, exp };
  }, [revenueMode, sales, expenses, revenueMonthStart, revenueMonthEnd, today, monthPrefix]);

  const revenueMax = Math.max(1, ...revenueBuckets.earn, ...revenueBuckets.exp);
  const revenueTotalEarn = revenueBuckets.earn.reduce((a, b) => a + b, 0);
  const revenueTotalExp = revenueBuckets.exp.reduce((a, b) => a + b, 0);

  const statusBreakup = useMemo(() => {
    const defs = [
      { key: 'reserved', color: '#97764D' },
      { key: 'checked-in', color: '#2F5D37' },
      { key: 'checked-out', color: '#6B7881' },
      { key: 'cancelled', color: '#962222' },
    ];
    return defs.map((d) => ({
      ...d,
      label: reservationStatusLabels[d.key] || d.key,
      count: overview?.reservations.byStatus[d.key as keyof DashboardOverview['reservations']['byStatus']] ?? 0,
    }));
  }, [overview]);

  const animTodaySales = useCountUp(todaySales, formatCurrency);
  const animMonthSales = useCountUp(monthSales, formatCurrency);
  const animOccupancy = useCountUp(occupancyRate, (n) => `${n}%`);
  const animPending = useCountUp(pendingInvoices, String);
  const animPaid = useCountUp(paidInvoices, String);
  const animOverdue = useCountUp(overdueInvoices, String);

  // Rolling stat cards — each opens an existing page, so each requires that
  // page's permission. Filtered before the marquee duplication below.
  const stats = [
    { key: 'checkin', label: 'Check-in Hari Ini', value: String(todayCheckins), sub: `${upcomingCount} upcoming`, icon: CalendarCheck, to: '/dashboard/reservations', permission: 'reservation.view' },
    { key: 'active', label: 'Reservasi Aktif', value: String(checkedInCount), sub: `${totalReservations} total`, icon: BedDouble, to: '/dashboard/reservations', permission: 'reservation.view' },
    { key: 'revenue', label: 'Omzet Hari Ini', value: animTodaySales, sub: `Bulan ini: ${animMonthSales}`, icon: Wallet, to: '/dashboard/finance/sales', permission: 'finance.sales.view' },
    { key: 'invoice', label: 'Invoice Tertunda', value: animPending, sub: `${overdueInvoices} overdue`, icon: FileWarning, to: '/dashboard/finance/invoices', permission: 'finance.invoice.view' },
    { key: 'occupancy', label: 'Okupansi', value: animOccupancy, sub: `${checkedInCount} dari ${totalRooms} kamar`, icon: LayoutDashboard, to: '/dashboard/rooms', permission: 'room.view' },
    { key: 'total', label: 'Total Reservasi', value: String(totalReservations), sub: `${paidInvoices} invoice lunas`, icon: Receipt, to: '/dashboard/reservations', permission: 'reservation.view' },
  ].filter((s) => hasPermission(s.permission));

  const columns = [
    { key: 'reservationCode', header: 'Kode', render: (item: DashboardRecentReservation) => <Link to={`/dashboard/reservations/${item.id}`} style={{ color: '#97764D', fontWeight: 600, textDecoration: 'none' }}>{item.reservationCode}</Link> },
    { key: 'guestName', header: 'Tamu', render: (item: DashboardRecentReservation) => item.guestName },
    { key: 'source', header: 'Sumber', render: (item: DashboardRecentReservation) => <Badge variant="default">{reservationSourceLabels[item.source] || item.source}</Badge> },
    { key: 'checkInDate', header: 'Check-in', render: (item: DashboardRecentReservation) => formatDate(item.checkInDate) },
    { key: 'status', header: 'Status', render: (item: DashboardRecentReservation) => <Badge variant={item.status === 'checked-in' ? 'success' : item.status === 'reserved' ? 'warning' : item.status === 'cancelled' ? 'danger' : 'default'}>{reservationStatusLabels[item.status]}</Badge> },
    { key: 'totalAmount', header: 'Total', render: (item: DashboardRecentReservation) => formatCurrency(item.totalAmount) },
  ];

  const donutR = 54;
  const donutC = 2 * Math.PI * donutR;
  let donutAcc = 0;
  const donutSegs = statusBreakup.map((s) => {
    const frac = totalReservations > 0 ? s.count / totalReservations : 0;
    const seg = { ...s, dash: frac * donutC, offset: donutAcc };
    donutAcc += frac * donutC;
    return seg;
  });

  return (
    <div className="dm">
      <div className="dm-reveal">
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#232D36', fontFamily: 'var(--font-family-sans)', margin: 0 }}>Homestay Joglo Seruni Syariah</h1>
        <p style={{ color: '#6B7881', fontSize: '14px', margin: '4px 0 0' }}>Ringkasan operasional properti</p>
      </div>

      {/* Quick actions — top (permission-filtered, never role-based) */}
      {(() => {
        const quickActions = [
          { to: '/dashboard/reservations/new', label: 'Reservasi Baru', icon: true, primary: true, permission: 'reservation.view' },
          { to: '/dashboard/finance/invoices/new', label: 'Invoice', icon: true, primary: false, permission: 'finance.invoice.view' },
          { to: '/dashboard/rooms/new', label: 'Tambah Kamar', icon: true, primary: false, permission: 'room.view' },
          { to: '/dashboard/finance/reports', label: 'Laporan Keuangan', icon: false, primary: false, permission: 'finance.report.view' },
          { to: '/dashboard/activity', label: 'Log Aktivitas', icon: false, primary: false, permission: 'activity.view' },
        ].filter((a) => hasPermission(a.permission));
        if (quickActions.length === 0) return null;
        return (
          <nav className="dm-card dm-reveal" style={{ animationDelay: '40ms', padding: '12px 16px' }} aria-label="Aksi cepat">
            <div className="dm-actions dm-actions--row">
              {quickActions.map((a) => (
                <Link key={a.to} className={`dm-btn${a.primary ? ' dm-btn--primary' : ' dm-btn--secondary'}`} to={a.to}>
                  {a.icon && <Plus size={16} aria-hidden="true" />} {a.label}
                </Link>
              ))}
            </div>
          </nav>
        );
      })()}

      {/* TopCards marquee (hidden when no stat card is permitted) */}
      {stats.length > 0 && (
      <section
        className="dm-marquee dm-reveal"
        style={{ animationDelay: '80ms' }}
        role="region"
        aria-roledescription="carousel"
        aria-label="Statistik ringkas. Daftar bergeser otomatis dan berhenti saat disentuh atau difokuskan."
      >
        <div className="dm-marquee__track">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <Link className="dm-stat" key={s.key} to={s.to}>
                <span className="dm-stat__icon" aria-hidden="true"><Icon size={22} /></span>
                <span>
                  <span className="dm-stat__value">{s.value}</span>
                  <br />
                  <span className="dm-stat__label">{s.label}</span>
                  <br />
                  <span className="dm-stat__sub">{s.sub}</span>
                </span>
              </Link>
            );
          })}
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <Link className="dm-stat" key={`dup-${s.key}`} to={s.to} tabIndex={-1} aria-hidden="true">
                <span className="dm-stat__icon" aria-hidden="true"><Icon size={22} /></span>
                <span>
                  <span className="dm-stat__value">{s.value}</span>
                  <br />
                  <span className="dm-stat__label">{s.label}</span>
                  <br />
                  <span className="dm-stat__sub">{s.sub}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>
      )}

      <div className="dm-grid">
        {/* RevenueUpdate */}
        <section className="dm-card dm-span-8 dm-reveal" style={{ animationDelay: '120ms' }} aria-labelledby="dm-revenue-title">
          <div className="dm-card__head">
            <div>
              <h2 id="dm-revenue-title" className="dm-card__title">Pendapatan</h2>
              <p className="dm-card__sub">Pemasukan vs pengeluaran</p>
            </div>
            <div ref={filterWrapRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className="dm-btn dm-btn--primary"
                style={{ minHeight: '36px', padding: '4px 12px', fontSize: '12px' }}
                onClick={() => setRevenueFilterOpen(!revenueFilterOpen)}
              >
                {revenueMode === 'weekly' ? 'Mingguan' : revenueMode === 'monthly' ? 'Bulanan' : revenueMode === 'yearly' ? 'Tahunan' : 'Pilih Rentang'}
              </button>
              {revenueFilterOpen && (
                <div className="res-cascade" style={{ left: 'auto', right: 0, flexDirection: 'row-reverse' }}>
                  <div className="res-cascade__panel1">
                    <div className="res-cascade__head">
                      <span className="res-cascade__title">Rentang Grafik</span>
                      <button type="button" className="res-cascade__close" onClick={() => { setRevenueFilterOpen(false); setRevenueCustomPanelOpen(false); }} aria-label="Close filter">
                        <X size={18} />
                      </button>
                    </div>
                    <ul className="res-cascade__cats">
                      {[
                        { key: 'weekly', label: 'Mingguan' },
                        { key: 'monthly', label: 'Bulanan' },
                        { key: 'yearly', label: 'Tahunan' },
                        { key: 'custom', label: 'Pilih Rentang' },
                      ].map((opt) => (
                        <li key={opt.key}>
                          <button
                            type="button"
                            className={`res-cascade__catbtn${revenueMode === opt.key ? ' res-cascade__catbtn--active' : ''}`}
                            onClick={() => {
                              if (opt.key === 'custom') {
                                setRevenueCustomPanelOpen(true);
                              } else {
                                setRevenueMode(opt.key as 'weekly' | 'monthly' | 'yearly');
                                setRevenueFilterOpen(false);
                              }
                            }}
                          >
                            <span className="res-cascade__catlabel">{opt.label}</span>
                            {revenueMode === opt.key && <span className="res-cascade__check"><Check size={16} /></span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {revenueCustomPanelOpen && (
                    <div className="res-cascade__panel2">
                      <div className="res-cascade__head">
                        <button type="button" className="res-cascade__back" onClick={() => setRevenueCustomPanelOpen(false)}>
                          <ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} /> Kembali
                        </button>
                        <button type="button" className="res-cascade__close" onClick={() => { setRevenueFilterOpen(false); setRevenueCustomPanelOpen(false); }} aria-label="Close filter">
                          <X size={18} />
                        </button>
                      </div>
                      <div style={{ padding: '12px 8px' }}>
                        <div style={{ marginBottom: '12px' }}>
                          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#232D36', marginBottom: '4px' }}>Dari Bulan</label>
                          <input
                            type="month"
                            value={revenueMonthStart}
                            onChange={(e) => setRevenueMonthStart(e.target.value)}
                            style={{ width: '100%', height: '44px', padding: '8px', borderRadius: '8px', border: '1px solid #C7BBAB', fontSize: '14px', fontFamily: 'var(--font-family-sans)', color: '#232D36' }}
                          />
                        </div>
                        <div style={{ marginBottom: '12px' }}>
                          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#232D36', marginBottom: '4px' }}>Sampai Bulan</label>
                          <input
                            type="month"
                            value={revenueMonthEnd}
                            onChange={(e) => setRevenueMonthEnd(e.target.value)}
                            style={{ width: '100%', height: '44px', padding: '8px', borderRadius: '8px', border: '1px solid #C7BBAB', fontSize: '14px', fontFamily: 'var(--font-family-sans)', color: '#232D36' }}
                          />
                        </div>
                        <button
                          type="button"
                          className="dm-btn dm-btn--primary"
                          style={{ width: '100%', minHeight: '44px' }}
                          onClick={() => { setRevenueMode('custom'); setRevenueFilterOpen(false); setRevenueCustomPanelOpen(false); }}
                        >
                          Terapkan
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="dm-legend" aria-hidden="true">
            <span className="dm-legend__item"><span className="dm-legend__dot" style={{ backgroundColor: '#97764D' }} /> Pemasukan</span>
            <span className="dm-legend__item"><span className="dm-legend__dot" style={{ backgroundColor: '#6B7881' }} /> Pengeluaran</span>
          </div>
          <div className="dm-chart-scroll">
          <div className="dm-chart-inner" style={{ minWidth: revenueMode === 'custom' ? '620px' : '100%' }}>
          <div
            className="dm-bars"
            role="img"
            aria-label={`Grafik pemasukan versus pengeluaran, mode ${revenueMode === 'weekly' ? 'mingguan' : 'harian'}. Total pemasukan ${formatCurrency(revenueTotalEarn)}, total pengeluaran ${formatCurrency(revenueTotalExp)}.`}
          >
            {revenueBuckets.labels.map((label, i) => (
              <div className="dm-bar-group" key={label} title={`${label}: masuk ${formatCurrency(revenueBuckets.earn[i])}, keluar ${formatCurrency(revenueBuckets.exp[i])}`}>
                <div className="dm-bar dm-bar--earn" style={{ height: mounted ? `${Math.max(1, (revenueBuckets.earn[i] / revenueMax) * 100)}%` : '3px' }} />
                <div className="dm-bar dm-bar--exp" style={{ height: mounted ? `${Math.max(1, (revenueBuckets.exp[i] / revenueMax) * 100)}%` : '3px' }} />
              </div>
            ))}
          </div>
          <div className="dm-bar-labels" aria-hidden="true">
            {revenueBuckets.labels.map((label) => (
              <span className="dm-bar-label" key={label}>{label}</span>
            ))}
          </div>
          </div>
          </div>
          <p className="dm-chart-sum">
            Total pemasukan <strong>{formatCurrency(revenueTotalEarn)}</strong> · Total pengeluaran <strong>{formatCurrency(revenueTotalExp)}</strong>
          </p>
        </section>

        {/* Right column: composition + occupancy + invoice fill the space beside charts */}
        <div className="dm-span-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
        {/* Composition (YearlyBreakup) — half height of charts */}
        <section className="dm-card dm-card--sm dm-reveal" style={{ animationDelay: '160ms' }} aria-labelledby="dm-breakup-title">
          <h2 id="dm-breakup-title" className="dm-card__title" style={{ fontSize: '16px' }}>Komposisi Reservasi</h2>
          <div className="dm-donut-wrap" style={{ marginTop: '12px' }}>
            <svg
              className="dm-donut-svg"
              width="112"
              height="112"
              viewBox="0 0 150 150"
              role="img"
              aria-label={`Donut komposisi reservasi. Total ${totalReservations} reservasi: ${statusBreakup.map((s) => `${s.label} ${s.count}`).join(', ')}.`}
            >
                <circle cx="75" cy="75" r={donutR} fill="none" stroke="#EEEDE9" strokeWidth="20" />
                {donutSegs.map((s) => (
                  <circle
                    key={s.key}
                    className="dm-donut-seg"
                    cx="75"
                    cy="75"
                    r={donutR}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="20"
                    strokeDasharray={mounted ? `${Math.max(0, s.dash - 2)} ${donutC - Math.max(0, s.dash - 2)}` : `0 ${donutC}`}
                    strokeDashoffset={-s.offset + donutC / 4}
                    strokeLinecap="butt"
                  >
                    <title>{`${s.label}: ${s.count}`}</title>
                  </circle>
                ))}
                <text x="75" y="72" textAnchor="middle" fontSize="22" fontWeight="700" fill="#232D36">{totalReservations}</text>
                <text x="75" y="90" textAnchor="middle" fontSize="11" fill="#6B7881">reservasi</text>
              </svg>
              <div>
                <p className="dm-donut-total" style={{ fontSize: '18px' }}>{totalReservations} total</p>
                <div className="dm-donut-legend dm-donut-legend--grid">
                  {statusBreakup.map((s) => (
                    <span className="dm-legend__item" key={s.key} style={{ fontSize: '11px' }}>
                      <span className="dm-legend__dot" style={{ backgroundColor: s.color }} />
                      {s.label} · <strong style={{ color: '#232D36' }}>{s.count}</strong>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

        {/* Occupancy — small card under composition */}
        <section className="dm-card dm-card--sm dm-reveal" style={{ animationDelay: '200ms' }} aria-labelledby="dm-occ-title">
          <h2 id="dm-occ-title" className="dm-card__title" style={{ fontSize: '16px' }}>Okupansi</h2>
          <div className="dm-occupancy-hero" style={{ marginTop: '8px', marginBottom: '8px', gap: '12px' }}>
            <span className="dm-occupancy-hero__pct--sm">{animOccupancy}</span>
            <div>
              <div style={{ color: '#232D36', fontWeight: 600, fontSize: '13px' }}>Kamar Terisi</div>
              <div style={{ color: '#6B7881', fontSize: '13px' }}>{checkedInCount} dari {totalRooms} kamar</div>
            </div>
          </div>
          <div
            className="dm-meter"
            role="img"
            aria-label={`Okupansi ${occupancyRate} persen, ${checkedInCount} dari ${totalRooms} kamar terisi.`}
          >
            <div className="dm-meter__fill" style={{ width: mounted ? `${occupancyRate}%` : '0%', backgroundColor: '#97764D' }} />
          </div>
          <div className="dm-occupancy-meta">
            <span>Aktif: {activeRooms}</span>
            <span>Maintenance: {maintenanceRooms}</span>
            <span>Inactive: {inactiveRooms}</span>
          </div>
        </section>

        {/* Invoice summary — compact */}
        <section className="dm-card dm-card--sm dm-reveal" style={{ animationDelay: '240ms' }} aria-labelledby="dm-inv-title">
          <div className="dm-card__head" style={{ marginBottom: '8px' }}>
            <h2 id="dm-inv-title" className="dm-card__title" style={{ fontSize: '16px' }}>Invoice</h2>
            <Link className="dm-btn dm-btn--primary" style={{ minHeight: '36px', padding: '4px 12px', fontSize: '12px' }} to="/dashboard/finance/invoices">Kelola</Link>
          </div>
          <div className="dm-tiles dm-tiles--stack">
            <div className="dm-tile dm-tile--success">
              <span className="dm-tile__value">{animPaid}</span>
              <span className="dm-tile__label"><Check size={14} aria-hidden="true" color="#2F5D37" /> Lunas</span>
            </div>
            <div className="dm-tile dm-tile--warning">
              <span className="dm-tile__value">{animPending}</span>
              <span className="dm-tile__label"><Clock size={14} aria-hidden="true" color="#7A5A1E" /> Tertunda</span>
            </div>
            <div className="dm-tile dm-tile--danger">
              <span className="dm-tile__value">{animOverdue}</span>
              <span className="dm-tile__label"><AlertTriangle size={14} aria-hidden="true" color="#962222" /> Overdue</span>
            </div>
          </div>
        </section>
        </div>

        {/* Bottom — recent reservations full width */}
        <section className="dm-card dm-span-12 dm-card--tight dm-reveal" style={{ animationDelay: '280ms' }} aria-labelledby="dm-recent-title">
          <div className="dm-card__head">
            <div>
              <h2 id="dm-recent-title" className="dm-card__title">Reservasi Terakhir</h2>
              <p className="dm-card__sub">5 reservasi terbaru</p>
            </div>
            <Link className="dm-btn dm-btn--primary" to="/dashboard/reservations">Lihat Semua</Link>
          </div>
          <Table columns={columns} data={recentReservations} emptyMessage="Tidak ada reservasi terbaru" density="compact" />
        </section>
      </div>
    </div>
  );
}
