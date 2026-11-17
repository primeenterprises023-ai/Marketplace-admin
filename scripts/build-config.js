// Gera public/config.js a partir da variável de ambiente ADMIN_API_URL.
// Corre no deploy da Vercel (buildCommand em vercel.json). Se a variável
// não estiver definida, usa o endereço do backend em produção.
const fs = require("fs");
const path = require("path");

const DEFAULT_API = "https://automercado-backend.onrender.com/api";

const api = String(process.env.ADMIN_API_URL || DEFAULT_API).trim().replace(/\/+$/, "");

if (!/^https?:\/\/[A-Za-z0-9.-]+(:\d+)?(\/[A-Za-z0-9._~\/-]*)?$/.test(api)) {
  console.error("ADMIN_API_URL inválido: tem de começar por http:// ou https:// (recebido: " + api + ")");
  process.exit(1);
}

const target = path.join(__dirname, "..", "public", "config.js");

const content =
  "// Ficheiro gerado por scripts/build-config.js — não editar à mão no deploy.\n" +
  "window.ADMIN_CONFIG = " + JSON.stringify({ API_URL: api }) + ";\n";

fs.writeFileSync(target, content);

console.log("config.js gerado: API_URL = " + api);
