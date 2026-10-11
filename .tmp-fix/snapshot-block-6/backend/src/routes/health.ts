import { Hono } from 'hono';

const health = new Hono();

health.get('/', (c) => {
  return c.json({ data: { status: 'ok', service: 'pms-internal-backend', phase: 1 } }, 200);
});

export default health;
