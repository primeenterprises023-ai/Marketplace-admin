// ==========================================
// ESTRUTURA DO PAINEL (barra lateral, barra superior, navegação)
//
// - Sem sessão válida, volta ao login.
// - O menu mostra só o que a função pode usar (a segurança real está no
//   servidor).
// - As páginas são carregadas por hash: #/dashboard, #/listings, ...
// ==========================================
(function (root) {

  const AM = (root.AM = root.AM || {});
  const fmt = AM.format || require("./format.js");
  const icons = AM.icons || require("./icons.js");
  const perms = AM.permissions || require("./permissions.js");

  const esc = fmt.escapeHtml;
  const icon = icons.icon;

  const NOTIFY_EVERY_MS = 2 * 60 * 1000;

  // ---------- peças de HTML (funções puras) ----------

  function renderSidebar(menu, activeId) {

    const items = menu.map((item) =>
      '<li><a class="nav__link' + (item.id === activeId ? " is-active" : "") + '" href="' + esc(item.hash) +
      '" data-nav="' + esc(item.id) + '"' + (item.id === activeId ? ' aria-current="page"' : "") + ">" +
      icon(item.icon, { size: 18 }) + "<span>" + esc(item.label) + "</span>" +
      (item.ready ? "" : '<span class="nav__soon">Em breve</span>') + "</a></li>"
    ).join("");

    return '<div class="sidebar__brand">' +
      '<img id="brand-logo" class="sidebar__logo" src="assets/logo.png" alt="AutoMercado Angola">' +
      '<span id="brand-fallback" class="wordmark" hidden><span class="wordmark__main">AutoMercado</span><span class="wordmark__sub">ANGOLA</span></span>' +
      '<span class="sidebar__tag">Administração</span></div>' +
      '<nav class="nav" aria-label="Secções do painel"><ul class="nav__list">' + items + "</ul></nav>" +
      '<p class="sidebar__foot">Acesso restrito à equipa</p>';

  }

  // data: undefined = a carregar; null = falhou; objeto = { pending_listings, open_reports }
  function renderNotifications(data, permissions) {

    let body;

    if (data === undefined) {
      body = '<p class="popover__empty">A carregar...</p>';
    } else if (data === null) {
      body = '<p class="popover__empty">Não foi possível carregar as notificações.</p>';
    } else {

      const rows = [];

      if (perms.can(permissions, "listings:view") && fmt.isNumber(data.pending_listings) && Number(data.pending_listings) > 0) {
        rows.push('<li><a class="popover__item" href="#/listings?status=pending">' + icon("clock", { size: 18 }) +
          "<span><strong>" + fmt.formatNumber(data.pending_listings) + "</strong> anúncios pendentes</span></a></li>");
      }

      if (perms.can(permissions, "reports:view") && fmt.isNumber(data.open_reports) && Number(data.open_reports) > 0) {
        rows.push('<li><a class="popover__item" href="#/reports">' + icon("flag", { size: 18 }) +
          "<span><strong>" + fmt.formatNumber(data.open_reports) + "</strong> denúncias por analisar</span></a></li>");
      }

      body = rows.length > 0
        ? '<ul class="popover__list">' + rows.join("") + "</ul>"
        : '<p class="popover__empty">Sem notificações novas.</p>';

    }

    return '<p class="popover__title">Notificações</p>' + body;

  }

  function notificationCount(data, permissions) {

    if (!data) return 0;

    let total = 0;

    if (perms.can(permissions, "listings:view") && fmt.isNumber(data.pending_listings)) total += Number(data.pending_listings);
    if (perms.can(permissions, "reports:view") && fmt.isNumber(data.open_reports)) total += Number(data.open_reports);

    return total;

  }

  function renderUserPanel(admin, session) {

    const until = session && session.expiresAt ? fmt.formatTime(new Date(session.expiresAt).toISOString()) : "\u2014";

    return '<p class="popover__title">' + esc(admin.name || "Administrador") + "</p>" +
      '<dl class="popover__facts">' +
      "<div><dt>Email</dt><dd>" + esc(admin.email) + "</dd></div>" +
      "<div><dt>Função</dt><dd>" + esc(fmt.ROLE_LABELS[admin.role] || admin.role) + "</dd></div>" +
      "<div><dt>Sessão válida até</dt><dd>" + esc(until) + "</dd></div></dl>" +
      '<button type="button" class="btn btn--ghost btn--block" data-action="logout">' + icon("logout", { size: 16 }) + "<span>Terminar sessão</span></button>";

  }

  function renderTopbar(admin, title, session) {

    const displayName = admin.name || admin.email;

    return '<button type="button" class="icon-btn topbar__menu" id="nav-toggle" aria-label="Abrir menu" aria-controls="sidebar" aria-expanded="false">' + icon("menu") + "</button>" +
      '<p class="topbar__title" id="topbar-title">' + esc(title) + "</p>" +
      '<div class="topbar__right">' +
      '<div class="menu"><button type="button" class="icon-btn" id="notif-btn" aria-label="Notificações" aria-haspopup="true" aria-expanded="false" aria-controls="notif-panel">' +
      icon("bell") + '<span class="badge" id="notif-badge" hidden>0</span></button>' +
      '<div class="popover popover--right" id="notif-panel" hidden>' + renderNotifications(undefined, admin.permissions) + "</div></div>" +
      '<div class="menu"><button type="button" class="user-btn" id="user-btn" aria-haspopup="true" aria-expanded="false" aria-controls="user-panel">' +
      '<span class="avatar" aria-hidden="true">' + esc(fmt.initials(displayName)) + "</span>" +
      '<span class="user-btn__text"><strong>' + esc(displayName) + "</strong><small>" + esc(fmt.ROLE_LABELS[admin.role] || admin.role) + "</small></span></button>" +
      '<div class="popover popover--right" id="user-panel" hidden>' + renderUserPanel(admin, session) + "</div></div>" +
      "</div>";

  }

  function renderNoAccess(item) {

    return '<header class="page-head"><div><h1 class="page-title">' + esc(item ? item.label : "Acesso") + "</h1></div></header>" +
      '<section class="card"><div class="card__body"><div class="empty empty--large">' + icon("lock", { size: 28 }) +
      "<p><strong>Sem acesso a esta secção.</strong></p>" +
      "<p>A tua função não tem permissão para ver esta página. Se precisares de acesso, fala com um superadministrador.</p>" +
      '<a class="btn btn--primary" href="#/dashboard">Voltar ao dashboard</a></div></div></section>';

  }

  // ---------- ligação ao ecrã ----------

  function init(doc, deps) {

    const api = deps.api;
    const win = deps.window;
    const location = win.location;
    const app = doc.getElementById("app");

    const session = api && api.getSession();

    if (!session) {
      location.replace("index.html");
      return;
    }

    let admin = session.admin;
    let currentPage = null;
    let notificationData;
    let notifyTimer = null;
    let expiryTimer = null;

    const byId = (id) => doc.getElementById(id);

    function menu() {
      return perms.visibleMenu(admin.permissions);
    }

    function currentItem() {
      const hash = location.hash || "#/dashboard";
      return perms.routeFor(hash) || menu()[0] || null;
    }

    // ----- janelas flutuantes (notificações e perfil) e menu móvel -----

    function closePopovers() {
      [["notif-btn", "notif-panel"], ["user-btn", "user-panel"]].forEach(([buttonId, panelId]) => {
        const panel = byId(panelId);
        const button = byId(buttonId);
        if (panel) panel.hidden = true;
        if (button) button.setAttribute("aria-expanded", "false");
      });
    }

    function togglePopover(buttonId, panelId) {
      const panel = byId(panelId);
      const button = byId(buttonId);
      const willOpen = panel.hidden;
      closePopovers();
      panel.hidden = !willOpen;
      button.setAttribute("aria-expanded", String(willOpen));
      return willOpen;
    }

    function setNav(open) {
      doc.body.classList.toggle("nav-open", open);
      byId("scrim").hidden = !open;
      byId("nav-toggle").setAttribute("aria-expanded", String(open));
    }

    // ----- notificações -----

    function paintNotifications() {
      const count = notificationCount(notificationData, admin.permissions);
      const badge = byId("notif-badge");
      badge.hidden = count === 0;
      badge.textContent = count > 99 ? "99+" : String(count);
      byId("notif-panel").innerHTML = renderNotifications(notificationData, admin.permissions);
    }

    async function loadNotifications() {

      if (doc.hidden) return;

      try {
        notificationData = await api.get("/admin/notifications");
      } catch (error) {
        if (error && error.status === 401) return;
        notificationData = null;
      }

      paintNotifications();

    }

    // ----- rotas -----

    function setActive(id) {
      doc.querySelectorAll("[data-nav]").forEach((link) => {
        const active = link.getAttribute("data-nav") === id;
        link.classList.toggle("is-active", active);
        if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
      });
    }

    function route() {

      const view = byId("view");
      const item = currentItem();

      if (currentPage && currentPage.destroy) currentPage.destroy();
      currentPage = null;

      if (!item || !perms.can(admin.permissions, item.permission)) {
        setActive(null);
        byId("topbar-title").textContent = "Sem acesso";
        doc.title = "Sem acesso · Administração AutoMercado";
        view.innerHTML = renderNoAccess(item);
        setNav(false);
        return;
      }

      setActive(item.id);
      byId("topbar-title").textContent = item.label;
      doc.title = item.label + " · Administração AutoMercado";

      const page = item.ready && AM.pages && AM.pages[item.id] ? AM.pages[item.id] : AM.pages.soon;

      currentPage = page.mount(view, {
        api,
        admin,
        permissions: admin.permissions,
        item,
        query: perms.hashQuery(location.hash)
      });

      view.focus({ preventScroll: true });
      setNav(false);

    }

    // ----- montar o ecrã -----

    function build() {

      const item = currentItem();

      app.innerHTML =
        '<aside class="sidebar" id="sidebar" aria-label="Navegação principal">' + renderSidebar(menu(), item ? item.id : null) + "</aside>" +
        '<div class="scrim" id="scrim" hidden></div>' +
        '<div class="main"><header class="topbar" id="topbar">' + renderTopbar(admin, item ? item.label : "", api.getSession()) + "</header>" +
        '<main class="content" id="view" tabindex="-1" aria-live="polite"></main></div>';

      // logótipo: se não existir o ficheiro, mostra o nome em texto
      const logo = byId("brand-logo");
      logo.addEventListener("error", () => {
        logo.hidden = true;
        byId("brand-fallback").hidden = false;
      });

      byId("nav-toggle").addEventListener("click", () => setNav(!doc.body.classList.contains("nav-open")));
      byId("scrim").addEventListener("click", () => setNav(false));

      doc.querySelectorAll("[data-nav]").forEach((link) => {
        link.addEventListener("click", () => setNav(false));
      });

      byId("notif-btn").addEventListener("click", () => {
        if (togglePopover("notif-btn", "notif-panel")) loadNotifications();
      });

      byId("user-btn").addEventListener("click", () => togglePopover("user-btn", "user-panel"));

      byId("user-panel").addEventListener("click", (event) => {
        const target = event.target.closest ? event.target.closest('[data-action="logout"]') : null;
        if (target) logout();
      });

      paintNotifications();

    }

    function logout() {
      clearTimeout(expiryTimer);
      clearInterval(notifyTimer);
      api.clearSession();
      location.replace("index.html");
    }

    // Fechar janelas flutuantes: clique fora ou tecla Escape
    doc.addEventListener("click", (event) => {
      if (!event.target.closest || !event.target.closest(".menu")) closePopovers();
    });

    doc.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      closePopovers();
      if (doc.body.classList.contains("nav-open")) {
        setNav(false);
        byId("nav-toggle").focus();
      }
    });

    doc.addEventListener("visibilitychange", () => {
      if (!doc.hidden) loadNotifications();
    });

    win.addEventListener("hashchange", route);

    build();
    route();
    loadNotifications();

    notifyTimer = setInterval(loadNotifications, NOTIFY_EVERY_MS);

    // Quando o token expira, volta ao login
    expiryTimer = setTimeout(() => {
      api.clearSession();
      location.replace("index.html?expired=1");
    }, Math.max(0, session.expiresAt - Date.now()));

    // Pergunta ao servidor quem somos agora (a função pode ter mudado)
    api.refreshAdmin().then((fresh) => {
      const changed = JSON.stringify(fresh.permissions) !== JSON.stringify(admin.permissions) ||
        fresh.role !== admin.role || fresh.name !== admin.name;

      if (changed) {
        admin = fresh;
        build();
        route();
      }
    }).catch((error) => {
      // 401: o cliente da API já levou ao login. Outros erros (sem rede):
      // continua com o que está guardado.
      if (error && error.status !== 401) {
        console.warn("Não foi possível atualizar a função do administrador:", error.message);
      }
    });

  }

  const api = {
    renderSidebar,
    renderTopbar,
    renderNotifications,
    notificationCount,
    renderUserPanel,
    renderNoAccess,
    init
  };

  AM.shell = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document !== "undefined" && typeof window !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
      init(document, { api: AM.api, window });
    });
  }

})(typeof window !== "undefined" ? window : globalThis);
