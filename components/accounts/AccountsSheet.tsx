"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Columns3, Eraser, Redo2, Trash2, Undo2 } from "lucide-react";
import { ACCOUNT_STATUSES, parseAccountLines, type AccountStatus, type ParsedAccount } from "@/lib/sites";
import type { AccountRow } from "./AccountsManager";

export const SHEET_COLUMNS = [
  { id: "email", label: "email" },
  { id: "password", label: "password" },
  { id: "phone", label: "phone" },
  { id: "first_name", label: "first_name" },
  { id: "last_name", label: "last_name" },
  { id: "birth_date", label: "birth_date" },
  { id: "notes", label: "notes" },
  { id: "status", label: "status" },
] as const;

export type SheetColId = (typeof SHEET_COLUMNS)[number]["id"];

const DEFAULT_COLS: SheetColId[] = ["email", "password", "phone", "first_name", "last_name", "status"];
const ROW_H = 28;
const HEAD_H = 32;
const INDEX_W = 40;
const OVERSCAN = 16;

export const SHEET_COLORS = [
  { id: "green", ring: "#22c55e", bg: "#14532d", fg: "#bbf7d0" },
  { id: "yellow", ring: "#eab308", bg: "#713f12", fg: "#fef08a" },
  { id: "orange", ring: "#f97316", bg: "#7c2d12", fg: "#fed7aa" },
  { id: "red", ring: "#ef4444", bg: "#7f1d1d", fg: "#fecaca" },
  { id: "blue", ring: "#3b82f6", bg: "#1e3a8a", fg: "#bfdbfe" },
  { id: "purple", ring: "#a855f7", bg: "#581c87", fg: "#e9d5ff" },
  { id: "pink", ring: "#ec4899", bg: "#9d174d", fg: "#fbcfe8" },
  { id: "gray", ring: "#a1a1aa", bg: "#3f3f46", fg: "#e4e4e7" },
] as const;

const FILL = Object.fromEntries(SHEET_COLORS.map((c) => [c.id, { bg: c.bg, fg: c.fg }])) as Record<
  SheetColorId,
  { bg: string; fg: string }
>;

export type SheetColorId = (typeof SHEET_COLORS)[number]["id"];

type Pos = { r: number; c: number };

type ColorChange = { key: string; from?: SheetColorId; to?: SheetColorId };
type EditChange = { id: string; data: Partial<AccountRow>; revert: Partial<AccountRow> };
type Hist = { colors?: ColorChange[]; edit?: EditChange; edits?: EditChange[] };

const HIST_MAX = 100;
const STATUSES = new Set<string>(ACCOUNT_STATUSES);

function tsvEscape(value: string) {
  if (/[\t\n\r"]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function parseTsvLine(line: string) {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === "\t") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function splitDelimited(line: string, delim: string) {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delim) {
      cells.push(cur);
      cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  return cells;
}

function parseClipboard(text: string) {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  if (lines.length === 0) return [] as string[][];
  const hasTab = lines.some((l) => l.includes("\t"));
  if (hasTab) return lines.map(parseTsvLine);
  const sample = lines.slice(0, 12);
  const commaHits = sample.filter((l) => splitDelimited(l, ",").length >= 2).length;
  const semiHits = sample.filter((l) => splitDelimited(l, ";").length >= 2).length;
  if (semiHits > commaHits && semiHits > 0) return lines.map((l) => splitDelimited(l, ";"));
  if (commaHits > 0) return lines.map((l) => splitDelimited(l, ","));
  return lines.map((line) => [line]);
}

const COL_ALIASES: Record<string, SheetColId> = {
  mail: "email",
  email: "email",
  "e-mail": "email",
  login: "email",
  user: "email",
  username: "email",
  password: "password",
  pass: "password",
  pwd: "password",
  phone: "phone",
  tel: "phone",
  mobile: "phone",
  first_name: "first_name",
  firstname: "first_name",
  first: "first_name",
  prenom: "first_name",
  last_name: "last_name",
  lastname: "last_name",
  last: "last_name",
  nom: "last_name",
  birth_date: "birth_date",
  birthdate: "birth_date",
  dob: "birth_date",
  birthday: "birth_date",
  notes: "notes",
  note: "notes",
  comment: "notes",
  status: "status",
};

function headerCols(cells: string[]): Array<SheetColId | null> {
  return cells.map((c) => COL_ALIASES[(c ?? "").trim().toLowerCase()] ?? null);
}

function isHeaderGridRow(cells: string[] | undefined) {
  if (!cells?.length) return false;
  return headerCols(cells).some(Boolean);
}

function applyNewField(acc: ParsedAccount, col: SheetColId, raw: string) {
  const value = raw.trim();
  if (col === "email") {
    if (value.includes(":") && value.includes("@") && !acc.password) {
      const i = value.indexOf(":");
      acc.login = value.slice(0, i).trim();
      acc.password = value.slice(i + 1).trim() || null;
    } else {
      acc.login = value;
    }
    return;
  }
  if (col === "password") acc.password = value || null;
  else if (col === "phone") acc.phone = value || null;
  else if (col === "first_name") acc.firstName = value || null;
  else if (col === "last_name") acc.lastName = value || null;
  else if (col === "birth_date") acc.birthDate = value || null;
  else if (col === "notes") acc.notes = value || null;
  else if (col === "status" && STATUSES.has(value.toLowerCase())) {
    acc.status = value.toLowerCase() as AccountStatus;
  }
}

function gridToNewAccounts(grid: string[][], fallbackCols: SheetColId[]): ParsedAccount[] {
  if (!grid.length) return [];
  const headed = isHeaderGridRow(grid[0]);
  const cols = headed ? headerCols(grid[0]) : fallbackCols;
  const start = headed ? 1 : 0;
  const out: ParsedAccount[] = [];
  for (let i = start; i < grid.length; i++) {
    const acc: ParsedAccount = {
      login: "",
      password: null,
      phone: null,
      firstName: null,
      lastName: null,
      birthDate: null,
      notes: null,
    };
    const cells = grid[i];
    for (let j = 0; j < cells.length; j++) {
      const col = headed ? (cols as Array<SheetColId | null>)[j] : fallbackCols[j];
      if (!col) continue;
      applyNewField(acc, col, cells[j] ?? "");
    }
    if (acc.login) out.push(acc);
  }
  return out;
}

function textToNewAccounts(text: string, fallbackCols: SheetColId[]): ParsedAccount[] {
  const grid = parseClipboard(text);
  if (grid.some((row) => row.length >= 2) || isHeaderGridRow(grid[0])) {
    return gridToNewAccounts(grid, fallbackCols);
  }
  return parseAccountLines(text);
}

function looksLikeImport(grid: string[][]) {
  if (grid.length >= 2) return true;
  if ((grid[0]?.length ?? 0) >= 2) return true;
  const only = grid[0]?.[0] ?? "";
  return only.includes("@") && only.includes(":");
}

function patchFromCol(
  row: AccountRow,
  col: SheetColId,
  raw: string
): EditChange | null {
  const value = raw.trim();
  if (col === "email") {
    if (!value || value === row.login) return null;
    return { id: row.id, data: { login: value }, revert: { login: row.login } };
  }
  if (col === "status") {
    const status = value.toLowerCase();
    if (!STATUSES.has(status) || status === row.status) return null;
    return {
      id: row.id,
      data: { status: status as AccountStatus },
      revert: { status: row.status },
    };
  }
  const next = value || null;
  if (col === "password") {
    if (next === (row.password ?? null)) return null;
    return { id: row.id, data: { password: next }, revert: { password: row.password } };
  }
  if (col === "phone") {
    if (next === (row.phone ?? null)) return null;
    return { id: row.id, data: { phone: next }, revert: { phone: row.phone } };
  }
  if (col === "first_name") {
    if (next === (row.firstName ?? null)) return null;
    return { id: row.id, data: { firstName: next }, revert: { firstName: row.firstName } };
  }
  if (col === "last_name") {
    if (next === (row.lastName ?? null)) return null;
    return { id: row.id, data: { lastName: next }, revert: { lastName: row.lastName } };
  }
  if (col === "birth_date") {
    if (next === (row.birthDate ?? null)) return null;
    return { id: row.id, data: { birthDate: next }, revert: { birthDate: row.birthDate } };
  }
  if (next === (row.notes ?? null)) return null;
  return { id: row.id, data: { notes: next }, revert: { notes: row.notes } };
}

function valueOf(a: AccountRow, col: SheetColId) {
  switch (col) {
    case "email":
      return a.login;
    case "password":
      return a.password ?? "";
    case "phone":
      return a.phone ?? "";
    case "first_name":
      return a.firstName ?? "";
    case "last_name":
      return a.lastName ?? "";
    case "birth_date":
      return a.birthDate ?? "";
    case "notes":
      return a.notes ?? "";
    case "status":
      return a.status;
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function bounds(a: Pos, b: Pos) {
  return {
    r0: a.r < b.r ? a.r : b.r,
    r1: a.r > b.r ? a.r : b.r,
    c0: a.c < b.c ? a.c : b.c,
    c1: a.c > b.c ? a.c : b.c,
  };
}

function cellFromEvent(target: EventTarget | null): { r: number; c: number | null } | null {
  const el = (target as HTMLElement | null)?.closest?.("td[data-r]") as HTMLTableCellElement | null;
  if (!el) return null;
  const r = Number(el.dataset.r);
  if (Number.isNaN(r)) return null;
  if (el.dataset.c == null) return { r, c: null };
  const c = Number(el.dataset.c);
  return Number.isNaN(c) ? { r, c: null } : { r, c };
}

function AccountsSheet({
  siteId,
  rows,
  onStatus,
  onDelete,
  onPatch,
  onAdd,
}: {
  siteId: string;
  rows: AccountRow[];
  onStatus: (id: string, status: AccountStatus) => void;
  onDelete: (id: string) => void;
  onPatch: (id: string, data: Partial<AccountRow>) => void;
  onAdd: (entries: ParsedAccount[]) => void;
}) {
  const colsKey = `carbon-sheet-cols:${siteId}`;
  const colorsKey = `carbon-sheet-colors:${siteId}`;
  const scroller = useRef<HTMLDivElement>(null);
  const tableWrap = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const autoRaf = useRef(0);
  const dragging = useRef(false);
  const dragOrigin = useRef<Pos | null>(null);
  const dragRows = useRef(false);
  const pointer = useRef({ x: 0, y: 0 });
  const rowsLen = useRef(0);
  const colsLen = useRef(0);
  const colWRef = useRef(48);
  const colorsRef = useRef<Record<string, SheetColorId>>({});
  const undoStack = useRef<Hist[]>([]);
  const redoStack = useRef<Hist[]>([]);
  const selRef = useRef<{ a: Pos; b: Pos } | null>(null);
  const editingRef = useRef<{ r: number; c: number } | null>(null);
  const rowsRef = useRef(rows);
  const colsRef = useRef<(typeof SHEET_COLUMNS)[number][]>([]);
  const onAddRef = useRef(onAdd);

  const [visible, setVisible] = useState<SheetColId[]>(() => readJson(colsKey, DEFAULT_COLS));
  const [colors, setColors] = useState<Record<string, SheetColorId>>(() => readJson(colorsKey, {}));
  const [histTick, setHistTick] = useState(0);
  const [focus, setFocus] = useState<Pos | null>(null);
  const [sel, setSel] = useState<{ a: Pos; b: Pos } | null>(null);
  const [colsOpen, setColsOpen] = useState(false);
  const [editing, setEditing] = useState<{ r: number; c: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(520);
  const [gridW, setGridW] = useState(0);

  const cols = useMemo(() => SHEET_COLUMNS.filter((c) => visible.includes(c.id)), [visible]);
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN);
  const slice = rows.slice(start, end);
  const box = sel ? bounds(sel.a, sel.b) : null;
  const selectedCount = box ? (box.r1 - box.r0 + 1) * (box.c1 - box.c0 + 1) : 0;
  const colW = cols.length ? Math.max(48, (gridW - INDEX_W) / cols.length) : 48;
  rowsLen.current = rows.length;
  colsLen.current = cols.length;
  colWRef.current = colW;
  colorsRef.current = colors;
  selRef.current = sel;
  editingRef.current = editing;
  rowsRef.current = rows;
  colsRef.current = cols;
  onAddRef.current = onAdd;
  const canUndo = histTick >= 0 && undoStack.current.length > 0;
  const canRedo = histTick >= 0 && redoStack.current.length > 0;

  useEffect(() => {
    return () => {
      if (autoRaf.current) cancelAnimationFrame(autoRaf.current);
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", stopDrag);
    };
    // listeners are module-stable enough for unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scroller.current;
    const wrap = tableWrap.current;
    if (!el) return;
    setViewH(el.clientHeight);
    if (wrap) setGridW(wrap.clientWidth);
    const ro = new ResizeObserver(() => {
      setViewH(el.clientHeight);
      if (wrap) setGridW(wrap.clientWidth);
    });
    ro.observe(el);
    if (wrap) ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  function pushHist(entry: Hist) {
    undoStack.current.push(entry);
    if (undoStack.current.length > HIST_MAX) undoStack.current.shift();
    redoStack.current = [];
    setHistTick((n) => n + 1);
  }

  function applyColorChanges(changes: ColorChange[], side: "from" | "to") {
    setColors((prev) => {
      const next = { ...prev };
      for (const change of changes) {
        const val = change[side];
        if (val) next[change.key] = val;
        else delete next[change.key];
      }
      writeJson(colorsKey, next);
      return next;
    });
  }

  function undo() {
    const entry = undoStack.current.pop();
    if (!entry) return;
    if (entry.colors) applyColorChanges(entry.colors, "from");
    if (entry.edit) onPatch(entry.edit.id, entry.edit.revert);
    for (const change of entry.edits ?? []) onPatch(change.id, change.revert);
    redoStack.current.push(entry);
    setHistTick((n) => n + 1);
  }

  function redo() {
    const entry = redoStack.current.pop();
    if (!entry) return;
    if (entry.colors) applyColorChanges(entry.colors, "to");
    if (entry.edit) onPatch(entry.edit.id, entry.edit.data);
    for (const change of entry.edits ?? []) onPatch(change.id, change.data);
    undoStack.current.push(entry);
    setHistTick((n) => n + 1);
  }

  const commitEdit = useCallback(() => {
    setEditing((cur) => {
      if (!cur) return null;
      const row = rows[cur.r];
      const col = cols[cur.c];
      if (!row || !col || valueOf(row, col.id) === draft) return null;
      const value = draft.trim();
      const data: Partial<AccountRow> = {};
      const revert: Partial<AccountRow> = {};
      if (col.id === "email") {
        if (!value) return null;
        data.login = value;
        revert.login = row.login;
      } else if (col.id === "password") {
        data.password = value || null;
        revert.password = row.password;
      } else if (col.id === "phone") {
        data.phone = value || null;
        revert.phone = row.phone;
      } else if (col.id === "first_name") {
        data.firstName = value || null;
        revert.firstName = row.firstName;
      } else if (col.id === "last_name") {
        data.lastName = value || null;
        revert.lastName = row.lastName;
      } else if (col.id === "birth_date") {
        data.birthDate = value || null;
        revert.birthDate = row.birthDate;
      } else if (col.id === "notes") {
        data.notes = value || null;
        revert.notes = row.notes;
      }
      pushHist({ edit: { id: row.id, data, revert } });
      onPatch(row.id, data);
      return null;
    });
  }, [cols, draft, onPatch, rows]);

  function applyRange(a: Pos, b: Pos) {
    setFocus(a);
    setSel({ a, b });
  }

  function posFromPointer(): Pos | null {
    const el = scroller.current;
    const wrap = tableWrap.current;
    if (!el || !wrap || !rowsLen.current) return null;
    const rect = el.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const r = Math.max(
      0,
      Math.min(rowsLen.current - 1, Math.floor((pointer.current.y - rect.top + el.scrollTop - HEAD_H) / ROW_H))
    );
    const c = dragRows.current
      ? colsLen.current - 1
      : Math.max(0, Math.min(colsLen.current - 1, Math.floor((pointer.current.x - wrapRect.left - INDEX_W) / colWRef.current)));
    return { r, c };
  }

  function stopDrag() {
    dragging.current = false;
    dragOrigin.current = null;
    dragRows.current = false;
    if (autoRaf.current) {
      cancelAnimationFrame(autoRaf.current);
      autoRaf.current = 0;
    }
    window.removeEventListener("pointermove", onWindowPointerMove);
    window.removeEventListener("pointerup", stopDrag);
  }

  function onWindowPointerMove(ev: PointerEvent) {
    pointer.current = { x: ev.clientX, y: ev.clientY };
  }

  function tickDrag() {
    autoRaf.current = 0;
    if (!dragging.current || !dragOrigin.current) return;
    const el = scroller.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const y = pointer.current.y;
      const zone = 64;
      let dy = 0;
      if (y > rect.bottom - zone) {
        const t = Math.min(1.5, (y - (rect.bottom - zone)) / 80);
        dy = 40 + t * 720;
      } else if (y < rect.top + zone) {
        const t = Math.min(1.5, (rect.top + zone - y) / 80);
        dy = -(40 + t * 720);
      }
      if (dy) {
        el.scrollTop = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + dy));
        setScrollTop(el.scrollTop);
      }
    }
    const next = posFromPointer();
    if (next) {
      setSel({
        a: dragRows.current ? { r: dragOrigin.current.r, c: 0 } : dragOrigin.current,
        b: dragRows.current ? { r: next.r, c: colsLen.current - 1 } : next,
      });
    }
    autoRaf.current = requestAnimationFrame(tickDrag);
  }

  function onPointerDown(ev: React.PointerEvent<HTMLTableSectionElement>) {
    if (ev.button !== 0) return;
    if ((ev.target as HTMLElement).closest("input,select")) return;
    ev.preventDefault();
    if (editing) commitEdit();
    const hit = cellFromEvent(ev.target);
    if (!hit) return;
    pointer.current = { x: ev.clientX, y: ev.clientY };
    const pos: Pos = { r: hit.r, c: hit.c ?? 0 };
    const origin = ev.shiftKey && focus ? focus : pos;
    dragRows.current = hit.c == null;
    if (hit.c == null) {
      applyRange(
        { r: origin.r, c: 0 },
        { r: hit.r, c: cols.length - 1 }
      );
    } else if (ev.shiftKey && focus) {
      applyRange(focus, pos);
    } else {
      applyRange(pos, pos);
    }
    dragging.current = true;
    dragOrigin.current = dragRows.current ? { r: origin.r, c: 0 } : origin;
    scroller.current?.focus({ preventScroll: true });
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", stopDrag);
    if (autoRaf.current) cancelAnimationFrame(autoRaf.current);
    autoRaf.current = requestAnimationFrame(tickDrag);
  }

  function onDoubleClick(ev: React.MouseEvent<HTMLTableSectionElement>) {
    const hit = cellFromEvent(ev.target);
    if (!hit || hit.c == null) return;
    const col = cols[hit.c];
    if (!col || col.id === "status") return;
    const row = rows[hit.r];
    if (!row) return;
    setEditing({ r: hit.r, c: hit.c });
    setDraft(valueOf(row, col.id));
    applyRange({ r: hit.r, c: hit.c }, { r: hit.r, c: hit.c });
  }

  function paint(color: SheetColorId | null) {
    const area = sel ? bounds(sel.a, sel.b) : null;
    if (!area) return;
    const changes: ColorChange[] = [];
    setColors((prev) => {
      const next = { ...prev };
      for (let r = area.r0; r <= area.r1; r++) {
        const row = rows[r];
        if (!row) continue;
        for (let c = area.c0; c <= area.c1; c++) {
          const col = cols[c];
          if (!col) continue;
          const key = `${row.id}|${col.id}`;
          const from = prev[key];
          const to = color ?? undefined;
          if (from === to) continue;
          changes.push({ key, from, to });
          if (to) next[key] = to;
          else delete next[key];
        }
      }
      writeJson(colorsKey, next);
      return next;
    });
    if (changes.length) pushHist({ colors: changes });
  }

  function toggleCol(id: SheetColId) {
    setVisible((prev) => {
      const next = prev.includes(id)
        ? prev.length === 1
          ? prev
          : prev.filter((c) => c !== id)
        : SHEET_COLUMNS.map((c) => c.id).filter((c) => c === id || prev.includes(c));
      writeJson(colsKey, next);
      return next;
    });
    setSel(null);
    setFocus(null);
  }

  function deleteSelected() {
    if (!box) return;
    const ids = new Set<string>();
    for (let r = box.r0; r <= box.r1; r++) {
      if (rows[r]) ids.add(rows[r].id);
    }
    if (ids.size === 0) return;
    if (!confirm(`Delete ${ids.size} account${ids.size === 1 ? "" : "s"}?`)) return;
    for (const id of ids) onDelete(id);
    setSel(null);
    setFocus(null);
  }

  function selectionTsv() {
    const current = selRef.current;
    if (!current) return "";
    const area = bounds(current.a, current.b);
    const list = rowsRef.current;
    const visibleCols = colsRef.current;
    const lines: string[] = [];
    for (let r = area.r0; r <= area.r1; r++) {
      const row = list[r];
      if (!row) continue;
      const cells: string[] = [];
      for (let c = area.c0; c <= area.c1; c++) {
        const col = visibleCols[c];
        if (col) cells.push(tsvEscape(valueOf(row, col.id)));
      }
      lines.push(cells.join("\t"));
    }
    return lines.join("\n");
  }

  function importPasted(text: string) {
    const fallback = colsRef.current.map((c) => c.id);
    const entries = textToNewAccounts(text, fallback.length ? fallback : ["email", "password"]);
    if (!entries.length) return false;
    const used = new Set<SheetColId>();
    for (const row of parseClipboard(text).slice(0, 1)) {
      for (const col of headerCols(row)) if (col) used.add(col);
    }
    if (used.size) {
      setVisible((prev) => {
        const next = SHEET_COLUMNS.map((c) => c.id).filter((id) => prev.includes(id) || used.has(id));
        writeJson(colsKey, next);
        return next;
      });
    }
    onAddRef.current(entries);
    return true;
  }

  function applyPaste(text: string) {
    if (editingRef.current) return;
    const grid = parseClipboard(text);
    if (!grid.length) return;
    const current = selRef.current;
    if (!current || looksLikeImport(grid)) {
      importPasted(text);
      return;
    }
    const area = bounds(current.a, current.b);
    const list = rowsRef.current;
    const visibleCols = colsRef.current;
    const single = grid.length === 1 && grid[0].length === 1;
    const edits: EditChange[] = [];
    const merged = new Map<string, EditChange>();

    const write = (r: number, c: number, raw: string) => {
      const row = list[r];
      const col = visibleCols[c];
      if (!row || !col) return;
      const change = patchFromCol(row, col.id, raw);
      if (!change) return;
      const prev = merged.get(row.id);
      if (prev) {
        prev.data = { ...prev.data, ...change.data };
        prev.revert = { ...change.revert, ...prev.revert };
      } else {
        merged.set(row.id, { ...change });
      }
    };

    if (single) {
      const raw = grid[0][0] ?? "";
      for (let r = area.r0; r <= area.r1; r++) {
        for (let c = area.c0; c <= area.c1; c++) write(r, c, raw);
      }
    } else {
      for (let i = 0; i < grid.length; i++) {
        const r = area.r0 + i;
        if (r >= list.length) break;
        for (let j = 0; j < grid[i].length; j++) {
          const c = area.c0 + j;
          if (c >= visibleCols.length) break;
          write(r, c, grid[i][j] ?? "");
        }
      }
    }

    for (const change of merged.values()) {
      edits.push(change);
      onPatch(change.id, change.data);
    }
    if (edits.length) pushHist({ edits });
  }

  useEffect(() => {
    function inField(el: EventTarget | null) {
      return (el as HTMLElement | null)?.closest?.("input,textarea,select");
    }

    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        setEditing(null);
        setSel(null);
        setFocus(null);
        return;
      }
      const cmd = ev.metaKey || ev.ctrlKey;
      if (cmd && (ev.code === "KeyZ" || ev.code === "KeyY")) {
        ev.preventDefault();
        if (ev.code === "KeyY" || ev.shiftKey) redo();
        else undo();
        return;
      }
      if (cmd && ev.code === "KeyA" && !editingRef.current && rowsRef.current.length) {
        ev.preventDefault();
        applyRange({ r: 0, c: 0 }, { r: rowsRef.current.length - 1, c: colsRef.current.length - 1 });
        return;
      }
      if (cmd && ev.code === "KeyC" && selRef.current && !editingRef.current && !inField(ev.target)) {
        ev.preventDefault();
        const tsv = selectionTsv();
        if (tsv) void navigator.clipboard.writeText(tsv).catch(() => undefined);
        return;
      }
      if (cmd && ev.code === "KeyV" && !editingRef.current && !inField(ev.target)) {
        ev.preventDefault();
        void navigator.clipboard
          .readText()
          .then(applyPaste)
          .catch(() => undefined);
      }
    }

    function onCopy(ev: ClipboardEvent) {
      if (editingRef.current || !selRef.current || inField(ev.target)) return;
      const tsv = selectionTsv();
      if (!tsv) return;
      ev.preventDefault();
      ev.clipboardData?.setData("text/plain", tsv);
    }

    function onPaste(ev: ClipboardEvent) {
      if (editingRef.current || inField(ev.target)) return;
      const text = ev.clipboardData?.getData("text/plain");
      if (text == null) return;
      ev.preventDefault();
      applyPaste(text);
    }

    window.addEventListener("keydown", onKey);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  }, [onPatch]);

  if (rows.length === 0) {
    return (
      <div
        tabIndex={0}
        onPointerDown={(e) => (e.currentTarget as HTMLDivElement).focus()}
        className="outline-none"
      >
        <p className="px-5 py-12 text-center text-sm text-[var(--carbon-text-muted)]">
          No rows. Ctrl+V to paste accounts (email, password, phone, first_name, last_name…).
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-[var(--carbon-border)] bg-[var(--carbon-bg)] px-1.5 py-1">
          {SHEET_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              title={c.id}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                paint(c.id);
              }}
              className="h-5 w-5 rounded-sm border border-black/30"
              style={{ background: c.ring }}
            />
          ))}
          <button
            type="button"
            title="Clear color"
            onPointerDown={(e) => {
              e.preventDefault();
              paint(null);
            }}
            className="ml-0.5 p-1 text-[var(--carbon-text-muted)] hover:text-white"
          >
            <Eraser className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Undo (Ctrl+Z)"
            disabled={!canUndo}
            onClick={undo}
            className="carbon-btn-secondary px-2 py-1.5 text-[var(--carbon-text-muted)] disabled:opacity-30"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Redo (Ctrl+Shift+Z)"
            disabled={!canRedo}
            onClick={redo}
            className="carbon-btn-secondary px-2 py-1.5 text-[var(--carbon-text-muted)] disabled:opacity-30"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setColsOpen((v) => !v)}
            className="carbon-btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px]"
          >
            <Columns3 className="h-3.5 w-3.5" />
            Columns
          </button>
          {colsOpen && (
            <div className="absolute right-0 z-20 mt-1 w-[220px] carbon-card p-2 shadow-xl">
              {SHEET_COLUMNS.map((c) => {
                const on = visible.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCol(c.id)}
                    className={`mb-1 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px] last:mb-0 ${
                      on ? "bg-[var(--carbon-bg-hover)] text-white" : "text-[var(--carbon-text-muted)]"
                    }`}
                  >
                    {c.label}
                    <span>{on ? "on" : "off"}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {selectedCount > 0 && (
          <button
            type="button"
            onClick={deleteSelected}
            className="carbon-btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] hover:text-[var(--carbon-error)]"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        )}
        {selectedCount > 0 && (
          <p className="text-[11px] text-[var(--carbon-text-muted)]">{selectedCount} selected</p>
        )}
      </div>

      <div
        ref={scroller}
        tabIndex={0}
        className="max-h-[min(70vh,720px)] overflow-auto outline-none"
        onScroll={(e) => {
          const top = e.currentTarget.scrollTop;
          if (raf.current) return;
          raf.current = requestAnimationFrame(() => {
            raf.current = 0;
            setScrollTop(top);
          });
        }}
      >
        <div ref={tableWrap} className="relative">
          <table className="sheet-grid w-full table-fixed border-collapse text-[12px]">
            <colgroup>
              <col style={{ width: INDEX_W }} />
              {cols.map((col) => (
                <col key={col.id} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-[var(--carbon-bg-elevated)]">
              <tr className="h-8">
                <th className="border border-[var(--carbon-border)] px-2 text-left font-medium text-[var(--carbon-text-muted)]">
                  #
                </th>
                {cols.map((col) => (
                  <th
                    key={col.id}
                    className="border border-[var(--carbon-border)] px-2 text-left font-medium text-[var(--carbon-text-muted)]"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}>
              {start > 0 && (
                <tr aria-hidden>
                  <td colSpan={cols.length + 1} style={{ height: start * ROW_H, padding: 0, border: 0 }} />
                </tr>
              )}
              {slice.map((row, i) => {
                const r = start + i;
                return (
                  <tr key={row.id} className="h-7">
                    <td
                      data-r={r}
                      className="cursor-pointer border border-[var(--carbon-border)] px-2 text-[11px] tabular-nums text-[var(--carbon-text-muted)]"
                    >
                      {r + 1}
                    </td>
                    {cols.map((col, c) => {
                      const key = `${row.id}|${col.id}`;
                      const fill = colors[key];
                      const isEdit = editing?.r === r && editing.c === c;
                      const isFocus = focus?.r === r && focus?.c === c;
                      const raw = valueOf(row, col.id);
                      const tint = fill
                        ? FILL[fill]
                        : col.id === "status" && row.status === "kyc"
                          ? FILL.red
                          : null;
                      return (
                        <td
                          key={col.id}
                          data-r={r}
                          data-c={c}
                          className={`truncate border border-[var(--carbon-border)] px-2 ${
                            col.id === "email" || col.id === "password" || col.id === "phone" ? "font-mono" : ""
                          } ${isFocus ? "sheet-focus" : ""}`}
                          style={tint ? { background: tint.bg, color: tint.fg } : undefined}
                        >
                          {isEdit ? (
                            <input
                              autoFocus
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onBlur={commitEdit}
                              onPointerDown={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitEdit();
                                if (e.key === "Escape") setEditing(null);
                              }}
                              className="h-6 w-full bg-black/30 px-1 font-mono text-[12px] text-white outline-none"
                            />
                          ) : col.id === "status" && isFocus ? (
                            <select
                              value={row.status}
                              onPointerDown={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const next = e.target.value as AccountStatus;
                                if (next === row.status) return;
                                pushHist({
                                  edit: {
                                    id: row.id,
                                    data: { status: next },
                                    revert: { status: row.status },
                                  },
                                });
                                onStatus(row.id, next);
                              }}
                              className="h-6 w-full bg-transparent capitalize outline-none"
                            >
                              {ACCOUNT_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          ) : (
                            raw
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {end < rows.length && (
                <tr aria-hidden>
                  <td colSpan={cols.length + 1} style={{ height: (rows.length - end) * ROW_H, padding: 0, border: 0 }} />
                </tr>
              )}
            </tbody>
          </table>
          {box && (
            <div
              className="pointer-events-none absolute z-[2] border-2 border-[#4c8bf5] bg-[rgba(60,130,246,0.08)]"
              style={{
                top: HEAD_H + box.r0 * ROW_H,
                left: INDEX_W + box.c0 * colW,
                width: (box.c1 - box.c0 + 1) * colW,
                height: (box.r1 - box.r0 + 1) * ROW_H,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(AccountsSheet);
