import { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Filter, X, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import { Table } from '@/components/shared/Table';
import { Button } from '@/components/shared/Button';
import { Badge } from '@/components/shared/Badge';
import { Input } from '@/components/shared/Input';
import { Modal } from '@/components/shared/Modal';
import { Pagination } from '@/components/shared/Pagination';
import { UserForm } from '@/components/shared/UserForm';
import { UserRoleForm } from '@/components/shared/UserRoleForm';
import { UserPermissionForm } from '@/components/shared/UserPermissionForm';
import userService from '@/services/userService';
import { usePermissions } from '@/hooks/usePermissions';
import '../../styles/admin-responsive.css';
import '../../styles/reservation-list.css';

type UserModal = { mode: 'create' } | { mode: 'assign'; id: string } | { mode: 'assignPerms'; id: string } | null;

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

export default function UserListPage() {
  const { hasPermission } = usePermissions();
  const canView = hasPermission('user.view');
  const canAssign = hasPermission('user.update');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modal, setModal] = useState<UserModal>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({ status: 'all' });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const filterWrapRef = useRef<HTMLDivElement>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const closeModal = () => setModal(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');
    userService.getAll().then((u) => {
      if (!cancelled) {
        setUsers(u);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setLoadError('Failed to load users');
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
    return users.filter((u: any) => {
      const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [users, searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const visibleUsers = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

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

  const columns = [
    { key: 'name', header: 'Name', render: (item: any) => item.name },
    { key: 'email', header: 'Email', render: (item: any) => item.email },
    { key: 'roles', header: 'Role', render: (item: any) => item.roles?.map((r: string) => r.replace('role-', 'Role ')).join(', ') || '—' },
    { key: 'status', header: 'Status', render: (item: any) => (
      <Badge variant={item.status === 'active' ? 'success' : 'default'}>{item.status}</Badge>
    )},
    { key: 'actions', header: 'Actions', render: (item: any) => (
      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
        {canView && (
          <Link to={`/dashboard/users/${item.id}`} style={{ textDecoration: 'none', display: 'inline-flex' }}><button
            type="button"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '36px', padding: '0 12px', borderRadius: '8px', border: '1px solid #97764D', backgroundColor: 'transparent', color: '#232D36', fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-family-sans)', cursor: 'pointer', transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#232D36'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = '#232D36'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#232D36'; e.currentTarget.style.borderColor = '#97764D'; }}
          >View</button></Link>
        )}
        {canAssign && (
          <button
            type="button"
            onClick={() => setModal({ mode: 'assign', id: item.id })}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '36px', padding: '0 12px', borderRadius: '8px', border: '1px solid #232D36', backgroundColor: '#232D36', color: '#FFFFFF', fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-family-sans)', cursor: 'pointer', transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#97764D'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = '#97764D'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#232D36'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = '#232D36'; }}
          >Assign Role</button>
        )}
        {canAssign && (
          <button
            type="button"
            onClick={() => setModal({ mode: 'assignPerms', id: item.id })}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '36px', padding: '0 12px', borderRadius: '8px', border: '1px solid #232D36', backgroundColor: '#232D36', color: '#FFFFFF', fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-family-sans)', cursor: 'pointer', transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#97764D'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = '#97764D'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#232D36'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = '#232D36'; }}
          >Assign Permission</button>
        )}
      </div>
    )},
  ];

  return (
    <div className="adm-page">
      <div className="adm-head">
        <div>
          <h1 className="adm-h1">Pengguna</h1>
          <p className="adm-sub">Manage user accounts and role assignments</p>
        </div>
        <Button variant="primary" className="adm-cta" onClick={() => setModal({ mode: 'create' })}>Add User</Button>
      </div>
      <div className="res-toolbar" role="search" style={{ marginBottom: '20px' }}>
        <div className="res-toolbar__filterwrap" ref={filterWrapRef}>
          <Button
            onClick={() => (filterOpen ? closeFilter() : setFilterOpen(true))}
            aria-expanded={filterOpen}
            aria-controls="user-filter-panel"
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
                <div className="res-cascade__panel1" role="dialog" aria-label="User filters">
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
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            aria-label="Search users"
          />
          <span className="adm-count" style={{ whiteSpace: 'nowrap' }}>
            {filtered.length} result(s)
          </span>
        </div>
      </div>
      {loadError && <div role="alert" style={{ color: '#C85C5C', fontSize: '14px', marginBottom: '12px' }}>{loadError}</div>}
      <Table columns={columns} data={visibleUsers} emptyMessage={isLoading ? 'Loading users...' : 'No users found'} />
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
        title={modal?.mode === 'assign' ? 'Assign Role' : modal?.mode === 'assignPerms' ? 'Assign Permission' : 'Add User'}
        size="md"
      >
        {modal?.mode === 'create' && (
          <UserForm key="new" onSuccess={handleModalSuccess} onCancel={closeModal} />
        )}
        {modal?.mode === 'assign' && (
          <UserRoleForm key={modal.id} userId={modal.id} onSuccess={handleModalSuccess} onCancel={closeModal} />
        )}
        {modal?.mode === 'assignPerms' && (
          <UserPermissionForm key={`perms-${modal.id}`} userId={modal.id} onSuccess={handleModalSuccess} onCancel={closeModal} />
        )}
      </Modal>
    </div>
  );
}
