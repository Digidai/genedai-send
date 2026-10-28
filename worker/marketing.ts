import type { Env, EmailRow } from "./types";
import { ApiError, addEvent, enqueueEmail } from "./mail";
import { escapeHtml, id, now, personalize, sign, constantEqual } from "./lib";
import {
  getMarketing,
  resendRequest,
  sendgridRequest,
  providerDomains,
  providerKey,
  type ExternalProvider,
} from "./provider";
import { Webhook } from "svix";
import { EventWebhook } from "@sendgrid/eventwebhook";
export interface CampaignRow {
  id: string;
  name: string;
  subject: string;
  from_email: string;
  html: string;
  audience_tag: string;
  status: string;
  scheduled_at: string | null;
  snapshot_at: string | null;
  rate_per_minute: number;
  track_opens: number;
  track_clicks: number;
  provider: ExternalProvider | null;
}
export async function campaignReady(env: Env, c: CampaignRow) {
  const s = await getMarketing(env),
    p = c.provider ?? s.provider;
  if (!providerKey(s, p) || !s.sender_name || !s.postal_address)
    throw new ApiError(
      409,
      "Configure the marketing provider, sender name, and postal address in Settings before sending.",
    );
  if (!providerDomains(s, p).includes(c.from_email.split("@")[1]))
    throw new ApiError(
      409,
      "Verify the sender domain with your provider, then refresh domain verification in Settings.",
    );
  return s;
}
export async function startCampaign(
  env: Env,
  campaignId: string,
  scheduledAt?: string,
) {
  const c = await env.DB.prepare("SELECT * FROM campaigns WHERE id=?")
    .bind(campaignId)
    .first<CampaignRow>();
  if (!c) throw new ApiError(404, "Campaign not found.");
  if (c.status !== "draft")
    throw new ApiError(409, "Only a draft can be launched.");
  const settings = await campaignReady(env, c);
  const at = scheduledAt ? new Date(scheduledAt) : new Date();
  if (
    !Number.isFinite(at.getTime()) ||
    at.getTime() < Date.now() - 60000 ||
    at.getTime() > Date.now() + 30 * 86400000
  )
    throw new ApiError(422, "Choose a time within the next 30 days.");
  const changed = await env.DB.prepare(
    "UPDATE campaigns SET status='scheduled',scheduled_at=?,provider=? WHERE id=? AND status='draft' RETURNING id",
  )
    .bind(at.toISOString(), settings.provider, campaignId)
    .first();
  if (!changed) throw new ApiError(409, "Campaign was already launched.");
  return {
    id: campaignId,
    status: "scheduled",
    scheduled_at: at.toISOString(),
  };
}
export async function processCampaigns(env: Env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM campaigns WHERE status IN ('scheduled','running') AND (scheduled_at IS NULL OR scheduled_at<=?) ORDER BY created_at LIMIT 10",
  )
    .bind(now())
    .all<CampaignRow>();
  for (const c of results) {
    const claim = await env.DB.prepare(
      "UPDATE campaigns SET build_after=? WHERE id=? AND status IN ('scheduled','running') AND (build_after IS NULL OR build_after<=?) RETURNING id",
    )
      .bind(new Date(Date.now() + 60000).toISOString(), c.id, now())
      .first();
    if (!claim) continue;
    try {
      await campaignReady(env, c);
    } catch {
      await env.DB.prepare(
        "UPDATE campaigns SET status='paused' WHERE id=? AND status IN ('running','scheduled')",
      )
        .bind(c.id)
        .run();
      continue;
    }
    if (!c.snapshot_at) {
      // Snapshot audience once. Consent is checked again immediately before each provider call.
      await env.DB.batch([
        env.DB.prepare(
          "INSERT OR IGNORE INTO campaign_recipients(campaign_id,contact_id,email,name,properties) SELECT ?,id,email,name,properties FROM contacts WHERE status='subscribed' AND (?='' OR EXISTS(SELECT 1 FROM json_each(contacts.tags) WHERE value=?)) AND NOT EXISTS(SELECT 1 FROM suppressions WHERE email=contacts.email)",
        ).bind(c.id, c.audience_tag, c.audience_tag),
        env.DB.prepare(
          "UPDATE campaigns SET snapshot_at=?,status='running' WHERE id=? AND status IN ('scheduled','running')",
        ).bind(now(), c.id),
      ]);
    }
    const { results: recipients } = await env.DB.prepare(
      "SELECT contact_id,email,name,properties FROM campaign_recipients WHERE campaign_id=? AND status='pending' LIMIT ?",
    )
      .bind(c.id, Math.min(100, c.rate_per_minute))
      .all<{
        contact_id: string;
        email: string;
        name: string;
        properties: string;
      }>();
    for (const r of recipients) {
      const active = await env.DB.prepare(
        "SELECT id FROM campaigns WHERE id=? AND status='running'",
      )
        .bind(c.id)
        .first();
      if (!active) break;
      const variables = {
        ...JSON.parse(r.properties),
        name: r.name,
        email: r.email,
      };
      try {
        const result = await enqueueEmail(
          env,
          {
            to: r.email,
            from: c.from_email,
            subject: personalize(c.subject, variables),
            html: personalize(c.html, variables),
            kind: "marketing",
            campaign_id: c.id,
            provider: c.provider,
          },
          `campaign:${c.id}:${r.contact_id}`,
        );
        await env.DB.prepare(
          "UPDATE campaign_recipients SET status='queued',email_id=? WHERE campaign_id=? AND contact_id=?",
        )
          .bind(result.id, c.id, r.contact_id)
          .run();
      } catch (e) {
        if (e instanceof ApiError && e.status === 422)
          await env.DB.prepare(
            "UPDATE campaign_recipients SET status='skipped',error=? WHERE campaign_id=? AND contact_id=?",
          )
            .bind(e.message, c.id, r.contact_id)
            .run();
        else throw e;
      }
    }
    const pending = await env.DB.prepare(
      "SELECT count(*) n FROM campaign_recipients WHERE campaign_id=? AND status='pending'",
    )
      .bind(c.id)
      .first<{ n: number }>();
    const jobs = await env.DB.prepare(
      "SELECT count(*) n FROM emails WHERE campaign_id=? AND status IN ('queued','enqueued','processing')",
    )
      .bind(c.id)
      .first<{ n: number }>();
    if (!pending?.n && !jobs?.n)
      await env.DB.prepare(
        "UPDATE campaigns SET status='completed' WHERE id=? AND status='running'",
      )
        .bind(c.id)
        .run();
  }
}
export async function marketingContent(
  env: Env,
  row: EmailRow,
  html: string,
  trackOpens: boolean,
  trackClicks: boolean,
) {
  const s = await getMarketing(env),
    url = `${env.APP_URL}/u/${row.id}/${await sign(env.SESSION_SECRET, `unsubscribe:${row.id}`)}`;
  let result = html;
  if (trackClicks) {
    const matches = [
      ...html.matchAll(/href\s*=\s*["'](https?:\/\/[^"'\s<>]+)["']/gi),
    ];
    for (const match of matches) {
      try {
        const link = new URL(match[1].replaceAll("&amp;", "&"));
        if (!["http:", "https:"].includes(link.protocol)) continue;
        const linkId = id("lnk");
        await env.DB.prepare(
          "INSERT INTO tracking_links(id,email_id,url) VALUES(?,?,?)",
        )
          .bind(linkId, row.id, link.href)
          .run();
        const tracked = `${env.APP_URL}/t/c/${linkId}/${await sign(env.SESSION_SECRET, `click:${linkId}`)}`;
        result = result.replace(match[0], `href="${tracked}"`);
      } catch {}
    }
  }
  result += `<div style="font-family:sans-serif;font-size:11px;color:#888;line-height:1.7;text-align:center;padding:30px 15px;border-top:1px solid #eee;margin-top:30px">${escapeHtml(s.sender_name)}<br>${escapeHtml(s.postal_address)}<br><a href="${url}">Unsubscribe from marketing emails</a></div>`;
  if (trackOpens)
    result += `<img src="${env.APP_URL}/t/o/${row.id}/${await sign(env.SESSION_SECRET, `open:${row.id}`)}" width="1" height="1" alt="" style="display:block"/>`;
  return {
    html: result,
    headers: {
      "List-Unsubscribe": `<${url}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
export async function sendMarketing(
  env: Env,
  row: EmailRow,
  html: string,
  text = "",
) {
  const settings = await getMarketing(env),
    provider = row.provider as ExternalProvider;
  if (!providerKey(settings, provider))
    throw Object.assign(new Error("Email provider is not configured."), {
      code: "E_CONFIGURATION",
    });
  let content = await env.CONTENT.get(`prepared/${row.id}.json`);
  let prepared: {
    html: string;
    headers: Record<string, string>;
    sender_name: string;
  };
  if (content) prepared = await content.json();
  else {
    const c = row.campaign_id
      ? await env.DB.prepare(
          "SELECT track_opens,track_clicks FROM campaigns WHERE id=?",
        )
          .bind(row.campaign_id)
          .first<CampaignRow>()
      : null;
    prepared = {
      ...(row.kind === "marketing"
        ? await marketingContent(
            env,
            row,
            html,
            !!c?.track_opens,
            !!c?.track_clicks,
          )
        : { html, headers: {} }),
      sender_name: settings.sender_name,
    };
    await env.CONTENT.put(`prepared/${row.id}.json`, JSON.stringify(prepared));
  }
  if (provider === "sendgrid") {
    const r = await sendgridRequest(settings, "/mail/send", {
      method: "POST",
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: row.to_email }],
            custom_args: { genesend_id: row.id },
          },
        ],
        from: {
          email: row.from_email,
          name: prepared.sender_name || undefined,
        },
        subject: row.subject,
        content: [
          {
            type: prepared.html ? "text/html" : "text/plain",
            value: prepared.html || text,
          },
        ],
        headers: prepared.headers,
        tracking_settings: {
          click_tracking: { enable: false, enable_text: false },
          open_tracking: { enable: false },
          subscription_tracking: { enable: false },
        },
      }),
    });
    if (r.status !== 202)
      throw Object.assign(new Error("SendGrid rejected the message."), {
        code:
          r.status === 429
            ? "E_RATE_LIMIT_EXCEEDED"
            : r.status >= 500
              ? ""
              : "E_PROVIDER_REJECTED",
      });
    const receipt = r.headers.get("x-message-id");
    if (!receipt) throw new Error("SendGrid response has no receipt.");
    return { messageId: receipt };
  }
  const response = await resendRequest(settings, "/emails", {
    method: "POST",
    headers: { "Idempotency-Key": row.id },
    body: JSON.stringify({
      from: `${prepared.sender_name.replace(/[<>\r\n]/g, "")} <${row.from_email}>`,
      to: [row.to_email],
      subject: row.subject,
      ...(prepared.html ? { html: prepared.html } : { text }),
      headers: prepared.headers,
    }),
  });
  const result = await response.json<{
    id?: string;
    name?: string;
    message?: string;
  }>();
  if (!response.ok) {
    const code =
      response.status === 429 ||
      result.name === "concurrent_idempotent_requests"
        ? "E_RATE_LIMIT_EXCEEDED"
        : response.status >= 500
          ? ""
          : "E_PROVIDER_REJECTED";
    throw Object.assign(
      new Error(result.message ?? "Provider rejected the email."),
      { code },
    );
  }
  if (!result.id) throw new Error("No provider receipt.");
  return { messageId: result.id };
}
export async function handleResendWebhook(
  env: Env,
  raw: string,
  headers: Record<string, string>,
) {
  const settings = await getMarketing(env);
  if (!settings.webhook_secret)
    throw new ApiError(503, "Webhook signing secret is not configured.");
  let event: {
    type: string;
    data: { email_id: string; bounce?: { type?: string } };
  };
  try {
    new Webhook(settings.webhook_secret).verify(raw, headers);
    event = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "Invalid webhook signature.");
  }
  const receipt = headers["svix-id"];
  if (!receipt) throw new ApiError(400, "Missing webhook ID.");
  if (
    await env.DB.prepare("SELECT id FROM provider_events WHERE id=?")
      .bind(receipt)
      .first()
  )
    return { ok: true, duplicate: true };
  const row = await env.DB.prepare(
    "SELECT * FROM emails WHERE provider='resend' AND provider_id=?",
  )
    .bind(event.data.email_id)
    .first<EmailRow>();
  if (!row)
    throw new ApiError(
      503,
      "Message receipt is not available yet. Retry the webhook.",
    );
  const type = event.type;
  const mapped: Record<string, string> = {
    "email.delivered": "delivered",
    "email.bounced": "failed",
    "email.complained": "suppressed",
    "email.failed": "failed",
  };
  if (mapped[type])
    await env.DB.prepare(
      "UPDATE emails SET status=?,updated_at=? WHERE id=? AND status IN ('accepted','delivered','uncertain')",
    )
      .bind(mapped[type], now(), row.id)
      .run();
  if (
    ["email.complained", "email.bounced", "email.suppressed"].includes(type)
  ) {
    const permanent =
      type !== "email.bounced" || event.data.bounce?.type === "Permanent";
    if (permanent)
      await env.DB.batch([
        env.DB.prepare(
          "INSERT OR IGNORE INTO suppressions(email,reason,created_at) VALUES(?,?,?)",
        ).bind(
          row.to_email,
          type === "email.complained" ? "complaint" : "hard_bounce",
          now(),
        ),
        env.DB.prepare(
          "UPDATE contacts SET status='suppressed' WHERE email=?",
        ).bind(row.to_email),
      ]);
  }
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO email_events(id,email_id,type,detail,created_at) VALUES(?,?,?,?,?)",
    ).bind(`resend_${receipt}`, row.id, type, "{}", now()),
    env.DB.prepare(
      "INSERT OR IGNORE INTO provider_events(id,created_at) VALUES(?,?)",
    ).bind(receipt, now()),
  ]);
  return { ok: true };
}
export async function recordTracking(
  env: Env,
  type: "open" | "click",
  entityId: string,
  signature: string,
) {
  if (
    !constantEqual(
      signature,
      await sign(env.SESSION_SECRET, `${type}:${entityId}`),
    )
  )
    throw new ApiError(404, "Invalid tracking link.");
  const entity =
    type === "click"
      ? await env.DB.prepare(
          "SELECT email_id,url FROM tracking_links WHERE id=?",
        )
          .bind(entityId)
          .first<{ email_id: string; url: string }>()
      : { email_id: entityId, url: "" };
  if (!entity) throw new ApiError(404, "Link not found.");
  if (
    !(await env.DB.prepare(
      "SELECT id FROM emails WHERE id=? AND kind='marketing'",
    )
      .bind(entity.email_id)
      .first())
  )
    throw new ApiError(404, "Message not found.");
  await env.DB.prepare(
    "INSERT OR IGNORE INTO email_events(id,email_id,type,created_at) VALUES(?,?,?,?)",
  )
    .bind(
      id("ev"),
      entity.email_id,
      `email.${type === "open" ? "opened" : "clicked"}`,
      now(),
    )
    .run();
  return entity.url;
}
export async function handleSendgridWebhook(
  env: Env,
  raw: string,
  signature: string,
  timestamp: string,
) {
  const s = await getMarketing(env);
  if (!s.sendgrid_webhook_public_key)
    throw new ApiError(503, "SendGrid webhook public key is not configured.");
  if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300)
    throw new ApiError(400, "Webhook timestamp is expired.");
  try {
    const verifier = new EventWebhook(),
      key = verifier.convertPublicKeyToECDSA(s.sendgrid_webhook_public_key);
    if (!verifier.verifySignature(key, raw, signature, timestamp))
      throw new Error("Invalid");
  } catch {
    throw new ApiError(400, "Invalid SendGrid webhook signature.");
  }
  const events = JSON.parse(raw) as {
    event: string;
    sg_event_id: string;
    genesend_id?: string;
    email: string;
    type?: string;
  }[];
  if (!Array.isArray(events) || events.length > 1000)
    throw new ApiError(400, "Invalid webhook batch.");
  for (const e of events) {
    if (!e.sg_event_id || !e.genesend_id) continue;
    const receipt = `sendgrid_${e.sg_event_id}`;
    if (
      await env.DB.prepare("SELECT id FROM provider_events WHERE id=?")
        .bind(receipt)
        .first()
    )
      continue;
    const row = await env.DB.prepare(
      "SELECT * FROM emails WHERE id=? AND provider='sendgrid' AND to_email=?",
    )
      .bind(e.genesend_id, e.email.toLowerCase())
      .first<EmailRow>();
    if (!row) continue;
    const mapped: Record<string, string> = {
      delivered: "delivered",
      bounce: "failed",
      dropped: "failed",
      spamreport: "suppressed",
    };
    if (mapped[e.event])
      await env.DB.prepare(
        "UPDATE emails SET status=?,updated_at=? WHERE id=? AND status IN ('processing','accepted','delivered','uncertain')",
      )
        .bind(mapped[e.event], now(), row.id)
        .run();
    if (
      e.event === "spamreport" ||
      (e.event === "bounce" && e.type !== "blocked")
    )
      await env.DB.batch([
        env.DB.prepare(
          "INSERT OR IGNORE INTO suppressions(email,reason,created_at) VALUES(?,?,?)",
        ).bind(
          row.to_email,
          e.event === "spamreport" ? "complaint" : "hard_bounce",
          now(),
        ),
        env.DB.prepare(
          "UPDATE contacts SET status='suppressed' WHERE email=?",
        ).bind(row.to_email),
      ]);
    if (["unsubscribe", "group_unsubscribe"].includes(e.event))
      await env.DB.prepare(
        "UPDATE contacts SET status='unsubscribed' WHERE email=? AND status!='suppressed'",
      )
        .bind(row.to_email)
        .run();
    const types: Record<string, string> = {
      open: "opened",
      click: "clicked",
      unsubscribe: "unsubscribed",
      group_unsubscribe: "unsubscribed",
      spamreport: "complained",
    };
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO email_events(id,email_id,type,detail,created_at) VALUES(?,?,?,?,?)",
      ).bind(
        receipt,
        row.id,
        `email.${types[e.event] ?? e.event}`,
        "{}",
        now(),
      ),
      env.DB.prepare(
        "INSERT OR IGNORE INTO provider_events(id,created_at) VALUES(?,?)",
      ).bind(receipt, now()),
    ]);
  }
  return { ok: true };
}
