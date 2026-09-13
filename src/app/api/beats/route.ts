import { NextResponse } from "next/server";
import { createBeat } from "@/db/queries";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { sceneId?: string; title?: string };

  if (!body.sceneId || !body.title?.trim()) {
    return NextResponse.json({ message: "请提供 Scene 和 Beat 名称。" }, { status: 400 });
  }

  const beat = await createBeat(body.sceneId, body.title);
  return NextResponse.json({ beat }, { status: 201 });
}
