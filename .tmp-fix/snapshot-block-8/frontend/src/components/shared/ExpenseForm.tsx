import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from './Input';
import { Select } from './Select';
import { Button } from './Button';
import { Card } from './Card';
import { expenseSchema } from '@/utils/validationUtils';
import { expenseCategories, expenseCategoryLabels } from '@/constants/expenseCategories';

type CreateExpenseFormData = z.infer<typeof expenseSchema>;

interface ExpenseFormProps {
  onSubmit: (data: CreateExpenseFormData) => void;
  onCancel?: () => void;
}

export function ExpenseForm({ onSubmit, onCancel }: ExpenseFormProps) {
  const { register, handleSubmit, formState: { errors } } = useForm<CreateExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { category: '', description: '', amount: 0, date: '', status: 'Pending' },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          <Select label="Category" error={!!errors.category} options={expenseCategories.map((c) => ({ value: c, label: expenseCategoryLabels[c] }))} {...register('category')} />
          <Input label="Date" type="date" error={!!errors.date} {...register('date')} />
          <Select label="Status" options={[{ value: 'Pending', label: 'Pending' }, { value: 'Paid', label: 'Paid' }]} {...register('status')} />
        </div>
        <Input label="Description" error={!!errors.description} errorMessage={errors.description?.message} {...register('description')} />
        <Input label="Amount" type="number" error={!!errors.amount} errorMessage={errors.amount?.message} {...register('amount', { valueAsNumber: true })} />
      </Card>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
        <Button type="submit">Create Expense</Button>
      </div>
    </form>
  );
}
