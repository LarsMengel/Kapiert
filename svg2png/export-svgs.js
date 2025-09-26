// export-svgs.js
// Ziel: Dokumentgröße 69×94 mm => 815×1110 px @ 300 dpi
//       Gestaltbarer Bereich 55×80 mm => 650×945 px, zentriert mit weißem Rand
// Usage: node export-svgs.js ./input ./output 2
//        (letzter Parameter = deviceScaleFactor, default 1)

const fs = require("fs/promises");
const path = require("path");
const puppeteer = require("puppeteer"); // NICHT puppeteer-core

// Fixe Pixelmaße bei 300 dpi (mm → inch → px gerundet)
const DOC_WIDTH_PX = 815;   // 69 mm
const DOC_HEIGHT_PX = 1110; // 94 mm
const AREA_WIDTH_PX = 650;  // 55 mm
const AREA_HEIGHT_PX = 945; // 80 mm

function stripXmlDecl(svgText) {
  return svgText.replace(/^\s*<\?xml[^>]*\?>\s*/i, "");
}

function extractViewBox(svgOpenTag) {
  const m = svgOpenTag.match(/viewBox\s*=\s*"([^"]+)"/i);
  return m ? m[1] : null;
}

function splitSvg(svgText) {
  const open = svgText.match(/<svg[^>]*>/i);
  const closeIdx = svgText.lastIndexOf("</svg>");
  if (!open || closeIdx === -1) return { open: "<svg>", inner: svgText };
  return { open: open[0], inner: svgText.slice(open.index + open[0].length, closeIdx) };
}

async function main() {
  const [inputDir = "./input", outputDir = "./output", scaleArg = "1"] = process.argv.slice(2);
  const deviceScaleFactor = parseFloat(scaleArg) || 1;

  await fs.mkdir(outputDir, { recursive: true });

  const files = (await fs.readdir(inputDir))
    .filter(f => f.toLowerCase().endsWith(".svg"))
    .sort();

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  // Viewport auf die Dokumentgröße setzen; DPR steuert die Schärfe
  await page.setViewport({
    width: DOC_WIDTH_PX,
    height: DOC_HEIGHT_PX,
    deviceScaleFactor
  });

  for (const file of files) {
    const abs = path.resolve(inputDir, file);
    let svg = await fs.readFile(abs, "utf8");
    svg = stripXmlDecl(svg);
    const { open, inner } = splitSvg(svg);
    const vb = extractViewBox(open) || "0 0 744 1052"; // Fallback, falls kein viewBox vorhanden

    // HTML-Hülle:
    // - ganze Seite in DOC_WIDTH/HEIGHT mit weißem Hintergrund
    // - darin eine zentrierte "content"-Box in AREA_WIDTH/HEIGHT
    // - das Original-SVG wird in die content-Box eingebettet und skaliert (preserveAspectRatio=meet)
    const html = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          html, body { margin:0; padding:0; background:#fff; }
          /* Stage = komplette Druckvorlage */
          #stage {
            box-sizing: border-box;
            width:${DOC_WIDTH_PX}px;
            height:${DOC_HEIGHT_PX}px;
            background:#fff;
            display:flex;
            align-items:center;
            justify-content:center;
          }
          /* Content = gestaltbarer Bereich */
          #content {
            box-sizing: border-box;
            width:${AREA_WIDTH_PX}px;
            height:${AREA_HEIGHT_PX}px;
            display:block;
          }
          /* Eingebettetes SVG passt sich dem content an */
          #content > svg {
            width:100%;
            height:100%;
            display:block;
          }
        </style>
      </head>
      <body>
        <div id="stage" role="img" aria-label="Druckvorlage 69x94 mm mit zentriertem Gestaltungsbereich 55x80 mm">
          <div id="content">
            <svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet">
              ${inner}
            </svg>
          </div>
        </div>
      </body>
      </html>
    `;

    await page.setContent(html, { waitUntil: "load" });

    const outPath = path.join(outputDir, path.basename(file, ".svg") + ".png");
    const stage = await page.$("#stage");
    await stage.screenshot({ path: outPath, type: "png", omitBackground: false });

    console.log("✔︎ Exportiert:", outPath);
  }

  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
