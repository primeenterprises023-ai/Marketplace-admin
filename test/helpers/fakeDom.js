// DOM falso e mínimo: só o que o login, o painel e o dashboard usam.
// Os elementos são criados a partir dos atributos id="..." e data-*="..."
// que aparecem no HTML escrito em innerHTML. Serve para apanhar erros de
// ligação (ids em falta, eventos mal ligados); NÃO substitui abrir o painel
// num browser verdadeiro.

class FakeEl {
  constructor(doc, id, attrs = {}) {
    this.doc = doc;
    this.id = id || "";
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.type = "";
    this.className = "";
    this.textContent = "";
    this.focused = false;
    this._attrs = { ...attrs };
    this._classes = new Set();
    this.listeners = {};
    this.style = {};
    this._html = "";
    this.children = new Map();
  }

  get innerHTML() { return this._html; }

  set innerHTML(value) {
    this._html = String(value);
    this.children = new Map();
    // elementos com id (para getElementById) e com data-* (para querySelector*)
    if (this.registersIds) this.doc._scan(this._html);
    this._scanLocal();
  }

  _scanLocal() {
    const make = (key, attrs) => {
      if (!this.children.has(key)) this.children.set(key, []);
      const el = new FakeEl(this.doc, "", attrs);
      this.children.get(key).push(el);
      return el;
    };
    let m;
    const days = /data-days="(\d+)"/g;
    while ((m = days.exec(this._html))) make("[data-days]", { "data-days": m[1] });
    const widths = /data-w="([\d.]+)"/g;
    while ((m = widths.exec(this._html))) make("[data-w]", { "data-w": m[1] });
    ["refresh", "retry", "logout"].forEach((name) => {
      if (this._html.includes('data-action="' + name + '"')) make('[data-action="' + name + '"]', { "data-action": name });
    });
    if (this._html.includes("data-hint")) make("[data-hint]", {});
    if (/<span[ >]/.test(this._html)) make("span", {});
  }

  querySelectorAll(selector) { return this.children.get(selector) || []; }
  querySelector(selector) { return (this.children.get(selector) || [])[0] || null; }

  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }

  async dispatch(type, event = {}) {
    for (const fn of this.listeners[type] || []) {
      await fn({ preventDefault() {}, target: this, ...event });
    }
  }

  setAttribute(name, value) { this._attrs[name] = String(value); }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this._attrs, name) ? this._attrs[name] : null; }
  removeAttribute(name) { delete this._attrs[name]; }

  get classList() {
    return {
      add: (c) => this._classes.add(c),
      remove: (c) => this._classes.delete(c),
      contains: (c) => this._classes.has(c),
      toggle: (c, on) => { if (on === undefined ? !this._classes.has(c) : on) this._classes.add(c); else this._classes.delete(c); }
    };
  }

  focus() { this.focused = true; }

  closest(selector) {
    // para os cliques delegados: só reconhece o seletor do botão de sair
    return this._matches && this._matches(selector) ? this : null;
  }
}

class FakeDoc {
  constructor() {
    this.hidden = false;
    this.title = "";
    this.listeners = {};
    this.els = new Map();
    this.navLinks = [];
    this.body = new FakeEl(this, "body");
  }

  // regista elementos com id e links de navegação a partir de um HTML
  _scan(html) {
    this.navLinks = [];
    let m;
    const tags = /<[a-zA-Z][^>]*>/g;
    while ((m = tags.exec(html))) {
      const idMatch = /\bid="([^"]+)"/.exec(m[0]);
      if (!idMatch) continue;
      const id = idMatch[1];
      if (this.els.has(id) && id === "app") continue;
      const el = new FakeEl(this, id, {});
      el.hidden = /\shidden(\s|>|=|\/)/.test(m[0]);
      this.els.set(id, el);
    }
    const nav = /data-nav="([^"]+)"/g;
    while ((m = nav.exec(html))) {
      const link = new FakeEl(this, "", { "data-nav": m[1] });
      this.navLinks.push(link);
    }
    // notif-panel/view/etc. têm innerHTML próprio
  }

  add(id, extra = {}) {
    const el = new FakeEl(this, id);
    Object.assign(el, extra);
    this.els.set(id, el);
    return el;
  }

  getElementById(id) { return this.els.get(id) || null; }

  querySelectorAll(selector) {
    return selector === "[data-nav]" ? this.navLinks : [];
  }

  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }

  async dispatch(type, event = {}) {
    for (const fn of this.listeners[type] || []) await fn({ target: { closest: () => null }, ...event });
  }
}

class FakeWindow {
  constructor(hash = "#/dashboard", search = "") {
    this.location = {
      hash,
      search,
      replaced: [],
      replace(url) { this.replaced.push(url); }
    };
    this.listeners = {};
  }

  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }

  async dispatch(type) {
    for (const fn of this.listeners[type] || []) await fn({});
  }
}

module.exports = { FakeEl, FakeDoc, FakeWindow };
