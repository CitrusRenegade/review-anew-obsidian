// Only the Obsidian host API is substituted; DOM and layout run in Chromium.
export class Component {
  cleanups = [];
  load() { this.onload(); }
  registerDomEvent(target, type, callback, options) {
    target.addEventListener(type, callback, options);
    this.cleanups.push(() => target.removeEventListener(type, callback, options));
  }
  unload() {
    this.cleanups.forEach(cleanup => cleanup());
    this.onunload();
  }
}

export function setIcon(el) {
  const svg = el.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  el.append(svg);
}

export function installDomHelpers(win) {
  const proto = win.HTMLElement.prototype;
  proto.addClass = function (...names) { this.classList.add(...names); };
  proto.removeClass = function (...names) { this.classList.remove(...names); };
  proto.toggleClass = function (name, force) { this.classList.toggle(name, force); };
  proto.createEl = function (tag, options = {}) {
    const el = this.ownerDocument.createElement(tag);
    if (options.cls) el.className = options.cls;
    if (options.text) el.textContent = options.text;
    for (const [key, value] of Object.entries(options.attr ?? {})) el.setAttribute(key, value);
    this.append(el);
    return el;
  };
  proto.createDiv = function (options) { return this.createEl('div', options); };
  proto.createSpan = function (options) { return this.createEl('span', options); };
  win.createDiv = () => win.document.createElement('div');
  win.document.win = win;
}
