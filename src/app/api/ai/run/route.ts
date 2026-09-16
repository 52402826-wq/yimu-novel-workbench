import { NextResponse } from "next/server";
import { resolveAiRuntimeProvider } from "@/db/queries";
import { runAiTask, type AiProvider, type AiTaskMode, type AiWritingAction } from "@/features/ai/router";

export const runtime = "nodejs";

const supportedModes = ["默认", "创作", "分析", "快速"];
const supportedActions = ["分析当前章节", "分析当前 Scene", "续写建议", "润色建议", "改写建议", "故事构建", "创作对话"];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      mode?: string;
      action?: string;
      providerId?: string | null;
      modelName?: string;
      prompt?: string;
      context?: unknown;
    };
    const mode = normalizeMode(body.mode);
    const action = normalizeAction(body.action);

    if (!action) {
      return NextResponse.json({ message: "请选择一个 AI 写作动作。" }, { status: 400 });
    }

    const provider = await resolveAiRuntimeProvider({
      mode,
      providerId: body.providerId,
      modelName: body.modelName,
    });

    if (!provider) {
      return NextResponse.json({ message: "还没有可用的 AI Provider。请先在 AI 设置中心添加并启用 Provider。" }, { status: 400 });
    }

    const result = await runAiTask({
      provider: provider.provider as AiProvider,
      providerName: provider.name,
      providerId: provider.id,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      mode,
      modelName: provider.modelName,
      action,
      temperature: provider.temperature / 100,
      topP: provider.topP / 100,
      maxTokens: provider.maxTokens,
      maxContextChars: provider.maxContextChars,
      prompt: body.prompt,
      context: body.context as Parameters<typeof runAiTask>[0]["context"],
    });

    return NextResponse.json({
      result: {
        text: result.text,
        providerName: result.providerName,
        modelName: result.modelName,
        mode: result.mode,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 请求失败。";
    return NextResponse.json({ message }, { status: 500 });
  }
}

function normalizeMode(mode?: string): AiTaskMode {
  if (mode && supportedModes.includes(mode)) {
    return mode as AiTaskMode;
  }
  return "默认";
}

function normalizeAction(action?: string): AiWritingAction | null {
  if (action && supportedActions.includes(action)) {
    return action as AiWritingAction;
  }
  return null;
}
