import { NextResponse } from "next/server";
import { scanDocumentSource } from "@/features/import/documents";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sourcePath?: string };
    if (!body.sourcePath?.trim()) {
      return NextResponse.json({ message: "请填写 Markdown 文件或文件夹路径。" }, { status: 400 });
    }

    const files = await scanDocumentSource(body.sourcePath);
    return NextResponse.json({ files });
  } catch (error) {
    const message = error instanceof Error ? error.message : "扫描文档失败。";
    return NextResponse.json({ message }, { status: 500 });
  }
}
