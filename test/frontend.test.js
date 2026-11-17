const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { FakeDoc, FakeWindow } = require("./helpers/fakeDom");

const JS = path.join(__dirname, "..", "public", "js");

const fmt = require(path.join(JS, "format.js"));
const icons = require(path.join(JS, "icons.js"));
const charts = require(path.join(JS, "charts.js"));
const perms = require(path.join(JS, "permissions.js"));
const apiModule = require(path.join(JS, "api.js"));
const dashboard = require(path.join(JS, "pages", "dashboard.js"));
const soon = require(path.join(JS, "pages", "soon.js"));
const shell = require(path.join(JS, "shell.js"));
const login = require(path.join(JS, "login.js"));

const { createApi, ApiError, SESSION_KEY } = apiModule;

// ---------- dados de exemplo (mesma forma que o backend devolve) ----------

const XSS = '<img src=x onerror=alert(1)>"\'&';

function sampleDashboard(overrides = {}) {
  return {
    generated_at: "2026-03-31T12:00:00.000Z",
    users: {
      total: 6, active: 5, suspended: 1, verified: 3, sellers: 4,
      by_account_type: { comprador: 2, vendedor: 2, stand: 1, rentacar: 1 },
      new_last_7_days: 4, new_last_30_days: 5
    },
    listings: {
      total: 9, published: 3, pending: 2, approved: 3, rejected: 0, suspended: 1, paused: 1, closed: 2,
      cars: { total: 6, by_status: { pending: 1, approved: 2, paused: 1, sold: 1, rejected: 0, suspended: 1 } },
      rentals: { total: 3, by_status: { pending: 1, approved: 1, paused: 0, rented: 1, rejected: 0, suspended: 0 } },
      parts: null, new_last_7_days: 4, new_last_30_days: 6
    },
    reports: { open: 2 },
    growth: {
      days: 7, truncated: false,
      labels: ["2026-03-25", "2026-03-26", "2026-03-27", "2026-03-28", "2026-03-29", "2026-03-30", "2026-03-31"],
      users: [1, 0, 0, 0, 0, 1, 2], listings: [0, 0, 0, 1, 1, 1, 1]
    },
    pending_queue: [
      { type: "rental", id: "r2", title: "Toyota Hiace 2019", created_at: "2026-03-28T09:00:00Z", owner_name: "Maria Silva" },
      { type: "car", id: "c2", title: "Toyota Hilux 2021", created_at: "2026-03-29T09:00:00Z", owner_name: "João Santos" }
    ],
    recent_activity: [
      { id: "l1", action: "listing.suspend", admin_name: "Rui Admin", admin_role: "admin", entity_type: "car", entity_id: "c4",
        title: "Kia Rio 2019", reason: "Fotos falsas", created_at: "2026-03-31T11:00:00Z" }
    ],
    warnings: [],
    ...overrides
  };
}

const ALL_ADMIN_PERMS = [
  "dashboard:view", "listings:view", "listings:review", "listings:suspend", "listings:edit", "listings:delete",
  "users:view", "users:suspend", "users:verify", "reports:view", "reports:resolve", "analytics:view", "audit:view"
];
const MODERATOR_PERMS = ["dashboard:view", "listings:view", "listings:review", "listings:suspend", "reports:view", "reports:resolve"];
const SUPER_PERMS = [...ALL_ADMIN_PERMS, "users:delete", "plans:view", "plans:change", "admins:manage", "settings:manage"];

const NOW = Date.parse("2026-03-31T12:00:00Z");

// =====================================================================
// format.js
// =====================================================================

test("format: escapeHtml neutraliza os 5 caracteres perigosos e aceita vazios", () => {
  assert.equal(fmt.escapeHtml(XSS), "&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;");
  assert.equal(fmt.escapeHtml(null), "");
  assert.equal(fmt.escapeHtml(undefined), "");
  assert.equal(fmt.escapeHtml(0), "0");
});

test("format: números, percentagens e travessão para valores em falta", () => {
  assert.equal(fmt.formatNumber(null), "\u2014");
  assert.equal(fmt.formatNumber(undefined), "\u2014");
  assert.equal(fmt.formatNumber("abc"), "\u2014");
  assert.equal(fmt.formatNumber(0), "0");
  assert.match(fmt.formatNumber(1234567), /^1\s?234\s?567$/);
  assert.match(fmt.formatPercent(1, 4), /^25\s%$/);
  assert.equal(fmt.formatPercent(1, 0), "\u2014");
  assert.equal(fmt.formatPercent(null, 5), "\u2014");
});

test("format: tempo relativo", () => {
  const ago = (ms) => new Date(NOW - ms).toISOString();
  assert.equal(fmt.timeAgo(ago(10 * 1000), NOW), "agora mesmo");
  assert.equal(fmt.timeAgo(ago(5 * 60 * 1000), NOW), "há 5 min");
  assert.equal(fmt.timeAgo(ago(3 * 3600 * 1000), NOW), "há 3 h");
  assert.equal(fmt.timeAgo(ago(86400 * 1000), NOW), "há 1 dia");
  assert.equal(fmt.timeAgo(ago(3 * 86400 * 1000), NOW), "há 3 dias");
  assert.match(fmt.timeAgo(ago(30 * 86400 * 1000), NOW), /\d{2}\/\d{2}\/\d{4}/);
  assert.equal(fmt.timeAgo("lixo", NOW), "\u2014");
  assert.equal(fmt.timeAgo(null, NOW), "\u2014");
  assert.equal(fmt.timeAgo(new Date(NOW + 60000).toISOString(), NOW), "agora mesmo", "datas no futuro não ficam negativas");
});

test("format: datas no fuso de Luanda (UTC+1)", () => {
  assert.match(fmt.formatTime("2026-03-31T23:30:00Z"), /^00:30$/);
  assert.match(fmt.formatDateTime("2026-03-31T23:30:00Z"), /01\/04\/2026/);
  assert.equal(fmt.formatTime("não é data"), "\u2014");
});

test("format: dia curto, iniciais e frases de ações", () => {
  assert.equal(fmt.shortDay("2026-03-25"), "25/03");
  assert.equal(fmt.shortDay("x"), "x");
  assert.equal(fmt.initials("Maria Silva Santos"), "MS");
  assert.equal(fmt.initials("rui"), "RU");
  assert.equal(fmt.initials(""), "A");
  assert.equal(fmt.actionLabel("listing.suspend"), "suspendeu o anúncio");
  assert.equal(fmt.actionLabel("coisa.nova"), "coisa.nova");
  assert.equal(fmt.actionLabel(undefined), "realizou uma ação");
});

// =====================================================================
// icons.js
// =====================================================================

test("ícones: todos os do menu existem e são SVG decorativos (sem emojis)", () => {
  perms.MENU.forEach((item) => {
    assert.ok(icons.names.includes(item.icon), "ícone em falta: " + item.icon);
  });
  const svg = icons.icon("car", { size: 18 });
  assert.match(svg, /^<svg class="icon" width="18" height="18"/);
  assert.match(svg, /aria-hidden="true"/);
  assert.match(icons.icon("nao-existe"), /<circle/, "ícone desconhecido tem alternativa");
});

// =====================================================================
// charts.js
// =====================================================================

test("gráficos: topo do eixo", () => {
  assert.equal(charts.axisTop(0), 4);
  assert.equal(charts.axisTop(3), 4);
  assert.equal(charts.axisTop(5), 8);
  assert.equal(charts.axisTop(17), 20);
});

test("gráficos: linhas com pontos, dicas e etiquetas", () => {
  const svg = charts.lineChartSvg({
    labels: ["2026-03-25", "2026-03-26", "2026-03-27"],
    series: [
      { name: "Novos utilizadores", className: "chart--a", values: [1, 0, 3] },
      { name: "Novos anúncios", className: "chart--b", values: [0, 2, 1] }
    ],
    ariaLabel: "Resumo"
  });
  assert.match(svg, /^<svg class="chart" viewBox="0 0 640 240" role="img" aria-label="Resumo"/);
  assert.equal((svg.match(/class="chart__line /g) || []).length, 2);
  assert.equal((svg.match(/class="chart__area /g) || []).length, 1, "área só na primeira série");
  assert.equal((svg.match(/<circle/g) || []).length, 6);
  assert.match(svg, /<title>25\/03: 1 novos utilizadores<\/title>/);
  assert.match(svg, />25\/03</);
  assert.match(svg, />27\/03</);
  assert.equal(svg.includes("style="), false);
  const numbers = svg.match(/\d+(\.\d+)?/g).map(Number);
  assert.ok(numbers.every((n) => Number.isFinite(n)));
});

test("gráficos: casos limite (sem dados, um ponto, tudo a zero, muitos dias)", () => {
  assert.doesNotThrow(() => charts.lineChartSvg({ labels: [], series: [] }));
  assert.doesNotThrow(() => charts.lineChartSvg({ labels: ["2026-03-25"], series: [{ name: "A", className: "chart--a", values: [2] }] }));
  const zeros = charts.lineChartSvg({ labels: ["2026-03-25", "2026-03-26"], series: [{ name: "A", className: "chart--a", values: [0, 0] }] });
  assert.match(zeros, />4</, "eixo vai até 4 mesmo sem dados");
  const labels = Array.from({ length: 90 }, (_, i) => "2026-01-" + String((i % 28) + 1).padStart(2, "0"));
  const many = charts.lineChartSvg({ labels, series: [{ name: "A", className: "chart--a", values: labels.map((_, i) => i % 5) }] });
  assert.equal((many.match(/<circle/g) || []).length, 0, "sem pontos em períodos longos");
  assert.ok((many.match(/chart__tick/g) || []).length <= 5 + 6, "poucas etiquetas");
});

test("gráficos: texto de fora é sempre escapado", () => {
  const svg = charts.lineChartSvg({
    labels: [XSS], series: [{ name: XSS, className: "chart--a", values: [1] }], ariaLabel: XSS
  });
  assert.equal(svg.includes("<img"), false);
  assert.equal(svg.includes('onerror=alert(1)>'), false);
});

test("gráficos: barra empilhada e lista de barras", () => {
  const empty = charts.stackedBarHtml([{ label: "A", value: 0, className: "seg--approved" }]);
  assert.match(empty, /stack--empty/);
  const stacked = charts.stackedBarHtml([
    { label: "Aprovados", value: 3, className: "seg--approved" },
    { label: "Pendentes", value: 1, className: "seg--pending" },
    { label: "Zero", value: 0, className: "seg--paused" }
  ]);
  assert.deepEqual((stacked.match(/data-w="([\d.]+)"/g) || []), ['data-w="75"', 'data-w="25"']);
  assert.match(stacked, /aria-label="Aprovados 3, Pendentes 1, Zero 0"/);

  const bars = charts.barListHtml([{ label: "A", value: 2 }, { label: "B", value: 4 }, { label: "C", value: null }]);
  assert.deepEqual((bars.match(/data-w="([\d.]+)"/g) || []), ['data-w="50"', 'data-w="100"', 'data-w="0"']);
  const ofTotal = charts.barListHtml([{ label: "A", value: 2 }], 8);
  assert.match(ofTotal, /data-w="25"/);
  assert.match(charts.barListHtml([{ label: XSS, value: 1 }]), /&lt;img/);
});

test("gráficos: applyWidths aplica as larguras por JavaScript (sem estilos inline)", () => {
  const applied = [];
  const container = {
    querySelectorAll: () => [
      { getAttribute: () => "42", style: { set width(v) { applied.push(v); } } },
      { getAttribute: () => "7.5", style: { set width(v) { applied.push(v); } } }
    ]
  };
  charts.applyWidths(container);
  assert.deepEqual(applied, ["42%", "7.5%"]);
});

// =====================================================================
// permissions.js
// =====================================================================

test("menu: cada função só vê o que pode usar", () => {
  assert.deepEqual(perms.visibleMenu(SUPER_PERMS).map((m) => m.id),
    ["dashboard", "listings", "cars", "rentals", "parts", "users", "plans", "reports", "analytics", "admins", "activity", "settings"]);
  assert.deepEqual(perms.visibleMenu(ALL_ADMIN_PERMS).map((m) => m.id),
    ["dashboard", "listings", "cars", "rentals", "parts", "users", "reports", "analytics", "activity"]);
  assert.deepEqual(perms.visibleMenu(MODERATOR_PERMS).map((m) => m.id),
    ["dashboard", "listings", "cars", "rentals", "parts", "reports"]);
  assert.deepEqual(perms.visibleMenu([]), []);
  assert.deepEqual(perms.visibleMenu(undefined), []);
  assert.deepEqual(perms.visibleMenu("dashboard:view"), []);
});

test("menu: só o dashboard está pronto; as outras secções avisam que ainda não estão ativas", () => {
  const ready = perms.MENU.filter((m) => m.ready).map((m) => m.id);
  assert.deepEqual(ready, ["dashboard"]);
  assert.match(perms.MENU.find((m) => m.id === "parts").note, /peças/);
});

test("menu: rotas e parâmetros do hash", () => {
  assert.equal(perms.routeFor("#/dashboard").id, "dashboard");
  assert.equal(perms.routeFor("#/listings?status=pending").id, "listings");
  assert.equal(perms.routeFor("#/users/123").id, "users");
  assert.equal(perms.routeFor("#/nao-existe"), null);
  assert.equal(perms.routeFor(""), null);
  assert.deepEqual(perms.hashQuery("#/listings?status=pending&q=toyota%20hilux"), { status: "pending", q: "toyota hilux" });
  assert.deepEqual(perms.hashQuery("#/listings"), {});
  assert.deepEqual(perms.hashQuery("#/x?a=%E0%A4%A&b=1"), { b: "1" }, "parâmetro mal formado é ignorado");
});

// =====================================================================
// api.js
// =====================================================================

function makeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; }
  };
}

function makeFetch(responses) {
  const calls = [];
  const queue = Array.isArray(responses) ? [...responses] : null;
  const fn = async (url, options) => {
    calls.push({ url, options });
    const next = queue ? queue.shift() : responses(url, options);
    if (next instanceof Error) throw next;
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => { if (next.badJson) throw new Error("json"); return next.body; }
    };
  };
  fn.calls = calls;
  return fn;
}

const CONFIG = { API_URL: "https://api.exemplo.ao/api/" };

function sessionJson(extra = {}) {
  return JSON.stringify({ token: "tok-123", expiresAt: 10_000_000, admin: { name: "Maria", role: "admin", permissions: ["dashboard:view"] }, ...extra });
}

test("api: login guarda a sessão (só no sessionStorage), sem enviar token", async () => {
  const storage = makeStorage();
  const fetch = makeFetch([{ status: 200, body: { token: "T", expires_in: 28800, admin: { name: "Maria", role: "admin", permissions: [] } } }]);
  const api = createApi({ fetch, storage, config: CONFIG, now: () => 1000 });
  const admin = await api.login("maria@x.ao", "segredo");
  assert.equal(admin.name, "Maria");
  const call = fetch.calls[0];
  assert.equal(call.url, "https://api.exemplo.ao/api/admin/auth/login");
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.headers.Authorization, undefined);
  assert.equal(call.options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(call.options.body), { email: "maria@x.ao", password: "segredo" });
  const stored = JSON.parse(storage.data[SESSION_KEY]);
  assert.equal(stored.token, "T");
  assert.equal(stored.expiresAt, 1000 + 28800 * 1000);
  assert.equal(JSON.stringify(stored).includes("segredo"), false, "a password nunca é guardada");
});

test("api: pedidos autenticados levam o token; a query ignora valores vazios e nunca leva o token", async () => {
  const storage = makeStorage({ [SESSION_KEY]: sessionJson() });
  const fetch = makeFetch(() => ({ status: 200, body: { ok: true } }));
  const api = createApi({ fetch, storage, config: CONFIG, now: () => 1000 });
  await api.get("/admin/dashboard", { query: { days: 7, q: "", x: null, name: "a b&c" } });
  const call = fetch.calls[0];
  assert.equal(call.url, "https://api.exemplo.ao/api/admin/dashboard?days=7&name=a%20b%26c");
  assert.equal(call.options.headers.Authorization, "Bearer tok-123");
  assert.equal(call.options.headers["Content-Type"], undefined, "sem corpo, sem content-type");
  assert.equal(call.url.includes("tok-123"), false);
  assert.equal(call.options.body, undefined);

  await api.post("/admin/x", { a: 1 });
  await api.patch("/admin/x", { b: 2 });
  await api.del("/admin/x", { confirm: "id" });
  assert.deepEqual(fetch.calls.slice(1).map((c) => c.options.method), ["POST", "PATCH", "DELETE"]);
  assert.deepEqual(JSON.parse(fetch.calls[3].options.body), { confirm: "id" });
});

test("api: sem sessão não faz o pedido e leva ao login", async () => {
  let redirected = 0;
  const fetch = makeFetch(() => ({ status: 200, body: {} }));
  const api = createApi({ fetch, storage: makeStorage(), config: CONFIG, onUnauthorized: () => redirected++ });
  await assert.rejects(() => api.get("/admin/dashboard"), (e) => e instanceof ApiError && e.status === 401);
  assert.equal(fetch.calls.length, 0);
  assert.equal(redirected, 1);
});

test("api: sessão expirada ou corrompida conta como inexistente (e é apagada)", async () => {
  const expired = makeStorage({ [SESSION_KEY]: sessionJson({ expiresAt: 500 }) });
  assert.equal(createApi({ fetch: makeFetch([]), storage: expired, config: CONFIG, now: () => 1000 }).getSession(), null);
  assert.equal(SESSION_KEY in expired.data, false);

  const broken = makeStorage({ [SESSION_KEY]: "{isto não é json" });
  assert.equal(createApi({ fetch: makeFetch([]), storage: broken, config: CONFIG, now: () => 1000 }).getSession(), null);

  const noToken = makeStorage({ [SESSION_KEY]: JSON.stringify({ expiresAt: 99999999 }) });
  assert.equal(createApi({ fetch: makeFetch([]), storage: noToken, config: CONFIG, now: () => 1000 }).getSession(), null);
});

test("api: 401 num pedido autenticado termina a sessão; no login não", async () => {
  let redirected = 0;
  const storage = makeStorage({ [SESSION_KEY]: sessionJson() });
  const api = createApi({
    fetch: makeFetch([{ status: 401, body: { error: "Sessão de administrador necessária" } }, { status: 401, body: { error: "x" } }]),
    storage, config: CONFIG, now: () => 1000, onUnauthorized: () => redirected++
  });
  await assert.rejects(() => api.get("/admin/me"), (e) => e.status === 401 && /necessária/.test(e.message));
  assert.equal(SESSION_KEY in storage.data, false);
  assert.equal(redirected, 1);

  await assert.rejects(() => api.login("a@b.c", "x"), (e) => e.status === 401);
  assert.equal(redirected, 1, "o login falhado não conta como sessão terminada");
});

test("api: erros do servidor, JSON inválido, campos e rede", async () => {
  const storage = makeStorage({ [SESSION_KEY]: sessionJson() });
  const api = createApi({
    fetch: makeFetch([
      { status: 400, body: { error: "Dados inválidos", fields: { year: "Obrigatório" } } },
      { status: 502, badJson: true },
      { status: 429, body: { error: "Demasiadas tentativas." } },
      new TypeError("Failed to fetch"),
      Object.assign(new Error("aborted"), { name: "AbortError" })
    ]),
    storage, config: CONFIG, now: () => 1000
  });
  await assert.rejects(() => api.get("/a"), (e) => e.status === 400 && e.fields.year === "Obrigatório");
  await assert.rejects(() => api.get("/a"), (e) => e.status === 502 && e.message === "Erro 502");
  await assert.rejects(() => api.get("/a"), (e) => e.status === 429 && e.message === "Demasiadas tentativas.");
  await assert.rejects(() => api.get("/a"), (e) => e.status === 0 && /Não foi possível contactar/.test(e.message));
  await assert.rejects(() => api.get("/a"), (e) => e.status === 0);
});

test("api: refreshAdmin atualiza a função guardada; baseUrl sem barra final", async () => {
  const storage = makeStorage({ [SESSION_KEY]: sessionJson() });
  const api = createApi({
    fetch: makeFetch([{ status: 200, body: { admin: { name: "Maria", role: "superadmin", permissions: ["x"] } } }]),
    storage, config: CONFIG, now: () => 1000
  });
  const admin = await api.refreshAdmin();
  assert.equal(admin.role, "superadmin");
  assert.equal(JSON.parse(storage.data[SESSION_KEY]).admin.role, "superadmin");
  assert.equal(JSON.parse(storage.data[SESSION_KEY]).token, "tok-123", "o token mantém-se");
  assert.equal(api.baseUrl(), "https://api.exemplo.ao/api");
});

// =====================================================================
// dashboard.js — HTML
// =====================================================================

const RENDER = { days: 7, now: NOW, permissions: ALL_ADMIN_PERMS };

test("dashboard: mostra os números reais nos indicadores", () => {
  const html = dashboard.render(sampleDashboard(), RENDER);
  const value = (label) => {
    const re = new RegExp('<p class="kpi__label">' + label + '</p>\\s*<p class="kpi__value[^"]*"[^>]*>([^<]*)</p>');
    const m = re.exec(html);
    assert.ok(m, "indicador em falta: " + label);
    return m[1];
  };
  assert.equal(value("Total de utilizadores"), "6");
  assert.equal(value("Vendedores"), "4");
  assert.equal(value("Verificados"), "3");
  assert.equal(value("Suspensos"), "1");
  assert.equal(value("Total de anúncios"), "9");
  assert.equal(value("Pendentes"), "2");
  assert.equal(value("Aprovados"), "3");
  assert.equal(value("Rejeitados"), "0");
  assert.equal(value("Automóveis"), "6");
  assert.equal(value("Alugueres"), "3");
  assert.equal(value("Peças"), "Em breve");
  assert.equal(value("Denúncias abertas"), "2");
  assert.match(html, /\+4 nos últimos 7 dias/);
  assert.match(html, /Atualizado às 13:00/, "hora de Luanda");
});

test("dashboard: estados dos anúncios somam carros e alugueres", () => {
  const totals = dashboard.statusTotals(sampleDashboard().listings);
  assert.deepEqual(totals, { approved: 3, pending: 2, paused: 1, closed: 2, rejected: 0, suspended: 1, partial: false });
  const partial = dashboard.statusTotals({ cars: { by_status: { approved: 2 } }, rentals: { by_status: null } });
  assert.equal(partial.approved, 2);
  assert.equal(partial.partial, true);
  assert.equal(dashboard.statusTotals({ cars: null, rentals: null }), null);

  const html = dashboard.render(sampleDashboard(), RENDER);
  assert.match(html, /Estado dos anúncios/);
  assert.match(html, /seg--approved/);
  assert.match(html, /Vendidos ou alugados/);
});

test("dashboard: contas por tipo, fila de moderação e atividade recente", () => {
  const html = dashboard.render(sampleDashboard(), RENDER);
  assert.match(html, /Vendedores particulares/);
  assert.match(html, /Rent-a-car/);
  assert.match(html, /Toyota Hiace 2019/);
  assert.match(html, /Aluguer · Maria Silva · há 3 dias/);
  assert.match(html, /<strong>Rui Admin<\/strong> suspendeu o anúncio Kia Rio 2019/);
  assert.match(html, /Administrador · há 1 h · Fotos falsas/);
  assert.match(html, /Gráfico|Crescimento/);
  assert.match(html, /aria-label="Novos utilizadores e novos anúncios por dia, nos últimos 7 dias"/);
});

test("dashboard: a atividade administrativa só aparece a quem pode ver o histórico", () => {
  const withoutAudit = dashboard.render(sampleDashboard({ recent_activity: null }), { ...RENDER, permissions: MODERATOR_PERMS });
  assert.equal(withoutAudit.includes("Atividade administrativa recente"), false);
  const withAudit = dashboard.render(sampleDashboard({ recent_activity: [] }), RENDER);
  assert.match(withAudit, /Ainda não há atividade registada/);
  const failed = dashboard.render(sampleDashboard({ recent_activity: null }), RENDER);
  assert.match(failed, /Atividade administrativa recente[\s\S]*Indisponível neste momento/);
});

test("dashboard: valores em falta mostram travessão e avisos, sem partir nada", () => {
  const data = sampleDashboard({
    users: { total: 6, active: null, suspended: null, verified: 3, sellers: null, by_account_type: null, new_last_7_days: null, new_last_30_days: null },
    listings: { total: null, pending: null, approved: null, rejected: null, cars: { total: 6, by_status: null }, rentals: { total: null, by_status: null }, parts: null },
    reports: { open: null }, growth: null, pending_queue: null, recent_activity: null,
    warnings: ["utilizadores suspensos (corre a migração B) indisponível", "crescimento indisponível"]
  });
  let html;
  assert.doesNotThrow(() => { html = dashboard.render(data, RENDER); });
  assert.match(html, /<p class="kpi__value" title="Indisponível">\u2014<\/p>/);
  assert.match(html, /Alguns dados não estão disponíveis/);
  assert.match(html, /utilizadores suspensos \(corre a migração B\) indisponível/);
  assert.match(html, /O crescimento não está disponível/);
  assert.match(html, /a coluna do tipo de conta ainda não existe/);
  assert.doesNotThrow(() => dashboard.render({}, RENDER), "até com dados vazios");
});

test("dashboard: estado vazio e nota de gráfico truncado", () => {
  const empty = dashboard.render(sampleDashboard({ pending_queue: [] }), RENDER);
  assert.match(empty, /Não há anúncios pendentes/);
  const truncated = dashboard.render(sampleDashboard({ growth: { ...sampleDashboard().growth, truncated: true } }), RENDER);
  assert.match(truncated, /no máximo os 1000 registos/);
});

test("dashboard: tudo o que vem da API é escapado (nomes, títulos, motivos, avisos, erros)", () => {
  const data = sampleDashboard({
    pending_queue: [{ type: "car", id: "1", title: XSS, created_at: "2026-03-28T09:00:00Z", owner_name: XSS }],
    recent_activity: [{ id: "1", action: XSS, admin_name: XSS, admin_role: XSS, entity_type: "car", title: XSS, reason: XSS, created_at: "2026-03-31T11:00:00Z" }],
    warnings: [XSS]
  });
  const html = dashboard.render(data, RENDER);
  assert.equal(html.includes("<img"), false);
  assert.equal(html.includes("onerror=alert(1)>"), false);
  assert.equal(dashboard.renderError(new Error(XSS)).includes("<img"), false);
});

test("dashboard: sem estilos inline, sem manipuladores inline e sem emojis (segurança e identidade)", () => {
  const pages = [
    dashboard.render(sampleDashboard(), RENDER),
    dashboard.renderLoading(),
    dashboard.renderError(new Error("falhou")),
    soon.render({ label: "Anúncios", icon: "list" }),
    shell.renderSidebar(perms.MENU, "dashboard"),
    shell.renderTopbar({ name: "Maria Silva", email: "m@x.ao", role: "admin", permissions: ALL_ADMIN_PERMS }, "Dashboard", { expiresAt: NOW }),
    shell.renderNotifications({ pending_listings: 2, open_reports: 1 }, ALL_ADMIN_PERMS),
    shell.renderNoAccess(perms.MENU[0])
  ];
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{FE0F}]/u;
  pages.forEach((html, i) => {
    assert.equal(/\sstyle\s*=/.test(html), false, "estilo inline na página " + i);
    assert.equal(/\son[a-z]+\s*=/i.test(html), false, "manipulador inline na página " + i);
    assert.equal(/<script/i.test(html), false, "script na página " + i);
    assert.equal(emoji.test(html), false, "emoji na página " + i);
  });
});

test("dashboard: botões de período e de atualizar", () => {
  const html = dashboard.render(sampleDashboard(), { ...RENDER, days: 30 });
  assert.match(html, /data-days="7" aria-pressed="false"/);
  assert.match(html, /data-days="30" aria-pressed="true"/);
  assert.match(html, /data-days="90" aria-pressed="false"/);
  assert.match(html, /data-action="refresh"/);
});

// =====================================================================
// dashboard.js — ligação (carregar, atualizar, erro, período)
// =====================================================================

function fakeContainer() {
  const doc = new FakeDoc();
  const el = doc.add("view");
  return el;
}

function tick() { return new Promise((resolve) => setImmediate(resolve)); }

test("dashboard.mount: mostra 'a carregar', depois os dados; atualizar e período voltam a pedir", async () => {
  const container = fakeContainer();
  const requests = [];
  const api = { get: async (url, options) => { requests.push({ url, days: options.query.days }); return sampleDashboard(); } };
  const page = dashboard.mount(container, { api, permissions: ALL_ADMIN_PERMS });

  assert.match(container.innerHTML, /aria-busy="true"/);
  await tick();
  assert.match(container.innerHTML, /Total de utilizadores/);
  assert.deepEqual(requests, [{ url: "/admin/dashboard", days: 30 }]);

  await container.querySelector('[data-action="refresh"]').dispatch("click");
  await tick();
  assert.equal(requests.length, 2);

  const ninety = container.querySelectorAll("[data-days]").find((b) => b.getAttribute("data-days") === "90");
  await ninety.dispatch("click");
  await tick();
  assert.equal(requests[2].days, 90);

  page.destroy();
});

test("dashboard.mount: erro mostra mensagem e 'Tentar de novo' funciona", async () => {
  const container = fakeContainer();
  let attempt = 0;
  const api = {
    get: async () => {
      attempt++;
      if (attempt === 1) throw new ApiError(0, "Não foi possível contactar o servidor.");
      return sampleDashboard();
    }
  };
  dashboard.mount(container, { api, permissions: ALL_ADMIN_PERMS });
  await tick();
  assert.match(container.innerHTML, /Não foi possível carregar o dashboard/);
  assert.match(container.innerHTML, /Não foi possível contactar o servidor/);

  await container.querySelector('[data-action="retry"]').dispatch("click");
  await tick();
  assert.match(container.innerHTML, /Total de utilizadores/);
  assert.equal(attempt, 2);
});

test("dashboard.mount: 401 não mostra erro (o login trata disso); destroy impede atualizações tardias", async () => {
  const container = fakeContainer();
  const api = { get: async () => { throw new ApiError(401, "Sessão terminada"); } };
  dashboard.mount(container, { api, permissions: [] });
  await tick();
  assert.match(container.innerHTML, /aria-busy="true"/, "fica no 'a carregar' enquanto redireciona");
  assert.equal(container.innerHTML.includes("Não foi possível carregar"), false);

  const container2 = fakeContainer();
  let release;
  const slow = { get: () => new Promise((resolve) => { release = () => resolve(sampleDashboard()); }) };
  const page = dashboard.mount(container2, { api: slow, permissions: ALL_ADMIN_PERMS });
  page.destroy();
  release();
  await tick();
  assert.match(container2.innerHTML, /aria-busy="true"/, "não escreve depois de destruída");
});

test("dashboard.mount: aviso de servidor lento", async (t) => {
  const timers = [];
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  const realClear = global.clearTimeout;
  global.clearTimeout = () => {};
  t.after(() => { global.setTimeout = realSetTimeout; global.clearTimeout = realClear; });

  const container = fakeContainer();
  let release;
  const api = { get: () => new Promise((resolve) => { release = () => resolve(sampleDashboard()); }) };
  dashboard.mount(container, { api, permissions: [] });
  const slow = timers.find((x) => x.ms === 8000);
  assert.ok(slow, "agenda o aviso para 8 segundos");
  slow.fn();
  assert.match(container.querySelector("[data-hint]").textContent, /demorar a responder/);
  release();
});

// =====================================================================
// soon.js
// =====================================================================

test("secções ainda não ativas dizem a verdade e usam a nota própria quando existe", () => {
  assert.match(soon.render({ label: "Utilizadores", icon: "users" }), /ainda não está disponível/);
  assert.match(soon.render(perms.MENU.find((m) => m.id === "parts")), /não existe tabela de peças/);
  assert.match(soon.render({ label: XSS }), /&lt;img/);
  const container = fakeContainer();
  const page = soon.mount(container, { item: { label: "Planos", icon: "card" } });
  assert.match(container.innerHTML, /Planos/);
  page.destroy();
});

// =====================================================================
// shell.js — HTML
// =====================================================================

test("barra lateral: ativa a secção atual e marca as não prontas", () => {
  const html = shell.renderSidebar(perms.visibleMenu(MODERATOR_PERMS), "dashboard");
  assert.match(html, /class="nav__link is-active" href="#\/dashboard"[^>]*aria-current="page"/);
  assert.equal((html.match(/class="nav__soon"/g) || []).length, 5, "5 das 6 secções do moderador ainda não estão prontas");
  assert.match(html, /src="assets\/logo.png"/);
  assert.match(html, /id="brand-fallback"[^>]*hidden/);
  assert.equal(html.includes("Administradores"), false, "o moderador não vê Administradores");
});

test("notificações: texto e contagem respeitam as permissões", () => {
  const data = { pending_listings: 3, open_reports: 2 };
  assert.equal(shell.notificationCount(data, ALL_ADMIN_PERMS), 5);
  assert.equal(shell.notificationCount(data, ["dashboard:view"]), 0);
  assert.equal(shell.notificationCount(data, ["listings:view"]), 3);
  assert.equal(shell.notificationCount(null, ALL_ADMIN_PERMS), 0);
  assert.equal(shell.notificationCount({ pending_listings: null, open_reports: "x" }, ALL_ADMIN_PERMS), 0);

  assert.match(shell.renderNotifications(undefined, ALL_ADMIN_PERMS), /A carregar/);
  assert.match(shell.renderNotifications(null, ALL_ADMIN_PERMS), /Não foi possível carregar/);
  assert.match(shell.renderNotifications({ pending_listings: 0, open_reports: 0 }, ALL_ADMIN_PERMS), /Sem notificações novas/);
  const html = shell.renderNotifications(data, ALL_ADMIN_PERMS);
  assert.match(html, /href="#\/listings\?status=pending"[\s\S]*<strong>3<\/strong> anúncios pendentes/);
  assert.match(html, /href="#\/reports"[\s\S]*<strong>2<\/strong> denúncias por analisar/);
  assert.equal(shell.renderNotifications(data, ["listings:view"]).includes("denúncias"), false);
});

test("perfil: mostra função, email e fim da sessão, tudo escapado", () => {
  const admin = { name: XSS, email: XSS, role: "moderator", permissions: [] };
  const top = shell.renderTopbar(admin, "Dashboard", { expiresAt: Date.parse("2026-03-31T20:00:00Z") });
  assert.equal(top.includes("<img"), false);
  assert.match(top, /Moderador/);
  const panel = shell.renderUserPanel({ name: "Maria Silva", email: "m@x.ao", role: "superadmin" }, { expiresAt: Date.parse("2026-03-31T20:00:00Z") });
  assert.match(panel, /Superadministrador/);
  assert.match(panel, /21:00/, "20:00 UTC = 21:00 em Luanda");
  assert.match(panel, /data-action="logout"/);
});

// =====================================================================
// shell.js — ligação (rotas, menu móvel, sair, notificações)
// =====================================================================

function shellWorld({ permissions = ALL_ADMIN_PERMS, role = "admin", hash = "#/dashboard", session = true, notifications } = {}) {
  const doc = new FakeDoc();
  doc.add("app", { registersIds: true });
  const win = new FakeWindow(hash);
  const calls = [];
  let cleared = 0;
  const admin = { id: "a1", name: "Maria Silva", email: "maria@x.ao", role, permissions };
  const api = {
    getSession: () => (session ? { token: "t", expiresAt: Date.now() + 3600 * 1000, admin } : null),
    clearSession: () => { cleared++; },
    get: async (url) => {
      calls.push(url);
      if (url === "/admin/notifications") {
        if (notifications instanceof Error) throw notifications;
        return notifications || { pending_listings: 2, open_reports: 1 };
      }
      if (url === "/admin/dashboard") return sampleDashboard();
      return {};
    },
    refreshAdmin: async () => admin
  };
  return { doc, win, api, calls, admin, cleared: () => cleared };
}

function withFakeTimers(t) {
  const timers = { intervals: [], timeouts: [] };
  const real = { si: global.setInterval, st: global.setTimeout, ci: global.clearInterval, ct: global.clearTimeout };
  global.setInterval = (fn, ms) => { timers.intervals.push({ fn, ms }); return timers.intervals.length; };
  global.setTimeout = (fn, ms) => { timers.timeouts.push({ fn, ms }); return timers.timeouts.length; };
  global.clearInterval = () => {};
  global.clearTimeout = () => {};
  t.after(() => { global.setInterval = real.si; global.setTimeout = real.st; global.clearInterval = real.ci; global.clearTimeout = real.ct; });
  return timers;
}

test("painel: sem sessão volta ao login e não desenha nada", (t) => {
  withFakeTimers(t);
  const w = shellWorld({ session: false });
  shell.init(w.doc, { api: w.api, window: w.win });
  assert.deepEqual(w.win.location.replaced, ["index.html"]);
  assert.equal(w.doc.getElementById("app").innerHTML, "");
});

test("painel: com sessão desenha o menu, abre o dashboard e carrega as notificações", async (t) => {
  const timers = withFakeTimers(t);
  const w = shellWorld();
  shell.init(w.doc, { api: w.api, window: w.win });
  await tick(); await tick();

  const html = w.doc.getElementById("app").innerHTML;
  assert.match(html, /id="sidebar"/);
  assert.match(html, /Dashboard/);
  assert.equal(w.doc.title, "Dashboard · Administração AutoMercado");
  assert.equal(w.doc.getElementById("topbar-title").textContent, "Dashboard");
  assert.match(w.doc.getElementById("view").innerHTML, /Total de utilizadores/);
  assert.ok(w.calls.includes("/admin/dashboard"));
  assert.ok(w.calls.includes("/admin/notifications"));
  assert.equal(w.doc.getElementById("notif-badge").hidden, false);
  assert.equal(w.doc.getElementById("notif-badge").textContent, "3");
  assert.equal(w.doc.navLinks.filter((l) => l.getAttribute("data-nav") === "dashboard")[0].getAttribute("aria-current"), "page");
  assert.ok(timers.intervals.some((x) => x.ms === 120000), "atualiza as notificações de 2 em 2 minutos");
  assert.ok(timers.timeouts.some((x) => x.ms > 3000000), "agenda o fim da sessão");
});

test("painel: o fim da sessão leva ao login com aviso", async (t) => {
  const timers = withFakeTimers(t);
  const w = shellWorld();
  shell.init(w.doc, { api: w.api, window: w.win });
  const expiry = timers.timeouts.find((x) => x.ms > 3000000);
  expiry.fn();
  assert.deepEqual(w.win.location.replaced, ["index.html?expired=1"]);
  assert.equal(w.cleared(), 1);
});

test("painel: secção não permitida mostra 'sem acesso'; secção por ativar mostra aviso", async (t) => {
  withFakeTimers(t);
  const denied = shellWorld({ permissions: MODERATOR_PERMS, role: "moderator", hash: "#/admins" });
  shell.init(denied.doc, { api: denied.api, window: denied.win });
  await tick();
  assert.match(denied.doc.getElementById("view").innerHTML, /Sem acesso a esta secção/);
  assert.equal(denied.doc.getElementById("topbar-title").textContent, "Sem acesso");

  const soonWorld = shellWorld({ hash: "#/users" });
  shell.init(soonWorld.doc, { api: soonWorld.api, window: soonWorld.win });
  await tick();
  assert.match(soonWorld.doc.getElementById("view").innerHTML, /ainda não está disponível/);
  assert.ok(!soonWorld.calls.includes("/admin/dashboard"));
});

test("painel: endereço desconhecido abre a primeira secção permitida; mudar de hash muda de página", async (t) => {
  withFakeTimers(t);
  const w = shellWorld({ hash: "#/nao-existe" });
  shell.init(w.doc, { api: w.api, window: w.win });
  await tick();
  assert.match(w.doc.getElementById("view").innerHTML, /Total de utilizadores/);

  w.win.location.hash = "#/reports";
  await w.win.dispatch("hashchange");
  await tick();
  assert.match(w.doc.getElementById("view").innerHTML, /Denúncias/);
  assert.equal(w.doc.getElementById("topbar-title").textContent, "Denúncias");
  const active = w.doc.navLinks.filter((l) => l.getAttribute("aria-current") === "page").map((l) => l.getAttribute("data-nav"));
  assert.deepEqual(active, ["reports"]);
});

test("painel: menu móvel abre e fecha (botão, fundo escuro e tecla Escape)", async (t) => {
  withFakeTimers(t);
  const w = shellWorld();
  shell.init(w.doc, { api: w.api, window: w.win });
  await tick();

  const toggle = w.doc.getElementById("nav-toggle");
  await toggle.dispatch("click");
  assert.equal(w.doc.body.classList.contains("nav-open"), true);
  assert.equal(w.doc.getElementById("scrim").hidden, false);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");

  await w.doc.getElementById("scrim").dispatch("click");
  assert.equal(w.doc.body.classList.contains("nav-open"), false);

  await toggle.dispatch("click");
  await w.doc.dispatch("keydown", { key: "Escape" });
  assert.equal(w.doc.body.classList.contains("nav-open"), false);
  assert.equal(toggle.focused, true, "o foco volta ao botão");
});

test("painel: notificações e perfil abrem uma de cada vez; clicar fora fecha", async (t) => {
  withFakeTimers(t);
  const w = shellWorld();
  shell.init(w.doc, { api: w.api, window: w.win });
  await tick();
  const before = w.calls.filter((c) => c === "/admin/notifications").length;

  await w.doc.getElementById("notif-btn").dispatch("click");
  assert.equal(w.doc.getElementById("notif-panel").hidden, false);
  assert.equal(w.doc.getElementById("notif-btn").getAttribute("aria-expanded"), "true");
  await tick();
  assert.equal(w.calls.filter((c) => c === "/admin/notifications").length, before + 1, "recarrega ao abrir");
  assert.match(w.doc.getElementById("notif-panel").innerHTML, /<strong>2<\/strong> anúncios pendentes/);

  await w.doc.getElementById("user-btn").dispatch("click");
  assert.equal(w.doc.getElementById("user-panel").hidden, false);
  assert.equal(w.doc.getElementById("notif-panel").hidden, true, "só uma aberta de cada vez");

  await w.doc.dispatch("click");
  assert.equal(w.doc.getElementById("user-panel").hidden, true);

  await w.doc.getElementById("user-btn").dispatch("click");
  await w.doc.dispatch("keydown", { key: "Escape" });
  assert.equal(w.doc.getElementById("user-panel").hidden, true);
});

test("painel: terminar sessão limpa a sessão e volta ao login", async (t) => {
  withFakeTimers(t);
  const w = shellWorld();
  shell.init(w.doc, { api: w.api, window: w.win });
  await tick();
  await w.doc.getElementById("user-panel").dispatch("click", { target: { closest: (sel) => (sel.includes("logout") ? {} : null) } });
  assert.equal(w.cleared(), 1);
  assert.deepEqual(w.win.location.replaced, ["index.html"]);
});

test("painel: falha nas notificações não parte o painel (mostra mensagem no sino)", async (t) => {
  withFakeTimers(t);
  const w = shellWorld({ notifications: new ApiError(500, "Erro 500") });
  shell.init(w.doc, { api: w.api, window: w.win });
  await tick(); await tick();
  assert.equal(w.doc.getElementById("notif-badge").hidden, true);
  assert.match(w.doc.getElementById("notif-panel").innerHTML, /Não foi possível carregar as notificações/);
  assert.match(w.doc.getElementById("view").innerHTML, /Total de utilizadores/, "o resto continua a funcionar");
});

test("painel: se a função mudar no servidor, o menu é refeito", async (t) => {
  withFakeTimers(t);
  const w = shellWorld({ permissions: MODERATOR_PERMS, role: "moderator" });
  w.api.refreshAdmin = async () => ({ ...w.admin, role: "superadmin", permissions: SUPER_PERMS });
  shell.init(w.doc, { api: w.api, window: w.win });
  await tick(); await tick();
  assert.match(w.doc.getElementById("app").innerHTML, /Administradores/);
  assert.match(w.doc.getElementById("app").innerHTML, /Superadministrador/);
});

test("painel: o logótipo em falta é trocado pelo nome em texto", async (t) => {
  withFakeTimers(t);
  const w = shellWorld();
  shell.init(w.doc, { api: w.api, window: w.win });
  await tick();
  const logo = w.doc.getElementById("brand-logo");
  await logo.dispatch("error");
  assert.equal(logo.hidden, true);
  assert.equal(w.doc.getElementById("brand-fallback").hidden, false);
});

// =====================================================================
// login.js
// =====================================================================

test("login: validação de email e password", () => {
  assert.deepEqual(login.validate("  maria@x.ao ", "abc"), { ok: true, errors: {}, email: "maria@x.ao" });
  assert.equal(login.validate("", "abc").errors.email, "Indica o teu email.");
  assert.equal(login.validate("maria", "abc").errors.email, "Este email não parece válido.");
  assert.equal(login.validate("a@b.co", "").errors.password, "Indica a tua password.");
  assert.equal(login.validate(null, null).ok, false);
});

test("login: mensagens claras para cada tipo de erro", () => {
  assert.equal(login.messageFor(new ApiError(401, "x")), "Email ou password incorretos.");
  assert.equal(login.messageFor(new ApiError(0, "Sem rede")), "Sem rede");
  assert.equal(login.messageFor(new ApiError(429, "Demasiadas tentativas. Tenta novamente dentro de 15 minutos.")), "Demasiadas tentativas. Tenta novamente dentro de 15 minutos.");
  assert.match(login.messageFor(new ApiError(500, "x")), /servidor teve um problema/);
  assert.equal(login.messageFor(new ApiError(400, "Email e password são obrigatórios")), "Email e password são obrigatórios");
  assert.match(login.messageFor(null), /inesperado/);
});

function loginWorld({ session = false, search = "", loginImpl } = {}) {
  const doc = new FakeDoc();
  const form = doc.add("login-form");
  const email = doc.add("login-email", { value: "" });
  const password = doc.add("login-password", { value: "", type: "password" });
  doc.add("login-email-error");
  doc.add("login-password-error");
  const message = doc.add("login-message", { hidden: true });
  const submit = doc.add("login-submit");
  submit._html = "<span>Entrar</span>";
  submit._scanLocal();
  const toggle = doc.add("login-toggle");
  const logo = doc.add("login-logo");
  const wordmark = doc.add("login-wordmark", { hidden: true });
  const win = new FakeWindow("", search);
  const calls = [];
  const api = {
    getSession: () => (session ? { token: "t" } : null),
    login: async (e, p) => { calls.push([e, p]); if (loginImpl) return loginImpl(e, p); return { name: "Maria" }; }
  };
  return { doc, form, email, password, message, submit, toggle, logo, wordmark, win, api, calls };
}

test("login: já com sessão vai direto para o painel", () => {
  const w = loginWorld({ session: true });
  login.init(w.doc, { api: w.api, location: w.win.location });
  assert.deepEqual(w.win.location.replaced, ["painel.html"]);
});

test("login: ligação ao ecrã — aviso de sessão expirada, ícone da password e logótipo em falta", async () => {
  const w = loginWorld({ search: "?expired=1" });
  login.init(w.doc, { api: w.api, location: w.win.location });
  assert.equal(w.message.hidden, false);
  assert.match(w.message.textContent, /sessão terminou/);
  assert.equal(w.message.className, "notice notice--info");
  assert.match(w.toggle.innerHTML, /<svg/, "botão tem ícone");

  await w.toggle.dispatch("click");
  assert.equal(w.password.type, "text");
  assert.equal(w.toggle.getAttribute("aria-pressed"), "true");
  await w.toggle.dispatch("click");
  assert.equal(w.password.type, "password");

  await w.logo.dispatch("error");
  assert.equal(w.logo.hidden, true);
  assert.equal(w.wordmark.hidden, false);
});

test("login: campos inválidos mostram erros sem chamar a API", async () => {
  const w = loginWorld();
  login.init(w.doc, { api: w.api, location: w.win.location });
  w.email.value = "isto-nao-e-email";
  w.password.value = "";
  await w.form.dispatch("submit");
  assert.equal(w.calls.length, 0);
  assert.equal(w.doc.getElementById("login-email-error").textContent, "Este email não parece válido.");
  assert.equal(w.email.getAttribute("aria-invalid"), "true");
  assert.equal(w.email.focused, true);
});

test("login: sucesso entra no painel com o email aparado", async () => {
  const w = loginWorld();
  login.init(w.doc, { api: w.api, location: w.win.location });
  w.email.value = "  maria@x.ao ";
  w.password.value = "segredo";
  await w.form.dispatch("submit");
  assert.deepEqual(w.calls, [["maria@x.ao", "segredo"]]);
  assert.deepEqual(w.win.location.replaced, ["painel.html"]);
});

test("login: falha mostra a mensagem, limpa a password e volta a permitir tentar", async () => {
  const w = loginWorld({ loginImpl: async () => { throw new ApiError(401, "Email ou password incorretos"); } });
  login.init(w.doc, { api: w.api, location: w.win.location });
  w.email.value = "maria@x.ao";
  w.password.value = "errada";
  await w.form.dispatch("submit");
  assert.equal(w.message.hidden, false);
  assert.equal(w.message.textContent, "Email ou password incorretos.");
  assert.equal(w.message.className, "notice notice--danger");
  assert.equal(w.password.value, "");
  assert.equal(w.password.focused, true);
  assert.equal(w.submit.disabled, false);
  assert.deepEqual(w.win.location.replaced, []);
});

test("login: não deixa enviar duas vezes seguidas", async () => {
  let release;
  const w = loginWorld({ loginImpl: () => new Promise((resolve) => { release = () => resolve({}); }) });
  login.init(w.doc, { api: w.api, location: w.win.location });
  w.email.value = "maria@x.ao";
  w.password.value = "segredo";
  const first = w.form.dispatch("submit");
  assert.equal(w.submit.disabled, true);
  await w.form.dispatch("submit");
  release();
  await first;
  assert.equal(w.calls.length, 1);
});

test("login: se o servidor demorar, avisa que pode estar a acordar", async (t) => {
  const timers = [];
  const realSetTimeout = global.setTimeout;
  const realClear = global.clearTimeout;
  const cleared = [];
  global.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  global.clearTimeout = (id) => { cleared.push(id); };
  t.after(() => { global.setTimeout = realSetTimeout; global.clearTimeout = realClear; });

  let release;
  const w = loginWorld({ loginImpl: () => new Promise((resolve) => { release = () => resolve({}); }) });
  login.init(w.doc, { api: w.api, location: w.win.location });
  w.email.value = "maria@x.ao";
  w.password.value = "segredo";
  const pending = w.form.dispatch("submit");
  const slow = timers.find((x) => x.ms === 8000);
  assert.ok(slow, "agenda o aviso para 8 segundos");
  slow.fn();
  assert.match(w.message.textContent, /a acordar/);
  assert.equal(w.message.className, "notice notice--info");
  release();
  await pending;
  assert.ok(cleared.length >= 1, "cancela o aviso quando a resposta chega");
  assert.deepEqual(w.win.location.replaced, ["painel.html"]);
});

test("login: sem armazenamento de sessão avisa e bloqueia o botão", () => {
  const w = loginWorld();
  login.init(w.doc, { api: undefined, location: w.win.location });
  assert.match(w.message.textContent, /bloqueou o armazenamento/);
  assert.equal(w.submit.disabled, true);
});

// =====================================================================
// FICHEIROS DO PROJETO (HTML, CSS, configuração)
// =====================================================================

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf-8");

function classesIn(html) {
  const set = new Set();
  const re = /class="([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) m[1].split(/\s+/).filter(Boolean).forEach((c) => set.add(c));
  return set;
}

test("estilos: todas as classes usadas no HTML gerado existem no CSS", () => {
  const css = read("public/css/admin.css");
  const defined = new Set((css.match(/\.[a-zA-Z][\w-]*/g) || []).map((c) => c.slice(1)));
  const used = new Set();
  [
    read("public/index.html"), read("public/painel.html"),
    dashboard.render(sampleDashboard(), RENDER), dashboard.render(sampleDashboard({ growth: null, pending_queue: [], recent_activity: [], warnings: ["x"] }), RENDER),
    dashboard.renderLoading(), dashboard.renderError(new Error("x")),
    soon.render({ label: "A", icon: "list" }),
    shell.renderSidebar(perms.MENU, "dashboard"),
    shell.renderTopbar({ name: "A B", email: "a@b.c", role: "admin" }, "T", { expiresAt: NOW }),
    shell.renderNotifications({ pending_listings: 1, open_reports: 1 }, ALL_ADMIN_PERMS),
    shell.renderNotifications(undefined, []), shell.renderNoAccess(perms.MENU[0]),
    charts.lineChartSvg({ labels: ["2026-03-25"], series: [{ name: "A", className: "chart--a", values: [1] }, { name: "B", className: "chart--b", values: [1] }] })
  ].forEach((html) => classesIn(html).forEach((c) => used.add(c)));

  const withoutCss = [...used].filter((c) => !defined.has(c));
  assert.deepEqual(withoutCss, [], "classes sem estilo no CSS");
});

test("html: sem scripts nem estilos inline, com todos os ficheiros referenciados presentes", () => {
  for (const file of ["public/index.html", "public/painel.html"]) {
    const html = read(file);
    assert.equal(/<script(?![^>]*\ssrc=)[^>]*>/i.test(html), false, file + ": script inline");
    assert.equal(/\sstyle\s*=/.test(html), false, file + ": estilo inline");
    assert.equal(/\son[a-z]+\s*=/i.test(html), false, file + ": manipulador inline");
    assert.match(html, /<html lang="pt-PT">/);
    assert.match(html, /name="robots" content="noindex, nofollow"/);
    const refs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u));
    refs.forEach((ref) => {
      if (ref === "assets/logo.png") return; // o logótipo é acrescentado por ti (ver README)
      assert.ok(fs.existsSync(path.join(ROOT, "public", ref)), file + " referencia um ficheiro que não existe: " + ref);
    });
  }
});

test("html: o login tem todos os ids que o login.js procura", () => {
  const html = read("public/index.html");
  const source = read("public/js/login.js");
  const ids = [...source.matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(ids.length >= 9);
  ids.forEach((id) => assert.ok(html.includes('id="' + id + '"'), "id em falta no index.html: " + id));
});

test("html: a ordem dos scripts respeita as dependências", () => {
  const order = (file) => [...read(file).matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  const painel = order("public/painel.html");
  const idx = (name) => painel.indexOf(name);
  assert.ok(idx("config.js") < idx("js/api.js"));
  assert.ok(idx("js/format.js") < idx("js/charts.js"));
  assert.ok(idx("js/icons.js") < idx("js/pages/dashboard.js"));
  assert.ok(idx("js/charts.js") < idx("js/pages/dashboard.js"));
  assert.ok(idx("js/pages/dashboard.js") < idx("js/shell.js"));
  assert.ok(idx("js/pages/soon.js") < idx("js/shell.js"));
  assert.ok(idx("js/permissions.js") < idx("js/shell.js"));
  const loginOrder = order("public/index.html");
  assert.ok(loginOrder.indexOf("js/icons.js") < loginOrder.indexOf("js/login.js"));
  assert.ok(loginOrder.indexOf("js/api.js") < loginOrder.indexOf("js/login.js"));
});

test("segurança: a política de conteúdo e os cabeçalhos da Vercel", () => {
  const config = JSON.parse(read("vercel.json"));
  const rules = config.headers.find((h) => h.source === "/(.*)").headers;
  const header = (name) => (rules.find((h) => h.key === name) || {}).value;
  const csp = header("Content-Security-Policy");
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.equal(/unsafe-inline|unsafe-eval/.test(csp), false);
  assert.match(csp, /connect-src[^;]*automercado-backend\.onrender\.com/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(header("X-Frame-Options"), "DENY");
  assert.equal(header("X-Content-Type-Options"), "nosniff");
  assert.equal(header("Referrer-Policy"), "no-referrer");
  assert.equal(config.buildCommand, "node scripts/build-config.js");
  assert.equal(config.outputDirectory, "public");
  const noStore = config.headers.find((h) => h.source === "/config.js");
  assert.equal(noStore.headers[0].value, "no-store");
});

test("segurança: o código não usa eval, document.write nem guarda o token fora do sessionStorage", () => {
  const files = fs.readdirSync(JS).filter((f) => f.endsWith(".js")).map((f) => path.join(JS, f))
    .concat(fs.readdirSync(path.join(JS, "pages")).map((f) => path.join(JS, "pages", f)));
  files.forEach((file) => {
    const source = fs.readFileSync(file, "utf-8");
    assert.equal(/\beval\s*\(|new Function\s*\(|document\.write\s*\(/.test(source), false, file);
    assert.equal(/localStorage/.test(source), false, file + " usa localStorage");
    assert.equal(/console\.(log|info)\s*\(.*(token|password)/i.test(source), false, file + " escreve segredos nos logs");
  });
});

// ---------- script de build da configuração ----------

const { spawnSync } = require("node:child_process");
const os = require("node:os");

function runBuild(env) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "am-admin-"));
  fs.mkdirSync(path.join(tmp, "scripts"));
  fs.mkdirSync(path.join(tmp, "public"));
  fs.copyFileSync(path.join(ROOT, "scripts", "build-config.js"), path.join(tmp, "scripts", "build-config.js"));
  const result = spawnSync(process.execPath, [path.join(tmp, "scripts", "build-config.js")], {
    env: { PATH: process.env.PATH, ...env }, encoding: "utf-8"
  });
  const file = path.join(tmp, "public", "config.js");
  const content = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : null;
  fs.rmSync(tmp, { recursive: true, force: true });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, content };
}

test("build: gera o config.js a partir de ADMIN_API_URL (sem barra final) ou usa o padrão", () => {
  const custom = runBuild({ ADMIN_API_URL: " https://meu-backend.exemplo.ao/api/ " });
  assert.equal(custom.status, 0);
  assert.match(custom.content, /window\.ADMIN_CONFIG = \{"API_URL":"https:\/\/meu-backend\.exemplo\.ao\/api"\};/);

  const fallback = runBuild({});
  assert.equal(fallback.status, 0);
  assert.match(fallback.content, /https:\/\/automercado-backend\.onrender\.com\/api/);

  for (const hostile of ['https://x.ao/api";alert(1);//', "https://x.ao/api'+alert(1)+'", "https://x.ao/<script>", "https://x.ao/a b"]) {
    const evil = runBuild({ ADMIN_API_URL: hostile });
    assert.equal(evil.status, 1, "recusa: " + hostile);
    assert.equal(evil.content, null);
  }

  const invalid = runBuild({ ADMIN_API_URL: "javascript:alert(1)" });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.content, null);
  assert.match(invalid.stderr, /ADMIN_API_URL inválido/);
});

test("config.js entregue é válido e aponta para o backend em produção", () => {
  const source = read("public/config.js");
  const sandbox = { window: {} };
  new Function("window", source)(sandbox.window);
  assert.equal(sandbox.window.ADMIN_CONFIG.API_URL, "https://automercado-backend.onrender.com/api");
});
