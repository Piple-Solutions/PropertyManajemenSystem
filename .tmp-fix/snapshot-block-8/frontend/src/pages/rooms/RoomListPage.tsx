import { useState, useMemo, useEffect, useRef } from 'react';
import { Pencil, Trash2, Filter, X, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import { roomService } from '@/services/roomService';
import { roomTypeService } from '@/services/roomTypeService';
import { Table } from '@/components/shared/Table';
import { Button } from '@/components/shared/Button';
import { Badge } from '@/components/shared/Badge';
import { Input } from '@/components/shared/Input';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Modal } from '@/components/shared/Modal';
import { RoomForm } from '@/components/shared/RoomForm';
import { Pagination } from '@/components/shared/Pagination';
import { FloorMapCard } from '@/components/pms/FloorMapCard';

import { Room, RoomType } from '@/types/auth.types';
import '../../styles/reservation-list.css';

type RoomModal = { mode: 'create' } | { mode: 'edit'; id: string } | null;

export default function RoomListPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [modal, setModal] = useState<RoomModal>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({ type: 'all', status: 'all' });
  const filterWrapRef = useRef<HTMLDivElement>(null);
  const service = roomService;
  const typeService = roomTypeService;
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [allTypes, setAllTypes] = useState<RoomType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const tableRef = useRef<HTMLDivElement>(null);
  const closeModal = () => setModal(null);

  const handleModalSuccess = () => {
    closeModal();
    setReloadToken((t) => t + 1);
  };

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');
    Promise.all([service.getAll(), typeService.getAll()]).then(([rooms, types]) => {
      if (!cancelled) {
        setAllRooms(rooms);
        setAllTypes(types);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setLoadError('Failed to load rooms');
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const typeOptions = [
    { value: 'all', label: 'All Types' },
    ...allTypes.map((t) => ({ value: t.id, label: t.name })),
  ];

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'maintenance', label: 'Maintenance' },
  ];

  const FILTER_CATEGORIES = [
    { key: 'type', label: 'Room Type', options: typeOptions },
    { key: 'status', label: 'Status', options: statusOptions },
  ];

  const filteredRooms = useMemo(() => {
    return allRooms.filter((room) => {
      const matchesSearch = room.roomNumber.toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === 'all' || room.roomTypeId === typeFilter;
      const matchesStatus = statusFilter === 'all' || room.status === statusFilter;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [allRooms, search, typeFilter, statusFilter]);

  const activeFilterCount = (typeFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0);

  const totalPages = Math.max(1, Math.ceil(filteredRooms.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRooms = useMemo(() => {
    return filteredRooms.slice((safePage - 1) * pageSize, safePage * pageSize);
  }, [filteredRooms, safePage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, typeFilter, statusFilter]);

  const applyFilters = () => {
    setTypeFilter(draft.type);
    setStatusFilter(draft.status);
    setFilterOpen(false);
    setCurrentPage(1);
  };

  const resetFilters = () => {
    setDraft({ type: 'all', status: 'all' });
    setTypeFilter('all');
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

  const getTypeLabel = (roomTypeId: string) => {
    const type = allTypes.find((t) => t.id === roomTypeId);
    return type?.name || 'Unknown';
  };

  const handleDelete = async (id: string) => {
    await service.delete(id);
    setDeleteConfirm(null);
    setReloadToken((t) => t + 1);
  };

  const handleSelectRoom = (roomId: string | null) => {
    setSelectedRoomId(roomId);
    if (roomId) {
      const index = filteredRooms.findIndex((r) => r.id === roomId);
      if (index >= 0) {
        setCurrentPage(Math.floor(index / pageSize) + 1);
      }
    }
  };

  const handleRowClick = (room: Room) => {
    setSelectedRoomId((prev) => (prev === room.id ? null : room.id));
  };

  useEffect(() => {
    if (!selectedRoomId || !tableRef.current) return;
    const row = tableRef.current.querySelector(`[data-room-row="${selectedRoomId}"]`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedRoomId, safePage]);

  const columns = [
    {
      key: 'roomNumber',
      header: 'Room',
      render: (item: Room) => (
        <span>{item.roomNumber}</span>
      ),
    },
    {
      key: 'roomType',
      header: 'Type',
      render: (item: Room) => <span>{getTypeLabel(item.roomTypeId)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: Room) => (
        <Badge size="sm" variant={item.status === 'active' ? 'success' : item.status === 'maintenance' ? 'warning' : 'danger'}>
          {item.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (item: Room) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
          <button
            type="button"
            aria-label={`Edit room ${item.roomNumber}`}
            onClick={(e) => { e.stopPropagation(); setModal({ mode: 'edit', id: item.id }); }}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #97764D', backgroundColor: 'transparent', color: '#232D36', cursor: 'pointer', transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#232D36'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = '#232D36'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#232D36'; e.currentTarget.style.borderColor = '#97764D'; }}
          >
            <Pencil size={12} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Delete room ${item.roomNumber}`}
            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item.id); }}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #232D36', backgroundColor: '#232D36', color: '#FFFFFF', cursor: 'pointer', transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#97764D'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = '#97764D'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#232D36'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = '#232D36'; }}
          >
            <Trash2 size={12} aria-hidden="true" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: 'var(--space-xl, 20px)', maxWidth: '1400px', margin: '0 auto' }}>
      <style>{`
        @media (max-width: 1024px) {
          .rooms-layout {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#232D36', fontFamily: 'var(--font-family-sans)', margin: 0 }}>Rooms</h1>
          <p style={{ color: '#6B7881', margin: '4px 0 0 0', fontSize: '14px' }}>Manage hotel rooms</p>
        </div>
        <Button onClick={() => setModal({ mode: 'create' })}>+ New Room</Button>
      </div>

      <div className="res-toolbar" role="search" style={{ marginBottom: '20px' }}>
        <div className="res-toolbar__filterwrap" ref={filterWrapRef}>
          <Button
            onClick={() => (filterOpen ? closeFilter() : setFilterOpen(true))}
            aria-expanded={filterOpen}
            aria-controls="room-filter-panel"
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
                <div className="res-cascade__panel1" role="dialog" aria-label="Room filters">
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
        <div className="res-toolbar__search rooms-search" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Input
            placeholder="Search room number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search rooms"
          />
          <span style={{ fontSize: '14px', color: '#6B7881', whiteSpace: 'nowrap' }}>
            {filteredRooms.length} rooms
          </span>
        </div>
      </div>

      {loadError && <p role="alert" style={{ fontSize: '14px', color: '#962222' }}>{loadError}</p>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)',
          gap: '20px',
          alignItems: 'start',
        }}
        className="rooms-layout"
      >
        <FloorMapCard rooms={allRooms} selectedRoomId={selectedRoomId} onSelectRoom={handleSelectRoom} />
        <div ref={tableRef} style={{ minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
          <Table
            columns={columns}
            data={paginatedRooms}
            emptyMessage={isLoading ? 'Loading rooms...' : undefined}
            selectedId={selectedRoomId}
            onRowClick={handleRowClick}
            density="compact"
          />
          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            totalItems={filteredRooms.length}
            pageSize={pageSize}
            pageSizeOptions={[10, 25]}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
          />
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        title="Delete Room"
        message="Are you sure you want to delete this room?"
        confirmText="Delete"
        destructive
      />

      <Modal
        open={modal !== null}
        onClose={closeModal}
        title={modal?.mode === 'edit' ? 'Edit Room' : 'New Room'}
        size="lg"
      >
        {modal !== null && (
          <RoomForm
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
