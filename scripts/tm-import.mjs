#!/usr/bin/env node
// Importe les comptes Ticketmaster postés par webhooks (embeds "CARBON - TICKETMASTER - ...")
// et les route vers le bon site selon le champ Country de l'embed
// (fallback : token pays dans le nom du salon, ex #account-tm-proxy-uk).
//
// Usage : node scripts/tm-import.mjs [--channels id1,id2 | --guild id] [--dry]
// Token : DISCORD_TOKEN dans .env.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://discord.com/api/v10";
const GUILD = "1413863361250201724"; // Carbon Private

for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const TOKEN = process.env.DISCORD_TOKEN?.trim();
if (!TOKEN) { console.error("DISCORD_TOKEN manquant dans .env"); process.exit(1); }
const authHeader = TOKEN.startsWith("Bot ") ? TOKEN : TOKEN;

async function api(pathname, params) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(API + pathname + (params ? `?${params}` : ""), { headers: { Authorization: authHeader } });
    if (res.status === 429) {
      const wait = ((await res.json()).retry_after ?? 1) * 1000;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} sur ${pathname}`);
    return res.json();
  }
  throw new Error(`rate limit persistant sur ${pathname}`);
}

async function fetchAllMessages(channelId) {
  const all = [];
  let before;
  while (true) {
    const qs = new URLSearchParams({ limit: "100" });
    if (before) qs.set("before", before);
    const batch = await api(`/channels/${channelId}/messages`, qs);
    if (!batch.length) break;
    all.push(...batch);
    before = batch[batch.length - 1].id;
    if (batch.length < 100) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  return all;
}

const SITES = {
  fr: "cmths4o1r0000uxz5vpscsx5l", // ticketmaster-fr
  de: "cmthsi63o0003uxz5ctrbm3yg", // ticketmaster-de
  uk: "cmthsi63o0004uxz5w6pt8ju7", // ticketmaster-uk
  us: "cmthsi63o0005uxz52i3gmzlb", // ticketmaster-us
};

function routeCountry(value, channelName) {
  const v = (value ?? "").trim().toLowerCase();
  if (/^(fr|france)$/.test(v)) return "fr";
  if (/^(us|usa|united states)$/.test(v)) return "us";
  if (/^(uk|united kingdom|gb)$/.test(v)) return "uk";
  if (/^(de|germany|deutschland)$/.test(v)) return "de";
  const ch = (channelName ?? "").toLowerCase();
  if (/\bfr\b|france/.test(ch)) return "fr";
  if (/\bus\b|\busa\b/.test(ch)) return "us";
  if (/\buk\b|\bgb\b/.test(ch)) return "uk";
  if (/\bde\b|germany/.test(ch)) return "de";
  return null;
}

const clean = (s) => (s ?? "").trim().replace(/^`+|`+$/g, "").replace(/^\|\||\|\|$/g, "");

function accountFromTmEmbed(embed, channelName) {
  const fields = embed.fields ?? [];
  const get = (re) => {
    const f = fields.find((f) => re.test((f.name ?? "").trim()));
    return f ? clean(f.value) : "";
  };
  const login = get(/^(mail|email)\b/i);
  const password = get(/password/i);
  if (!login || !password) return null; // ex: "ACCOUNT ALREADY EXISTS" sans password
  return {
    login,
    password,
    phone: get(/phone/i) || null,
    firstName: get(/first\s*name/i) || null,
    lastName: get(/last\s*name/i) || null,
    country: routeCountry(get(/^country/i), channelName),
    title: embed.title ?? "",
  };
}

const args = process.argv.slice(2);
function argValue(name) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
}
const dry = args.includes("--dry");

async function main() {
  let channels = [];
  const channelsArg = argValue("--channels");
  if (channelsArg) {
    for (const id of channelsArg.split(",").map((s) => s.trim()).filter(Boolean)) {
      const ch = await api(`/channels/${id}`);
      channels.push({ id: ch.id, name: ch.name ?? id });
    }
  } else {
    const list = await api(`/guilds/${GUILD}/channels`);
    channels = list.filter((c) => c.type === 0).map((c) => ({ id: c.id, name: c.name }));
  }

  // dédoublonnage par site (login insensible à la casse)
  const seen = new Map(); // `${country}:${loginLower}` -> row
  const skipped = { noPassword: 0, noCountry: new Map() }; // noCountry: titre -> count
  let matched = 0;

  for (const ch of channels) {
    let messages;
    try {
      messages = await fetchAllMessages(ch.id);
    } catch (e) {
      console.warn(`  ! #${ch.name} ignoré : ${e.message}`);
      continue;
    }
    let channelMatched = 0;
    for (const m of messages) {
      if (!m.webhook_id) continue;
      const embeds = (m.embeds ?? []).filter((e) => ((e.title ?? "") + (m.content ?? "")).toLowerCase().includes("ticketmaster"));
      if (!embeds.length) continue;
      channelMatched++;
      const date = m.timestamp ? m.timestamp.slice(0, 10) : "";
      for (const e of embeds) {
        const acc = accountFromTmEmbed(e, ch.name);
        if (!acc) { skipped.noPassword++; continue; }
        if (!acc.country) {
          const key = acc.title.replace(/\d+/g, "N").slice(0, 50) || "(sans titre)";
          skipped.noCountry.set(key, (skipped.noCountry.get(key) ?? 0) + 1);
          continue;
        }
        const key = `${acc.country}:${acc.login.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.set(key, {
            siteId: SITES[acc.country],
            login: acc.login,
            password: acc.password,
            phone: acc.phone,
            firstName: acc.firstName,
            lastName: acc.lastName,
            notes: `discord:#${ch.name} ${date}`,
            status: "active",
          });
        }
      }
    }
    matched += channelMatched;
    console.log(`  #${ch.name} : ${messages.length} messages, ${channelMatched} webhooks TM`);
  }

  const rows = [...seen.values()];
  console.log(`\n${matched} webhooks TM filtrés -> ${rows.length} comptes uniques routés par pays`);
  const perCountry = {};
  for (const r of rows) perCountry[r.siteId] = (perCountry[r.siteId] ?? 0) + 1;
  const names = Object.fromEntries(Object.entries(SITES).map(([k, v]) => [v, k]));
  for (const [siteId, n] of Object.entries(perCountry)) console.log(`  ${names[siteId] ?? siteId} : ${n}`);
  console.log(`  sans password (ALREADY EXISTS...) : ${skipped.noPassword} (ignorés)`);
  for (const [title, n] of skipped.noCountry) console.log(`  sans country, ignorés [${title}] : ${n}`);

  if (dry || rows.length === 0) { console.log(dry ? "(mode --dry, rien inséré)" : "rien à importer"); return; }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  let inserted = 0;
  for (const siteId of new Set(rows.map((r) => r.siteId))) {
    const siteRows = rows.filter((r) => r.siteId === siteId);
    const existing = new Set(
      (await prisma.account.findMany({ where: { siteId }, select: { login: true } })).map((a) => a.login.toLowerCase()),
    );
    const fresh = siteRows.filter((r) => !existing.has(r.login.toLowerCase()));
    if (fresh.length) await prisma.account.createMany({ data: fresh });
    inserted += fresh.length;
    console.log(`  site ${names[siteId]} : ${fresh.length} importés (${siteRows.length - fresh.length} déjà présents)`);
  }
  await prisma.$disconnect();
  console.log(`Total importé : ${inserted}`);
}

main().catch((e) => { console.error("Échec :", e.message); process.exit(1); });
