import { readFile } from "node:fs/promises";
const origin = process.argv[2] ?? "https://send.genedai.me";
const key =
  process.env.GENESEND_OWNER_KEY ??
  JSON.parse(
    await readFile(
      new URL("../secrets/deployment.json", import.meta.url),
      "utf8",
    ),
  ).key;
const checks = [];
let cookie = "";
async function check(
  path,
  expected,
  method = "GET",
  payload,
  authenticated = false,
) {
  const r = await fetch(origin + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { Cookie: cookie } : {}),
      ...(method !== "GET" ? { Origin: origin } : {}),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const data = await r.json();
  if (r.status !== expected)
    throw new Error(
      `${path}: expected ${expected}, got ${r.status}: ${data.error ?? ""}`,
    );
  checks.push({ path, status: r.status });
  return { r, data };
}
await check("/api/health", 200);
await check("/api/session", 200);
await check("/api/contacts", 401);
await check("/api/providers", 401);
await check("/api/demo/overview", 200);
const login = await check("/api/login", 200, "POST", { key });
cookie = login.r.headers.get("set-cookie").split(";")[0];
for (const path of [
  "/api/overview",
  "/api/config",
  "/api/contacts",
  "/api/templates",
  "/api/campaigns",
  "/api/automations",
  "/api/keys",
  "/api/domains",
  "/api/providers",
  "/api/inbound",
])
  await check(path, 200, "GET", undefined, true);
await check("/webhooks/resend", 503, "POST", {});
await check("/webhooks/sendgrid", 503, "POST", []);
await check("/api/logout", 200, "POST", {}, true);
await check("/api/contacts", 401, "GET", undefined, true);
console.log(
  JSON.stringify(
    { origin, checks: checks.length, results: checks, real_emails_sent: 0 },
    null,
    2,
  ),
);
