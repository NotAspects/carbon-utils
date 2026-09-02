export type ApiGroup = "sms" | "solver" | "aycd";

export type ProviderDef = {
  slug: string;
  name: string;
  group: ApiGroup;
  balance: boolean;
};

export const API_PROVIDERS: ProviderDef[] = [
  { slug: "hero-sms", name: "Hero SMS", group: "sms", balance: true },
  { slug: "sms-man", name: "SMS-Man", group: "sms", balance: true },
  { slug: "sms-bower", name: "SMS Bower", group: "sms", balance: true },
  { slug: "5sim", name: "5sim", group: "sms", balance: true },
  { slug: "smspool", name: "SMSPool", group: "sms", balance: true },
  { slug: "ohmyotp", name: "OhMyOTP", group: "sms", balance: true },
  { slug: "capsolver", name: "CapSolver", group: "solver", balance: true },
  { slug: "uncaptcha", name: "Uncaptcha", group: "solver", balance: true },
  { slug: "one_stop", name: "One Stop", group: "solver", balance: true },
  { slug: "hyper_solution", name: "Hyper Solutions", group: "solver", balance: true },
  { slug: "inhouse", name: "Inhouse", group: "solver", balance: false },
  { slug: "kagedcap", name: "KagedCap", group: "solver", balance: true },
  { slug: "dispurcaptcha", name: "DispurCaptcha", group: "solver", balance: false },
  { slug: "aycd", name: "AYCD", group: "aycd", balance: false },
  { slug: "aycd-autosolve", name: "AutoSolve", group: "aycd", balance: false },
];

export const KEY_GROUPS: { id: ApiGroup; name: string; hint: string }[] = [
  { id: "sms", name: "SMS", hint: "Providers" },
  { id: "solver", name: "Solvers", hint: "Providers" },
  { id: "aycd", name: "AYCD", hint: "Keys" },
];

