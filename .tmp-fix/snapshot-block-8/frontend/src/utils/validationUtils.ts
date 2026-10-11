import { z } from 'zod';

export const reservationSchema = z.object({
  guestName: z.string().min(2, 'Nama minimal 2 karakter'),
  source: z.string().min(1, 'Sumber reservasi wajib diisi'),
  checkInDate: z.date().refine((d) => d >= new Date(), 'Tanggal check-in harus hari ini atau setelahnya'),
  checkOutDate: z.date().refine((d) => d > new Date(), 'Tanggal check-out harus setelah check-in'),
});

export const userSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter'),
  email: z.string().email('Email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
});

export const registrationSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter'),
  email: z.string().email('Email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  confirmPassword: z.string().min(6, 'Konfirmasi password minimal 6 karakter'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
  confirmPassword: z.string().min(6, 'Confirm password is required'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const resetPasswordSchema = z.object({
  password: z.string().min(6, 'Password minimal 6 karakter'),
  confirmPassword: z.string().min(6, 'Konfirmasi password minimal 6 karakter'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const roomTypeSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter'),
  description: z.string().min(1, 'Deskripsi wajib diisi'),
  capacity: z.number().positive('Kapasitas harus angka positif'),
  defaultRate: z.number().positive('Tarif harus angka positif'),
});

export const roomSchema = z.object({
  roomNumber: z.string().min(1, 'Nomor kamar wajib diisi'),
  roomTypeId: z.string().min(1, 'Tipe kamar wajib dipilih'),
});

export const invoiceSchema = z.object({
  invoiceNumber: z.string().min(1, 'Nomor invoice wajib diisi'),
  guestName: z.string().min(1, 'Nama tamu wajib diisi'),
  invoiceDate: z.date(),
  dueDate: z.date(),
  items: z.array(z.object({
    description: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().positive(),
  })).min(1, 'Minimal satu item'),
  discount: z.number().min(0).default(0),
});

export const expenseSchema = z.object({
  category: z.string().min(1, 'Kategori wajib diisi'),
  description: z.string().min(1, 'Deskripsi wajib diisi'),
  amount: z.number().positive('Jumlah harus angka positif'),
  date: z.string().min(1, 'Tanggal wajib diisi'),
  status: z.enum(['Paid', 'Pending']).default('Pending'),
});
