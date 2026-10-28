import type { Env } from "./types";
import { now } from "./lib";

export type ExternalProvider = "resend" | "sendgrid";
export interface MarketingSettings {
  provider: ExternalProvider;
  transactional_provider: "cloudflare" | ExternalProvider;
  api_key?: string;
  webhook_secret?: string;
  sendgrid_api_key?: string;
  sendgrid_webhook_public_key?: string;
  sender_name: string;
  postal_address: string;
  verified_domains: string[];
  sendgrid_verified_domains: string[];
}
export const providerDomains = (s: MarketingSettings, p: ExternalProvider) =>
  p === "sendgrid" ? s.sendgrid_verified_domains : s.verified_domains;
export const providerKey = (s: MarketingSettings, p: ExternalProvider) =>
  p === "sendgrid" ? s.sendgrid_api_key : s.api_key;
const base64 = (data: Uint8Array) => btoa(String.fromCharCode(...data));
const unbase64 = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
async function encryptionKey(secret: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`genesend:provider:v1:${secret}`),
  );
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function encrypt(secret: string, text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12)),
    cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await encryptionKey(secret),
      new TextEncoder().encode(text),
    );
  return JSON.stringify({
    v: 1,
    iv: base64(iv),
    data: base64(new Uint8Array(cipher)),
  });
}
export async function decrypt(secret: string, value: string) {
  const data = JSON.parse(value);
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unbase64(data.iv) },
      await encryptionKey(secret),
      unbase64(data.data),
    ),
  );
}
export async function getMarketing(env: Env): Promise<MarketingSettings> {
  const defaults: MarketingSettings = {
    provider: "resend",
    transactional_provider: "cloudflare",
    sender_name: "",
    postal_address: "",
    verified_domains: [],
    sendgrid_verified_domains: [],
  };
  const row = await env.DB.prepare(
    "SELECT value FROM settings WHERE key='marketing'",
  ).first<{ value: string }>();
  return row
    ? {
        ...defaults,
        ...JSON.parse(await decrypt(env.SESSION_SECRET, row.value)),
      }
    : defaults;
}
export async function saveMarketing(env: Env, settings: MarketingSettings) {
  await env.DB.prepare(
    "INSERT INTO settings(key,value,updated_at) VALUES('marketing',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
  )
    .bind(await encrypt(env.SESSION_SECRET, JSON.stringify(settings)), now())
    .run();
}
export async function resendRequest(
  settings: MarketingSettings,
  path: string,
  options: RequestInit = {},
) {
  if (!settings.api_key)
    throw new Error("Configure a Resend API key in Settings first.");
  return fetch(`https://api.resend.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${settings.api_key}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    signal: AbortSignal.timeout(15000),
  });
}
export async function verifyResendDomains(settings: MarketingSettings) {
  const r = await resendRequest(settings, "/domains");
  if (!r.ok)
    throw new Error(
      "Resend could not validate this key. Use a full-access key to verify sending domains.",
    );
  const data = await r.json<{ data: { name: string; status: string }[] }>();
  return data.data
    .filter((d) => d.status === "verified")
    .map((d) => d.name.toLowerCase());
}
export async function sendgridRequest(
  settings: MarketingSettings,
  path: string,
  options: RequestInit = {},
) {
  if (!settings.sendgrid_api_key)
    throw new Error("Configure a SendGrid API key first.");
  return fetch(`https://api.sendgrid.com/v3${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${settings.sendgrid_api_key}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    signal: AbortSignal.timeout(15000),
  });
}
export async function verifySendgridDomains(settings: MarketingSettings) {
  const r = await sendgridRequest(settings, "/whitelabel/domains?limit=200");
  if (!r.ok)
    throw new Error(
      "SendGrid domain validation failed. The API key needs Domain Authentication read permission.",
    );
  const domains = await r.json<{ domain: string; valid: boolean }[]>();
  return domains.filter((d) => d.valid).map((d) => d.domain.toLowerCase());
}
