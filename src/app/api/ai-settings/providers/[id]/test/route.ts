import { NextResponse } from "next/server";
import { resolveAiRuntimeProvider } from "@/db/queries";
import { runAiTask, type AiProvider } from "@/features/ai/router";

export const runtime = "nodejs";

type ProviderTestContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: ProviderTestContext) {
  try {
    const { id } = await context.params;
    const provider = await resolveAiRuntimeProvider({
      mode: "默认",
      providerId: id,
    });

    if (!provider) {
      return NextResponse.json({ message: "没有找到这个 Provider。" }, { status: 404 });
    }

    const result = await runAiTask({
      provider: provider.provider as AiProvider,
      providerName: provider.name,
      providerId: provider.id,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      mode: "默认",
      modelName: provider.modelName,
      action: "分析当前 Scene",
      prompt: "这是 Provider 连通性测试。请只回复一句中文：连接正常。",
      context: {
        scene: {
          title: "Provider 测试",
          summary: "测试指定 Provider 的 Base URL、API Key 和默认模型是否可用。",
          goal: "确认连接正常",
          conflict: "",
          outcome: "",
          contentText: "这是一段测试正文。",
        },
      },
    });

    return NextResponse.json({
      ok: true,
      providerName: result.providerName,
      modelName: result.modelName,
      text: result.text,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider 测试失败。";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
