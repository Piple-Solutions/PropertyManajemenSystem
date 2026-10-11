import { useState, useMemo, useEffect, useRef } from 'react';
import { Pencil, Trash2, Filter, X, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import { invoiceService } from '@/services/invoiceService';
import { reservationService } from '@/services/reservationService';
import { Button } from '@/components/shared/Button';
import { Card } from '@/components/shared/Card';
import { Input } from '@/components/shared/Input';
import { Table } from '@/components/shared/Table';
import { Badge } from '@/components/shared/Badge';
import { InvoiceForm } from '@/components/shared/InvoiceForm';
import { InvoiceDetailPopup } from '@/components/shared/InvoiceDetailPopup';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Modal } from '@/components/shared/Modal';
import { Pagination } from '@/components/shared/Pagination';
import { ErrorState } from '@/components/shared/ErrorState';
import { Loading } from '@/components/shared/Loading';
import { useAsyncData } from '@/hooks/useAsyncData';
import { apiErrorMessage } from '@/services/api';
import type { Invoice } from '@/types/auth.types';
import '../../styles/finance-responsive.css';
import '../../styles/reservation-list.css';

type FormMode = { kind: 'create' } | { kind: 'edit'; invoice: Invoice };

type FilterCategory = 'status' | 'payment';

const FILTER_CATEGORIES: { key: FilterCategory; label: string; options: { value: string; label: string }[] }[] = [
  {
    key: 'status',
    label: 'Status',
    options: [
      { value: 'all', label: 'All Status' },
      { value: 'Draft', label: 'Draft' },
      { value: 'Completed', label: 'Completed' },
    ],
  },
  {
    key: 'payment',
    label: 'Payment',
    options: [
      { value: 'all', label: 'All' },
      { value: 'Pending', label: 'Pending' },
      { value: 'Paid', label: 'Paid' },
    ],
  },
];

export default function InvoiceListPage() {
  const service = invoiceService;
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [refreshKey, setRefreshKey] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<FilterCategory | null>(null);
  const [draft, setDraft] = useState<{ status: string; payment: string }>({ status: 'all', payment: 'all' });
  const filterWrapRef = useRef<HTMLDivElement>(null);

  // FE-001: real data (async). `refreshKey` still drives a refetch after every write.
  const { data: invoices, isLoading, error: loadError, reload } = useAsyncData<Invoice[]>(() => service.getAll(), []);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (refreshKey > 0) reload();
  }, [refreshKey, reload]);

  useEffect(() => {
    if (!feedback) return;
    const t = window.setTimeout(() => setFeedback(null), 4000);
    return () => window.clearTimeout(t);
  }, [feedback]);

  const filteredInvoices = useMemo(() => {
    let result = invoices;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter((inv) => inv.invoiceNumber.toLowerCase().includes(s) || inv.guestName.toLowerCase().includes(s));
    }
    if (statusFilter !== 'all') {
      result = result.filter((inv) => inv.invoiceStatus === statusFilter);
    }
    if (paymentFilter !== 'all') {
      result = result.filter((inv) => inv.paymentStatus === paymentFilter);
    }
    return result;
  }, [invoices, search, statusFilter, paymentFilter]);

  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (paymentFilter !== 'all' ? 1 : 0);

  const applyFilters = () => {
    setStatusFilter(draft.status);
    setPaymentFilter(draft.payment);
    setFilterOpen(false);
    setCurrentPage(1);
  };

  const resetFilters = () => {
    setDraft({ status: 'all', payment: 'all' });
    setStatusFilter('all');
    setPaymentFilter('all');
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

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const visibleInvoices = filteredInvoices.slice((safePage - 1) * pageSize, safePage * pageSize);

  const detailInvoice = detailInvoiceId ? invoices.find((inv) => inv.id === detailInvoiceId) || null : null;

  const [reservationCodes, setReservationCodes] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    reservationService.getAll().then((rows) => {
      if (!cancelled) setReservationCodes(new Map(rows.map((r) => [r.id, r.reservationCode])));
    }).catch(() => {
      if (!cancelled) setReservationCodes(new Map());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const reservationCodeOf = (inv: Invoice) => {
    if (!inv.reservationId) return '—';
    return reservationCodes.get(inv.reservationId) || inv.reservationId;
  };

  // Totals are computed by the server (discount is a percent); only the
  // editable fields are sent. A refused write keeps the dialog open and shows
  // the API's message.
  const toPayload = (data: Parameters<Parameters<typeof InvoiceForm>[0]['onSubmit']>[0]) => ({
    invoiceNumber: data.invoiceNumber,
    reservationId: data.reservationId || undefined,
    guestName: data.guestName,
    source: data.source,
    invoiceDate: data.invoiceDate,
    items: data.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    discount: data.discount,
    paymentStatus: data.paymentStatus,
    invoiceStatus: data.invoiceStatus,
  });

  const handleCreate = async (data: Parameters<Parameters<typeof InvoiceForm>[0]['onSubmit']>[0]) => {
    setSaveError(null);
    try {
      await service.create(toPayload(data));
    } catch (err) {
      setSaveError(apiErrorMessage(err, ''));
      return;
    }
    setFormMode(null);
    setRefreshKey((k) => k + 1);
    setCurrentPage(1);
    setFeedback('Invoice created successfully.');
  };

  const handleUpdate = async (data: Parameters<Parameters<typeof InvoiceForm>[0]['onSubmit']>[0]) => {
    if (formMode?.kind !== 'edit') return;
    const updatedId = formMode.invoice.id;
    setSaveError(null);
    try {
      const saved = await service.update(updatedId, toPayload(data));
      if (!saved) return;
    } catch (err) {
      setSaveError(apiErrorMessage(err, ''));
      return;
    }
    setFormMode(null);
    setDetailInvoiceId(updatedId);
    setRefreshKey((k) => k + 1);
    setCurrentPage(1);
    setFeedback('Invoice updated successfully.');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteError(null);
    setDeleteTarget(null);
    try {
      await service.delete(target.id);
    } catch (err) {
      // e.g. only Draft invoices can be deleted: show the API's explanation.
      setDeleteError(apiErrorMessage(err, ''));
      return;
    }
    if (detailInvoiceId === target.id) setDetailInvoiceId(null);
    setRefreshKey((k) => k + 1);
    setCurrentPage(1);
    setFeedback('Invoice deleted successfully.');
  };

  const columns = [
    { key: 'invoiceNumber', header: 'Invoice Number', render: (item: Invoice) => <span style={{ fontWeight: 600, color: '#97764D' }}>{item.invoiceNumber}</span> },
    { key: 'reservationId', header: 'Reservation', render: (item: Invoice) => reservationCodeOf(item) },
    { key: 'guestName', header: 'Guest', render: (item: Invoice) => item.guestName },
    { key: 'invoiceDate', header: 'Date', render: (item: Invoice) => item.invoiceDate },

    { key: 'discount', header: 'Discount', render: (item: Invoice) => <div style={{ textAlign: 'center' }}>{item.discount > 0 ? `${item.discount}%` : '—'}</div> },
    { key: 'total', header: 'Total', render: (item: Invoice) => `Rp ${item.total.toLocaleString('id-ID')}` },
    { key: 'paymentStatus', header: 'Payment', render: (item: Invoice) => <div style={{ textAlign: 'center' }}><Badge variant={item.paymentStatus === 'Paid' ? 'success' : item.paymentStatus === 'Overdue' ? 'danger' : (item.paymentStatus === 'Partial' || item.paymentStatus === 'Pending') ? 'warning' : 'default'}>{item.paymentStatus}</Badge></div> },
    { key: 'invoiceStatus', header: 'Status', render: (item: Invoice) => <div style={{ textAlign: 'center' }}><Badge variant={item.invoiceStatus === 'Completed' ? 'success' : item.invoiceStatus === 'Cancelled' ? 'danger' : item.invoiceStatus === 'Sent' ? 'info' : item.invoiceStatus === 'Draft' ? 'warning' : 'default'}>{item.invoiceStatus}</Badge></div> },
    {
      key: 'actions',
      header: 'Actions',
      render: (item: Invoice) => (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            aria-label={`Edit ${item.invoiceNumber}`}
            onClick={() => { setDetailInvoiceId(null); setFormMode({ kind: 'edit', invoice: item }); }}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '8px', border: '1px solid #97764D', backgroundColor: 'transparent', color: '#232D36', cursor: 'pointer', transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#232D36'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = '#232D36'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#232D36'; e.currentTarget.style.borderColor = '#97764D'; }}
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Delete ${item.invoiceNumber}`}
            onClick={() => setDeleteTarget(item)}
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
    <div className="fin-page">
      <div className="fin-head" style={{ marginBottom: '20px' }}>
        <h1 className="fin-h1" style={{ marginBottom: 0 }}>Invoices</h1>
        <Button onClick={() => { setSaveError(null); setFormMode({ kind: 'create' }); }}>+ New Invoice</Button>
      </div>

      {feedback && (
        <div role="status" style={{ marginBottom: '16px', backgroundColor: '#E3EDE4', border: '1px solid #2F5D37', color: '#2F5D37', borderRadius: '8px', padding: '12px 14px', fontSize: '14px', fontWeight: 600 }}>
          {feedback}
        </div>
      )}
      {deleteError !== null && (
        <div style={{ marginBottom: '16px' }}>
          <ErrorState description={deleteError || undefined} />
        </div>
      )}
      {loadError !== null && (
        <div style={{ marginBottom: '16px' }}>
          <ErrorState description={loadError || undefined} onRetry={reload} />
        </div>
      )}

      <div className="res-toolbar" role="search" style={{ marginBottom: '20px' }}>
        <div className="res-toolbar__filterwrap" ref={filterWrapRef}>
          <Button
            onClick={() => (filterOpen ? closeFilter() : setFilterOpen(true))}
            aria-expanded={filterOpen}
            aria-controls="invoice-filter-panel"
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
                <div className="res-cascade__panel1" role="dialog" aria-label="Invoice filters">
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
            placeholder="Search invoice or guest..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            aria-label="Search invoices"
          />
        </div>
      </div>

       <Card raised>
        {isLoading ? <Loading /> : (
        <Table
          columns={columns}
          data={visibleInvoices}
          onRowClick={(item) => setDetailInvoiceId(item.id)}
          emptyMessage="Tidak ada invoice ditemukan"
        />
        )}
      </Card>

      {filteredInvoices.length > 0 && (
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          totalItems={filteredInvoices.length}
          pageSize={pageSize}
          pageSizeOptions={[10, 20]}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
        />
      )}

      <InvoiceDetailPopup
        invoice={detailInvoice}
        onClose={() => setDetailInvoiceId(null)}
        onEdit={(inv) => { setDetailInvoiceId(null); setSaveError(null); setFormMode({ kind: 'edit', invoice: inv }); }}
        onDelete={(inv) => setDeleteTarget(inv)}
      />

      {formMode && (
        <Modal
          open
          onClose={() => setFormMode(null)}
          title={formMode.kind === 'edit' ? `Edit Invoice ${formMode.invoice.invoiceNumber}` : 'New Invoice'}
          size="xl"
        >
          {saveError !== null && <ErrorState description={saveError || undefined} />}
          <InvoiceForm
            key={formMode.kind === 'edit' ? formMode.invoice.id : 'new'}
            onSubmit={formMode.kind === 'edit' ? handleUpdate : handleCreate}
            onCancel={() => setFormMode(null)}
            initialData={formMode.kind === 'edit' ? {
              invoiceNumber: formMode.invoice.invoiceNumber,
              reservationId: formMode.invoice.reservationId || '',
              guestName: formMode.invoice.guestName,
              source: formMode.invoice.source,
              invoiceDate: formMode.invoice.invoiceDate,
              items: formMode.invoice.items.map((it) => ({ description: it.description, quantity: it.quantity, unitPrice: it.unitPrice })),
              discount: formMode.invoice.discount,
              invoiceStatus: formMode.invoice.invoiceStatus,
              paymentStatus: formMode.invoice.paymentStatus,
            } : undefined}
          />
        </Modal>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Invoice"
        message={deleteTarget ? `Are you sure you want to delete ${deleteTarget.invoiceNumber}? This action cannot be undone.` : ''}
        confirmText="Yes, Delete"
        destructive
      />
    </div>
  );
}
