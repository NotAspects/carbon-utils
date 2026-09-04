import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TASK_COLORS } from "@/lib/planning";
import type { Prisma } from "@prisma/client";

function serialize(task: {
  id: string;
  title: string;
  assignee: string;
  notes: string;
  color: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  done: boolean;
}) {
  return {
    id: task.id,
    title: task.title,
    assignee: task.assignee,
    notes: task.notes,
    color: task.color,
    startAt: task.startAt.toISOString(),
    endAt: task.endAt.toISOString(),
    allDay: task.allDay,
    done: task.done,
  };
}

function asDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const existing = await prisma.planTask.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await req.json()) as Record<string, unknown>;
  const data: Prisma.PlanTaskUpdateInput = {};
  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
    data.title = title;
  }
  if (typeof body.assignee === "string") data.assignee = body.assignee.trim();
  if (typeof body.notes === "string") data.notes = body.notes.trim();
  if (typeof body.color === "string" && TASK_COLORS.includes(body.color)) data.color = body.color;
  if (typeof body.allDay === "boolean") data.allDay = body.allDay;
  if (typeof body.done === "boolean") data.done = body.done;
  const startAt = asDate(body.startAt);
  const endAt = asDate(body.endAt);
  if (startAt) data.startAt = startAt;
  if (endAt) data.endAt = endAt;
  if (startAt && endAt && startAt > endAt) {
    data.startAt = endAt;
    data.endAt = startAt;
  }

  const task = await prisma.planTask.update({ where: { id: params.id }, data });
  return NextResponse.json({ task: serialize(task) });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  try {
    await prisma.planTask.delete({ where: { id: params.id } });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
