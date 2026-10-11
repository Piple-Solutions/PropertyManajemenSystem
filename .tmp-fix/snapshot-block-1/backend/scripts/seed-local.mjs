// Applies migration + generated seed to the LOCAL D1 database.
// Usage: node scripts/seed-local.mjs
// Requires: wrangler login NOT needed for --local. Database must exist in
// wrangler.jsonc (local D1 is file-backed and auto-created).
import { execSync } from 'node:child_process';

const run = (cmd) => {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
};

run('node scripts/generate-seed-sql.mjs');
run('npx wrangler d1 migrations apply pms-internal-db --local');
run('npx wrangler d1 execute pms-internal-db --local --file=seed/seed.sql');
console.log('Local D1 ready: migrated + seeded.');
