-- Data correction: the Staff role (role-003) must not carry `user.view`
-- (User Management). Staff users see Manajemen User only when that access is
-- granted to them individually. Fresh databases get the corrected seed from
-- seed.sql; this migration aligns databases seeded before the correction.
-- Applies with: wrangler d1 migrations apply pms-internal-db --local|--remote
-- SQLite-only syntax. Idempotent: safe to run repeatedly.

DELETE FROM role_permissions
WHERE role_id = 'role-003'
  AND permission_id IN (SELECT id FROM permissions WHERE name = 'user.view');
