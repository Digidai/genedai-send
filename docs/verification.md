# Release verification — 2026-10-28

Evidence recorded for GeneSend v0.1. This file distinguishes local tests, deployed behavior and untested external outcomes.

## Automated local checks

- 28 tests pass against actual Miniflare D1/R2 resources with mocked provider delivery.
- Covered: authentication/private-data isolation, cross-origin mutation rejection, login limiting, scoped/revoked hashed keys, CSV validation, consent preservation, campaign provider guard, concurrent idempotency, atomic queue claims, delayed dispatch, suppressions at delivery, explicit rate retry, uncertain outcomes, cancellation, signed unsubscribe and event deduplication.
- Marketing tests cover encrypted credential storage, audience snapshots, duplicate campaign planners, Resend footer/one-click/tracking, SendGrid correlation, pause/cancel, valid and tampered Svix/ECDSA callbacks.
- Email preview test checks removal of navigation/refresh and restrictive CSP.
- TypeScript and production Vite build pass. npm audit reports zero known vulnerabilities at the recorded dependency lockfile.

These are local/synthetic provider tests. No real ESP account or inbox is involved.

## Browser checks

- Desktop page loads in the in-app browser. Returning from Templates to Overview was tested after fixing stale page-context rendering; sample and owner contexts are bound separately.
- Owner login tested locally using a development-only credential.
- New opted-in contact saved through the browser and rendered from local D1.
- Private workspace starts with zero email activity, independently of the fictional sample dashboard.
- Three-channel configuration UI displays pending external providers with disabled domain verification until credentials are saved.
- 390 × 844 responsive viewport checked; document/body width is 390, with no document-level horizontal overflow. Dense tables scroll within their panels.
- Public production screenshot taken from https://send.genedai.me; it contains only labelled fictional examples.

## Deployment and live HTTP checks

Cloudflare reference installation (deployed Worker version `b9023a6e-895e-49cd-ba04-17c2585c590c`):

- Worker: genesend, with custom domain send.genedai.me.
- D1 database: genesend; migrations 0001_initial and 0002_marketing applied.
- Private R2 bucket: genesend-content.
- Queue: genesend-delivery, with genesend-delivery-dlq.
- Cron: every minute; native EMAIL binding present.
- Owner hash and signing/encryption secret are Worker secrets, not static assets or committed source.
- Existing genedai.me Email Sending configuration was inspected and enabled before the deployment; no MX records or inbound routing rules were changed.

20 production HTTP checks pass: health, session, public sample, unauthorized contact/provider reads, owner login, private overview/config/contacts/templates/campaigns/automations/keys/domains/providers/inbound reads, unconfigured webhook refusal, logout and post-logout refusal. The smoke script sends no emails and does not create contacts, keys or campaigns.

## Deliberately not claimed

Resend and SendGrid credentials, verified sending-domain configuration, webhook endpoint registration and billing eligibility are left for the owner, as requested. The code and documentation are prepared; no real send through those accounts has been tested. Native Cloudflare real-recipient sending was also not exercised during this task.

No real subscriber campaign was sent. Accepted is not proof of inbox placement. Tracking is not proof of human reading. Automated tests, production HTTP 200/202 and GitHub CI are not evidence of delivery performance, reputation or business outcomes.

Inbound handler code is present, but no production address routing rule was added. Full inbound acceptance needs a dedicated rule and a controlled message test.

GitHub CI runs the committed test/build/audit workflow; consult the repository’s current Actions run for its live state rather than treating this document as a permanent green status.
