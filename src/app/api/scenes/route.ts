import { NextResponse } from "next/server";
import { createScene } from "@/db/queries";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { chapterId?: string; title?: string };

  if (!body.chapterId || !body.title?.trim()) {
    return NextResponse.json({ message: "请提供章节和场景名。" }, { status: 400 });
  }

  const scene = await createScene(body.chapterId, body.title);
  return NextResponse.json({ scene }, { status: 201 });
}
