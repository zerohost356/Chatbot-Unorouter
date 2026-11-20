import { FALLBACK_MODEL, MODEL_OPTIONS } from "@/lib/chat";
import type { ModelInfo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIORITY = [
  "gpt-oss-120b:free",
  "deepseek-v4.1-flash:free",
  "deepseek-v4.1-flash-1017:free",
  "deepseek-v4-flash:free",
  "deepseek-v3.2:free",
  "glm-5.3-flash:free",
  "qwen3-coder-next:free",
  "minimax-m2.7:free",
  "qwen3.8-27b:free",
  "deepseek-v3.1:free",
];

const EXCLUDE = /embedding|whisper|tts|moderation/i;

interface Cache {
  at: number;
  models: ModelInfo[];
}

let cache: Cache | null = null;
const CACHE_MS = 10 * 60 * 1000;

const CURATED_FALLBACK: ModelInfo[] = [
  ...MODEL_OPTIONS,
  {
    id: "deepseek-v3.2:free",
    name: "DeepSeek V3.2",
    vendor: "DeepSeek · Free",
    description: "Higher-compute reasoning model with a 163k context window.",
    context: 163_840,
    reasoning: true,
    vision: false,
    free: true,
    available: true,
  },
  {
    id: "glm-5.3-flash:free",
    name: "GLM 5.3 Flash",
    vendor: "Z.ai · Free",
    description: "Multimodal flash model with a 1M context window.",
    context: 1_048_576,
    reasoning: true,
    vision: true,
    free: true,
    available: true,
  },
  {
    id: "qwen3-coder-next:free",
    name: "Qwen3 Coder Next",
    vendor: "Qwen · Free",
    description: "Coding-focused model tuned for agentic development.",
    context: 262_144,
    reasoning: false,
    vision: false,
    free: true,
    available: true,
  },
];

function titleize(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function displayVendor(ownedBy: string | undefined, isFree: boolean): string {
  const suffix = isFree ? " · Free" : " · UnoRouter";
  if (!ownedBy) return `UnoRouter${suffix}`;
  const pretty = ownedBy
    .replace(/-ai$/, "")
    .replace(/^z-ai$/i, "Z.ai")
    .replace(/^openai$/i, "OpenAI")
    .replace(/^deepseek$/i, "DeepSeek")
    .replace(/^qwen$/i, "Qwen")
    .replace(/^meta$/i, "Meta")
    .replace(/^mistralai$/i, "Mistral")
    .replace(/^minimax$/i, "MiniMax")
    .replace(/^google$/i, "Google");
  return `${pretty.charAt(0).toUpperCase()}${pretty.slice(1)}${suffix}`;
}

function toNum(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function toModel(raw: any): ModelInfo | null {
  const id = typeof raw?.id === "string" ? raw.id : "";
  if (!id) return null;
  if (raw?.type && raw.type !== "chat") return null;
  if (EXCLUDE.test(id)) return null;
  if (raw?.endpoints?.chat_completions && raw.endpoints.chat_completions.status !== "supported") {
    return null;
  }
  const capabilities = raw?.capabilities ?? {};
  const isFree = id.endsWith(":free");
  const modality = String(raw?.architecture?.modality ?? "").toLowerCase();
  const inputModalities = Array.isArray(raw?.architecture?.input_modalities)
    ? raw.architecture.input_modalities.map((m: unknown) => String(m).toLowerCase())
    : [];
  const vision = Boolean(capabilities.vision || modality.includes("image") || inputModalities.includes("image"));
  const pricing = raw?.pricing ?? raw?.endpoint?.pricing ?? {};
  const inputPrice = toNum(pricing.prompt ?? pricing.input ?? pricing.input_price ?? raw?.input_price);
  const outputPrice = toNum(pricing.completion ?? pricing.output ?? pricing.output_price ?? raw?.output_price);
  const maxOutput = toNum(raw?.max_output_tokens ?? raw?.top_provider?.max_completion_tokens ?? raw?.max_completion_tokens);
  return {
    id,
    name:
      raw.display_name ||
      raw.name ||
      titleize(id.replace(/:free$/, "")),
    vendor: displayVendor(raw.owned_by || raw.provider || raw.top_provider?.name, isFree),
    description: typeof raw.description === "string" ? raw.description.slice(0, 320) : undefined,
    context: typeof raw.context_window === "number" ? raw.context_window : toNum(raw?.context_length),
    maxOutput,
    reasoning: Boolean(capabilities.reasoning ?? raw?.supported_parameters?.includes?.("reasoning") ?? /reason/i.test(String(raw?.description ?? ""))),
    vision,
    free: isFree || raw?.pricing === "free" || raw?.is_free === true,
    recommended: id === FALLBACK_MODEL.id,
    available: raw?.available !== false,
    inputPrice,
    outputPrice,
  };
}

function rank(model: ModelInfo): number {
  const index = PRIORITY.indexOf(model.id);
  if (index !== -1) return index;
  if (model.id === "aurora-demo") return 200;
  let score = 100;
  if (model.recommended) score -= 20;
  if (model.free) score -= 10;
  if (model.reasoning) score -= 5;
  if (model.vision) score -= 3;
  return score;
}

export async function GET(req: Request): Promise<Response> {
  const providedKey = req.headers.get("x-unorouter-key")?.trim() || "";
  const defaultModel = (process.env.UNOROUTER_MODEL || process.env.LITEROUTER_MODEL) || FALLBACK_MODEL.id;
  const key = providedKey || process.env.UNOROUTER_API_KEY || process.env.LITEROUTER_API_KEY;

  if (!key) {
    return Response.json({
      models: [FALLBACK_MODEL],
      mode: "demo",
      defaultModel: FALLBACK_MODEL.id,
    });
  }

  if (!providedKey && cache && Date.now() - cache.at < CACHE_MS) {
    return Response.json({
      models: cache.models,
      mode: "live",
      defaultModel,
    });
  }

  const baseUrl = (process.env.UNOROUTER_BASE_URL || process.env.LITEROUTER_BASE_URL || "https://api.unorouter.com/v1").replace(/\/$/, "");

  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`models ${res.status}`);
    const json = (await res.json()) as any;
    const rawModels: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : [];
    const mapped = rawModels
      .map(toModel)
      .filter((m): m is ModelInfo => Boolean(m));
    const seen = new Set<string>();
    const models = mapped
      .filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      })
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

    const withDefault = models.some((m) => m.id === defaultModel)
      ? models
      : [
          {
            ...FALLBACK_MODEL,
            id: defaultModel,
            name: rawModels.find((m: any) => m?.id === defaultModel)?.display_name || titleize(defaultModel.replace(/:free$/, "")),
            vendor: defaultModel.endsWith(":free") ? "UnoRouter · Free" : "UnoRouter",
            free: defaultModel.endsWith(":free"),
          },
          ...models,
        ];

    const finalModels = [
      {
        id: "aurora-demo",
        name: "Aurora Demo",
        vendor: "Local · Offline",
        description: "Deterministic local stream — no network keys required.",
        context: 96_000,
        reasoning: true,
        vision: false,
        free: true,
        recommended: false,
        available: true,
      },
      ...withDefault,
    ].map((model) => ({ ...model, recommended: model.id === defaultModel }));

    if (!providedKey) cache = { at: Date.now(), models: finalModels };
    return Response.json({ models: finalModels, mode: "live", defaultModel });
  } catch {
    const models = [
      {
        id: "aurora-demo",
        name: "Aurora Demo",
        vendor: "Local · Offline",
        description: "Deterministic local stream — no network keys required.",
        context: 96_000,
        reasoning: true,
        vision: false,
        free: true,
        recommended: false,
        available: true,
      },
      ...CURATED_FALLBACK.map((model) => ({
        ...model,
        recommended: model.id === defaultModel,
      })),
    ];
    return Response.json({ models, mode: "live", defaultModel });
  }
}
