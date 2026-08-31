export const DEFAULT_SITES = [
  { slug: "ticketmaster-fr", name: "Ticketmaster FR" },
  { slug: "fnac-spectacle", name: "Fnac Spectacle" },
] as const;

export const ACCOUNT_STATUSES = ["active", "used", "banned", "inactive"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

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

/** One line = login:password  — extra colon-separated fields become notes. */
export function parseAccountLines(text: string): ParsedAccount[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !l.toLowerCase().startsWith("mail,") && !l.toLowerCase().startsWith("email,"))
    .map((line) => {
      if (line.includes(",") && line.split(",").length >= 2 && !line.includes(":")) {
        return parseCsvRow(line);
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

/** mail,password,phone_number,first_name,last_name,birth_date */
export function parseCsvRow(line: string): ParsedAccount {
  const cols = splitCsvLine(line);
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

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}
