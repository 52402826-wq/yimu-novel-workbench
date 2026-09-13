import { NextResponse } from "next/server";
import { deleteTimelineEvent, updateTimelineEvent } from "@/db/queries";

export const runtime = "nodejs";

type TimelineEventContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: TimelineEventContext) {
  const { id } = await context.params;
  const event = await updateTimelineEvent(id, await request.json());

  if (!event) {
    return NextResponse.json({ message: "没有找到这个时间轴事件。" }, { status: 404 });
  }

  return NextResponse.json({ event });
}

export async function DELETE(_request: Request, context: TimelineEventContext) {
  const { id } = await context.params;
  const deleted = await deleteTimelineEvent(id);

  if (!deleted) {
    return NextResponse.json({ message: "没有找到这个时间轴事件。" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
