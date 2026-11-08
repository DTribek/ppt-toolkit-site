"use strict";
(() => {
  // src/charts/transform.ts
  var UNSORTABLE = /* @__PURE__ */ new Set(["line", "waterfall", "waterfallBar", "gantt", "scatter", "bubble", "table"]);
  function prepare(spec) {
    return sortCategories(groupOther(spec));
  }
  function sortCategories(spec) {
    const sort = spec.options.sort;
    if (!sort || sort === "none" || UNSORTABLE.has(spec.type) || spec.categories.length < 2) return spec;
    const totals = spec.categories.map((_, c) => spec.series.reduce((t, s) => t + (s.values[c] ?? 0), 0));
    const order = spec.categories.map((_, i) => i);
    order.sort((a, b) => (sort === "asc" ? totals[a] - totals[b] : totals[b] - totals[a]) || a - b);
    return {
      ...spec,
      categories: order.map((i) => spec.categories[i]),
      series: spec.series.map((s) => ({ ...s, values: order.map((i) => s.values[i] ?? null) }))
    };
  }
  function groupOther(spec) {
    const threshold = spec.options.otherBelow;
    if (!(threshold != null && threshold > 0)) return spec;
    const sum = (values) => values.reduce((t, v) => t + (v ?? 0), 0);
    if (spec.type === "pie" || spec.type === "doughnut") {
      const values = spec.series[0]?.values ?? [];
      const total2 = sum(values);
      if (!(total2 > 0)) return spec;
      const small2 = values.map((v, i) => (v ?? 0) / total2 * 100 < threshold ? i : -1).filter((i) => i >= 0);
      if (small2.length < 2) return spec;
      const keep = values.map((_, i) => i).filter((i) => !small2.includes(i));
      return {
        ...spec,
        categories: [...keep.map((i) => spec.categories[i]), "Other"],
        series: [{ ...spec.series[0], values: [...keep.map((i) => values[i]), sum(small2.map((i) => values[i]))] }]
      };
    }
    if (!["stacked", "percent", "bar", "percentBar", "mekko", "mekkoUnit"].includes(spec.type)) return spec;
    const total = sum(spec.series.flatMap((s) => s.values));
    if (!(total > 0)) return spec;
    const small = spec.series.filter((s) => sum(s.values) / total * 100 < threshold);
    if (small.length < 2) return spec;
    const other = {
      name: "Other",
      values: spec.categories.map((_, c) => small.reduce((t, s) => t + (s.values[c] ?? 0), 0))
    };
    const colors = spec.colors && spec.series.flatMap((s, i) => small.includes(s) ? [] : [spec.colors[i] ?? ""]);
    return { ...spec, series: [...spec.series.filter((s) => !small.includes(s)), other], ...colors ? { colors } : {} };
  }

  // src/charts/layout.ts
  var DEFAULT_STYLE = {
    palette: ["#1F4E79", "#2E75B6", "#9DC3E6", "#548235", "#A9D18E", "#C55A11", "#F4B183", "#7F7F7F"],
    positive: "#548235",
    negative: "#C00000",
    total: "#1F4E79",
    text: "#262626",
    axis: "#7F7F7F",
    font: ""
  };
  var PALETTE = DEFAULT_STYLE.palette;
  var GRID = "#E5E5E5";
  var FONT = 11;
  var LABEL_BAND = 18;
  var BRACKET_BAND = 30;
  var AXIS_WIDTH = 40;
  var theme = DEFAULT_STYLE;
  var numberFormat = {};
  var seriesColors = [];
  var UNIT_DIVISOR = { "": 1, k: 1e3, m: 1e6, bn: 1e9 };
  function formatNumber(value, suffix = "", format = numberFormat) {
    const unit = suffix === "%" ? "" : format.unit ?? "";
    const scaled = value / UNIT_DIVISOR[unit];
    const decimals = format.decimals ?? (Math.abs(scaled) >= 100 ? 0 : 1);
    const rounded = Math.round(scaled * 10 ** decimals) / 10 ** decimals;
    const text2 = rounded.toLocaleString("en-US", {
      minimumFractionDigits: format.decimals ?? 0,
      maximumFractionDigits: decimals
    });
    return `${text2 === "-0" ? "0" : text2}${unit}${suffix}`;
  }
  function textOn(fill2) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(fill2.slice(i, i + 2), 16));
    return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? theme.text : "#FFFFFF";
  }
  var colorOf = (series) => seriesColors[series] || theme.palette[series % theme.palette.length];
  var text = (box, value, extra = {}) => ({
    kind: "text",
    box,
    text: value,
    size: FONT,
    color: theme.text,
    align: "Center",
    valign: "Middle",
    ...extra
  });
  var hline = (x1, x2, y, color = theme.axis, weight = 0.75, dashed = false) => ({
    kind: "line",
    x1,
    y1: y,
    x2,
    y2: y,
    color,
    weight,
    dashed
  });
  function cagr(first, last, periods) {
    if (!(first > 0) || !(last > 0) || periods < 1) return void 0;
    return (last / first) ** (1 / periods) - 1;
  }
  function differenceLabel(first, last) {
    const delta = last - first;
    const sign = (v) => v >= 0 ? "+" : "";
    const relative = first > 0 ? ` (${sign(delta)}${formatNumber(delta / first * 100, "%")})` : "";
    return `${sign(delta)}${formatNumber(delta)}${relative}`;
  }
  function niceTicks(min, max, target = 5) {
    const range = max - min;
    if (!(range > 0)) return [min];
    const raw = range / target;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const norm = raw / magnitude;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * magnitude;
    const ticks = [];
    for (let t = Math.ceil(min / step) * step; t <= max + step * 1e-9; t += step) ticks.push(Math.round(t / step) * step);
    return ticks;
  }
  function valueMax(spec) {
    const s = prepare(spec);
    if (s.type === "waterfall" || s.type === "waterfallBar") {
      let running = 0;
      let max = 0;
      s.categories.forEach((_, i) => {
        if (!s.subtotals?.includes(i)) running += s.series[0]?.values[i] ?? 0;
        max = Math.max(max, running);
      });
      return max;
    }
    if (s.type === "clustered" || s.type === "clusteredBar" || s.type === "line") {
      return Math.max(0, ...s.series.flatMap((r) => r.values.map((v) => v ?? 0)));
    }
    return Math.max(0, ...s.categories.map((_, c) => s.series.reduce((t, r) => t + Math.max(0, r.values[c] ?? 0), 0)));
  }
  function layoutChart(input2, frame, now = Date.now()) {
    const spec = prepare(input2);
    theme = { ...DEFAULT_STYLE, ...spec.style, palette: spec.style?.palette?.length ? spec.style.palette : DEFAULT_STYLE.palette };
    numberFormat = { decimals: spec.options.decimals, unit: spec.options.unit };
    seriesColors = spec.colors ?? [];
    const prims = dispatch(spec, frame, now);
    if (!theme.font) return prims;
    return prims.map((p) => p.kind === "text" || p.kind === "bubble" || p.kind === "shape" ? { ...p, font: theme.font } : p);
  }
  function dispatch(spec, frame, now) {
    switch (spec.type) {
      case "waterfall":
        return layoutWaterfall(spec, frame);
      case "waterfallBar":
        return layoutWaterfallBar(spec, frame);
      case "gantt":
        return layoutGantt(spec.tasks ?? [], spec.options, frame, now);
      case "bar":
      case "clusteredBar":
      case "percentBar":
        return layoutBar(spec, frame);
      case "mekko":
      case "mekkoUnit":
        return layoutMekko(spec, frame);
      case "line":
        return layoutLine(spec, frame);
      case "pie":
      case "doughnut":
        return layoutPie(spec, frame);
      case "scatter":
      case "bubble":
        return layoutScatter(spec.points ?? [], spec.type === "bubble", frame);
      case "table":
        return layoutTable(spec, frame);
      default:
        return layoutColumns(spec, frame);
    }
  }
  function axisPrims(plot, min, max, y, suffix = "") {
    return niceTicks(min, max).flatMap((tick) => [
      hline(plot.left, plot.left + plot.width, y(tick), GRID, 0.5),
      // Clamped so the top and bottom labels stay inside the plot's vertical span.
      text({ left: plot.left - AXIS_WIDTH, top: Math.min(Math.max(y(tick) - 8, plot.top), plot.top + plot.height - 16), width: AXIS_WIDTH - 4, height: 16 }, formatNumber(tick, suffix), {
        align: "Right",
        size: FONT - 2
      })
    ]);
  }
  function comparePair(options, n) {
    const clamp = (v) => Math.max(0, Math.min(n - 1, Math.floor(v)));
    const from = clamp(options.compareFrom ?? 0);
    const to = clamp(options.compareTo ?? n - 1);
    return to > from ? [from, to] : void 0;
  }
  function layoutColumns(spec, frame) {
    const { categories, options } = spec;
    const combo = spec.type === "combo" && spec.series.length > 1;
    const series = combo ? spec.series.slice(0, -1) : spec.series;
    const lineSeries = combo ? spec.series[spec.series.length - 1] : void 0;
    const percent = spec.type === "percent";
    const clustered = spec.type === "clustered";
    const n = categories.length;
    const value = (s, c) => {
      const v = series[s].values[c] ?? 0;
      if (!percent) return v;
      const sum = series.reduce((t, row) => t + Math.max(0, row.values[c] ?? 0), 0);
      return sum > 0 ? Math.max(0, v) / sum * 100 : 0;
    };
    const totals = categories.map((_, c) => series.reduce((t, _s, s) => t + value(s, c), 0));
    const stackedTotals = !percent && !clustered;
    const showTotals = options.totals && stackedTotals;
    const brackets = [];
    const pair = comparePair(options, n);
    if (pair && stackedTotals) {
      const [from, to] = pair;
      const growth = options.cagr ? cagr(totals[from], totals[to], to - from) : void 0;
      if (growth !== void 0) brackets.push(`CAGR ${growth >= 0 ? "+" : ""}${formatNumber(growth * 100, "%")}`);
      if (options.difference) brackets.push(differenceLabel(totals[from], totals[to]));
    }
    const dataTable = !!options.dataTable;
    const tableHeight = dataTable ? LABEL_BAND * spec.series.length : 0;
    const legendWidth = options.legend && spec.series.length > 1 || dataTable ? 90 : 0;
    const axisWidth = options.axis ? AXIS_WIDTH : 0;
    const top = frame.top + (showTotals || clustered || combo ? LABEL_BAND : 0) + BRACKET_BAND * brackets.length;
    const plot = {
      left: frame.left + axisWidth,
      top,
      width: frame.width - legendWidth - axisWidth,
      height: frame.top + frame.height - LABEL_BAND - tableHeight - top
    };
    let max = 0;
    let min = 0;
    categories.forEach((_, c) => {
      if (clustered) {
        series.forEach((_s, s) => {
          max = Math.max(max, value(s, c));
          min = Math.min(min, value(s, c));
        });
      } else {
        let up = 0;
        let down = 0;
        series.forEach((_s, s) => value(s, c) >= 0 ? up += value(s, c) : down += value(s, c));
        max = Math.max(max, up);
        min = Math.min(min, down);
      }
      const lineValue = lineSeries?.values[c];
      if (lineValue != null) {
        max = Math.max(max, lineValue);
        min = Math.min(min, lineValue);
      }
    });
    if (options.valueLine != null) {
      max = Math.max(max, options.valueLine);
      min = Math.min(min, options.valueLine);
    }
    if (options.scaleMax != null && !percent) max = Math.max(max, options.scaleMax);
    const range = max - min || 1;
    const y = (v) => plot.top + plot.height - (v - min) / range * plot.height;
    const slot = plot.width / n;
    const barWidth = slot * (clustered ? 0.8 : 0.6);
    const prims = options.axis ? axisPrims(plot, min, max, y, percent ? "%" : "") : [];
    const lastSegments = [];
    categories.forEach((category, c) => {
      const slotLeft = plot.left + slot * c;
      let up = 0;
      let down = 0;
      series.forEach((row, s) => {
        const v = value(s, c);
        if (row.values[c] == null || v === 0 && !clustered) return;
        let from;
        let to;
        let left = slotLeft + (slot - barWidth) / 2;
        let width = barWidth;
        if (clustered) {
          width = barWidth / series.length;
          left += width * s;
          [from, to] = [0, v];
        } else if (v >= 0) {
          [from, to] = [up, up + v];
          up += v;
        } else {
          [from, to] = [down + v, down];
          down += v;
        }
        const box = { left, top: y(Math.max(from, to)), width, height: Math.abs(y(from) - y(to)) };
        const fill2 = colorOf(s);
        if (box.height > 0) prims.push({ kind: "rect", box, fill: fill2 });
        if (options.labels && !dataTable) {
          const label = percent ? formatNumber(v, "%") : formatNumber(row.values[c] ?? 0);
          if (clustered) {
            const above = v >= 0 ? box.top - LABEL_BAND : box.top + box.height;
            prims.push(text({ left: left - 10, top: above, width: width + 20, height: LABEL_BAND }, label, { size: FONT - 1 }));
          } else if (box.height >= FONT + 4) {
            prims.push(text(box, label, { color: textOn(fill2), size: FONT - 1 }));
          }
        }
        if (c === n - 1) lastSegments.push({ s, mid: box.top + box.height / 2 });
      });
      if (showTotals) {
        prims.push(
          text({ left: slotLeft, top: y(up) - LABEL_BAND, width: slot, height: LABEL_BAND }, formatNumber(totals[c]), { bold: true })
        );
      }
      prims.push(
        text({ left: slotLeft, top: plot.top + plot.height + 2, width: slot, height: LABEL_BAND - 2 }, category, { valign: "Top", wrap: true })
      );
    });
    prims.push(hline(plot.left, plot.left + plot.width, y(0)));
    if (lineSeries) {
      const color = colorOf(spec.series.length - 1);
      const points = lineSeries.values.map((v, c) => v == null ? void 0 : { x: plot.left + slot * (c + 0.5), y: y(v), v });
      points.forEach((p, c) => {
        const next = points[c + 1];
        if (p && next) prims.push({ kind: "line", x1: p.x, y1: p.y, x2: next.x, y2: next.y, color, weight: 2 });
      });
      for (const p of points) {
        if (!p) continue;
        prims.push({ kind: "ellipse", box: { left: p.x - 4, top: p.y - 4, width: 8, height: 8 }, fill: color, line: "#FFFFFF" });
        if (options.labels) prims.push(text({ left: p.x - 24, top: p.y - LABEL_BAND, width: 48, height: LABEL_BAND - 4 }, formatNumber(p.v), { size: FONT - 2, color }));
      }
      const last = [...points].reverse().find(Boolean);
      if (legendWidth && last) {
        prims.push(text({ left: plot.left + plot.width + 6, top: last.y - 9, width: legendWidth - 6, height: 18 }, lineSeries.name, { align: "Left", color }));
      }
    }
    if (options.valueLine != null) {
      const lineY = y(options.valueLine);
      prims.push(hline(plot.left, plot.left + plot.width, lineY, theme.negative, 1, true));
      prims.push(
        text({ left: plot.left + plot.width + 4, top: lineY - 9, width: Math.max(40, legendWidth - 4), height: 18 }, formatNumber(options.valueLine), {
          align: "Left",
          color: theme.negative,
          size: FONT - 1
        })
      );
    }
    if (dataTable) {
      const tableTop = plot.top + plot.height + LABEL_BAND;
      spec.series.forEach((row, s) => {
        const rowTop = tableTop + LABEL_BAND * s;
        categories.forEach((_, c) => {
          const v = row.values[c];
          if (v == null) return;
          const label = percent && s < series.length ? formatNumber(value(s, c), "%") : formatNumber(v);
          prims.push(text({ left: plot.left + slot * c, top: rowTop, width: slot, height: LABEL_BAND }, label, { size: FONT - 1 }));
        });
        prims.push(text({ left: plot.left + plot.width + 6, top: rowTop, width: legendWidth - 6, height: LABEL_BAND }, row.name, { align: "Left", size: FONT - 1 }));
      });
    } else if (legendWidth) {
      const x = plot.left + plot.width - (slot - barWidth) / 2 + 6;
      for (const { s, mid } of lastSegments) {
        prims.push(text({ left: x, top: mid - 9, width: legendWidth - 6, height: 18 }, series[s].name, { align: "Left" }));
      }
    }
    if (pair) {
      const [from, to] = pair;
      const firstX = plot.left + slot * (from + 0.5);
      const lastX = plot.left + slot * (to + 0.5);
      brackets.forEach((label, i) => {
        const lineY = frame.top + BRACKET_BAND * i + BRACKET_BAND / 2;
        const tickEnd = (total) => Math.max(lineY, y(Math.max(0, total)) - (showTotals ? LABEL_BAND : 0) - 2);
        prims.push(hline(firstX, lastX, lineY));
        prims.push({ kind: "line", x1: firstX, y1: lineY, x2: firstX, y2: tickEnd(totals[from]), color: theme.axis, weight: 0.75 });
        prims.push({ kind: "line", x1: lastX, y1: lineY, x2: lastX, y2: tickEnd(totals[to]), color: theme.axis, weight: 0.75 });
        const width = Math.min(130, Math.max(72, label.length * 6.5));
        prims.push({
          kind: "bubble",
          box: { left: (firstX + lastX) / 2 - width / 2, top: lineY - 10, width, height: 20 },
          text: label,
          size: FONT - 1,
          fill: "#FFFFFF",
          color: theme.text
        });
      });
    }
    return prims;
  }
  function layoutBar(spec, frame) {
    const { categories, series, options } = spec;
    const percent = spec.type === "percentBar";
    const clustered = spec.type === "clusteredBar";
    const value = (s, c) => {
      const v = Math.max(0, series[s].values[c] ?? 0);
      if (!percent) return v;
      const sum = series.reduce((t, row) => t + Math.max(0, row.values[c] ?? 0), 0);
      return sum > 0 ? v / sum * 100 : 0;
    };
    const showLegend = options.legend && series.length > 1;
    const labelWidth = Math.min(120, frame.width * 0.25);
    const totalWidth = options.totals && !percent ? 48 : 0;
    const plot = {
      left: frame.left + labelWidth,
      top: frame.top + (showLegend ? LABEL_BAND : 0),
      width: frame.width - labelWidth - totalWidth,
      height: frame.height - (showLegend ? LABEL_BAND : 0)
    };
    const sums = categories.map((_, c) => series.reduce((t, _s, s) => t + value(s, c), 0));
    const largest = clustered ? Math.max(...series.flatMap((_, s) => categories.map((_c, c) => value(s, c)))) : Math.max(...sums);
    const max = percent ? 100 : Math.max(largest, options.scaleMax ?? 0) || 1;
    const slot = plot.height / categories.length;
    const barHeight = slot * (clustered ? 0.8 : 0.6);
    const prims = [];
    categories.forEach((category, c) => {
      const top = plot.top + slot * c + (slot - barHeight) / 2;
      prims.push(text({ left: frame.left, top, width: labelWidth - 6, height: barHeight }, category, { align: "Right" }));
      let x = plot.left;
      series.forEach((_row, s) => {
        const v = value(s, c);
        const width = v / max * plot.width;
        if (width <= 0) return;
        const height = clustered ? barHeight / series.length : barHeight;
        const box = { left: clustered ? plot.left : x, top: clustered ? top + height * s : top, width, height };
        const fill2 = colorOf(s);
        prims.push({ kind: "rect", box, fill: fill2 });
        if (options.labels) {
          const label = formatNumber(v, percent ? "%" : "");
          if (clustered) prims.push(text({ left: box.left + width + 3, top: box.top, width: 48, height }, label, { align: "Left", size: FONT - 1 }));
          else if (width >= 24) prims.push(text(box, label, { color: textOn(fill2), size: FONT - 1 }));
        }
        if (!clustered) x += width;
      });
      if (options.totals && !percent && !clustered) {
        prims.push(text({ left: x + 4, top, width: totalWidth, height: barHeight }, formatNumber(sums[c]), { align: "Left", bold: true }));
      }
    });
    prims.push({ kind: "line", x1: plot.left, y1: plot.top, x2: plot.left, y2: plot.top + plot.height, color: theme.axis, weight: 0.75 });
    if (showLegend) {
      const width = plot.width / series.length;
      series.forEach((row, s) => {
        const left = plot.left + width * s;
        prims.push({ kind: "rect", box: { left, top: frame.top + 4, width: 10, height: 10 }, fill: colorOf(s) });
        prims.push(text({ left: left + 14, top: frame.top, width: width - 14, height: LABEL_BAND }, row.name, { align: "Left" }));
      });
    }
    return prims;
  }
  function waterfallSteps(spec) {
    const values = spec.series[0]?.values ?? [];
    const subtotals = new Set(spec.subtotals ?? []);
    let running = 0;
    return spec.categories.map((_, i) => {
      if (subtotals.has(i)) return { from: 0, to: running, kind: "total" };
      const v = values[i] ?? 0;
      const step = { from: running, to: running + v, kind: i === 0 ? "total" : v >= 0 ? "up" : "down" };
      running += v;
      return step;
    });
  }
  var stepFill = (step) => step.kind === "total" ? theme.total : step.kind === "up" ? theme.positive : theme.negative;
  var stepLabel = (step) => {
    const delta = step.to - step.from;
    return step.kind === "total" ? formatNumber(step.to) : `${delta >= 0 ? "+" : ""}${formatNumber(delta)}`;
  };
  function layoutWaterfall(spec, frame) {
    const { categories, options } = spec;
    const steps = waterfallSteps(spec);
    const levels = steps.flatMap((b) => [b.from, b.to]);
    const max = Math.max(0, options.scaleMax ?? 0, ...levels);
    const min = Math.min(0, ...levels);
    const axisWidth = options.axis ? AXIS_WIDTH : 0;
    const plot = {
      left: frame.left + axisWidth,
      top: frame.top + LABEL_BAND,
      width: frame.width - axisWidth,
      height: frame.height - LABEL_BAND * 2
    };
    const y = (v) => plot.top + plot.height - (v - min) / (max - min || 1) * plot.height;
    const slot = plot.width / categories.length;
    const barWidth = slot * 0.6;
    const prims = options.axis ? axisPrims(plot, min, max, y) : [];
    steps.forEach((step, i) => {
      const left = plot.left + slot * i + (slot - barWidth) / 2;
      const top = y(Math.max(step.from, step.to));
      const box = { left, top, width: barWidth, height: Math.abs(y(step.from) - y(step.to)) };
      if (box.height > 0) prims.push({ kind: "rect", box, fill: stepFill(step) });
      if (options.labels) {
        prims.push(text({ left: left - 10, top: top - LABEL_BAND, width: barWidth + 20, height: LABEL_BAND }, stepLabel(step), { size: FONT - 1 }));
      }
      if (steps[i + 1]) {
        prims.push(hline(left + barWidth, plot.left + slot * (i + 1) + (slot - barWidth) / 2, y(step.to), theme.axis, 0.5, true));
      }
      prims.push(
        text({ left: plot.left + slot * i, top: plot.top + plot.height + 2, width: slot, height: LABEL_BAND - 2 }, categories[i], {
          valign: "Top",
          wrap: true
        })
      );
    });
    prims.push(hline(plot.left, plot.left + plot.width, y(0)));
    return prims;
  }
  function layoutWaterfallBar(spec, frame) {
    const { categories, options } = spec;
    const steps = waterfallSteps(spec);
    const levels = steps.flatMap((b) => [b.from, b.to]);
    const max = Math.max(0, options.scaleMax ?? 0, ...levels);
    const min = Math.min(0, ...levels);
    const labelWidth = Math.min(120, frame.width * 0.25);
    const valueWidth = options.labels ? 48 : 0;
    const plot = { left: frame.left + labelWidth, top: frame.top, width: frame.width - labelWidth - valueWidth, height: frame.height };
    const x = (v) => plot.left + (v - min) / (max - min || 1) * plot.width;
    const slot = plot.height / categories.length;
    const barHeight = slot * 0.6;
    const prims = [];
    steps.forEach((step, i) => {
      const top = plot.top + slot * i + (slot - barHeight) / 2;
      const left = x(Math.min(step.from, step.to));
      const width = Math.abs(x(step.to) - x(step.from));
      if (width > 0) prims.push({ kind: "rect", box: { left, top, width, height: barHeight }, fill: stepFill(step) });
      prims.push(text({ left: frame.left, top, width: labelWidth - 6, height: barHeight }, categories[i], { align: "Right" }));
      if (options.labels) {
        prims.push(text({ left: Math.max(x(step.from), x(step.to)) + 4, top, width: valueWidth - 4, height: barHeight }, stepLabel(step), { align: "Left", size: FONT - 1 }));
      }
      if (steps[i + 1]) {
        const level = x(step.to);
        prims.push({ kind: "line", x1: level, y1: top + barHeight, x2: level, y2: top + slot, color: theme.axis, weight: 0.5, dashed: true });
      }
    });
    prims.push({ kind: "line", x1: x(0), y1: plot.top, x2: x(0), y2: plot.top + plot.height, color: theme.axis, weight: 0.75 });
    return prims;
  }
  var DAY = 864e5;
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var time = (iso) => Date.parse(`${iso}T00:00:00Z`);
  function ganttTicks(start, end, scale) {
    const ticks = [];
    const d = new Date(start);
    if (scale === "week") {
      d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
      for (; d.getTime() < end; d.setUTCDate(d.getUTCDate() + 7)) {
        ticks.push({ at: d.getTime(), label: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` });
      }
      return ticks;
    }
    const months = scale === "quarter" ? 3 : 1;
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - d.getUTCMonth() % months);
    for (; d.getTime() < end; d.setUTCMonth(d.getUTCMonth() + months)) {
      const year = String(d.getUTCFullYear()).slice(2);
      const label = scale === "quarter" ? `Q${d.getUTCMonth() / 3 + 1} ${year}` : `${MONTHS[d.getUTCMonth()]} ${year}`;
      ticks.push({ at: d.getTime(), label });
    }
    return ticks;
  }
  function layoutGantt(all, options, frame, now) {
    if (!all.length) return [];
    const tasks = all.filter((t) => !t.kind);
    const shades = all.filter((t) => t.kind === "shade");
    const brackets = all.filter((t) => t.kind === "bracket");
    const scale = options.ganttScale ?? "month";
    const starts = all.map((t) => time(t.start));
    const ends = all.map((t) => (t.end ? time(t.end) : time(t.start)) + DAY);
    const ticks = ganttTicks(Math.min(...starts), Math.max(...ends), scale);
    const scaleStart = ticks[0].at;
    const scaleEnd = Math.max(...ends);
    const lastTick = ticks[ticks.length - 1].at;
    const periodEnd = scale === "week" ? lastTick + 7 * DAY : Date.UTC(new Date(lastTick).getUTCFullYear(), new Date(lastTick).getUTCMonth() + (scale === "quarter" ? 3 : 1), 1);
    const end = Math.max(scaleEnd, periodEnd);
    const hasOwner = tasks.some((t) => t.owner);
    const hasRemark = tasks.some((t) => t.remark);
    const nameWidth = Math.min(150, frame.width * 0.22);
    const ownerWidth = hasOwner ? Math.min(80, frame.width * 0.1) : 0;
    const remarkWidth = hasRemark ? Math.min(140, frame.width * 0.18) : 0;
    const header = 22;
    const bracketBand = brackets.length ? 24 : 0;
    const plot = {
      left: frame.left + nameWidth + ownerWidth,
      top: frame.top + header + bracketBand,
      width: frame.width - nameWidth - ownerWidth - remarkWidth,
      height: frame.height - header - bracketBand
    };
    const x = (t) => plot.left + (t - scaleStart) / (end - scaleStart) * plot.width;
    const row = tasks.length ? Math.min(28, plot.height / tasks.length) : 28;
    const bottom2 = plot.top + row * tasks.length;
    const prims = [];
    for (const shade of shades) {
      const left = x(time(shade.start));
      prims.push({ kind: "rect", box: { left, top: plot.top, width: Math.max(1, x(time(shade.end ?? shade.start) + DAY) - left), height: bottom2 - plot.top }, fill: "#F2F2F2" });
      prims.push(text({ left, top: bottom2 + 2, width: 120, height: 16 }, shade.name, { align: "Left", size: FONT - 2, color: theme.axis }));
    }
    ticks.forEach((tick, i) => {
      prims.push({ kind: "line", x1: x(tick.at), y1: frame.top, x2: x(tick.at), y2: bottom2, color: "#D9D9D9", weight: 0.5 });
      const next = ticks[i + 1]?.at ?? end;
      prims.push(text({ left: x(tick.at), top: frame.top, width: x(next) - x(tick.at), height: header }, tick.label, { size: FONT - 1 }));
    });
    if (hasOwner) prims.push(text({ left: frame.left + nameWidth, top: frame.top, width: ownerWidth, height: header }, "Owner", { size: FONT - 1, bold: true, align: "Left" }));
    if (hasRemark) prims.push(text({ left: plot.left + plot.width + 8, top: frame.top, width: remarkWidth - 8, height: header }, "Remarks", { size: FONT - 1, bold: true, align: "Left" }));
    brackets.forEach((bracket) => {
      const left = x(time(bracket.start));
      const right2 = x(time(bracket.end ?? bracket.start) + DAY);
      const lineY = frame.top + header + bracketBand - 6;
      prims.push(hline(left, right2, lineY));
      prims.push({ kind: "line", x1: left, y1: lineY, x2: left, y2: lineY + 5, color: theme.axis, weight: 0.75 });
      prims.push({ kind: "line", x1: right2, y1: lineY, x2: right2, y2: lineY + 5, color: theme.axis, weight: 0.75 });
      prims.push(text({ left, top: frame.top + header, width: right2 - left, height: bracketBand - 8 }, bracket.name, { size: FONT - 1 }));
    });
    tasks.forEach((task, i) => {
      const top = plot.top + row * i;
      if (i % 2 === 1) prims.push({ kind: "rect", box: { left: frame.left, top, width: frame.width, height: row }, fill: "#FAFAFA" });
      prims.push(text({ left: frame.left, top, width: nameWidth - 8, height: row }, task.name, { align: "Left" }));
      if (task.owner) prims.push(text({ left: frame.left + nameWidth, top, width: ownerWidth - 4, height: row }, task.owner, { align: "Left", size: FONT - 1 }));
      if (task.remark) prims.push(text({ left: plot.left + plot.width + 8, top, width: remarkWidth - 8, height: row }, task.remark, { align: "Left", size: FONT - 1, wrap: true }));
      const start = time(task.start);
      if (task.end) {
        const left = x(start);
        prims.push({ kind: "rect", box: { left, top: top + row * 0.2, width: Math.max(2, x(time(task.end) + DAY) - left), height: row * 0.6 }, fill: colorOf(0) });
      } else {
        const size = row * 0.6;
        prims.push({ kind: "diamond", box: { left: x(start + DAY / 2) - size / 2, top: top + row * 0.2, width: size, height: size }, fill: theme.negative });
      }
    });
    if (options.today && now >= scaleStart && now <= end) {
      prims.push({ kind: "line", x1: x(now), y1: frame.top + header, x2: x(now), y2: bottom2, color: theme.negative, weight: 1.25, dashed: true });
    }
    return prims;
  }
  function layoutMekko(spec, frame) {
    const { categories, series, options } = spec;
    const unit = spec.type === "mekkoUnit";
    const totals = categories.map((_, c) => series.reduce((t, s) => t + Math.max(0, s.values[c] ?? 0), 0));
    const grand = totals.reduce((a, b) => a + b, 0) || 1;
    const tallest = Math.max(...totals, options.scaleMax ?? 0) || 1;
    const legendWidth = options.legend && series.length > 1 ? 90 : 0;
    const plot = {
      left: frame.left,
      top: frame.top + (options.totals ? LABEL_BAND : 0),
      width: frame.width - legendWidth,
      height: frame.height - LABEL_BAND - (options.totals ? LABEL_BAND : 0)
    };
    const prims = [];
    let x = plot.left;
    categories.forEach((category, c) => {
      const width = totals[c] / grand * plot.width;
      const columnHeight = unit ? totals[c] / tallest * plot.height : plot.height;
      let y = plot.top + plot.height;
      series.forEach((row, s) => {
        const v = Math.max(0, row.values[c] ?? 0);
        const height = totals[c] > 0 ? v / totals[c] * columnHeight : 0;
        if (height <= 0) return;
        y -= height;
        const fill2 = colorOf(s);
        const box = { left: x, top: y, width, height };
        prims.push({ kind: "rect", box, fill: fill2 });
        if (options.labels && height >= FONT + 4 && width >= 28) {
          const label = unit ? formatNumber(v) : formatNumber(v / totals[c] * 100, "%");
          prims.push(text(box, label, { color: textOn(fill2), size: FONT - 1 }));
        }
        if (legendWidth && c === categories.length - 1) {
          prims.push(text({ left: x + width + 6, top: y + height / 2 - 9, width: legendWidth - 6, height: 18 }, row.name, { align: "Left" }));
        }
      });
      if (options.totals) {
        const top = unit ? plot.top + plot.height - columnHeight - LABEL_BAND : frame.top;
        prims.push(text({ left: x, top, width, height: LABEL_BAND }, formatNumber(totals[c]), { bold: true, size: FONT - 1 }));
      }
      prims.push(text({ left: x, top: plot.top + plot.height + 2, width, height: LABEL_BAND - 2 }, category, { valign: "Top", wrap: true }));
      if (c > 0) prims.push({ kind: "line", x1: x, y1: plot.top, x2: x, y2: plot.top + plot.height, color: "#FFFFFF", weight: 1.5 });
      x += width;
    });
    return prims;
  }
  function layoutLine(spec, frame) {
    const { categories, series, options } = spec;
    const values = series.flatMap((s) => s.values.filter((v) => v != null));
    if (options.valueLine != null) values.push(options.valueLine);
    const max = Math.max(0, options.scaleMax ?? 0, ...values);
    const min = Math.min(0, ...values);
    const legendWidth = options.legend ? 90 : 0;
    const axisWidth = options.axis ? AXIS_WIDTH : 0;
    const plot = {
      left: frame.left + axisWidth,
      top: frame.top + LABEL_BAND,
      width: frame.width - legendWidth - axisWidth,
      height: frame.height - LABEL_BAND * 2
    };
    const slot = plot.width / categories.length;
    const x = (c) => plot.left + slot * (c + 0.5);
    const y = (v) => plot.top + plot.height - (v - min) / (max - min || 1) * plot.height;
    const prims = options.axis ? axisPrims(plot, min, max, y) : [];
    prims.push(hline(plot.left, plot.left + plot.width, y(0)));
    categories.forEach(
      (category, c) => prims.push(text({ left: plot.left + slot * c, top: plot.top + plot.height + 2, width: slot, height: LABEL_BAND - 2 }, category, { valign: "Top", wrap: true }))
    );
    if (options.valueLine != null) prims.push(hline(plot.left, plot.left + plot.width, y(options.valueLine), theme.negative, 1, true));
    series.forEach((row, s) => {
      const color = colorOf(s);
      const points = row.values.map((v, c) => v == null ? void 0 : { x: x(c), y: y(v), v });
      points.forEach((p, c) => {
        const next = points[c + 1];
        if (p && next) prims.push({ kind: "line", x1: p.x, y1: p.y, x2: next.x, y2: next.y, color, weight: 2 });
      });
      points.forEach((p) => {
        if (!p) return;
        prims.push({ kind: "ellipse", box: { left: p.x - 3.5, top: p.y - 3.5, width: 7, height: 7 }, fill: color });
        if (options.labels) {
          prims.push(text({ left: p.x - 24, top: p.y - LABEL_BAND, width: 48, height: LABEL_BAND }, formatNumber(p.v), { size: FONT - 2 }));
        }
      });
      const last = [...points].reverse().find(Boolean);
      if (legendWidth && last) {
        prims.push(text({ left: plot.left + plot.width + 6, top: last.y - 9, width: legendWidth - 6, height: 18 }, row.name, { align: "Left", color }));
      }
    });
    return prims;
  }
  function layoutPie(spec, frame) {
    const { categories, options } = spec;
    const values = (spec.series[0]?.values ?? []).map((v) => Math.max(0, v ?? 0));
    const total = values.reduce((a, b) => a + b, 0);
    if (!total) return [];
    const labelled = options.labels || options.legend;
    const diameter = Math.max(10, Math.min(frame.width - (labelled ? 2 * (34 + 40) : 0), frame.height - (labelled ? 2 * (34 + 14) : 0)));
    const cx = frame.left + frame.width / 2;
    const cy = frame.top + frame.height / 2;
    const box = { left: cx - diameter / 2, top: cy - diameter / 2, width: diameter, height: diameter };
    const prims = [];
    let angle = 0;
    values.forEach((v, i) => {
      if (v <= 0) return;
      const sweep = v / total * 360;
      const fill2 = colorOf(i);
      prims.push(sweep >= 359.99 ? { kind: "ellipse", box, fill: fill2 } : { kind: "pie", box, start: angle, end: angle + sweep, fill: fill2 });
      if (labelled) {
        const mid = (angle + sweep / 2 - 90) * Math.PI / 180;
        const r = diameter / 2 + 34;
        const parts = [options.legend ? categories[i] : "", options.labels ? formatNumber(v / total * 100, "%") : ""].filter(Boolean);
        prims.push(
          text({ left: cx + r * Math.cos(mid) - 40, top: cy + r * Math.sin(mid) - 14, width: 80, height: 28 }, parts.join("\n"), { size: FONT - 1, wrap: true })
        );
      }
      angle += sweep;
    });
    if (spec.type === "doughnut") {
      const hole = diameter * 0.55;
      prims.push({ kind: "ellipse", box: { left: cx - hole / 2, top: cy - hole / 2, width: hole, height: hole }, fill: "#FFFFFF" });
      if (options.totals) prims.push(text({ left: cx - hole / 2, top: cy - 12, width: hole, height: 24 }, formatNumber(total), { bold: true }));
    }
    return prims;
  }
  function layoutScatter(points, bubble, frame) {
    if (!points.length) return [];
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const pad = (lo, hi) => {
      const span = hi - lo || Math.abs(hi) || 1;
      return [Math.min(0, lo - span * 0.1), hi + span * 0.1];
    };
    const [x0, x1] = pad(Math.min(...xs), Math.max(...xs));
    const [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
    const axisLabel = 30;
    const plot = { left: frame.left + axisLabel, top: frame.top, width: frame.width - axisLabel, height: frame.height - LABEL_BAND };
    const maxSize = Math.max(...points.map((p) => p.size ?? 0)) || 1;
    const maxDiameter = Math.min(plot.width, plot.height) * 0.18;
    const inset = (bubble ? maxDiameter : 8) / 2;
    const px = (v) => plot.left + inset + (v - x0) / (x1 - x0) * (plot.width - 2 * inset);
    const py = (v) => plot.top + inset + (1 - (v - y0) / (y1 - y0)) * (plot.height - 2 * inset);
    const prims = [
      hline(plot.left, plot.left + plot.width, plot.top + plot.height),
      { kind: "line", x1: plot.left, y1: plot.top, x2: plot.left, y2: plot.top + plot.height, color: theme.axis, weight: 0.75 },
      text({ left: frame.left, top: plot.top + plot.height - 9, width: axisLabel - 4, height: 18 }, formatNumber(y0), { align: "Right", size: FONT - 2 }),
      text({ left: frame.left, top: plot.top, width: axisLabel - 4, height: 18 }, formatNumber(y1), { align: "Right", size: FONT - 2 }),
      text({ left: plot.left - 20, top: plot.top + plot.height + 2, width: 40, height: LABEL_BAND - 2 }, formatNumber(x0), { size: FONT - 2 }),
      text({ left: plot.left + plot.width - 40, top: plot.top + plot.height + 2, width: 40, height: LABEL_BAND - 2 }, formatNumber(x1), { align: "Right", size: FONT - 2 })
    ];
    points.forEach((p, i) => {
      const d = bubble ? Math.max(6, maxDiameter * Math.sqrt((p.size ?? 0) / maxSize)) : 8;
      const fill2 = bubble ? colorOf(i) : colorOf(0);
      prims.push({ kind: "ellipse", box: { left: px(p.x) - d / 2, top: py(p.y) - d / 2, width: d, height: d }, fill: fill2 });
      if (p.name) {
        const fitsRight = px(p.x) + d / 2 + 83 <= frame.left + frame.width;
        const left = fitsRight ? px(p.x) + d / 2 + 3 : px(p.x) - d / 2 - 83;
        prims.push(text({ left, top: py(p.y) - 9, width: 80, height: 18 }, p.name, { align: fitsRight ? "Left" : "Right", size: FONT - 1 }));
      }
    });
    return prims;
  }
  function layoutTable(spec, frame) {
    const { categories, series, options } = spec;
    const rows2 = series.length + 1 + (options.totals ? 1 : 0);
    const rowHeight = Math.min(28, frame.height / rows2);
    const nameWidth = Math.min(160, frame.width * 0.3);
    const cell = (frame.width - nameWidth) / categories.length;
    const prims = [];
    const cellBox = (r, c) => ({
      left: c < 0 ? frame.left + 6 : frame.left + nameWidth + cell * c,
      top: frame.top + rowHeight * r,
      width: c < 0 ? nameWidth - 6 : cell - 6,
      height: rowHeight
    });
    prims.push({ kind: "rect", box: { left: frame.left, top: frame.top, width: frame.width, height: rowHeight }, fill: theme.total });
    categories.forEach((category, c) => prims.push(text(cellBox(0, c), category, { align: "Right", bold: true, color: "#FFFFFF" })));
    series.forEach((row, s) => {
      const r = s + 1;
      if (s % 2 === 1) prims.push({ kind: "rect", box: { left: frame.left, top: frame.top + rowHeight * r, width: frame.width, height: rowHeight }, fill: "#F2F2F2" });
      prims.push(text(cellBox(r, -1), row.name, { align: "Left" }));
      row.values.forEach((v, c) => {
        if (v != null) prims.push(text(cellBox(r, c), formatNumber(v), { align: "Right" }));
      });
    });
    if (options.totals) {
      const r = series.length + 1;
      prims.push(hline(frame.left, frame.left + frame.width, frame.top + rowHeight * r, theme.text, 1));
      prims.push(text(cellBox(r, -1), "Total", { align: "Left", bold: true }));
      categories.forEach((_, c) => {
        const sum = series.reduce((t, row) => t + (row.values[c] ?? 0), 0);
        prims.push(text(cellBox(r, c), formatNumber(sum), { align: "Right", bold: true }));
      });
    }
    return prims;
  }

  // src/charts/parse.ts
  var DEFAULT_OPTIONS = { labels: true, totals: true, cagr: false, legend: true };
  var rows = (text2) => text2.split(/\r?\n/).map((line) => line.split(line.includes("	") ? "	" : line.includes(";") ? ";" : ",").map((cell) => cell.trim())).filter((cells) => cells.some((c) => c !== ""));
  function parseNumber(cell) {
    if (cell == null) return null;
    const negative = /^\(.*\)$/.test(cell);
    const cleaned = cell.replace(/[()%\s]/g, "").replace(/(\d),(?=\d{3}\b)/g, "$1");
    if (cleaned === "" || !/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(cleaned)) return null;
    const value = Number(cleaned);
    return negative ? -value : value;
  }
  var DataError = class extends Error {
  };
  function parseData(type, text2, options = DEFAULT_OPTIONS) {
    const table = rows(text2);
    if (type === "gantt") return { v: 1, type, categories: [], series: [], tasks: parseTasks(table), options };
    if (type === "scatter" || type === "bubble") {
      return { v: 1, type, categories: [], series: [], points: parsePoints(table, type === "bubble"), options };
    }
    if (table.length < 2) throw new DataError("Enter a header row of categories and at least one row of values.");
    const categories = table[0].slice(1);
    if (!categories.length) throw new DataError("The first row needs at least one category after the first cell.");
    const subtotals = [];
    const isWaterfall = type === "waterfall" || type === "waterfallBar";
    const series = table.slice(1).map((cells, r) => ({
      name: cells[0] || `Series ${r + 1}`,
      values: categories.map((_, i) => {
        const cell = cells[i + 1];
        if (isWaterfall && cell?.toLowerCase() === "e") {
          subtotals.push(i);
          return null;
        }
        return parseNumber(cell);
      })
    }));
    if (isWaterfall) {
      return { v: 1, type, categories, series: series.slice(0, 1), subtotals, options };
    }
    if (type === "pie" || type === "doughnut") {
      if (series[0].values.some((v) => v != null && v < 0)) throw new DataError("Pie slices can't be negative.");
      return { v: 1, type, categories, series: series.slice(0, 1), options };
    }
    return { v: 1, type, categories, series, options };
  }
  function parsePoints(table, bubble) {
    const points = table.flatMap(([name, x, y, size]) => {
      const [px, py, ps] = [parseNumber(x), parseNumber(y), parseNumber(size)];
      if (px == null || py == null) return [];
      if (bubble && !(ps != null && ps > 0)) return [];
      return [{ name: name ?? "", x: px, y: py, ...bubble ? { size: ps } : {} }];
    });
    if (!points.length) {
      throw new DataError(bubble ? "Enter one point per row: name, x, y, size (above 0)." : "Enter one point per row: name, x, y.");
    }
    return points;
  }
  function parseTasks(table) {
    const isDate = (cell) => !!cell && /^\d{4}-\d{2}-\d{2}$/.test(cell) && !isNaN(Date.parse(cell));
    const body = table.filter((cells) => isDate(cells[1]));
    if (!body.length) throw new DataError("Enter one task per row: name, start (YYYY-MM-DD), end (YYYY-MM-DD).");
    return body.map(([rawName = "", start, end, owner, remark]) => {
      const prefix = /^(shade|bracket):\s*/i.exec(rawName);
      const name = prefix ? rawName.slice(prefix[0].length) : rawName;
      if (isDate(end) && Date.parse(end) < Date.parse(start)) throw new DataError(`"${name}" ends before it starts.`);
      return {
        name: name || (prefix ? "" : "Task"),
        start,
        ...isDate(end) ? { end } : {},
        ...owner ? { owner } : {},
        ...remark ? { remark } : {},
        ...prefix ? { kind: prefix[1].toLowerCase() } : {}
      };
    });
  }
  function specToText(spec) {
    if (spec.points) {
      return spec.points.map((p) => [p.name, p.x, p.y, ...p.size != null ? [p.size] : []].join("	")).join("\n");
    }
    if (spec.type === "gantt") {
      return (spec.tasks ?? []).map((t) => {
        const cells = [(t.kind ? `${t.kind}: ` : "") + t.name, t.start, t.end ?? "", t.owner ?? "", t.remark ?? ""];
        while (cells.length > 2 && cells[cells.length - 1] === "") cells.pop();
        return cells.join("	");
      }).join("\n");
    }
    const header = ["", ...spec.categories].join("	");
    const body = spec.series.map(
      (s) => [s.name, ...s.values.map((v, i) => spec.subtotals?.includes(i) ? "e" : v ?? "")].join("	")
    );
    return [header, ...body].join("\n");
  }
  var SAMPLES = {
    stacked: "	2022	2023	2024	2025\nProduct A	40	45	52	60\nProduct B	25	30	28	35\nProduct C	10	12	18	22",
    clustered: "	Q1	Q2	Q3	Q4\nPlan	50	55	60	70\nActual	48	58	57	74",
    percent: "	North	South	East	West\nOnline	40	25	55	30\nRetail	45	50	30	50\nPartner	15	25	15	20",
    bar: "	Germany	France	Italy	Spain\nRevenue	120	95	70	55\nServices	30	25	20	15",
    mekko: "	US	Europe	Asia	Other\nLeader	120	60	80	20\nChallenger	60	50	30	15\nOthers	40	30	60	25",
    line: "	Jan	Feb	Mar	Apr	May	Jun\nRevenue	40	42	47	45	52	58\nCosts	30	31	33	36	35	37",
    pie: "	Online	Retail	Partner	Other\nShare	45	30	15	10",
    doughnut: "	Online	Retail	Partner	Other\nShare	45	30	15	10",
    scatter: "Alpha	10	20\nBeta	25	35\nGamma	40	15\nDelta	55	50",
    bubble: "Alpha	10	20	30\nBeta	25	35	80\nGamma	40	15	20\nDelta	55	50	50",
    waterfall: "	2024	Price	Volume	Costs	FX	2025\nProfit	100	25	15	-30	-5	e",
    combo: "	2022	2023	2024	2025\nHardware	40	45	50	52\nSoftware	20	28	35	45\nMargin %	12	15	18	21",
    clusteredBar: "	Germany	France	Italy	Spain\n2024	120	95	70	55\n2025	130	90	78	60",
    percentBar: "	Germany	France	Italy	Spain\nOnline	40	25	55	30\nRetail	45	50	30	50\nPartner	15	25	15	20",
    mekkoUnit: "	US	Europe	Asia	Other\nLeader	120	60	80	20\nChallenger	60	50	30	15\nOthers	40	30	60	25",
    waterfallBar: "	2024	Price	Volume	Costs	FX	2025\nProfit	100	25	15	-30	-5	e",
    table: "	2023	2024	2025\nRevenue	120	135	150\nEBIT	18	21	26\nHeadcount	410	430	455",
    gantt: "Research	2026-01-05	2026-02-20\nDesign	2026-02-01	2026-04-15\nBuild	2026-03-15	2026-07-31	IT	Critical path\nLaunch	2026-08-03\nshade: Summer break	2026-07-01	2026-08-31\nbracket: Phase 1	2026-01-05	2026-04-15"
  };

  // src/charts/render.ts
  var CHART_TAG = "PPTTOOLKIT_CHART";
  var CHART_NAME = "PPT Toolkit Chart";
  var toDegrees = (radians) => radians * 180 / Math.PI;
  function addLine(shapes, p) {
    const dx = p.x2 - p.x1;
    const dy = p.y2 - p.y1;
    let shape;
    if (Math.abs(dx) < 0.01 || Math.abs(dy) < 0.01) {
      shape = shapes.addLine("Straight", { left: Math.min(p.x1, p.x2), top: Math.min(p.y1, p.y2), width: Math.abs(dx), height: Math.abs(dy) });
    } else {
      const length = Math.hypot(dx, dy);
      const cx = (p.x1 + p.x2) / 2;
      const cy = (p.y1 + p.y2) / 2;
      shape = shapes.addLine("Straight", { left: cx - length / 2, top: cy, width: length, height: 0 });
      shape.rotation = (toDegrees(Math.atan2(dy, dx)) + 360) % 360;
    }
    shape.lineFormat.color = p.color;
    shape.lineFormat.weight = p.weight;
    if (p.dashed) shape.lineFormat.dashStyle = "Dash";
    return shape;
  }
  function addText(shapes, p) {
    const shape = p.kind === "bubble" ? shapes.addGeometricShape("RoundRectangle", p.box) : shapes.addTextBox(p.text, p.box);
    if (p.kind === "bubble") {
      shape.textFrame.textRange.text = p.text;
      shape.fill.setSolidColor(p.fill);
      shape.lineFormat.color = "#7F7F7F";
      shape.lineFormat.weight = 0.75;
    }
    const frame = shape.textFrame;
    frame.autoSizeSetting = "AutoSizeNone";
    frame.wordWrap = p.kind === "text" ? !!p.wrap : false;
    frame.leftMargin = frame.rightMargin = frame.topMargin = frame.bottomMargin = 0;
    frame.verticalAlignment = p.kind === "text" ? p.valign : "Middle";
    const range = frame.textRange;
    range.font.size = p.size;
    range.font.color = p.color;
    if (p.font) range.font.name = p.font;
    if (p.kind === "text" && p.bold) range.font.bold = true;
    range.paragraphFormat.horizontalAlignment = p.kind === "text" ? p.align : "Center";
    return shape;
  }
  function addPrimitive(shapes, p) {
    switch (p.kind) {
      case "line":
        return addLine(shapes, p);
      case "text":
      case "bubble":
        return addText(shapes, p);
      case "pie": {
        const shape = shapes.addGeometricShape("Pie", p.box);
        shape.adjustments.set(0, (p.start - 90 + 360) % 360);
        shape.adjustments.set(1, (p.end - 90 + 360) % 360);
        shape.fill.setSolidColor(p.fill);
        shape.lineFormat.color = "#FFFFFF";
        shape.lineFormat.weight = 1;
        return shape;
      }
      case "ellipse": {
        const shape = shapes.addGeometricShape("Ellipse", p.box);
        if (p.fill) shape.fill.setSolidColor(p.fill);
        else shape.fill.clear();
        if (p.line) shape.lineFormat.color = p.line;
        else shape.lineFormat.visible = false;
        return shape;
      }
      case "shape": {
        const shape = shapes.addGeometricShape(p.geometry, p.box);
        shape.fill.setSolidColor(p.fill);
        shape.lineFormat.visible = false;
        if (p.text) {
          const range = shape.textFrame.textRange;
          range.text = p.text;
          range.font.size = p.size ?? 12;
          range.font.color = p.color ?? "#FFFFFF";
          if (p.font) range.font.name = p.font;
          range.paragraphFormat.horizontalAlignment = "Center";
          shape.textFrame.verticalAlignment = "Middle";
        }
        return shape;
      }
      default: {
        const shape = shapes.addGeometricShape(p.kind === "rect" ? "Rectangle" : "Diamond", p.box);
        shape.fill.setSolidColor(p.fill);
        shape.lineFormat.visible = false;
        return shape;
      }
    }
  }
  async function drawGroup(context, slide, prims, name, tag) {
    const shapes = prims.map((p) => addPrimitive(slide.shapes, p));
    await context.sync();
    if (shapes.length === 1) {
      shapes[0].name = name;
      await context.sync();
      return shapes[0];
    }
    const group = slide.shapes.addGroup(shapes);
    group.name = name;
    if (tag) group.tags.add(tag.key, tag.value);
    await context.sync();
    return group;
  }
  async function drawChart(context, slide, spec, frame) {
    const prims = layoutChart(spec, frame);
    if (prims.length < 2) throw new Error("Not enough data to draw a chart.");
    return drawGroup(context, slide, prims, CHART_NAME, { key: CHART_TAG, value: JSON.stringify(spec) });
  }
  async function selectedCharts(context) {
    const selection = context.presentation.getSelectedShapes();
    selection.load("items/type,items/id,items/left,items/top,items/width,items/height");
    await context.sync();
    const groups = selection.items.filter((s) => s.type === "Group");
    const tags = groups.map((g) => {
      const tag = g.tags.getItemOrNullObject(CHART_TAG);
      tag.load("value");
      return tag;
    });
    await context.sync();
    return groups.flatMap((group, i) => {
      if (tags[i].isNullObject) return [];
      try {
        return [{ group, spec: JSON.parse(tags[i].value) }];
      } catch {
        return [];
      }
    });
  }
  async function selectedChart(context) {
    return (await selectedCharts(context))[0];
  }

  // src/elements.ts
  var DARK = "#1F4E79";
  function harveyBall(quarters, box) {
    const level = Math.max(0, Math.min(4, Math.round(quarters)));
    const outline = { kind: "ellipse", box, fill: level === 4 ? DARK : "#FFFFFF", line: DARK };
    if (level === 0 || level === 4) return [outline];
    return [outline, { kind: "pie", box, start: 0, end: level * 90, fill: DARK }];
  }
  var SYMBOLS = { check: "\u2611", cross: "\u2612", empty: "\u2610" };
  function checkbox(state, box) {
    return [
      { kind: "text", box, text: SYMBOLS[state], size: Math.round(box.height * 0.9), color: DARK, align: "Center", valign: "Middle" }
    ];
  }
  function processFlow(steps, frame) {
    if (!steps.length) return [];
    const notch = Math.min(frame.height * 0.4, 24);
    const gap = 4;
    const width = (frame.width + (steps.length - 1) * (notch - gap)) / steps.length;
    return steps.map((step, i) => ({
      kind: "shape",
      geometry: i === 0 ? "HomePlate" : "Chevron",
      box: { left: frame.left + i * (width - notch + gap), top: frame.top, width, height: frame.height },
      fill: i % 2 === 0 ? DARK : "#2E75B6",
      text: step,
      size: 12,
      color: "#FFFFFF"
    }));
  }
  function agenda(items, current, frame, pages = []) {
    const row = Math.min(40, frame.height / Math.max(1, items.length));
    const prims = [];
    items.forEach((item, i) => {
      const top = frame.top + row * i;
      const active = i === current;
      if (active) prims.push({ kind: "rect", box: { left: frame.left, top: top + 4, width: 6, height: row - 8 }, fill: DARK });
      prims.push({
        kind: "text",
        box: { left: frame.left + 18, top, width: frame.width - 18 - (pages[i] != null ? 64 : 0), height: row },
        text: `${i + 1}   ${item}`,
        size: 18,
        color: active || current < 0 ? "#262626" : "#A6A6A6",
        align: "Left",
        valign: "Middle",
        bold: active
      });
      if (pages[i] != null) {
        prims.push({
          kind: "text",
          box: { left: frame.left + frame.width - 60, top, width: 60, height: row },
          text: String(pages[i]),
          size: 14,
          color: "#A6A6A6",
          align: "Right",
          valign: "Middle"
        });
      }
    });
    return prims;
  }
  function decimalSwaps(text2) {
    const swaps = [];
    for (const match of text2.matchAll(/\d[\d.,]*\d/g)) {
      [...match[0]].forEach((char, offset) => {
        if (char === "." || char === ",") swaps.push({ index: match.index + offset, char: char === "." ? "," : "." });
      });
    }
    return swaps;
  }

  // src/office.ts
  var TEXT_TYPES = /* @__PURE__ */ new Set(["GeometricShape", "TextBox", "Placeholder", "Callout"]);
  var FILL_TYPES = /* @__PURE__ */ new Set(["GeometricShape", "TextBox", "Placeholder", "Callout", "Freeform"]);
  var LINE_TYPES = /* @__PURE__ */ new Set([...FILL_TYPES, "Line", "Image"]);
  function debugLog(entry) {
    void fetch("/debug", { method: "POST", body: JSON.stringify(entry) }).catch(() => {
    });
  }
  var snapshot = (items) => items.map(({ name, left, top, width, height }) => ({ name, left, top, width, height }));
  async function readSlideSize(context) {
    if (!Office.context.requirements.isSetSupported("PowerPointApi", "1.10")) return void 0;
    const setup = context.presentation.pageSetup;
    setup.load("slideWidth,slideHeight");
    await context.sync();
    return { width: setup.slideWidth, height: setup.slideHeight };
  }
  async function applyToSelection(id, action) {
    return PowerPoint.run(async (context) => {
      const shapes = context.presentation.getSelectedShapes();
      shapes.load("items/name,items/left,items/top,items/width,items/height");
      await context.sync();
      const slide = await readSlideSize(context);
      const before = snapshot(shapes.items);
      const patches = action(before, slide);
      patches.forEach((patch, i) => Object.assign(shapes.items[i], patch));
      await context.sync();
      shapes.load("items/left,items/top,items/width,items/height");
      await context.sync();
      debugLog({ id, slide, before, patches, after: snapshot(shapes.items) });
      return patches.length;
    });
  }
  async function forEachShape(context, shapes, edit) {
    let changed = 0;
    let failed = 0;
    for (const shape of shapes) {
      try {
        await edit(shape);
        await context.sync();
        changed++;
      } catch (error) {
        console.warn(`Skipped shape ${shape.id}`, error);
        failed++;
      }
    }
    return { changed, failed };
  }

  // src/selftest.ts
  var firstSlideId;
  async function newSlide(context) {
    context.presentation.slides.add();
    await context.sync();
    const slides = context.presentation.slides;
    slides.load("items/id");
    await context.sync();
    const slide = slides.items[slides.items.length - 1];
    firstSlideId ?? (firstSlideId = slide.id);
    return slide;
  }
  async function attempt(results, name, run) {
    try {
      results.push({ name, ok: true, detail: await run() });
    } catch (error) {
      const debug = error.debugInfo;
      results.push({ name, ok: false, detail: { error: String(error), debug } });
    }
  }
  async function runSelfTest(progress) {
    const results = [];
    const requirements = Object.fromEntries(
      ["1.4", "1.5", "1.8", "1.9", "1.10"].map((v) => [v, Office.context.requirements.isSetSupported("PowerPointApi", v)])
    );
    results.push({ name: "requirements", ok: true, detail: { requirements, platform: Office.context.platform, version: Office.context.diagnostics?.version } });
    await PowerPoint.run(async (context) => {
      const size = await readSlideSize(context) ?? { width: 960, height: 540 };
      const frame = { left: size.width * 0.08, top: size.height * 0.15, width: size.width * 0.84, height: size.height * 0.75 };
      for (const type of Object.keys(SAMPLES)) {
        progress(`Drawing ${type} chart\u2026`);
        await attempt(results, `chart:${type}`, async () => {
          const slide = await newSlide(context);
          const options = { labels: true, totals: true, legend: true, cagr: type === "stacked", difference: type === "stacked", dataTable: false, valueLine: type === "line" ? 50 : null };
          const group = await drawChart(context, slide, parseData(type, SAMPLES[type], options), frame);
          group.load("left,top,width,height");
          await context.sync();
          return { left: group.left, top: group.top, width: group.width, height: group.height };
        });
      }
      progress("Checking pie angles, line rotation and corner radius\u2026");
      await attempt(results, "probe:shapes", async () => {
        const slide = await newSlide(context);
        const pie = slide.shapes.addGeometricShape("Pie", { left: 50, top: 50, width: 100, height: 100 });
        pie.adjustments.load("count");
        const rounded = slide.shapes.addGeometricShape("RoundRectangle", { left: 200, top: 50, width: 200, height: 100 });
        rounded.adjustments.load("count");
        const line = slide.shapes.addLine("Straight", { left: 450, top: 100, width: 100, height: 0 });
        await context.sync();
        const defaults = [pie.adjustments.get(0), pie.adjustments.get(1), rounded.adjustments.get(0)];
        await context.sync();
        pie.adjustments.set(0, 270);
        pie.adjustments.set(1, 0);
        rounded.adjustments.set(0, 0.1);
        line.rotation = 45;
        await context.sync();
        const after = [pie.adjustments.get(0), pie.adjustments.get(1), rounded.adjustments.get(0)];
        line.load("rotation,left,top,width,height");
        await context.sync();
        return {
          pieCount: pie.adjustments.count,
          roundedCount: rounded.adjustments.count,
          defaults: defaults.map((d) => d.value),
          after: after.map((d) => d.value),
          line: { rotation: line.rotation, left: line.left, top: line.top, width: line.width, height: line.height }
        };
      });
      progress("Drawing elements\u2026");
      await attempt(results, "elements", async () => {
        const slide = await newSlide(context);
        for (let q = 0; q <= 4; q++) await drawGroup(context, slide, harveyBall(q, { left: 60 + q * 40, top: 60, width: 24, height: 24 }), `Harvey ${q}`);
        await drawGroup(context, slide, checkbox("check", { left: 300, top: 60, width: 24, height: 24 }), "Checkbox");
        await drawGroup(context, slide, processFlow(["Analyze", "Design", "Build", "Launch"], { left: 60, top: 140, width: 640, height: 56 }), "Flow");
        await drawGroup(context, slide, agenda(["Situation", "Options", "Next steps"], 1, { left: 60, top: 240, width: 500, height: 150 }), "Agenda");
        return "drawn";
      });
    });
    debugLog({ id: "selftest", results });
    if (firstSlideId) {
      const id = firstSlideId;
      firstSlideId = void 0;
      await PowerPoint.run(async (context) => {
        context.presentation.setSelectedSlides([id]);
        await context.sync();
      }).catch(() => {
      });
    }
    return results;
  }

  // src/check.ts
  var EPSILON = 0.05;
  function dominantFont(slides) {
    const counts = /* @__PURE__ */ new Map();
    for (const shape of slides.flatMap((s) => s.shapes)) {
      if (shape.hasText && shape.fontName) counts.set(shape.fontName, (counts.get(shape.fontName) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }
  function checkPresentation(slides, options = {}) {
    const { slideSize, minFontSize = 12, nearMiss = 2 } = options;
    const mainFont = dominantFont(slides);
    const issues = [];
    for (const slide of slides) {
      const report = (shape, message) => issues.push({ slideId: slide.id, slideNumber: slide.number, shapeId: shape.id, message });
      slide.shapes.forEach((shape, i) => {
        if (slideSize) {
          const off = shape.left < -EPSILON || shape.top < -EPSILON || shape.left + shape.width > slideSize.width + EPSILON || shape.top + shape.height > slideSize.height + EPSILON;
          if (off) report(shape, `"${shape.name}" runs off the slide`);
        }
        if (shape.hasText === false && (shape.type === "TextBox" || shape.type === "Placeholder")) {
          report(shape, `"${shape.name}" is empty`);
        }
        if (shape.hasText && shape.fontSize != null && shape.fontSize < minFontSize) {
          report(shape, `"${shape.name}" uses small text (${shape.fontSize}pt)`);
        }
        if (shape.hasText && shape.fontName && mainFont && shape.fontName !== mainFont) {
          report(shape, `"${shape.name}" uses ${shape.fontName}, deck mostly uses ${mainFont}`);
        }
        for (const other of slide.shapes.slice(i + 1)) {
          for (const edge of ["left", "top"]) {
            const gap = Math.abs(shape[edge] - other[edge]);
            if (gap > EPSILON && gap <= nearMiss) {
              report(shape, `"${shape.name}" and "${other.name}" are ${gap.toFixed(1)}pt out of ${edge} alignment`);
            }
          }
        }
      });
    }
    return issues;
  }

  // src/geometry.ts
  var NUDGE = 2;
  var X = { start: "left", size: "width" };
  var Y = { start: "top", size: "height" };
  var axisOf = (direction) => direction === "left" || direction === "right" ? X : Y;
  var master = (boxes) => boxes[boxes.length - 1];
  var right = (b) => b.left + b.width;
  var bottom = (b) => b.top + b.height;
  var slideBox = (slide) => ({ left: 0, top: 0, ...slide });
  function reference(boxes, slide) {
    if (boxes.length > 1) return master(boxes);
    if (boxes.length === 1 && slide) return slideBox(slide);
    return void 0;
  }
  function ordered(boxes, axis) {
    return boxes.map((_, i) => i).sort((a, b) => boxes[a][axis.start] - boxes[b][axis.start]);
  }
  function againstReference(edit) {
    return (boxes, slide) => {
      const ref = reference(boxes, slide);
      if (!ref) return [];
      const targets = boxes.length > 1 ? boxes.slice(0, -1) : boxes;
      const patches = targets.map((box) => edit(box, ref) ?? {});
      return boxes.length > 1 ? [...patches, {}] : patches;
    };
  }
  function align(axis, fraction) {
    return againstReference((box, ref) => ({
      [axis.start]: ref[axis.start] + (ref[axis.size] - box[axis.size]) * fraction
    }));
  }
  var goldenCanon = align(Y, 1 / 3);
  function centerOnCorner(vertical, horizontal) {
    return againstReference((box, ref) => ({
      left: (horizontal === "left" ? ref.left : right(ref)) - box.width / 2,
      top: (vertical === "top" ? ref.top : bottom(ref)) - box.height / 2
    }));
  }
  function dock(direction) {
    const axis = axisOf(direction);
    const forward = direction === "left" || direction === "up";
    return (boxes, slide) => {
      if (boxes.length === 1) {
        if (!slide) return [];
        const end = forward ? 0 : slide[axis.size] - boxes[0][axis.size];
        return [{ [axis.start]: end }];
      }
      if (boxes.length < 2) return [];
      const m = master(boxes);
      const patches = boxes.map(() => ({}));
      const others = ordered(boxes, axis).filter((i) => i !== boxes.length - 1);
      if (forward) {
        let cursor = m[axis.start] + m[axis.size];
        for (const i of others) {
          patches[i] = { [axis.start]: cursor };
          cursor += boxes[i][axis.size];
        }
      } else {
        let cursor = m[axis.start];
        for (const i of others.reverse()) {
          cursor -= boxes[i][axis.size];
          patches[i] = { [axis.start]: cursor };
        }
      }
      return patches;
    };
  }
  function distribute(axis) {
    return (boxes) => {
      if (boxes.length < 3) return [];
      const order = ordered(boxes, axis);
      const first = boxes[order[0]];
      const last = boxes[order[order.length - 1]];
      const span = last[axis.start] + last[axis.size] - first[axis.start];
      const used = boxes.reduce((sum, b) => sum + b[axis.size], 0);
      const gap = (span - used) / (boxes.length - 1);
      const patches = boxes.map(() => ({}));
      let cursor = first[axis.start];
      for (const i of order) {
        patches[i] = { [axis.start]: cursor };
        cursor += boxes[i][axis.size] + gap;
      }
      return patches;
    };
  }
  function nudgeGaps(axis, delta) {
    return (boxes) => {
      if (boxes.length < 2) return [];
      const patches = boxes.map(() => ({}));
      ordered(boxes, axis).forEach((i, rank) => {
        patches[i] = { [axis.start]: boxes[i][axis.start] + rank * delta };
      });
      return patches;
    };
  }
  function matrix(columns, gap = 0) {
    return (boxes) => {
      if (boxes.length < 2 || !(columns >= 1)) return [];
      const cols = Math.min(Math.floor(columns), boxes.length);
      const rows2 = Math.ceil(boxes.length / cols);
      const colWidths = Array.from({ length: cols }, () => 0);
      const rowHeights = Array.from({ length: rows2 }, () => 0);
      boxes.forEach((b, i) => {
        colWidths[i % cols] = Math.max(colWidths[i % cols], b.width);
        rowHeights[Math.floor(i / cols)] = Math.max(rowHeights[Math.floor(i / cols)], b.height);
      });
      const offset = (sizes, n) => sizes.slice(0, n).reduce((sum, s) => sum + s + gap, 0);
      return boxes.map((_, i) => ({
        left: boxes[0].left + offset(colWidths, i % cols),
        top: boxes[0].top + offset(rowHeights, Math.floor(i / cols))
      }));
    };
  }
  function stack(horizontal, gap = 0) {
    return (boxes, slide) => matrix(horizontal ? boxes.length : 1, gap)(boxes, slide);
  }
  function swap(axes, centered) {
    return (boxes) => {
      if (boxes.length < 2) return [];
      return boxes.map((box, i) => {
        const target = boxes[(i + 1) % boxes.length];
        const patch = {};
        if (axes !== "vertical") {
          patch.left = centered ? target.left + (target.width - box.width) / 2 : target.left;
        }
        if (axes !== "horizontal") {
          patch.top = centered ? target.top + (target.height - box.height) / 2 : target.top;
        }
        return patch;
      });
    };
  }
  var arrangeCircular = (boxes) => {
    if (boxes.length < 3) return [];
    const minLeft = Math.min(...boxes.map((b) => b.left));
    const minTop = Math.min(...boxes.map((b) => b.top));
    const spanWidth = Math.max(...boxes.map(right)) - minLeft;
    const spanHeight = Math.max(...boxes.map(bottom)) - minTop;
    const largest = Math.max(...boxes.map((b) => Math.max(b.width, b.height)));
    const radius = Math.max(Math.min(spanWidth, spanHeight) / 2 - largest / 2, largest * boxes.length / (2 * Math.PI));
    const cx = minLeft + spanWidth / 2;
    const cy = minTop + spanHeight / 2;
    return boxes.map((b, i) => {
      const angle = -Math.PI / 2 + 2 * Math.PI * i / boxes.length;
      return { left: cx + radius * Math.cos(angle) - b.width / 2, top: cy + radius * Math.sin(angle) - b.height / 2 };
    });
  };
  function matchSize(...keys) {
    return (boxes) => {
      if (boxes.length < 2) return [];
      return boxes.map(() => Object.fromEntries(keys.map((k) => [k, master(boxes)[k]])));
    };
  }
  function nudgeSize(key, delta) {
    return (boxes) => boxes.map((b) => ({ [key]: Math.max(1, b[key] + delta) }));
  }
  function moveEdge(direction, edgeOf) {
    const axis = axisOf(direction);
    const startSide = direction === "left" || direction === "up";
    return againstReference((box, ref) => {
      const edge = edgeOf(ref);
      const end = box[axis.start] + box[axis.size];
      const size = startSide ? end - edge : edge - box[axis.start];
      if (!(size > 0)) return void 0;
      return startSide ? { [axis.start]: edge, [axis.size]: size } : { [axis.size]: size };
    });
  }
  var near = { left: (r) => r.left, right, up: (r) => r.top, down: bottom };
  var far = { left: right, right: (r) => r.left, up: bottom, down: (r) => r.top };
  var stretch = (direction) => moveEdge(direction, near[direction]);
  function fill(direction) {
    return (boxes, slide) => (
      // Alone, there is no gap to close, so fill reaches the slide edge just like stretch.
      moveEdge(direction, boxes.length > 1 ? far[direction] : near[direction])(boxes, slide)
    );
  }
  function scaleGroup(factor) {
    return (boxes) => {
      if (boxes.length === 0 || !(factor > 0)) return [];
      const originLeft = Math.min(...boxes.map((b) => b.left));
      const originTop = Math.min(...boxes.map((b) => b.top));
      return boxes.map((b) => ({
        left: originLeft + (b.left - originLeft) * factor,
        top: originTop + (b.top - originTop) * factor,
        width: b.width * factor,
        height: b.height * factor
      }));
    };
  }
  var footprintWidth = (boxes) => boxes.length ? Math.max(...boxes.map(right)) - Math.min(...boxes.map((b) => b.left)) : 0;
  var actions = {
    alignLeft: align(X, 0),
    alignCenter: align(X, 0.5),
    alignRight: align(X, 1),
    alignTop: align(Y, 0),
    alignMiddle: align(Y, 0.5),
    alignBottom: align(Y, 1),
    goldenCanon,
    cornerTopLeft: centerOnCorner("top", "left"),
    cornerTopRight: centerOnCorner("top", "right"),
    cornerBottomLeft: centerOnCorner("bottom", "left"),
    cornerBottomRight: centerOnCorner("bottom", "right"),
    dockLeft: dock("left"),
    dockRight: dock("right"),
    dockUp: dock("up"),
    dockDown: dock("down"),
    distributeHorizontal: distribute(X),
    distributeVertical: distribute(Y),
    gapWiderH: nudgeGaps(X, NUDGE),
    gapNarrowerH: nudgeGaps(X, -NUDGE),
    gapTallerV: nudgeGaps(Y, NUDGE),
    gapShorterV: nudgeGaps(Y, -NUDGE),
    stackHorizontal: stack(true),
    stackVertical: stack(false),
    swap: swap("both", false),
    swapHorizontal: swap("horizontal", false),
    swapVertical: swap("vertical", false),
    swapCentered: swap("both", true),
    swapHorizontalCentered: swap("horizontal", true),
    swapVerticalCentered: swap("vertical", true),
    arrangeCircular,
    sameWidth: matchSize("width"),
    sameHeight: matchSize("height"),
    sameSize: matchSize("width", "height"),
    widthUp: nudgeSize("width", NUDGE),
    widthDown: nudgeSize("width", -NUDGE),
    heightUp: nudgeSize("height", NUDGE),
    heightDown: nudgeSize("height", -NUDGE),
    stretchLeft: stretch("left"),
    stretchRight: stretch("right"),
    stretchUp: stretch("up"),
    stretchDown: stretch("down"),
    fillLeft: fill("left"),
    fillRight: fill("right"),
    fillUp: fill("up"),
    fillDown: fill("down")
  };

  // src/taskpane.ts
  var PALETTE_KEY = "ppt-toolkit-palette";
  var DEFAULT_PALETTE = ["#1F4E79", "#2E75B6", "#9DC3E6", "#548235", "#C55A11", "#BF9000", "#7F7F7F", "#000000", "#FFFFFF"];
  var byId = (id) => document.getElementById(id);
  var setStatus = (message) => {
    byId("status").textContent = message;
  };
  var plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  function onClick(element, handler) {
    element.addEventListener("click", async () => {
      try {
        await handler();
      } catch (error) {
        console.error(error);
        setStatus(`Failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }
  async function loadSelection(context, properties) {
    const shapes = context.presentation.getSelectedShapes();
    shapes.load(`items/id,items/type,${properties}`);
    await context.sync();
    return shapes.items;
  }
  var HINTS = {
    stacked: "First row: categories. Then one row per series.",
    clustered: "First row: categories. Then one row per series.",
    percent: "First row: categories. Then one row per series. Shares are calculated for you.",
    combo: "First row: categories. Then one row per series. The last series is drawn as a line.",
    bar: "First row: categories. Then one row per series.",
    clusteredBar: "First row: categories. Then one row per series.",
    percentBar: "First row: categories. Then one row per series. Shares are calculated for you.",
    mekko: "First row: categories. Then one row per series. Column widths follow category totals.",
    mekkoUnit: "First row: categories. Then one row per series. Heights and widths show absolute values.",
    line: "First row: categories. Then one row per series. Leave a cell blank for a gap.",
    pie: "First row: slice names. Second row: values.",
    doughnut: "First row: slice names. Second row: values. Totals shows the sum in the middle.",
    scatter: "One row per point: name, x, y.",
    bubble: "One row per point: name, x, y, size.",
    waterfall: "First row: categories. One row of changes; type e for a subtotal.",
    waterfallBar: "First row: categories. One row of changes; type e for a subtotal.",
    table: "First row: column headers. Then one row per line of the table.",
    gantt: "One row per task: name, start, end (YYYY-MM-DD), owner, remark. Blank end = milestone. Start a name with shade: or bracket: for shaded periods and spans."
  };
  var chartType = () => byId("chartType").value;
  var input = (id) => byId(id);
  var select = (id) => byId(id);
  function optionalNumber(id) {
    const raw = input(id).value.trim();
    return raw === "" || isNaN(Number(raw)) ? null : Number(raw);
  }
  var setOptional = (id, value) => {
    input(id).value = value == null ? "" : String(value);
  };
  function readOptions() {
    const checked = (id) => input(id).checked;
    const from = optionalNumber("optFrom");
    const to = optionalNumber("optTo");
    const decimals = select("optDecimals").value;
    return {
      labels: checked("optLabels"),
      totals: checked("optTotals"),
      legend: checked("optLegend"),
      axis: checked("optAxis"),
      cagr: checked("optCagr"),
      difference: checked("optDiff"),
      dataTable: checked("optTable"),
      today: checked("optToday"),
      valueLine: optionalNumber("optValueLine"),
      scaleMax: optionalNumber("optScaleMax"),
      otherBelow: optionalNumber("optOther"),
      // The panel counts categories from 1; the spec from 0.
      compareFrom: from == null ? null : from - 1,
      compareTo: to == null ? null : to - 1,
      decimals: decimals === "" ? null : Number(decimals),
      unit: select("optUnit").value,
      sort: select("optSort").value,
      ganttScale: select("optGanttScale").value
    };
  }
  function writeOptions(options) {
    input("optLabels").checked = options.labels;
    input("optTotals").checked = options.totals;
    input("optLegend").checked = options.legend;
    input("optAxis").checked = !!options.axis;
    input("optCagr").checked = options.cagr;
    input("optDiff").checked = !!options.difference;
    input("optTable").checked = !!options.dataTable;
    input("optToday").checked = !!options.today;
    setOptional("optValueLine", options.valueLine);
    setOptional("optScaleMax", options.scaleMax);
    setOptional("optOther", options.otherBelow);
    setOptional("optFrom", options.compareFrom == null ? null : options.compareFrom + 1);
    setOptional("optTo", options.compareTo == null ? null : options.compareTo + 1);
    select("optDecimals").value = options.decimals == null ? "" : String(options.decimals);
    select("optUnit").value = options.unit ?? "";
    select("optSort").value = options.sort ?? "none";
    select("optGanttScale").value = options.ganttScale ?? "month";
  }
  var colorOverrides = [];
  function renderSeriesColors() {
    const container = byId("seriesColors");
    container.replaceChildren();
    let names = [];
    try {
      const spec = parseData(chartType(), byId("chartData").value, readOptions());
      names = spec.points || spec.tasks || spec.type === "table" ? [] : spec.series.map((s) => s.name);
      if (spec.type === "pie" || spec.type === "doughnut") names = spec.categories;
    } catch {
    }
    const palette = readBrand().palette;
    names.forEach((name, i) => {
      const label = document.createElement("label");
      const picker = document.createElement("input");
      picker.type = "color";
      picker.value = colorOverrides[i] || palette[i % palette.length];
      picker.addEventListener("input", () => {
        colorOverrides[i] = picker.value.toUpperCase();
      });
      label.append(picker, ` ${name}`);
      container.append(label);
    });
    if (!names.length) container.textContent = "";
  }
  function readSpec() {
    try {
      const spec = parseData(chartType(), byId("chartData").value, readOptions());
      const colors = colorOverrides.slice(0, Math.max(spec.series.length, spec.categories.length));
      return { ...spec, style: readBrand(), ...colors.some(Boolean) ? { colors: [...colors].map((c) => c ?? "") } : {} };
    } catch (error) {
      if (error instanceof DataError) setStatus(error.message);
      else throw error;
      return void 0;
    }
  }
  function gridRows() {
    return byId("chartData").value.split(/\r?\n/).map((line) => line.split("	"));
  }
  function renderGrid() {
    const container = byId("grid");
    container.replaceChildren();
    if (!input("gridMode").checked) return;
    const rows2 = gridRows();
    const width = Math.max(...rows2.map((r) => r.length));
    const table = document.createElement("table");
    rows2.forEach((cells, r) => {
      const tr = document.createElement("tr");
      for (let c = 0; c < width; c++) {
        const td = document.createElement("td");
        const cell = document.createElement("input");
        cell.value = cells[c] ?? "";
        cell.addEventListener("input", () => {
          const current = gridRows();
          while (current.length <= r) current.push([]);
          while (current[r].length <= c) current[r].push("");
          current[r][c] = cell.value;
          byId("chartData").value = current.map((row) => row.join("	")).join("\n");
        });
        cell.addEventListener("paste", (event) => {
          const text2 = event.clipboardData?.getData("text") ?? "";
          if (!text2.includes("	") && !text2.includes("\n")) return;
          event.preventDefault();
          const current = gridRows();
          text2.split(/\r?\n/).forEach((line, dr) => {
            line.split("	").forEach((value, dc) => {
              while (current.length <= r + dr) current.push([]);
              while (current[r + dr].length <= c + dc) current[r + dr].push("");
              current[r + dr][c + dc] = value;
            });
          });
          byId("chartData").value = current.map((row) => row.join("	")).join("\n");
          renderGrid();
        });
        td.append(cell);
        tr.append(td);
      }
      table.append(tr);
    });
    container.append(table);
  }
  async function redraw(context, group, spec) {
    const { left, top, width, height } = group;
    const slide = await currentSlide(context);
    if (!slide) throw new Error("Select a slide first.");
    await drawChart(context, slide, spec, { left, top, width, height });
    group.delete();
    await context.sync();
  }
  function setUpCharts() {
    const typeSelect = select("chartType");
    const data = byId("chartData");
    const refresh = () => {
      byId("chartHint").textContent = HINTS[chartType()];
      renderSeriesColors();
      renderGrid();
    };
    typeSelect.addEventListener("change", refresh);
    data.value = SAMPLES.stacked;
    data.addEventListener("change", () => {
      renderSeriesColors();
      renderGrid();
    });
    input("gridMode").addEventListener("change", () => {
      data.style.display = input("gridMode").checked ? "none" : "";
      renderGrid();
    });
    refresh();
    onClick(byId("gridAddRow"), async () => {
      const rows2 = gridRows();
      data.value = [...rows2, rows2[0].map(() => "")].map((r) => r.join("	")).join("\n");
      renderGrid();
    });
    onClick(byId("gridAddCol"), async () => {
      data.value = gridRows().map((r) => [...r, ""].join("	")).join("\n");
      renderGrid();
    });
    onClick(byId("resetColors"), async () => {
      colorOverrides = [];
      renderSeriesColors();
    });
    onClick(byId("chartSample"), async () => {
      data.value = SAMPLES[chartType()];
      colorOverrides = [];
      renderSeriesColors();
      renderGrid();
    });
    onClick(byId("chartInsert"), async () => {
      const spec = readSpec();
      if (!spec) return;
      await PowerPoint.run(async (context) => {
        const slide = await currentSlide(context);
        if (!slide) return setStatus("Select a slide first.");
        const size = await readSlideSize(context) ?? { width: 960, height: 540 };
        const frame = { left: size.width * 0.08, top: size.height * 0.22, width: size.width * 0.84, height: size.height * 0.66 };
        await drawChart(context, slide, spec, frame);
        setStatus("Chart inserted. Select it and use Edit selected to change the data.");
      });
    });
    onClick(byId("chartLoad"), async () => {
      await PowerPoint.run(async (context) => {
        const chart = await selectedChart(context);
        if (!chart) return setStatus("Select a chart made with PPT Toolkit.");
        typeSelect.value = chart.spec.type;
        data.value = specToText(chart.spec);
        writeOptions({ ...DEFAULT_OPTIONS, ...chart.spec.options });
        colorOverrides = chart.spec.colors ?? [];
        refresh();
        setStatus("Loaded. Change the data, then click Update selected.");
      });
    });
    onClick(byId("chartUpdate"), async () => {
      const spec = readSpec();
      if (!spec) return;
      await PowerPoint.run(async (context) => {
        const chart = await selectedChart(context);
        if (!chart) return setStatus("Select a chart made with PPT Toolkit.");
        await redraw(context, chart.group, spec);
        setStatus("Chart updated.");
      });
    });
    onClick(byId("matchScale"), async () => {
      await PowerPoint.run(async (context) => {
        const charts = await selectedCharts(context);
        if (charts.length < 2) return setStatus("Select 2 or more charts made with PPT Toolkit.");
        const max = Math.max(...charts.map((c) => valueMax({ ...c.spec, options: { ...c.spec.options, scaleMax: null } })));
        for (const chart of charts) {
          await redraw(context, chart.group, { ...chart.spec, options: { ...chart.spec.options, scaleMax: max } });
        }
        setStatus(`${plural(charts.length, "chart")} now share a scale of ${formatNumber(max)}.`);
      });
    });
  }
  var BRAND_KEY = "ppt-toolkit-brand";
  function readBrand() {
    try {
      const saved = JSON.parse(localStorage.getItem(BRAND_KEY) ?? "null");
      return saved ? { ...DEFAULT_STYLE, ...saved } : DEFAULT_STYLE;
    } catch {
      return DEFAULT_STYLE;
    }
  }
  var BRAND_COLORS = ["positive", "negative", "total", "text", "axis"];
  var brandInput = (key) => input(`brand${key[0].toUpperCase()}${key.slice(1)}`);
  function renderBrand() {
    const brand = readBrand();
    const palette = byId("brandPalette");
    palette.replaceChildren("Series ");
    for (let i = 0; i < 8; i++) {
      const picker = document.createElement("input");
      picker.type = "color";
      picker.dataset.index = String(i);
      picker.value = brand.palette[i] ?? DEFAULT_STYLE.palette[i];
      palette.append(picker);
    }
    for (const key of BRAND_COLORS) brandInput(key).value = brand[key];
    input("brandFont").value = brand.font;
  }
  function setUpBrand() {
    renderBrand();
    onClick(byId("brandSave"), async () => {
      const palette = [...byId("brandPalette").querySelectorAll("input")].map((p) => p.value.toUpperCase());
      const style = { ...DEFAULT_STYLE, palette, font: input("brandFont").value.trim() };
      for (const key of BRAND_COLORS) style[key] = brandInput(key).value.toUpperCase();
      localStorage.setItem(BRAND_KEY, JSON.stringify(style));
      renderSeriesColors();
      setStatus("Brand style saved. New and updated charts use it.");
    });
    onClick(byId("brandReset"), async () => {
      localStorage.removeItem(BRAND_KEY);
      renderBrand();
      renderSeriesColors();
      setStatus("Brand style reset to the default.");
    });
  }
  function branded(prims) {
    const { palette, text: text2, font } = readBrand();
    const swap2 = { "#1F4E79": palette[0], "#2E75B6": palette[1] ?? palette[0], "#262626": text2 };
    const recolor = (c) => swap2[c.toUpperCase()] ?? c;
    return prims.map((p) => {
      const next = { ...p };
      for (const key of ["fill", "color", "line"]) if (typeof next[key] === "string") next[key] = recolor(next[key]);
      if (font && (p.kind === "text" || p.kind === "shape" || p.kind === "bubble")) next.font = font;
      return next;
    });
  }
  async function currentSlide(context) {
    const slides = context.presentation.getSelectedSlides();
    slides.load("items");
    await context.sync();
    return slides.items[0];
  }
  async function insertCentered(name, width, height, layout) {
    await PowerPoint.run(async (context) => {
      const slide = await currentSlide(context);
      if (!slide) return setStatus("Select a slide first.");
      const size = await readSlideSize(context) ?? { width: 960, height: 540 };
      const frame = { left: (size.width - width) / 2, top: (size.height - height) / 2, width, height };
      await drawGroup(context, slide, branded(layout(frame)), name);
      setStatus(`Inserted ${name.toLowerCase()}.`);
    });
  }
  function setUpElements() {
    onClick(
      byId("harvey"),
      () => insertCentered("Harvey Ball", 24, 24, (frame) => harveyBall(Number(byId("harveyLevel").value), frame))
    );
    onClick(
      byId("checkbox"),
      () => insertCentered("Checkbox", 24, 24, (frame) => checkbox(byId("checkState").value, frame))
    );
    onClick(byId("flow"), async () => {
      const steps = lines(byId("flowSteps").value);
      if (!steps.length) return setStatus("Enter at least one step.");
      await insertCentered("Process Flow", Math.min(800, steps.length * 170), 56, (frame) => processFlow(steps, frame));
    });
    onClick(byId("setRadius"), async () => {
      const radius = Number(byId("radius").value);
      if (!(radius >= 0)) return setStatus("Enter a radius of 0 or more.");
      await PowerPoint.run(async (context) => {
        const items = await loadSelection(context, "items/width,items/height");
        const { changed } = await forEachShape(context, items, async (shape) => {
          shape.adjustments.load("count");
          await context.sync();
          if (shape.adjustments.count !== 1) throw new Error("Not a rounded shape");
          shape.adjustments.set(0, Math.min(0.5, radius / Math.min(shape.width, shape.height)));
        });
        setStatus(changed ? `Set radius on ${plural(changed, "shape")}.` : "Select rounded rectangles.");
      });
    });
  }
  var lines = (text2) => text2.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  var AGENDA_TAG = "PPTTOOLKIT_AGENDA";
  function agendaPrims(items, info, pages = []) {
    const title = {
      kind: "text",
      box: info.titleBox,
      text: "Agenda",
      size: 28,
      color: "#262626",
      align: "Left",
      valign: "Middle",
      bold: true
    };
    return branded([title, ...agenda(items, info.highlight, info.frame, pages)]);
  }
  async function insertAgendaSlides(highlights) {
    const items = lines(byId("agendaItems").value);
    if (!items.length) return setStatus("Enter at least one topic.");
    await PowerPoint.run(async (context) => {
      const current = await currentSlide(context);
      if (!current) return setStatus("Select a slide first.");
      current.load("index");
      current.layout.load("id");
      current.slideMaster.load("id");
      await context.sync();
      const size = await readSlideSize(context) ?? { width: 960, height: 540 };
      const canMove = Office.context.requirements.isSetSupported("PowerPointApi", "1.8");
      for (const [n, highlight] of highlights.entries()) {
        context.presentation.slides.add({ layoutId: current.layout.id, slideMasterId: current.slideMaster.id });
        await context.sync();
        const slides = context.presentation.slides;
        slides.load("items");
        await context.sync();
        const slide = slides.items[slides.items.length - 1];
        if (canMove) slide.moveTo(current.index + 1 + n);
        const info = {
          highlight,
          frame: { left: size.width * 0.12, top: size.height * 0.25, width: size.width * 0.76, height: size.height * 0.6 },
          titleBox: { left: size.width * 0.12, top: size.height * 0.1, width: size.width * 0.76, height: 40 }
        };
        await drawGroup(context, slide, agendaPrims(items, info), "Agenda", { key: AGENDA_TAG, value: JSON.stringify(info) });
      }
      const where = canMove ? "after the current slide" : "at the end";
      setStatus(`Added ${plural(highlights.length, "agenda slide")} ${where}.`);
    });
    if (input("agendaPages").checked) await updateAgendas();
  }
  async function updateAgendas() {
    const items = lines(byId("agendaItems").value);
    if (!items.length) return setStatus("Enter at least one topic.");
    const withPages = input("agendaPages").checked;
    await PowerPoint.run(async (context) => {
      const slides = context.presentation.slides;
      slides.load("items");
      await context.sync();
      const found = [];
      for (const [index, slide] of slides.items.entries()) {
        setStatus(`Looking for agendas on slide ${index + 1} of ${slides.items.length}\u2026`);
        slide.shapes.load("items/type");
        await context.sync();
        const groups = slide.shapes.items.filter((s) => s.type === "Group");
        const tags = groups.map((g) => {
          const tag = g.tags.getItemOrNullObject(AGENDA_TAG);
          tag.load("value");
          return tag;
        });
        await context.sync();
        groups.forEach((group, i) => {
          if (!tags[i].isNullObject) found.push({ slide, number: index + 1, group, info: JSON.parse(tags[i].value) });
        });
      }
      if (!found.length) return setStatus("No agendas made with PPT Toolkit in this deck.");
      const pages = items.map((_, i) => found.find((f) => f.info.highlight === i)?.number);
      for (const { slide, group, info } of found) {
        await drawGroup(context, slide, agendaPrims(items, info, withPages ? pages : []), "Agenda", {
          key: AGENDA_TAG,
          value: JSON.stringify(info)
        });
        group.delete();
        await context.sync();
      }
      setStatus(`Updated ${plural(found.length, "agenda")}.`);
    });
  }
  function setUpAgenda() {
    onClick(byId("agendaOverview"), () => insertAgendaSlides([-1]));
    onClick(byId("agendaSlides"), () => insertAgendaSlides(lines(byId("agendaItems").value).map((_, i) => i)));
    onClick(byId("agendaUpdate"), updateAgendas);
  }
  var SYMBOLS2 = ["\u2713", "\u2717", "\u2192", "\u2190", "\u2191", "\u2193", "\u2022", "\u25B2", "\u25BC", "\u25CF", "\u25CB", "\u25A0", "\u25A1", "\u2605", "\u20AC", "\xA3", "\xA5", "\xB0", "\xB1", "\xD7", "\xF7", "\u2248", "\u2260", "\u2264", "\u2265", "\u03A3", "\u0394", "\xD8", "\u2026", "\u2013", "\u2014", "\u2122", "\xA9"];
  async function insertText(value) {
    await PowerPoint.run(async (context) => {
      if (Office.context.requirements.isSetSupported("PowerPointApi", "1.5")) {
        const range = context.presentation.getSelectedTextRangeOrNullObject();
        range.load("text");
        await context.sync();
        if (!range.isNullObject) {
          range.text = value;
          await context.sync();
          return setStatus(`Inserted ${value}.`);
        }
      }
      const slide = await currentSlide(context);
      if (!slide) return setStatus("Select a slide or click into text first.");
      const size = await readSlideSize(context) ?? { width: 960, height: 540 };
      const width = Math.min(size.width * 0.8, Math.max(40, value.length * 8));
      const box = slide.shapes.addTextBox(value, { left: (size.width - width) / 2, top: size.height / 2 - 15, width, height: 30 });
      box.name = "Text";
      await context.sync();
      setStatus(`Inserted ${value} in a new text box.`);
    });
  }
  function setUpSymbols() {
    const container = byId("symbols");
    for (const symbol of SYMBOLS2) {
      const button = document.createElement("button");
      button.className = "quiet small";
      button.textContent = symbol;
      onClick(button, () => insertText(symbol));
      container.append(button);
    }
    const fileUrl = () => {
      const url = Office.context.document.url;
      if (!url) throw new Error("Save the presentation first.");
      return decodeURIComponent(url.replace(/^file:\/\//, ""));
    };
    onClick(byId("insertFileName"), () => insertText(fileUrl().split(/[\\/]/).pop() ?? ""));
    onClick(byId("insertFilePath"), () => insertText(fileUrl()));
  }
  async function eachSelectedText(edit) {
    return PowerPoint.run(async (context) => {
      const items = (await loadSelection(context, "items/name")).filter((s) => TEXT_TYPES.has(s.type));
      return { total: items.length, ...await forEachShape(context, items, (shape) => edit(shape, context)) };
    });
  }
  function setUpText() {
    onClick(byId("pasteText"), async () => {
      const values = lines(byId("pasteLines").value);
      if (!values.length) return setStatus("Enter at least one line.");
      let index = 0;
      await eachSelectedText(async (shape) => {
        if (index < values.length) shape.textFrame.textRange.text = values[index++];
      });
      setStatus(`Filled ${plural(index, "shape")}.`);
    });
    const resizeFonts = (delta) => async () => {
      let mixed = 0;
      const { changed } = await eachSelectedText(async (shape, context) => {
        const font = shape.textFrame.textRange.font;
        font.load("size");
        await context.sync();
        if (font.size == null) mixed++;
        else font.size = Math.max(1, font.size + delta);
      });
      setStatus(`Changed ${plural(changed - mixed, "shape")}.${mixed ? ` ${mixed} with mixed sizes skipped.` : ""}`);
    };
    onClick(byId("fontUp"), resizeFonts(1));
    onClick(byId("fontDown"), resizeFonts(-1));
    onClick(byId("decimals"), async () => {
      let swapped = 0;
      await eachSelectedText(async (shape, context) => {
        const range = shape.textFrame.textRange;
        range.load("text");
        await context.sync();
        for (const { index, char } of decimalSwaps(range.text)) {
          range.getSubstring(index, 1).text = char;
          swapped++;
        }
      });
      setStatus(swapped ? `Swapped ${plural(swapped, "separator")}.` : "No numbers with separators in the selection.");
    });
    onClick(byId("replaceFont"), async () => {
      const from = byId("fontFrom").value.trim();
      const to = byId("fontTo").value.trim();
      if (!from || !to) return setStatus("Enter both font names.");
      let replaced = 0;
      let mixed = 0;
      await PowerPoint.run(async (context) => {
        await forEachTextShapeInDeck(context, async (shape) => {
          const font = shape.textFrame.textRange.font;
          font.load("name");
          await context.sync();
          if (font.name == null) mixed++;
          else if (font.name.toLowerCase() === from.toLowerCase()) {
            font.name = to;
            await context.sync();
            replaced++;
          }
        });
      });
      const note = mixed ? ` ${plural(mixed, "shape")} with mixed fonts were skipped.` : "";
      setStatus(`Replaced ${from} in ${plural(replaced, "shape")}.${note}`);
    });
  }
  async function forEachShapeInDeck(context, visit) {
    const slides = context.presentation.slides;
    slides.load("items");
    await context.sync();
    for (const [i, slide] of slides.items.entries()) {
      setStatus(`Working on slide ${i + 1} of ${slides.items.length}\u2026`);
      slide.shapes.load("items/id,items/type,items/name");
      await context.sync();
      for (const shape of slide.shapes.items) {
        try {
          await visit(shape);
        } catch (error) {
          console.warn(`Skipped ${shape.name}`, error);
        }
      }
    }
  }
  var forEachTextShapeInDeck = (context, visit) => forEachShapeInDeck(context, async (shape) => {
    if (TEXT_TYPES.has(shape.type)) await visit(shape);
  });
  function confirmClick(button, run) {
    const label = button.textContent ?? "";
    let armed = false;
    onClick(button, async () => {
      if (!armed) {
        armed = true;
        button.textContent = "Click again to confirm";
        setTimeout(() => {
          armed = false;
          button.textContent = label;
        }, 4e3);
        return;
      }
      armed = false;
      button.textContent = label;
      await run();
    });
  }
  function setUpCleanup() {
    confirmClick(byId("cleanAlt"), async () => {
      let cleared = 0;
      await PowerPoint.run(async (context) => {
        await forEachShapeInDeck(context, async (shape) => {
          shape.load("altTextDescription,altTextTitle");
          await context.sync();
          if (!shape.altTextDescription && !shape.altTextTitle) return;
          shape.altTextDescription = "";
          shape.altTextTitle = "";
          await context.sync();
          cleared++;
        });
      });
      setStatus(`Removed alternative text from ${plural(cleared, "shape")}.`);
    });
    confirmClick(byId("cleanEmpty"), async () => {
      let deleted = 0;
      await PowerPoint.run(async (context) => {
        await forEachShapeInDeck(context, async (shape) => {
          if (shape.type !== "TextBox") return;
          shape.textFrame.load("hasText");
          await context.sync();
          if (shape.textFrame.hasText) return;
          shape.delete();
          await context.sync();
          deleted++;
        });
      });
      setStatus(`Deleted ${deleted} empty text ${deleted === 1 ? "box" : "boxes"}.`);
    });
  }
  function readGap() {
    const gap = Number(byId("gap").value);
    if (Number.isFinite(gap) && gap >= 0) return gap;
    setStatus("Enter a gap of 0 or more.");
    return void 0;
  }
  async function arrange(id, action) {
    const count = await applyToSelection(id, action);
    setStatus(count ? `Arranged ${plural(count, "shape")}.` : "Select at least 2 shapes.");
  }
  function setUpMatrix() {
    onClick(byId("matrix"), async () => {
      const gap = readGap();
      const columns = Math.floor(Number(byId("columns").value));
      if (gap === void 0) return;
      if (!(columns >= 1)) return setStatus("Enter at least 1 column.");
      await arrange("matrix", matrix(columns, gap));
    });
    document.querySelectorAll("[data-stack]").forEach((button) => {
      onClick(button, async () => {
        const gap = readGap();
        if (gap !== void 0) await arrange("stack", stack(button.dataset.stack === "true", gap));
      });
    });
  }
  async function selectionFactor() {
    const mode = document.querySelector('input[name="resizeMode"]:checked').value;
    if (mode === "relative") {
      const percent = Number(byId("scale").value);
      return percent > 0 ? percent / 100 : void 0;
    }
    const target = Number(byId("targetWidth").value);
    if (!(target > 0)) return void 0;
    return PowerPoint.run(async (context) => {
      const items = await loadSelection(context, "items/left,items/width");
      const width = footprintWidth(items);
      return width > 0 ? target / width : void 0;
    });
  }
  async function scaleEach(context, shapes, read, factor) {
    let mixed = 0;
    await forEachShape(context, shapes, async (shape) => {
      const property = read(shape);
      property.load();
      await context.sync();
      const value = property.get();
      if (value == null) mixed++;
      else property.set(Math.max(0.25, Math.round(value * factor * 4) / 4));
    });
    return mixed;
  }
  function setUpResizer() {
    onClick(byId("resize"), async () => {
      const factor = await selectionFactor();
      if (factor === void 0) return setStatus("Enter a size above 0 and select at least 1 shape.");
      const count = await applyToSelection("magicResize", scaleGroup(factor));
      if (!count) return setStatus("Select at least 1 shape.");
      let mixed = 0;
      await PowerPoint.run(async (context) => {
        const items = await loadSelection(context, "items/name");
        if (byId("scaleText").checked) {
          mixed += await scaleEach(context, items.filter((s) => TEXT_TYPES.has(s.type)), (s) => {
            const font = s.textFrame.textRange.font;
            return { load: () => font.load("size"), get: () => font.size, set: (v) => font.size = v };
          }, factor);
        }
        if (byId("scaleLine").checked) {
          mixed += await scaleEach(context, items.filter((s) => LINE_TYPES.has(s.type)), (s) => {
            const line = s.lineFormat;
            return {
              load: () => line.load("visible,weight"),
              get: () => line.visible ? line.weight : 1,
              set: (v) => {
                if (line.visible) line.weight = v;
              }
            };
          }, factor);
        }
      });
      const note = mixed ? ` ${plural(mixed, "shape")} with mixed font sizes kept their text size.` : "";
      setStatus(`Resized ${plural(count, "shape")} by ${Math.round(factor * 100)}%.${note}`);
    });
  }
  function setUpFormat() {
    onClick(byId("format"), async () => {
      const wantFill = byId("fmtFill").checked;
      const wantLine = byId("fmtLine").checked;
      const wantText = byId("fmtText").checked;
      await PowerPoint.run(async (context) => {
        const targets = await loadSelection(context, "items/name");
        const source = targets.pop();
        if (!source || !targets.length) return setStatus("Select at least 2 shapes.");
        const hasFill = wantFill && FILL_TYPES.has(source.type);
        const hasLine = wantLine && LINE_TYPES.has(source.type);
        const hasText = wantText && TEXT_TYPES.has(source.type);
        if (hasFill) source.fill.load("type,foregroundColor,transparency");
        if (hasLine) source.lineFormat.load("visible,color,weight,dashStyle");
        const font = source.textFrame?.textRange?.font;
        if (hasText) font.load("name,size,color,bold,italic");
        await context.sync();
        const { changed, failed } = await forEachShape(context, targets, (target) => {
          if (hasFill && FILL_TYPES.has(target.type)) {
            if (source.fill.type === "NoFill") target.fill.clear();
            else if (source.fill.type === "Solid") {
              target.fill.setSolidColor(source.fill.foregroundColor);
              target.fill.transparency = source.fill.transparency;
            }
          }
          if (hasLine && LINE_TYPES.has(target.type)) {
            target.lineFormat.visible = source.lineFormat.visible;
            if (source.lineFormat.visible) {
              target.lineFormat.color = source.lineFormat.color;
              target.lineFormat.weight = source.lineFormat.weight;
              target.lineFormat.dashStyle = source.lineFormat.dashStyle;
            }
          }
          if (hasText && TEXT_TYPES.has(target.type)) {
            const to = target.textFrame.textRange.font;
            if (font.name != null) to.name = font.name;
            if (font.size != null) to.size = font.size;
            if (font.color != null) to.color = font.color;
            if (font.bold != null) to.bold = font.bold;
            if (font.italic != null) to.italic = font.italic;
          }
        });
        setStatus(`Formatted ${plural(changed, "shape")}.${failed ? ` Skipped ${failed}.` : ""}`);
      });
    });
  }
  function readPalette() {
    try {
      const saved = JSON.parse(localStorage.getItem(PALETTE_KEY) ?? "null");
      return Array.isArray(saved) ? saved : DEFAULT_PALETTE;
    } catch {
      return DEFAULT_PALETTE;
    }
  }
  function savePalette(palette) {
    localStorage.setItem(PALETTE_KEY, JSON.stringify(palette));
    renderPalette();
  }
  async function applyColor(color) {
    const target = document.querySelector('input[name="target"]:checked').value;
    await PowerPoint.run(async (context) => {
      const items = await loadSelection(context, "items/name");
      if (!items.length) return setStatus("Select at least 1 shape.");
      const types = target === "fill" ? FILL_TYPES : target === "line" ? LINE_TYPES : TEXT_TYPES;
      const eligible = items.filter((s) => types.has(s.type));
      const { changed } = await forEachShape(context, eligible, (shape) => {
        if (target === "fill") shape.fill.setSolidColor(color);
        else if (target === "line") {
          shape.lineFormat.visible = true;
          shape.lineFormat.color = color;
        } else shape.textFrame.textRange.font.color = color;
      });
      setStatus(`Applied ${color} to ${plural(changed, "shape")}.`);
    });
  }
  function renderPalette() {
    const container = byId("swatches");
    container.replaceChildren();
    readPalette().forEach((color, index) => {
      const swatch = document.createElement("button");
      swatch.className = "swatch";
      swatch.style.background = color;
      swatch.title = color;
      const remove = document.createElement("span");
      remove.textContent = "\xD7";
      remove.title = "Remove color";
      swatch.append(remove);
      onClick(swatch, async () => {
        await applyColor(color);
      });
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        savePalette(readPalette().filter((_, i) => i !== index));
      });
      container.append(swatch);
    });
  }
  function addToPalette(color) {
    const palette = readPalette();
    const exists = palette.some((c) => c.toLowerCase() === color.toLowerCase());
    if (!exists) savePalette([...palette, color]);
    setStatus(exists ? `${color} is already saved.` : `Saved ${color}.`);
  }
  function setUpColors() {
    renderPalette();
    onClick(byId("addColor"), async () => addToPalette(byId("newColor").value));
    onClick(byId("grabColor"), async () => {
      await PowerPoint.run(async (context) => {
        const shape = (await loadSelection(context, "items/name")).pop();
        if (!shape || !FILL_TYPES.has(shape.type)) return setStatus("Select a filled shape.");
        shape.fill.load("type,foregroundColor");
        await context.sync();
        if (shape.fill.type !== "Solid") return setStatus("Selected shape has no solid fill.");
        addToPalette(shape.fill.foregroundColor);
      });
    });
  }
  async function readSlides(context) {
    const slides = context.presentation.slides;
    slides.load("items/id");
    await context.sync();
    const result = [];
    for (const [index, slide] of slides.items.entries()) {
      setStatus(`Checking slide ${index + 1} of ${slides.items.length}\u2026`);
      slide.shapes.load("items/id,items/name,items/type,items/left,items/top,items/width,items/height");
      await context.sync();
      const shapes = [];
      for (const s of slide.shapes.items) {
        const info = { id: s.id, name: s.name, type: s.type, left: s.left, top: s.top, width: s.width, height: s.height };
        if (TEXT_TYPES.has(s.type)) {
          try {
            const frame = s.textFrame;
            frame.load("hasText");
            frame.textRange.font.load("name,size");
            await context.sync();
            info.hasText = frame.hasText;
            info.fontName = frame.textRange.font.name;
            info.fontSize = frame.textRange.font.size;
          } catch (error) {
            console.warn(`Could not read text of ${s.name}`, error);
          }
        }
        shapes.push(info);
      }
      result.push({ id: slide.id, number: index + 1, shapes });
    }
    return result;
  }
  function setUpCheck() {
    const list = byId("issues");
    onClick(byId("check"), async () => {
      list.replaceChildren();
      await PowerPoint.run(async (context) => {
        const slideSize = await readSlideSize(context);
        const issues = checkPresentation(await readSlides(context), { slideSize });
        for (const issue of issues) {
          const item = document.createElement("li");
          const button = document.createElement("button");
          button.textContent = `Slide ${issue.slideNumber}: ${issue.message}`;
          onClick(
            button,
            () => PowerPoint.run(async (ctx) => {
              ctx.presentation.setSelectedSlides([issue.slideId]);
              ctx.presentation.slides.getItem(issue.slideId).setSelectedShapes([issue.shapeId]);
              await ctx.sync();
            })
          );
          item.append(button);
          list.append(item);
        }
        const skipped = slideSize ? "" : " Off-slide check unavailable in this PowerPoint version.";
        setStatus(`${issues.length ? `Found ${plural(issues.length, "issue")}.` : "No issues found."}${skipped}`);
      });
    });
  }
  function setUpSelfTest() {
    onClick(byId("selfTest"), async () => {
      const results = await runSelfTest(setStatus);
      const failed = results.filter((r) => !r.ok).map((r) => r.name);
      setStatus(failed.length ? `Self-test done. Failed: ${failed.join(", ")}. Results sent to Claude.` : "Self-test done, nothing failed. Results sent to Claude.");
    });
  }
  Office.onReady(() => {
    setUpSelfTest();
    setUpCharts();
    setUpBrand();
    setUpSymbols();
    setUpElements();
    setUpAgenda();
    setUpText();
    setUpCleanup();
    setUpMatrix();
    setUpResizer();
    setUpFormat();
    setUpColors();
    setUpCheck();
  });
})();
