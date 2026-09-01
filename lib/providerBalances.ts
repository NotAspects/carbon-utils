export type BalanceResult = {
  slug: string;
  amount: number | null;
  currency: string | null;
  error: string | null;
  unsupported: boolean;
};

const TIMEOUT_MS = 4000;

async function fetchText(url: string, init?: RequestInit) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(t);
  }
}

function parseActivateBalance(text: string) {
  const m = text.match(/ACCESS_BALANCE:(-?\d+(?:\.\d+)?)/i);
  if (m) return Number(m[1]);
  throw new Error(text.slice(0, 80) || "invalid balance response");
}

function num(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error("invalid balance");
  return n;
}

async function smsActivate(url: string, key: string) {
  const { text } = await fetchText(`${url}?action=getBalance&api_key=${encodeURIComponent(key)}`);
  return parseActivateBalance(text);
}

async function capsolverStyle(url: string, key: string) {
  const { text } = await fetchText(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientKey: key }),
  });
  const json = JSON.parse(text) as { errorId?: number; errorDescription?: string; balance?: unknown };
  if (json.errorId && json.errorId !== 0) throw new Error(json.errorDescription || "balance error");
  return num(json.balance);
}

async function fetchOne(slug: string, key: string): Promise<Omit<BalanceResult, "slug">> {
  if (!key.trim()) return { amount: null, currency: null, error: "empty key", unsupported: false };

  switch (slug) {
    case "hero-sms":
      return { amount: await smsActivate("https://hero-sms.com/stubs/handler_api.php", key), currency: "USD", error: null, unsupported: false };
    case "sms-bower":
      return { amount: await smsActivate("https://smsbower.page/stubs/handler_api.php", key), currency: "USD", error: null, unsupported: false };
    case "sms-man": {
      // Official control API: balance is always RUB (sms-man SDK / docs-apiv2).
      const urls = [
        `https://api.sms-man.com/control/get-balance?token=${encodeURIComponent(key)}`,
        `https://api.sms-man.ru/control/get-balance?token=${encodeURIComponent(key)}`,
      ];
      let lastError = "sms-man error";
      for (const url of urls) {
        const { text, ok } = await fetchText(url);
        try {
          const json = JSON.parse(text) as { balance?: unknown; error_msg?: string; error?: string };
          if (json.error_msg || json.error) throw new Error(String(json.error_msg || json.error));
          if (json.balance == null) throw new Error("no balance field");
          return { amount: num(json.balance), currency: "RUB", error: null, unsupported: false };
        } catch (e) {
          lastError = e instanceof Error ? e.message : text.slice(0, 80) || "sms-man error";
          if (!ok) continue;
        }
      }
      throw new Error(lastError);
    }
    case "5sim": {
      const { text, ok } = await fetchText("https://5sim.net/v1/user/profile", {
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      });
      if (!ok) throw new Error(text.slice(0, 80) || "5sim error");
      const json = JSON.parse(text) as { balance?: unknown };
      return { amount: num(json.balance), currency: "USD", error: null, unsupported: false };
    }
    case "ohmyotp": {
      const { text, ok } = await fetchText("https://ohmyotp.com/api/v1/balance", {
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      });
      if (!ok) throw new Error(text.slice(0, 80) || "ohmyotp error");
      const json = JSON.parse(text) as { balance?: unknown };
      return { amount: num(json.balance), currency: "USD", error: null, unsupported: false };
    }
    case "smspool": {
      const body = new URLSearchParams({ key });
      const { text } = await fetchText("https://api.smspool.net/request/balance", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const json = JSON.parse(text) as { balance?: unknown; success?: number; message?: string };
      if (json.success === 0) throw new Error(json.message || "smspool error");
      return { amount: num(json.balance), currency: "USD", error: null, unsupported: false };
    }
    case "capsolver":
      return { amount: await capsolverStyle("https://api.capsolver.com/getBalance", key), currency: "USD", error: null, unsupported: false };
    case "uncaptcha":
      try {
        return { amount: await capsolverStyle("https://api.ucaptcha.net/getBalance", key), currency: "USD", error: null, unsupported: false };
      } catch {
        return { amount: await capsolverStyle("https://api.anti-captcha.com/getBalance", key), currency: "USD", error: null, unsupported: false };
      }
    case "one_stop":
      return { amount: await capsolverStyle("https://api.1stcaptcha.com/getBalance", key), currency: "USD", error: null, unsupported: false };
    case "hyper_solution": {
      const { text, ok } = await fetchText("https://api.hypersolutions.co/usage", {
        headers: { "x-api-key": key },
      });
      if (!ok) throw new Error(text.slice(0, 80) || "hyper solutions error");
      const json = JSON.parse(text) as { balanceEuro?: unknown; balance?: unknown };
      return { amount: num(json.balanceEuro ?? json.balance), currency: "EUR", error: null, unsupported: false };
    }
    case "kagedcap": {
      const { text, ok } = await fetchText("https://api.kagedcap.com/getBalance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientKey: key }),
      });
      if (!ok) throw new Error(text.slice(0, 80) || "kagedcap error");
      const json = JSON.parse(text) as { balance?: unknown; errorDescription?: string; errorId?: number };
      if (json.errorId && json.errorId !== 0) throw new Error(json.errorDescription || "kagedcap error");
      return { amount: num(json.balance), currency: "USD", error: null, unsupported: false };
    }
    default:
      return { amount: null, currency: null, error: null, unsupported: true };
  }
}

export async function fetchProviderBalance(slug: string, key: string): Promise<BalanceResult> {
  try {
    const r = await fetchOne(slug, key);
    return { slug, ...r };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return { slug, amount: null, currency: null, error: msg, unsupported: false };
  }
}
