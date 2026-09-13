import { NextResponse } from "next/server";
import { createChapter } from "@/db/queries";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { volumeId?: string; title?: string };

  if (!body.volumeId || !body.title?.trim()) {
    return NextResponse.json({ message: "请提供卷和章节名。" }, { status: 400 });
  }

  const chapter = await createChapter(body.volumeId, body.title);
  return NextResponse.json({ chapter }, { status: 201 });
}
