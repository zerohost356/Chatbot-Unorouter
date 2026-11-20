import fs from "node:fs/promises";
import path from "node:path";

export interface SkillMeta {
  name: string;
  description: string;
  path: string;
}

const SKILL_ROOT = path.join(process.cwd(), "src", "skill");

let cache: { at: number; skills: SkillMeta[]; prompt: string } | null = null;
const CACHE_MS = 60_000;

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw.trim() };
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key) meta[key] = value;
  }
  return { meta, body: m[2].trim() };
}

async function walk(dir: string): Promise<string[]> {
  let entries: any[] = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (entry.isFile() && entry.name.toLowerCase() === "skill.md") files.push(full);
  }
  return files;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…(truncated)`;
}

export async function loadSkills(): Promise<{ skills: SkillMeta[]; prompt: string }> {
  if (cache && Date.now() - cache.at < CACHE_MS) return { skills: cache.skills, prompt: cache.prompt };
  const files = await walk(SKILL_ROOT);
  const skills: SkillMeta[] = [];
  const sections: string[] = [];
  for (const file of files.sort()) {
    let raw = "";
    try {
      raw = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
    const { meta, body } = parseFrontmatter(raw);
    const rel = path.relative(process.cwd(), file);
    const name = meta.name || path.basename(path.dirname(file));
    const description = meta.description || "No description";
    skills.push({ name, description, path: rel });
    sections.push(`### ${name}\n${description}\nPath: ${rel}\n\n${truncate(body, 2400)}`);
  }
  const prompt = skills.length
    ? `\n\n## Web tools & skills (auto-select when needed)
This chat can fetch real websites. Use **web_fetch** when the user asks to open/read/fetch/check/search/summarize a website or URL, or when live page content is needed.

- **web_fetch** (skill: web-fetch): fetch and read a live URL. Args: {"url":"https://...","maxChars":12000}

Tool call format (required): when a tool is needed, output ONLY this block and stop. Put the <tool_call> block in your assistant content (not inside reasoning/thinking), with no other text before or after and no DSML/XML-invoke/function-call wrappers:
<tool_call>
{"name":"web_fetch","arguments":{"url":"https://example.com"}}
</tool_call>

After a tool result is returned, continue and answer using that result. Never claim to have fetched a page unless you actually used a tool and received its result. If the user asks to fetch/read/search a URL or website, you must emit the tool call.

Installed skills:
${skills.map((s) => `- ${s.name}: ${s.description}`).join("\n")}

${sections.join("\n\n---\n\n")}`
    : "";
  cache = { at: Date.now(), skills, prompt };
  return { skills, prompt };
}
