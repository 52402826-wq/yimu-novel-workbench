import { NextResponse } from "next/server";
import { deleteWorldEntity, updateWorldEntity } from "@/db/queries";

export const runtime = "nodejs";

type EntityContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: EntityContext) {
  const { id } = await context.params;
  const entity = await updateWorldEntity(id, await request.json());

  if (!entity) {
    return NextResponse.json({ message: "没有找到这个世界条目。" }, { status: 404 });
  }

  return NextResponse.json({ entity });
}

export async function DELETE(_request: Request, context: EntityContext) {
  const { id } = await context.params;
  const deleted = await deleteWorldEntity(id);

  if (!deleted) {
    return NextResponse.json({ message: "没有找到这个世界条目。" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
