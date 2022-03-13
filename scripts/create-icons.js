const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const TextToSVG = require("text-to-svg");

const textToSVG = TextToSVG.loadSync(
  path.resolve(__dirname, "..", "static", "fonts", "Damion-Regular.ttf")
);

const getSvg = (
  d,
  fill
) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="${fill}">
  <path transform="translate(52 14)" d="${d}" />
</svg>`;

const d = textToSVG.getD("z", {
  x: 0,
  y: 0,
  fontSize: 192,
  anchor: "center middle",
});

const mask = getSvg(d, "#000");
const favicon = getSvg(d, "#00a500");

fs.writeFileSync(
  path.resolve(__dirname, "..", "static", "mask-icon.svg"),
  mask
);
fs.writeFileSync(
  path.resolve(__dirname, "..", "static", "favicon.svg"),
  favicon
);

spawnSync("convert", [
  "-background",
  "none",
  "-size",
  "256x256",
  path.resolve(__dirname, "..", "static", "favicon.svg"),
  path.resolve(__dirname, "..", "static", "favicon.png"),
]);
spawnSync("convert", [
  "-background",
  "none",
  "-size",
  "16x16",
  path.resolve(__dirname, "..", "static", "favicon.svg"),
  path.resolve(__dirname, "..", "static", "favicon.ico"),
]);
