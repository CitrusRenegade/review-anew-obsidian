import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runReviewSmoke } from './reviewSmokeHost.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const option = (key, fallback) => process.argv.slice(2).find(value => value.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const vault = option('vault', 'test3');
const vaultPath = resolve(option('vault-path', 'C:\\test3'));
const runId = option('run-id', randomUUID());
const fixtureRoot = `_review-native-${runId}`;
const probe = option('probe', 'none');
const output = resolve(option('report', join(tmpdir(), `review-native-${runId}.json`)));
const executable = process.env.OBSIDIAN_CLI || (process.platform === 'win32' ? 'Obsidian.com' : 'obsidian');
const slot = `__reviewNative_${runId.replaceAll('-', '_')}`;
const report = { status: 'Blocked', vault, vaultPath, fixtureRoot, probe, scenarios: [] };
let launched = false;
const cli = (...args) => execFileSync(executable, [`vault=${vault}`, ...args], { encoding: 'utf8', timeout: 15000, windowsHide: true });
const evaluate = code => {
  const result = cli('eval', `code=${code}`);
  const marker = result.lastIndexOf('=> ');
  if (marker < 0) throw new Error(`CLI did not return an evaluation result: ${result.trim()}`);
  return JSON.parse(result.slice(marker + 3).trim());
};
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
try {
  if (!/^[a-zA-Z0-9_-]+$/.test(runId)) throw new Error('run-id must contain only letters, digits, underscores and hyphens');
  if (!['none', 'missing-action', 'focus-blocked'].includes(probe)) throw new Error('Unknown probe');
  if (!existsSync(vaultPath)) throw new Error('Configured vault directory is unavailable');
  if (realpathSync(vaultPath).toLowerCase() !== vaultPath.toLowerCase()) throw new Error('Vault root resolves through a link; refusing fixture writes');
  const state = evaluate(`JSON.stringify({vault:app.vault.adapter.basePath,manifest:app.plugins.manifests['review-simple'],enabled:!!app.plugins.plugins['review-simple'],running:!!window[${JSON.stringify(slot)}]})`);
  if (resolve(state.vault) !== vaultPath || !state.enabled || !state.manifest?.dir) throw new Error('Wrong vault or plugin unavailable');
  if (state.running) throw new Error('This run-id already has a host operation; inspect it instead of repeating');
  const candidate = {};
  for (const asset of ['main.js', 'styles.css', 'manifest.json']) {
    const installed = resolve(vaultPath, state.manifest.dir, asset);
    if (!installed.startsWith(`${vaultPath}\\`) && !installed.startsWith(`${vaultPath}/`)) throw new Error('Plugin directory escapes vault');
    candidate[asset] = hash(join(repo, asset));
    if (hash(installed) !== candidate[asset]) throw new Error(`Installed ${asset} differs from the local candidate`);
  }
  report.candidate = candidate;
  report.obsidianVersion = cli('version').trim();
  report.pluginVersion = state.manifest.version;
  report.revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  report.dirty = !!execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim();
  cli('plugin:reload', 'id=review-simple');

  let windowState;
  if (process.platform === 'win32') {
    windowState = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', join(here, 'window.ps1'), '-VaultName', vault, '-Activate'], { encoding: 'utf8', windowsHide: true, timeout: 15000 }));
  } else {
    windowState = evaluate('JSON.stringify({visible:document.visibilityState === "visible",focused:document.hasFocus()})');
  }
  report.window = windowState;
  if (!windowState.visible) throw new Error(windowState.reason || 'Vault window is hidden or minimized');
  const options = { fixtureRoot, probe, windowVisible: windowState.visible, windowFocused: windowState.focused, screenshotPrefix: join(tmpdir(), `review-native-${runId}`) };
  // Keep CLI payloads short: Windows redirectors can truncate large arguments.
  const hostScript = join(tmpdir(), `review-native-${runId}.host.js`);
  writeFileSync(hostScript, `window[${JSON.stringify(slot)}]={status:'Running'}; void (${runReviewSmoke.toString()})(app,window,${JSON.stringify(options)}).then(result=>window[${JSON.stringify(slot)}]=result).catch(error=>window[${JSON.stringify(slot)}]={status:'Failed',reason:String(error)});`);
  launched = true;
  try {
    evaluate(`eval(require('node:fs').readFileSync(${JSON.stringify(hostScript)},'utf8')); JSON.stringify({started:true})`);
  } finally { unlinkSync(hostScript); }
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    await delay(250);
    const state = evaluate(`JSON.stringify(window[${JSON.stringify(slot)}])`);
    if (state.status !== 'Running') { Object.assign(report, state); break; }
  }
  if (!report.cleanup) throw new Error('Native run incomplete; host operation may still be running. Do not repeat this run-id');
  for (const [asset, before] of Object.entries(candidate)) {
    if (hash(join(repo, asset)) !== before) throw new Error('Candidate changed during native verification');
  }
  evaluate(`delete window[${JSON.stringify(slot)}]; JSON.stringify({removed:true})`);
} catch (error) {
  report.status = launched ? 'Failed' : 'Blocked';
  report.reason = String(error.message);
}
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
for (const scenario of report.scenarios) process.stdout.write(`${scenario.status}: ${scenario.name}${scenario.reason ? ` — ${scenario.reason}` : ''}\n`);
process.stdout.write(`${report.status}${report.reason ? `: ${report.reason}` : ''}\n`);
process.stdout.write(`Report: ${output}\n`);
process.exitCode = report.status === 'Passed' ? 0 : report.status === 'Blocked' ? 2 : 1;
