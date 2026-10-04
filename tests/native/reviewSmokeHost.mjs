// Serialized into the existing Obsidian renderer by the opt-in runner.
// This file is never imported by the plugin or included in its production bundle.
export async function runReviewSmoke(app, win, options) {
  const doc = win.document;
  const report = { status: 'Running', scenarios: [], cleanup: { status: 'Pending' } };
  const root = options.fixtureRoot;
  const movedRoot = `${root}-moved`;
  const pluginId = 'review-simple';
  let plugin = app.plugins.plugins[pluginId];
  const previous = app.workspace.getActiveFile();
  const previousLeaf = app.workspace.getMostRecentLeaf();
  const previousViewState = previousLeaf?.getViewState();
  const originalSettings = JSON.stringify(plugin.settings);
  const originalGetCache = app.metadataCache.getFileCache;
  const ownedFiles = new Set();
  const ownedFolders = new Set();
  let blockedFile = null;
  let settingsChanged = false;
  let fixture;
  const status = () => doc.querySelector('.review-status-bar');
  const popup = () => doc.querySelector('.review-details-popover:not([aria-hidden])');
  const check = (value, message) => { if (!value) throw new Error(message); };
  const wait = async (predicate, label) => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise(resolve => win.setTimeout(resolve, 40));
    }
    throw new Error(`Timeout waiting for ${label}`);
  };
  const scenario = async (name, action) => {
    try { await action(); report.scenarios.push({ name, status: 'Passed' }); }
    catch (error) {
      report.scenarios.push({ name, status: error.blocked ? 'Blocked' : 'Failed', reason: String(error.message) });
      if (!error.blocked) throw error;
    }
  };
  const block = message => { const error = new Error(message); error.blocked = true; throw error; };
  const cache = () => app.metadataCache.getFileCache(fixture)?.frontmatter;
  const todayDate = new Date();
  const today = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;
  const reviewedKey = plugin.settings.frontmatterReviewedKey;
  const intervalKey = plugin.settings.frontmatterIntervalKey;
  const createNote = async path => {
    const file = await app.vault.create(path, `---\n${reviewedKey}: 2000-01-01\nkeep: unchanged\n---\nNative review fixture\n`);
    ownedFiles.add(file);
    return file;
  };
  const counterText = () => doc.querySelector('.review-due-counter-text')?.textContent ?? '';
  const counter = () => Number.parseInt(counterText(), 10);
  const nativeKey = (keyCode, modifiers = []) => {
    const contents = win.require('electron').remote.getCurrentWindow().webContents;
    contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  };
  try {
    if (!plugin.settings.showReviewStatus || !plugin.settings.showDueCounter) block('Enable review status and due counter for native UI acceptance');
    if (reviewedKey === intervalKey) block('Saved frontmatter fields collide');
    check(!app.vault.getAbstractFileByPath(root) && !app.vault.getAbstractFileByPath(movedRoot), 'Fixture root already exists');
    const collides = path => [root, movedRoot].some(base => path === base || path.startsWith(`${base}/`));
    check(!plugin.settings.folderIntervals.some(rule => collides(rule.folder)) && !plugin.settings.includedFolders.some(collides), 'Fixture rules already exist');
    ownedFolders.add(await app.vault.createFolder(root));
    settingsChanged = true;
    plugin.settings.folderIntervals.push({ folder: root, days: 7 });
    plugin.settings.includedFolders.push(root);
    await plugin.saveSettings();
    plugin.refreshReviewState();
    fixture = await createNote(`${root}/note.md`);
    await app.workspace.getLeaf(false).openFile(fixture);
    await wait(() => cache()?.[reviewedKey] === '2000-01-01' && status()?.textContent.includes('Overdue'), 'initial overdue status');
    await wait(() => !doc.querySelector('.review-due-counter')?.classList.contains('review-hidden') && counter() > 0 && counter() === plugin.dueCounter.cache.countDue(), 'initial due count');

    await scenario('keyboard details, geometry, close and reopen', async () => {
      const anchor = status();
      if (!options.windowVisible || !options.windowFocused || !doc.hasFocus() || !anchor?.isConnected || !anchor.getClientRects().length) block('Vault window/status is hidden or unfocused');
      anchor.focus();
      if (options.probe === 'focus-blocked') anchor.blur();
      if (doc.activeElement !== anchor) block('Initial status-bar focus was not established');
      for (let i = 0; i < 3; i++) {
        nativeKey('Enter');
        await wait(() => popup(), 'keyboard details');
        const rect = popup().getBoundingClientRect();
        check(rect.width > 0 && rect.left >= -1 && rect.right <= win.innerWidth + 1, 'Popover escapes viewport');
        popup().querySelector('summary').click();
        check(popup().querySelector('.review-details-folder-days')?.textContent.includes('7 days'), 'Explanation disagrees with folder interval');
        nativeKey('Escape');
        await wait(() => !popup(), 'Escape close');
        check(!doc.querySelector('.review-details-popover-measure'), 'Measurement clone survives close');
        check(doc.activeElement === anchor, 'Closing details lost anchor focus');
      }
    });

    await scenario('narrow and wide native layout retains readable folder suffix', async () => {
      const browserWindow = win.require('electron').remote.getCurrentWindow();
      const bounds = browserWindow.getBounds();
      const maximized = browserWindow.isMaximized();
      const folderPath = `${root}/An exceptionally long folder name for downloaded research materials and scripts`;
      ownedFolders.add(await app.vault.createFolder(folderPath));
      plugin.settings.folderIntervals.push({ folder: folderPath, days: 7 });
      await plugin.saveSettings();
      plugin.refreshReviewState();
      const layoutFile = await createNote(`${folderPath}/layout.md`);
      try {
        await app.workspace.getLeaf(false).openFile(layoutFile);
        await wait(() => plugin.statusBar.currentFile === layoutFile && app.metadataCache.getFileCache(layoutFile)?.frontmatter?.[reviewedKey] === '2000-01-01' && status()?.textContent.includes('Overdue'), 'layout fixture metadata and active status');
        const shots = [];
        for (const width of [640, 1440]) {
          if (browserWindow.isMaximized()) browserWindow.unmaximize();
          browserWindow.setContentSize(width, 700);
          await wait(() => Math.abs(win.innerWidth - width) <= 2, 'native viewport resize');
          status().click();
          await wait(() => popup(), 'layout popover');
          popup().querySelector('summary').click();
          await new Promise(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(resolve)));
          const rect = popup().getBoundingClientRect();
          check(rect.width > 0 && rect.left >= -1 && rect.right <= win.innerWidth + 1 && rect.top >= -1 && rect.bottom <= win.innerHeight + 1, 'Layout escapes viewport');
          const rows = [...popup().querySelectorAll('.review-details-folder-path')];
          const path = rows.find(el => el.getAttribute('title') === folderPath);
          check(path?.textContent?.endsWith('scripts'), 'Readable folder suffix was lost');
          for (const row of rows) {
            if (!row.getClientRects().length) continue;
            const range = doc.createRange();
            range.selectNodeContents(row);
            check(range.getBoundingClientRect().width <= row.getBoundingClientRect().width + 1, 'Folder text overflows its slot');
          }
          const screenshot = `${options.screenshotPrefix}-${width}.png`;
          win.require('node:fs').writeFileSync(screenshot, (await browserWindow.webContents.capturePage()).toPNG());
          shots.push({ viewportWidth: win.innerWidth, popoverWidth: rect.width, screenshot });
          plugin.statusBar.closeDetails(false);
          check(!doc.querySelector('.review-details-popover-measure'), 'Layout measurement clone survived close');
        }
        report.layout = shots;
      } finally {
        plugin.statusBar.closeDetails(false);
        browserWindow.setBounds(bounds);
        if (maximized) browserWindow.maximize();
        await app.workspace.getLeaf(false).openFile(fixture);
        await wait(() => app.workspace.getActiveFile() === fixture && plugin.statusBar.currentFile === fixture && cache()?.[reviewedKey] === '2000-01-01' && status()?.textContent.includes('Overdue'), 'original fixture and active status restored');
      }
    });

    await scenario('Mark reviewed button persists day, unrelated fields and due count', async () => {
      await wait(() => counter() === plugin.dueCounter.cache.countDue(), 'settled due count before marking');
      const dueBefore = counter();
      status().click();
      await wait(() => popup(), 'click details');
      const button = [...popup().querySelectorAll('button')].find(el => el.textContent.trim() === 'Mark reviewed');
      if (options.probe === 'missing-action') button?.remove();
      check(button?.isConnected && !button.disabled, 'Mark reviewed action is missing or disabled');
      button.click();
      await wait(() => cache()?.[reviewedKey] === today && status()?.textContent.includes(today) && !popup(), 'marked metadata and closed details');
      await wait(() => counter() === dueBefore - 1, 'due counter decremented once');
      const content = await app.vault.read(fixture);
      check(content.includes('keep: unchanged') && content.includes('Native review fixture'), 'Mark changed unrelated data');
    });

    await scenario('external date edit, deletion and restoration update real UI', async () => {
      await app.fileManager.processFrontMatter(fixture, fm => { fm[reviewedKey] = '2000-01-01'; });
      await wait(() => cache()?.[reviewedKey] === '2000-01-01' && status()?.textContent.includes('Overdue'), 'external old date');
      await app.fileManager.processFrontMatter(fixture, fm => { delete fm[reviewedKey]; });
      await wait(() => cache() && !(reviewedKey in cache()) && status()?.textContent.includes('Not reviewed'), 'external deletion');
      await app.fileManager.processFrontMatter(fixture, fm => { fm[reviewedKey] = today; });
      await wait(() => cache()?.[reviewedKey] === today && status()?.textContent.includes(today), 'restored date');
    });

    await scenario('source editor Backspace and Ctrl+Z restore date and due membership', async () => {
      if (!options.windowFocused || !doc.hasFocus()) block('Editor keyboard acceptance requires foreground focus');
      const leaf = app.workspace.getMostRecentLeaf();
      await leaf.setViewState({ type: 'markdown', state: { file: fixture.path, mode: 'source', source: true } });
      const editor = leaf.view.editor;
      const originalText = editor.getValue();
      const line = originalText.split('\n').findIndex(value => value.startsWith(`${reviewedKey}:`));
      check(line >= 0, 'Reviewed line is absent from source editor');
      await wait(() => counter() === plugin.dueCounter.cache.countDue(), 'settled due membership');
      const dueBefore = counter();
      editor.setSelection({ line, ch: 0 }, { line: line + 1, ch: 0 });
      editor.focus();
      nativeKey('Backspace');
      await wait(() => cache() && !(reviewedKey in cache()) && status()?.textContent.includes('Not reviewed'), 'editor deletion publication');
      await wait(() => counter() === dueBefore + 1, 'editor deletion due membership');
      check(!(await app.vault.read(fixture)).includes(`${reviewedKey}:`), 'Editor deletion was not saved');
      nativeKey('Z', ['control']);
      await wait(() => editor.getValue() === originalText && cache()?.[reviewedKey] === today && status()?.textContent.includes(today), 'Ctrl+Z restoration');
      await wait(() => counter() === dueBefore, 'undo due membership');
      check(await app.vault.read(fixture) === originalText, 'Undo was not persisted');
    });

    await scenario('file/folder moves preserve review date and migrate owned rules', async () => {
      await app.fileManager.renameFile(fixture, `${root}/renamed.md`);
      await wait(() => !plugin.renameCoordinator.isPending() && status()?.textContent.includes(today), 'file move');
      const folder = [...ownedFolders][0];
      await app.fileManager.renameFile(folder, movedRoot);
      await wait(() => !plugin.renameCoordinator.isPending() && status()?.textContent.includes(today), 'folder move');
      check(plugin.settings.folderIntervals.some(rule => rule.folder === movedRoot && rule.days === 7), 'Folder interval not migrated');
      check(plugin.settings.includedFolders.includes(movedRoot) && !plugin.settings.includedFolders.includes(root), 'Included folder not migrated');
      await app.fileManager.renameFile(fixture, `${movedRoot}/renamed.txt`);
      await wait(() => !plugin.renameCoordinator.isPending() && status()?.classList.contains('review-hidden'), 'attachment transition');
      await app.fileManager.renameFile(fixture, `${movedRoot}/renamed.md`);
      await wait(() => !plugin.renameCoordinator.isPending() && cache()?.[reviewedKey] === today && status()?.textContent.includes(today), 'Markdown restoration');
    });

    await scenario('missing moved metadata keeps other due notes available and recovers without an event', async () => {
      const available = await createNote(`${movedRoot}/available.md`);
      await app.fileManager.processFrontMatter(available, fm => { fm[intervalKey] = 7; });
      await wait(() => app.metadataCache.getFileCache(available)?.frontmatter?.[intervalKey] === 7, 'available candidate metadata');
      app.metadataCache.getFileCache = function(file) {
        return file === blockedFile ? null : originalGetCache.call(this, file);
      };
      blockedFile = fixture;
      await app.fileManager.renameFile(fixture, `${movedRoot}/delayed.md`);
      await new Promise(resolve => win.setTimeout(resolve, 1500));
      check(plugin.renameCoordinator.isPending(fixture), 'Absent metadata was treated as ready');
      check(status()?.classList.contains('review-hidden'), 'Unresolved note exposed a review date');
      check(counterText().endsWith('+') && !doc.querySelector('.review-due-counter')?.classList.contains('review-hidden'), 'Incomplete count was hidden or presented as exact');
      const originalFiles = app.vault.getMarkdownFiles;
      try {
        // Keep random navigation within owned fixtures, with one known due candidate.
        app.vault.getMarkdownFiles = () => [fixture, available];
        await plugin.openRandomDue();
        check(app.workspace.getActiveFile() === available, 'Unrelated due candidate was blocked or unresolved note selected');
      } finally { app.vault.getMarkdownFiles = originalFiles; }
      await app.workspace.getLeaf(false).openFile(fixture);
      blockedFile = null;
      await wait(() => !plugin.renameCoordinator.isPending() && status()?.textContent.includes(today) && !counterText().endsWith('+'), 'late metadata recovery without an emitted event');
      app.metadataCache.getFileCache = originalGetCache;
    });

    await scenario('pending deletion restores exact count; unload cancels pending coordination', async () => {
      app.metadataCache.getFileCache = function(file) {
        return file === blockedFile ? null : originalGetCache.call(this, file);
      };
      blockedFile = fixture;
      await app.fileManager.renameFile(fixture, `${movedRoot}/pending.md`);
      check(plugin.renameCoordinator.isPending(), 'Unavailable metadata did not gate review');
      await app.vault.delete(fixture);
      ownedFiles.delete(fixture);
      await wait(() => !plugin.renameCoordinator.isPending(), 'pending deletion');
      blockedFile = null;
      fixture = await createNote(`${movedRoot}/reload.md`);
      await wait(() => cache()?.[reviewedKey] === '2000-01-01', 'reload fixture cache');
      await app.workspace.getLeaf(false).openFile(fixture);
      blockedFile = fixture;
      await app.fileManager.renameFile(fixture, `${movedRoot}/reload-moved.md`);
      check(plugin.renameCoordinator.isPending(), 'Reload scenario has no pending rename');
      const oldCoordinator = plugin.renameCoordinator;
      const savedSettings = JSON.stringify(plugin.settings);
      await app.plugins.disablePlugin(pluginId);
      blockedFile = null;
      app.metadataCache.getFileCache = originalGetCache;
      await app.plugins.enablePlugin(pluginId);
      plugin = app.plugins.plugins[pluginId];
      check(!oldCoordinator.isPending(), 'Old coordinator retained state after unload');
      check(JSON.stringify(plugin.settings) === savedSettings, 'Reload changed saved settings');
      await wait(() => status()?.textContent.includes('Overdue'), 'reloaded status');
      check(Object.keys(app.commands.commands).filter(id => id.startsWith(`${pluginId}:`)).length === 2, 'Duplicate/missing commands');
    });
    report.status = report.scenarios.some(item => item.status === 'Blocked') ? 'Blocked' : 'Passed';
  } catch (error) {
    report.status = error.blocked ? 'Blocked' : 'Failed';
    report.reason = String(error.message);
    report.failureState = {
      activeFile: app.workspace.getActiveFile()?.path,
      statusFile: plugin.statusBar?.currentFile?.path,
      statusText: status()?.textContent,
      fixtures: [...ownedFiles].map(file => ({ path: file.path, reviewed: app.metadataCache.getFileCache(file)?.frontmatter?.[reviewedKey] })),
    };
  } finally {
    try {
      app.metadataCache.getFileCache = originalGetCache;
      if (!app.plugins.plugins[pluginId]) await app.plugins.enablePlugin(pluginId);
      plugin = app.plugins.plugins[pluginId];
      plugin.statusBar?.closeDetails(false);
      const isOwnedPath = path => path === root || path.startsWith(`${root}/`) || path === movedRoot || path.startsWith(`${movedRoot}/`);
      if (settingsChanged) {
        plugin.settings.folderIntervals = plugin.settings.folderIntervals.filter(rule => !isOwnedPath(rule.folder));
        plugin.settings.includedFolders = plugin.settings.includedFolders.filter(path => !isOwnedPath(path));
        await plugin.saveSettings();
        plugin.refreshReviewState();
      }
      if (previous && app.vault.getAbstractFileByPath(previous.path) === previous) {
        await (previousLeaf ?? app.workspace.getLeaf(false)).openFile(previous);
        if (previousLeaf && previousViewState) await previousLeaf.setViewState(previousViewState);
      }
      for (const file of ownedFiles) {
        check(isOwnedPath(file.path), 'Fixture moved outside owned roots; refusing cleanup');
        if (app.vault.getAbstractFileByPath(file.path) === file) await app.vault.delete(file);
      }
      for (const folder of [...ownedFolders].sort((a, b) => b.path.length - a.path.length)) {
        check(isOwnedPath(folder.path), 'Folder moved outside owned roots; refusing cleanup');
        check(folder.children.length === 0, 'Foreign contents inside fixture folder; refusing cleanup');
        if (app.vault.getAbstractFileByPath(folder.path) === folder) await app.vault.delete(folder, true);
      }
      check(JSON.stringify(plugin.settings) === originalSettings, 'Settings differ after cleanup');
      check(!app.vault.getAbstractFileByPath(root) && !app.vault.getAbstractFileByPath(movedRoot), 'Fixture roots survived cleanup');
      report.cleanup = { status: 'Passed', settingsPreserved: true, fixtureRootsRemoved: true };
    } catch (error) {
      report.cleanup = { status: 'Failed', reason: String(error.message) };
      report.status = 'Failed';
    }
  }
  return report;
}
