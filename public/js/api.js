// ==========================================
// CLIENTE DA API
//
// - O token de administrador fica só em sessionStorage (desaparece ao
//   fechar o separador) e nunca é escrito em logs nem no endereço.
// - O endereço da API vem de window.ADMIN_CONFIG.API_URL (config.js).
// - Resposta 401 num pedido autenticado = sessão terminada: limpa a
//   sessão e leva o utilizador ao login.
// ==========================================
(function (root) {

  const AM = (root.AM = root.AM || {});

  const SESSION_KEY = "am_admin_session";

  class ApiError extends Error {
    constructor(status, message, fields) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.fields = fields || null;
    }
  }

  function createApi(deps) {

    const fetchFn = deps.fetch;
    const storage = deps.storage;
    const config = deps.config || {};
    const now = deps.now || (() => Date.now());
    const onUnauthorized = deps.onUnauthorized || function () {};

    function baseUrl() {
      return String(config.API_URL || "").replace(/\/+$/, "");
    }

    function getSession() {
      try {
        const raw = storage.getItem(SESSION_KEY);
        if (!raw) return null;

        const session = JSON.parse(raw);

        if (!session || typeof session.token !== "string" || !session.expiresAt || now() >= session.expiresAt) {
          storage.removeItem(SESSION_KEY);
          return null;
        }

        return session;
      } catch (error) {
        return null;
      }
    }

    function saveSession(data) {
      storage.setItem(SESSION_KEY, JSON.stringify({
        token: data.token,
        expiresAt: now() + Number(data.expires_in || 0) * 1000,
        admin: data.admin
      }));
    }

    function updateAdmin(admin) {
      const session = getSession();
      if (!session) return;
      session.admin = admin;
      storage.setItem(SESSION_KEY, JSON.stringify(session));
    }

    function clearSession() {
      try {
        storage.removeItem(SESSION_KEY);
      } catch (error) {
        // sem armazenamento: nada a limpar
      }
    }

    function buildUrl(path, query) {
      const pairs = [];

      Object.keys(query || {}).forEach((key) => {
        const value = query[key];
        if (value !== undefined && value !== null && value !== "") {
          pairs.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
        }
      });

      return baseUrl() + path + (pairs.length ? "?" + pairs.join("&") : "");
    }

    async function request(method, path, options) {

      const opts = options || {};
      const auth = opts.auth !== false;
      const session = auth ? getSession() : null;

      if (auth && !session) {
        onUnauthorized();
        throw new ApiError(401, "Sessão terminada. Inicia sessão novamente.");
      }

      const headers = { Accept: "application/json" };

      if (opts.body !== undefined) headers["Content-Type"] = "application/json";
      if (session) headers.Authorization = "Bearer " + session.token;

      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), opts.timeoutMs || 60000) : null;

      let response;

      try {
        response = await fetchFn(buildUrl(path, opts.query), {
          method,
          headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: controller ? controller.signal : undefined
        });
      } catch (error) {
        throw new ApiError(0, "Não foi possível contactar o servidor. Verifica a ligação e tenta de novo.");
      } finally {
        if (timer) clearTimeout(timer);
      }

      let data = null;

      try {
        data = await response.json();
      } catch (error) {
        data = null;
      }

      if (response.ok) return data;

      const message = data && typeof data.error === "string" ? data.error : "Erro " + response.status;

      if (response.status === 401 && auth) {
        clearSession();
        onUnauthorized();
      }

      throw new ApiError(response.status, message, data && data.fields);
    }

    async function login(email, password) {
      const data = await request("POST", "/admin/auth/login", {
        auth: false,
        body: { email, password }
      });

      saveSession(data);
      return data.admin;
    }

    // Pergunta ao servidor quem somos e que permissões temos (a verdade
    // está no servidor, não no que ficou guardado no browser).
    async function refreshAdmin() {
      const data = await request("GET", "/admin/me");
      updateAdmin(data.admin);
      return data.admin;
    }

    return {
      baseUrl,
      getSession,
      clearSession,
      request,
      get: (path, options) => request("GET", path, options),
      post: (path, body, options) => request("POST", path, Object.assign({}, options, { body })),
      patch: (path, body, options) => request("PATCH", path, Object.assign({}, options, { body })),
      del: (path, body, options) => request("DELETE", path, Object.assign({}, options, { body })),
      login,
      refreshAdmin
    };

  }

  const api = { createApi, ApiError, SESSION_KEY };

  AM.createApi = createApi;
  AM.ApiError = ApiError;

  // No browser, cria já o cliente que as páginas usam
  if (typeof window !== "undefined" && window.fetch && window.sessionStorage) {
    AM.api = createApi({
      fetch: window.fetch.bind(window),
      storage: window.sessionStorage,
      config: window.ADMIN_CONFIG,
      onUnauthorized: function () {
        if (/painel\.html$/.test(window.location.pathname)) {
          window.location.replace("index.html?expired=1");
        }
      }
    });
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api;

})(typeof window !== "undefined" ? window : globalThis);
