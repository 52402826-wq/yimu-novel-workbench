import { NextResponse } from "next/server";
import { createRelation } from "@/db/queries";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    projectId?: string;
    sourceType?: string;
    sourceId?: string;
    targetType?: string;
    targetId?: string;
    relationType?: string;
    note?: string;
  };

  if (
    !body.projectId ||
    !body.sourceType?.trim() ||
    !body.sourceId?.trim() ||
    !body.targetType?.trim() ||
    !body.targetId?.trim() ||
    !body.relationType?.trim()
  ) {
    return NextResponse.json({ message: "请提供完整的关系信息。" }, { status: 400 });
  }

  const relation = await createRelation(body.projectId, {
    sourceType: body.sourceType,
    sourceId: body.sourceId,
    targetType: body.targetType,
    targetId: body.targetId,
    relationType: body.relationType,
    note: body.note,
  });

  return NextResponse.json({ relation }, { status: 201 });
}
