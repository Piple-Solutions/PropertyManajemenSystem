export interface AppUser {
  id: string;
  name: string;
  email: string;
  password: string;
  roles: AppRole[];
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export interface AppRole {
  id: string;
  name: string;
  description: string;
  permissions: AppPermission[];
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

export interface AppPermission {
  id: string;
  name: string;
  description: string;
  resource: string;
  action: string;
  group: string;
}

export interface RoomType {
  id: string;
  name: string;
  description: string;
  capacity: number;
  facilities: string[];
  defaultRate: number;
  images: string[];
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface Room {
  id: string;
  roomNumber: string;
  roomTypeId: string;
  status: 'active' | 'inactive' | 'maintenance';
  createdAt: string;
  updatedAt: string;
}

export interface Reservation {
  id: string;
  reservationCode: string;
  guestName: string;
  source: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  notes: string;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReservationRoom {
  id: string;
  reservationId: string;
  roomId: string;
  roomNumber: string;
  roomTypeName: string;
  rate: number;
  subtotal: number;
  createdAt: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  reservationId?: string;
  guestName: string;
  source: string;
  invoiceDate: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentStatus: 'Pending' | 'Paid' | 'Overdue' | 'Partial';
  invoiceStatus: 'Draft' | 'Sent' | 'Completed' | 'Cancelled';
  /**
   * Amount settled so far, in whole rupiah. Optional: absent means "not
   * tracked", in which case settlement falls back to `paymentStatus`. When
   * present it is authoritative (see `utils/invoicePayment.ts`).
   */
  totalPaid?: number;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Expense {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  status?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  category: string;
  action: string;
  description: string;
  userId: string;
  userName: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, string>;
  ipAddress?: string;
  createdAt: string;
}

export interface Sale {
  id: string;
  reservationId?: string;
  invoiceId?: string;
  date: string;
  amount: number;
  source: string;
  description: string;
}
