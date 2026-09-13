import { NextResponse } from "next/server";
import { deleteBeat } from "@/db/queries";

export const runtime = "nodejs";

type BeatContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: BeatContext) {
  const { id } = await context.params;
  const deleted = await deleteBeat(id);

  if (!deleted) {
    return NextResponse.json({ message: "没有找到这个 Beat。" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
