function decodeEntities(html: string): string {
  return html
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function htmlToText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeEntities((titleMatch?.[1] ?? "").replace(/\s+/g, " ").trim());
  let body = html;
  body = body.replace(/<script[\s\S]*?<\/script>/gi, " ");
  body = body.replace(/<style[\s\S]*?<\/style>/gi, " ");
  body = body.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  body = body.replace(/<!--[\s\S]*?-->/g, " ");
  body = body.replace(/<br\s*\/?>/gi, "\n");
  body = body.replace(/<\/(p|div|section|article|header|footer|li|h[1-6]|tr|blockquote|pre)>/gi, "\n");
  body = body.replace(/<li[^>]*>/gi, "- ");
  body = body.replace(/<[^>]+>/g, " ");
  body = decodeEntities(body);
  body = body
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return { title, text: body };
}

export async function fetchWeb(url: string, maxChars = 12000): Promise<{ ok: boolean; output: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, output: `Invalid URL: ${url}` };
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return { ok: false, output: "Only http/https URLs are supported." };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": "AuroraWorkspaceBot/1.0 (+https://localhost)",
        Accept: "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    const ctype = res.headers.get("content-type") || "";
    const finalUrl = res.url || parsed.toString();
    const buf = Buffer.from(await res.arrayBuffer());
    let output = "";
    if (/text\/html|application\/xhtml\+xml/i.test(ctype) || (!ctype && /^\s*</.test(buf.toString("utf8", 0, 200)))) {
      const { title, text } = htmlToText(buf.toString("utf8"));
      output = `URL: ${finalUrl}\nStatus: ${res.status}\nTitle: ${title || "(none)"}\n\n${text || "(no readable text)"}`;
    } else if (/json|text|xml|javascript/i.test(ctype)) {
      output = `URL: ${finalUrl}\nStatus: ${res.status}\nContent-Type: ${ctype}\n\n${buf.toString("utf8")}`;
    } else {
      output = `URL: ${finalUrl}\nStatus: ${res.status}\nContent-Type: ${ctype || "unknown"}\n\n(binary content, ${buf.length} bytes)`;
    }
    if (output.length > maxChars) output = `${output.slice(0, maxChars)}\n…(truncated)`;
    return { ok: res.ok, output };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, output: `Fetch failed: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}
