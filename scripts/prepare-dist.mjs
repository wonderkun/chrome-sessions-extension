/**
 * Vite 已将 public/ 复制到 dist/；此脚本仅作提示与校验。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const need = [
  "manifest.json",
  "sidepanel.html",
  "background.js",
  "content/aliyun-float.js",
  "icon16.png",
];

for (const f of need) {
  const p = path.join(dist, f);
  if (!fs.existsSync(p)) {
    console.error("缺少:", p);
    process.exit(1);
  }
}
console.log("dist/ 就绪：在 chrome://extensions 中加载 dist 目录。");
