# GeneSend v0.1 delivery plan

User request: research AutoSend, build an open-source alternative whose application architecture runs on Cloudflare, publish to GitHub and deploy to send.genedai.me. Subsequent decision: support Cloudflare, Resend and SendGrid; credentials and service configuration will be added later, with documentation prepared now.

The recommended implementation is a modular full-stack Worker with React Static Assets, D1, R2, Queues and Cron. Alternatives considered were a conventional Node/Postgres service and a distributed set of Workers; the chosen design reduces operation count and satisfies the platform constraint. External ESPs provide optional delivery; the native Cloudflare route remains transactional-only.

Acceptance: working private workspace, isolated public sample, contacts/consent/import, templates, event-triggered email, multi-provider adapters, campaign scheduling/control/unsubscribe, signed provider callbacks, source and documentation published under MIT, configured custom domain responding over HTTPS, meaningful integration tests, explicit evidence boundaries.

Verification sequence: local state-machine and privacy tests → provider mock/signature tests → production build and dependency audit → browser desktop/mobile check → deploy and private API smoke checks → public GitHub repository and final deployment verification. No real subscriber campaigns are sent during implementation. Credentials never enter the repository.
