"use strict";
(() => {
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
      const rows = Math.ceil(boxes.length / cols);
      const colWidths = Array.from({ length: cols }, () => 0);
      const rowHeights = Array.from({ length: rows }, () => 0);
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
  function applySaved(saved, mode) {
    return (boxes) => boxes.map((box) => {
      if (mode === "all") return { ...saved };
      if (mode === "width") return { width: saved.width };
      if (mode === "height") return { height: saved.height };
      if (mode === "size") return { width: saved.width, height: saved.height };
      const [vertical, horizontal] = mode.split("-");
      const fx = horizontal === "left" ? 0 : horizontal === "center" ? 0.5 : 1;
      const fy = vertical === "top" ? 0 : vertical === "middle" ? 0.5 : 1;
      return {
        left: saved.left + (saved.width - box.width) * fx,
        top: saved.top + (saved.height - box.height) * fy
      };
    });
  }
  function snapToTable(boxes, table) {
    const edges = (start, sizes) => {
      const result = [start];
      for (const size of sizes) result.push(result[result.length - 1] + size);
      return result;
    };
    const xs = edges(table.left, table.columnWidths);
    const ys = edges(table.top, table.rowHeights);
    const find = (lines, value) => lines.findIndex((line, i) => i > 0 && value < line) - 1;
    return boxes.map((b) => {
      const col = b.left + b.width / 2 >= xs[0] ? find(xs, b.left + b.width / 2) : -1;
      const row = b.top + b.height / 2 >= ys[0] ? find(ys, b.top + b.height / 2) : -1;
      if (col < 0 || row < 0) return {};
      return { left: xs[col], top: ys[row], width: xs[col + 1] - xs[col], height: ys[row + 1] - ys[row] };
    });
  }
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

  // src/elements.ts
  function matchingRadius(masterAdjustment, master2, target) {
    const radius = masterAdjustment * Math.min(master2.width, master2.height);
    const shorter = Math.min(target.width, target.height);
    return shorter > 0 ? Math.min(0.5, radius / shorter) : masterAdjustment;
  }

  // src/office.ts
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

  // src/commands.ts
  var SAVED_KEY = "ppt-toolkit-saved-box";
  async function savePosition() {
    await PowerPoint.run(async (context) => {
      const shapes = context.presentation.getSelectedShapes();
      shapes.load("items/left,items/top,items/width,items/height");
      await context.sync();
      const box = shapes.items[shapes.items.length - 1];
      if (!box) return;
      const { left, top, width, height } = box;
      localStorage.setItem(SAVED_KEY, JSON.stringify({ left, top, width, height }));
    });
  }
  function readSaved() {
    try {
      return JSON.parse(localStorage.getItem(SAVED_KEY) ?? "null") ?? void 0;
    } catch {
      return void 0;
    }
  }
  async function applyPosition(mode) {
    const saved = readSaved();
    if (saved) await applyToSelection(`apply-${mode}`, applySaved(saved, mode));
  }
  async function alignInTable() {
    if (!Office.context.requirements.isSetSupported("PowerPointApi", "1.9")) return;
    await PowerPoint.run(async (context) => {
      const shapes = context.presentation.getSelectedShapes();
      shapes.load("items/type,items/left,items/top,items/width,items/height");
      await context.sync();
      const tableShape = shapes.items[shapes.items.length - 1];
      if (!tableShape || tableShape.type !== "Table" || shapes.items.length < 2) return;
      const table = tableShape.getTable();
      table.columns.load("items/width");
      table.rows.load("items/currentHeight");
      await context.sync();
      const targets = shapes.items.slice(0, -1);
      const patches = snapToTable(targets, {
        left: tableShape.left,
        top: tableShape.top,
        columnWidths: table.columns.items.map((c) => c.width),
        rowHeights: table.rows.items.map((r) => r.currentHeight)
      });
      patches.forEach((patch, i) => Object.assign(targets[i], patch));
      await context.sync();
    });
  }
  async function alignRadius() {
    if (!Office.context.requirements.isSetSupported("PowerPointApi", "1.10")) return;
    await PowerPoint.run(async (context) => {
      const shapes = context.presentation.getSelectedShapes();
      shapes.load("items/left,items/top,items/width,items/height");
      await context.sync();
      const master2 = shapes.items[shapes.items.length - 1];
      if (!master2 || shapes.items.length < 2) return;
      master2.adjustments.load("count");
      await context.sync();
      if (master2.adjustments.count !== 1) return;
      const value = master2.adjustments.get(0);
      await context.sync();
      for (const shape of shapes.items.slice(0, -1)) {
        try {
          shape.adjustments.load("count");
          await context.sync();
          if (shape.adjustments.count !== 1) continue;
          shape.adjustments.set(0, matchingRadius(value.value, master2, shape));
          await context.sync();
        } catch (error) {
          console.warn("Skipped shape", error);
        }
      }
    });
  }
  async function selectSimilar(by) {
    await PowerPoint.run(async (context) => {
      const selection = context.presentation.getSelectedShapes();
      selection.load("items/id,items/type,items/width,items/height");
      const slides = context.presentation.getSelectedSlides();
      slides.load("items");
      await context.sync();
      const master2 = selection.items[selection.items.length - 1];
      const slide = slides.items[0];
      if (!master2 || !slide) return;
      slide.shapes.load("items/id,items/type,items/width,items/height");
      await context.sync();
      let candidates = slide.shapes.items.filter((s) => s.type === master2.type);
      if (by === "size") {
        candidates = slide.shapes.items.filter((s) => Math.abs(s.width - master2.width) < 0.5 && Math.abs(s.height - master2.height) < 0.5);
      }
      if (by === "fill") {
        if (!FILL_TYPES.has(master2.type)) return;
        const filled = slide.shapes.items.filter((s) => FILL_TYPES.has(s.type));
        filled.forEach((s) => s.fill.load("type,foregroundColor"));
        master2.fill.load("type,foregroundColor");
        await context.sync();
        candidates = filled.filter((s) => s.fill.type === master2.fill.type && s.fill.foregroundColor === master2.fill.foregroundColor);
      }
      slide.setSelectedShapes(candidates.map((s) => s.id));
      await context.sync();
    });
  }
  async function rotate(degrees) {
    if (!Office.context.requirements.isSetSupported("PowerPointApi", "1.10")) return;
    await PowerPoint.run(async (context) => {
      const shapes = context.presentation.getSelectedShapes();
      shapes.load("items/rotation");
      await context.sync();
      const master2 = shapes.items[shapes.items.length - 1];
      if (!master2) return;
      const targets = degrees === null ? shapes.items.slice(0, -1) : shapes.items;
      for (const shape of targets) {
        shape.rotation = degrees === null ? master2.rotation : ((shape.rotation + degrees) % 360 + 360) % 360;
      }
      await context.sync();
    });
  }
  var anchors = ["top", "middle", "bottom"].flatMap((v) => ["left", "center", "right"].map((h) => `${v}-${h}`));
  var customCommands = {
    savePosition,
    applyPosition: () => applyPosition("all"),
    applyWidth: () => applyPosition("width"),
    applyHeight: () => applyPosition("height"),
    applySize: () => applyPosition("size"),
    alignInTable,
    alignRadius,
    selectSameType: () => selectSimilar("type"),
    selectSameFill: () => selectSimilar("fill"),
    selectSameSize: () => selectSimilar("size"),
    rotateLeft: () => rotate(-90),
    rotateRight: () => rotate(90),
    rotateMatch: () => rotate(null),
    ...Object.fromEntries(
      anchors.map((anchor) => [
        `apply-${anchor}`.replace(/-(\w)/g, (_, c) => c.toUpperCase()),
        () => applyPosition(anchor)
      ])
    )
  };
  function register(id, run) {
    Office.actions.associate(id, async (event) => {
      try {
        await run();
      } catch (error) {
        console.error(`${id} failed`, error);
        debugLog({ id, error: String(error) });
      } finally {
        event.completed();
      }
    });
  }
  Office.onReady(() => {
    for (const [id, action] of Object.entries(actions)) register(id, () => applyToSelection(id, action));
    for (const [id, run] of Object.entries(customCommands)) register(id, run);
  });
})();
