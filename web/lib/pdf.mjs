import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
let fontBytes;
export async function documentPdf(text, title = "Resume") {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  fontBytes ||= readFile(path.join(process.cwd(), "assets/fonts/NotoSans-Regular.ttf"));
  const font = await doc.embedFont(await fontBytes, { subset: true });
  doc.setTitle(title);
  const width = 595.28, height = 841.89, margin = 48, size = 10.5, leading = 16;
  let page, y;
  const newPage = () => { page = doc.addPage([width, height]); y = height - margin; };
  newPage();
  const supported = new Set(font.getCharacterSet());
  const safe = String(text).replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
  const draw = (line) => {
    if (y < margin + leading) newPage();
    page.drawText(line, { x: margin, y, font, size, color: rgb(.09,.12,.15) });
    y -= leading;
  };
  for (const paragraph of safe.split("\n")) {
    let line = "";
    for (const raw of paragraph) {
      const char = supported.has(raw.codePointAt(0)) ? raw : "?";
      if (font.widthOfTextAtSize(line + char, size) > width - margin * 2) {
        const split = line.lastIndexOf(" ");
        if (split > line.length / 2) { draw(line.slice(0,split)); line = line.slice(split+1) + char; }
        else { draw(line); line = char; }
      } else line += char;
    }
    draw(line);
  }
  return Buffer.from(await doc.save());
}
