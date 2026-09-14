import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../../', import.meta.url));
let browser;
let script;
let css;
before(async () => {
  const result = await build({
    stdin: {
      contents: `import { ReviewDetailsPopover } from './src/reviewDetailsPopover';
        import { installDomHelpers } from './tests/browser/obsidian.mjs';
        installDomHelpers(window); window.ReviewDetailsPopover = ReviewDetailsPopover;`,
      resolveDir: project,
    },
    alias: { obsidian: fileURLToPath(new URL('./obsidian.mjs', import.meta.url)) },
    bundle: true, write: false, format: 'iife', platform: 'browser',
  });
  script = result.outputFiles[0].text;
  css = await readFile(new URL('../../styles.css', import.meta.url), 'utf8');
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
  });
});
after(async () => { await browser?.close(); });

async function mount(t, { width = 1200, height = 900, rows = 3, font = 0, boxSizing = 'border-box' } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  t.after(() => page.close());
  await page.setContent(`<style>
    :root { font-size: 16px; font-family: Arial; --font-ui-small: 14px;
      --font-ui-smaller: 12px; --font-medium: 500; --background-modifier-border: #888; }
    * { box-sizing: ${boxSizing}; }
    body { margin: 0; }
    button { padding: 6px 12px; }
    #editor { height: 75vh; overflow: auto; } #document { height: 4000px; }
    #anchor { position: fixed; right: 18px; bottom: 0; height: 24px; }
  </style><div id="editor"><div id="document"></div></div><button id="anchor">Review</button>`);
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await page.evaluate(({ rows, font }) => {
    const anchor = document.querySelector('#anchor');
    anchor.focus();
    const details = {
      lastReviewedDay: '2026-09-10', nextReviewDay: '2026-09-12',
      timing: { kind: 'overdue', days: 59 },
      calculation: { mode: 'excluded', effectiveIntervalDays: 2,
        candidates: Array.from({ length: rows }, (_, i) => ({
          kind: 'folder', folder: `Projects/Research ${i}`, days: 2, applied: i === 0,
        })),
      },
    };
    window.popover = new window.ReviewDetailsPopover(document, anchor, details, font,
      async () => true, () => {});
    window.popover.load();
  }, { rows, font });
  return page;
}

const rect = page => page.locator('[role="dialog"]:not([aria-hidden="true"])').boundingBox();

for (const boxSizing of ['border-box', 'content-box']) {
  test(`repeated resize keeps the same width (${boxSizing})`, async t => {
    const page = await mount(t, { boxSizing });
    const initial = await rect(page);
    await page.evaluate(() => {
      for (let i = 0; i < 100; i++) window.dispatchEvent(new Event('resize'));
    });
    assert.deepEqual(await rect(page), initial);
    const overflow = await page.locator('[role="dialog"]:not([aria-hidden="true"])')
      .evaluate(el => el.scrollWidth - el.clientWidth);
    assert.ok(overflow <= 1, `horizontal overflow: ${overflow}`);
  });
}

test('editor and popover scrolling do not change its geometry', async t => {
  const page = await mount(t, { rows: 60, boxSizing: 'content-box' });
  await page.locator('[role="dialog"]:not([aria-hidden="true"]) > details:not([aria-hidden="true"]) > summary').click();
  const initial = await rect(page);
  await page.evaluate(() => {
    const editor = document.querySelector('#editor');
    const dialog = document.querySelector('[role="dialog"]:not([aria-hidden="true"])');
    for (let i = 0; i < 100; i++) {
      editor.scrollTop += 10;
      editor.dispatchEvent(new Event('scroll'));
      dialog.scrollTop += 10;
      dialog.dispatchEvent(new Event('scroll'));
    }
  });
  assert.deepEqual(await rect(page), initial);
});

test('narrow viewport wraps content, then restores the original width', async t => {
  const page = await mount(t, { font: 2 });
  const initial = await rect(page);
  await page.setViewportSize({ width: 240, height: 700 });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  const narrow = await rect(page);
  assert.ok(narrow.x >= 8 && narrow.x + narrow.width <= 232);
  const overflow = await page.locator('[role="dialog"]:not([aria-hidden="true"])').evaluate(el => el.scrollWidth - el.clientWidth);
  assert.ok(overflow <= 1, `horizontal overflow: ${overflow}`);
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  assert.deepEqual(await rect(page), initial);
});

test('long calculation stays within the height cap and does not jump on resize', async t => {
  const page = await mount(t, { rows: 60, height: 1200 });
  const closed = await rect(page);
  await page.locator('[role="dialog"]:not([aria-hidden="true"]) > details:not([aria-hidden="true"]) > summary').click();
  const open = await rect(page);
  assert.ok(open.height <= 512, `height ${open.height} exceeds 32rem`);
  assert.equal(open.width, closed.width);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  assert.deepEqual(await rect(page), open);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.review-details-popover').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'anchor');
});
