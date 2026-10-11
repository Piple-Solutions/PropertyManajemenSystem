import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/shared/Button';
import {
  LayoutDashboard,
  BedDouble,
  CalendarDays,
  Users,
  CreditCard,
  Activity,
  LogOut,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
} from 'lucide-react';
import type React from 'react';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { appConfig } from '@/config/app';
import logoWhite from '../../assets/LogoWhite.png';
import '../styles/pms-layout.css';

type NavIcon = React.ComponentType<{ size?: number | string; color?: string }>;

interface NavItem {
  label: string;
  path: string;
  icon: NavIcon;
  permission?: string;
  anyOf?: string[];
  activeMatch?: string[];
  children?: NavItem[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  {
    label: 'Reservasi', path: '/dashboard/reservations', icon: CalendarDays, permission: 'reservation.view',
    children: [
      { label: 'Daftar Reservasi', path: '/dashboard/reservations', icon: CalendarDays, permission: 'reservation.view' },
      { label: 'Kalender', path: '/dashboard/reservations/calendar', icon: CalendarDays, permission: 'reservation.view' },
    ],
  },
  {
    label: 'Keuangan', path: '/dashboard/finance/sales', icon: CreditCard,
    anyOf: ['finance.sales.view', 'finance.invoice.view', 'finance.report.view'],
    children: [
      { label: 'Penjualan', path: '/dashboard/finance/sales', icon: CreditCard, permission: 'finance.sales.view' },
      { label: 'Invoices', path: '/dashboard/finance/invoices', icon: CreditCard, permission: 'finance.invoice.view' },
      { label: 'Laporan', path: '/dashboard/finance/reports', icon: CreditCard, permission: 'finance.report.view' },
      {
        label: 'Pengeluaran', path: '/dashboard/finance/expenses', icon: CreditCard,
        anyOf: ['finance.sales.view', 'finance.invoice.view', 'finance.report.view'],
      },
    ],
  },
  {
    label: 'Kamar', path: '/dashboard/rooms', icon: BedDouble, permission: 'room.view',
    children: [
      { label: 'Tipe Kamar', path: '/dashboard/room-types', icon: BedDouble, permission: 'room.view' },
      { label: 'Daftar Kamar', path: '/dashboard/rooms', icon: BedDouble, permission: 'room.view' },
    ],
  },
  {
    label: 'Manajemen', path: '/dashboard/management', icon: Users,
    anyOf: ['user.view', 'role.view', 'permission.view'],
    activeMatch: ['/dashboard/management', '/dashboard/users', '/dashboard/roles', '/dashboard/permissions'],
  },
  {
    label: 'Aktivitas', path: '/dashboard/activity', icon: Activity, permission: 'activity.view',
  },
];

const bottomNavPaths = ['/dashboard/management', '/dashboard/activity'];

export function PMSLayout() {
  const { user, logout } = useAuth();
  const { hasPermission } = usePermissions();
  const location = useLocation();
  const navigate = useNavigate();

  const matchesPath = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const activeChildOf = (item: NavItem): NavItem | undefined => {
    if (!item.children) return undefined;
    const matches = item.children.filter((c) => matchesPath(c.path));
    matches.sort((a, b) => b.path.length - a.path.length);
    return matches[0];
  };

  const isGroupActive = (item: NavItem) => {
    if (location.pathname === item.path) return true;
    if (item.activeMatch?.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'))) return true;
    return activeChildOf(item) !== undefined;
  };

  const canSee = (item: NavItem): boolean => {
    if (item.permission !== undefined && hasPermission(item.permission)) return true;
    if (item.anyOf !== undefined && item.anyOf.some((p) => hasPermission(p))) return true;
    if (item.permission === undefined && item.anyOf === undefined) return true;
    return false;
  };

  const visibleItems = navItems
    .map((item) => {
      if (!item.children) return canSee(item) ? item : null;
      const visibleChildren = item.children.filter(canSee);
      if (visibleChildren.length === 0) return null;
      return { ...item, children: visibleChildren };
    })
    .filter((item): item is NavItem => item !== null);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const openPath: string | null = Object.keys(openGroups).find((p) => openGroups[p]) ?? null;
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(
    () => typeof window === 'undefined' || window.innerWidth >= 1280,
  );

  // Mobile drawer state (RWD-002). Presentation-only: mirrors the <768px
  // CSS breakpoint in pms-layout.css. Desktop/tablet rendering below is
  // untouched, so output at >=768px stays identical.
  const [isMobile, setIsMobile] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth < 768,
  );
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const wasDrawerOpen = useRef<boolean>(false);
  const topbarRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const closeDrawer = () => setDrawerOpen(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      if (!e.matches) setDrawerOpen(false);
    };
    setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Close the drawer on route change (mobile only in practice).
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Escape closes the drawer; body scroll is locked while it is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [drawerOpen]);

  // While the drawer is open the page behind it is inert (no Tab / SR reach).
  useEffect(() => {
    const targets = [topbarRef.current, mainRef.current, footerRef.current];
    const lock = isMobile && drawerOpen;
    targets.forEach((el) => {
      if (el) el.inert = lock;
    });
    return () => {
      targets.forEach((el) => {
        if (el) el.inert = false;
      });
    };
  }, [isMobile, drawerOpen]);

  // Move focus into the drawer on open; return it to the hamburger on close.
  useEffect(() => {
    if (drawerOpen) {
      wasDrawerOpen.current = true;
      const first = drawerRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])');
      first?.focus();
    } else if (wasDrawerOpen.current) {
      wasDrawerOpen.current = false;
      hamburgerRef.current?.focus();
    }
  }, [drawerOpen]);

  useEffect(() => {
    const activeGroup = navItems.find(
      (item) =>
        item.children &&
        item.children.some(
          (c) => location.pathname === c.path || location.pathname.startsWith(`${c.path}/`),
        ),
    );
    setOpenGroups(activeGroup ? { [activeGroup.path]: true } : {});
  }, [location.pathname]);

  const toggleGroup = (item: NavItem) => {
    if (openPath === item.path) {
      setOpenGroups({});
    } else {
      // In the mobile drawer only expand: navigating would close the drawer
      // before the sub-items are visible.
      if (!isMobile) navigate(item.children?.[0]?.path ?? item.path);
      setOpenGroups({ [item.path]: true });
    }
  };

  const subId = (path: string) => `pms-sub-${path.replace(/\//g, '-')}`;

  const topItems = visibleItems.filter((item) => !bottomNavPaths.includes(item.path));
  const bottomItems = visibleItems.filter((item) => bottomNavPaths.includes(item.path));

  const renderGroup = (item: NavItem) => {
    const active = isGroupActive(item);
    const ParentIcon = item.icon;
    if (item.children) {
      const expanded = openPath === item.path;
      const activeChild = activeChildOf(item);
      return (
        <div key={item.path} className="pms-group">
          <button
            type="button"
            className={`pms-link pms-link--parent pms-link--toggle${active ? ' pms-link--active' : ''}`}
            aria-expanded={expanded}
            aria-controls={subId(item.path)}
            onClick={() => toggleGroup(item)}
          >
            <ParentIcon size={20} color={active ? '#FFFFFF' : '#C7BBAB'} aria-hidden="true" />
            <span>{item.label}</span>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={`pms-chev${expanded ? ' pms-chev--open' : ''}`}
            />
          </button>
          {expanded && (
            <div className="pms-sub" id={subId(item.path)}>
              {item.children.map((child) => {
                const childActive = activeChild?.path === child.path;
                const ChildIcon = child.icon;
                return (
                  <Link
                    key={child.path}
                    to={child.path}
                    onClick={closeDrawer}
                    className={`pms-sublink${childActive ? ' pms-sublink--active' : ''}`}
                  >
                    <ChildIcon size={16} color={childActive ? '#FFFFFF' : '#6B7881'} aria-hidden="true" />
                    <span>{child.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      );
    }
    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={closeDrawer}
        className={`pms-link${active ? ' pms-link--active' : ''}`}
      >
        <ParentIcon size={20} color={active ? '#FFFFFF' : '#C7BBAB'} aria-hidden="true" />
        <span>{item.label}</span>
      </Link>
    );
  };

  const renderRailItem = (item: NavItem) => {
    const active = isGroupActive(item);
    const RailIcon = item.icon;
    const to = item.children?.[0]?.path ?? item.path;
    return (
      <Link
        key={item.path}
        to={to}
        aria-label={item.label}
        title={item.label}
        className={`pms-railbtn${active ? ' pms-railbtn--active' : ''}`}
      >
        <RailIcon size={20} color={active ? '#FFFFFF' : '#C7BBAB'} aria-hidden="true" />
      </Link>
    );
  };

  const shellClass = isMobile
    ? `pms-shell pms-shell--mobile${drawerOpen ? ' pms-shell--drawer-open' : ''}`
    : `pms-shell${sidebarOpen ? '' : ' pms-shell--rail'}`;

  const logoutButton = (
    <Button variant="ghost" size="sm" onClick={logout} style={{ backgroundColor: '#DC2626', color: '#FFFFFF', borderColor: '#DC2626' }} hoverStyle={{ backgroundColor: '#FFFFFF', color: '#DC2626', borderColor: '#DC2626' }}>
      <LogOut size={16} aria-hidden="true" /> Logout
    </Button>
  );

  // Drawer content (<768px). Same nav groups/permissions as the desktop sidebar.
  const drawerContent = (
    <>
      <div className="pms-drawerhead">
        <div className="pms-brandblock">
          <img
            src={logoWhite}
            alt="Homestay Joglo Seruni Syariah"
            className="pms-brandlogo"
          />
        </div>
        <button
          type="button"
          className="pms-iconbtn"
          aria-label="Close navigation menu"
          onClick={closeDrawer}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <nav className="pms-nav" aria-label="PMS navigation">
        {topItems.map(renderGroup)}
      </nav>
      {(bottomItems.length > 0) && (
        <div className="pms-bottom">
          <div className="pms-div" role="separator" aria-orientation="horizontal" />
          <nav className="pms-nav" aria-label="Management navigation">
            {bottomItems.map(renderGroup)}
          </nav>
        </div>
      )}
      <div className="pms-sidefoot">
        <span className="pms-user">{user?.name || 'User'}</span>
        {logoutButton}
      </div>
    </>
  );

  const fullContent = (
    <>
      <div className="pms-brandrow">
        <Button
          variant="outline"
          size="sm"
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen(false)}
          style={{ backgroundColor: 'transparent', color: '#C7BBAB', borderColor: '#C7BBAB', alignSelf: 'flex-end' }}
        >
          <PanelLeftClose size={18} aria-hidden="true" />
        </Button>
        <div className="pms-brandblock">
          <img
            src={logoWhite}
            alt="Homestay Joglo Seruni Syariah"
            className="pms-brandlogo"
          />
        </div>
      </div>
      <nav className="pms-nav" aria-label="PMS navigation">
        {topItems.map(renderGroup)}
      </nav>
      {(bottomItems.length > 0) && (
        <div className="pms-bottom">
          <div className="pms-div" role="separator" aria-orientation="horizontal" />
          <nav className="pms-nav" aria-label="Management navigation">
            {bottomItems.map(renderGroup)}
          </nav>
        </div>
      )}
      <div className="pms-sidefoot">
        <span className="pms-user">{user?.name || 'User'}</span>
        {logoutButton}
      </div>
    </>
  );

  const railContent = (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label="Open sidebar"
        title="Open sidebar"
        aria-expanded={false}
        onClick={() => setSidebarOpen(true)}
        style={{ backgroundColor: 'transparent', color: '#C7BBAB', borderColor: '#C7BBAB' }}
      >
        <PanelLeftOpen size={20} aria-hidden="true" />
      </Button>
      <nav className="pms-nav pms-nav--rail" aria-label="PMS navigation">
        {topItems.map(renderRailItem)}
      </nav>
      {(bottomItems.length > 0) && (
        <div className="pms-bottom">
          <div className="pms-div" role="separator" aria-orientation="horizontal" />
          <nav className="pms-nav pms-nav--rail" aria-label="Management navigation">
            {bottomItems.map(renderRailItem)}
          </nav>
        </div>
      )}
      <div className="pms-sidefoot pms-sidefoot--rail">
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          aria-label="Logout"
          title="Logout"
          style={{ backgroundColor: '#DC2626', color: '#FFFFFF', borderColor: '#DC2626' }}
          hoverStyle={{ backgroundColor: '#FFFFFF', color: '#DC2626', borderColor: '#DC2626' }}
        >
          <LogOut size={20} aria-hidden="true" />
        </Button>
      </div>
    </>
  );

  // One stable element tree for every breakpoint: only the *contents* of the
  // top bar / aside change, so <Outlet /> keeps its place and the page state
  // survives crossing the 767/768px boundary (e.g. rotating a phone).
  return (
    <div className={shellClass}>
      {isMobile && (
        <header className="pms-topbar" ref={topbarRef}>
          <button
            ref={hamburgerRef}
            type="button"
            className="pms-topbar__menu"
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            aria-controls="pms-drawer"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu size={22} aria-hidden="true" />
          </button>
          <span className="pms-topbar__brand">{appConfig.name}</span>
        </header>
      )}
      <div className="pms-body">
        {isMobile && drawerOpen && (
          <div className="pms-backdrop" aria-hidden="true" onClick={closeDrawer} />
        )}
        <aside
          ref={drawerRef}
          id={isMobile ? 'pms-drawer' : undefined}
          role={isMobile ? 'dialog' : undefined}
          aria-modal={isMobile ? true : undefined}
          aria-label={isMobile ? 'Navigation menu' : undefined}
          className={
            isMobile
              ? `pms-side pms-side--drawer${drawerOpen ? ' pms-side--open' : ''}`
              : 'pms-side'
          }
        >
          {isMobile ? drawerContent : sidebarOpen ? fullContent : railContent}
        </aside>
        <div className="pms-main" ref={mainRef}>
          <Outlet />
        </div>
      </div>
      <footer className="pms-footer" ref={footerRef}>
        © 2027 Homestay Joglo Seruni Syariah
      </footer>
    </div>
  );
}
