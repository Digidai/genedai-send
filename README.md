# GeneSend

**A good home for your emails.** An open-source email workspace built on Cloudflare, inspired by the shared developer-and-marketer workflow of AutoSend.

[Live workspace](https://send.genedai.me) · [中文产品研究](docs/research/autosend-analysis.zh-CN.md) · [Provider setup / 通道配置](docs/providers.zh-CN.md) · [Architecture](docs/architecture.md) · [Release verification](docs/verification.md)

![GeneSend workspace preview — fictional sample data](docs/screenshots/desktop.jpg)

## What works

- Owner-authenticated workspace with a separate, clearly labelled public sample.
- Contacts, tags, CSV imports, explicit consent, opt-outs and suppressions.
- HTML templates, sandboxed live previews and escaped personalization variables.
- **Cloudflare, Resend and SendGrid** adapters for transactional email.
- Marketing campaigns via Resend or SendGrid: audience snapshots, review, scheduling, rate limits, pause and cancel.
- Signed unsubscribe links, one-click unsubscribe headers, address footer and optional open/click signals.
- Event-triggered transactional automation with durable delays and event deduplication.
- Scoped API keys, message history and signed provider delivery webhooks.
- Cloudflare Email Routing handler with private inbound text/HTML storage and attachment metadata.

Cloudflare native Email Service is transactional-only. Marketing always uses an optional external adapter. All application compute, data, content, queues and scheduling stay on Cloudflare; the selected external provider receives the messages it delivers.

This is a single-owner v0.1 product, not a hosted multi-tenant ESP. Multi-user billing, visual branching, dynamic segment rules, domain warmup, a custom SMTP server, outbound customer webhooks and full attachment download are not included. Public preview data is fictional. No delivery-performance claim is made.

## Architecture

```text
React + API → Worker → D1 outbox → Queues → Cloudflare / Resend / SendGrid
                       ↕             ↑
                   private R2    Cron dispatch
                                     ↑
                          signed delivery callbacks
```

Workers Static Assets serves the app and self-hosted fonts. D1 stores contacts, sessions, campaign snapshots and the outbox. R2 stores private content. Queue consumers atomically claim messages; Cron repairs publication gaps. Ambiguous provider responses become `uncertain` rather than being blindly resent. See the [ADRs](docs/architecture.md).

## Self-host

Prerequisites: Node 22.12+ (or a compatible newer Node), a Cloudflare account with Workers, D1, R2 and Queues enabled, and a domain. Native arbitrary-recipient email requires eligible Cloudflare Email Service access. Resend and SendGrid keys are optional and can be added later.

```bash
git clone https://github.com/Digidai/genedai-send.git
cd genedai-send
npm ci
npx wrangler login
npx wrangler whoami
```

1. Edit `wrangler.jsonc`: replace `account_id`, custom domain, APP_URL and SENDING_DOMAINS with your own. Set SEND_ENABLED to `"false"` until a native sending domain is ready. For a local-only start, remove routes.
2. Create resources and replace the database ID in the configuration:

```bash
npx wrangler d1 create genesend
npx wrangler r2 bucket create genesend-content
npx wrangler queues create genesend-delivery
npx wrangler queues create genesend-delivery-dlq
npm run db:local
node scripts/create-owner.mjs
```

3. Develop locally in two terminals:

```bash
npm run dev:api   # port 8793; local bindings, no real email delivery
npm run dev       # http://127.0.0.1:5173
```

The local simulator does not send real email unless you deliberately enable remote bindings. The script writes an ignored private owner key file and `.dev.vars`; it does not print the key or overwrite existing credentials.

4. Run checks and deploy:

```bash
npm run check
npm run db:remote
npm run build
npx wrangler secret put ADMIN_KEY_HASH
npx wrangler secret put SESSION_SECRET
npx wrangler deploy
```

Use the hash and secret generated in `secrets/deployment.json` for the two prompts; never commit that file. The deployment creates no Resend/SendGrid account and purchases no third-party plan.

5. Open the deployed app, click **Open workspace**, and enter the key from `secrets/workspace-access.md`. Configure Resend/SendGrid and verify domains in Settings when ready. Complete [the provider guide](docs/providers.zh-CN.md), including signed delivery webhooks and an organization/address footer before marketing sends.
6. Inbound mail is optional. Add a dedicated Email Routing address rule targeting the `genesend` Worker. Preserve existing MX records and routes.

The checked-in configuration describes the live reference installation. Resource names may need changing if they already exist in your account. The public app shows invented examples until the owner signs in; its dashboard never queries private data for unauthenticated visitors.

## API

Create a scoped key in the private workspace. Keep it server-side.

```bash
curl https://send.genedai.me/v1/emails \
  -H "Authorization: Bearer $GENESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: welcome-user-123" \
  -d '{
    "from": "hello@your-domain.com",
    "to": "friend@example.com",
    "subject": "Good things start here",
    "html": "<h1>Hello, world.</h1>",
    "kind": "transactional",
    "provider": "cloudflare"
  }'
```

202 returns `{ "data": { "id": "em_...", "status": "queued" } }`. It is not a delivery confirmation. The same idempotency key and payload returns the original message; changed payload returns 409. API limits are 120 requests per key per fixed minute.

| Endpoint              | Scope    | Purpose                                                          |
| --------------------- | -------- | ---------------------------------------------------------------- |
| `POST /v1/emails`     | send     | Create transactional or marketing mail; html/text or template_id |
| `POST /v1/mails/send` | send     | Alias for the send endpoint                                      |
| `GET /v1/emails/:id`  | read     | Message state and provider receipt                               |
| `POST /v1/contacts`   | contacts | Upsert; opt-outs are never overwritten                           |
| `POST /v1/events`     | send     | Trigger matching active transactional workflows                  |

Optional send fields: `template_id`, `variables`, `scheduled_at` (ISO, within 30 days), `kind`, `provider`. Marketing requires a subscribed contact and a configured external channel, with unsubscribe/footer added automatically. Template examples use `{{name}}`; values are escaped.

Event example:

```json
{
  "event_id": "signup-123",
  "event": "user.created",
  "email": "friend@example.com",
  "properties": { "name": "Alex" }
}
```

The in-app documentation describes status semantics and authentication. Provider callbacks live at `/webhooks/resend` and `/webhooks/sendgrid`; neither accepts unsigned updates.

## Security and operational boundaries

Owner keys and scoped API keys are hashed. ESP secrets are AES-GCM encrypted under a key derived from a Worker secret. Protect and back up SESSION_SECRET: changing it requires coordinated credential/signature migration. A runtime administrator can decrypt stored keys.

Untrusted email previews block scripts and external resources. Imports preserve consent. Queue delivery is at least once; atomic claims and provider idempotency where available reduce duplicates, but exactly-once email delivery is not promised. Observe failures and the dead letter queue. Content retention is operator-managed in v0.1.

## Development

```bash
npm test         # real local D1/R2 + mocked ESPs, including signature validation
npm run build    # TypeScript + production assets
npm run check
```

CI runs tests, build and dependency checks. Real provider credentials and actual inbox receipt are separate acceptance steps. Current release evidence is recorded in [verification.md](docs/verification.md).

## License

MIT. GeneSend is an independent implementation and is not affiliated with AutoSend, Cloudflare, Resend or Twilio SendGrid. Each provider’s terms and charges apply to its service.
