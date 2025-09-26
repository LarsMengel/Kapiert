// export-svgs.js
// Usage: node export-svgs.js ./input ./output 650 945 2
// 650x945 ≈ 300 dpi für 55×80 mm; deviceScaleFactor 2 = extra scharf

const fs = require("fs/promises");
const path = require("path");
const puppeteer = require("puppeteer"); // NICHT puppeteer-core

function stripXmlDecl(svgText) {
  return svgText.replace(/^\s*<\?xml[^>]*\?>\s*/i, "");
}

function extractViewBox(svgOpenTag) {
  const m = svgOpenTag.match(/viewBox\s*=\s*"([^"]+)"/i);
  return m ? m[1] : null;
}

function splitSvg(svgText) {
  // Trennt in <svg ...> + inneres Markup
  const open = svgText.match(/<svg[^>]*>/i);
  const closeIdx = svgText.lastIndexOf("</svg>");
  if (!open || closeIdx === -1) return { open: "<svg>", inner: svgText };
  return { open: open[0], inner: svgText.slice(open.index + open[0].length, closeIdx) };
}

async function main() {
  const [inputDir = "./input", outputDir = "./output", w = "650", h = "945", scale = "1"] =
    process.argv.slice(2);
  const width = parseInt(w, 10);
  const height = parseInt(h, 10);
  const deviceScaleFactor = parseFloat(scale);

  await fs.mkdir(outputDir, { recursive: true });

  const files = (await fs.readdir(inputDir))
    .filter(f => f.toLowerCase().endsWith(".svg"))
    .sort();

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  // Viewport = Zielgröße; deviceScaleFactor steuert Schärfe
  await page.setViewport({ width, height, deviceScaleFactor });

  for (const file of files) {
    const abs = path.resolve(inputDir, file);
    let svg = await fs.readFile(abs, "utf8");

    svg = stripXmlDecl(svg);
    const { open, inner } = splitSvg(svg);
    const vb = extractViewBox(open) || "0 0 744 1052"; // Fallback

    // HTML-Hülle: weißer Hintergrund, eine definierte Stage (width x height),
    // darin das Original-SVG als "nested svg" mit preserveAspectRatio=meet
    const html = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          html,body { margin:0; background:#fff; }
          #stage { width:${width}px; height:${height}px; }
          #stage > svg { width:100%; height:100%; display:block; }
        </style>
      </head>
      <body>
        <div id="stage">
          <svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet">
            ${inner}
          </svg>
        </div>
      </body>
      </html>
    `;

    await page.setContent(html, { waitUntil: "load" });

    const outPath = path.join(outputDir, path.basename(file, ".svg") + ".png");
    // Screenshot nur der Stage (exakt width x height)
    const stage = await page.$("#stage");
    await stage.screenshot({ path: outPath, type: "png", omitBackground: false });

    console.log("✔︎", outPath);
  }

  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
