import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

let browser;
let script;
let css;
before(async () => {
  const project = fileURLToPath(new URL('../../', import.meta.url));
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
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
});
after(async () => { await browser?.close(); });

async function fitAtWidths(t, folder, widths) {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.setContent(`<style>
    :root { font-family: Arial; font-size: 16px; --font-ui-small: 14px; --font-ui-smaller: 12px; }
    * { box-sizing: border-box; }
  </style><button id="anchor">Review</button>`);
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  return page.evaluate(({ folder, widths }) => {
    const popover = new window.ReviewDetailsPopover(document, document.querySelector('#anchor'), {
      timing: { kind: 'not-reviewed' },
      calculation: { mode: 'excluded', effectiveIntervalDays: 2,
        candidates: [{ kind: 'folder', folder, days: 2, applied: true }] },
    }, 0, async () => true, () => {});
    popover.load();
    const root = document.querySelector('[role="dialog"]:not([aria-hidden="true"])');
    root.querySelector('details').open = true;
    const el = root.querySelector('.review-details-folder-path');
    return widths.map(width => {
      el.style.width = `${width}px`;
      el.style.minWidth = `${width}px`;
      el.style.maxWidth = `${width}px`;
      popover.fitFolderPaths(root);
      const range = document.createRange();
      range.selectNodeContents(el);
      return { width, text: el.textContent, measured: range.getBoundingClientRect().width,
        available: el.getBoundingClientRect().width };
    });
  }, { folder, widths });
}

for (const [name, grapheme] of [
  ['family emoji', '👨‍👩‍👧‍👦'],
  ['combining accent', 'e\u0301'],
  ['emoji modifier', '👍🏽'],
]) {
  test(`folder truncation preserves ${name} grapheme boundaries`, async t => {
    const basename = grapheme.repeat(20);
    const folder = `Parents/${basename}`;
    const segments = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(basename)];
    const validSuffixes = new Set(['', ...segments.map(segment => basename.slice(segment.index))]);
    const samples = await fitAtWidths(t, folder, Array.from({ length: 111 }, (_, i) => i + 10));
    for (const sample of samples) {
      assert.ok(sample.measured <= sample.available, JSON.stringify(sample));
      if (['', '…', '…/', '…/…'].includes(sample.text)) continue;
      assert.ok(sample.text.startsWith('…/…'), JSON.stringify(sample));
      assert.ok(validSuffixes.has(sample.text.slice('…/…'.length)), `split grapheme: ${JSON.stringify(sample)}`);
    }
    assert.ok(samples.some(sample => sample.text.startsWith('…/…') && sample.text.length > '…/…'.length));
  });
}

test('path truncation never emits a marker wider than a tiny slot', async t => {
  for (const folder of ['Parents/Downloaded', 'VeryLongBasenameWithoutSlashes'.repeat(3)]) {
    const samples = await fitAtWidths(t, folder, [0, 1, 5, 10, 14, 20, 26]);
    for (const sample of samples) {
      assert.ok(sample.measured <= sample.available, `non-fitting marker: ${JSON.stringify(sample)}`);
    }
  }
});
