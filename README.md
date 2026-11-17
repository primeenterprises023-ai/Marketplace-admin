# Painel administrativo — AutoMercado Angola

Site estático (HTML, CSS e JavaScript simples, sem framework nem build complicado), pronto para a Vercel.
Fala com o backend em `https://automercado-backend.onrender.com/api`.

## O que já funciona
- Login exclusivo de administradores (sessão de 8 horas, só no separador do browser)
- Estrutura do painel: menu por função, notificações, perfil, terminar sessão, ecrã móvel
- Dashboard com números reais da base de dados
- As outras secções do menu aparecem com a etiqueta "Em breve" e são ligadas nas próximas fases

## Antes de publicar
1. Backend: corre as migrações SQL (A e B), coloca os ficheiros do pacote do backend e faz deploy na Render.
2. Logótipo: copia o `logo.png` do site para `public/assets/logo.png`. Sem ele, o painel mostra o nome em texto.

## Publicar na Vercel
1. Cria um repositório no GitHub com o conteúdo desta pasta.
2. Vercel > Add New > Project > importa o repositório. Framework Preset: **Other**
   (o `vercel.json` já define o comando de build e a pasta `public`).
3. Em Environment Variables cria `ADMIN_API_URL` = `https://automercado-backend.onrender.com/api`
   (se não criares, usa este mesmo endereço).
4. Deploy. Copia o endereço final (por exemplo `https://automercado-admin.vercel.app`).
5. Na Render, no serviço do backend > Environment, cria `ADMIN_ORIGINS` com esse endereço (sem barra no fim).
   A Render reinicia sozinha. Sem esta variável o painel não consegue falar com a API.
6. Abre o painel e inicia sessão com a conta de superadministrador.

## Ficheiros
- `public/index.html` — login
- `public/painel.html` — estrutura do painel (menu, barra superior, conteúdo)
- `public/config.js` — endereço da API (gerado no deploy a partir de `ADMIN_API_URL`)
- `public/css/admin.css` — estilos (azul e branco)
- `public/js/` — código do painel (`pages/dashboard.js` é o Dashboard)
- `vercel.json` — cabeçalhos de segurança (CSP, sem iframes, etc.) e comando de build
- `test/` — testes (`npm test`, precisa de Node 18 ou superior). Usam um DOM falso: não substituem abrir o painel num browser.

## Segurança em resumo
- O token fica só em `sessionStorage` e é enviado apenas à API.
- Tudo o que vem da API é escapado antes de aparecer no ecrã.
- Sem scripts nem estilos inline: a política de conteúdo (CSP) proíbe-os.
- O menu esconde o que a função não pode usar, mas quem decide é sempre o servidor.
