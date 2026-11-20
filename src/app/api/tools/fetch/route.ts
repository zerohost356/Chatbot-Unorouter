import { fetchWeb } from "@/lib/toolRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { url?: string; maxChars?: number };
    const url = typeof body.url === "string" ? body.url : "";
    if (!url.trim()) {
      return Response.json({ ok: false, error: "url is required" }, { status: 400 });
    }
    const maxChars = typeof body.maxChars === "number" ? body.maxChars : 12000;
    const result = await fetchWeb(url, maxChars);
    return Response.json({ ok: result.ok, output: result.output });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
