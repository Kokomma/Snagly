import { withRequestWorkspace } from "../../../lib/auth.mjs";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req) {
  try {
    return await withRequestWorkspace(req, async () => {
      if (Number(req.headers.get("content-length") || 0) > 5_300_000)
        throw new Error("Choose a CV under 5 MB.");
      const form = await req.formData(),
        file = form.get("cv");
      if (
        !file ||
        typeof file.arrayBuffer !== "function" ||
        file.size > 5_000_000
      )
        throw new Error("Choose a PDF, Word (.docx) or text CV under 5 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let text = "";
      if (
        file.name.toLowerCase().endsWith(".pdf") &&
        Buffer.from(bytes.slice(0, 4)).toString() === "%PDF"
      ) {
        const pdf = await getDocumentProxy(bytes);
        try {
          if (pdf.numPages > 40)
            throw new Error("Use a CV with 40 pages or fewer.");
          text = (await extractText(pdf, { mergePages: true })).text;
        } finally {
          await pdf.loadingTask.destroy();
        }
      } else if (
        file.name.toLowerCase().endsWith(".docx") &&
        bytes[0] === 80 &&
        bytes[1] === 75
      ) {
        text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) }))
          .value;
      } else if (file.name.toLowerCase().endsWith(".txt"))
        text = new TextDecoder().decode(bytes);
      else throw new Error("Choose a PDF, Word (.docx) or plain-text CV.");
      text = text.trim();
      if (text.length < 30)
        throw new Error(
          "No readable CV text found. Scanned PDFs need text recognition first, or paste your career history.",
        );
      if (text.length > 10000)
        throw new Error(
          "Your CV has too much text. Please use a shorter version under 10,000 characters.",
        );
      return Response.json(
        { text },
        { headers: { "Cache-Control": "no-store" } },
      );
    });
  } catch (e) {
    return Response.json(
      {
        error:
          e.message?.startsWith("Choose") ||
          e.message?.startsWith("No readable") ||
          e.message?.startsWith("Your CV") ||
          e.message?.startsWith("Use a CV")
            ? e.message
            : "Could not read this CV. Try exporting a fresh PDF or paste its text.",
      },
      { status: e.status || 400 },
    );
  }
}
