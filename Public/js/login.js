// ==========================================
// PÁGINA DE LOGIN DO PAINEL
//
// Só serve para obter o token de administrador (/admin/auth/login). Quem
// não é administrador recebe a mesma mensagem de quem errou a password.
// ==========================================
(function (root) {

  const AM = (root.AM = root.AM || {});

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validate(email, password) {

    const errors = {};
    const cleanEmail = String(email || "").trim();

    if (!cleanEmail) {
      errors.email = "Indica o teu email.";
    } else if (!EMAIL_RE.test(cleanEmail)) {
      errors.email = "Este email não parece válido.";
    }

    if (!password) {
      errors.password = "Indica a tua password.";
    }

    return { ok: Object.keys(errors).length === 0, errors, email: cleanEmail };

  }

  function messageFor(error) {

    if (!error) return "Ocorreu um erro inesperado.";

    if (error.status === 0) return error.message;
    if (error.status === 401) return "Email ou password incorretos.";
    if (error.status === 429) return error.message || "Demasiadas tentativas. Aguarda uns minutos e tenta de novo.";
    if (error.status === 400) return error.message || "Dados inválidos.";
    if (error.status >= 500) return "O servidor teve um problema. Tenta de novo dentro de instantes.";

    return error.message || "Não foi possível iniciar sessão.";

  }

  function init(doc, deps) {

    const api = deps.api;
    const location = deps.location;

    const form = doc.getElementById("login-form");
    const emailInput = doc.getElementById("login-email");
    const passwordInput = doc.getElementById("login-password");
    const emailError = doc.getElementById("login-email-error");
    const passwordError = doc.getElementById("login-password-error");
    const message = doc.getElementById("login-message");
    const submit = doc.getElementById("login-submit");
    const toggle = doc.getElementById("login-toggle");
    const logo = doc.getElementById("login-logo");
    const wordmark = doc.getElementById("login-wordmark");

    // Se o ficheiro do logótipo não existir, mostra o nome em texto
    if (logo && wordmark) {
      logo.addEventListener("error", () => {
        logo.hidden = true;
        wordmark.hidden = false;
      });
    }

    function paintToggle(showing) {
      const iconSvg = AM.icons ? AM.icons.icon(showing ? "eyeOff" : "eye", { size: 18 }) : "";
      toggle.innerHTML = iconSvg + '<span class="sr-only">' + (showing ? "Esconder a password" : "Mostrar a password") + "</span>";
    }

    paintToggle(false);

    function showMessage(text, kind) {
      message.textContent = text;
      message.className = "notice notice--" + (kind === "info" ? "info" : "danger");
      message.hidden = false;
    }

    function clearErrors() {
      message.hidden = true;
      message.textContent = "";
      emailError.textContent = "";
      passwordError.textContent = "";
      emailInput.removeAttribute("aria-invalid");
      passwordInput.removeAttribute("aria-invalid");
    }

    function setBusy(busy) {
      submit.disabled = busy;
      submit.querySelector("span").textContent = busy ? "A entrar..." : "Entrar";
    }

    if (!api) {
      showMessage("O browser bloqueou o armazenamento da sessão. Ativa o armazenamento do site e recarrega a página.", "error");
      submit.disabled = true;
      return;
    }

    // Já há sessão válida: segue direto para o painel
    if (api.getSession()) {
      location.replace("painel.html");
      return;
    }

    if (new URLSearchParams(location.search).get("expired") === "1") {
      showMessage("A sessão terminou. Inicia sessão novamente.", "info");
    }

    toggle.addEventListener("click", () => {
      const showing = passwordInput.type === "text";
      passwordInput.type = showing ? "password" : "text";
      toggle.setAttribute("aria-label", showing ? "Mostrar password" : "Esconder password");
      toggle.setAttribute("aria-pressed", String(!showing));
      paintToggle(!showing);
    });

    form.addEventListener("submit", async (event) => {

      event.preventDefault();

      if (submit.disabled) return;

      clearErrors();

      const result = validate(emailInput.value, passwordInput.value);

      if (!result.ok) {
        if (result.errors.email) {
          emailError.textContent = result.errors.email;
          emailInput.setAttribute("aria-invalid", "true");
        }
        if (result.errors.password) {
          passwordError.textContent = result.errors.password;
          passwordInput.setAttribute("aria-invalid", "true");
        }
        (result.errors.email ? emailInput : passwordInput).focus();
        return;
      }

      setBusy(true);

      // Servidores gratuitos "adormecem": avisa se a resposta demorar
      const slowTimer = setTimeout(() => {
        showMessage("O servidor está a acordar e pode demorar até 1 minuto. Aguarda...", "info");
      }, 8000);

      try {

        await api.login(result.email, passwordInput.value);
        clearTimeout(slowTimer);
        location.replace("painel.html");

      } catch (error) {

        clearTimeout(slowTimer);
        passwordInput.value = "";
        showMessage(messageFor(error), "error");
        passwordInput.focus();
        setBusy(false);

      }

    });

  }

  const api = { validate, messageFor, init };

  AM.login = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document !== "undefined" && typeof window !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
      init(document, { api: AM.api, location: window.location });
    });
  }

})(typeof window !== "undefined" ? window : globalThis);
