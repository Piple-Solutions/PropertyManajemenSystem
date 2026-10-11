export const expenseCategories = ['Utilities', 'Staff', 'Maintenance', 'Supplies', 'Marketing', 'Food & Beverage', 'Laundry', 'Other'] as const;
export const expenseCategoryLabels: Record<string, string> = {
  Utilities: 'Utilities',
  Staff: 'Staff',
  Maintenance: 'Maintenance',
  Supplies: 'Supplies',
  Marketing: 'Marketing',
  'Food & Beverage': 'Food & Beverage',
  Laundry: 'Laundry',
  Other: 'Other',
};
export const expenseCategoryColors: Record<string, string> = {
  Utilities: '#5C7FA3',
  Staff: '#6F4528',
  Maintenance: '#C58A3A',
  Supplies: '#4F8A5B',
  Marketing: '#C85C5C',
  'Food & Beverage': '#9A6A32',
  Laundry: '#8B5E3C',
  Other: '#A0958B',
};
export const expenseStatuses = ['Paid', 'Pending'] as const;
export const expenseStatusLabels: Record<string, string> = {
  Paid: 'Paid',
  Pending: 'Pending',
};
export const expenseStatusColors: Record<string, string> = {
  Paid: '#4F8A5B',
  Pending: '#9A6A32',
};
