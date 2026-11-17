// ==========================================
// PÁGINA PROVISÓRIA
//
// Mostrada nas secções do menu que ainda não foram ativadas. Diz
// claramente que a secção ainda não está pronta, em vez de simular dados.
// ==========================================
(function (root) {

  const AM = (root.AM = root.AM || {});
  const fmt = AM.format || require("../format.js");
  const icons = AM.icons || require("../icons.js");

  const esc = fmt.escapeHtml;

  function render(item) {

    const note = item.note || "Esta secção ainda não está ativa no painel. Será ligada aos dados reais numa próxima fase.";

    return '<header class="page-head"><div><h1 class="page-title">' + esc(item.label) + "</h1>" +
      '<p class="page-sub">Em preparação</p></div></header>' +
      '<section class="card"><div class="card__body"><div class="empty empty--large">' +
      icons.icon(item.icon || "info", { size: 28 }) +
      "<p><strong>" + esc(item.label) + "</strong> ainda não está disponível.</p>" +
      "<p>" + esc(note) + "</p></div></div></section>";

  }

  function mount(container, ctx) {
    container.innerHTML = render(ctx.item);
    return { destroy() {} };
  }

  const api = { render, mount };

  AM.pages = AM.pages || {};
  AM.pages.soon = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

})(typeof window !== "undefined" ? window : globalThis);
