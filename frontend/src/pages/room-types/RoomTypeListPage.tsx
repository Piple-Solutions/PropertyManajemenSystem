import { useState, useMemo, useEffect, useRef } from 'react';
import { Pencil, Trash2, Filter, X, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import { roomTypeService } from '@/services/roomTypeService';
import { Table } from '@/components/shared/Table';
import { Button } from '@/components/shared/Button';
import { Badge } from '@/components/shared/Badge';
import { Input } from '@/components/shared/Input';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Modal } from '@/components/shared/Modal';
import { RoomTypeForm } from '@/components/shared/RoomTypeForm';
import type { RoomType } from '@/types/auth.types';
import '../../styles/reservation-list.css';

type RoomTypeModal = { mode: 'create' } | { mode: 'edit'; id: string } | null;

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

export default function RoomTypeListPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [modal, setModal] = useState<RoomTypeModal>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({ status: 'all' });
  const filterWrapRef = useRef<HTMLDivElement>(null);
  const service = roomTypeService;
  const [allTypes, setAllTypes] = useState<RoomType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const closeModal = () => setModal(null);

  const handleModalSuccess = () => {
    closeModal();
    setReloadToken((t) => t + 1);
  };

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');
    service.getAll().then((rows) => {
      if (!cancelled) {
        setAllTypes(rows);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setLoadError('Failed to load room types');
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const filteredTypes = useMemo(() => {
    return allTypes.filter((type) => {
      const matchesSearch = type.name.toLowerCase().includes(search.toLowerCase()) ||
        type.description.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || type.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [allTypes, search, statusFilter]);

  const activeFilterCount = statusFilter !== 'all' ? 1 : 0;

  const applyFilters = () => {
    setStatusFilter(draft.status);
    setFilterOpen(false);
  };

  const resetFilters = () => {
    setDraft({ status: 'all' });
    setStatusFilter('all');
    setActiveCategory(null);
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

  const handleDelete = async (id: string) => {
    await service.delete(id);
    setDeleteConfirm(null);
    setReloadToken((t) => t + 1);
  };

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (item: RoomType) => (
        <span>{item.name}</span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (item: RoomType) => (
          <span title={item.description} style={{ display: 'block', width: '100%', fontSize: '13px', color: '#6B7881', whiteSpace: 'normal', overflowWrap: 'break-word' }}>
          {item.description}
        </span>
      ),
    },
    {
      key: 'defaultRate',
      header: 'Default Rate',
      render: (item: RoomType) => <span>Rp {item.defaultRate.toLocaleString('id-ID')}</span>,
    },
    {
      key: 'facilities',
      header: 'Facilities',
      render: (item: RoomType) => (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {item.facilities.slice(0, 3).map((f) => (
            <Badge key={f} variant="info" size="sm">{f}</Badge>
          ))}
          {item.facilities.length > 3 && <Badge variant="default" size="sm">+{item.facilities.length - 3}</Badge>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: RoomType) => (
        <Badge variant={item.status === 'active' ? 'success' : 'warning'}>{item.status}</Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (item: RoomType) => (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button
            type="button"
            aria-label={`Edit room type ${item.name}`}
            onClick={() => setModal({ mode: 'edit', id: item.id })}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '8px', border: '1px solid #97764D', backgroundColor: 'transparent', color: '#232D36', cursor: 'pointer', transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#232D36'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = '#232D36'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#232D36'; e.currentTarget.style.borderColor = '#97764D'; }}
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Delete room type ${item.name}`}
            onClick={() => setDeleteConfirm(item.id)}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '8px', border: '1px solid #232D36', backgroundColor: '#232D36', color: '#FFFFFF', cursor: 'pointer', transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#97764D'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = '#97764D'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#232D36'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = '#232D36'; }}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: 'var(--space-xl, 20px)', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#232D36', fontFamily: 'var(--font-family-sans)', margin: 0 }}>Room Types</h1>
          <p style={{ color: '#6B7881', margin: '4px 0 0 0', fontSize: '14px' }}>Manage room type categories</p>
        </div>
        <Button onClick={() => setModal({ mode: 'create' })}>+ New Room Type</Button>
      </div>

      <div className="res-toolbar" role="search" style={{ marginBottom: '20px' }}>
        <div className="res-toolbar__filterwrap" ref={filterWrapRef}>
          <Button
            onClick={() => (filterOpen ? closeFilter() : setFilterOpen(true))}
            aria-expanded={filterOpen}
            aria-controls="roomtype-filter-panel"
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
                <div className="res-cascade__panel1" role="dialog" aria-label="Room type filters">
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
        <div className="res-toolbar__search">
          <Input
            placeholder="Search room types..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search room types"
          />
        </div>
        <span style={{ display: 'flex', alignItems: 'center', fontSize: '14px', color: '#6B7881' }}>
          {filteredTypes.length} result(s)
        </span>
      </div>

      {loadError && <p role="alert" style={{ fontSize: '14px', color: '#962222' }}>{loadError}</p>}

      <Table columns={columns} data={filteredTypes} emptyMessage={isLoading ? 'Loading room types...' : undefined} />

      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        title="Delete Room Type"
        message="Are you sure you want to delete this room type? This action cannot be undone."
        confirmText="Delete"
        destructive
      />

      <Modal
        open={modal !== null}
        onClose={closeModal}
        title={modal?.mode === 'edit' ? 'Edit Room Type' : 'New Room Type'}
        size="lg"
      >
        {modal !== null && (
          <RoomTypeForm
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
