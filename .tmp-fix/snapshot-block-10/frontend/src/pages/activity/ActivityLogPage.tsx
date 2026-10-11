import { Card } from '@/components/shared/Card';
import { Input } from '@/components/shared/Input';
import { StatsCard } from '@/components/shared/StatsCard';
import { ActivityFeed } from '@/components/shared/ActivityFeed';
import { Pagination } from '@/components/shared/Pagination';
import { activityCategories, activityCategoryLabels } from '@/constants/activityTypes';
import { activityService } from '@/services/activityService';
import type { Activity } from '@/types/auth.types';
import { useMemo, useState, useRef, useEffect } from 'react';
import { ClipboardList, KeyRound, CalendarDays, Wallet, Settings, ChevronRight, Check, X } from 'lucide-react';
import '../../styles/admin-responsive.css';
import '../../styles/reservation-list.css';

export default function ActivityLogPage() {
  const service = activityService;
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const filterWrapRef = useRef<HTMLDivElement>(null);
  const [allActivities, setAllActivities] = useState<Activity[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    service.getAll().then((rows) => {
      if (!cancelled) setAllActivities(rows);
    }).catch(() => {
      if (!cancelled) {
        setLoadError('Failed to load activities');
        setAllActivities([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredActivities = useMemo(() => {
    return allActivities.filter((a) => {
      const matchesCategory = categoryFilter === 'all' || a.category === categoryFilter;
      const matchesSearch = a.description.toLowerCase().includes(search.toLowerCase()) ||
        a.userName.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [allActivities, categoryFilter, search]);

  const totalPages = Math.ceil(filteredActivities.length / pageSize);
  const paginatedActivities = filteredActivities.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter, search]);

  useEffect(() => {
    if (!filterOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (filterWrapRef.current && !filterWrapRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
        setActiveCategory(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFilterOpen(false);
        setActiveCategory(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [filterOpen]);

  const stats = [
    { label: 'Total Activities', value: allActivities.length, icon: <ClipboardList size={20} aria-hidden="true" />, color: '#232D36' },
    { label: 'Authentication', value: allActivities.filter((a) => a.category === 'authentication').length, icon: <KeyRound size={20} aria-hidden="true" />, color: '#6B7881' },
    { label: 'Reservations', value: allActivities.filter((a) => a.category === 'reservation').length, icon: <CalendarDays size={20} aria-hidden="true" />, color: '#97764D' },
    { label: 'Finance', value: allActivities.filter((a) => a.category === 'finance').length, icon: <Wallet size={20} aria-hidden="true" />, color: '#97764D' },
    { label: 'System', value: allActivities.filter((a) => a.category === 'system').length, icon: <Settings size={20} aria-hidden="true" />, color: '#6B7881' },
  ];

  return (
    <div className="adm-page">
      <div className="adm-head">
        <div>
          <h1 className="adm-h1">Activity Log</h1>
          <p className="adm-sub">System audit trail and activity history</p>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {stats.map((stat) => (
          <StatsCard key={stat.label} {...stat} />
        ))}
      </div>
      <Card style={{ marginBottom: '20px' }}>
        <div className="res-toolbar" style={{ marginBottom: 0 }}>
          <div className="res-toolbar__filterwrap" ref={filterWrapRef}>
            <button
              type="button"
              className="res-filterbtn"
              onClick={() => { setFilterOpen(!filterOpen); setActiveCategory(null); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '44px', padding: '6px 16px', borderRadius: '8px', border: '1px solid #232D36', backgroundColor: '#232D36', color: '#FFFFFF', fontSize: '14px', fontWeight: 500, fontFamily: 'var(--font-family-sans)', cursor: 'pointer', transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#97764D'; e.currentTarget.style.borderColor = '#97764D'; e.currentTarget.style.color = '#FFFFFF'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#232D36'; e.currentTarget.style.borderColor = '#232D36'; e.currentTarget.style.color = '#FFFFFF'; }}
            >
              Filter
              {categoryFilter !== 'all' && (
                <span className="res-filterbtn-count">1</span>
              )}
            </button>
            {filterOpen && (
              <div className={`res-cascade${activeCategory ? ' res-cascade--split' : ''}`}>
                <div className="res-cascade__panel1">
                  <div className="res-cascade__head">
                    <span className="res-cascade__title">Category</span>
                    <button type="button" className="res-cascade__close" onClick={() => { setFilterOpen(false); setActiveCategory(null); }} aria-label="Close filter">
                      <X size={18} />
                    </button>
                  </div>
                  <ul className="res-cascade__cats">
                    <li>
                      <button
                        type="button"
                        className={`res-cascade__catbtn${categoryFilter === 'all' ? ' res-cascade__catbtn--active' : ''}`}
                        onClick={() => { setCategoryFilter('all'); setFilterOpen(false); setActiveCategory(null); }}
                      >
                        <span className="res-cascade__catlabel">All Categories</span>
                        {categoryFilter === 'all' && <span className="res-cascade__check"><Check size={16} /></span>}
                      </button>
                    </li>
                    {activityCategories.map((cat) => (
                      <li key={cat}>
                        <button
                          type="button"
                          className={`res-cascade__catbtn${categoryFilter === cat ? ' res-cascade__catbtn--active' : ''}`}
                          onClick={() => { setActiveCategory(cat); }}
                        >
                          <span className="res-cascade__catlabel">{activityCategoryLabels[cat]}</span>
                          {categoryFilter === cat && <span className="res-cascade__check"><Check size={16} /></span>}
                          <span className="res-cascade__chev"><ChevronRight size={16} /></span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                {activeCategory && (
                  <div className="res-cascade__panel2">
                    <div className="res-cascade__head">
                      <button type="button" className="res-cascade__back" onClick={() => setActiveCategory(null)}>
                        <ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} /> Back
                      </button>
                      <button type="button" className="res-cascade__close" onClick={() => { setFilterOpen(false); setActiveCategory(null); }} aria-label="Close filter">
                        <X size={18} />
                      </button>
                    </div>
                    <ul className="res-cascade__opts">
                      <li>
                        <button
                          type="button"
                          className="res-cascade__optbtn"
                          onClick={() => { setCategoryFilter('all'); setFilterOpen(false); setActiveCategory(null); }}
                        >
                          <span className="res-cascade__optlabel">All Categories</span>
                          {categoryFilter === 'all' && <span className="res-cascade__check"><Check size={16} /></span>}
                        </button>
                      </li>
                      {activityCategories.map((cat) => (
                        <li key={cat}>
                          <button
                            type="button"
                            className="res-cascade__optbtn"
                            onClick={() => { setCategoryFilter(cat); setFilterOpen(false); setActiveCategory(null); }}
                          >
                            <span className="res-cascade__optlabel">{activityCategoryLabels[cat]}</span>
                            {categoryFilter === cat && <span className="res-cascade__check"><Check size={16} /></span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="res-toolbar__search">
            <Input placeholder="Search activities..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span className="adm-count">
            {filteredActivities.length} result(s)
          </span>
        </div>
      </Card>
      <Card>
        {loadError && <p role="alert" style={{ fontSize: '14px', color: '#962222' }}>{loadError}</p>}
        <ActivityFeed activities={paginatedActivities} />
      </Card>
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredActivities.length}
          onPageChange={setCurrentPage}
          pageSize={pageSize}
          pageSizeOptions={[8, 16]}
          onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
        />
      )}
    </div>
  );
}
