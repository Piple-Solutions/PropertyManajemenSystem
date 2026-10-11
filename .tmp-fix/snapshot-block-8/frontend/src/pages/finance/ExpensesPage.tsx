import { useMemo, useState, useEffect, useRef } from 'react';
import { Filter, X, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { Card } from '@/components/shared/Card';
import { Table } from '@/components/shared/Table';
import { Badge } from '@/components/shared/Badge';
import { Modal } from '@/components/shared/Modal';
import { expenseService } from '@/services/expenseService';
import { expenseCategories, expenseCategoryLabels, expenseStatusLabels } from '@/constants/expenseCategories';
import { ExpenseForm } from '@/components/shared/ExpenseForm';
import '../../styles/finance-responsive.css';
import '../../styles/reservation-list.css';

const FILTER_CATEGORIES = [
  {
    key: 'category',
    label: 'Category',
    options: [
      { value: 'all', label: 'All Categories' },
      ...expenseCategories.map((c) => ({ value: c, label: expenseCategoryLabels[c] })),
    ],
  },
  {
    key: 'status',
    label: 'Status',
    options: [
      { value: 'all', label: 'All Status' },
      { value: 'Paid', label: 'Paid' },
      { value: 'Pending', label: 'Pending' },
    ],
  },
];

export default function ExpensesPage() {
  const service = expenseService;
  const [showForm, setShowForm] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({ category: 'all', status: 'all' });
  const filterWrapRef = useRef<HTMLDivElement>(null);
  const expenses = service.getAll();

  const filteredExpenses = useMemo(() => {
    let result = expenses;
    if (categoryFilter !== 'all') {
      result = result.filter((e) => e.category === categoryFilter);
    }
    if (statusFilter !== 'all') {
      result = result.filter((e) => e.status === statusFilter);
    }
    return result;
  }, [expenses, categoryFilter, statusFilter]);

  const activeFilterCount = (categoryFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0);

  const applyFilters = () => {
    setCategoryFilter(draft.category);
    setStatusFilter(draft.status);
    setFilterOpen(false);
  };

  const resetFilters = () => {
    setDraft({ category: 'all', status: 'all' });
    setCategoryFilter('all');
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

  const totalAmount = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  const columns = [
    { key: 'date', header: 'Date', render: (item: any) => item.date },
    { key: 'category', header: 'Category', render: (item: any) => <Badge variant="default">{expenseCategoryLabels[item.category] || item.category}</Badge> },
    { key: 'description', header: 'Description', render: (item: any) => item.description },
    { key: 'amount', header: 'Amount', render: (item: any) => `Rp ${item.amount.toLocaleString('id-ID')}` },
    { key: 'status', header: 'Status', render: (item: any) => <Badge variant={item.status === 'Paid' ? 'success' : 'warning'}>{expenseStatusLabels[item.status] || item.status}</Badge> },
  ];

  return (
    <div className="fin-page">
      <div className="fin-head" style={{ marginBottom: '20px' }}>
        <h1 className="fin-h1" style={{ marginBottom: 0 }}>Expenses</h1>
        <Button onClick={() => setShowForm(true)}>+ New Expense</Button>
      </div>
      {showForm && (
        <Modal open={showForm} onClose={() => setShowForm(false)} title="New Expense" size="md">
          <ExpenseForm
            onSubmit={(data) => {
              service.create({
                category: data.category,
                description: data.description,
                amount: data.amount,
                date: data.date,
                status: data.status,
              });
              setShowForm(false);
            }}
            onCancel={() => setShowForm(false)}
          />
        </Modal>
      )}
      <div className="res-toolbar" role="search" style={{ marginBottom: '20px' }}>
        <div className="res-toolbar__filterwrap" ref={filterWrapRef}>
          <Button
            onClick={() => (filterOpen ? closeFilter() : setFilterOpen(true))}
            aria-expanded={filterOpen}
            aria-controls="expense-filter-panel"
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
                <div className="res-cascade__panel1" role="dialog" aria-label="Expense filters">
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
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: 'auto' }}>
          <span className="fin-count">{filteredExpenses.length} expenses</span>
          <span className="fin-total">
            Total: Rp {totalAmount.toLocaleString('id-ID')}
          </span>
        </div>
      </div>
      <Card>
        <Table columns={columns} data={filteredExpenses} emptyMessage="Tidak ada pengeluaran ditemukan" />
      </Card>
    </div>
  );
}
