import {
  escapeHtml,
  hash,
  id,
  now,
  normalizeEmail,
  personalize,
  required,
  sendingAllowed,
  sign,
} from "./lib";
import type { EmailRow, EmailResult, Env } from "./types";
import {
  getMarketing,
  providerKey,
  providerDomains,
  type ExternalProvider,
} from "./provider";
import { processCampaigns, sendMarketing } from "./marketing";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function addEvent(
  env: Env,
  emailId: string,
  type: string,
  detail: Record<string, unknown> = {},
) {
  await env.DB.prepare(
    "INSERT INTO email_events(id,email_id,type,detail,created_at) VALUES(?,?,?,?,?)",
  )
    .bind(id("ev"), emailId, type, JSON.stringify(detail), now())
    .run();
}
export async function enqueueEmail(
  env: Env,
  body: Record<string, unknown>,
  dedupe: string | null,
): Promise<{ id: string; status: string; duplicate?: boolean }> {
  const to = normalizeEmail(body.to),
    from = normalizeEmail(body.from),
    subject = required(body.subject, "Subject", 998);
  const kind = body.kind === "marketing" ? "marketing" : "transactional";
  const settings = await getMarketing(env);
  const provider =
    body.provider ??
    (kind === "marketing"
      ? settings.provider
      : settings.transactional_provider);
  if (
    !["cloudflare", "resend", "sendgrid"].includes(String(provider)) ||
    (kind === "marketing" && provider === "cloudflare")
  )
    throw new ApiError(
      422,
      "Choose a supported email provider. Cloudflare cannot send marketing email.",
    );
  if (kind === "marketing") {
    if (
      !providerKey(settings, provider as ExternalProvider) ||
      !settings.postal_address ||
      !settings.sender_name
    )
      throw new ApiError(
        409,
        "Configure the marketing provider and sender details in Settings first.",
      );
    const contact = await env.DB.prepare(
      "SELECT id FROM contacts WHERE email=? AND status='subscribed'",
    )
      .bind(to)
      .first();
    if (!contact)
      throw new ApiError(
        422,
        "Marketing recipients must be subscribed contacts.",
      );
  }
  if (provider === "cloudflare") {
    if (env.SEND_ENABLED !== "true")
      throw new ApiError(
        409,
        "Email delivery is disabled. The operator must enable a verified sending domain first.",
      );
    if (!sendingAllowed(from.split("@")[1], env.SENDING_DOMAINS))
      throw new ApiError(
        422,
        "This sender domain has not been onboarded to Cloudflare Email Service.",
      );
  } else {
    if (
      !providerKey(settings, provider as ExternalProvider) ||
      !providerDomains(settings, provider as ExternalProvider).includes(
        from.split("@")[1],
      )
    )
      throw new ApiError(
        422,
        "Configure this provider and verify the sender domain in Settings first.",
      );
  }
  if (/[\r\n]/.test(subject))
    throw new ApiError(422, "Subject must not contain line breaks.");
  if (typeof body.html !== "string" && typeof body.text !== "string")
    throw new ApiError(422, "Provide html or text content.");
  const text = typeof body.text === "string" ? body.text : "",
    html =
      typeof body.html === "string"
        ? body.html
        : kind === "marketing" && text
          ? `<pre>${escapeHtml(text)}</pre>`
          : "";
  if (html.length + text.length > 100000)
    throw new ApiError(413, "Email content must be under 100 KB.");
  if (!html.trim() && !text.trim())
    throw new ApiError(422, "Email content cannot be empty.");
  const scheduled = body.scheduled_at
    ? new Date(String(body.scheduled_at))
    : new Date();
  if (
    !Number.isFinite(scheduled.getTime()) ||
    scheduled.getTime() > Date.now() + 30 * 86400000
  )
    throw new ApiError(422, "Schedule must be within 30 days.");
  const payloadHash = await hash(
    JSON.stringify({
      to,
      from,
      subject,
      html,
      text,
      kind,
      provider,
      scheduled_at: body.scheduled_at ?? null,
    }),
  );
  if (dedupe) {
    const existing = await env.DB.prepare(
      "SELECT id,status,request_hash FROM emails WHERE idempotency_key=?",
    )
      .bind(dedupe)
      .first<{ id: string; status: string; request_hash: string }>();
    if (existing) {
      if (existing.request_hash !== payloadHash)
        throw new ApiError(
          409,
          "Idempotency key was already used with a different payload.",
        );
      return { ...existing, duplicate: true };
    }
  }
  const suppression = await env.DB.prepare(
    "SELECT reason FROM suppressions WHERE email=?",
  )
    .bind(to)
    .first();
  if (suppression) throw new ApiError(422, "This recipient is suppressed.");
  const emailId = id("em"),
    contentKey = `outbound/${emailId}.json`,
    timestamp = now();
  await env.CONTENT.put(contentKey, JSON.stringify({ html, text }), {
    httpMetadata: { contentType: "application/json" },
  });
  try {
    await env.DB.prepare(
      "INSERT INTO emails(id,to_email,from_email,subject,kind,status,content_key,idempotency_key,request_hash,available_at,created_at,updated_at,campaign_id,provider) VALUES(?,?,?,?,?,'queued',?,?,?,?,?,?,?,?)",
    )
      .bind(
        emailId,
        to,
        from,
        subject,
        kind,
        contentKey,
        dedupe,
        payloadHash,
        scheduled.toISOString(),
        timestamp,
        timestamp,
        typeof body.campaign_id === "string" ? body.campaign_id : null,
        String(provider),
      )
      .run();
  } catch (error) {
    await env.CONTENT.delete(contentKey);
    if (dedupe) {
      const existing = await env.DB.prepare(
        "SELECT id,status,request_hash FROM emails WHERE idempotency_key=?",
      )
        .bind(dedupe)
        .first<{ id: string; status: string; request_hash: string }>();
      if (existing) {
        if (existing.request_hash !== payloadHash)
          throw new ApiError(409, "Idempotency key payload conflict.");
        return { id: existing.id, status: existing.status, duplicate: true };
      }
    }
    throw error;
  }
  await addEvent(env, emailId, "email.queued");
  return { id: emailId, status: "queued" };
}
export async function dispatch(env: Env) {
  await processCampaigns(env);
  const stale = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  // A provider call may have succeeded before a crash. Do not automatically resend it.
  await env.DB.prepare(
    "UPDATE emails SET status='uncertain',error='Processing lease expired. Check provider logs before retrying.',updated_at=? WHERE status='processing' AND claimed_at<?",
  )
    .bind(now(), stale)
    .run();
  await env.DB.prepare(
    "UPDATE emails SET status='queued' WHERE status='enqueued' AND claimed_at<?",
  )
    .bind(stale)
    .run();
  const { results } = await env.DB.prepare(
    "SELECT id FROM emails WHERE status='queued' AND available_at<=? ORDER BY available_at LIMIT 50",
  )
    .bind(now())
    .all<{ id: string }>();
  for (const row of results) {
    const claim = await env.DB.prepare(
      "UPDATE emails SET status='enqueued',claimed_at=?,updated_at=? WHERE id=? AND status='queued' RETURNING id",
    )
      .bind(now(), now(), row.id)
      .first();
    if (!claim) continue;
    try {
      await env.SEND_QUEUE.send({ id: row.id });
    } catch {
      await env.DB.prepare(
        "UPDATE emails SET status='queued' WHERE id=? AND status='enqueued'",
      )
        .bind(row.id)
        .run();
    }
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at<?").bind(now()),
    env.DB.prepare("DELETE FROM login_attempts WHERE created_at<?").bind(
      new Date(Date.now() - 86400000).toISOString(),
    ),
    env.DB.prepare("DELETE FROM api_rate_windows WHERE window<?").bind(
      Math.floor(Date.now() / 60000) - 60,
    ),
  ]);
}
export async function deliver(env: Env, emailId: string) {
  const row = await env.DB.prepare(
    "UPDATE emails SET status='processing',claimed_at=?,updated_at=?,attempts=attempts+1 WHERE id=? AND status='enqueued' RETURNING *",
  )
    .bind(now(), now(), emailId)
    .first<EmailRow>();
  if (!row) return;
  const fail = async (status: string, error: string) => {
    await env.DB.prepare(
      "UPDATE emails SET status=?,error=?,updated_at=? WHERE id=?",
    )
      .bind(status, error, now(), emailId)
      .run();
    await addEvent(env, emailId, `email.${status}`, { error });
  };
  if (
    row.provider === "cloudflare" &&
    (row.kind === "marketing" ||
      env.SEND_ENABLED !== "true" ||
      !sendingAllowed(row.from_email.split("@")[1], env.SENDING_DOMAINS))
  ) {
    await fail(
      "failed",
      "Native sender is no longer enabled or the message is marketing.",
    );
    return;
  }
  if (row.kind === "marketing") {
    const consent = await env.DB.prepare(
      "SELECT id FROM contacts WHERE email=? AND status='subscribed'",
    )
      .bind(row.to_email)
      .first();
    if (!consent) {
      await fail("suppressed", "Recipient is no longer subscribed.");
      return;
    }
    if (row.campaign_id) {
      const campaign = await env.DB.prepare(
        "SELECT status FROM campaigns WHERE id=?",
      )
        .bind(row.campaign_id)
        .first<{ status: string }>();
      if (campaign?.status === "paused") {
        await env.DB.prepare(
          "UPDATE emails SET status='queued',available_at=? WHERE id=?",
        )
          .bind(new Date(Date.now() + 60000).toISOString(), row.id)
          .run();
        return;
      }
      if (!campaign || campaign.status === "cancelled") {
        await fail("cancelled", "Campaign was cancelled.");
        return;
      }
    }
  }
  if (row.campaign_id) {
    const campaign = await env.DB.prepare(
      "SELECT rate_per_minute FROM campaigns WHERE id=?",
    )
      .bind(row.campaign_id)
      .first<{ rate_per_minute: number }>();
    const window = Math.floor(Date.now() / 60000);
    const rate = await env.DB.prepare(
      "INSERT INTO api_rate_windows(key_id,window,count) VALUES(?,?,1) ON CONFLICT(key_id,window) DO UPDATE SET count=count+1 RETURNING count",
    )
      .bind(`campaign:${row.campaign_id}`, window)
      .first<{ count: number }>();
    if (campaign && (rate?.count ?? 0) > campaign.rate_per_minute) {
      await env.DB.prepare(
        "UPDATE emails SET status='queued',available_at=? WHERE id=?",
      )
        .bind(new Date((window + 1) * 60000).toISOString(), row.id)
        .run();
      return;
    }
  }
  if (
    await env.DB.prepare("SELECT email FROM suppressions WHERE email=?")
      .bind(row.to_email)
      .first()
  ) {
    await fail("suppressed", "Recipient is suppressed.");
    return;
  }
  const blob = await env.CONTENT.get(row.content_key);
  if (!blob) {
    await fail("failed", "Message content is missing.");
    return;
  }
  const content = await blob.json<{ html: string; text: string }>();
  try {
    const result: EmailResult =
      row.provider !== "cloudflare"
        ? await sendMarketing(env, row, content.html, content.text)
        : await env.EMAIL.send({
            from: row.from_email,
            to: row.to_email,
            subject: row.subject,
            ...(content.html ? { html: content.html } : {}),
            ...(content.text ? { text: content.text } : {}),
          });
    const providerId = result.messageId ?? result.message_id ?? null;
    const bounced = (
      result.permanentBounces ??
      result.permanent_bounces ??
      []
    ).includes(row.to_email);
    const suppressed = (
      result.suppressedRecipients ??
      result.suppressed_recipients ??
      []
    ).includes(row.to_email);
    const delivered = result.delivered?.includes(row.to_email);
    const status = bounced
      ? "failed"
      : suppressed
        ? "suppressed"
        : delivered
          ? "delivered"
          : "accepted";
    await env.DB.prepare(
      "UPDATE emails SET status=CASE WHEN status IN ('delivered','failed','suppressed') THEN status ELSE ? END,provider_id=?,error=?,updated_at=? WHERE id=?",
    )
      .bind(
        status,
        providerId,
        bounced
          ? "Permanent bounce"
          : suppressed
            ? "Provider suppression"
            : null,
        now(),
        row.id,
      )
      .run();
    if (bounced || suppressed)
      await env.DB.prepare(
        "INSERT OR IGNORE INTO suppressions(email,reason,created_at) VALUES(?,?,?)",
      )
        .bind(row.to_email, bounced ? "hard_bounce" : "provider", now())
        .run();
    await addEvent(env, row.id, `email.${status}`, { provider_id: providerId });
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    if (
      [
        "E_RATE_LIMIT_EXCEEDED",
        "E_DAILY_LIMIT_EXCEEDED",
        "E_INTERNAL_SERVER_ERROR",
      ].includes(code) &&
      row.attempts < 5
    ) {
      await env.DB.prepare(
        "UPDATE emails SET status='queued',error=?,available_at=?,updated_at=? WHERE id=?",
      )
        .bind(
          code,
          new Date(
            Date.now() + Math.min(3600, 60 * 2 ** row.attempts) * 1000,
          ).toISOString(),
          now(),
          row.id,
        )
        .run();
      return;
    }
    const known = code.startsWith("E_") && code !== "E_INTERNAL_SERVER_ERROR";
    await fail(
      known ? "failed" : "uncertain",
      code ||
        "Provider response unknown. Check Cloudflare logs before retrying.",
    );
  }
}
export async function runEvent(
  env: Env,
  body: Record<string, unknown>,
  principal: string,
) {
  const eventId = required(body.event_id, "A unique event_id", 120),
    eventName = required(body.event, "Event name", 100),
    email = normalizeEmail(body.email);
  const receiptId = `${principal}:${eventId}`,
    requestHash = await hash(
      JSON.stringify({
        event: eventName,
        email,
        properties: body.properties ?? {},
      }),
    );
  await env.DB.prepare(
    "INSERT OR IGNORE INTO event_receipts(id,request_hash,created_at) VALUES(?,?,?)",
  )
    .bind(receiptId, requestHash, now())
    .run();
  const receipt = await env.DB.prepare(
    "SELECT request_hash,created_at FROM event_receipts WHERE id=?",
  )
    .bind(receiptId)
    .first<{ request_hash: string; created_at: string }>();
  if (!receipt || receipt.request_hash !== requestHash)
    throw new ApiError(
      409,
      "This event_id was already used with a different payload.",
    );
  const contact = await env.DB.prepare("SELECT * FROM contacts WHERE email=?")
    .bind(email)
    .first<{ name: string; properties: string }>();
  const eventProperties =
    typeof body.properties === "object" && body.properties
      ? (body.properties as Record<string, unknown>)
      : {};
  const variables = {
    ...(contact ? JSON.parse(contact.properties) : {}),
    ...eventProperties,
    name: contact?.name || eventProperties.name || "",
    email,
  };
  const { results } = await env.DB.prepare(
    "SELECT a.*,t.html,t.subject FROM automations a JOIN templates t ON t.id=a.template_id WHERE a.status='active' AND a.event_name=?",
  )
    .bind(eventName)
    .all<{
      id: string;
      html: string;
      subject: string;
      from_email: string;
      delay_minutes: number;
    }>();
  const emails = [];
  for (const a of results) {
    const uniqueKey = `event:${principal}:${eventId}:${a.id}`;
    const existing = await env.DB.prepare(
      "SELECT id,status FROM emails WHERE idempotency_key=?",
    )
      .bind(uniqueKey)
      .first<{ id: string; status: string }>();
    if (existing) {
      emails.push({ ...existing, duplicate: true });
      continue;
    }
    const result = await enqueueEmail(
      env,
      {
        to: email,
        from: a.from_email,
        subject: personalize(a.subject, variables),
        html: personalize(a.html, variables),
        scheduled_at: new Date(
          new Date(receipt.created_at).getTime() + a.delay_minutes * 60000,
        ).toISOString(),
      },
      uniqueKey,
    );
    await env.DB.prepare(
      "INSERT OR IGNORE INTO automation_runs(id,automation_id,event_id,email_id,created_at) VALUES(?,?,?,?,?)",
    )
      .bind(id("run"), a.id, `${principal}:${eventId}`, result.id, now())
      .run();
    emails.push(result);
  }
  return { event_id: eventId, matched: results.length, emails };
}
export async function unsubscribePage(
  env: Env,
  emailId: string,
  signature: string,
  apply: boolean,
) {
  if (
    !env.SESSION_SECRET ||
    signature !== (await sign(env.SESSION_SECRET, `unsubscribe:${emailId}`))
  )
    throw new ApiError(404, "Invalid unsubscribe link.");
  const row = await env.DB.prepare("SELECT to_email FROM emails WHERE id=?")
    .bind(emailId)
    .first<{ to_email: string }>();
  if (!row) throw new ApiError(404, "Email not found.");
  if (apply) {
    await env.DB.prepare(
      "UPDATE contacts SET status='unsubscribed' WHERE email=? AND status!='suppressed'",
    )
      .bind(row.to_email)
      .run();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO email_events(id,email_id,type,created_at) VALUES(?,?,?,?)",
    )
      .bind(id("ev"), emailId, "email.unsubscribed", now())
      .run();
  }
  return `<!doctype html><html><meta name="viewport" content="width=device-width"><title>GeneSend preferences</title><body style="font-family:sans-serif;max-width:500px;margin:15vh auto;padding:24px;color:#19392d"><h1>${apply ? "You’re unsubscribed." : "Email preferences"}</h1><p>${apply ? "You will no longer receive marketing emails." : `Unsubscribe ${escapeHtml(row.to_email)} from marketing emails?`}</p>${apply ? "" : `<form method="post"><button style="padding:12px 20px;background:#157456;color:white;border:0;border-radius:8px">Unsubscribe</button></form>`}<p>GeneSend</p></body></html>`;
}
