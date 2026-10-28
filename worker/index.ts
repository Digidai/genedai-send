import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import PostalMime from "postal-mime";
import type { Env, Variables } from "./types";
import {
  constantEqual,
  hash,
  id,
  normalizeEmail,
  now,
  parseCsv,
  parseTags,
  required,
  sendingAllowed,
} from "./lib";
import {
  ApiError,
  dispatch,
  deliver,
  enqueueEmail,
  runEvent,
  unsubscribePage,
} from "./mail";
import { demo } from "./demo";
import {
  getMarketing,
  saveMarketing,
  verifyResendDomains,
  verifySendgridDomains,
  providerKey,
  providerDomains,
} from "./provider";
import {
  startCampaign,
  handleResendWebhook,
  handleSendgridWebhook,
  recordTracking,
  type CampaignRow,
} from "./marketing";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use(
  "/api/*",
  bodyLimit({
    maxSize: 1100000,
    onError: (c) => c.json({ error: "Request too large." }, 413),
  }),
);
app.use(
  "/v1/*",
  bodyLimit({
    maxSize: 1100000,
    onError: (c) => c.json({ error: "Request too large." }, 413),
  }),
);
app.use(
  "/webhooks/*",
  bodyLimit({
    maxSize: 1100000,
    onError: (c) => c.json({ error: "Request too large." }, 413),
  }),
);
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Frame-Options", "DENY");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (c.req.path.startsWith("/api") || c.req.path.startsWith("/v1"))
    c.header("Cache-Control", "no-store");
});
app.onError((error, c) => {
  if (error instanceof ApiError)
    return c.json({ error: error.message }, error.status as 400);
  if (error instanceof SyntaxError)
    return c.json({ error: "Invalid JSON payload." }, 400);
  console.error("Request failed", error.name, error.message);
  return c.json({ error: "The request could not be completed." }, 500);
});
app.use("/api/*", async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    const origin = c.req.header("Origin");
    const url = new URL(c.req.url);
    const localVite = !!c.env.DEV_ORIGIN && origin === c.env.DEV_ORIGIN;
    if (origin && origin !== url.origin && !localVite)
      throw new ApiError(403, "Cross-origin requests are not allowed.");
  }
  if (Number(c.req.header("Content-Length") ?? 0) > 1100000)
    throw new ApiError(413, "Request too large.");
  await next();
});
async function body(c: {
  req: { json: () => Promise<unknown> };
}): Promise<Record<string, unknown>> {
  const b = await c.req.json();
  if (!b || typeof b !== "object" || Array.isArray(b))
    throw new ApiError(400, "Expected a JSON object.");
  return b as Record<string, unknown>;
}
async function valid<T>(fn: () => T): Promise<T> {
  try {
    return fn();
  } catch (e) {
    throw new ApiError(422, (e as Error).message);
  }
}
app.get("/api/health", (c) =>
  c.json({ name: "GeneSend", version: "0.1.0", status: "ok" }),
);
app.get("/api/demo/:resource", (c) => {
  const data = demo[c.req.param("resource")];
  return data
    ? c.json({ data, sample: true })
    : c.json({ error: "Not found" }, 404);
});
app.post("/api/login", async (c) => {
  if (!c.env.ADMIN_KEY_HASH)
    throw new ApiError(503, "Operator login has not been configured.");
  const ipHash = await hash(
    (c.req.header("CF-Connecting-IP") ?? "local") + c.env.SESSION_SECRET,
  );
  const count = await c.env.DB.prepare(
    "SELECT count(*) n FROM login_attempts WHERE ip_hash=? AND created_at>?",
  )
    .bind(ipHash, new Date(Date.now() - 900000).toISOString())
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= 10)
    throw new ApiError(
      429,
      "Too many login attempts. Try again in 15 minutes.",
    );
  await c.env.DB.prepare(
    "INSERT INTO login_attempts(ip_hash,created_at) VALUES(?,?)",
  )
    .bind(ipHash, now())
    .run();
  const b = await body(c);
  const key = typeof b.key === "string" ? b.key : "";
  if (!constantEqual(await hash(key), c.env.ADMIN_KEY_HASH))
    throw new ApiError(401, "The workspace access key is incorrect.");
  const token = id("session") + id("s");
  await c.env.DB.prepare(
    "INSERT INTO sessions(token_hash,expires_at) VALUES(?,?)",
  )
    .bind(await hash(token), new Date(Date.now() + 7 * 86400000).toISOString())
    .run();
  setCookie(c, "gs_session", token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
    path: "/",
    maxAge: 604800,
  });
  return c.json({ ok: true });
});
app.post("/api/logout", async (c) => {
  const token = getCookie(c, "gs_session");
  if (token)
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(await hash(token))
      .run();
  deleteCookie(c, "gs_session", { path: "/" });
  return c.json({ ok: true });
});
app.get("/api/session", async (c) => {
  const token = getCookie(c, "gs_session");
  const session = token
    ? await c.env.DB.prepare(
        "SELECT token_hash FROM sessions WHERE token_hash=? AND expires_at>?",
      )
        .bind(await hash(token), now())
        .first()
    : null;
  return c.json({ authenticated: !!session });
});
app.use("/api/*", async (c, next) => {
  const token = getCookie(c, "gs_session");
  if (
    !token ||
    !(await c.env.DB.prepare(
      "SELECT token_hash FROM sessions WHERE token_hash=? AND expires_at>?",
    )
      .bind(await hash(token), now())
      .first())
  )
    throw new ApiError(401, "Sign in to your workspace to continue.");
  c.set("scope", "admin");
  c.set("principal", "owner");
  await next();
});
app.use("/v1/*", async (c, next) => {
  if (Number(c.req.header("Content-Length") ?? 0) > 1100000)
    throw new ApiError(413, "Request too large.");
  const token = c.req.header("Authorization")?.replace(/^Bearer /, "");
  if (!token) throw new ApiError(401, "Provide a Bearer API key.");
  const key = await c.env.DB.prepare(
    "SELECT id,scope FROM api_keys WHERE key_hash=? AND revoked_at IS NULL",
  )
    .bind(await hash(token))
    .first<{ id: string; scope: "send" | "read" | "contacts" }>();
  if (!key) throw new ApiError(401, "Invalid or revoked API key.");
  const rate = await c.env.DB.prepare(
    "INSERT INTO api_rate_windows(key_id,window,count) VALUES(?,?,1) ON CONFLICT(key_id,window) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(key.id, Math.floor(Date.now() / 60000))
    .first<{ count: number }>();
  if ((rate?.count ?? 0) > 120) {
    c.header("Retry-After", "60");
    throw new ApiError(429, "API key limit exceeded. Retry in one minute.");
  }
  c.set("scope", key.scope);
  c.set("principal", key.id);
  await c.env.DB.prepare("UPDATE api_keys SET last_used_at=? WHERE id=?")
    .bind(now(), key.id)
    .run();
  const read = c.req.method === "GET";
  const contacts = c.req.path.startsWith("/v1/contacts");
  if (
    contacts
      ? key.scope !== "contacts"
      : read
        ? key.scope !== "read"
        : key.scope !== "send"
  )
    throw new ApiError(403, "This API key does not have the required scope.");
  await next();
});
app.get("/api/config", async (c) => {
  const s = await getMarketing(c.env);
  return c.json({
    data: {
      app_url: c.env.APP_URL,
      sending_enabled: c.env.SEND_ENABLED === "true",
      sending_domains: c.env.SENDING_DOMAINS.split(",").filter(Boolean),
      provider: s.transactional_provider,
      marketing_provider: s.provider,
      marketing_enabled:
        !!providerKey(s, s.provider) &&
        !!s.postal_address &&
        providerDomains(s, s.provider).length > 0,
      inbound_requires_routing: true,
    },
  });
});
app.get("/api/providers", async (c) => {
  const s = await getMarketing(c.env);
  return c.json({
    data: {
      provider: s.provider,
      transactional_provider: s.transactional_provider,
      sender_name: s.sender_name,
      postal_address: s.postal_address,
      resend_configured: !!s.api_key,
      resend_webhook_configured: !!s.webhook_secret,
      sendgrid_configured: !!s.sendgrid_api_key,
      sendgrid_webhook_configured: !!s.sendgrid_webhook_public_key,
      resend_domains: s.verified_domains,
      sendgrid_domains: s.sendgrid_verified_domains,
    },
  });
});
app.post("/api/providers", async (c) => {
  const b = await body(c),
    s = await getMarketing(c.env);
  if (b.provider && ["resend", "sendgrid"].includes(String(b.provider)))
    s.provider = b.provider as "resend" | "sendgrid";
  if (
    b.transactional_provider &&
    ["cloudflare", "resend", "sendgrid"].includes(
      String(b.transactional_provider),
    )
  )
    s.transactional_provider =
      b.transactional_provider as typeof s.transactional_provider;
  for (const [field, target] of [
    ["resend_api_key", "api_key"],
    ["resend_webhook_secret", "webhook_secret"],
    ["sendgrid_api_key", "sendgrid_api_key"],
    ["sendgrid_webhook_public_key", "sendgrid_webhook_public_key"],
  ] as const) {
    if (typeof b[field] === "string" && b[field]) {
      if (String(b[field]).length > 4000)
        throw new ApiError(422, "Provider credential is too long.");
      if (field === "resend_api_key") s.verified_domains = [];
      if (field === "sendgrid_api_key") s.sendgrid_verified_domains = [];
      s[target] = String(b[field]).trim();
    }
  }
  if (typeof b.sender_name === "string")
    s.sender_name = b.sender_name.trim().slice(0, 100);
  if (typeof b.postal_address === "string")
    s.postal_address = b.postal_address.trim().slice(0, 500);
  await saveMarketing(c.env, s);
  return c.json({ ok: true });
});
app.post("/api/providers/:provider/verify", async (c) => {
  const s = await getMarketing(c.env);
  try {
    if (c.req.param("provider") === "resend")
      s.verified_domains = await verifyResendDomains(s);
    else if (c.req.param("provider") === "sendgrid")
      s.sendgrid_verified_domains = await verifySendgridDomains(s);
    else throw new ApiError(422, "Unsupported provider.");
    await saveMarketing(c.env, s);
    return c.json({
      data: {
        domains:
          c.req.param("provider") === "resend"
            ? s.verified_domains
            : s.sendgrid_verified_domains,
      },
    });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(422, (e as Error).message);
  }
});
app.get("/api/overview", async (c) => {
  const db = c.env.DB;
  const [counts, contacts, templates, campaigns, recent, series] =
    await Promise.all([
      db
        .prepare("SELECT status,count(*) n FROM emails GROUP BY status")
        .all<{ status: string; n: number }>(),
      db.prepare("SELECT count(*) n FROM contacts").first<{ n: number }>(),
      db.prepare("SELECT count(*) n FROM templates").first<{ n: number }>(),
      db.prepare("SELECT count(*) n FROM campaigns").first<{ n: number }>(),
      db
        .prepare(
          "SELECT id,to_email,subject,status,kind,created_at FROM emails ORDER BY created_at DESC LIMIT 5",
        )
        .all(),
      db
        .prepare(
          "SELECT substr(created_at,1,10) day,count(*) count FROM emails WHERE created_at>=? GROUP BY day ORDER BY day",
        )
        .bind(new Date(Date.now() - 30 * 86400000).toISOString())
        .all(),
    ]);
  const totals: Record<string, number> = {
    total: 0,
    accepted: 0,
    delivered: 0,
    failed: 0,
    queued: 0,
    contacts: contacts?.n ?? 0,
    templates: templates?.n ?? 0,
    campaigns: campaigns?.n ?? 0,
  };
  for (const x of counts.results) {
    totals[x.status] = x.n;
    totals.total += x.n;
  }
  return c.json({
    data: {
      totals,
      recent: recent.results,
      series: series.results,
      sample: false,
    },
  });
});
app.get("/api/contacts", async (c) => {
  const q = (c.req.query("q") ?? "").slice(0, 100);
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM contacts WHERE email LIKE ? OR name LIKE ? ORDER BY created_at DESC LIMIT 1000",
  )
    .bind(`%${q}%`, `%${q}%`)
    .all<{ tags: string; properties: string }>();
  return c.json({
    data: results.map((x) => ({
      ...x,
      tags: JSON.parse(x.tags),
      properties: JSON.parse(x.properties),
    })),
  });
});
async function upsertContact(env: Env, b: Record<string, unknown>) {
  const email = await valid(() => normalizeEmail(b.email)),
    name = typeof b.name === "string" ? b.name.slice(0, 200) : "",
    tags = parseTags(b.tags);
  const subscribed = b.opt_in === true;
  const timestamp = now();
  // Upserts never silently resubscribe or remove a suppression.
  await env.DB.prepare(
    "INSERT INTO contacts(id,email,name,status,tags,properties,consent_at,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,tags=excluded.tags,properties=excluded.properties",
  )
    .bind(
      id("ct"),
      email,
      name,
      subscribed ? "subscribed" : "pending",
      JSON.stringify(tags),
      JSON.stringify(
        b.properties && typeof b.properties === "object" ? b.properties : {},
      ),
      subscribed ? timestamp : null,
      timestamp,
    )
    .run();
  return env.DB.prepare("SELECT * FROM contacts WHERE email=?")
    .bind(email)
    .first();
}
app.post("/api/contacts", async (c) =>
  c.json({ data: await upsertContact(c.env, await body(c)) }, 201),
);
app.post("/v1/contacts", async (c) =>
  c.json({ data: await upsertContact(c.env, await body(c)) }, 201),
);
app.post("/api/contacts/import", async (c) => {
  const b = await body(c);
  const rows = await valid(() => parseCsv(required(b.csv, "CSV", 1000000)));
  const errors: { row: number; error: string }[] = [];
  let imported = 0;
  for (let i = 0; i < rows.length; i++) {
    try {
      await upsertContact(c.env, {
        email: rows[i].email,
        name: rows[i].name,
        tags: (rows[i].tags ?? "").split(";").filter(Boolean),
        opt_in: rows[i].opt_in?.trim().toLowerCase() === "true",
      });
      imported++;
    } catch (e) {
      errors.push({ row: i + 2, error: (e as Error).message });
    }
  }
  return c.json({ data: { imported, errors } });
});
app.patch("/api/contacts/:id", async (c) => {
  const b = await body(c);
  if (!["unsubscribed", "suppressed"].includes(String(b.status)))
    throw new ApiError(422, "Only unsubscribe or suppress is supported here.");
  await c.env.DB.prepare("UPDATE contacts SET status=? WHERE id=?")
    .bind(b.status, c.req.param("id"))
    .run();
  if (b.status === "suppressed")
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO suppressions(email,reason,created_at) SELECT email,'manual',? FROM contacts WHERE id=?",
    )
      .bind(now(), c.req.param("id"))
      .run();
  return c.json({ ok: true });
});
app.get("/api/templates", async (c) =>
  c.json({
    data: (
      await c.env.DB.prepare(
        "SELECT * FROM templates ORDER BY updated_at DESC LIMIT 200",
      ).all()
    ).results,
  }),
);
app.post("/api/templates", async (c) => {
  const b = await body(c),
    templateId = typeof b.id === "string" ? b.id : id("tp");
  const name = await valid(() => required(b.name, "Name")),
    subject = await valid(() => required(b.subject, "Subject", 998)),
    html = await valid(() => required(b.html, "HTML", 100000));
  await c.env.DB.prepare(
    "INSERT INTO templates(id,name,subject,html,category,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,subject=excluded.subject,html=excluded.html,category=excluded.category,updated_at=excluded.updated_at",
  )
    .bind(
      templateId,
      name,
      subject,
      html,
      b.category === "marketing" ? "marketing" : "transactional",
      now(),
    )
    .run();
  return c.json({ data: { id: templateId } }, 201);
});
app.get("/api/campaigns", async (c) =>
  c.json({
    data: (
      await c.env.DB.prepare(
        "SELECT c.*,(SELECT count(*) FROM campaign_recipients r WHERE r.campaign_id=c.id) recipients,(SELECT count(*) FROM emails e WHERE e.campaign_id=c.id AND status IN ('accepted','delivered')) accepted,(SELECT count(*) FROM emails e WHERE e.campaign_id=c.id AND status='delivered') delivered,(SELECT count(*) FROM email_events v JOIN emails e ON e.id=v.email_id WHERE e.campaign_id=c.id AND v.type='email.opened') opened,(SELECT count(*) FROM email_events v JOIN emails e ON e.id=v.email_id WHERE e.campaign_id=c.id AND v.type='email.clicked') clicked FROM campaigns c ORDER BY created_at DESC LIMIT 200",
      ).all()
    ).results,
  }),
);
app.post("/api/campaigns", async (c) => {
  const b = await body(c),
    campaignId = typeof b.id === "string" ? b.id : id("cp");
  const name = await valid(() => required(b.name, "Name")),
    subject = await valid(() => required(b.subject, "Subject", 998)),
    from = await valid(() => normalizeEmail(b.from_email)),
    html = await valid(() => required(b.html, "HTML", 100000));
  const rate = Number(b.rate_per_minute ?? 60);
  if (!Number.isInteger(rate) || rate < 1 || rate > 100)
    throw new ApiError(422, "Choose a send rate from 1 to 100 per minute.");
  const saved = await c.env.DB.prepare(
    "INSERT INTO campaigns(id,name,subject,from_email,html,audience_tag,status,created_at,rate_per_minute,track_opens,track_clicks) VALUES(?,?,?,?,?,?,'draft',?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,subject=excluded.subject,from_email=excluded.from_email,html=excluded.html,audience_tag=excluded.audience_tag,rate_per_minute=excluded.rate_per_minute,track_opens=excluded.track_opens,track_clicks=excluded.track_clicks WHERE campaigns.status='draft' RETURNING id",
  )
    .bind(
      campaignId,
      name,
      subject,
      from,
      html,
      String(b.audience_tag ?? "").slice(0, 40),
      now(),
      rate,
      b.track_opens ? 1 : 0,
      b.track_clicks ? 1 : 0,
    )
    .first();
  if (!saved) throw new ApiError(409, "Only campaign drafts can be edited.");
  return c.json({ data: { id: campaignId, status: "draft" } }, 201);
});
app.get("/api/campaigns/:id/review", async (c) => {
  const campaign = await c.env.DB.prepare("SELECT * FROM campaigns WHERE id=?")
    .bind(c.req.param("id"))
    .first<CampaignRow>();
  if (!campaign) throw new ApiError(404, "Campaign not found.");
  const count = await c.env.DB.prepare(
    "SELECT count(*) n FROM contacts WHERE status='subscribed' AND (?='' OR EXISTS(SELECT 1 FROM json_each(contacts.tags) WHERE value=?)) AND NOT EXISTS(SELECT 1 FROM suppressions WHERE email=contacts.email)",
  )
    .bind(campaign.audience_tag, campaign.audience_tag)
    .first<{ n: number }>();
  const settings = await getMarketing(c.env);
  return c.json({
    data: {
      campaign,
      recipients: count?.n ?? 0,
      provider: campaign.provider ?? settings.provider,
      configured: !!providerKey(
        settings,
        campaign.provider ?? settings.provider,
      ),
      sender_name: settings.sender_name,
      postal_address: settings.postal_address,
    },
  });
});
app.post("/api/campaigns/:id/send", async (c) => {
  const b = await body(c);
  if (b.confirm !== true)
    throw new ApiError(
      422,
      "Review and confirm the recipient audience before sending.",
    );
  return c.json(
    {
      data: await startCampaign(
        c.env,
        c.req.param("id"),
        typeof b.scheduled_at === "string" ? b.scheduled_at : undefined,
      ),
    },
    202,
  );
});
app.post("/api/campaigns/:id/pause", async (c) => {
  const r = await c.env.DB.prepare(
    "UPDATE campaigns SET status='paused' WHERE id=? AND status IN ('scheduled','running') RETURNING id",
  )
    .bind(c.req.param("id"))
    .first();
  if (!r) throw new ApiError(409, "This campaign cannot be paused.");
  return c.json({ ok: true });
});
app.post("/api/campaigns/:id/resume", async (c) => {
  const r = await c.env.DB.prepare(
    "UPDATE campaigns SET status=CASE WHEN snapshot_at IS NULL THEN 'scheduled' ELSE 'running' END,build_after=NULL WHERE id=? AND status='paused' RETURNING id",
  )
    .bind(c.req.param("id"))
    .first();
  if (!r) throw new ApiError(409, "This campaign is not paused.");
  return c.json({ ok: true });
});
app.post("/api/campaigns/:id/cancel", async (c) => {
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE campaigns SET status='cancelled' WHERE id=? AND status!='completed'",
    ).bind(c.req.param("id")),
    c.env.DB.prepare(
      "UPDATE emails SET status='cancelled',updated_at=? WHERE campaign_id=? AND status IN ('queued','enqueued')",
    ).bind(now(), c.req.param("id")),
    c.env.DB.prepare(
      "UPDATE campaign_recipients SET status='cancelled' WHERE campaign_id=? AND status='pending'",
    ).bind(c.req.param("id")),
  ]);
  return c.json({ ok: true });
});
app.get("/api/emails", async (c) =>
  c.json({
    data: (
      await c.env.DB.prepare(
        "SELECT id,to_email,from_email,subject,kind,status,provider_id,error,available_at,created_at FROM emails ORDER BY created_at DESC LIMIT 200",
      ).all()
    ).results,
  }),
);
app.get("/api/emails/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM emails WHERE id=?")
    .bind(c.req.param("id"))
    .first<{ content_key: string }>();
  if (!row) throw new ApiError(404, "Email not found.");
  const content = await c.env.CONTENT.get(row.content_key);
  return c.json({
    data: {
      ...row,
      content: content ? await content.json() : null,
      events: (
        await c.env.DB.prepare(
          "SELECT type,detail,created_at FROM email_events WHERE email_id=? ORDER BY created_at",
        )
          .bind(c.req.param("id"))
          .all()
      ).results,
    },
  });
});
app.post("/api/emails/:id/cancel", async (c) => {
  const row = await c.env.DB.prepare(
    "UPDATE emails SET status='cancelled',updated_at=? WHERE id=? AND status IN ('queued','enqueued') RETURNING id",
  )
    .bind(now(), c.req.param("id"))
    .first();
  if (!row) throw new ApiError(409, "Only queued emails can be cancelled.");
  return c.json({ ok: true });
});
async function send(c: Context<{ Bindings: Env; Variables: Variables }>) {
  const b = await body(c);
  if (b.kind && !["transactional", "marketing"].includes(String(b.kind)))
    throw new ApiError(422, "Choose transactional or marketing email.");
  delete b.campaign_id;
  if (b.template_id) {
    const t = await c.env.DB.prepare("SELECT * FROM templates WHERE id=?")
      .bind(String(b.template_id))
      .first<{ html: string; subject: string; category: string }>();
    if (!t) throw new ApiError(404, "Template not found.");
    if (t.category === "marketing" && b.kind !== "marketing")
      throw new ApiError(
        409,
        "Choose marketing kind for a marketing template.",
      );
    const { personalize } = await import("./lib");
    const vars =
      typeof b.variables === "object" && b.variables
        ? (b.variables as Record<string, unknown>)
        : {};
    b.html = personalize(t.html, vars);
    b.subject = b.subject ?? personalize(t.subject, vars);
  }
  const key = c.req.header("Idempotency-Key");
  if (key && key.length > 120)
    throw new ApiError(422, "Idempotency-Key must be under 120 characters.");
  let result;
  try {
    result = await enqueueEmail(
      c.env,
      b,
      key ? `${c.get("principal")}:${key}` : null,
    );
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(422, (e as Error).message);
  }
  c.executionCtx.waitUntil(dispatch(c.env));
  return c.json({ data: result }, 202);
}
app.post("/api/emails", send);
app.post("/v1/emails", send);
app.post("/v1/mails/send", send);
app.get("/v1/emails/:id", async (c) => {
  const e = await c.env.DB.prepare(
    "SELECT id,to_email,subject,status,provider_id,error,created_at FROM emails WHERE id=?",
  )
    .bind(c.req.param("id"))
    .first();
  if (!e) throw new ApiError(404, "Email not found.");
  return c.json({ data: e });
});
app.get("/api/keys", async (c) =>
  c.json({
    data: (
      await c.env.DB.prepare(
        "SELECT id,name,prefix,scope,created_at,last_used_at,revoked_at FROM api_keys ORDER BY created_at DESC",
      ).all()
    ).results,
  }),
);
app.post("/api/keys", async (c) => {
  const b = await body(c),
    name = await valid(() => required(b.name, "Name"));
  if (!["send", "read", "contacts"].includes(String(b.scope)))
    throw new ApiError(422, "Choose send, read, or contacts scope.");
  const token = `gs_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`,
    keyId = id("key");
  await c.env.DB.prepare(
    "INSERT INTO api_keys(id,name,prefix,key_hash,scope,created_at) VALUES(?,?,?,?,?,?)",
  )
    .bind(
      keyId,
      name,
      token.slice(0, 10),
      await hash(token),
      String(b.scope),
      now(),
    )
    .run();
  return c.json({ data: { id: keyId, key: token } }, 201);
});
app.delete("/api/keys/:id", async (c) => {
  await c.env.DB.prepare("UPDATE api_keys SET revoked_at=? WHERE id=?")
    .bind(now(), c.req.param("id"))
    .run();
  return c.json({ ok: true });
});
app.get("/api/domains", async (c) =>
  c.json({
    data: (
      await c.env.DB.prepare(
        "SELECT * FROM domains ORDER BY created_at DESC",
      ).all()
    ).results.map((d) => ({
      ...d,
      status: sendingAllowed(String(d.name), c.env.SENDING_DOMAINS)
        ? "ready"
        : "pending",
    })),
  }),
);
app.post("/api/domains", async (c) => {
  const b = await body(c);
  const name = String(b.name ?? "")
    .toLowerCase()
    .trim();
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(name))
    throw new ApiError(422, "Enter a valid domain name.");
  const domainId = id("dm");
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO domains(id,name,verification_token,created_at) VALUES(?,?,?,?)",
  )
    .bind(domainId, name, id("verify"), now())
    .run();
  return c.json({ data: { id: domainId } }, 201);
});
app.get("/api/domains/:id/dns", async (c) => {
  const d = await c.env.DB.prepare("SELECT * FROM domains WHERE id=?")
    .bind(c.req.param("id"))
    .first<{ name: string; verification_token: string }>();
  if (!d) throw new ApiError(404, "Domain not found.");
  const names = [
    { type: "TXT", name: `_genesend.${d.name}` },
    { type: "TXT", name: `cf-bounce.${d.name}` },
    { type: "TXT", name: `cf-bounce._domainkey.${d.name}` },
    { type: "TXT", name: `_dmarc.${d.name}` },
  ];
  const records = await Promise.all(
    names.map(async (q) => {
      try {
        const res = await fetch(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(q.name)}&type=TXT`,
          { headers: { Accept: "application/dns-json" } },
        );
        const data = await res.json<{ Answer?: { data: string }[] }>();
        return { ...q, values: data.Answer?.map((a) => a.data) ?? [] };
      } catch {
        return { ...q, values: [], error: "DNS lookup failed" };
      }
    }),
  );
  return c.json({
    data: {
      records,
      ready: sendingAllowed(d.name, c.env.SENDING_DOMAINS),
      verification_token: d.verification_token,
    },
  });
});
app.get("/api/automations", async (c) =>
  c.json({
    data: (
      await c.env.DB.prepare(
        "SELECT a.*, (SELECT count(*) FROM automation_runs r WHERE r.automation_id=a.id) runs FROM automations a ORDER BY created_at DESC",
      ).all()
    ).results,
  }),
);
app.post("/api/automations", async (c) => {
  const b = await body(c),
    automationId = typeof b.id === "string" ? b.id : id("au");
  const name = await valid(() => required(b.name, "Name")),
    event = await valid(() => required(b.event_name, "Event name", 100)),
    from = await valid(() => normalizeEmail(b.from_email));
  const delay = Number(b.delay_minutes ?? 0);
  if (!Number.isInteger(delay) || delay < 0 || delay > 43200)
    throw new ApiError(422, "Delay must be between 0 and 43,200 minutes.");
  const t = await c.env.DB.prepare("SELECT category FROM templates WHERE id=?")
    .bind(String(b.template_id ?? ""))
    .first<{ category: string }>();
  if (!t || t.category !== "transactional")
    throw new ApiError(422, "Choose a transactional template.");
  if (
    b.status === "active" &&
    (!sendingAllowed(from.split("@")[1], c.env.SENDING_DOMAINS) ||
      c.env.SEND_ENABLED !== "true")
  )
    throw new ApiError(409, "Enable a verified sender before activating.");
  await c.env.DB.prepare(
    "INSERT INTO automations(id,name,event_name,template_id,from_email,delay_minutes,status,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,event_name=excluded.event_name,template_id=excluded.template_id,from_email=excluded.from_email,delay_minutes=excluded.delay_minutes,status=excluded.status",
  )
    .bind(
      automationId,
      name,
      event,
      String(b.template_id),
      from,
      delay,
      b.status === "active" ? "active" : "draft",
      now(),
    )
    .run();
  return c.json({ data: { id: automationId } }, 201);
});
app.post("/api/events", async (c) => {
  let result;
  try {
    result = await runEvent(c.env, await body(c), c.get("principal"));
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(422, (e as Error).message);
  }
  c.executionCtx.waitUntil(dispatch(c.env));
  return c.json({ data: result }, 202);
});
app.post("/v1/events", async (c) => {
  let result;
  try {
    result = await runEvent(c.env, await body(c), c.get("principal"));
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(422, (e as Error).message);
  }
  c.executionCtx.waitUntil(dispatch(c.env));
  return c.json({ data: result }, 202);
});
app.get("/api/suppressions", async (c) =>
  c.json({
    data: (
      await c.env.DB.prepare(
        "SELECT * FROM suppressions ORDER BY created_at DESC LIMIT 1000",
      ).all()
    ).results,
  }),
);
app.post("/api/suppressions", async (c) => {
  const b = await body(c),
    email = await valid(() => normalizeEmail(b.email));
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT OR IGNORE INTO suppressions(email,reason,created_at) VALUES(?,?,?)",
    ).bind(email, "manual", now()),
    c.env.DB.prepare(
      "UPDATE contacts SET status='suppressed' WHERE email=?",
    ).bind(email),
  ]);
  return c.json({ ok: true });
});
app.get("/api/inbound", async (c) =>
  c.json({
    data: (
      await c.env.DB.prepare(
        "SELECT id,from_email,to_email,subject,created_at FROM inbound ORDER BY created_at DESC LIMIT 200",
      ).all()
    ).results,
  }),
);
app.get("/api/inbound/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM inbound WHERE id=?")
    .bind(c.req.param("id"))
    .first<{ content_key: string }>();
  if (!row) throw new ApiError(404, "Message not found.");
  const blob = await c.env.CONTENT.get(row.content_key);
  return c.json({ data: { ...row, content: blob ? await blob.json() : null } });
});
app.get("/u/:id/:signature", async (c) =>
  c.html(
    await unsubscribePage(
      c.env,
      c.req.param("id"),
      c.req.param("signature"),
      false,
    ),
  ),
);
app.post("/u/:id/:signature", async (c) =>
  c.html(
    await unsubscribePage(
      c.env,
      c.req.param("id"),
      c.req.param("signature"),
      true,
    ),
  ),
);
app.post("/webhooks/resend", async (c) =>
  c.json(
    await handleResendWebhook(c.env, await c.req.text(), {
      "svix-id": c.req.header("svix-id") ?? "",
      "svix-timestamp": c.req.header("svix-timestamp") ?? "",
      "svix-signature": c.req.header("svix-signature") ?? "",
    }),
  ),
);
app.post("/webhooks/sendgrid", async (c) =>
  c.json(
    await handleSendgridWebhook(
      c.env,
      await c.req.text(),
      c.req.header("X-Twilio-Email-Event-Webhook-Signature") ?? "",
      c.req.header("X-Twilio-Email-Event-Webhook-Timestamp") ?? "",
    ),
  ),
);
app.get("/t/o/:id/:signature", async (c) => {
  await recordTracking(
    c.env,
    "open",
    c.req.param("id"),
    c.req.param("signature"),
  );
  return new Response(
    Uint8Array.from(
      atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
      (x) => x.charCodeAt(0),
    ),
    { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" } },
  );
});
app.get("/t/c/:id/:signature", async (c) =>
  c.redirect(
    await recordTracking(
      c.env,
      "click",
      c.req.param("id"),
      c.req.param("signature"),
    ),
    302,
  ),
);
app.all("/api/*", (c) => c.json({ error: "Endpoint not found." }, 404));
app.all("/v1/*", (c) => c.json({ error: "Endpoint not found." }, 404));
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export { app };
export default {
  fetch: app.fetch,
  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(dispatch(env));
  },
  async queue(batch: MessageBatch<{ id: string }>, env: Env) {
    for (const message of batch.messages) {
      try {
        await deliver(env, message.body.id);
        message.ack();
      } catch {
        message.retry({ delaySeconds: 60 });
      }
    }
  },
  async email(message: ForwardableEmailMessage, env: Env) {
    const allowed = env.SENDING_DOMAINS.split(",").map((x) => x.trim());
    if (!allowed.includes(message.to.split("@")[1])) {
      message.setReject("Recipient domain not configured.");
      return;
    }
    if (message.rawSize > 5 * 1024 * 1024) {
      message.setReject("Message exceeds 5 MB.");
      return;
    }
    const parsed = await PostalMime.parse(
        await new Response(message.raw).arrayBuffer(),
      ),
      inboundId = id("in"),
      key = `inbound/${inboundId}.json`;
    await env.CONTENT.put(
      key,
      JSON.stringify({
        html: parsed.html ?? "",
        text: parsed.text ?? "",
        attachments: parsed.attachments.map((a) => ({
          filename: a.filename,
          mimeType: a.mimeType,
          size:
            typeof a.content === "string"
              ? a.content.length
              : a.content.byteLength,
        })),
      }),
    );
    await env.DB.prepare(
      "INSERT INTO inbound(id,from_email,to_email,subject,content_key,created_at) VALUES(?,?,?,?,?,?)",
    )
      .bind(
        inboundId,
        message.from,
        message.to,
        parsed.subject ?? "(no subject)",
        key,
        now(),
      )
      .run();
  },
} satisfies ExportedHandler<Env, { id: string }>;
