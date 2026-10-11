import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createD1Db, type AppDb } from './db/client';
import { getAllowedOrigins, type AppEnv } from './env';
import { toErrorBody } from './lib/errors';
import type { AuthContext } from './middleware/auth';
import authRoutes from './routes/auth';
import activitiesRoutes from './routes/activities';
import dashboardRoutes from './routes/dashboard';
import expenseRoutes from './routes/expenses';
import healthRoutes from './routes/health';
import invoiceRoutes from './routes/invoices';
import permissionRoutes from './routes/permissions';
import publicRoutes from './routes/public';
import reportRoutes from './routes/reports';
import reservationRoutes from './routes/reservations';
import roleRoutes from './routes/roles';
import roomRoutes from './routes/rooms';
import roomTypeRoutes from './routes/roomTypes';
import salesRoutes from './routes/sales';
import userRoutes from './routes/users';

export type AppVars = { db: AppDb; auth: AuthContext };

/**
 * Application factory. Production wires the D1 binding; tests inject an
 * equivalent SQLite-backed db through `dbProvider`.
 */
export function createApp(dbProvider: (env: AppEnv) => AppDb = (env) => createD1Db(env.DB)) {
  const app = new Hono<{ Bindings: AppEnv; Variables: AppVars }>();

  app.use('*', async (c, next) => {
    c.set('db', dbProvider(c.env));
    await next();
  });

  app.use(
    '*',
    cors({
      origin: (origin, c) => {
        const allowed = getAllowedOrigins(c.env);
        if (!origin) return allowed[0] ?? '*';
        return allowed.includes(origin) ? origin : null;
      },
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      exposeHeaders: ['Content-Type'],
      maxAge: 86400,
      credentials: false,
    }),
  );

  app.route('/api/health', healthRoutes);
  app.route('/api/auth', authRoutes);
  app.route('/api/activities', activitiesRoutes);
  app.route('/api/dashboard', dashboardRoutes);
  app.route('/api/users', userRoutes);
  app.route('/api/roles', roleRoutes);
  app.route('/api/room-types', roomTypeRoutes);
  app.route('/api/rooms', roomRoutes);
  app.route('/api/public', publicRoutes);
  app.route('/api/reservations', reservationRoutes);
  app.route('/api/permissions', permissionRoutes);
  app.route('/api/invoices', invoiceRoutes);
  app.route('/api/expenses', expenseRoutes);
  app.route('/api/sales', salesRoutes);
  app.route('/api/reports', reportRoutes);

  app.notFound((c) => c.json({ message: 'Not found' }, 404));
  app.onError((err, c) => {
    const { status, body } = toErrorBody(err);
    return c.json(body, status as 200);
  });

  return app;
}

const app = createApp();

export default app;
