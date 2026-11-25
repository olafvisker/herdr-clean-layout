// A pane's header, for layouts that frame their panes:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "my-pane" } } } }
// Shows the program's icon (the app's program table), the agent's name or
// the terminal's title, the folder, and the agent's status; buttons split, zoom and close
// this pane. Props from the app: { pane, terminal }. Click: focus the pane.

import { View, div, svg, image, PathBuilder, Background } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, agents, props, run, theme, home, layout, window, shared } from "herdr";

// Match the first visible tab frame, including the active child of a stack.
function paneFrame(node) {
  if (!node || node.hidden) return null;
  if (node.content?.tab && node.content.pane) return node.content.pane;
  let children = node.children ?? [];
  if (node.type === "stack") {
    const visible = children.filter(child => !child.hidden);
    children = [visible.find(child => child.id === node.active) ?? visible[0]];
  }
  for (const child of children) {
    const frame = paneFrame(child);
    if (frame) return frame;
  }
  return null;
}

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

// Copied from my-agents (keep the two in sync) so a pane shows the same creature as the sidebar.
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
  // more bodies, ported from the Pen project's agent avatars
  // round
  { eye: [50, 50], cmds: [["M", 50.0, 0], ["C", 100, 50.0, 77.6, 0, 100, 22.4], ["C", 50.0, 100, 100, 77.6, 77.6, 100], ["C", 0, 50.0, 22.4, 100, 0, 77.6], ["C", 50.0, 0, 0, 22.4, 22.4, 0], ["Z"]] },
  // tile
  { eye: [50, 50], cmds: [["M", 18.8, 3.1], ["L", 81.2, 3.1], ["C", 100, 21.9, 91.6, 3.1, 100, 11.5], ["L", 100, 84.4], ["C", 81.2, 100, 100, 94.7, 91.6, 100], ["L", 18.8, 100], ["C", 0, 84.4, 8.4, 100, 0, 94.7], ["L", 0, 21.9], ["C", 18.7, 3.1, 0, 11.5, 8.4, 3.1], ["Z"]] },
  // shield
  { eye: [50, 44], cmds: [["M", 6.2, 6.2], ["L", 93.8, 6.2], ["L", 93.8, 56.2], ["C", 50.0, 100, 93.8, 80.4, 74.2, 100], ["C", 6.2, 56.2, 25.8, 100, 6.3, 80.4], ["Z"]] },
  // notched
  { eye: [50, 52], cmds: [["M", 0, 28.1], ["C", 23.4, 1.6, 0, 14.3, 9.6, 2.4], ["C", 50.0, 25.0, 37.2, 0.7, 49.1, 11.2], ["C", 76.6, 1.6, 50.9, 11.2, 62.8, 0.7], ["C", 100, 28.1, 90.4, 2.4, 100, 14.3], ["L", 100, 62.5], ["C", 50.0, 100, 100, 83.2, 77.6, 100], ["C", 0, 62.5, 22.4, 100, 0, 83.2], ["Z"]] },
  // speech
  { eye: [46, 48], cmds: [["M", 50.0, 0], ["C", 100, 50.0, 78.1, 0, 100, 21.9], ["C", 50.0, 100, 100, 81.2, 75.0, 100], ["L", 6.2, 100], ["L", 6.2, 50.0], ["C", 50.0, 0, 6.2, 21.9, 25.0, 0], ["Z"]] },
  // diamond
  { eye: [50, 50], cmds: [["M", 43.4, 4.4], ["C", 56.6, 4.4, 47.1, 0.8, 52.9, 0.8], ["L", 95.6, 43.4], ["C", 95.6, 56.6, 99.2, 47.1, 99.2, 52.9], ["L", 56.6, 95.6], ["C", 43.4, 95.6, 52.9, 99.2, 47.1, 99.2], ["L", 4.4, 56.6], ["C", 4.4, 43.4, 0.8, 52.9, 0.8, 47.1], ["Z"]] },
  // ghost
  { eye: [50, 42], cmds: [["M", 6.2, 43.8], ["C", 50.0, 0, 6.2, 19.6, 25.8, 0], ["C", 93.8, 43.7, 74.2, 0, 93.8, 19.6], ["L", 93.8, 93.8], ["L", 79.1, 84.4], ["L", 64.7, 93.8], ["L", 50.0, 84.4], ["L", 35.3, 93.8], ["L", 20.9, 84.4], ["L", 6.2, 93.8], ["Z"]] },
  // hexagon
  { eye: [50, 50], cmds: [["M", 28.1, 3.1], ["L", 71.9, 3.1], ["L", 100, 50.0], ["L", 71.9, 96.9], ["L", 28.1, 96.9], ["L", 0, 50.0], ["Z"]] },
  // egg
  { eye: [50, 58], cmds: [["M", 50.0, 0], ["C", 93.8, 59.4, 75.0, 0, 93.8, 34.4], ["C", 50.0, 100, 93.8, 84.4, 75.0, 100], ["C", 6.2, 59.4, 25.0, 100, 6.2, 84.4], ["C", 50.0, 0, 6.2, 34.4, 25.0, 0], ["Z"]] },
  // keyhole
  { eye: [50, 34], cmds: [["M", 50.0, 0], ["C", 81.4, 20.7, 63.7, 0.1, 76.0, 8.2], ["C", 75.0, 57.8, 86.8, 33.3, 84.3, 47.8], ["L", 90.6, 90.6], ["C", 90.6, 97.0, 91.8, 92.6, 91.7, 95.0], ["C", 85.0, 100, 89.4, 98.9, 87.3, 100], ["L", 15.0, 100], ["C", 9.4, 97.0, 12.7, 100, 10.6, 98.9], ["C", 9.4, 90.6, 8.3, 95.0, 8.2, 92.6], ["L", 25.0, 57.8], ["C", 18.6, 20.7, 15.7, 47.8, 13.2, 33.3], ["C", 50.0, 0, 24.0, 8.2, 36.3, 0.1], ["Z"]] },
  // moon
  { eye: [38, 50], cmds: [["M", 62.5, 0], ["L", 87.5, 0], ["C", 96.9, 9.4, 92.7, 0, 96.9, 4.2], ["L", 96.9, 90.6], ["C", 87.5, 100, 96.9, 95.8, 92.7, 100], ["L", 62.5, 100], ["C", 12.5, 50.0, 34.9, 100, 12.5, 77.6], ["C", 62.5, 0, 12.5, 22.4, 34.9, 0], ["Z"]] },
  // flower
  { eye: [50, 50], cmds: [["M", 50.0, 0], ["C", 71.9, 15.6, 59.4, 0, 62.5, 12.5], ["C", 96.9, 21.9, 81.2, 18.8, 93.8, 12.5], ["C", 93.8, 50.0, 100, 31.2, 90.6, 40.6], ["C", 100, 78.1, 96.9, 59.4, 100, 68.8], ["C", 71.9, 87.5, 93.8, 87.5, 81.2, 81.2], ["C", 50.0, 100, 62.5, 93.8, 59.4, 100], ["C", 28.1, 87.5, 40.6, 100, 37.5, 90.6], ["C", 3.1, 81.2, 18.8, 84.4, 6.2, 90.6], ["C", 6.2, 53.1, 0, 71.9, 9.4, 62.5], ["C", 0, 25.0, 3.1, 43.8, 0, 34.4], ["C", 28.1, 15.6, 6.2, 15.6, 18.8, 21.9], ["C", 50.0, 0, 37.5, 9.4, 40.6, 0], ["Z"]] },
  // pebble
  { eye: [50, 52], cmds: [["M", 15.6, 28.1], ["C", 56.2, 9.4, 15.6, 0, 53.1, 3.1], ["C", 93.8, 34.4, 71.9, 0, 100, 6.2], ["C", 65.6, 90.6, 100, 56.2, 96.9, 90.6], ["C", 12.5, 71.9, 46.9, 100, 15.6, 93.8], ["C", 15.6, 28.1, 0, 59.4, 0, 34.4], ["Z"]] },
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

export default class Pane extends View {
  init(_props, cx) {
    this.hovered = false;
    animator(this, cx, () => {
      const p = this.me();
      const a = p?.program?.agent ? agents().find((x) => x.pane === p.pane) : null;
      return a ? [a.address] : [];
    });
  }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  button(t, id, icon, command, args, tip) {
    return div()
      .id(id)
      .p(3)
      .rounded(4)
      .tooltip(tip)
      .text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/my-pane/${icon}.svg`).size(14));
  }

  render(cx) {
    const t = theme();
    const p = this.me();
    if (!p) return div();
    const name = p.name || ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const agent = p.program?.agent ? agents().find((a) => a.pane === p.pane) : null;
    const pic = agent ? creature(agent, 14, this.blinking?.has(agent.address), this.gaze?.get(agent.address)) : icon(p.program, 14, t.dim);
    const st = p.status;
    const pane = p.pane;
    const bottom = paneFrame(layout())?.header?.position === "bottom";
    // Subtle focus cue: the focused pane's header is raised, with a bright title and a thin top line.
    const on = Boolean(p.focused);
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      .px(10)
      .gap(8)
      .items_center()
      .bg(on ? t.raised : t.background)
      .border_b(1)
      .border_color(t.border)
      .text_size(12)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .on_mouse_down("middle", (_e, cx) => { cx.stop_propagation(); run("pane.close", { pane }); })
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_none().truncate().max_w(260).font_medium().text_color(on ? t.foreground : t.dim).child(name))
      .child(div().flex_1().truncate().text_color(t.dim).child(folder(p.cwd)))
      .when(st === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
      .when(st === "blocked", el => el.child(div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).child("Needs you")))
      .when(st === "done", el => el.child(div().size(7).flex_none().rounded(4).bg(t.done)))
      .when(this.hovered, el => el
        .child(this.button(t, `ph-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }, "Split right (Ctrl+Shift+O)"))
        .child(this.button(t, `ph-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }, "Split down (Ctrl+Shift+E)"))
        .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }, `${p.zoomed ? "Unzoom" : "Zoom"} (Ctrl+Shift+Z)`))
        .child(this.button(t, `ph-x-${pane}`, "close", "pane.close", { pane }, "Close pane (Ctrl+Shift+X, or middle-click header)")));
  }
}
