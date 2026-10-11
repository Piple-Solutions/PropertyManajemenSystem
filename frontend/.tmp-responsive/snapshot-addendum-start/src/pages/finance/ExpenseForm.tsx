import { Card } from '@/components/shared/Card';
import { Input } from '@/components/shared/Input';
import { Select } from '@/components/shared/Select';
import { Button } from '@/components/shared/Button';
import '../../styles/finance-responsive.css';

// NOTE: legacy unrouted page (ExpensesPage uses the shared ExpenseForm in a
// modal). Kept flat so the Phase 6 token sweep stays clean.
export default function ExpenseForm() {
  return (
    <div className="fin-page" style={{ maxWidth: '600px' }}>
      <h1 className="fin-h1">Create Expense</h1>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input label="Category" placeholder="Enter category" />
          <Input label="Description" placeholder="Enter description" />
          <Input label="Amount" type="number" placeholder="Enter amount" />
          <Select label="Status" options={[{ value: 'Pending', label: 'Pending' }, { value: 'Paid', label: 'Paid' }]} />
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <Button variant="outline">Cancel</Button>
            <Button>Create Expense</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
