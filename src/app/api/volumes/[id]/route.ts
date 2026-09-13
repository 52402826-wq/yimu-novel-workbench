import { NextResponse } from "next/server";
import { deleteVolume } from "@/db/queries";

export const runtime = "nodejs";

type VolumeContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: VolumeContext) {
  const { id } = await context.params;
  const deleted = await deleteVolume(id);

  if (!deleted) {
    return NextResponse.json({ message: "没有找到这一卷。" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
