import { useState, useMemo, useEffect, useRef } from 'react';
import { Filter, X, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { Badge } from '@/components/shared/Badge';
import { Input } from '@/components/shared/Input';
import { Table } from '@/components/shared/Table';
import { Modal } from '@/components/shared/Modal';
import { Pagination } from '@/components/shared/Pagination';
import { RoleForm } from '@/components/shared/RoleForm';
import roleService from '@/services/roleService';
import '../../styles/admin-responsive.css';
import '../../styles/reservation-list.css';

type RoleModal = { mode: 'create' } | { mode: 'edit'; id: string } | null;

const FILTER_CATEGORIES = [
  {
    key: 'status',
    label: 'Status',
    options: [
      { value: 'all', label: 'All Status' },
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' },
    ],
  },
];

export default function RoleListPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modal, setModal] = useState<RoleModal>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({ status: 'all' });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const filterWrapRef = useRef<HTMLDivElement>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');
    roleService.getAll().then((r) => {
      if (!cancelled) {
        setRoles(r);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setLoadError('Failed to load roles');
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const handleModalSuccess = () => {
    closeModal();
    setReloadToken((t) => t + 1);
  };

  const filtered = useMemo(() => {
    return roles.filter((r: any) => {
      const matchesSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [roles, searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const visibleRoles = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const activeFilterCount = statusFilter !== 'all' ? 1 : 0;

  const applyFilters = () => {
    setStatusFilter(draft.status);
    setFilterOpen(false);
    setCurrentPage(1);
  };

  const resetFilters = () => {
    setDraft({ status: 'all' });
    setStatusFilter('all');
    setActiveCategory(null);
    setCurrentPage(1);
  };

  const closeFilter = () => {
    setFilterOpen(false);
    setActiveCategory(null);
  };

  useEffect(() => {
    if (!filterOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (filterWrapRef.current && !filterWrapRef.current.contains(e.target as Node)) {
        closeFilter();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [filterOpen]);

  const closeModal = () => setModal(null);

  const columns = [
    { key: 'name', header: 'Role Name', render: (item: any) => item.name },
    { key: 'description', header: 'Description', render: (item: any) => item.description },
    { key: 'permissionCount', header: 'Permissions', render: (item: any) => item.permissions?.length || 0 },
    { key: 'status', header: 'Status', render: (item: any) => (
      <Badge variant={item.status === 'active' ? 'success' : 'default'}>{item.status}</Badge>
    )},
    { key: 'actions', header: 'Actions', render: (item: any) => (
      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
        <Button variant="ghost" size="sm" onClick={() => setModal({ mode: 'edit', id: item.id })} style={{ backgroundColor: '#97764D', color: '#FFFFFF', borderColor: '#97764D' }} hoverStyle={{ backgroundColor: '#FFFFFF', color: '#000000', borderColor: '#000000' }}>Edit</Button>
      </div>
    )},
  ];

  return (
    <div className="adm-page">
      <div className="adm-head">
        <div>
          <h1 className="adm-h1">Jabatan</h1>
          <p className="adm-sub">Manage roles and their permissions</p>
        </div>
        <Button variant="primary" className="adm-cta" onClick={() => setModal({ mode: 'create' })}>Create Role</Button>
      </div>
      <div className="res-toolbar" role="search" style={{ marginBottom: '20px' }}>
        <div className="res-toolbar__filterwrap" ref={filterWrapRef}>
          <Button
            onClick={() => (filterOpen ? closeFilter() : setFilterOpen(true))}
            aria-expanded={filterOpen}
            aria-controls="role-filter-panel"
            aria-label={activeFilterCount > 0 ? `Filter, ${activeFilterCount} active` : 'Filter'}
          >
            <Filter size={16} aria-hidden="true" />
            <span style={{ marginLeft: '8px' }}>Filter</span>
            {activeFilterCount > 0 && (
              <span className="res-filterbtn-count" aria-hidden="true">{activeFilterCount}</span>
            )}
          </Button>

          {filterOpen && (
            <>
              <button
                type="button"
                className="res-filter-scrim"
                aria-label="Close filters"
                onClick={closeFilter}
                tabIndex={-1}
              />
              <div className={`res-cascade${activeCategory ? ' res-cascade--split res-cascade--detail' : ''}`}>
                <div className="res-cascade__panel1" role="dialog" aria-label="Role filters">
                  <div className="res-cascade__head">
                    <h2 className="res-cascade__title">Filter</h2>
                    <button
                      type="button"
                      onClick={closeFilter}
                      aria-label="Close filters"
                      className="res-cascade__close"
                    >
                      <X size={18} aria-hidden="true" />
                    </button>
                  </div>
                  <ul className="res-cascade__cats">
                    {FILTER_CATEGORIES.map((cat) => {
                      const active = draft[cat.key] !== 'all';
                      const selected = activeCategory === cat.key;
                      return (
                        <li key={cat.key}>
                          <button
                            type="button"
                            className={`res-cascade__catbtn${active ? ' res-cascade__catbtn--active' : ''}`}
                            aria-expanded={selected}
                            onClick={() => setActiveCategory(selected ? null : cat.key)}
                          >
                            <span className="res-cascade__catlabel">{cat.label}</span>
                            {active && (
                              <span className="res-cascade__catsub">
                                {cat.options.find((o) => o.value === draft[cat.key])?.label}
                              </span>
                            )}
                            <span className="res-cascade__chev" aria-hidden="true">
                              <ChevronRight size={16} aria-hidden="true" />
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="res-cascade__actions">
                    <Button variant="outline" onClick={resetFilters}>Reset</Button>
                    <Button onClick={applyFilters}>Apply</Button>
                  </div>
                </div>

                {activeCategory && (
                  <div className="res-cascade__panel2" aria-label={`${FILTER_CATEGORIES.find((c) => c.key === activeCategory)?.label} options`}>
                    <div className="res-cascade__head">
                      <button
                        type="button"
                        onClick={() => setActiveCategory(null)}
                        aria-label="Back to filter categories"
                        className="res-cascade__back"
                      >
                        <ChevronLeft size={18} aria-hidden="true" />
                        {FILTER_CATEGORIES.find((c) => c.key === activeCategory)?.label}
                      </button>
                      <h3 className="res-cascade__title">{FILTER_CATEGORIES.find((c) => c.key === activeCategory)?.label}</h3>
                      <button
                        type="button"
                        onClick={closeFilter}
                        aria-label="Close filters"
                        className="res-cascade__close"
                      >
                        <X size={18} aria-hidden="true" />
                      </button>
                    </div>
                    <ul className="res-cascade__opts">
                      {FILTER_CATEGORIES.find((c) => c.key === activeCategory)?.options.map((opt) => {
                        const selected = draft[activeCategory] === opt.value;
                        return (
                          <li key={opt.value}>
                            <button
                              type="button"
                              className="res-cascade__optbtn"
                              aria-pressed={selected}
                              onClick={() => setDraft({ ...draft, [activeCategory]: opt.value })}
                            >
                              <span className="res-cascade__optlabel">{opt.label}</span>
                              {selected && (
                                <span className="res-cascade__check" aria-hidden="true">
                                  <Check size={16} aria-hidden="true" />
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="res-cascade__actions2">
                      <Button variant="outline" onClick={resetFilters}>Reset</Button>
                      <Button onClick={applyFilters}>Apply</Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <div className="res-toolbar__search" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Input
            placeholder="Search roles..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            aria-label="Search roles"
          />
          <span className="adm-count" style={{ whiteSpace: 'nowrap' }}>
            {filtered.length} result(s)
          </span>
        </div>
      </div>
      {loadError && <div role="alert" style={{ color: '#C85C5C', fontSize: '14px', marginBottom: '12px' }}>{loadError}</div>}
      <Table columns={columns} data={visibleRoles} emptyMessage={isLoading ? 'Loading roles...' : 'No roles found'} />
      {filtered.length > 0 && (
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          totalItems={filtered.length}
          pageSize={pageSize}
          pageSizeOptions={[10, 20, 50]}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
        />
      )}

      <Modal
        open={modal !== null}
        onClose={closeModal}
        title={modal?.mode === 'edit' ? 'Edit Role' : 'Create Role'}
        size="lg"
      >
        {modal !== null && (
          <RoleForm
            key={modal.mode === 'edit' ? modal.id : 'new'}
            id={modal.mode === 'edit' ? modal.id : undefined}
            onSuccess={handleModalSuccess}
            onCancel={closeModal}
          />
        )}
      </Modal>
    </div>
  );
}
