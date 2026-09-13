import { NextResponse } from "next/server";
import { upsertAiModelAlias } from "@/db/queries";

export const runtime = "nodejs";

type AliasContext = {
  params: Promise<{ mode: string }>;
};

export async function PATCH(request: Request, context: AliasContext) {
  try {
    const { mode } = await context.params;
    const body = (await request.json()) as {
      providerId?: string | null;
      modelName?: string;
      temperature?: number;
      topP?: number;
      maxTokens?: number;
      maxContextChars?: number;
    };

    const alias = await upsertAiModelAlias(mode, body.providerId ?? null, body.modelName ?? "", {
      temperature: body.temperature,
      topP: body.topP,
      maxTokens: body.maxTokens,
      maxContextChars: body.maxContextChars,
    });
    return NextResponse.json({ alias });
  } catch (error) {
    return NextResponse.json({ message: safeAiSettingsError(error) }, { status: 500 });
  }
}

function safeAiSettingsError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("SQLITE_READONLY")) {
    return "数据库当前不可写。请重新启动本地工作台服务，或确认创作数据目录有写入权限。";
  }
  return "用途绑定保存失败。";
}
