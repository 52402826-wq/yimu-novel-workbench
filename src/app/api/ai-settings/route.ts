import { NextResponse } from "next/server";
import { createAiProviderSetting, getAiSettings } from "@/db/queries";

export const runtime = "nodejs";

export async function GET() {
  try {
    const settings = await getAiSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ message: safeAiSettingsError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      provider?: string;
      baseUrl?: string;
      apiKey?: string;
      defaultModel?: string;
    };

    if (!body.name?.trim() || !body.provider?.trim()) {
      return NextResponse.json({ message: "请提供供应商名称和类型。" }, { status: 400 });
    }

    const provider = await createAiProviderSetting({
      name: body.name,
      provider: body.provider,
      baseUrl: body.baseUrl,
      apiKey: body.apiKey,
      defaultModel: body.defaultModel,
    });

    return NextResponse.json({ provider }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: safeAiSettingsError(error) }, { status: 500 });
  }
}

function safeAiSettingsError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("SQLITE_READONLY")) {
    return "数据库当前不可写。请重新启动本地工作台服务，或确认创作数据目录有写入权限。";
  }
  return "AI 设置保存失败。";
}
