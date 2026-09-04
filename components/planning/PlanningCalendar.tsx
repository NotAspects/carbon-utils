"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import {
  TASK_COLORS,
  addDays,
  atLocal,
  dayKey,
  fromDayKey,
  isToday,
  layoutWeek,
  monthLabel,
  monthWeeks,
  mondayOf,
  overlapsDay,
  parseDay,
  sameMonth,
  startOfDay,
  type PlanTask,
} from "@/lib/planning";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type View = "day" | "week" | "month";
type Draft = {
  id?: string;
  title: string;
  assignee: string;
  notes: string;
  color: string;
  start: string;
  end: string;
  done: boolean;
};

function emptyDraft(day: Date): Draft {
  const key = dayKey(day);
  return {
    title: "",
    assignee: "",
    notes: "",
    color: TASK_COLORS[0],
    start: key,
    end: key,
    done: false,
  };
}

function fromTask(task: PlanTask): Draft {
  return {
    id: task.id,
    title: task.title,
    assignee: task.assignee,
    notes: task.notes,
    color: task.color,
    start: dayKey(parseDay(task.startAt)),
    end: dayKey(parseDay(task.endAt)),
    done: task.done,
  };
}

export default function PlanningCalendar() {
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [view, setView] = useState<View>("month");
  const [tasks, setTasks] = useState<PlanTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignee, setAssignee] = useState("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const from = addDays(new Date(cursor.getFullYear(), cursor.getMonth(), 1), -7);
    const to = addDays(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0), 7);
    const res = await fetch(
      `/api/planning?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`
    );
    const data = (await res.json()) as { tasks?: PlanTask[] };
    setTasks(data.tasks ?? []);
    setLoading(false);
  }, [cursor]);

  useEffect(() => {
    void load();
  }, [load]);

  const people = useMemo(() => {
    const names = [...new Set(tasks.map((t) => t.assignee.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    );
    return names;
  }, [tasks]);

  const visible = useMemo(
    () => (assignee === "all" ? tasks : tasks.filter((t) => t.assignee === assignee)),
    [tasks, assignee]
  );

  const weeks = useMemo(() => monthWeeks(cursor), [cursor]);
  const weekDays = useMemo(() => {
    const start = mondayOf(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursor]);

  function shift(dir: number) {
    if (view === "month") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1));
    else if (view === "week") setCursor(addDays(cursor, dir * 7));
    else setCursor(addDays(cursor, dir));
  }

  async function saveDraft() {
    if (!draft?.title.trim() || saving) return;
    setSaving(true);
    try {
      const payload = {
        title: draft.title.trim(),
        assignee: draft.assignee.trim(),
        notes: draft.notes.trim(),
        color: draft.color,
        allDay: true,
        done: draft.done,
        startAt: atLocal(fromDayKey(draft.start), 12, 0).toISOString(),
        endAt: atLocal(fromDayKey(draft.end), 12, 0).toISOString(),
      };
      const res = await fetch(draft.id ? `/api/planning/${draft.id}` : "/api/planning", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setDraft(null);
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function removeDraft() {
    if (!draft?.id || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/planning/${draft.id}`, { method: "DELETE" });
      if (res.ok) {
        setDraft(null);
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  const heading =
    view === "month"
      ? monthLabel(cursor)
      : view === "week"
        ? `${weekDays[0].toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${weekDays[6].toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
        : cursor.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-6xl flex-col px-4 py-6 lg:h-screen lg:px-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <PageHeader page="planning" />
        <button
          type="button"
          onClick={() => setDraft(emptyDraft(cursor))}
          className="carbon-btn-primary inline-flex items-center gap-1.5 px-3 py-2 text-[13px]"
        >
          <Plus className="h-3.5 w-3.5" />
          New task
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-[18px] font-semibold text-white">{heading}</h2>
          <button type="button" onClick={() => setCursor(startOfDay(new Date()))} className="carbon-btn-secondary px-2.5 py-1.5 text-[12px]">
            Today
          </button>
          <button type="button" onClick={() => shift(-1)} className="rounded-lg p-1.5 text-[var(--carbon-text-muted)] hover:bg-[var(--carbon-bg-hover)] hover:text-white" aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => shift(1)} className="rounded-lg p-1.5 text-[var(--carbon-text-muted)] hover:bg-[var(--carbon-bg-hover)] hover:text-white" aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex rounded-lg border border-[var(--carbon-border)] p-0.5">
          {(["day", "week", "month"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-md px-2.5 py-1 text-[12px] capitalize ${
                view === v ? "bg-[var(--carbon-bg-hover)] text-white" : "text-[var(--carbon-text-muted)] hover:text-white"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {people.length > 0 && (
        <div className="mb-3 flex gap-1.5 overflow-x-auto">
          <FilterChip label="Everyone" active={assignee === "all"} onClick={() => setAssignee("all")} />
          {people.map((name) => (
            <FilterChip key={name} label={name} active={assignee === name} onClick={() => setAssignee(name)} />
          ))}
        </div>
      )}

      <div className="carbon-card min-h-0 flex-1 overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center text-[13px] text-[var(--carbon-text-muted)]">Loading calendar…</div>
        ) : view === "month" ? (
          <MonthGrid
            cursor={cursor}
            weeks={weeks}
            tasks={visible}
            onDay={(d) => setDraft(emptyDraft(d))}
            onTask={(task) => setDraft(fromTask(task))}
          />
        ) : view === "week" ? (
          <DayStrip
            days={weekDays}
            tasks={visible}
            onDay={(d) => setDraft(emptyDraft(d))}
            onTask={(task) => setDraft(fromTask(task))}
          />
        ) : (
          <DayStrip
            days={[cursor]}
            tasks={visible}
            onDay={(d) => setDraft(emptyDraft(d))}
            onTask={(task) => setDraft(fromTask(task))}
            list
          />
        )}
      </div>

      {draft && (
        <TaskModal
          draft={draft}
          people={people}
          saving={saving}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={() => void saveDraft()}
          onDelete={draft.id ? () => void removeDraft() : undefined}
        />
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] ${
        active ? "bg-white text-[var(--carbon-bg)]" : "text-[var(--carbon-text-muted)] hover:text-[var(--carbon-text)]"
      }`}
    >
      {label}
    </button>
  );
}

function MonthGrid({
  cursor,
  weeks,
  tasks,
  onDay,
  onTask,
}: {
  cursor: Date;
  weeks: Date[][];
  tasks: PlanTask[];
  onDay: (d: Date) => void;
  onTask: (task: PlanTask) => void;
}) {
  return (
    <div className="flex h-full min-h-[520px] flex-col">
      <div className="grid grid-cols-7 border-b border-[var(--carbon-border)]">
        {WEEKDAYS.map((d) => (
          <p key={d} className="px-2 py-2 text-center text-[11px] font-medium text-[var(--carbon-text-muted)]">
            {d}
          </p>
        ))}
      </div>
      <div className="grid min-h-0 flex-1" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map((week, wi) => {
          const lanes = layoutWeek(week, tasks);
          const extra = Math.max(0, lanes.length - 3);
          const shown = lanes.slice(0, 3);
          return (
            <div key={wi} className="relative grid grid-cols-7 border-b border-[var(--carbon-border)] last:border-b-0">
              {week.map((day) => {
                const inMonth = sameMonth(day, cursor);
                const today = isToday(day);
                return (
                  <button
                    key={dayKey(day)}
                    type="button"
                    onClick={() => onDay(day)}
                    className={`min-h-[88px] border-r border-[var(--carbon-border)] px-1.5 pt-1.5 text-left last:border-r-0 hover:bg-[var(--carbon-bg-hover)] ${
                      inMonth ? "" : "bg-[var(--carbon-bg)]/40"
                    }`}
                  >
                    <span
                      className={`relative z-10 inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] ${
                        today
                          ? "bg-[#e74c3c] font-semibold text-white"
                          : inMonth
                            ? "text-[var(--carbon-text)]"
                            : "text-[var(--carbon-text-muted)]"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                  </button>
                );
              })}
              <div className="pointer-events-none absolute inset-x-0 bottom-1 top-9 px-0.5">
                {shown.map((lane, li) => (
                  <div key={li} className="mb-0.5 grid grid-cols-7 gap-0.5">
                    {lane.map((item) => (
                      <button
                        key={item.task.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTask(item.task);
                        }}
                        className="pointer-events-auto truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium text-[#0c0e0f]"
                        style={{
                          gridColumn: `${item.col + 1} / span ${item.span}`,
                          background: item.task.done ? "#5f6368" : item.task.color,
                          opacity: item.task.done ? 0.7 : 1,
                        }}
                      >
                        {item.task.assignee ? `${item.task.title} · ${item.task.assignee}` : item.task.title}
                      </button>
                    ))}
                  </div>
                ))}
                {extra > 0 && (
                  <p className="px-2 text-[10px] text-[var(--carbon-text-muted)]">+{extra} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayStrip({
  days,
  tasks,
  onDay,
  onTask,
  list,
}: {
  days: Date[];
  tasks: PlanTask[];
  onDay: (d: Date) => void;
  onTask: (task: PlanTask) => void;
  list?: boolean;
}) {
  return (
    <div className={`grid h-full min-h-[420px] ${days.length === 1 ? "grid-cols-1" : "grid-cols-7"}`}>
      {days.map((day) => {
        const dayTasks = tasks.filter((t) => overlapsDay(t, day)).sort((a, b) => a.title.localeCompare(b.title));
        return (
          <div key={dayKey(day)} className="flex min-h-0 flex-col border-r border-[var(--carbon-border)] last:border-r-0">
            <button
              type="button"
              onClick={() => onDay(day)}
              className="flex items-center gap-2 border-b border-[var(--carbon-border)] px-3 py-2 text-left hover:bg-[var(--carbon-bg-hover)]"
            >
              {!list && <span className="text-[11px] text-[var(--carbon-text-muted)]">{WEEKDAYS[(day.getDay() + 6) % 7]}</span>}
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] ${
                  isToday(day) ? "bg-[#e74c3c] font-semibold text-white" : "text-[var(--carbon-text)]"
                }`}
              >
                {day.getDate()}
              </span>
            </button>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
              {dayTasks.length === 0 ? (
                <button
                  type="button"
                  onClick={() => onDay(day)}
                  className="w-full rounded-md px-2 py-6 text-[12px] text-[var(--carbon-text-muted)] hover:bg-[var(--carbon-bg-hover)]"
                >
                  Add task
                </button>
              ) : (
                dayTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onTask(task)}
                    className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[var(--carbon-bg-hover)]"
                  >
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: task.done ? "#5f6368" : task.color }} />
                    <span className="min-w-0">
                      <span className={`block truncate text-[12px] ${task.done ? "text-[var(--carbon-text-muted)] line-through" : "text-white"}`}>
                        {task.title}
                      </span>
                      {task.assignee && (
                        <span className="block truncate text-[11px] text-[var(--carbon-text-muted)]">{task.assignee}</span>
                      )}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskModal({
  draft,
  people,
  saving,
  onChange,
  onClose,
  onSave,
  onDelete,
}: {
  draft: Draft;
  people: string[];
  saving: boolean;
  onChange: (draft: Draft) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={onClose}>
      <div
        className="carbon-card w-full max-w-md p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-medium text-white">{draft.id ? "Edit task" : "New task"}</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-[var(--carbon-text-muted)] hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <input
            value={draft.title}
            onChange={(e) => onChange({ ...draft, title: e.target.value })}
            placeholder="Task title"
            className="carbon-input py-2 text-[13px]"
            autoFocus
          />
          <input
            value={draft.assignee}
            onChange={(e) => onChange({ ...draft, assignee: e.target.value })}
            placeholder="Assignee (employee name)"
            list="planning-people"
            className="carbon-input py-2 text-[13px]"
          />
          <datalist id="planning-people">
            {people.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-[var(--carbon-text-muted)]">
              Start
              <input
                type="date"
                value={draft.start}
                onChange={(e) => onChange({ ...draft, start: e.target.value, end: e.target.value > draft.end ? e.target.value : draft.end })}
                className="carbon-input mt-1 py-2 text-[13px]"
              />
            </label>
            <label className="text-[11px] text-[var(--carbon-text-muted)]">
              End
              <input
                type="date"
                value={draft.end}
                onChange={(e) => onChange({ ...draft, end: e.target.value, start: e.target.value < draft.start ? e.target.value : draft.start })}
                className="carbon-input mt-1 py-2 text-[13px]"
              />
            </label>
          </div>
          <div className="flex gap-2">
            {TASK_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onChange({ ...draft, color })}
                className={`h-6 w-6 rounded-full ${draft.color === color ? "ring-2 ring-white ring-offset-2 ring-offset-[var(--carbon-bg-elevated)]" : ""}`}
                style={{ background: color }}
                aria-label={color}
              />
            ))}
          </div>
          <textarea
            value={draft.notes}
            onChange={(e) => onChange({ ...draft, notes: e.target.value })}
            placeholder="Notes"
            rows={3}
            className="carbon-input py-2 text-[13px]"
          />
          <label className="flex items-center gap-2 text-[13px] text-[var(--carbon-text-secondary)]">
            <input
              type="checkbox"
              checked={draft.done}
              onChange={(e) => onChange({ ...draft, done: e.target.checked })}
            />
            Done
          </label>
        </div>
        <div className="mt-4 flex items-center justify-between">
          {onDelete ? (
            <button type="button" onClick={onDelete} disabled={saving} className="inline-flex items-center gap-1.5 text-[12px] text-[var(--carbon-error)] hover:underline">
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="carbon-btn-secondary px-3 py-1.5 text-[12px]">
              Cancel
            </button>
            <button type="button" onClick={onSave} disabled={saving || !draft.title.trim()} className="carbon-btn-primary px-3 py-1.5 text-[12px]">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
