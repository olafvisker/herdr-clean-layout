// Agents in grouped or priority views; parents take their most urgent sub-agent's place.

import { View, div, image, svg, PathBuilder, Background } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, panes, focused, spaces, run, theme, shared, setShared, setAgentOrder, openOverlay, closeOverlay, props, window, layout } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The rail is its own layout node ("sidebar-rail"); its copies of this mod get props.rail.
const narrow = () => Boolean(props()?.rail);

// Drops what an agent puts before its title: a status glyph or spinner and the separator
// after it ("✦  Working", "⠋ - Thinking"), and Codex's blinking "[ ! ] " / "[ . ] " mark.
// Stops at an opening bracket or quote, so a title that starts with one ("[web] login") keeps it,
// and at an emoji ("🔴 login", "❤️ deploy"), except for known status marks.
const clean = (s) => (s ?? "").replace(/^(?:\[ [!.] \] |[✋⏳]\uFE0F?(?=\s)|(?!(?:\p{Emoji}\uFE0F|[#*]\u20E3))[^\p{L}\p{N}\p{Ps}\p{Pi}\p{Emoji_Presentation}])+/u, "").trim();

function leadPanes(all) {
  const leads = new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const current = leads.get(p.tab);
    // First agent, else first focused terminal, else first terminal in the tab.
    if (!current || (!current.program?.agent && (p.program?.agent || (!current.focused && p.focused)))) leads.set(p.tab, p);
  }
  return leads;
}

function title(tab, l) {
  const prog = l?.program?.name;
  const live = clean(l?.title);
  // clean() would strip a path's leading ~ or /: test the title with only its status glyph gone.
  const path = /^[~/]|^[A-Za-z]:\\/.test((l?.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== (l?.terminal ?? l?.address) && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== l?.program?.key;
  return (tab.name === prog || !tab.named) && telling ? live : tab.name;
}
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
// A sub-agent without a pane isn't in agents(): its raw word, error counting as
// blocked. It's never done: it reports to its parent, and the parent's done is the news.
// A kept sub-agent (one with a pane) is in agents() too: it keeps its own status, done included.
const kidStatus = (k, listed) => {
  if (listed.has(k.address)) return listed.get(k.address);
  const s = k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};
const SORTS = [
  { id: "priority", label: "Priority", icon: "clock" },
  { id: "grouped", label: "Grouped by space", icon: "layers" },
];
const sortOf = () => SORTS.find((s) => s.id === shared("agents.sort")) ?? SORTS[0];
const SECTION = { 4: "Needs you", 3: "Done", 2: "Working", 1: "Idle" };
const SECTION_STATUS = { 4: "blocked", 3: "done", 2: "working" };

function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// The agent's icon from the app's program table: a one-color glyph or a picture.
function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

// A little one-eyed creature per agent, seeded by its address so it keeps its look.
// The pupil glances around now and then; the eye squashes flat to blink.
// The reference image's gradients: blue into violet, violet, magenta into purple, and the odd green.
const PALETTES = [
  ["#4a6bff", "#7b3dff"], ["#8a5cff", "#4b2fd6"], ["#e04ee0", "#7a3dff"], ["#b24dff", "#5a32e0"],
  ["#5a8dff", "#6a3dff"], ["#ff5fc8", "#9b3dff"], ["#2fd48a", "#1c9a8a"],
];
// Body outlines after the reference: cups, drops, rounded triangles,
// bowls, clouds, domes, blobs. In percent of the box: [command, ...points]; each creature
// nudges the points slightly. eye: [center x, center y] in percent; rot: quarter turns clockwise; flip: mirrored.
const DROP = [["M", 42, 9], ["Q", 58, 9, 50, 0], ["C", 96, 66, 72, 28, 96, 44], ["C", 50, 98, 96, 88, 76, 98], ["C", 4, 66, 24, 98, 4, 88], ["C", 42, 9, 4, 44, 28, 28]];
const CLOUD = [["M", 10, 88], ["C", 22, 48, 0, 86, 0, 52], ["C", 56, 20, 26, 28, 38, 20], ["C", 98, 62, 80, 20, 98, 38], ["C", 86, 88, 98, 80, 96, 88], ["Z"]];
const CLOUD3 = [["M", 12, 88], ["C", 10, 56, 2, 88, 0, 62], ["C", 34, 40, 12, 44, 24, 36], ["C", 72, 32, 38, 14, 64, 12], ["C", 92, 64, 88, 32, 100, 46], ["C", 86, 88, 100, 82, 96, 88], ["Z"]];
const SHAPES = [
  // cup: flat top, sides taper into a round bottom
  { eye: [50, 44], cmds: [["M", 14, 6], ["L", 86, 6], ["Q", 96, 15, 97, 6], ["L", 86, 68], ["C", 50, 96, 82, 90, 66, 96], ["C", 14, 68, 34, 96, 18, 90], ["L", 4, 15], ["Q", 14, 6, 3, 6], ["Z"]] },
  { eye: [50, 62], cmds: DROP },
  // slender and plump upright drops
  { eye: [50, 64], cmds: [["M", 44, 10], ["Q", 56, 10, 50, 0], ["C", 88, 68, 70, 32, 88, 48], ["C", 50, 98, 88, 88, 72, 98], ["C", 12, 68, 28, 98, 12, 88], ["C", 44, 10, 12, 48, 30, 32]] },
  { eye: [50, 62], cmds: [["M", 40, 12], ["Q", 60, 12, 50, 2], ["C", 100, 64, 78, 30, 100, 44], ["C", 50, 98, 100, 88, 78, 98], ["C", 0, 64, 22, 98, 0, 88], ["C", 40, 12, 0, 44, 22, 30]] },
  // rounded triangle
  { eye: [50, 64], cmds: [["M", 38, 16], ["Q", 62, 16, 50, 0], ["L", 93, 76], ["Q", 82, 96, 100, 96], ["L", 18, 96], ["Q", 7, 76, 0, 96], ["Z"]] },
  // bowl: flat top, round bottom
  { eye: [50, 46], cmds: [["M", 14, 14], ["L", 86, 14], ["Q", 98, 26, 98, 14], ["C", 50, 92, 98, 66, 78, 92], ["C", 2, 26, 22, 92, 2, 66], ["Q", 14, 14, 2, 14], ["Z"]] },
  // cloud: a small bump on the left, a big one on the right, flat-ish bottom (and mirrored)
  { eye: [60, 58], cmds: CLOUD },
  // dome
  { eye: [50, 58], cmds: [["M", 4, 80], ["L", 4, 56], ["C", 50, 8, 4, 28, 24, 8], ["C", 96, 56, 76, 8, 96, 28], ["L", 96, 80], ["Q", 84, 94, 96, 94], ["L", 16, 94], ["Q", 4, 80, 4, 94], ["Z"]] },
  { eye: [40, 58], cmds: CLOUD, flip: true },
  // three-bump cloud and its mirror
  { eye: [52, 62], cmds: CLOUD3 },
  { eye: [48, 62], cmds: CLOUD3, flip: true },
  // puffy ball: a round body with soft lumps
  { eye: [50, 52], cmds: [["M", 50, 6], ["C", 84, 22, 66, 0, 84, 8], ["C", 92, 62, 100, 30, 100, 52], ["C", 54, 94, 88, 86, 70, 96], ["C", 10, 70, 34, 94, 8, 86], ["C", 18, 24, 0, 54, 4, 30], ["C", 50, 6, 26, 12, 38, 4]] },
  // wide bean with a lumpy top
  { eye: [54, 60], cmds: [["M", 14, 88], ["C", 12, 46, 0, 86, 0, 54], ["C", 58, 30, 26, 34, 42, 24], ["C", 96, 58, 80, 36, 98, 42], ["C", 84, 88, 96, 80, 94, 88], ["Z"]] },
  // round blob
  { eye: [50, 52], cmds: [["M", 50, 4], ["C", 96, 50, 80, 4, 96, 22], ["C", 50, 96, 96, 78, 80, 96], ["C", 4, 50, 20, 96, 4, 78], ["C", 50, 4, 4, 22, 20, 4]] },
];
function bodyPath(shape, rnd) {
  const turn = (x, y) => { for (let r = 0; r < (shape.rot ?? 0); r++) [x, y] = [100 - y, x]; return [shape.flip ? 100 - x : x, y]; };
  const j = (v) => `${(v + (rnd() - 0.5) * 0).toFixed(1)}%`;
  let b = PathBuilder.fill();
  for (const [c, ...n] of shape.cmds) {
    const p = [];
    for (let k = 0; k < n.length; k += 2) p.push(...turn(n[k], n[k + 1]).map(j));
    if (c === "M") b = b.move_to(p[0], p[1]);
    else if (c === "L") b = b.line_to(p[0], p[1]);
    else if (c === "Q") b = b.curve_to(p[0], p[1], p[2], p[3]);
    else if (c === "C") b = b.cubic_bezier_to(p[0], p[1], p[2], p[3], p[4], p[5]);
    else b = b.close();
  }
  return b.build();
}
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  // A counter-based generator (splitmix-style), so similar addresses still get unrelated looks.
  let n = 0;
  return () => {
    let x = (h + Math.imul(++n, 0x9e3779b9)) | 0;
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  };
}
const shade = (c, f) => "#" + [1, 3, 5].map(i => Math.round(parseInt(c.slice(i, i + 2), 16) * f).toString(16).padStart(2, "0")).join("");
const mix = (a, b) => "#" + [1, 3, 5].map(i => Math.round((parseInt(a.slice(i, i + 2), 16) + parseInt(b.slice(i, i + 2), 16)) / 2).toString(16).padStart(2, "0")).join("");
// Each space has its own color (space.colors, set in the spaces list); its agents
// get gradients from that color's family, nudged in hue and lightness per agent, so
// agents of one space look alike and different spaces are easy to tell apart.
const SPACE_MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
function toHsl(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.min(1, Math.max(0, s)); l = Math.min(0.8, Math.max(0.25, l));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return "#" + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("");
}
function familyPalette(space, r1, r2, r3) {
  const color = (shared("space.colors") ?? {})[space] ?? "ansi6";
  const base = color.startsWith("#") ? color : SPACE_MARK[color];
  if (!base || base.length !== 7) return null;
  const [h, s, l] = toHsl(base);
  const h1 = h + (r1 - 0.5) * 30, dl = (r2 - 0.5) * 0.14;
  return [fromHsl(h1, s, l + dl + 0.05), fromHsl(h1 + (r3 < 0.5 ? -1 : 1) * 24, s, l + dl - 0.1)];
}
function creature(a, size, closed = false, gaze = null) {
  const rnd = hash(a.address ?? "agent");
  const shape = SHAPES[Math.floor(rnd() * SHAPES.length)];
  // Green is the odd one out in the reference, so it only comes up about one time in twelve.
  const [r1, r2, r3, r4] = [rnd(), rnd(), rnd(), rnd()];
  const [c1, c2] = familyPalette(a.space, r1, r2, r3) ?? (r4 < 0.08 ? PALETTES[PALETTES.length - 1] : PALETTES[Math.floor(r1 * (PALETTES.length - 1))]);
  const angle = rnd() * 60 + 150;
  let body;
  try {
    body = globalThis.window.paint_path(bodyPath(shape, rnd), Background.linear_gradient(angle, c1, c2)).absolute().left(0).top(0).size(size);
  } catch {
    body = div().absolute().left(0).top(0).size(size).rounded(size * 0.3).bg(c1);
  }
  // A dark eye with a white pupil, round or a tall oval, as in the reference.
  const ew = Math.max(7, Math.round(size * 0.52)), eh = Math.round(ew * 1.1);
  const oval = rnd() < 0.5;
  const pw = Math.max(2, Math.round(ew * (oval ? 0.36 : 0.5))), ph = Math.max(3, Math.round(oval ? eh * 0.68 : pw));
  const ex = size * shape.eye[0] / 100 - ew / 2 + (rnd() - 0.5) * 2, ey = size * shape.eye[1] / 100 - eh / 2;
  const mx = (ew - pw) / 2, my = (eh - ph) / 2;
  rnd(); // was the glance period; still drawn so the picks after it stay put
  // Blinks squash the whole eye flat; the view decides when (see animator) and the
  // transition animates it natively.
  const blinkH = 1.5;
  const blush = rnd() < 0.5, moonRight = rnd() < 0.6;
  return div().relative().size(size).flex_none()
    .child(body)
    .when(blush, (el) => el.child(div().absolute().left(ex - 1).top(ey + eh - 1).w(3).h(1.5).rounded_full().bg("#f0a0b860")))
    // The eye is a dark tint of the body; a slightly smaller black circle sits against one side,
    // leaving a moon-shaped sliver of that tint on the other.
    .child(div().id(`eye-${a.address}-${size}`).absolute().left(ex).w(ew).rounded_full().bg(shade(c2, 0.42)).overflow_hidden()
      .top(closed ? ey + (eh - blinkH) / 2 : ey).h(closed ? blinkH : eh)
      .transition("top", { duration: 70, easing: "ease-in" }).transition("height", { duration: 70, easing: "ease-in" })
      .child(div().absolute().w(ew * 0.84).h(eh * 0.86).rounded_full().bg("#0e0e14")
        .top(eh * 0.07).when(moonRight, (el) => el.left(0)).when(!moonRight, (el) => el.left(ew * 0.16)))
      .child(div().id(`pupil-${a.address}-${size}`).absolute().w(pw).h(ph).rounded_full().bg("#ffffff")
        // Rests where it looks (gaze -1..1 on each axis) and glides there natively: no
        // continuous motion, so no pixel jitter at this size.
        .left(mx * (1 + 0.5 * (gaze?.x ?? 0))).top(my * (1 + 0.5 * (gaze?.y ?? 0)))
        .transition("left", { duration: 180, easing: "ease-out" }).transition("top", { duration: 180, easing: "ease-out" })));
}

// Now and then blinks a few of the shown creatures and sends a few glancing somewhere.
// Only redraws when something changed, and not while the window is hidden.
const GLANCES = [[-1, 0], [1, 0], [-0.7, -0.8], [0.7, -0.8], [-0.7, 0.8], [0.7, 0.8], [0, -1], [0, 1]];
function animator(view, cx, keys) {
  view.blinking = new Set();
  view.gaze = new Map();
  cx.timer.every(1500, (cx) => {
    if (window()?.visible === false) return;
    const shown = keys();
    const blinks = shown.filter(() => Math.random() < 0.2);
    let moved = false;
    for (const k of shown) {
      if (Math.random() >= 0.15) continue;
      // Back to the middle about half the time, otherwise a glance somewhere.
      const looking = view.gaze.has(k) && Math.random() < 0.55;
      if (looking) view.gaze.delete(k);
      else { const [x, y] = GLANCES[Math.floor(Math.random() * GLANCES.length)]; view.gaze.set(k, { x, y }); }
      moved = true;
    }
    if (!blinks.length && !moved) return;
    for (const k of blinks) view.blinking.add(k);
    cx.notify();
    if (blinks.length) cx.timer.after(130, (cx) => { for (const k of blinks) view.blinking.delete(k); cx.notify(); });
  });
}

export default class Agents extends View {
  init(_props, cx) {
    if (props()?.sortMenu) return;
    this.folded = new Set();
    // Each agent's last state and when it changed (ms), kept across restarts.
    try { this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}"); } catch { this.changed = {}; }
    if (!this.changed || typeof this.changed !== "object" || Array.isArray(this.changed)) this.changed = {};
    try { this.pendingPins = JSON.parse(localStorage.getItem("pins") ?? "[]"); } catch { this.pendingPins = []; }
    if (!Array.isArray(this.pendingPins)) this.pendingPins = [];
    if (!this.pendingPins.length) localStorage.removeItem("pins");
    this.migratingPins = new Set();
    cx.timer.every(30000, (cx) => cx.notify());
    this.shownAgents = [];
    animator(this, cx, () => this.shownAgents);
  }

  // Stamps agents whose state changed. Done and idle count as one: looking at a
  // finished agent turns done into idle, and looking isn't the agent doing anything.
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      this.changed[a.address] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    // Gone and old: the list alone is empty right after a start.
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  // Keep offline pins until their terminal returns, and keep each pending until
  // core echoes the label so a failed write doesn't erase the old pin.
  migratePins(all) {
    const listed = new Map(all.filter((t) => t.state === "live").map((t) => [t.address, t]));
    const pending = this.pendingPins.filter((address) => {
      const terminal = listed.get(address);
      if (!terminal) return true;
      if (terminal.labels?.["herdr.pinned"]) return false;
      if (!this.migratingPins.has(address)) {
        this.migratingPins.add(address);
        run("terminal.pin", { terminal: address, pinned: true });
      }
      return true;
    });
    if (pending.length === this.pendingPins.length) return;
    this.pendingPins = pending;
    if (pending.length) localStorage.setItem("pins", JSON.stringify(pending));
    else localStorage.removeItem("pins");
  }

  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }

  rank(a) {
    return RANK[a.status] ?? 0;
  }

  sortMenu(t) {
    const on = sortOf().id;
    return v_flex()
      .w_full()
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).child("Sort agents"))
      .children(SORTS.map((s) => h_flex()
        .id(`sort-${s.id}`)
        .h(31)
        .px(8)
        .gap(9)
        .rounded(7)
        .items_center()
        .text_color(t.foreground)
        .hover((el) => el.bg(t.hover))
        .on_click(() => {
          setShared("agents.sort", s.id);
          closeOverlay(props().overlay);
        })
        .child(svg(`mods/workspace-chrome/${s.icon}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().child(s.label))
        .when(s.id === on, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(14).flex_none().text_color(t.foreground)))));
  }

  peek(addr) {
    run("terminal.peek", { terminal: addr });
  }

  // Live sub-agents of `addr`, depth first, each with the tree lines in front of it.
  tree(all, addr, lead = []) {
    const kids = all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [
        { t: k, lines: [...lead, last ? "└" : "├"] },
        ...this.tree(all, k.address, [...lead, last ? "" : "│"]),
      ];
    });
  }

  subRow(t, s, shown, compact) {
    const k = s.t;
    const st = kidStatus(k, this.listed);
    const pic = icon(k.program, 14, t.foreground);
    const on = k.address === shown;
    return h_flex()
      .id(`sub-${k.address}`)
      .pl(39)
      .pr(8)
      .rounded(8)
      .h(26)
      .flex_none()
      .gap(0)
      .items_center()
      .text_size(12.5)
      .when(on, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => (this.listed.has(k.address) ? run("pane.focus", { terminal: k.address }) : this.peek(k.address)))
      .children(s.lines.map(l => div().self_start().mt(-4).w(9).h(17).mr(4).flex_none()
        .when(Boolean(l), el => el.border_l(1.5).border_color(t.input))
        .when(l === "└" || l === "├", el => el.border_b(1.5).rounded_bl(6))))
      .when(Boolean(pic), el => el.child(div().mr(8).child(pic)))
      .child(div().flex_1().truncate().text_color(on ? t.foreground : t.muted).child(k.name || k.template || k.program?.name || k.address))
      .child(this.status(t, { status: st }, compact));
  }

  // compact: a ! for blocked where a header already says "Needs you".
  status(t, a, compact = false) {
    const color = t[a.status] ?? t.dim;
    if (a.status === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).flex_none().text_color(t.working).spin(900);
    if (a.status === "blocked" && compact) return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
    if (a.status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
    // Idle: a ring; done: a dot.
    if (a.status === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
    return div().size(7).mx(3).flex_none().rounded(4).bg(a.status === "done" ? color : t.dim + "00");
  }

  render(cx) {
    const t = theme();
    if (props()?.sortMenu) return this.sortMenu(t);
    const collapsed = narrow();
    const sort = sortOf();
    let list = agents();
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    this.shownAgents = list.map((a) => a.address);
    const all = terminals();
    this.migratePins(all);
    const shown = focused()?.agent;
    const now = Date.now();
    this.track(list, now);
    // A kept sub-agent (one with a pane) is in agents() too: where a tree shows
    // it, it gets no row of its own, unless it's pinned.
    const nested = new Set(collapsed ? [] : list.flatMap((a) => this.tree(all, a.address).map((s) => s.t.address)));
    list = list.filter((a) => a.pinned || !nested.has(a.address));
    const tabCounts = new Map();
    for (const a of list) tabCounts.set(a.tab, (tabCounts.get(a.tab) ?? 0) + 1);
    const byPriority = sort.id === "priority";
    // A helper's done is its own row's news: it doesn't pull a working parent out of Working.
    const kidRank = (k) => { const s = kidStatus(k, this.listed); return RANK[s === "done" ? "idle" : s] ?? 0; };
    const urgency = new Map(list.map((a) => [a.address, Math.max(this.rank(a), ...this.tree(all, a.address).map((s) => kidRank(s.t)))]));
    const rankOf = (a) => urgency.get(a.address);
    if (byPriority) list = [...list].sort((x, y) => rankOf(y) - rankOf(x) || this.since(y) - this.since(x) || y.seq - x.seq);
    const pinned = list.filter((a) => a.pinned);
    const rest = list.filter((a) => !a.pinned);
    list = [...pinned, ...rest];
    setAgentOrder(list.map((a) => a.address));

    const withKids = (a, i) => {
      const subs = collapsed ? [] : this.tree(all, a.address);
      const r = row(a, i, subs);
      if (this.folded.has(a.address)) return [r];
      return [r, ...subs.map((s) => this.subRow(t, s, shown, byPriority))];
    };

    // The fold chevron; folded, the count too, colored by the most urgent one.
    const fold = (a, subs) => {
      const sts = subs.map((s) => kidStatus(s.t, this.listed));
      const top = sts.reduce((m, s) => ((RANK[s] ?? 0) > (RANK[m] ?? 0) ? s : m), null);
      const open = !this.folded.has(a.address);
      return div()
        .id(`fold-${a.address}`)
        .h(18)
        .px(3)
        .gap(3)
        .flex()
        .items_center()
        .rounded(4)
        .text_size(11)
        .text_color(open ? t.dim : (t[top] ?? t.dim))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          open ? this.folded.add(a.address) : this.folded.delete(a.address);
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none())
        .when(!open, (el) => el.child(String(subs.length)));
    };

    // A row reads "space \u00b7 detail": the detail is a tab someone named or the
    // agent's own title, never an automatic tab number unless two rows would
    // otherwise read the same.
    // Read the pane snapshot once: every host read copies the whole list into JS.
    const leads = leadPanes(panes());
    const tabs = new Map(spaces().flatMap(s => s.tabs).map(tab => [tab.id, tab]));
    const labels = new Map(list.map(a => {
      const tab = tabs.get(a.tab);
      const many = tabCounts.get(a.tab) > 1;
      return [a.address, tab ? title(many ? { ...tab, named: false } : tab, many ? a : leads.get(a.tab)) : (a.title || a.program?.name || "")];
    }));
    const label = (a) => labels.get(a.address);
    const detail = new Map(list.map(a => [a.address, /^\d+$/.test(label(a)) ? null : label(a)]));
    const seen = {};
    for (const a of list) { const k = `${a.space_name}\u0000${detail.get(a.address) ?? ""}`; seen[k] = (seen[k] ?? 0) + 1; }
    for (const a of list) {
      if (detail.get(a.address) == null && seen[`${a.space_name}\u0000`] > 1) detail.set(a.address, label(a));
    }

    const row = (a, i, subs = []) => {
      const pic = creature(a, collapsed ? 20 : 16, this.blinking?.has(a.address), this.gaze?.get(a.address));
      const more = detail.get(a.address);
      // An agent on another machine (`vps/t7`) says which.
      const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
      if (collapsed) {
        const nm = a.program?.name ?? "agent";
        return h_flex()
          .id(`ag-${a.address}`)
          .relative()
          .size(34)
          .mx(9)
          .rounded(9)
          .flex_none()
          .items_center()
          .justify_center()
          .tooltip(`${nm} · ${a.status ?? "idle"}`)
          .when(a.focused, (el) => el.bg(t.selected))
          .hover((s) => s.bg(t.hover))
          .on_click(() => run("pane.focus", { pane: a.pane }))
          .child(pic ?? div().text_color(t.muted).child(nm[0]?.toUpperCase() ?? "?"))
          .when(a.status && a.status !== "idle", (el) => el.child(div().absolute().right(2).bottom(2).child(
            a.status === "working" ? svg("mods/my-workspace-chrome/spinner.svg").size(11).text_color(t.working).spin(900)
            : div().size(8).rounded_full().border(1.5).border_color(t.chrome).bg(t[a.status] ?? t.dim))));
      }
      const when = this.since(a);
      const idle = a.status === "idle" && !a.focused;
      const isPinned = a.pinned;
      const pin = div()
        .id(`pin-${a.address}`)
        .flex_none()
        .p(2)
        .rounded(4)
        .text_color(t.dim)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(isPinned ? "Unpin" : "Pin to the top")
        .on_click((_e, cx) => {
          cx.stop_propagation();
          run("terminal.pin", { terminal: a.address, pinned: !isPinned });
          // The row moves away from under the pointer, and no hover-out comes.
          this.hovered = null;
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${isPinned ? "pin-off" : "pin"}.svg`).size(13));
      // Under a space header the space goes without saying; an automatic tab number says nothing.
      // Without a space header above (priority, pinned) the row names its space.
      const full = byPriority || isPinned;
      const name = full ? a.space_name || label(a) : more ?? (/^\d+$/.test(label(a)) ? a.program?.name || label(a) : label(a));
      return h_flex()
        .id(`ag-${a.address}`)
        .px(7)
        .h(30)
        .flex_none()
        .rounded(8)
        .items_center()
        .gap(9)
        .when(a.focused, (el) => el.bg(t.selected))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_hover((on, cx) => {
          if (on) this.hovered = a.address;
          else if (this.hovered === a.address) this.hovered = null;
          cx.notify();
        })
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .when(Boolean(pic), el => el.child(div().id(`agent-fold-${a.address}`)
          .when(subs.length > 0, el => el.on_click((_e, cx) => {
            cx.stop_propagation();
            this.folded.has(a.address) ? this.folded.delete(a.address) : this.folded.add(a.address);
            cx.notify();
          })).child(pic)))
        .child(h_flex().flex_1().min_w(0).gap(5).items_center()
          .child(div().min_w(0).max_w(full && more ? 120 : 200).pt(1).truncate().text_color(idle ? t.muted : t.foreground).child(name))
          .when(full && Boolean(more), el => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`\u00b7 ${more}`))))
        .when(Boolean(machine), el => el.child(div().text_size(10).text_color(t.dim).child(machine)))
        .when(subs.length > 0, el => el.child(fold(a, subs)))
        .when(this.hovered === a.address, el => el.child(pin))
        .when(this.hovered !== a.address && Boolean(when), el => el.child(div().flex_none().text_size(11).text_color(t.dim).child(duration(now - when))))
        .child(this.status(t, a, byPriority && !isPinned));
    };

    // Groups in list order: spaces (grouped) or priority sections. Agents of a
    // space are next to each other in agents(), so neighbours make a group.
    const groups = pinned.length ? [{ id: "pinned", label: "Pinned", status: null, members: pinned }] : [];
    for (const a of rest) {
      const r = rankOf(a) || RANK.idle;
      const id = byPriority ? `sec-${r}` : `sp-${a.space}`;
      if (groups.at(-1)?.id === id) groups.at(-1).members.push(a);
      else groups.push({ id, label: byPriority ? SECTION[r] : a.space_name || "", status: byPriority ? SECTION_STATUS[r] : null, members: [a] });
    }

    // A group's header; it folds the group. Folded, it says how many and the most urgent state.
    const header = (g) => {
      const open = !this.folded.has(g.id);
      const top = g.members.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
      return h_flex()
        .id(g.id)
        .px(8)
        .pt(8)
        .h(30)
        .flex_none()
        .gap(6)
        .items_center()
        .text_size(11)
        .font_medium()
        .cursor_pointer()
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => {
          open ? this.folded.add(g.id) : this.folded.delete(g.id);
          cx.notify();
        })
        .child(div().truncate().text_color(t[g.status] ?? t.dim).child(g.label))
        .when(byPriority || !open, (el) => el.child(div().text_color(t.dim).child(String(g.members.length))))
        .child(div().flex_1())
        .when(!open, (el) => el
          .when(!byPriority && top && top !== "idle", (el) => el.child(this.status(t, { status: top }, true)))
          .child(svg("mods/workspace-chrome/chevron-right.svg").size(11).flex_none().text_color(t.dim)));
    };
    const rows = collapsed
      ? list.flatMap(withKids)
      : groups.flatMap((g) => [header(g), ...(this.folded.has(g.id) ? [] : g.members.flatMap(withKids))]);

    return v_flex()
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      .when(Boolean(props()?.lines), (el) => el.border_t(1).border_color(t.border))
      .text_size(13)
      .when(!collapsed, (el) =>
        el.child(
          h_flex()
            .px(16)
            .h(41)
            .pt(14)
            .pb(5)
            .flex_none()
            .items_center()
            .justify_between()
            .child(div().text_size(11.5).font_medium().text_color(t.dim).child("Agents"))
            .child(
              div()
                .id("ag-sort")
                .text_size(11)
                .text_color(t.dim)
                .hover((s) => s.text_color(t.foreground))
                .on_click(() => openOverlay({ mod: "my-agents", kind: "popup", width: 200, height: 140, props: { sortMenu: true } }))
                .tooltip(`Sort agents: ${sort.label}`)
                .child(svg(`mods/workspace-chrome/${sort.icon}.svg`).size(14)),
            ),
        ),
      )
      .when(list.length === 0 && !collapsed, (el) =>
        el.child(div().px(12).text_size(12).text_color(t.dim).child("No agents yet. They appear here once they report a status.")),
      )
      .child(v_flex().id("ag-list").flex_1().min_h(0).gap(3).when(collapsed, (el) => el.pt(10)).px(collapsed ? 0 : 8).overflow_y_scrollbar().mode("always").children(rows));
  }
}
