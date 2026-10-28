PRAGMA foreign_keys = ON;
CREATE TABLE contacts (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','subscribed','unsubscribed','suppressed')),
  tags TEXT NOT NULL DEFAULT '[]', properties TEXT NOT NULL DEFAULT '{}', consent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE templates (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, subject TEXT NOT NULL, html TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'transactional', updated_at TEXT NOT NULL
);
CREATE TABLE campaigns (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, subject TEXT NOT NULL, from_email TEXT NOT NULL,
  html TEXT NOT NULL, audience_tag TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft', scheduled_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE emails (
  id TEXT PRIMARY KEY, to_email TEXT NOT NULL, from_email TEXT NOT NULL, subject TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('transactional','marketing')), status TEXT NOT NULL DEFAULT 'queued',
  content_key TEXT NOT NULL, campaign_id TEXT REFERENCES campaigns(id),
  idempotency_key TEXT UNIQUE, request_hash TEXT, provider_id TEXT, error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0, available_at TEXT NOT NULL, claimed_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX emails_dispatch ON emails(status,available_at);
CREATE INDEX emails_campaign ON emails(campaign_id);
CREATE TABLE email_events (
  id TEXT PRIMARY KEY, email_id TEXT NOT NULL REFERENCES emails(id), type TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE INDEX events_email ON email_events(email_id,created_at);
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, prefix TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL CHECK(scope IN ('send','read','contacts')), created_at TEXT NOT NULL, last_used_at TEXT, revoked_at TEXT
);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, expires_at TEXT NOT NULL);
CREATE TABLE login_attempts (ip_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX login_attempts_lookup ON login_attempts(ip_hash,created_at);
CREATE TABLE domains (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, status TEXT NOT NULL DEFAULT 'pending', verification_token TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE automations (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, event_name TEXT NOT NULL, template_id TEXT NOT NULL REFERENCES templates(id),
  from_email TEXT NOT NULL, delay_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL
);
CREATE TABLE automation_runs (
  id TEXT PRIMARY KEY, automation_id TEXT NOT NULL REFERENCES automations(id), event_id TEXT NOT NULL,
  email_id TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(automation_id,event_id)
);
CREATE TABLE event_receipts (id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE api_rate_windows (key_id TEXT NOT NULL, window INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(key_id,window));
CREATE TABLE inbound (
  id TEXT PRIMARY KEY, from_email TEXT NOT NULL, to_email TEXT NOT NULL, subject TEXT NOT NULL,
  content_key TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE suppressions (email TEXT PRIMARY KEY COLLATE NOCASE, reason TEXT NOT NULL, created_at TEXT NOT NULL);
