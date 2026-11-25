// Ctrl-click a file path in a terminal: show it in the Files panel.
import { setShared, run } from "herdr";

const BINARY = /\.(png|jpe?g|gif|webp|bmp|ico|pdf|zip|gz|tar|7z|exe|dll|mp3|mp4|mov|woff2?|ttf|otf)$/i;

export function handleLink({ link }) {
  if (link.kind !== "file" || !link.path || BINARY.test(link.path)) return "pass";
  setShared("files.open", { id: Date.now(), path: link.path, line: link.line ?? null });
  run("layout.select", { stack: "panel-body", child: "files" });
  run("layout.show", { id: "panel" });
  return "handled";
}
