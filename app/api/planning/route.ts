import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TASK_COLORS } from "@/lib/planning";

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

function parseBody(body: Record<string, unknown>) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return { error: "title required" as const };
  const startAt = asDate(body.startAt);
  const endAt = asDate(body.endAt);
  if (!startAt || !endAt) return { error: "start and end required" as const };
  const first = startAt <= endAt ? startAt : endAt;
  const last = startAt <= endAt ? endAt : startAt;
  const color = typeof body.color === "string" && TASK_COLORS.includes(body.color) ? body.color : TASK_COLORS[0];
  return {
    data: {
      title,
      assignee: typeof body.assignee === "string" ? body.assignee.trim() : "",
      notes: typeof body.notes === "string" ? body.notes.trim() : "",
      color,
      startAt: first,
      endAt: last,
      allDay: body.allDay !== false,
      done: body.done === true,
    },
  };
}

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const from = asDate(req.nextUrl.searchParams.get("from"));
  const to = asDate(req.nextUrl.searchParams.get("to"));
  const tasks = await prisma.planTask.findMany({
    where:
      from && to
        ? { startAt: { lte: to }, endAt: { gte: from } }
        : undefined,
    orderBy: [{ startAt: "asc" }, { title: "asc" }],
  });
  return NextResponse.json(
    { tasks: tasks.map(serialize) },
    { headers: { "Cache-Control": "private, max-age=10" } }
  );
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const body = (await req.json()) as Record<string, unknown>;
  const parsed = parseBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const task = await prisma.planTask.create({
    data: { ...parsed.data, createdBy: user.id ?? user.name ?? "" },
  });
  return NextResponse.json({ task: serialize(task) });
}
