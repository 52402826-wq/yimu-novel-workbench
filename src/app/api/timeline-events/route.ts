import { NextResponse } from "next/server";
import { createTimelineEvent } from "@/db/queries";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    projectId?: string;
    title?: string;
    eventTime?: string;
    type?: string;
    location?: string;
    participants?: string;
    sceneId?: string;
    summary?: string;
  };

  if (!body.projectId || !body.title?.trim()) {
    return NextResponse.json({ message: "请提供小说项目和事件标题。" }, { status: 400 });
  }

  const event = await createTimelineEvent(body.projectId, {
    title: body.title,
    eventTime: body.eventTime,
    type: body.type,
    location: body.location,
    participants: body.participants,
    sceneId: body.sceneId,
    summary: body.summary,
  });

  return NextResponse.json({ event }, { status: 201 });
}
