import { NextResponse } from "next/server";
import { createLibraryItem } from "@/db/queries";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { projectId?: string; type?: string; title?: string };

  if (!body.projectId || !body.type?.trim() || !body.title?.trim()) {
    return NextResponse.json({ message: "请提供小说、类型和资料标题。" }, { status: 400 });
  }

  const item = await createLibraryItem(body.projectId, body.type, body.title);
  return NextResponse.json({ item }, { status: 201 });
}
