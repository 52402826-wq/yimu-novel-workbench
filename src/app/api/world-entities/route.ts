import { NextResponse } from "next/server";
import { createWorldEntity } from "@/db/queries";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { projectId?: string; type?: string; name?: string };

  if (!body.projectId || !body.type?.trim() || !body.name?.trim()) {
    return NextResponse.json({ message: "请提供小说、类型和名称。" }, { status: 400 });
  }

  const entity = await createWorldEntity(body.projectId, body.type, body.name);
  return NextResponse.json({ entity }, { status: 201 });
}
