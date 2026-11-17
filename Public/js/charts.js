// ==========================================
// GRÁFICOS
//
// Gráfico de linhas em SVG puro (sem bibliotecas externas) e barras de
// distribuição. As cores vêm de classes CSS (nada de estilos inline, por
// causa da política de segurança de conteúdo do painel). As larguras das
// barras vão em data-w e são aplicadas depois, por JavaScript.
// ==========================================
(function (root) {

  const AM = (root.AM = root.AM || {});
  const fmt = (root.AM && root.AM.format) || (typeof require !== "undefined" ? require("./format.js") : null);

  // Topo "redondo" do eixo vertical: múltiplo de 4, mínimo 4 (4 divisões)
  function axisTop(max) {
    return Math.max(4, Math.ceil(Math.max(0, max) / 4) * 4);
  }

  function round(n) {
    return Math.round(n * 10) / 10;
  }

  // series: [{ name, className, values: [..] }]; labels: ["2026-03-25", ...]
  function lineChartSvg(options) {

    const labels = options.labels || [];
    const series = options.series || [];
    const width = 640;
    const height = options.height || 240;
    const pad = { top: 16, right: 16, bottom: 28, left: 36 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const n = labels.length;

    const max = series.reduce((m, s) => Math.max(m, ...s.values.map((v) => Number(v) || 0)), 0);
    const top = axisTop(max);

    const x = (i) => pad.left + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
    const y = (v) => pad.top + innerH - (innerH * (Number(v) || 0)) / top;

    let svg = '<svg class="chart" viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="' +
      fmt.escapeHtml(options.ariaLabel || "Gráfico de crescimento") + '" preserveAspectRatio="xMidYMid meet">';

    // linhas de grelha e eixo vertical
    for (let step = 0; step <= 4; step++) {
      const value = (top / 4) * step;
      const gy = round(y(value));
      svg += '<line class="chart__grid" x1="' + pad.left + '" x2="' + (width - pad.right) + '" y1="' + gy + '" y2="' + gy + '"/>';
      svg += '<text class="chart__tick" x="' + (pad.left - 8) + '" y="' + (gy + 4) + '" text-anchor="end">' + fmt.formatNumber(value) + "</text>";
    }

    // eixo horizontal: no máximo 6 etiquetas, sempre com a primeira e a última
    if (n > 0) {
      const want = Math.min(6, n);
      const used = new Set();
      for (let k = 0; k < want; k++) {
        used.add(want === 1 ? 0 : Math.round((k * (n - 1)) / (want - 1)));
      }
      Array.from(used).sort((a, b) => a - b).forEach((i) => {
        svg += '<text class="chart__tick" x="' + round(x(i)) + '" y="' + (height - 8) + '" text-anchor="middle">' +
          fmt.escapeHtml(fmt.shortDay(labels[i])) + "</text>";
      });
    }

    // áreas, linhas e pontos de cada série
    series.forEach((s, si) => {
      const points = s.values.map((v, i) => [round(x(i)), round(y(v))]);
      if (points.length === 0) return;

      const line = points.map((p, i) => (i === 0 ? "M" : "L") + p[0] + " " + p[1]).join(" ");

      if (si === 0) {
        const baseline = round(y(0));
        svg += '<path class="chart__area ' + fmt.escapeHtml(s.className) + '" d="' + line +
          " L" + points[points.length - 1][0] + " " + baseline + " L" + points[0][0] + " " + baseline + ' Z"/>';
      }

      svg += '<path class="chart__line ' + fmt.escapeHtml(s.className) + '" d="' + line + '"/>';

      // pontos com dica (<title>) só quando são poucos, para não pesar
      if (n <= 31) {
        s.values.forEach((v, i) => {
          svg += '<circle class="chart__dot ' + fmt.escapeHtml(s.className) + '" cx="' + points[i][0] + '" cy="' + points[i][1] + '" r="3">' +
            "<title>" + fmt.escapeHtml(fmt.shortDay(labels[i]) + ": " + fmt.formatNumber(v) + " " + s.name.toLowerCase()) + "</title></circle>";
        });
      }
    });

    return svg + "</svg>";

  }

  // Barra empilhada: segments = [{ label, value, className }]. Devolve HTML;
  // cada segmento leva data-w (percentagem) para o JavaScript aplicar.
  function stackedBarHtml(segments) {

    const total = segments.reduce((sum, s) => sum + (Number(s.value) || 0), 0);

    if (total === 0) {
      return '<div class="stack stack--empty" role="img" aria-label="Sem dados"></div>';
    }

    const parts = segments
      .filter((s) => Number(s.value) > 0)
      .map((s) => '<span class="stack__part ' + fmt.escapeHtml(s.className) + '" data-w="' + round((Number(s.value) / total) * 100) +
        '" title="' + fmt.escapeHtml(s.label + ": " + fmt.formatNumber(s.value)) + '"></span>')
      .join("");

    const label = segments.map((s) => s.label + " " + fmt.formatNumber(s.value)).join(", ");

    return '<div class="stack" role="img" aria-label="' + fmt.escapeHtml(label) + '">' + parts + "</div>";

  }

  // Lista de barras horizontais: rows = [{ label, value }]; "of" = valor que
  // corresponde a 100 % (por omissão, o maior).
  function barListHtml(rows, of) {

    const max = of || rows.reduce((m, r) => Math.max(m, Number(r.value) || 0), 0);

    return '<ul class="bars">' + rows.map((r) => {
      const value = Number(r.value);
      const width = max > 0 && Number.isFinite(value) ? round((value / max) * 100) : 0;
      return '<li class="bars__row"><span class="bars__label">' + fmt.escapeHtml(r.label) + "</span>" +
        '<span class="bars__track"><span class="bars__fill" data-w="' + width + '"></span></span>' +
        '<span class="bars__value">' + fmt.formatNumber(r.value) + "</span></li>";
    }).join("") + "</ul>";

  }

  // Aplica as larguras (data-w) a todos os elementos dentro de "container"
  function applyWidths(container) {
    container.querySelectorAll("[data-w]").forEach((el) => {
      el.style.width = el.getAttribute("data-w") + "%";
    });
  }

  const api = { axisTop, lineChartSvg, stackedBarHtml, barListHtml, applyWidths };

  AM.charts = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

})(typeof window !== "undefined" ? window : globalThis);
