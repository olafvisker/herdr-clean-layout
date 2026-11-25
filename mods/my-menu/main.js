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
      if (sel) { run("terminal.copy", { terminal }); run("terminal.clear_selection", { terminal }); }
      else run("terminal.paste", { terminal });
    }
    if (overlay) closeOverlay(overlay);
  }
  render() { return div(); }
}
