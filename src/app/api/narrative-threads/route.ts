import { NextResponse } from "next/server";
import { createNarrativeThread } from "@/db/queries";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { projectId?: string; type?: string; title?: string; summary?: string };

  if (!body.projectId || !body.type?.trim() || !body.title?.trim()) {
    return NextResponse.json({ message: "请提供小说、类型和线索名称。" }, { status: 400 });
  }

  const thread = await createNarrativeThread(body.projectId, body.type, body.title, body.summary);
  return NextResponse.json({ thread }, { status: 201 });
}
