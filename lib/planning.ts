export const TASK_COLORS = ["#6aa4e8", "#7dcea0", "#f0b27a", "#c39bd3", "#e74c3c", "#8a939c"];

export type PlanTask = {
  id: string;
  title: string;
  assignee: string;
  notes: string;
  color: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  done: boolean;
};

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function dayKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number) {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  next.setDate(next.getDate() + n);
  return next;
}

export function mondayOf(d: Date) {
  const day = (d.getDay() + 6) % 7;
  return addDays(startOfDay(d), -day);
}

export function monthWeeks(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const weeks: Date[][] = [];
  let d = mondayOf(first);
  while (true) {
    const week = Array.from({ length: 7 }, (_, i) => addDays(d, i));
    weeks.push(week);
    if (week[6] >= last) break;
    d = addDays(d, 7);
  }
  return weeks;
}

export function dayDiff(a: Date, b: Date) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

export function parseDay(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? startOfDay(new Date()) : startOfDay(d);
}

export function overlapsDay(task: PlanTask, day: Date) {
  const start = startOfDay(new Date(task.startAt));
  const end = startOfDay(new Date(task.endAt));
  const t = startOfDay(day);
  return t >= start && t <= end;
}

export type WeekLane = { task: PlanTask; col: number; span: number };

export function layoutWeek(week: Date[], tasks: PlanTask[]): WeekLane[][] {
  const weekStart = startOfDay(week[0]);
  const weekEnd = startOfDay(week[6]);
  const hits = tasks
    .filter((task) => {
      const start = startOfDay(new Date(task.startAt));
      const end = startOfDay(new Date(task.endAt));
      return start <= weekEnd && end >= weekStart;
    })
    .sort((a, b) => {
      const as = startOfDay(new Date(a.startAt)).getTime();
      const bs = startOfDay(new Date(b.startAt)).getTime();
      if (as !== bs) return as - bs;
      return dayDiff(new Date(b.startAt), new Date(b.endAt)) - dayDiff(new Date(a.startAt), new Date(a.endAt));
    });

  const lanes: WeekLane[][] = [];
  const laneEnds: number[] = [];
  for (const task of hits) {
    const start = startOfDay(new Date(task.startAt));
    const end = startOfDay(new Date(task.endAt));
    const col = Math.max(0, dayDiff(weekStart, start));
    const last = Math.min(6, dayDiff(weekStart, end));
    const span = Math.max(1, last - col + 1);
    let lane = laneEnds.findIndex((endCol) => endCol < col);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(last);
      lanes.push([]);
    } else {
      laneEnds[lane] = last;
    }
    lanes[lane].push({ task, col, span });
  }
  return lanes;
}

export function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function isToday(d: Date) {
  return dayKey(d) === dayKey(new Date());
}

export function monthLabel(d: Date) {
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function fromDayKey(key: string) {
  const [y, m, day] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, day || 1);
}

export function atLocal(day: Date, hours = 0, minutes = 0) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0);
}
