import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
for (const timezone of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
  process.stdout.write(`Calendar-day regressions: ${timezone}\n`);
  const result = spawnSync(process.execPath, [vitest, 'run',
    'tests/review.test.ts', 'tests/reviewDetails.test.ts',
    'tests/reviewLifecycle.test.ts', 'tests/dates.test.ts'], {
    cwd: root, env: { ...process.env, TZ: timezone }, stdio: 'inherit', windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
