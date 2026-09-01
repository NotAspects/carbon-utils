import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const LIST_ID = "isp";

function lineCount(text: string) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean).length;
}

async function readList() {
  const rows = await prisma.$queryRaw<{ text: string }[]>`
    SELECT text FROM "ProxyList" WHERE id = ${LIST_ID}
  `;
  return rows[0]?.text ?? null;
}

async function writeList(text: string) {
  await prisma.$executeRaw`
    INSERT INTO "ProxyList" ("id", "text", "updatedAt")
    VALUES (${LIST_ID}, ${text}, NOW())
    ON CONFLICT ("id") DO UPDATE SET
      "text" = EXCLUDED."text",
      "updatedAt" = NOW()
  `;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  try {
    const existing = await readList();
    if (existing == null) {
      await writeList("");
      return NextResponse.json({ text: "" });
    }
    return NextResponse.json({ text: existing });
  } catch (e) {
    const message = e instanceof Error ? e.message : "failed to load proxies";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  try {
    const body = (await req.json()) as { text?: string };
    const text = typeof body.text === "string" ? body.text : "";
    await writeList(text);
    return NextResponse.json({ text, count: lineCount(text) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "failed to save proxies";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
