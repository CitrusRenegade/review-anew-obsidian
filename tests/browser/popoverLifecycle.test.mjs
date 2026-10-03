import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

let browser;
let script;
let css;
before(async () => {
  const result = await build({
    stdin: {
      contents: `import { ReviewDetailsPopover } from './src/reviewDetailsPopover';
        import { installDomHelpers } from './tests/browser/obsidian.mjs';
        installDomHelpers(window); window.ReviewDetailsPopover = ReviewDetailsPopover;`,
      resolveDir: fileURLToPath(new URL('../../', import.meta.url)),
    },
    alias: { obsidian: fileURLToPath(new URL('./obsidian.mjs', import.meta.url)) },
    bundle: true, write: false, format: 'iife', platform: 'browser',
  });
  script = result.outputFiles[0].text;
  css = await readFile(new URL('../../styles.css', import.meta.url), 'utf8');
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
});
after(async () => { await browser?.close(); });

async function mount(t, { width = 1200, days = 100 } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 700 } });
  t.after(() => page.close());
  await page.setContent(`<style>
    :root { font-size: 16px; font-family: Arial; --font-ui-small: 14px;
      --font-ui-smaller: 12px; --font-medium: 500; }
    body { margin: 0; } button { padding: 6px 12px; }
    #anchor { position: fixed; right: 18px; bottom: 0; height: 24px; }
  </style><button id="anchor">Review</button>`);
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await page.evaluate(days => {
    window.openPopover = () => {
      const anchor = document.querySelector('#anchor');
      anchor.focus();
      window.popover = new window.ReviewDetailsPopover(document, anchor, {
        timing: { kind: 'never-reviewed' },
        calculation: { mode: 'excluded', effectiveIntervalDays: days,
          candidates: [{ kind: 'folder',
            folder: `${'Long parent folder/'.repeat(20)}LastFolder.md`,
            days, applied: true }],
        },
      }, 0, async () => true, () => {});
      window.popover.load();
    };
    window.openPopover();
  }, days);
  return page;
}

test('a valid huge interval never consumes the visible folder suffix on a narrow viewport', async t => {
  const page = await mount(t, { width: 240, days: Number.MAX_SAFE_INTEGER });
  const dialog = page.locator('.review-details-popover:not([aria-hidden])');
  await dialog.locator('summary').click();
  await page.waitForFunction(() => {
    const el = document.querySelector('.review-details-popover:not([aria-hidden]) .review-details-folder-path');
    return el.textContent.endsWith('LastFolder.md') && el.getBoundingClientRect().width > 50;
  }, undefined, { timeout: 2000 });
  const geometry = await dialog.evaluate(el => {
    const path = el.querySelector('.review-details-folder-path');
    const range = document.createRange();
    range.selectNodeContents(path);
    return { overflow: el.scrollWidth - el.clientWidth,
      textWidth: range.getBoundingClientRect().width,
      pathWidth: path.getBoundingClientRect().width,
      days: el.querySelector('.review-details-folder-days').textContent };
  });
  assert.ok(geometry.overflow <= 1);
  assert.ok(geometry.textWidth <= geometry.pathWidth);
  assert.ok(geometry.days.includes(String(Number.MAX_SAFE_INTEGER)));
});

test('reopening retains one accessible title and removes every measurement clone on close', async t => {
  const page = await mount(t);
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    const state = await page.evaluate(() => {
      const dialog = document.querySelector('.review-details-popover:not([aria-hidden])');
      const label = dialog.getAttribute('aria-labelledby');
      const labels = Array.from(document.querySelectorAll('[id]')).filter(el => el.id === label);
      const clone = document.querySelector('.review-details-popover-measure');
      return { label, count: labels.length, title: labels[0]?.textContent,
        hidden: clone?.getAttribute('aria-hidden'), inert: clone?.inert };
    });
    assert.equal(state.count, 1);
    assert.equal(state.title, 'Review Anew');
    assert.equal(state.hidden, 'true');
    assert.equal(state.inert, true);
    assert.ok(!seen.has(state.label));
    seen.add(state.label);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.review-details-popover').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'anchor');
    if (i < 7) await page.evaluate(() => window.openPopover());
  }
});

test('closing during resize leaves no detached layout work or errors', async t => {
  const page = await mount(t);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'));
    window.popover.close();
    for (let i = 0; i < 20; i++) window.dispatchEvent(new Event('resize'));
  });
  await page.evaluate(() => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))));
  await page.setViewportSize({ width: 240, height: 700 });
  assert.equal(await page.locator('.review-details-popover').count(), 0);
  assert.deepEqual(errors, []);
});
