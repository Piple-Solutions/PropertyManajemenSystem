export const activityCategories = ['authentication', 'reservation', 'finance', 'system'] as const;
export const activityCategoryLabels: Record<string, string> = {
  authentication: 'Authentication',
  reservation: 'Reservation',
  finance: 'Finance',
  system: 'System',
};
export const activityCategoryColors: Record<string, string> = {
  authentication: '#5C7FA3',
  reservation: '#6F4528',
  finance: '#4F8A5B',
  system: '#A0958B',
};
export const activityActions: Record<string, string[]> = {
  authentication: ['login', 'logout', 'register', 'password_change'],
  reservation: ['create', 'update', 'cancel', 'checkin', 'checkout'],
  finance: ['invoice_create', 'invoice_send', 'invoice_pay', 'expense_create', 'payment'],
  system: ['login', 'logout', 'settings_update'],
};
export const activityActionLabels: Record<string, string> = {
  login: 'Login',
  logout: 'Logout',
  register: 'Registration',
  password_change: 'Password Change',
  create: 'Created',
  update: 'Updated',
  cancel: 'Cancelled',
  checkin: 'Checked In',
  checkout: 'Checked Out',
  invoice_create: 'Invoice Created',
  invoice_send: 'Invoice Sent',
  invoice_pay: 'Invoice Paid',
  expense_create: 'Expense Created',
  payment: 'Payment Recorded',
  settings_update: 'Settings Updated',
};
