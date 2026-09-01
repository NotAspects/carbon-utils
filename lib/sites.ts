export type CatalogChild = {
  slug: string;
  name: string;
  short: string;
};

export type CatalogPlatform = {
  id: string;
  name: string;
  slug?: string;
  hint?: string;
  children?: CatalogChild[];
};

export const PLATFORM_CATALOG: CatalogPlatform[] = [
  {
    id: "ticketmaster",
    name: "Ticketmaster",
    hint: "Regions",
    children: [
      { slug: "ticketmaster-fr", name: "Ticketmaster FR", short: "FR" },
      { slug: "ticketmaster-de", name: "Ticketmaster DE", short: "DE" },
      { slug: "ticketmaster-uk", name: "Ticketmaster UK", short: "UK" },
      { slug: "ticketmaster-us", name: "Ticketmaster US", short: "US" },
      { slug: "ticketmaster-sg", name: "Ticketmaster SG", short: "SG" },
    ],
  },
  { id: "axs", name: "AXS", slug: "axs" },
  {
    id: "eventim",
    name: "Eventim",
    hint: "Affiliates",
    children: [
      { slug: "ticketone", name: "TicketOne", short: "TicketOne" },
      { slug: "fnac-spectacle", name: "Fnac Spectacle", short: "Fnac Spectacle" },
      { slug: "oeticket", name: "Oeticket", short: "Oeticket" },
      { slug: "ticketcorner", name: "TicketCorner", short: "TicketCorner" },
      { slug: "entradas", name: "Entradas", short: "Entradas" },
    ],
  },
  { id: "seetickets", name: "SeeTickets", slug: "seetickets" },
  { id: "gigs-and-tours", name: "Gigs And Tours", slug: "gigs-and-tours" },
  { id: "tomorrowland", name: "TML", slug: "tomorrowland" },
  { id: "psg", name: "PSG", slug: "psg" },
  { id: "olympics-la28", name: "Olympics (LA28)", slug: "olympics-la28" },
  { id: "roland-garros", name: "Roland Garros", slug: "roland-garros" },
  { id: "fifa", name: "FIFA", slug: "fifa" },
  { id: "dice", name: "Dice", slug: "dice" },
];

export const DEFAULT_SITES = PLATFORM_CATALOG.flatMap((p) =>
  p.children ?? (p.slug ? [{ slug: p.slug, name: p.name }] : [])
);

const EVENTIM_SLUGS = new Set([
  "eventim",
  "ticketone",
  "fnac-spectacle",
  "oeticket",
  "ticketcorner",
  "entradas",
]);

export function logoFor(key: string): string | null {
  const path = (() => {
    if (key.startsWith("ticketmaster")) return "/logos/ticketmaster.png";
    if (EVENTIM_SLUGS.has(key)) return "/logos/eventim.png";
    if (key === "psg") return "/logos/psg.png";
    if (key === "seetickets") return "/logos/seetickets.png";
    if (key === "gigs-and-tours") return "/logos/gigs-and-tours.png";
    if (key === "olympics-la28") return "/logos/la28.jpeg";
    if (key === "axs") return "/logos/axs.png";
    if (key === "tomorrowland") return "/logos/tomorrowland.png";
    if (key === "roland-garros") return "/logos/roland-garros.png";
    if (key === "fifa") return "/logos/fifa.jpeg";
    return null;
  })();
  return path ? `${path}?v=4` : null;
}

/** Wordmarks that need the full image on white — do not crop. */
export function logoContain(key: string) {
  return key === "axs" || key === "olympics-la28";
}

export const ACCOUNT_STATUSES = ["active", "used", "banned", "inactive", "kyc"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export function isTicketmasterSlug(slug: string) {
  return slug === "ticketmaster" || slug.startsWith("ticketmaster-");
}

const EMAIL_RE = /[^\s,;"<>]+@[^\s,;"<>]+/g;

function normPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 ? digits : "";
}

/** Emails / logins / phones from a KYC CSV (any column). */
export function parseKycKeys(text: string): { logins: string[]; phones: string[] } {
  const logins = new Set<string>();
  const phones = new Set<string>();
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const emails = line.match(EMAIL_RE) ?? [];
    for (const email of emails) logins.add(email.toLowerCase());

    const delim = line.includes(";") && (!line.includes(",") || line.indexOf(";") < line.indexOf(",")) ? ";" : ",";
    const cells = splitCsvLine(line, delim).map((c) => c.trim());
    const first = (cells[0] ?? "").toLowerCase();
    if (HEADER_CELLS.has(first) || first === "phone" || first === "tel" || first === "mobile") continue;

    if (!emails.length && first && first.includes("@")) logins.add(first);
    else if (!emails.length && first && first !== "kyc") logins.add(first);

    for (const cell of cells) {
      if (cell.includes("@") || !/^[+\d][\d\s().-]{7,}$/.test(cell)) continue;
      const phone = normPhone(cell);
      if (phone) phones.add(phone);
    }
  }

  return { logins: [...logins], phones: [...phones] };
}

export function accountMatchesKyc(
  login: string,
  phone: string | null,
  keys: { logins: Set<string>; phones: Set<string> }
) {
  if (keys.logins.has(login.toLowerCase())) return true;
  const phoneKey = phone ? normPhone(phone) : "";
  return Boolean(phoneKey && keys.phones.has(phoneKey));
}

export function slugify(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export type ParsedAccount = {
  login: string;
  password: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  notes: string | null;
};

function emptyToNull(v: string | undefined | null) {
  const t = (v ?? "").trim();
  return t ? t : null;
}

const HEADER_CELLS = new Set([
  "mail",
  "email",
  "e-mail",
  "login",
  "user",
  "username",
]);

function isHeaderRow(line: string) {
  const delim = line.includes(";") && !line.includes(",") ? ";" : ",";
  const first = (splitCsvLine(line, delim)[0] ?? "").trim().toLowerCase();
  return HEADER_CELLS.has(first);
}

function looksLikeCsv(line: string) {
  if (/^[^\s,;]+@[^\s,;]+[,;]/.test(line)) return true;
  if (line.includes(";") && line.split(";").length >= 2 && !line.includes(":")) return true;
  if (line.includes(",") && splitCsvLine(line, ",").length >= 2) {
    return !line.includes(":") || line.indexOf(",") < line.indexOf(":");
  }
  return false;
}

/** One line = email,password (CSV) or login:password. */
export function parseAccountLines(text: string): ParsedAccount[] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !isHeaderRow(l))
    .map((line) => {
      if (looksLikeCsv(line)) {
        const delim = line.includes(";") && (!line.includes(",") || line.indexOf(";") < line.indexOf(","))
          ? ";"
          : ",";
        return parseCsvRow(line, delim);
      }
      const i = line.indexOf(":");
      if (i === -1) {
        return {
          login: line,
          password: null,
          phone: null,
          firstName: null,
          lastName: null,
          birthDate: null,
          notes: null,
        };
      }
      const login = line.slice(0, i).trim();
      const rest = line.slice(i + 1);
      const parts = rest.split(":");
      const password = emptyToNull(parts[0]);
      const extra = parts.slice(1).map((p) => p.trim()).filter(Boolean);
      return {
        login,
        password,
        phone: null,
        firstName: null,
        lastName: null,
        birthDate: null,
        notes: extra.length ? extra.join(" · ") : null,
      };
    })
    .filter((r) => r.login);
}

/** email,password,phone,first_name,last_name,birth_date */
export function parseCsvRow(line: string, delim = ","): ParsedAccount {
  const cols = splitCsvLine(line, delim);
  return {
    login: (cols[0] ?? "").trim(),
    password: emptyToNull(cols[1]),
    phone: emptyToNull(cols[2]),
    firstName: emptyToNull(cols[3]),
    lastName: emptyToNull(cols[4]),
    birthDate: emptyToNull(cols[5]),
    notes: null,
  };
}

function splitCsvLine(line: string, delim = ","): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === delim && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}
