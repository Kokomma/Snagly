import { withRequestWorkspace } from "../../../lib/auth.mjs";
import { documentPdf } from "../../../lib/pdf.mjs";
export const runtime = "nodejs";
export async function POST(req) {
  try {
    return await withRequestWorkspace(req, async () => {
      const raw = await req.text();
      if (raw.length > 60000) throw new Error("Document is too long.");
      const { text, kind } = JSON.parse(raw);
      if (typeof text !== "string" || !text.trim() || text.length > 30000 || !["resume","letter"].includes(kind))
        throw new Error("Choose a resume or cover letter to download.");
      const name = kind === "resume" ? "Resume" : "Cover-letter";
      return new Response(await documentPdf(text, name), { headers: {
        "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"`, "Cache-Control": "no-store",
      } });
    });
  } catch (e) { return Response.json({ error: e.message }, { status: e.status || 400 }); }
}
