import { View, div } from "gpui-kit";
import { props, run, closeOverlay, terminals } from "herdr";

// Terminal right-click without a menu, like Windows Terminal: copies the
// selection if there is one, otherwise pastes. Programs that take the mouse
// get the right-click themselves.
export default class SilentMenu extends View {
  init() {
    const { target, overlay } = props() ?? {};
    const terminal = target?.terminal;
    if (terminal) {
      run("terminal.right_click", { terminal, to: "program" });
      const sel = terminals().find(t => t.address === terminal)?.selection;
      // copy and paste take no arguments: they act on the focused terminal.
      if (target.pane) run("pane.focus", { pane: target.pane });
      if (sel) { run("terminal.copy"); run("terminal.clear_selection", { terminal }); }
      else run("terminal.paste");
    }
    if (overlay) closeOverlay(overlay);
  }
  render() { return div(); }
}
