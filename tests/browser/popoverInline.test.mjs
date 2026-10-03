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
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
});
after(async () => { await browser?.close(); });

for (const family of ['Arial', 'Segoe UI', 'monospace']) {
  for (const weight of [500, 600, 700]) {
    test(`fitting short paths stay inline: ${family}, weight ${weight}`, async t => {
      const page = await browser.newPage({ viewport: { width: 480, height: 700 }, deviceScaleFactor: 2 });
      t.after(() => page.close());
      await page.setContent(`<style>
        :root { font-family: '${family}'; font-size: 16px; --font-ui-small: 14px;
          --font-ui-smaller: 13.2px; --font-medium: ${weight}; }
        * { box-sizing: border-box; } body { margin: 0; }
      </style><button id="anchor">Review</button>`);
      await page.addStyleTag({ content: css });
      await page.addScriptTag({ content: script });
      const samples = await page.evaluate(() => {
        const samples = [];
        for (const folder of ['04 Archive', 'abc', '猫', '👍🏽', 'e\u0301']) {
          const popover = new window.ReviewDetailsPopover(document, document.querySelector('#anchor'), {
            lastReviewedDay: '2026-09-20', nextReviewDay: '2027-02-17',
            timing: { kind: 'upcoming', days: 137 },
            calculation: { mode: 'excluded', effectiveIntervalDays: 150, candidates: [
              { kind: 'folder', folder, days: 150, applied: true },
              { kind: 'global', days: 35, applied: false },
            ] },
          }, 0, async () => true, () => {});
          popover.load();
          const root = document.querySelector('[role="dialog"]:not([aria-hidden="true"])');
          root.querySelector('details').open = true;
          const path = root.querySelector('.review-details-folder-path');
          const row = path.closest('.review-details-calculation-row');
          // Test rendered geometry when the full row's measured text fits.
          for (let width = 240; width <= 440; width += 2) {
            root.style.width = `${width}px`;
            root.style.maxWidth = `${width}px`;
            // Also reset the old release's fallback for before/after regression runs.
            row.classList.remove('is-path-stacked');
            path.textContent = folder;
            const range = document.createRange();
            range.selectNodeContents(path);
            const textWidth = range.getBoundingClientRect().width;
            const slot = path.getBoundingClientRect().width;
            const label = row.querySelector('.review-details-calculation-label');
            const days = row.querySelector('.review-details-folder-days');
            const check = row.querySelector('.review-details-calculation-applied');
            range.selectNodeContents(label);
            const labelWidth = range.getBoundingClientRect().width;
            const style = getComputedStyle(root);
            const contentWidth = root.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
            const required = row.querySelector('.review-details-calculation-position').getBoundingClientRect().width
              + labelWidth + textWidth + days.getBoundingClientRect().width + check.getBoundingClientRect().width
              + 4 * parseFloat(getComputedStyle(row).columnGap);
            if (required > contentWidth) continue;
            popover.fitFolderPaths(root);
            samples.push({ folder, width, textWidth, slot,
              labelTop: label.getBoundingClientRect().top,
              labelBottom: label.getBoundingClientRect().bottom,
              pathTop: path.getBoundingClientRect().top,
              pathBottom: path.getBoundingClientRect().bottom,
              daysTop: days.getBoundingClientRect().top,
              daysBottom: days.getBoundingClientRect().bottom,
              text: path.textContent });
          }
          root.style.width = `${window.innerWidth}px`;
          row.classList.remove('is-path-stacked');
          path.textContent = folder;
          const range = document.createRange();
          range.selectNodeContents(path);
          const textWidth = range.getBoundingClientRect().width;
          // A fractional positive remainder is still a fit: rounding or an arbitrary
          // one-pixel safety margin must not discard a complete, fitting basename.
          path.style.width = `${textWidth + 0.125}px`;
          path.style.minWidth = `${textWidth + 0.125}px`;
          path.style.maxWidth = `${textWidth + 0.125}px`;
          popover.fitFolderPaths(root);
          samples.push({ folder, width: 'fractional boundary', textWidth,
            slot: path.getBoundingClientRect().width,
            text: path.textContent });
          popover.unload();
        }
        return samples;
      });
      assert.ok(samples.some(sample => sample.labelTop !== undefined), 'must exercise full rows that fit');
      for (const sample of samples) {
        assert.equal(sample.text, sample.folder, JSON.stringify(sample));
        if (sample.labelTop !== undefined) {
          assert.ok(Math.max(sample.labelTop, sample.pathTop, sample.daysTop)
            < Math.min(sample.labelBottom, sample.pathBottom, sample.daysBottom), JSON.stringify(sample));
        }
      }
    });
  }
}
