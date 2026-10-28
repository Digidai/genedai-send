export interface EmailResult {
  messageId?: string;
  message_id?: string;
  delivered?: string[];
  queued?: string[];
  permanentBounces?: string[];
  permanent_bounces?: string[];
  suppressedRecipients?: string[];
  suppressed_recipients?: string[];
}
export interface Env {
  DEV_ORIGIN?: string;
  DB: D1Database;
  CONTENT: R2Bucket;
  SEND_QUEUE: Queue<{ id: string }>;
  ASSETS: Fetcher;
  EMAIL: {
    send(message: {
      from: string;
      to: string;
      subject: string;
      html?: string;
      text?: string;
      headers?: Record<string, string>;
    }): Promise<EmailResult>;
  };
  ADMIN_KEY_HASH: string;
  SESSION_SECRET: string;
  APP_URL: string;
  SENDING_DOMAINS: string;
  SEND_ENABLED: string;
}
export type Variables = {
  scope: "admin" | "send" | "read" | "contacts";
  principal: string;
};
export interface EmailRow {
  id: string;
  to_email: string;
  from_email: string;
  subject: string;
  kind: "transactional" | "marketing";
  status: string;
  content_key: string;
  attempts: number;
  campaign_id: string | null;
  provider: "cloudflare" | "resend" | "sendgrid";
  provider_id: string | null;
  error: string | null;
  created_at: string;
  available_at: string;
}
