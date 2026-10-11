export const reservationStatuses = ['reserved', 'checked-in', 'checked-out', 'cancelled'] as const;
export const reservationSources = ['direct', 'phone', 'whatsapp', 'website', 'ota', 'other'] as const;
export const reservationStatusLabels: Record<string, string> = {
  reserved: 'Reserved',
  'checked-in': 'Checked In',
  'checked-out': 'Checked Out',
  cancelled: 'Cancelled',
};
export const reservationSourceLabels: Record<string, string> = {
  direct: 'Direct',
  phone: 'Phone',
  whatsapp: 'WhatsApp',
  website: 'Website',
  ota: 'OTA',
  other: 'Other',
};
export const reservationStatusColors: Record<string, string> = {
  reserved: '#9A6A32',
  'checked-in': '#4F8A5B',
  'checked-out': '#756A61',
  cancelled: '#C85C5C',
};
export const reservationSourceColors: Record<string, string> = {
  direct: '#6F4528',
  phone: '#5C7FA3',
  whatsapp: '#4F8A5B',
  website: '#C58A3A',
  ota: '#8B5E3C',
  other: '#A0958B',
};
