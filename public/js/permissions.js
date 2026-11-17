// ==========================================
// MENU E PERMISSÕES
//
// O menu só mostra o que a função do administrador pode usar. Isto é
// apenas conforto visual: quem decide é sempre o servidor, que volta a
// verificar a permissão em cada pedido.
//
// "ready": true  = a página já funciona com dados reais.
// "ready": false = a secção aparece no menu mas ainda mostra um aviso
//                  de que será ativada numa próxima fase.
// ==========================================
(function (root) {

  const AM = (root.AM = root.AM || {});

  const MENU = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard", permission: "dashboard:view", ready: true },
    { id: "listings", label: "Anúncios", icon: "list", permission: "listings:view", ready: false },
    { id: "cars", label: "Automóveis", icon: "car", permission: "listings:view", ready: false },
    { id: "rentals", label: "Alugueres", icon: "key", permission: "listings:view", ready: false },
    { id: "parts", label: "Peças", icon: "package", permission: "listings:view", ready: false,
      note: "O marketplace ainda não tem peças (não existe tabela de peças na base de dados)." },
    { id: "users", label: "Utilizadores", icon: "users", permission: "users:view", ready: false },
    { id: "plans", label: "Planos e subscrições", icon: "card", permission: "plans:view", ready: false },
    { id: "reports", label: "Denúncias", icon: "flag", permission: "reports:view", ready: false },
    { id: "analytics", label: "Relatórios", icon: "chart", permission: "analytics:view", ready: false },
    { id: "admins", label: "Administradores", icon: "shield", permission: "admins:manage", ready: false },
    { id: "activity", label: "Histórico de atividades", icon: "history", permission: "audit:view", ready: false },
    { id: "settings", label: "Configurações", icon: "sliders", permission: "settings:manage", ready: false }
  ].map((item) => Object.assign({ hash: "#/" + item.id }, item));

  function can(permissions, permission) {
    return Array.isArray(permissions) && permissions.includes(permission);
  }

  function visibleMenu(permissions) {
    return MENU.filter((item) => can(permissions, item.permission));
  }

  // "#/dashboard?days=7" -> item do menu (ou null)
  function routeFor(hash) {
    const id = String(hash || "").replace(/^#\/?/, "").split("?")[0].split("/")[0];
    return MENU.find((item) => item.id === id) || null;
  }

  // Parâmetros depois do "?" no hash: "#/listings?status=pending" -> { status: "pending" }
  function hashQuery(hash) {
    const index = String(hash || "").indexOf("?");
    const result = {};
    if (index === -1) return result;
    String(hash).slice(index + 1).split("&").forEach((pair) => {
      if (!pair) return;
      const [key, value = ""] = pair.split("=");
      try {
        result[decodeURIComponent(key)] = decodeURIComponent(value);
      } catch (error) {
        // parâmetro mal formado: ignora
      }
    });
    return result;
  }

  const api = { MENU, can, visibleMenu, routeFor, hashQuery };

  AM.permissions = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

})(typeof window !== "undefined" ? window : globalThis);
