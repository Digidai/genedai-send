CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
ALTER TABLE campaigns ADD COLUMN snapshot_at TEXT;
ALTER TABLE campaigns ADD COLUMN rate_per_minute INTEGER NOT NULL DEFAULT 60;
ALTER TABLE campaigns ADD COLUMN track_opens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN track_clicks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN build_after TEXT;
ALTER TABLE campaigns ADD COLUMN provider TEXT;
ALTER TABLE emails ADD COLUMN provider TEXT NOT NULL DEFAULT 'cloudflare';
CREATE TABLE campaign_recipients (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id), contact_id TEXT NOT NULL REFERENCES contacts(id),
  email_id TEXT REFERENCES emails(id), status TEXT NOT NULL DEFAULT 'pending', error TEXT,
  email TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', properties TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY(campaign_id,contact_id)
);
CREATE INDEX campaign_recipients_pending ON campaign_recipients(campaign_id,status);
CREATE TABLE tracking_links (id TEXT PRIMARY KEY, email_id TEXT NOT NULL REFERENCES emails(id), url TEXT NOT NULL);
CREATE TABLE provider_events (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX email_events_tracking ON email_events(email_id,type) WHERE type IN ('email.opened','email.clicked','email.unsubscribed');
