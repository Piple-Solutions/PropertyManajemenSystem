export function getStatusBadge(status: string) {
  const statusMap: Record<string, { background: string; text: string; label: string }> = {
    Reserved: { background: '#F2E7D7', text: '#9A6A32', label: 'Menunggu' },
    CheckedIn: { background: '#E3F0E5', text: '#4F8A5B', label: 'Check-In' },
    CheckedOut: { background: '#E5DCD1', text: '#756A61', label: 'Check-Out' },
    Cancelled: { background: '#F6E1E1', text: '#C85C5C', label: 'Dibatalkan' },
    Pending: { background: '#F2E7D7', text: '#9A6A32', label: 'Menunggu' },
    Completed: { background: '#E3F0E5', text: '#4F8A5B', label: 'Selesai' },
    Draft: { background: '#E9DFD1', text: '#756A61', label: 'Draft' },
    Sent: { background: '#EFE7DC', text: '#4A2C1A', label: 'Terkirim' },
    Paid: { background: '#E3F0E5', text: '#4F8A5B', label: 'Lunas' },
    Overdue: { background: '#F6E1E1', text: '#C85C5C', label: 'Jatuh Tempo' },
    Active: { background: '#E3F0E5', text: '#4F8A5B', label: 'Aktif' },
    Inactive: { background: '#E5DCD1', text: '#756A61', label: 'Tidak Aktif' },
  };
  return statusMap[status] || { background: '#E9DFD1', text: '#756A61', label: status };
}
