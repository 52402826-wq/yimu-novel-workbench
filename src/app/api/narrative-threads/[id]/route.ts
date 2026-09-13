import { NextResponse } from "next/server";
import { deleteNarrativeThread, updateNarrativeThread } from "@/db/queries";

export const runtime = "nodejs";

type ThreadContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: ThreadContext) {
  const { id } = await context.params;
  const thread = await updateNarrativeThread(id, await request.json());

  if (!thread) {
    return NextResponse.json({ message: "没有找到这条叙事线索。" }, { status: 404 });
  }

  return NextResponse.json({ thread });
}

export async function DELETE(_request: Request, context: ThreadContext) {
  const { id } = await context.params;
  const deleted = await deleteNarrativeThread(id);

  if (!deleted) {
    return NextResponse.json({ message: "没有找到这条叙事线索。" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
