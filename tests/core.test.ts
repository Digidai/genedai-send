import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile } from "node:fs/promises";
import { app } from "../worker/index";
import { deliver, dispatch, enqueueEmail, runEvent } from "../worker/mail";
import { hash, parseCsv, personalize, sign } from "../worker/lib";
import type { Env } from "../worker/types";

let mf: Miniflare, env: Env, cookie: string;
const tasks: Promise<unknown>[] = [];
const ctx = {
  waitUntil: (p: Promise<unknown>) => tasks.push(p),
  passThroughOnException: () => {},
  props: {},
};
const send = vi.fn(async () => ({ messageId: "provider-receipt" }));
const queued = vi.fn(async () => {});
const payload = {
  from: "hello@genedai.me",
  to: "person@example.com",
  subject: "Hello",
  html: "<p>Hello</p>",
};
async function call(
  path: string,
  method = "GET",
  data?: unknown,
  authCookie = cookie,
  headers: Record<string, string> = {},
) {
  return app.request(
    `https://send.genedai.me${path}`,
    {
      method,
      headers: {
        ...(authCookie ? { Cookie: authCookie } : {}),
        "Content-Type": "application/json",
        ...headers,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    },
    env,
    ctx as unknown as ExecutionContext,
  );
}
async function makeKey(scope = "send") {
  const r = await call("/api/keys", "POST", { name: "test", scope });
  return ((await r.json()) as any).data;
}
async function enqueued() {
  const result = await enqueueEmail(env, payload, null);
  await dispatch(env);
  return result.id;
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-10-28",
      d1Databases: ["DB"],
      r2Buckets: ["CONTENT"],
    }),
  );
  const DB = await mf.getD1Database("DB"),
    CONTENT = await mf.getR2Bucket("CONTENT");
  env = {
    DB,
    CONTENT,
    SEND_QUEUE: { send: queued },
    EMAIL: { send },
    ADMIN_KEY_HASH: await hash("test-owner-key"),
    SESSION_SECRET: "test-only-session-secret",
    APP_URL: "https://send.genedai.me",
    SENDING_DOMAINS: "genedai.me",
    SEND_ENABLED: "true",
    ASSETS: { fetch: async () => new Response("app") },
  } as unknown as Env;
  for (const name of ["0001_initial.sql", "0002_marketing.sql"]) {
    const sql = await readFile(
      new URL("../migrations/" + name, import.meta.url),
      "utf8",
    );
    await DB.exec(sql.replaceAll("\n", " "));
  }
});
beforeEach(async () => {
  await Promise.allSettled(tasks.splice(0));
  send.mockReset().mockResolvedValue({ messageId: "provider-receipt" });
  queued.mockClear();
  for (const t of [
    "tracking_links",
    "campaign_recipients",
    "provider_events",
    "settings",
    "automation_runs",
    "event_receipts",
    "automations",
    "email_events",
    "emails",
    "contacts",
    "templates",
    "campaigns",
    "api_keys",
    "api_rate_windows",
    "suppressions",
    "sessions",
    "login_attempts",
    "domains",
  ])
    await env.DB.prepare(`DELETE FROM ${t}`).run();
  const r = await call("/api/login", "POST", { key: "test-owner-key" }, "");
  expect(r.status).toBe(200);
  cookie = r.headers.get("set-cookie")!.split(";")[0];
});
afterAll(async () => {
  await Promise.allSettled(tasks.splice(0));
  await mf?.dispose();
});

describe("Workspace boundaries", () => {
  it("keeps private APIs authenticated and sample data separate", async () => {
    await call("/api/contacts", "POST", {
      email: "secret@private.test",
      opt_in: true,
    });
    expect((await call("/api/contacts", "GET", undefined, "")).status).toBe(
      401,
    );
    const demo = await call("/api/demo/contacts", "GET", undefined, "");
    expect(await demo.text()).not.toContain("secret@private.test");
  });
  it("rejects cross-origin cookie mutations", async () =>
    expect(
      (
        await call(
          "/api/contacts",
          "POST",
          { email: "a@example.com" },
          cookie,
          { Origin: "https://evil.example" },
        )
      ).status,
    ).toBe(403));
  it("uses HttpOnly, Secure, SameSite owner cookies", async () => {
    const r = await call("/api/login", "POST", { key: "test-owner-key" }, "");
    const h = r.headers.get("set-cookie")!;
    expect(h).toContain("HttpOnly");
    expect(h).toContain("Secure");
    expect(h).toContain("SameSite=Strict");
  });
  it("limits failed login attempts", async () => {
    for (let i = 0; i < 10; i++)
      expect(
        (
          await call("/api/login", "POST", { key: "wrong" }, "", {
            "CF-Connecting-IP": "test-brute-force",
          })
        ).status,
      ).toBe(401);
    expect(
      (
        await call("/api/login", "POST", { key: "test-owner-key" }, "", {
          "CF-Connecting-IP": "test-brute-force",
        })
      ).status,
    ).toBe(429);
  });
  it("enforces API key scopes and revocation", async () => {
    const k = await makeKey("read");
    expect(
      (
        await call("/v1/emails", "POST", payload, "", {
          Authorization: `Bearer ${k.key}`,
        })
      ).status,
    ).toBe(403);
    await call(`/api/keys/${k.id}`, "DELETE");
    expect(
      (
        await call("/v1/emails/anything", "GET", undefined, "", {
          Authorization: `Bearer ${k.key}`,
        })
      ).status,
    ).toBe(401);
    expect(
      JSON.stringify(await env.DB.prepare("SELECT * FROM api_keys").all()),
    ).not.toContain(k.key);
  });
});
describe("Audience and content", () => {
  it("never resubscribes opt-outs on upsert or CSV import", async () => {
    const r = await call("/api/contacts", "POST", {
      email: "friend@example.com",
      name: "First",
      opt_in: true,
    });
    const contact = ((await r.json()) as any).data;
    await call(`/api/contacts/${contact.id}`, "PATCH", {
      status: "unsubscribed",
    });
    await call("/api/contacts/import", "POST", {
      csv: "email,name,tags,opt_in\nfriend@example.com,New Name,News,true",
    });
    const d = await env.DB.prepare("SELECT * FROM contacts WHERE id=?")
      .bind(contact.id)
      .first<any>();
    expect(d.status).toBe("unsubscribed");
    expect(d.name).toBe("New Name");
  });
  it("reports invalid rows and imports only valid CSV records", async () => {
    const r = await call("/api/contacts/import", "POST", {
      csv: 'email,name,opt_in\nvalid@example.com,"Alex, Jr",true\ninvalid,No,false',
    });
    const d = ((await r.json()) as any).data;
    expect(d.imported).toBe(1);
    expect(d.errors[0].row).toBe(3);
  });
  it("requires explicit permission for new subscribed contacts", async () => {
    await call("/api/contacts", "POST", { email: "pending@example.com" });
    expect(
      (await env.DB.prepare("SELECT status FROM contacts").first<any>()).status,
    ).toBe("pending");
  });
  it("parses escaped CSV quotes and escapes template variables", () => {
    expect(
      parseCsv('email,name\r\na@example.com,"A ""quoted"" name"')[0].name,
    ).toBe('A "quoted" name');
    expect(
      personalize("<p>{{name}}</p>", { name: "<script>bad</script>" }),
    ).toBe("<p>&lt;script&gt;bad&lt;/script&gt;</p>");
  });
  it("persists campaign drafts and blocks native marketing delivery", async () => {
    const r = await call("/api/campaigns", "POST", {
      name: "News",
      subject: "Update",
      from_email: "hello@genedai.me",
      html: "<p>News</p>",
    });
    expect(r.status).toBe(201);
    const campaign = ((await r.json()) as any).data;
    expect(
      (
        await call(`/api/campaigns/${campaign.id}/send`, "POST", {
          confirm: true,
        })
      ).status,
    ).toBe(409);
    expect(
      (await call("/api/emails", "POST", { ...payload, kind: "marketing" }))
        .status,
    ).toBe(409);
    expect(send).not.toHaveBeenCalled();
  });
});
describe("Delivery correctness", () => {
  it("deduplicates concurrent requests and rejects changed payloads", async () => {
    const key = await makeKey();
    const headers = {
      Authorization: `Bearer ${key.key}`,
      "Idempotency-Key": "same",
    };
    const rs = await Promise.all([
      call("/v1/emails", "POST", payload, "", headers),
      call("/v1/emails", "POST", payload, "", headers),
    ]);
    expect(rs.map((x) => x.status)).toEqual([202, 202]);
    const ds = await Promise.all(rs.map((x) => x.json() as Promise<any>));
    expect(ds[0].data.id).toBe(ds[1].data.id);
    expect(
      (
        await call(
          "/v1/emails",
          "POST",
          { ...payload, subject: "Different" },
          "",
          headers,
        )
      ).status,
    ).toBe(409);
  });
  it("atomically claims a queue message across duplicate consumers", async () => {
    const emailId = await enqueued();
    await Promise.all([deliver(env, emailId), deliver(env, emailId)]);
    expect(send).toHaveBeenCalledTimes(1);
    const row = await env.DB.prepare("SELECT * FROM emails WHERE id=?")
      .bind(emailId)
      .first<any>();
    expect(row.status).toBe("accepted");
    expect(row.provider_id).toBe("provider-receipt");
  });
  it("keeps a scheduled message out of the queue until due", async () => {
    const r = await enqueueEmail(
      env,
      {
        ...payload,
        scheduled_at: new Date(Date.now() + 3600000).toISOString(),
      },
      null,
    );
    await dispatch(env);
    expect(queued).not.toHaveBeenCalled();
    expect(
      (
        await env.DB.prepare("SELECT status FROM emails WHERE id=?")
          .bind(r.id)
          .first<any>()
      ).status,
    ).toBe("queued");
  });
  it("checks suppressions again at delivery time", async () => {
    const emailId = await enqueued();
    await call("/api/suppressions", "POST", { email: payload.to });
    await deliver(env, emailId);
    expect(send).not.toHaveBeenCalled();
    expect(
      (
        await env.DB.prepare("SELECT status FROM emails WHERE id=?")
          .bind(emailId)
          .first<any>()
      ).status,
    ).toBe("suppressed");
  });
  it("does not retry ambiguous provider outcomes", async () => {
    const emailId = await enqueued();
    send.mockRejectedValueOnce(new Error("Connection lost"));
    await deliver(env, emailId);
    expect(
      (
        await env.DB.prepare("SELECT status FROM emails WHERE id=?")
          .bind(emailId)
          .first<any>()
      ).status,
    ).toBe("uncertain");
    await dispatch(env);
    await deliver(env, emailId);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("reschedules explicit rate-limit failures", async () => {
    const emailId = await enqueued();
    send.mockRejectedValueOnce(
      Object.assign(new Error("Limited"), { code: "E_RATE_LIMIT_EXCEEDED" }),
    );
    await deliver(env, emailId);
    const row = await env.DB.prepare(
      "SELECT status,available_at FROM emails WHERE id=?",
    )
      .bind(emailId)
      .first<any>();
    expect(row.status).toBe("queued");
    expect(Date.parse(row.available_at)).toBeGreaterThan(Date.now());
  });
  it("cancels a queued email before delivery", async () => {
    const emailId = await enqueued();
    expect(
      (await call(`/api/emails/${emailId}/cancel`, "POST", {})).status,
    ).toBe(200);
    await deliver(env, emailId);
    expect(send).not.toHaveBeenCalled();
  });
  it("requires a valid unsubscribe signature and GET does not mutate", async () => {
    await call("/api/contacts", "POST", { email: payload.to, opt_in: true });
    const r = await enqueueEmail(env, payload, null);
    const sig = await sign(env.SESSION_SECRET, `unsubscribe:${r.id}`);
    expect((await call(`/u/${r.id}/bad`, "POST", undefined, "")).status).toBe(
      404,
    );
    expect((await call(`/u/${r.id}/${sig}`, "GET", undefined, "")).status).toBe(
      200,
    );
    expect(
      (await env.DB.prepare("SELECT status FROM contacts").first<any>()).status,
    ).toBe("subscribed");
    await call(`/u/${r.id}/${sig}`, "POST", undefined, "");
    expect(
      (await env.DB.prepare("SELECT status FROM contacts").first<any>()).status,
    ).toBe("unsubscribed");
  });
});
describe("Event automations", () => {
  it("queues delayed personalized email once per event and rejects event ID reuse", async () => {
    const t = await call("/api/templates", "POST", {
      name: "Welcome",
      subject: "Hi {{name}}",
      html: "<p>{{name}}</p>",
      category: "transactional",
    });
    const template = ((await t.json()) as any).data;
    await call("/api/automations", "POST", {
      name: "Welcome flow",
      event_name: "user.created",
      template_id: template.id,
      from_email: payload.from,
      delay_minutes: 60,
      status: "active",
    });
    const event = {
      event_id: "unique-event",
      event: "user.created",
      email: payload.to,
      properties: { name: "<Alex>" },
    };
    const first = await runEvent(env, event, "test");
    const second = await runEvent(env, event, "test");
    expect(first.matched).toBe(1);
    expect(first.emails[0].id).toBe(second.emails[0].id);
    const row = await env.DB.prepare("SELECT * FROM emails WHERE id=?")
      .bind(first.emails[0].id)
      .first<any>();
    expect(Date.parse(row.available_at)).toBeGreaterThan(Date.now() + 3500000);
    const content = await (await env.CONTENT.get(row.content_key))!.json<any>();
    expect(content.html).toBe("<p>&lt;Alex&gt;</p>");
    await dispatch(env);
    expect(queued).not.toHaveBeenCalled();
    await expect(
      runEvent(env, { ...event, email: "other@example.com" }, "test"),
    ).rejects.toThrow("different payload");
  });
});

describe("External providers and campaigns", () => {
  async function configured(provider: "resend" | "sendgrid" = "resend") {
    const { saveMarketing } = await import("../worker/provider");
    await saveMarketing(env, {
      provider,
      transactional_provider: "cloudflare",
      api_key: "re_test_secret",
      webhook_secret: "whsec_dGVzdC1zaWduaW5nLXNlY3JldC1rZXktMTIzNDU2Nzg=",
      sendgrid_api_key: "SG.test.secret",
      sender_name: "Test Org",
      postal_address: "123 Test Street",
      verified_domains: ["genedai.me"],
      sendgrid_verified_domains: ["genedai.me"],
    });
  }
  async function campaign() {
    const r = await call("/api/campaigns", "POST", {
      name: "A real draft",
      subject: "Hi {{name}}",
      from_email: payload.from,
      html: '<p>Hi {{name}}</p><a href="https://example.com/article">Read</a>',
      rate_per_minute: 2,
      track_opens: true,
      track_clicks: true,
    });
    return ((await r.json()) as any).data.id;
  }
  it("encrypts provider credentials and never returns them to the browser", async () => {
    await call("/api/providers", "POST", {
      provider: "sendgrid",
      resend_api_key: "re_very_private",
      sendgrid_api_key: "SG.very_private",
      sender_name: "Test Org",
      postal_address: "Address",
    });
    const stored = JSON.stringify(
      await env.DB.prepare("SELECT * FROM settings").all(),
    );
    expect(stored).not.toContain("very_private");
    const visible = await (await call("/api/providers")).text();
    expect(visible).not.toContain("very_private");
    expect(visible).toContain('"sendgrid_configured":true');
  });
  it("rejects marketing sent through the native Cloudflare channel", async () => {
    await configured();
    await call("/api/contacts", "POST", { email: payload.to, opt_in: true });
    await expect(
      enqueueEmail(
        env,
        { ...payload, kind: "marketing", provider: "cloudflare" },
        null,
      ),
    ).rejects.toThrow("Cloudflare cannot send marketing");
  });
  it("snapshots only opted-in recipients and does not duplicate campaign jobs", async () => {
    await configured();
    await call("/api/contacts", "POST", {
      email: payload.to,
      name: "Alex",
      opt_in: true,
    });
    await call("/api/contacts", "POST", { email: "pending@example.com" });
    const campaignId = await campaign();
    expect(
      (
        await call(`/api/campaigns/${campaignId}/send`, "POST", {
          confirm: true,
        })
      ).status,
    ).toBe(202);
    const { processCampaigns } = await import("../worker/marketing");
    await Promise.all([processCampaigns(env), processCampaigns(env)]);
    expect(
      (
        await env.DB.prepare(
          "SELECT count(*) n FROM campaign_recipients",
        ).first<any>()
      ).n,
    ).toBe(1);
    expect(
      (await env.DB.prepare("SELECT count(*) n FROM emails").first<any>()).n,
    ).toBe(1);
  });
  it("appends one-click unsubscribe and optional tracking before Resend delivery", async () => {
    await configured();
    await call("/api/contacts", "POST", { email: payload.to, opt_in: true });
    const campaignId = await campaign();
    await call(`/api/campaigns/${campaignId}/send`, "POST", { confirm: true });
    await dispatch(env);
    const row = await env.DB.prepare(
      "SELECT * FROM emails LIMIT 1",
    ).first<any>();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "resend-receipt" }), { status: 200 }),
      );
    try {
      await deliver(env, row.id);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.resend.com/emails");
      const sent = JSON.parse(String(options?.body));
      expect(sent.headers["List-Unsubscribe-Post"]).toBe(
        "List-Unsubscribe=One-Click",
      );
      expect(sent.html).toContain("123 Test Street");
      expect(sent.html).toContain("/u/");
      expect(sent.html).toContain("/t/o/");
      expect(sent.html).toContain("/t/c/");
      expect(options?.headers).toMatchObject({ "Idempotency-Key": row.id });
    } finally {
      fetchMock.mockRestore();
    }
  });
  it("routes a marketing message through SendGrid with a correlation ID", async () => {
    await configured("sendgrid");
    await call("/api/contacts", "POST", { email: payload.to, opt_in: true });
    const r = await enqueueEmail(env, { ...payload, kind: "marketing" }, null);
    await dispatch(env);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, {
        status: 202,
        headers: { "x-message-id": "sendgrid-receipt" },
      }),
    );
    try {
      await deliver(env, r.id);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.sendgrid.com/v3/mail/send");
      expect(
        JSON.parse(String(options?.body)).personalizations[0].custom_args
          .genesend_id,
      ).toBe(r.id);
      expect(
        (
          await env.DB.prepare("SELECT status FROM emails WHERE id=?")
            .bind(r.id)
            .first<any>()
        ).status,
      ).toBe("accepted");
    } finally {
      fetchMock.mockRestore();
    }
  });
  it("rechecks consent and pauses queued campaign mail before provider calls", async () => {
    await configured();
    await call("/api/contacts", "POST", { email: payload.to, opt_in: true });
    const cp = await campaign();
    await call(`/api/campaigns/${cp}/send`, "POST", { confirm: true });
    await dispatch(env);
    const row = await env.DB.prepare(
      "SELECT * FROM emails LIMIT 1",
    ).first<any>();
    await call(`/api/campaigns/${cp}/pause`, "POST", {});
    await deliver(env, row.id);
    expect(
      (
        await env.DB.prepare("SELECT status FROM emails WHERE id=?")
          .bind(row.id)
          .first<any>()
      ).status,
    ).toBe("queued");
    expect(send).not.toHaveBeenCalled();
    await call(`/api/campaigns/${cp}/cancel`, "POST", {});
    expect(
      (
        await env.DB.prepare("SELECT status FROM emails WHERE id=?")
          .bind(row.id)
          .first<any>()
      ).status,
    ).toBe("cancelled");
  });
  it("accepts signed Resend delivery events, deduplicates them, and rejects tampering", async () => {
    await configured();
    await call("/api/contacts", "POST", { email: payload.to, opt_in: true });
    const email = await enqueueEmail(
      env,
      { ...payload, kind: "marketing" },
      null,
    );
    await env.DB.prepare(
      "UPDATE emails SET status='accepted',provider_id='resend-event-id' WHERE id=?",
    )
      .bind(email.id)
      .run();
    const { Webhook } = await import("svix");
    const date = new Date(),
      event = {
        type: "email.delivered",
        data: { email_id: "resend-event-id" },
      },
      raw = JSON.stringify(event),
      wh = new Webhook("whsec_dGVzdC1zaWduaW5nLXNlY3JldC1rZXktMTIzNDU2Nzg=");
    const headers = {
      "svix-id": "event-1",
      "svix-timestamp": String(Math.floor(date.getTime() / 1000)),
      "svix-signature": wh.sign("event-1", date, raw),
    };
    expect(
      (await call("/webhooks/resend", "POST", event, "", headers)).status,
    ).toBe(200);
    expect(
      (await call("/webhooks/resend", "POST", event, "", headers)).status,
    ).toBe(200);
    expect(
      (
        await env.DB.prepare("SELECT status FROM emails WHERE id=?")
          .bind(email.id)
          .first<any>()
      ).status,
    ).toBe("delivered");
    expect(
      (
        await call(
          "/webhooks/resend",
          "POST",
          { ...event, type: "email.bounced" },
          "",
          headers,
        )
      ).status,
    ).toBe(400);
  });
  it("verifies SendGrid ECDSA signatures before accepting delivery events", async () => {
    await configured("sendgrid");
    const { generateKeyPairSync, createSign } = await import("node:crypto");
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    const { getMarketing, saveMarketing } = await import("../worker/provider");
    const settings = await getMarketing(env);
    settings.sendgrid_webhook_public_key = publicKey
      .export({ format: "der", type: "spki" })
      .toString("base64");
    await saveMarketing(env, settings);
    await call("/api/contacts", "POST", { email: payload.to, opt_in: true });
    const email = await enqueueEmail(
      env,
      { ...payload, kind: "marketing" },
      null,
    );
    await env.DB.prepare("UPDATE emails SET status='accepted' WHERE id=?")
      .bind(email.id)
      .run();
    const event = [
        {
          event: "delivered",
          sg_event_id: "unique-sg-event",
          genesend_id: email.id,
          email: payload.to,
        },
      ],
      raw = JSON.stringify(event),
      timestamp = String(Math.floor(Date.now() / 1000)),
      signature = createSign("SHA256")
        .update(timestamp + raw)
        .sign(privateKey, "base64");
    const headers = {
      "X-Twilio-Email-Event-Webhook-Timestamp": timestamp,
      "X-Twilio-Email-Event-Webhook-Signature": signature,
    };
    expect(
      (await call("/webhooks/sendgrid", "POST", event, "", headers)).status,
    ).toBe(200);
    expect(
      (
        await env.DB.prepare("SELECT status FROM emails WHERE id=?")
          .bind(email.id)
          .first<any>()
      ).status,
    ).toBe("delivered");
    expect(
      (
        await call("/webhooks/sendgrid", "POST", event, "", {
          ...headers,
          "X-Twilio-Email-Event-Webhook-Signature": "bad",
        })
      ).status,
    ).toBe(400);
  });
});
