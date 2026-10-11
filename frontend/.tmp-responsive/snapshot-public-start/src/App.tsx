import { Suspense, lazy } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { PublicLayout } from './layouts/PublicLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PublicOnlyRoute } from './components/PublicOnlyRoute';
import { RequirePermission } from './components/RequirePermission';

const HomePage = lazy(() => import('./pages/HomePage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const RoomTypesPage = lazy(() => import('./pages/RoomTypesPage'));
const GalleryPage = lazy(() => import('./pages/GalleryPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const UserListPage = lazy(() => import('./pages/users/UserListPage'));
const UserFormPage = lazy(() => import('./pages/users/UserFormPage'));
const UserRolePage = lazy(() => import('./pages/users/UserRolePage'));
const UserDetailPage = lazy(() => import('./pages/users/UserDetailPage'));
const ManagementPage = lazy(() => import('./pages/management/ManagementPage'));
const RoleListPage = lazy(() => import('./pages/roles/RoleListPage'));
const RoleFormPage = lazy(() => import('./pages/roles/RoleFormPage'));
const PermissionListPage = lazy(() => import('./pages/permissions/PermissionListPage'));
const RoomTypeListPage = lazy(() => import('./pages/room-types/RoomTypeListPage'));
const RoomTypeFormPage = lazy(() => import('./pages/room-types/RoomTypeFormPage'));
const RoomListPage = lazy(() => import('./pages/rooms/RoomListPage'));
const RoomFormPage = lazy(() => import('./pages/rooms/RoomFormPage'));
const ReservationListPage = lazy(() => import('./pages/reservations/ReservationListPage'));
const ReservationFormPage = lazy(() => import('./pages/reservations/ReservationFormPage'));
const ReservationDetailPage = lazy(() => import('./pages/reservations/ReservationDetailPage'));
const ReservationCalendarPage = lazy(() => import('./pages/reservations/ReservationCalendarPage'));
const SalesPage = lazy(() => import('./pages/finance/SalesPage'));
const InvoiceListPage = lazy(() => import('./pages/finance/InvoiceListPage'));
const InvoiceDetailPage = lazy(() => import('./pages/finance/InvoiceDetailPage'));
const InvoiceFormPage = lazy(() => import('./pages/finance/InvoiceFormPage'));
const ReportPage = lazy(() => import('./pages/finance/ReportPage'));
const ExpensesPage = lazy(() => import('./pages/finance/ExpensesPage'));
const ActivityLogPage = lazy(() => import('./pages/activity/ActivityLogPage'));

function LoadingFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div style={{ fontSize: '24px', color: '#232D36' }}>Loading...</div>
    </div>
  );
}

function App() {
  const router = createBrowserRouter([
    {
      path: '/',
      element: <PublicLayout />,
      children: [
        { index: true, element: <Suspense fallback={<LoadingFallback />}><HomePage /></Suspense> },
        { path: 'about', element: <Suspense fallback={<LoadingFallback />}><AboutPage /></Suspense> },
        { path: 'rooms', element: <Suspense fallback={<LoadingFallback />}><RoomTypesPage /></Suspense> },
        { path: 'gallery', element: <Suspense fallback={<LoadingFallback />}><GalleryPage /></Suspense> },
        { path: 'contact', element: <Suspense fallback={<LoadingFallback />}><ContactPage /></Suspense> },
      ],
    },
    {
      path: '/login',
      element: <PublicOnlyRoute />,
      children: [
        { index: true, element: <Suspense fallback={<LoadingFallback />}><LoginPage /></Suspense> },
      ],
    },
    {
      path: '/register',
      element: <PublicOnlyRoute />,
      children: [
        { index: true, element: <Suspense fallback={<LoadingFallback />}><RegisterPage /></Suspense> },
      ],
    },
    {
      path: '/forgot-password',
      element: <PublicOnlyRoute />,
      children: [
        { index: true, element: <Suspense fallback={<LoadingFallback />}><ForgotPasswordPage /></Suspense> },
      ],
    },
    {
      path: '/reset-password',
      element: <PublicOnlyRoute />,
      children: [
        { index: true, element: <Suspense fallback={<LoadingFallback />}><ResetPasswordPage /></Suspense> },
      ],
    },
    {
      path: '/dashboard',
      element: <ProtectedRoute />,
      children: [
        { index: true, element: <Suspense fallback={<LoadingFallback />}><DashboardPage /></Suspense> },
        {
          path: 'management',
          element: <RequirePermission anyOf={['user.view', 'role.view', 'permission.view']} />,
          children: [
            { index: true, element: <Suspense fallback={<LoadingFallback />}><ManagementPage /></Suspense> },
          ],
        },
        {
          path: 'users',
          element: <RequirePermission permission="user.view" />,
          children: [
            { index: true, element: <Suspense fallback={<LoadingFallback />}><UserListPage /></Suspense> },
            { path: 'new', element: <Suspense fallback={<LoadingFallback />}><UserFormPage /></Suspense> },
            { path: ':id', element: <Suspense fallback={<LoadingFallback />}><UserDetailPage /></Suspense> },
            { path: ':id/edit', element: <Suspense fallback={<LoadingFallback />}><UserRolePage /></Suspense> },
          ],
        },
        {
          path: 'roles',
          element: <RequirePermission permission="role.view" />,
          children: [
            { index: true, element: <Suspense fallback={<LoadingFallback />}><RoleListPage /></Suspense> },
            { path: 'new', element: <Suspense fallback={<LoadingFallback />}><RoleFormPage /></Suspense> },
            { path: ':id/edit', element: <Suspense fallback={<LoadingFallback />}><RoleFormPage /></Suspense> },
          ],
        },
        {
          path: 'permissions',
          element: <RequirePermission permission="permission.view" />,
          children: [
            { index: true, element: <Suspense fallback={<LoadingFallback />}><PermissionListPage /></Suspense> },
          ],
        },
        {
          path: 'room-types',
          element: <RequirePermission permission="room.view" />,
          children: [
            { index: true, element: <Suspense fallback={<LoadingFallback />}><RoomTypeListPage /></Suspense> },
            { path: 'new', element: <Suspense fallback={<LoadingFallback />}><RoomTypeFormPage /></Suspense> },
            { path: ':id/edit', element: <Suspense fallback={<LoadingFallback />}><RoomTypeFormPage /></Suspense> },
          ],
        },
        {
          path: 'rooms',
          element: <RequirePermission permission="room.view" />,
          children: [
            { index: true, element: <Suspense fallback={<LoadingFallback />}><RoomListPage /></Suspense> },
            { path: 'new', element: <Suspense fallback={<LoadingFallback />}><RoomFormPage /></Suspense> },
            { path: ':id/edit', element: <Suspense fallback={<LoadingFallback />}><RoomFormPage /></Suspense> },
          ],
        },
        {
          path: 'reservations',
          element: <RequirePermission permission="reservation.view" />,
          children: [
            { index: true, element: <Suspense fallback={<LoadingFallback />}><ReservationListPage /></Suspense> },
            { path: 'new', element: <Suspense fallback={<LoadingFallback />}><ReservationFormPage /></Suspense> },
            { path: ':id', element: <Suspense fallback={<LoadingFallback />}><ReservationDetailPage /></Suspense> },
            { path: ':id/edit', element: <Suspense fallback={<LoadingFallback />}><ReservationFormPage /></Suspense> },
            { path: 'calendar', element: <Suspense fallback={<LoadingFallback />}><ReservationCalendarPage /></Suspense> },
          ],
        },
        {
          path: 'finance',
          element: <RequirePermission anyOf={['finance.sales.view', 'finance.invoice.view', 'finance.report.view']} />,
          children: [
            { index: true, element: <Suspense fallback={<LoadingFallback />}><SalesPage /></Suspense> },
            { path: 'sales', element: <Suspense fallback={<LoadingFallback />}><SalesPage /></Suspense> },
            { path: 'invoices', element: <Suspense fallback={<LoadingFallback />}><InvoiceListPage /></Suspense> },
            { path: 'invoices/new', element: <Suspense fallback={<LoadingFallback />}><InvoiceFormPage /></Suspense> },
            { path: 'invoices/:id', element: <Suspense fallback={<LoadingFallback />}><InvoiceDetailPage /></Suspense> },
            { path: 'invoices/:id/edit', element: <Suspense fallback={<LoadingFallback />}><InvoiceFormPage /></Suspense> },
            { path: 'reports', element: <Suspense fallback={<LoadingFallback />}><ReportPage /></Suspense> },
            { path: 'expenses', element: <Suspense fallback={<LoadingFallback />}><ExpensesPage /></Suspense> },
          ],
        },
        {
          path: 'activity',
          element: <RequirePermission permission="activity.view" />,
          children: [
            { index: true, element: <Suspense fallback={<LoadingFallback />}><ActivityLogPage /></Suspense> },
          ],
        },
      ],
    },
    {
      path: '/change-password',
      element: <ProtectedRoute />,
      children: [
        { index: true, element: <Suspense fallback={<LoadingFallback />}><ChangePasswordPage /></Suspense> },
      ],
    },
    {
      path: '*',
      element: <Suspense fallback={<LoadingFallback />}><NotFoundPage /></Suspense>,
    },
  ]);

  return <RouterProvider router={router} />;
}

export default App;
