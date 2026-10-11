# Endpoint inventory (Block 1) — backend Hono app, src/index.ts:53-67

Global middleware (index.ts:32-51): db injection, CORS allowlist from FRONTEND_ORIGIN (credentials:false). No global auth, no rate limit, no security headers.
`authenticate` = Bearer JWT HS256 + DB user load (status, token_version) + roles/permissions per request (middleware/auth.ts:28).
Columns: method | path | handler | auth | permission | input validation | store | mutates

| Method | Path | Handler | Auth | Permission | Validation | Store | Mutates |
|---|---|---|---|---|---|---|---|
| GET | /api/health | routes/health.ts:5 | none | none | n/a | none | no |
| POST | /api/auth/login | routes/auth.ts:28 | NONE | none | zod loginSchema | D1 users, activities | yes (last_login, audit) |
| POST | /api/auth/register | routes/auth.ts:43 | NONE (public self-signup) | none | zod registerSchema | D1 users, user_roles(role-003), activities | yes |
| POST | /api/auth/logout | routes/auth.ts:64 | yes | none | n/a | D1 activities | audit only (no revocation) |
| GET | /api/auth/me | routes/auth.ts:77 | yes | none | n/a | D1 | no |
| POST | /api/auth/change-password | routes/auth.ts:82 | yes | none (self) | zod | D1 users | yes |
| POST | /api/auth/forgot-password | routes/auth.ts:98 | NONE | none | zod | D1 users, password_reset_tokens | yes |
| POST | /api/auth/reset-password | routes/auth.ts:111 | NONE | none | zod | D1 | yes |
| GET | /api/activities | routes/activities.ts:21 | yes | activity.view | zod query | D1 | no |
| GET | /api/activities/:id | activities.ts:33 | yes | activity.view | pathParam | D1 | no |
| GET | /api/dashboard/overview | dashboard.ts:20 | yes | anyOf reservation.view, room.view | n/a | D1 | no |
| GET | /api/users | users.ts:32 | yes | user.view | zod query | D1 | no |
| GET | /api/users/:id | users.ts:43 | yes | user.view | pathParam | D1 | no |
| POST | /api/users | users.ts:47 | yes | user.create (+ service-level escalation checks, verify in B2) | zod | D1 | yes |
| PATCH | /api/users/:id | users.ts:53 | yes | user.update (+ service checks) | zod | D1 | yes |
| PATCH | /api/users/:id/status | users.ts:59 | yes | user.update | zod | D1 | yes |
| PUT | /api/users/:id/roles | users.ts:65 | yes | user.update (+ service checks) | zod | D1 | yes |
| DELETE | /api/users/:id | users.ts:71 | yes | user.delete | pathParam | D1 | yes |
| GET | /api/roles, /api/roles/:id | roles.ts:30,41 | yes | role.view | zod / pathParam | D1 | no |
| POST | /api/roles | roles.ts:45 | yes | role.create | zod | D1 | yes (no audit row) |
| PATCH | /api/roles/:id | roles.ts:50 | yes | role.update | zod | D1 | yes (no audit row) |
| PUT | /api/roles/:id/permissions | roles.ts:55 | yes | permission.assign | zod | D1 | yes (no audit row) |
| DELETE | /api/roles/:id | roles.ts:60 | yes | role.delete | pathParam | D1 | yes (no audit row) |
| GET | /api/permissions | permissions.ts:16 | yes | permission.view | n/a | D1 | no |
| GET | /api/room-types, /:id | roomTypes.ts:32,43 | yes | room.view | zod | D1 | no |
| POST/PATCH/DELETE | /api/room-types[/:id], PATCH /:id/status | roomTypes.ts:47-101 | yes | room.create/update/delete | zod | D1 | yes (audited) |
| GET | /api/rooms, /:id | rooms.ts:25,37 | yes | room.view | zod | D1 | no |
| POST/PATCH/DELETE | /api/rooms[/:id], PATCH /:id/status | rooms.ts:41-95 | yes | room.create/update/delete | zod | D1 | yes (audited) |
| GET | /api/public/room-types | public.ts:22 | NONE (intended) | none | n/a | D1 | no |
| GET | /api/public/holidays | public.ts:37 | NONE (intended) | none | zod year/force | outbound fetch HOLIDAY_SOURCE_URL (+cache TBD) | no (force flag unauthenticated) |
| GET | /api/reservations | reservations.ts:34 | yes | reservation.view | zod | D1 | no |
| GET | /api/reservations/calendar | :48 | yes | reservation.view | zod | D1 | no |
| GET | /api/reservations/availability | :59 | yes | reservation.view | zod | D1 | no |
| GET | /api/reservations/:id | :76 | yes | reservation.view | pathParam | D1 | no |
| POST | /api/reservations | :80 | yes | reservation.create | zod | D1 (atomicity TBD in B3) | yes |
| PATCH | /api/reservations/:id | :102 | yes | reservation.update | zod | D1 | yes |
| POST | /api/reservations/:id/check-in | :120 | yes | reservation.checkin | none (no body) | D1 | yes |
| POST | /api/reservations/:id/check-out | :137 | yes | reservation.checkout | none | D1 | yes |
| POST | /api/reservations/:id/cancel | :154 | yes | reservation.delete | none | D1 | yes |
| GET | /api/invoices | invoices.ts:38 | yes | finance.invoice.view | zod | D1 | no |
| GET | /api/invoices/next-number | :54 | yes | finance.invoice.create | manual regex | D1 | no |
| GET | /api/invoices/:id | :60 | yes | finance.invoice.view | pathParam | D1 | no |
| POST | /api/invoices | :64 | yes | finance.invoice.create | zod | D1 | yes |
| PATCH | /api/invoices/:id | :82 | yes | finance.invoice.update | zod | D1 | yes |
| POST | /api/invoices/:id/send | :100 | yes | finance.invoice.update | none | D1 | yes |
| POST | /api/invoices/:id/pay | :117 | yes | finance.invoice.update | none | D1 | yes (money state; idempotency TBD) |
| POST | /api/invoices/:id/cancel | :134 | yes | finance.invoice.update | none | D1 | yes |
| DELETE | /api/invoices/:id | :151 | yes | finance.invoice.delete | pathParam | D1 | yes (hard delete? TBD in B3) |
| GET/POST/PATCH/DELETE | /api/expenses[/:id] | expenses.ts:24-79 | yes | finance.expense.view/create/update/delete | zod | D1 | yes (audited) |
| GET | /api/sales | sales.ts:17 | yes | finance.sales.view | zod | D1 | no |
| GET | /api/sales/breakdown | sales.ts:30 | yes | finance.sales.view | NONE (raw start/end, default '') | D1 | no |
| GET | /api/reports/summary | reports.ts:17 | yes | finance.report.view | zod + manual | D1 | no |
| GET | /api/reports/top-invoices | reports.ts:30 | yes | finance.report.view | manual limit 1-50 | D1 | no |
| OPTIONS | * | hono cors middleware (index.ts:37) | none | none | n/a | none | no |
| ANY | * (notFound) | index.ts:69 | none | none | n/a | none | no |

Not found: no debug/admin/static/wildcard routes, no routes registered outside src/index.ts, no cron/queue/scheduled handler, no R2/KV/DO usage, no service bindings.
Observations for later blocks (not findings): role mutations have no audit rows; /register is open; sales/breakdown skips zod.
