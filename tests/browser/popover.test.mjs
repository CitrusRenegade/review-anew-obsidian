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

async function mount(t, { width = 1200, height = 900, rows = 3, font = 0, boxSizing = 'border-box', folders, deviceScaleFactor = 1 } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor });
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
  await page.evaluate(({ rows, font, folders }) => {
    const anchor = document.querySelector('#anchor');
    anchor.focus();
    const details = {
      lastReviewedDay: '2026-09-10', nextReviewDay: '2026-09-12',
      timing: { kind: 'overdue', days: 59 },
      calculation: { mode: 'excluded', effectiveIntervalDays: 2,
        candidates: Array.from({ length: folders?.length ?? rows }, (_, i) => ({
          kind: 'folder', folder: folders?.[i] ?? `Projects/Research ${i}`, days: 2, applied: i === 0,
        })),
      },
    };
    window.popover = new window.ReviewDetailsPopover(document, anchor, details, font,
      async () => true, () => {});
    window.popover.load();
  }, { rows, font, folders });
  return page;
}

const rect = page => page.locator('[role="dialog"]:not([aria-hidden="true"])').boundingBox();

test('short popover does not reserve space for a scrollbar it does not need', async t => {
  const page = await mount(t);
  const scrollbarWidth = await page
    .locator('[role="dialog"]:not([aria-hidden="true"])')
    .evaluate(el => {
      const style = getComputedStyle(el);
      const borders =
        parseFloat(style.borderLeftWidth) +
        parseFloat(style.borderRightWidth);

      return el.offsetWidth - el.clientWidth - borders;
    });

  assert.equal(scrollbarWidth, 0);
});

const longFolders = [
  `05-System/${'Long parent folder '.repeat(8)}/Scripts/Downloaded`,
  `${'VeryLongFirstFolder'.repeat(8)}/${'VeryLongSecondFolder'.repeat(8)}`,
  `Projects/${'VeryLongBasename'.repeat(20)}-distinctive-ending.md`,
];

test('DPI scaling preserves logical geometry and hover targets retain their own titles', async t => {
  let reference;
  for (const deviceScaleFactor of [1, 1.25, 1.5, 2, 3]) {
    const page = await mount(t, { folders: longFolders, deviceScaleFactor });
    const dialog = page.locator('[role="dialog"]:not([aria-hidden="true"])');
    await dialog.locator('summary').click();
    const bounds = await rect(page);
    if (reference) assert.deepEqual(bounds, reference);
    else reference = bounds;
    const paths = dialog.locator('.review-details-folder-path');
    for (const index of [1, 0, 2, 1]) {
      await paths.nth(index).hover();
      const hovered = await page.evaluate(() => {
        const el = document.querySelector('.review-details-folder-path:hover');
        return { title: el?.getAttribute('title'), label: el?.getAttribute('aria-label') };
      });
      assert.equal(hovered.title, longFolders[index]);
      assert.equal(hovered.label, null);
    }
  }
});

for (const boxSizing of ['border-box', 'content-box']) {
  for (const font of [-2, 0, 2]) {
    test(`long folder paths stay bounded across viewports (${boxSizing}, font ${font})`, async t => {
      const page = await mount(t, { folders: longFolders, font, boxSizing });
      const dialog = page.locator('[role="dialog"]:not([aria-hidden="true"])');
      await dialog.locator('summary').click();
      const initial = await rect(page);
      const maxWidth = 25 * (14 + font);
      assert.ok(initial.width <= maxWidth, `long path expanded popover to ${initial.width}px`);
      const paths = dialog.locator('.review-details-folder-path');
      assert.equal(await paths.count(), longFolders.length);
      for (let i = 0; i < longFolders.length; i++) {
        assert.equal(await paths.nth(i).getAttribute('title'), longFolders[i]);
        assert.equal(await paths.nth(i).getAttribute('aria-description'), longFolders[i]);
        assert.equal(await paths.nth(i).getAttribute('aria-label'), null);
      }
      const abbreviated = await paths.first().textContent();
      assert.match(abbreviated, /…/);
      assert.ok(abbreviated.endsWith('/Downloaded'), abbreviated);
      const ultraLong = await paths.last().evaluate(el => ({
        text: el.textContent, overflow: el.scrollWidth - el.clientWidth,
        ellipsis: getComputedStyle(el).textOverflow,
      }));
      assert.ok(ultraLong.text.includes('…') || (ultraLong.overflow > 1 && ultraLong.ellipsis === 'ellipsis'),
        'ultra-long basename must be abbreviated or visually ellipsized');
      assert.ok(ultraLong.text.endsWith('.md'), ultraLong.text);
      assert.ok(ultraLong.text.startsWith('…/…'), ultraLong.text);
      assert.ok(longFolders.at(-1).endsWith(ultraLong.text.replace(/^…\/…/, '')), ultraLong.text);
      assert.ok(ultraLong.overflow <= 1);
      for (const width of [480, 320, 240, 1200]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => window.dispatchEvent(new Event('resize')));
        const bounds = await rect(page);
        assert.ok(bounds.width <= Math.min(maxWidth, width - 16));
        assert.ok(bounds.x >= 8 && bounds.x + bounds.width <= width - 8);
        const geometry = await dialog.evaluate(el => {
          const box = el.getBoundingClientRect();
          return {
            overflow: el.scrollWidth - el.clientWidth,
            suffixes: Array.from(el.querySelectorAll('.review-details-folder-days, .review-details-calculation-applied')).map(child => {
              const rect = child.getBoundingClientRect();
              return { left: rect.left, right: rect.right, text: child.textContent,
                overflow: child.scrollWidth - child.clientWidth };
            }),
            left: box.left, right: box.right,
          };
        });
        assert.ok(geometry.overflow <= 1, `${width}px viewport overflow: ${geometry.overflow}`);
        assert.equal(geometry.suffixes.filter(item => item.text.includes('2 days')).length, longFolders.length);
        assert.equal(geometry.suffixes.filter(item => item.text === '✓').length, 1);
        for (const suffix of geometry.suffixes) {
          assert.ok(suffix.left >= geometry.left && suffix.right <= geometry.right);
          assert.ok(suffix.overflow <= 1, `clipped suffix ${suffix.text}`);
        }
      }
      assert.deepEqual(await rect(page), initial);
    });
  }
}

test('short folder paths remain complete and restore after a narrow viewport', async t => {
  const folder = 'Projects/Notes';
  const page = await mount(t, { folders: [folder] });
  const dialog = page.locator('[role="dialog"]:not([aria-hidden="true"])');
  await dialog.locator('summary').click();
  const path = dialog.locator('.review-details-folder-path');
  assert.equal(await path.count(), 1);
  assert.equal(await path.textContent(), folder);
  const initial = await rect(page);
  await page.setViewportSize({ width: 240, height: 900 });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  assert.equal(await path.textContent(), folder);
  assert.deepEqual(await rect(page), initial);
});

test('changing theme font while open refits paths without a window resize', async t => {
  const page = await mount(t, { folders: longFolders });
  const dialog = page.locator('[role="dialog"]:not([aria-hidden="true"])');
  await dialog.locator('summary').click();
  await page.evaluate(() => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))));
  for (const [small, smaller, family] of [[22, 20, 'monospace'], [14, 12, 'Arial']]) {
    await page.evaluate(({ small, smaller, family }) => {
      const style = document.documentElement.style;
      style.setProperty('--font-ui-small', `${small}px`);
      style.setProperty('--font-ui-smaller', `${smaller}px`);
      style.fontFamily = family;
    }, { small, smaller, family });
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.review-details-popover:not([aria-hidden]) .review-details-folder-path')).every(el => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect().width <= el.getBoundingClientRect().width;
    }), null, { timeout: 1500 });
    assert.ok((await dialog.locator('.review-details-folder-path').first().textContent()).endsWith('Downloaded'));
  }
});

test('a newly reserved scrollbar gutter refits paths before hiding their endings', async t => {
  const page = await mount(t, { folders: longFolders });
  const dialog = page.locator('[role="dialog"]:not([aria-hidden="true"])');
  await dialog.locator('summary').click();
  await page.evaluate(() => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))));
  await page.addStyleTag({ content: '.review-details-popover:not([aria-hidden]) { scrollbar-gutter: stable; }' });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.review-details-popover:not([aria-hidden]) .review-details-folder-path')).every(el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect().width <= el.getBoundingClientRect().width;
  }), null, { timeout: 1500 });
  const geometry = await dialog.evaluate(el => ({
    scrollbar: el.offsetWidth - el.clientWidth - 2,
    overflow: el.scrollWidth - el.clientWidth,
  }));
  assert.ok(geometry.scrollbar > 0, 'test must reserve real scrollbar width');
  assert.ok(geometry.overflow <= 1);
  assert.ok((await dialog.locator('.review-details-folder-path').first().textContent()).endsWith('/Downloaded'));
});

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
