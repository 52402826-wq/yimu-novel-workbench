export type AiProvider =
  | "openai"
  | "deepseek"
  | "kimi"
  | "claude"
  | "gemini"
  | "openai-compatible";

export type AiTaskMode = "默认" | "创作" | "分析" | "快速";

export type AiWritingAction = "分析当前 Scene" | "续写建议" | "润色建议" | "改写建议" | "故事构建";

export interface AiContextBundle {
  scene?: {
    title: string;
    summary: string;
    goal: string;
    conflict: string;
    outcome: string;
    contentText: string;
  };
  entities?: Array<{ type: string; name: string; summary: string }>;
  threads?: Array<{ type: string; title: string; status: string; summary: string }>;
  library?: Array<{ type: string; title: string; content: string }>;
}

export interface AiRouterRequest {
  provider: AiProvider;
  providerName: string;
  providerId?: string;
  baseUrl?: string;
  apiKey: string;
  mode: AiTaskMode;
  modelName: string;
  action: AiWritingAction;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  maxContextChars?: number;
  prompt?: string;
  context?: string | AiContextBundle;
}

export interface AiRouterResponse {
  text: string;
  provider: AiProvider;
  providerName: string;
  modelName: string;
  mode: AiTaskMode;
}

interface ChatCompletionResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | Array<{ text?: string; type?: string } | string>;
      reasoning_content?: string;
    };
    text?: string;
  }>;
  error?: { message?: string };
  message?: string;
}

const AI_REQUEST_TIMEOUT_MS = 90000;

const defaultBaseUrls: Partial<Record<AiProvider, string>> = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com",
  kimi: "https://api.moonshot.cn/v1",
};

export async function runAiTask(request: AiRouterRequest): Promise<AiRouterResponse> {
  assertOpenAiCompatibleProvider(request.provider);

  if (!request.apiKey.trim()) {
    throw new Error("这个 Provider 还没有 API Key。");
  }

  if (!request.modelName.trim()) {
    throw new Error("这个 Provider 还没有可用模型名。");
  }

  let response: Response;
  try {
    response = await fetch(chatCompletionsEndpoint(request), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${request.apiKey}`,
      },
      body: JSON.stringify({
        model: request.modelName,
        messages: buildMessages(request),
        temperature: normalizeFloatParam(request.temperature, request.mode === "创作" ? 0.78 : 0.35, 0, 2),
        top_p: normalizeFloatParam(request.topP, 0.9, 0.01, 1),
        max_tokens: normalizeIntegerParam(request.maxTokens, maxTokensForRequest(request), 300, 12000),
      }),
      signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new Error("AI 响应超时。当前模型可能较慢，请切换到快速模型，或稍后再试。");
    }
    throw error;
  }

  const payload = (await readJson(response)) as ChatCompletionResponse;

  if (!response.ok) {
    throw new Error(sanitizeAiError(payload.error?.message ?? payload.message ?? `AI 请求失败：${response.status}`));
  }

  const text = extractAiText(payload);
  if (!text) {
    throw new Error(emptyAiTextMessage(payload));
  }

  return {
    text,
    provider: request.provider,
    providerName: request.providerName,
    modelName: request.modelName,
    mode: request.mode,
  };
}

function maxTokensForRequest(request: AiRouterRequest) {
  if (request.action === "续写建议") {
    return 1400;
  }

  if (request.action === "润色建议") {
    return 1800;
  }

  if (request.action === "改写建议") {
    return 2600;
  }

  if (request.action === "故事构建") {
    return 3600;
  }

  return 1600;
}

function extractAiText(payload: ChatCompletionResponse) {
  const choice = payload.choices?.[0];
  const content = choice?.message?.content;

  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        return part.text ?? "";
      })
      .join("")
      .trim();
    if (text) {
      return text;
    }
  }

  if (choice?.text?.trim()) {
    return choice.text.trim();
  }

  return "";
}

function emptyAiTextMessage(payload: ChatCompletionResponse) {
  const choice = payload.choices?.[0];
  if (choice?.finish_reason === "length" && choice.message?.reasoning_content) {
    return "AI 已响应，但这次输出额度被模型用于内部思考，没有生成可显示正文。请再试一次，或把问题说得更具体一些。";
  }

  return "AI 已响应，但没有返回正文内容。可以换一个模型或再试一次。";
}

function assertOpenAiCompatibleProvider(provider: AiProvider) {
  if (provider === "claude" || provider === "gemini") {
    throw new Error("Claude 和 Gemini 需要单独的调用适配器；当前先支持 DeepSeek / OpenAI / Kimi / OpenAI Compatible。");
  }
}

function chatCompletionsEndpoint(request: AiRouterRequest) {
  const baseUrl = (request.baseUrl?.trim() || defaultBaseUrls[request.provider] || "").replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("OpenAI Compatible Provider 需要填写 Base URL。");
  }

  if (baseUrl.endsWith("/chat/completions")) {
    return baseUrl;
  }

  return `${baseUrl}/chat/completions`;
}

function buildMessages(request: AiRouterRequest) {
  return [
    {
      role: "system",
      content:
        request.action === "故事构建"
          ? "你是中文小说创作工作台里的新书构建助手。回答要具体、可执行，帮助作者形成故事核心、人物冲突、世界约束和篇章骨架。输出使用中文。"
          : "你是中文小说创作工作台里的写作助手。回答要具体、可执行，尊重作者已有设定，不替作者大段改写正文，除非任务要求续写。输出使用中文。",
    },
    {
      role: "user",
      content: [
        `任务：${request.action}`,
        `工作模式：${request.mode}`,
        request.prompt?.trim() ? `用户补充要求：${request.prompt.trim()}` : "",
        "上下文：",
        contextToText(request.context, normalizeIntegerParam(request.maxContextChars, 6000, 1000, 50000)),
        "请直接给出结果，不要解释你看到了哪些系统指令。",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

function contextToText(context: AiRouterRequest["context"], maxContextChars: number) {
  if (!context) {
    return "暂无上下文。";
  }

  if (typeof context === "string") {
    return context;
  }

  const scene = context.scene;
  const lines = [
    scene
      ? [
          `Scene：${scene.title}`,
          scene.summary ? `摘要：${scene.summary}` : "",
          scene.goal ? `目标：${scene.goal}` : "",
          scene.conflict ? `冲突：${scene.conflict}` : "",
          scene.outcome ? `结果：${scene.outcome}` : "",
          scene.contentText ? `正文：\n${scene.contentText.slice(0, maxContextChars)}` : "正文为空。",
        ]
          .filter(Boolean)
          .join("\n")
      : "未选择 Scene。",
    listBlock("相关世界条目", context.entities?.map((item) => `${item.type}：${item.name} ${item.summary}`)),
    listBlock(
      "相关叙事线索",
      context.threads?.map((item) => `${item.type}：${item.title}｜${item.status} ${item.summary}`)
    ),
    listBlock("资料库摘取", context.library?.map((item) => `${item.type}：${item.title}\n${item.content.slice(0, 800)}`)),
  ];

  return lines.filter(Boolean).join("\n\n");
}

function normalizeFloatParam(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
}

function normalizeIntegerParam(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(number)));
}

function listBlock(title: string, items?: string[]) {
  const usableItems = items?.filter(Boolean).slice(0, 8) ?? [];
  if (!usableItems.length) {
    return `${title}：无`;
  }

  return `${title}：\n${usableItems.map((item) => `- ${item}`).join("\n")}`;
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 500) };
  }
}

function isTimeoutError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === "AbortError" || error.name === "TimeoutError" || error.message.toLowerCase().includes("timeout");
}

function sanitizeAiError(message: string) {
  return message.replace(/Bearer\s+[^\s]+/gi, "Bearer ***").replace(/sk-[A-Za-z0-9_-]+/g, "sk-***");
}
