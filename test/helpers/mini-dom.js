/* ============================================================
   Test helper — dependency-free mini DOM

   Enough of the browser platform to actually *execute* app.js inside
   `vm` and assert on the rendered persona cards, the single-toast
   handler, and the POST /api/tts preview round-trip. No jsdom, no
   node_modules, no browser required.
   ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

/* ---------------- selectors ---------------- */

function parseSelector(selector) {
  return String(selector).trim().split(/\s+/).map((part) => {
    const match = part.match(/^([a-zA-Z][\w-]*)?(?:#([\w:-]+))?((?:\.[\w-]+)*)$/);
    const classes = match && match[3] ? match[3].split(".").filter(Boolean) : [];
    return { tag: match && match[1] ? match[1].toLowerCase() : null, id: match && match[2] ? match[2] : null, classes };
  });
}

function matchesSimple(element, part) {
  if (part.tag && element.tagName !== part.tag) return false;
  if (part.id && element.id !== part.id) return false;
  return part.classes.every((cls) => element.classList.contains(cls));
}

function matchesSelector(element, selector) {
  const parts = parseSelector(selector);
  const last = parts[parts.length - 1];
  if (!matchesSimple(element, last)) return false;
  let node = element.parentElement;
  for (let i = parts.length - 2; i >= 0; i--) {
    let found = false;
    while (node) {
      if (matchesSimple(node, parts[i])) {
        found = true;
        node = node.parentElement;
        break;
      }
      node = node.parentElement;
    }
    if (!found) return false;
  }
  return true;
}

function walk(element, visit) {
  for (const child of element.children) {
    visit(child);
    walk(child, visit);
  }
}

/* ---------------- tiny HTML parser (double-quoted attributes) ---------------- */

const VOID_TAGS = new Set(["br", "img", "input", "hr", "meta", "link", "source", "path"]);

function parseHtml(html, ownerDocument) {
  const root = ownerDocument.createElement("div", { fragment: true });
  const stack = [root];
  const tokenPattern = /<!--[\s\S]*?-->|<\/?([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*(\/?)>/g;
  let lastIndex = 0;
  let match;

  const pushText = (text) => {
    if (!text) return;
    const current = stack[stack.length - 1];
    const node = ownerDocument.createTextNode(text);
    node.parentElement = current;
    current.childNodes.push(node);
  };

  while ((match = tokenPattern.exec(html))) {
    pushText(html.slice(lastIndex, match.index));
    lastIndex = tokenPattern.lastIndex;

    const [full, tagName, attributeText, selfClosing] = match;
    if (full.startsWith("<!--")) continue;

    const tag = String(tagName).toLowerCase();
    if (full.startsWith("</")) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const element = ownerDocument.createElement(tag);
    for (const attribute of String(attributeText || "").matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) {
      element.setAttribute(attribute[1], attribute[2] === undefined ? "" : attribute[2]);
    }
    const parent = stack[stack.length - 1];
    element.parentElement = parent;
    parent.children.push(element);
    parent.childNodes.push(element);

    if (!selfClosing && !VOID_TAGS.has(tag)) stack.push(element);
  }
  pushText(html.slice(lastIndex));
  return root.childNodes;
}

/* ---------------- elements ---------------- */

class MiniClassList {
  constructor(element) {
    this.element = element;
    this.set = new Set();
  }
  add(...names) { names.forEach((n) => n && this.set.add(n)); }
  remove(...names) { names.forEach((n) => this.set.delete(n)); }
  contains(name) { return this.set.has(name); }
  toggle(name, force) {
    const wanted = force === undefined ? !this.set.has(name) : !!force;
    if (wanted) this.set.add(name);
    else this.set.delete(name);
    return wanted;
  }
  get value() { return Array.from(this.set).join(" "); }
}

function createStyle() {
  const style = {
    setProperty(name, value) { style[name] = String(value); },
    getPropertyValue(name) { return style[name] || ""; },
    removeProperty(name) { delete style[name]; return ""; },
  };
  return style;
}

class MiniElement {
  constructor(tagName, ownerDocument, options = {}) {
    this.tagName = String(tagName).toLowerCase();
    this.ownerDocument = ownerDocument;
    this.attributes = new Map();
    this.childNodes = [];
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
    this.classList = new MiniClassList(this);
    this.style = createStyle();
    this.dataset = {};
    this._textContent = "";
    this._innerHTML = "";
    this._id = "";
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.files = [];
    this.title = "";
    this.checked = false;
    this.offsetWidth = 0;
    this.isFragment = !!options.fragment;
  }

  get isConnected() { return this.ownerDocument._isConnected(this); }

  get id() { return this._id; }
  set id(value) { this._id = String(value); }

  get className() { return this.classList.value; }
  set className(value) {
    this.classList.set = new Set(String(value).split(/\s+/).filter(Boolean));
  }

  get tag() { return this.tagName; }

  setAttribute(name, value) {
    const key = String(name);
    this.attributes.set(key.toLowerCase(), String(value));
    if (key.toLowerCase() === "class") this.className = value;
    if (key.toLowerCase() === "id") this.id = value;
  }
  getAttribute(name) { return this.attributes.has(String(name).toLowerCase()) ? this.attributes.get(String(name).toLowerCase()) : null; }
  hasAttribute(name) { return this.attributes.has(String(name).toLowerCase()); }
  removeAttribute(name) { this.attributes.delete(String(name).toLowerCase()); }

  get textContent() {
    if (this.childNodes.length) {
      return this.childNodes
        .map((child) => (child.nodeType === 3 ? child._textContent : child.textContent))
        .join("");
    }
    return this._textContent;
  }
  set textContent(value) {
    this.children = [];
    this.childNodes = [];
    this._textContent = String(value == null ? "" : value);
  }

  get innerHTML() {
    if (!this.childNodes.length) return this._textContent;
    return this.childNodes
      .map((child) => (child.nodeType === 3 ? child._textContent : child.outerHTML))
      .join("");
  }
  set innerHTML(html) {
    this.children = [];
    this.childNodes = [];
    this._textContent = "";
    for (const node of parseHtml(String(html), this.ownerDocument)) {
      node.parentElement = this;
      this.childNodes.push(node);
      if (node.nodeType !== 3) this.children.push(node);
    }
  }

  get outerHTML() {
    const attributes = Array.from(this.attributes.entries()).map(([k, v]) => ` ${k}="${v}"`).join("");
    if (VOID_TAGS.has(this.tagName)) return `<${this.tagName}${attributes}>`;
    return `<${this.tagName}${attributes}>${this.innerHTML}</${this.tagName}>`;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    this.childNodes.push(child);
    return child;
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.childNodes = [];
    this._textContent = "";
    for (const node of nodes) this.appendChild(node);
  }

  remove() {
    const parent = this.parentElement;
    if (!parent) return;
    parent.children = parent.children.filter((child) => child !== this);
    parent.childNodes = parent.childNodes.filter((child) => child !== this);
    this.parentElement = null;
    this.ownerDocument._detach(this);
  }

  insertBefore(child, reference) {
    const index = this.children.indexOf(reference);
    child.parentElement = this;
    if (index < 0) return this.appendChild(child);
    this.children.splice(index, 0, child);
    this.childNodes.splice(index, 0, child);
    return child;
  }

  querySelectorAll(selector) {
    const found = [];
    walk(this, (element) => {
      if (matchesSelector(element, selector)) found.push(element);
    });
    return found;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (node.tagName && matchesSelector(node, selector)) return node;
      node = node.parentElement;
    }
    return null;
  }

  matches(selector) { return matchesSelector(this, selector); }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  removeEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    this.listeners.set(type, list.filter((fn) => fn !== handler));
  }

  /** Dispatch an event that bubbles to the document, like the real DOM. */
  dispatch(type, properties = {}) {
    const event = {
      type,
      target: this,
      defaultPrevented: false,
      propagationStopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      ...properties,
    };
    if (!event.target) event.target = this;

    let node = this;
    while (node) {
      event.currentTarget = node;
      const handlers = (node.listeners.get(type) || []).slice();
      for (const handler of handlers) {
        handler.call(node, event);
        if (event.propagationStopped) return event;
      }
      node = node.parentElement;
    }
    this.ownerDocument._dispatchToDocument(type, event);
    return event;
  }

  click() { return this.dispatch("click"); }
  focus() {}
  blur() {}
  scrollIntoView() {}
  setSelectionRange() {}
  select() {}
  pause() {}
  play() { return Promise.resolve(); }
}

/* ---------------- document + window ---------------- */

function createMiniDom(html) {
  const document = {
    readyState: "complete",
    listeners: new Map(),
    ids: new Map(),
    detached: new Set(),
    _isConnected(element) {
      let node = element;
      while (node) {
        if (node === document.body || node === document.documentElement) return true;
        node = node.parentElement;
      }
      return false;
    },
    _detach(element) { document.detached.add(element); },
    _dispatchToDocument(type, event) {
      for (const handler of document.listeners.get(type) || []) handler(event);
    },
    createElement(tag, options) {
      const element = new MiniElement(tag, document, options);
      if (!options || !options.fragment) return element;
      return element;
    },
    createTextNode(text) {
      const node = new MiniElement("#text", document);
      node._textContent = String(text);
      node.nodeType = 3;
      return node;
    },
    getElementById(id) { return document.ids.get(String(id)) || null; },
    querySelectorAll(selector) {
      const found = [];
      walk(document.body, (element) => {
        if (matchesSelector(element, selector)) found.push(element);
      });
      return found;
    },
    querySelector(selector) {
      /* Ids are auto-registered so app.js init code always finds its hooks. */
      if (/^#[\w:-]+$/.test(selector.trim())) {
        const id = selector.trim().slice(1);
        if (!document.ids.has(id)) {
          const element = document.createElement("div");
          element.id = id;
          document.ids.set(id, element);
          document.body.appendChild(element);
        }
        return document.ids.get(id);
      }
      return document.querySelectorAll(selector)[0] || null;
    },
    addEventListener(type, handler) {
      if (!document.listeners.has(type)) document.listeners.set(type, []);
      document.listeners.get(type).push(handler);
    },
    execCommand() { return true; },
  };

  document.documentElement = document.createElement("html");
  document.body = document.createElement("div");
  document.body.tagName = "body";
  document.documentElement.appendChild(document.body);

  /* Pre-register every id declared in index.html. */
  const ids = Array.from(html.matchAll(/\sid="([^"]+)"/g)).map((m) => m[1]);
  const trees = new Map();
  for (const id of ids) {
    const element = document.createElement("div");
    element.id = id;
    document.ids.set(id, element);
    document.body.appendChild(element);
    trees.set(id, element);
  }

  /* Voice grids are injected by app.js through these containers. */
  document.voiceGrid = document.ids.get("voiceGrid") || document.querySelector("#voiceGrid");
  document.recapVoiceGrid = document.ids.get("recapVoiceGrid") || document.querySelector("#recapVoiceGrid");

  const clock = createClock();
  const blobs = [];

  const window = {
    document,
    addEventListener: document.addEventListener,
    removeEventListener() {},
    scrollTo() {},
    open() {},
    location: { href: "http://localhost:4173/", origin: "http://localhost:4173" },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    requestAnimationFrame: (fn) => clock.setTimeout(fn, 16),
    cancelAnimationFrame: (id) => clock.clearTimeout(id),
    innerWidth: 1440,
    innerHeight: 900,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    alert() {},
    confirm: () => true,
    prompt: () => null,
  };
  window.window = window;

  return { document, window, clock, blobs };
}

function createClock() {
  let nextId = 1;
  let now = 0;
  let queue = new Map();

  const schedule = (fn, delay, repeat) => {
    const id = nextId++;
    queue.set(id, { fn, time: now + (Number(delay) || 0), repeat: repeat ? Math.max(1, Number(delay) || 1) : 0 });
    return id;
  };

  const clock = {
    now: () => now,
    setTimeout: (fn, delay, ...args) => schedule(() => fn(...args), delay, false),
    clearTimeout: (id) => queue.delete(id),
    setInterval: (fn, delay, ...args) => schedule(() => fn(...args), delay, true),
    clearInterval: (id) => queue.delete(id),
    pending: () => queue.size,
    tick(ms) {
      const target = now + Number(ms || 0);
      for (let guard = 0; guard < 10000; guard++) {
        const due = Array.from(queue.entries())
          .filter(([, task]) => task.time <= target)
          .sort((a, b) => a[1].time - b[1].time || a[0] - b[0]);
        if (!due.length) break;
        const [id, task] = due[0];
        now = Math.max(now, task.time);
        if (task.repeat) task.time = now + task.repeat;
        else queue.delete(id);
        try {
          task.fn();
        } catch (error) {
          throw error;
        }
      }
      now = target;
    },
  };
  return clock;
}

/* ---------------- app loader ---------------- */

/**
 * Execute app.js in a sandboxed context with the mini DOM.
 * @param {{ fetch?: Function, files?: Record<string,string>, extraGlobals?: object }} [options]
 */
function loadApp(options = {}) {
  const root = path.resolve(__dirname, "..", "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");

  const { document, window, clock } = createMiniDom(html);

  const storage = new Map();
  const localStorage = {
    getItem: (key) => (storage.has(String(key)) ? storage.get(String(key)) : null),
    setItem: (key, value) => storage.set(String(key), String(value)),
    removeItem: (key) => storage.delete(String(key)),
    clear: () => storage.clear(),
    key: (i) => Array.from(storage.keys())[i] || null,
    get length() { return storage.size; },
  };

  const fetchCalls = [];
  const fetchImpl = options.fetch || (async () => ({
    ok: true,
    status: 200,
    headers: { get: () => "audio/mpeg" },
    blob: async () => ({ size: 1234, type: "audio/mpeg" }),
    json: async () => ({}),
    text: async () => "",
    arrayBuffer: async () => new ArrayBuffer(0),
  }));

  const fetchStub = async (url, init) => {
    fetchCalls.push({ url: String(url), init: init || {} });
    return fetchImpl(String(url), init || {});
  };

  const audioInstances = [];
  class AudioStub {
    constructor(src) {
      this.src = src;
      this.paused = true;
      this.currentTime = 0;
      audioInstances.push(this);
    }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }

  const objectUrls = [];
  const revokedUrls = [];

  const sandbox = {
    window,
    document,
    console,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    localStorage,
    sessionStorage: localStorage,
    fetch: fetchStub,
    Headers: class Headers {},
    Request: class Request {},
    Response: class Response {},
    Audio: AudioStub,
    Blob: class Blob {
      constructor(parts = [], opts = {}) {
        this.parts = parts;
        this.size = parts.join("").length || 0;
        this.type = opts.type || "";
      }
    },
    FileReader: class FileReader { readAsDataURL() {} },
    AbortController,
    URL: class MiniURL extends URL {
      static createObjectURL(blob) {
        const url = `blob:mini-${objectUrls.length + 1}`;
        objectUrls.push({ url, blob });
        return url;
      }
      static revokeObjectURL(url) { revokedUrls.push(url); }
    },
    navigator: { userAgent: "mini-dom", clipboard: { writeText: async () => {} }, mediaDevices: {} },
    SpeechSynthesisUtterance: class SpeechSynthesisUtterance {
      constructor(text) { this.text = text; }
    },
    MediaRecorder: class MediaRecorder {},
    MediaStream: class MediaStream {},
    XMLHttpRequest: class XMLHttpRequest {},
    Image: class Image {},
    ...(options.extraGlobals || {}),
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(appSource, context, { filename: "app.js" });

  return {
    document,
    window,
    clock,
    fetchCalls,
    audioInstances,
    objectUrls,
    revokedUrls,
    localStorage,
    /** Flush pending microtasks (awaited fetch chains). */
    async flush(times = 6) {
      for (let i = 0; i < times; i++) await Promise.resolve();
      await new Promise((resolve) => setImmediate(resolve));
      for (let i = 0; i < times; i++) await Promise.resolve();
    },
    grid() { return document.getElementById("voiceGrid"); },
    recapGrid() { return document.getElementById("recapVoiceGrid"); },
    toastWrap() { return document.getElementById("toastWrap"); },
    toasts() { return document.getElementById("toastWrap").children; },
  };
}

module.exports = { loadApp, createMiniDom, matchesSelector, parseHtml };
