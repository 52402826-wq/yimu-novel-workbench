import { NextResponse } from "next/server";
import { deleteAiProviderSetting, updateAiProviderSetting } from "@/db/queries";

export const runtime = "nodejs";

type ProviderContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: ProviderContext) {
  try {
    const { id } = await context.params;
    const provider = await updateAiProviderSetting(id, await request.json());

    if (!provider) {
      return NextResponse.json({ message: "没有找到这个 AI Provider。" }, { status: 404 });
    }

    return NextResponse.json({ provider });
  } catch (error) {
    return NextResponse.json({ message: safeAiSettingsError(error) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: ProviderContext) {
  try {
    const { id } = await context.params;
    const deleted = await deleteAiProviderSetting(id);

    if (!deleted) {
      return NextResponse.json({ message: "没有找到这个 AI Provider。" }, { status: 404 });
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json({ message: safeAiSettingsError(error) }, { status: 500 });
  }
}

function safeAiSettingsError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("SQLITE_READONLY")) {
    return "数据库当前不可写。请重新启动本地工作台服务，或确认创作数据目录有写入权限。";
  }
  return "AI Provider 保存失败。";
}
