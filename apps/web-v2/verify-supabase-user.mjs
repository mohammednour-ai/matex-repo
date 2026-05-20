import { readFileSync } from "fs";
const env = Object.fromEntries(
  readFileSync("../../.env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim()];
    }),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TARGET = "c63edcd8-edcc-4847-98ed-a4791e697172";

async function api(method, path, body, key = SERVICE) {
  const res = await fetch(`${URL}${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const list = await api("GET", `/auth/v1/admin/users?per_page=200`);
const matches = (list.json.users ?? []).filter((u) => (u.email ?? "").toLowerCase() === "mohammednour@gmail.com");
console.log(`users with email mohammednour@gmail.com: ${matches.length}`);
matches.forEach((u) =>
  console.log("  ", { id: u.id, email: u.email, confirmed: u.email_confirmed_at, created: u.created_at }),
);

const byId = await api("GET", `/auth/v1/admin/users/${TARGET}`);
console.log(`get target ${TARGET}: HTTP ${byId.status}`);
if (byId.status === 200) {
  console.log("  ", { id: byId.json.id, email: byId.json.email, confirmed: byId.json.email_confirmed_at });
}

const signin = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "mohammednour@gmail.com", password: "MatexDev2026!" }),
});
const signinJson = await signin.json().catch(() => ({}));
console.log(`signInWithPassword: HTTP ${signin.status}`);
console.log("  ", signinJson.access_token ? "✓ TOKEN RETURNED — login should work" : signinJson);
