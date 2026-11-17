// ==========================================
// FORMATAÇÃO E TEXTOS
//
// Tudo o que vem da API e é mostrado no painel passa por escapeHtml.
// Os ficheiros do painel são scripts simples (sem build): cada um
// regista-se em window.AM e, em Node (testes), exporta-se por require().
// ==========================================
(function (root) {

  const AM = (root.AM = root.AM || {});

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isNumber(value) {
    return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  }

  // 1 234 (formato português). Sem valor = travessão.
  function formatNumber(value) {
    if (!isNumber(value)) return "\u2014";
    return new Intl.NumberFormat("pt-PT").format(Number(value));
  }

  // 12,5 %
  function formatPercent(part, total) {
    if (!isNumber(part) || !isNumber(total) || Number(total) === 0) return "\u2014";
    const value = (Number(part) / Number(total)) * 100;
    return new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 }).format(value) + " %";
  }

  const TIME_ZONE = "Africa/Luanda";

  function parseDate(iso) {
    if (!iso) return null;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDateTime(iso) {
    const date = parseDate(iso);
    if (!date) return "\u2014";
    return new Intl.DateTimeFormat("pt-PT", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE
    }).format(date);
  }

  function formatTime(iso) {
    const date = parseDate(iso);
    if (!date) return "\u2014";
    return new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE }).format(date);
  }

  // "há 5 min", "há 3 h", "há 2 dias"; passada uma semana, a data
  function timeAgo(iso, now) {
    const date = parseDate(iso);
    if (!date) return "\u2014";

    const seconds = Math.max(0, Math.round(((now === undefined ? Date.now() : now) - date.getTime()) / 1000));

    if (seconds < 60) return "agora mesmo";
    if (seconds < 3600) return "há " + Math.floor(seconds / 60) + " min";
    if (seconds < 86400) return "há " + Math.floor(seconds / 3600) + " h";
    if (seconds < 7 * 86400) {
      const days = Math.floor(seconds / 86400);
      return "há " + days + (days === 1 ? " dia" : " dias");
    }
    return formatDateTime(iso).split(",")[0];
  }

  // "2026-03-25" -> "25/03"
  function shortDay(isoDay) {
    const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(isoDay));
    return match ? match[2] + "/" + match[1] : String(isoDay);
  }

  function initials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "A";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  const ROLE_LABELS = {
    superadmin: "Superadministrador",
    admin: "Administrador",
    moderator: "Moderador"
  };

  const STATUS_LABELS = {
    pending: "Pendente",
    approved: "Aprovado",
    paused: "Pausado",
    sold: "Vendido",
    rented: "Alugado",
    rejected: "Rejeitado",
    suspended: "Suspenso"
  };

  const ACCOUNT_TYPE_LABELS = {
    comprador: "Compradores",
    vendedor: "Vendedores particulares",
    stand: "Stands",
    rentacar: "Rent-a-car"
  };

  const TYPE_LABELS = { car: "Automóvel", rental: "Aluguer" };

  // Frase curta para a lista de atividade recente: "<admin> <frase>"
  const ACTION_LABELS = {
    "listing.approve": "aprovou o anúncio",
    "listing.reject": "rejeitou o anúncio",
    "listing.suspend": "suspendeu o anúncio",
    "listing.reactivate": "reativou o anúncio",
    "listing.edit": "editou o anúncio",
    "listing.delete": "apagou o anúncio",
    "listing.delete_failed": "tentou apagar o anúncio",
    "admin.login": "iniciou sessão no painel",
    "admin.login_failed": "falhou o início de sessão"
  };

  function actionLabel(action) {
    return ACTION_LABELS[action] || String(action || "realizou uma ação");
  }

  const api = {
    escapeHtml,
    isNumber,
    formatNumber,
    formatPercent,
    formatDateTime,
    formatTime,
    timeAgo,
    shortDay,
    initials,
    actionLabel,
    ROLE_LABELS,
    STATUS_LABELS,
    ACCOUNT_TYPE_LABELS,
    TYPE_LABELS
  };

  AM.format = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

})(typeof window !== "undefined" ? window : globalThis);
