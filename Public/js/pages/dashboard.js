// ==========================================
// PÁGINA: DASHBOARD
//
// render(data, opts) devolve HTML (função pura, testável); mount() trata
// do carregamento, dos erros e dos botões. Tudo o que vem da API passa
// por escapeHtml. Sem estilos inline (política de segurança do painel):
// as larguras das barras vão em data-w e são aplicadas por JavaScript.
// ==========================================
(function (root) {

  const AM = (root.AM = root.AM || {});
  const fmt = AM.format || require("../format.js");
  const icons = AM.icons || require("../icons.js");
  const charts = AM.charts || require("../charts.js");

  const esc = fmt.escapeHtml;
  const icon = icons.icon;

  const RANGES = [7, 30, 90];

  // ---------- peças pequenas ----------

  function kpi(options) {

    const soon = Boolean(options.soon);
    const unavailable = !soon && !fmt.isNumber(options.value);
    const display = soon ? "Em breve" : fmt.formatNumber(options.value);
    const tone = options.tone || "neutral";

    return '<article class="kpi kpi--' + esc(tone) + (soon ? " kpi--soon" : "") + '">' +
      '<span class="kpi__icon">' + icon(options.icon, { size: 20 }) + "</span>" +
      '<div class="kpi__body">' +
      '<p class="kpi__label">' + esc(options.label) + "</p>" +
      '<p class="kpi__value' + (soon ? " kpi__value--text" : "") + '"' + (unavailable ? ' title="Indisponível"' : "") + ">" + esc(display) + "</p>" +
      (options.caption ? '<p class="kpi__caption">' + esc(options.caption) + "</p>" : "") +
      "</div></article>";

  }

  function group(title, cards) {
    return '<section class="kpi-group" aria-label="' + esc(title) + '">' +
      '<h2 class="kpi-group__title">' + esc(title) + "</h2>" +
      '<div class="kpi-grid">' + cards.join("") + "</div></section>";
  }

  function card(title, subtitle, body, extraClass) {
    return '<section class="card' + (extraClass ? " " + extraClass : "") + '">' +
      '<header class="card__head"><div><h2 class="card__title">' + esc(title) + "</h2>" +
      (subtitle ? '<p class="card__sub">' + esc(subtitle) + "</p>" : "") + "</div></header>" +
      '<div class="card__body">' + body + "</div></section>";
  }

  function emptyState(iconName, text) {
    return '<div class="empty">' + icon(iconName, { size: 24 }) + "<p>" + esc(text) + "</p></div>";
  }

  function plus(value, text) {
    return fmt.isNumber(value) ? "+" + fmt.formatNumber(value) + " " + text : "";
  }

  // ---------- indicadores ----------

  function kpiGroups(data) {

    const u = data.users || {};
    const l = data.listings || {};
    const cars = l.cars || {};
    const rentals = l.rentals || {};
    const reports = data.reports || {};

    return [
      group("Utilizadores", [
        kpi({ label: "Total de utilizadores", value: u.total, icon: "users", tone: "primary", caption: plus(u.new_last_7_days, "nos últimos 7 dias") }),
        kpi({ label: "Vendedores", value: u.sellers, icon: "user", tone: "neutral", caption: "Vendedores, stands e rent-a-car" }),
        kpi({ label: "Verificados", value: u.verified, icon: "userCheck", tone: "success", caption: "Contas com plano pago" }),
        kpi({ label: "Suspensos", value: u.suspended, icon: "userX", tone: Number(u.suspended) > 0 ? "danger" : "neutral", caption: "Sem acesso ao site" })
      ]),
      group("Anúncios", [
        kpi({ label: "Total de anúncios", value: l.total, icon: "tag", tone: "primary", caption: plus(l.new_last_7_days, "nos últimos 7 dias") }),
        kpi({ label: "Pendentes", value: l.pending, icon: "clock", tone: Number(l.pending) > 0 ? "warning" : "neutral", caption: "A aguardar moderação" }),
        kpi({ label: "Aprovados", value: l.approved, icon: "checkCircle", tone: "success", caption: "Visíveis ao público" }),
        kpi({ label: "Rejeitados", value: l.rejected, icon: "ban", tone: Number(l.rejected) > 0 ? "danger" : "neutral", caption: "Retirados pela moderação" })
      ]),
      group("Catálogo e denúncias", [
        kpi({ label: "Automóveis", value: cars.total, icon: "car", tone: "neutral", caption: "Anúncios de venda" }),
        kpi({ label: "Alugueres", value: rentals.total, icon: "key", tone: "neutral", caption: "Anúncios de aluguer" }),
        kpi({ label: "Peças", value: null, icon: "package", tone: "neutral", soon: true, caption: "Ainda não existe no marketplace" }),
        kpi({ label: "Denúncias abertas", value: reports.open, icon: "flag", tone: Number(reports.open) > 0 ? "warning" : "neutral", caption: "Por analisar" })
      ])
    ].join("");

  }

  // ---------- crescimento ----------

  function growthCard(data, days) {

    const g = data.growth;

    if (!g) {
      return card("Crescimento", "Novos utilizadores e novos anúncios por dia", emptyState("alert", "O crescimento não está disponível neste momento."), "card--wide");
    }

    const sum = (values) => values.reduce((a, b) => a + (Number(b) || 0), 0);
    const totalUsers = sum(g.users);
    const totalListings = sum(g.listings);

    const body =
      '<div class="legend">' +
      '<span class="legend__item"><i class="dot dot--a"></i>Novos utilizadores <strong>' + fmt.formatNumber(totalUsers) + "</strong></span>" +
      '<span class="legend__item"><i class="dot dot--b"></i>Novos anúncios <strong>' + fmt.formatNumber(totalListings) + "</strong></span>" +
      "</div>" +
      charts.lineChartSvg({
        labels: g.labels,
        series: [
          { name: "Novos utilizadores", className: "chart--a", values: g.users },
          { name: "Novos anúncios", className: "chart--b", values: g.listings }
        ],
        ariaLabel: "Novos utilizadores e novos anúncios por dia, nos últimos " + days + " dias"
      }) +
      (g.truncated ? '<p class="note">O gráfico usa no máximo os 1000 registos mais antigos de cada tabela neste período; os totais acima dos cartões são exatos.</p>' : "");

    return card("Crescimento", "Últimos " + days + " dias, por dia", body, "card--wide");

  }

  // ---------- distribuições ----------

  function statusTotals(listings) {

    const sources = [
      listings && listings.cars && listings.cars.by_status,
      listings && listings.rentals && listings.rentals.by_status
    ].filter(Boolean);

    if (sources.length === 0) return null;

    const sum = (key) => sources.reduce((acc, s) => acc + (Number(s[key]) || 0), 0);

    return {
      approved: sum("approved"),
      pending: sum("pending"),
      paused: sum("paused"),
      closed: sum("sold") + sum("rented"),
      rejected: sum("rejected"),
      suspended: sum("suspended"),
      partial: sources.length < 2
    };

  }

  const STATUS_ROWS = [
    { key: "approved", label: "Aprovados", className: "seg--approved" },
    { key: "pending", label: "Pendentes", className: "seg--pending" },
    { key: "paused", label: "Pausados", className: "seg--paused" },
    { key: "closed", label: "Vendidos ou alugados", className: "seg--closed" },
    { key: "rejected", label: "Rejeitados", className: "seg--rejected" },
    { key: "suspended", label: "Suspensos", className: "seg--suspended" }
  ];

  function statusCard(data) {

    const totals = statusTotals(data.listings);

    if (!totals) {
      return card("Estado dos anúncios", "Carros e alugueres", emptyState("alert", "Indisponível neste momento."));
    }

    const all = STATUS_ROWS.reduce((sum, row) => sum + totals[row.key], 0);

    const body =
      charts.stackedBarHtml(STATUS_ROWS.map((row) => ({ label: row.label, value: totals[row.key], className: row.className }))) +
      '<ul class="status-list">' +
      STATUS_ROWS.map((row) =>
        '<li class="status-list__row"><span class="status-list__name"><i class="dot ' + row.className + '"></i>' + esc(row.label) + "</span>" +
        '<span class="status-list__value">' + fmt.formatNumber(totals[row.key]) +
        ' <small>' + esc(fmt.formatPercent(totals[row.key], all)) + "</small></span></li>"
      ).join("") + "</ul>" +
      (totals.partial ? '<p class="note">Dados parciais: falta um dos tipos de anúncio.</p>' : "");

    return card("Estado dos anúncios", "Carros e alugueres", body);

  }

  function accountTypesCard(data) {

    const types = data.users && data.users.by_account_type;

    if (!types) {
      return card("Contas por tipo", "Distribuição dos utilizadores", emptyState("alert", "Indisponível: a coluna do tipo de conta ainda não existe na base de dados."));
    }

    const rows = Object.keys(fmt.ACCOUNT_TYPE_LABELS).map((key) => ({ label: fmt.ACCOUNT_TYPE_LABELS[key], value: types[key] }));

    return card("Contas por tipo", "Distribuição dos utilizadores", charts.barListHtml(rows, Number(data.users.total) || undefined));

  }

  // ---------- listas ----------

  function pendingCard(data, now) {

    const queue = data.pending_queue;

    if (queue === null || queue === undefined) {
      return card("Fila de moderação", "Anúncios pendentes mais antigos", emptyState("alert", "Indisponível neste momento."));
    }

    if (queue.length === 0) {
      return card("Fila de moderação", "Anúncios pendentes mais antigos", emptyState("checkCircle", "Não há anúncios pendentes."));
    }

    const items = queue.map((item) =>
      '<li class="feed__item"><span class="feed__icon">' + icon(item.type === "rental" ? "key" : "car", { size: 18 }) + "</span>" +
      '<div class="feed__main"><p class="feed__title">' + esc(item.title) + "</p>" +
      '<p class="feed__meta">' + esc(fmt.TYPE_LABELS[item.type] || "Anúncio") +
      (item.owner_name ? " · " + esc(item.owner_name) : "") + " · " + esc(fmt.timeAgo(item.created_at, now)) + "</p></div></li>"
    ).join("");

    return card("Fila de moderação", "Anúncios pendentes mais antigos", '<ul class="feed">' + items + "</ul>");

  }

  const ACTION_ICONS = {
    "listing.approve": "checkCircle",
    "listing.reject": "x",
    "listing.suspend": "ban",
    "listing.reactivate": "refresh",
    "listing.edit": "sliders",
    "listing.delete": "alert",
    "listing.delete_failed": "alert",
    "admin.login": "lock",
    "admin.login_failed": "alert"
  };

  function activityCard(data, now) {

    const entries = data.recent_activity;

    if (entries === null || entries === undefined) {
      return card("Atividade administrativa recente", "Últimas ações da equipa", emptyState("alert", "Indisponível neste momento."));
    }

    if (entries.length === 0) {
      return card("Atividade administrativa recente", "Últimas ações da equipa", emptyState("history", "Ainda não há atividade registada."));
    }

    const items = entries.map((entry) =>
      '<li class="feed__item"><span class="feed__icon">' + icon(ACTION_ICONS[entry.action] || "history", { size: 18 }) + "</span>" +
      '<div class="feed__main"><p class="feed__title"><strong>' + esc(entry.admin_name || "Administrador") + "</strong> " +
      esc(fmt.actionLabel(entry.action)) + (entry.title ? " " + esc(entry.title) : "") + "</p>" +
      '<p class="feed__meta">' + esc(fmt.ROLE_LABELS[entry.admin_role] || "Equipa") + " · " + esc(fmt.timeAgo(entry.created_at, now)) +
      (entry.reason ? " · " + esc(entry.reason) : "") + "</p></div></li>"
    ).join("");

    return card("Atividade administrativa recente", "Últimas ações da equipa", '<ul class="feed">' + items + "</ul>");

  }

  function warningsNotice(warnings) {

    if (!warnings || warnings.length === 0) return "";

    return '<aside class="notice notice--warning" role="status">' + icon("alert", { size: 18 }) +
      "<div><p><strong>Alguns dados não estão disponíveis.</strong> O resto do dashboard funciona normalmente.</p>" +
      '<ul class="notice__list">' + warnings.map((w) => "<li>" + esc(w) + "</li>").join("") + "</ul></div></aside>";

  }

  // ---------- página completa ----------

  function header(data, days, now) {

    const generated = data && data.generated_at ? "Atualizado às " + fmt.formatTime(data.generated_at) : "A carregar...";

    return '<header class="page-head"><div><h1 class="page-title">Dashboard</h1>' +
      '<p class="page-sub">' + esc(generated) + "</p></div>" +
      '<div class="page-actions">' +
      '<div class="segmented" role="group" aria-label="Período do gráfico">' +
      RANGES.map((d) => '<button type="button" class="segmented__btn" data-days="' + d + '" aria-pressed="' + (d === days) + '">' + d + " dias</button>").join("") +
      "</div>" +
      '<button type="button" class="btn btn--ghost" data-action="refresh">' + icon("refresh", { size: 16 }) + "<span>Atualizar</span></button>" +
      "</div></header>";

  }

  function render(data, options) {

    const opts = options || {};
    const days = opts.days || 30;
    const now = opts.now === undefined ? Date.now() : opts.now;
    const canSeeActivity = (opts.permissions || []).includes("audit:view");

    return header(data, days, now) +
      warningsNotice(data.warnings) +
      kpiGroups(data) +
      '<div class="grid grid--2-1">' + growthCard(data, days) + statusCard(data) + "</div>" +
      '<div class="grid grid--1-1">' + pendingCard(data, now) + accountTypesCard(data) + "</div>" +
      (canSeeActivity ? '<div class="grid grid--1">' + activityCard(data, now) + "</div>" : "");

  }

  function renderLoading() {

    const skeleton = '<div class="skeleton skeleton--kpi"></div>';

    return '<div aria-busy="true">' +
      '<header class="page-head"><div><h1 class="page-title">Dashboard</h1><p class="page-sub" data-hint>A carregar os números...</p></div></header>' +
      '<div class="kpi-grid">' + skeleton + skeleton + skeleton + skeleton + "</div>" +
      '<div class="grid grid--2-1"><div class="skeleton skeleton--card"></div><div class="skeleton skeleton--card"></div></div>' +
      "</div>";

  }

  function renderError(error) {

    const message = error && error.message ? error.message : "Ocorreu um erro inesperado.";

    return '<header class="page-head"><div><h1 class="page-title">Dashboard</h1></div></header>' +
      '<div class="notice notice--danger" role="alert">' + icon("alert", { size: 20 }) +
      "<div><p><strong>Não foi possível carregar o dashboard.</strong></p><p>" + esc(message) + "</p>" +
      '<button type="button" class="btn btn--primary" data-action="retry">' + icon("refresh", { size: 16 }) + "<span>Tentar de novo</span></button></div></div>";

  }

  // ---------- ligação ao ecrã ----------

  function mount(container, ctx) {

    const api = ctx.api;
    let days = 30;
    let destroyed = false;
    let slowTimer = null;

    function show(html) {
      container.innerHTML = html;
      charts.applyWidths(container);
    }

    function bind() {

      container.querySelectorAll("[data-days]").forEach((button) => {
        button.addEventListener("click", () => {
          days = Number(button.getAttribute("data-days"));
          load();
        });
      });

      const refresh = container.querySelector('[data-action="refresh"]');
      if (refresh) refresh.addEventListener("click", load);

      const retry = container.querySelector('[data-action="retry"]');
      if (retry) retry.addEventListener("click", load);

    }

    async function load() {

      show(renderLoading());

      // Servidores gratuitos "adormecem": avisa se a resposta demorar
      slowTimer = setTimeout(() => {
        const hint = container.querySelector("[data-hint]");
        if (hint) hint.textContent = "O servidor está a demorar a responder (pode estar a acordar). Aguarda um momento...";
      }, 8000);

      try {

        const data = await api.get("/admin/dashboard", { query: { days } });

        if (destroyed) return;

        show(render(data, { days, permissions: ctx.permissions, now: Date.now() }));
        bind();

      } catch (error) {

        if (destroyed) return;

        // 401: o cliente da API já tratou de levar ao login
        if (error && error.status === 401) return;

        show(renderError(error));
        bind();

      } finally {

        clearTimeout(slowTimer);

      }

    }

    load();

    return {
      destroy() {
        destroyed = true;
        clearTimeout(slowTimer);
      }
    };

  }

  const api = { render, renderLoading, renderError, statusTotals, mount };

  AM.pages = AM.pages || {};
  AM.pages.dashboard = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

})(typeof window !== "undefined" ? window : globalThis);
