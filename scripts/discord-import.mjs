#!/usr/bin/env node
// Importe les comptes postés dans un serveur Discord (messages + messages de webhooks)
// vers la table Account de carbon-utils.
//
// Usage :
//   node scripts/discord-import.mjs                          # liste tes serveurs + sites dispos
//   node scripts/discord-import.mjs --guild <id>             # scanne tous les salons texte du serveur
//   node scripts/discord-import.mjs --channels <id1,id2>     # scanne seulement ces salons
//   node scripts/discord-import.mjs --guild <id> --site <slug|nom>   # importe en base
//   node scripts/discord-import.mjs --guild <id> --out comptes.txt   # exporte juste un fichier à coller
//
// Token : mettre DISCORD_TOKEN=... dans .env (token utilisateur ou "Bot <token>").
// Un token utilisateur utilisé pour de l'automatisation est contre les ToS Discord
// (risque de ban du compte) — préférer un bot avec l'intent "Message Content".

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://discord.com/api/v10";

// --- chargement .env sans dépendance ---
for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !(m[1] in process.env)) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const args = process.argv.slice(2);
function argValue(name) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
}

const TOKEN = process.env.DISCORD_TOKEN?.trim();
if (!TOKEN) {
  console.error("Erreur : DISCORD_TOKEN manquant. Ajoute-le dans .env (jamais dans le chat).");
  process.exit(1);
}

let authHeader = TOKEN.startsWith("Bot ") ? TOKEN : TOKEN;
async function api(pathname, params) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const url = API + pathname + (params ? `?${params}` : "");
    const res = await fetch(url, { headers: { Authorization: authHeader } });
    if (res.status === 401 && !TOKEN.startsWith("Bot ") && attempt === 0) {
      authHeader = `Bot ${TOKEN}`; // probablement un token de bot, on réessaie
      continue;
    }
    if (res.status === 429) {
      const wait = (await res.json()).retry_after ?? 1;
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText} sur ${pathname} — vérifie le token et les IDs`);
    }
    return res.json();
  }
  throw new Error(`Rate limit persistant sur ${pathname}`);
}

// --- extraction des paires login:password ---
// Formats gérés : login:pass, CSV (; , | ou tab), cellules entre guillemets, lignes d'entête.
function splitAccountLine(line) {
  for (const sep of [";", "\t", "|", ",", ":"]) {
    if (!line.includes(sep)) continue;
    const cells = line.split(sep);
    const login = (cells[0] ?? "").trim().replace(/^"+|"+$/g, "");
    const password = (cells[1] ?? "").trim().replace(/^"+|"+$/g, "");
    if (!login || !password || /\s/.test(login) || /\s/.test(password)) continue;
    if (sep !== ":" && login.includes(":")) continue; // faux séparateur (ex: "mail:pass;note")
    return { login, password };
  }
  return null;
}

const HEADER_CELLS = /^(login|user|username|email|mail|compte|account|password|pass|mdp|motdepasse)s?$/i;

function extractFromText(text, notes, out, seen) {
  for (const rawLine of (text ?? "").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^`+|`+$/g, "");
    if (!line || line.includes("://") || line.startsWith("#")) continue;
    const pair = splitAccountLine(line);
    if (!pair) continue;
    if (HEADER_CELLS.test(pair.login) || HEADER_CELLS.test(pair.password)) continue; // entête CSV
    if (!pair.login.includes("@")) continue; // le texte libre ne fournit que des logins email
    if (/^\d{1,2}$/.test(pair.login) && /^\d{1,2}$/.test(pair.password)) continue; // heures type 12:30
    const key = pair.login.toLowerCase();
    if (seen.has(key)) continue;
    seen.set(key, { ...pair, notes });
  }
}

function textsOfMessage(m) {
  const parts = [m.content ?? ""];
  for (const e of m.embeds ?? []) {
    parts.push(e.description ?? "");
    for (const f of e.fields ?? []) parts.push(`${f.name ?? ""}\n${f.value ?? ""}`);
  }
  return parts.filter(Boolean);
}

// Comptes postés en embed par les webhooks de génération :
// on mappe les champs (Mail/Email, Password, Phone, First/Last Name, Birth Date)
// directement sur le modèle Account. Retourne null si l'embed n'en est pas un.
function accountFromEmbed(e) {
  const fields = e.fields ?? [];
  const get = (re) => {
    const f = fields.find((f) => re.test((f.name ?? "").trim()));
    return f ? (f.value ?? "").trim().replace(/`/g, "") : "";
  };
  const login = get(/^(mail|email)\b/i) || get(/mail|email/i);
  const password = get(/password|pass\b/i);
  if (!login || !password) return null;
  return {
    login,
    password,
    phone: get(/phone/i) || null,
    firstName: get(/first\s*name/i) || null,
    lastName: get(/last\s*name/i) || null,
    birthDate: get(/birth/i) || null,
  };
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
    await new Promise((r) => setTimeout(r, 400)); // anti rate-limit
  }
  return all;
}

async function main() {
  const guildId = argValue("--guild");
  const channelsArg = argValue("--channels");
  const siteArg = argValue("--site");
  const outFile = argValue("--out");

  // découverte des salons
  let channels = []; // {id, name}
  if (channelsArg) {
    for (const id of channelsArg.split(",").map((s) => s.trim()).filter(Boolean)) {
      const ch = await api(`/channels/${id}`);
      channels.push({ id: ch.id, name: ch.name ?? id });
    }
  } else if (guildId) {
    const list = await api(`/guilds/${guildId}/channels`);
    channels = list.filter((c) => c.type === 0).map((c) => ({ id: c.id, name: c.name }));
    console.log(`${channels.length} salons texte trouvés dans le serveur.`);
  } else {
    const guilds = await api("/users/@me/guilds");
    console.log("Serveurs accessibles (relance avec --guild <id>) :");
    for (const g of guilds) console.log(`  ${g.id}  ${g.name}`);
    console.log("\nSites existants en base :");
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    for (const s of await prisma.site.findMany()) {
      console.log(`  ${s.slug}  ${s.name}  (${s.id})`);
    }
    await prisma.$disconnect();
    return;
  }

  // collecte (--filter : texte devant apparaître dans le message ; --webhook-only : ignorer les messages humains)
  const filter = (argValue("--filter") ?? "").toLowerCase();
  const webhookOnly = args.includes("--webhook-only");
  const seen = new Map();
  let matched = 0;
  for (const ch of channels) {
    let messages;
    try {
      messages = await fetchAllMessages(ch.id);
    } catch (e) {
      console.warn(`  ! ${ch.name} (${ch.id}) ignoré : ${e.message}`);
      continue;
    }
    let channelMatched = 0;
    for (const m of messages) {
      if (webhookOnly && !m.webhook_id) continue;
      const date = m.timestamp ? m.timestamp.slice(0, 10) : "";
      const notes = `discord:#${ch.name} ${date}`.trim();
      if (filter) {
        const hay = [m.content ?? ""];
        for (const e of m.embeds ?? []) {
          hay.push(e.title ?? "", e.description ?? "");
          for (const f of e.fields ?? []) hay.push(f.name ?? "", f.value ?? "");
        }
        if (!hay.join("\n").toLowerCase().includes(filter)) continue;
      }
      channelMatched++;
      let handled = false;
      for (const e of m.embeds ?? []) {
        const acc = accountFromEmbed(e);
        if (acc) {
          const key = acc.login.toLowerCase();
          if (!seen.has(key)) seen.set(key, { ...acc, notes });
          handled = true;
        } else {
          extractFromText(e.description ?? "", notes, seen, seen);
          for (const f of e.fields ?? []) extractFromText(`${f.name ?? ""}\n${f.value ?? ""}`, notes, seen, seen);
        }
      }
      if (!handled) {
        extractFromText(m.content ?? "", notes, seen, seen);
        for (const a of Object.values(m.attachments ?? {})) {
          if (!/\.(txt|csv)$/i.test(a.filename ?? "")) continue;
          try {
            const text = await (await fetch(a.url)).text();
            extractFromText(text, `${notes} ${a.filename}`, seen, seen);
          } catch { /* pièce jointe illisible, on continue */ }
        }
      }
    }
    matched += channelMatched;
    console.log(`  #${ch.name} : ${messages.length} messages lus, ${channelMatched} correspondant au filtre`);
  }

  const accounts = [...seen.values()];
  console.log(`\n${matched} messages filtrés, ${accounts.length} comptes uniques extraits.`);
  for (const a of accounts.slice(0, 5)) {
    console.log(`  ex: ${a.login}:${"*".repeat(Math.min(a.password.length, 8))}  [${a.notes}]`);
  }
  if (accounts.length === 0) return;

  if (outFile) {
    fs.writeFileSync(path.join(ROOT, outFile), accounts.map((a) => `${a.login}:${a.password}`).join("\n") + "\n");
    console.log(`Écrit dans ${outFile} — collable dans l'import en masse de la page Accounts.`);
    return;
  }

  if (!siteArg) {
    console.log("\nAjoute --site <slug|nom> pour insérer en base, ou --out <fichier> pour un export texte.");
    return;
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  let site = await prisma.site.findFirst({
    where: { OR: [{ slug: siteArg }, { name: { equals: siteArg, mode: "insensitive" } }] },
  });
  if (!site) {
    const slug = siteArg.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    site = await prisma.site.create({ data: { slug, name: siteArg } });
    console.log(`Site créé : ${site.name} (${site.slug})`);
  }
  const existing = new Set(
    (await prisma.account.findMany({ where: { siteId: site.id }, select: { login: true } })).map((a) => a.login.toLowerCase()),
  );
  const rows = accounts
    .filter((a) => !existing.has(a.login.toLowerCase()))
    .map((a) => ({
      siteId: site.id,
      login: a.login,
      password: a.password,
      phone: a.phone ?? null,
      firstName: a.firstName ?? null,
      lastName: a.lastName ?? null,
      birthDate: a.birthDate ?? null,
      notes: a.notes,
      status: "active",
    }));
  let created = 0;
  if (rows.length) {
    const res = await prisma.account.createMany({ data: rows });
    created = res.count;
  }
  console.log(`${created} comptes importés dans « ${site.name} » (${accounts.length - rows.length} déjà présents ignorés).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Échec :", e.message);
  process.exit(1);
});
