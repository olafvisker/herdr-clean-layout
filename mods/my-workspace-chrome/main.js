import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, window, shared, setShared, updates, layout, agents } from "herdr";

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

// Collapse swaps the sidebar (min 177, resizable) for the fixed 52px rail, and back.
// Herdr leaves "hidden" off a node that is shown.
const railShown = () => { const r = find(layout(), "sidebar-rail"); return Boolean(r) && !r.hidden; };

function toggleSidebar() {
  const rail = railShown();
    // Show first: hiding the node this button lives in can drop the commands after it.
  run("layout.show", { id: rail ? "sidebar" : "sidebar-rail" });
  run("layout.hide", { id: rail ? "sidebar-rail" : "sidebar" });
}

export default class WorkspaceChrome extends View {
  init() { this.hovered = false; }
  button(id, label, action, tip) {
    const t = theme();
    return div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).tooltip(tip).child(label);
  }
  render() {
    // Ctrl+Shift+B shows the sidebar on its own; never leave the rail beside it.
    if (!props()?.footer && !narrow() && !find(layout(), "sidebar")?.hidden && railShown()) run("layout.hide", { id: "sidebar-rail" });
    // Saved widths from before the 177px minimum would otherwise stay narrow.
    if (!props()?.footer && !narrow() && (find(layout(), "sidebar")?.size?.px ?? 177) < 177) run("layout.resize", { id: "sidebar", px: 177 });
    const t = theme();
    const collapsed = narrow();
    if (props()?.footer) {
      const row = (id, icon, label, dim, action, tip = label) => h_flex().id(id).h(28).px(8).gap(9).items_center().rounded(8)
        .when(collapsed, el => el.relative().w(32).px(0).justify_center().tooltip(label))
        .text_color(dim ? t.dim : t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
        .tooltip(tip).on_click(action).child(svg(`mods/my-workspace-chrome/${icon}.svg`).size(14))
        .when(!collapsed, el => el.child(label));
      const ready = div().size(6).rounded_full().bg(t.accent);
      return v_flex().size_full().bg(t.chrome).px(8).pt(4).pb(8).text_size(13)
        .when(collapsed, el => el.px(0).items_center())
        .child(row("settings", "settings", "Settings", false, () => run("app.settings"), "Settings (Ctrl+,)")
          .when(Boolean(updates().app.ready), el => el.child(collapsed ? ready.absolute().top(5).right(6) : ready)))
        .child(row("machine", "plus", "Add machine", true, () => run("mod.open", { name: "machine-add" })));
    }
    if (collapsed) {
      // Rail: just the logo (never a spinner); hover shows the expand button.
      const mark = image("frame/welcome/herdr.png").size(20).rounded(5);
      return h_flex().size_full().bg(t.chrome).items_center().justify_center()
        .child(h_flex().id("rail-brand").size(34).rounded(9).items_center().justify_center().cursor_pointer()
          .tooltip("Expand sidebar")
          .on_hover((h, cx) => { this.hovered = h; cx.notify(); })
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .hover((s) => s.bg(t.hover))
          .on_click(toggleSidebar)
          .child(this.hovered ? svg("mods/my-workspace-chrome/sidebar.svg").size(16).text_color(t.foreground) : mark));
    }
    return h_flex().size_full().bg(t.chrome).pl(collapsed ? 6 : 14).pr(10).gap(4).items_center().text_size(13.5)
      .when(window()?.platform === "macos" && !window()?.fullscreen && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(h_flex().flex_1().gap(8).items_center().child(image("frame/welcome/herdr.png").size(20).rounded(5)).child(div().font_semibold().text_color(t.foreground).child("Herdr"))))
      .when(!collapsed, el => el.child(this.button("search", svg("mods/my-workspace-chrome/search.svg").size(15), () => run("mod.open", { name: "picker" }), "Search (Ctrl+Shift+K)")))
      // On the macOS rail the traffic lights fill the row; the agents list's » unfolds it.
      .when(!(collapsed && window()?.platform === "macos"), el => el.child(this.button("sidebar-toggle", svg("mods/my-workspace-chrome/sidebar.svg").size(15), toggleSidebar, "Toggle sidebar (Ctrl+Shift+B)")));
  }
}
