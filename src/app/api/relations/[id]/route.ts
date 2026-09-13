import { NextResponse } from "next/server";
import { deleteRelation } from "@/db/queries";

export const runtime = "nodejs";

type RelationContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RelationContext) {
  const { id } = await context.params;
  const deleted = await deleteRelation(id);

  if (!deleted) {
    return NextResponse.json({ message: "没有找到这条关系。" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
