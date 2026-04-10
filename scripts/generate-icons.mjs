import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public");

const R = 59;
const G = 130;
const B = 246;

function writeIcon(size, filename) {
  const png = new PNG({ width: size, height: size, colorType: 6 });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      png.data[idx] = R;
      png.data[idx + 1] = G;
      png.data[idx + 2] = B;
      png.data[idx + 3] = 255;
    }
  }
  fs.writeFileSync(path.join(outDir, filename), PNG.sync.write(png, { colorType: 6 }));
}

fs.mkdirSync(outDir, { recursive: true });
writeIcon(16, "icon16.png");
writeIcon(48, "icon48.png");
writeIcon(128, "icon128.png");
console.log("icons → public/");
