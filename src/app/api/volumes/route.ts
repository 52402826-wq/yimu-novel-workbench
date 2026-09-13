import { NextResponse } from "next/server";
import { createVolume } from "@/db/queries";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { projectId?: string; title?: string };

  if (!body.projectId || !body.title?.trim()) {
    return NextResponse.json({ message: "请提供小说和卷名。" }, { status: 400 });
  }

  const volume = await createVolume(body.projectId, body.title);
  return NextResponse.json({ volume }, { status: 201 });
}
