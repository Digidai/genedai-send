import type { EmailResult, Env } from "./types";

type Message = Parameters<Env["EMAIL"]["send"]>[0];

export async function sendCloudflare(
  env: Env,
  message: Message,
): Promise<EmailResult> {
  if (!env.CLOUDFLARE_EMAIL_API_TOKEN) return env.EMAIL.send(message);
  const account = env.CLOUDFLARE_EMAIL_ACCOUNT_ID;
  if (!account || !/^[a-f0-9]{32}$/.test(account)) {
    throw Object.assign(
      new Error("Cloudflare Email account ID is not configured."),
      { code: "E_CONFIGURATION" },
    );
  }
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/email/sending/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_EMAIL_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(15000),
    },
  );
  const body = await response.json<{
    success: boolean;
    result?: EmailResult;
    errors?: { code: number; message: string }[];
  }>();
  if (!response.ok || !body.success) {
    // Only an explicit rate-limit rejection is automatically retryable. A 5xx
    // response can be ambiguous and must not cause an automatic duplicate send.
    const code =
      response.status === 429
        ? "E_RATE_LIMIT_EXCEEDED"
        : response.status >= 500
          ? undefined
          : "E_CLOUDFLARE_REJECTED";
    throw Object.assign(
      new Error(
        `Cloudflare Email rejected the request (${body.errors?.[0]?.code ?? response.status}).`,
      ),
      { code },
    );
  }
  if (
    !body.result ||
    !(
      body.result.messageId ||
      body.result.message_id ||
      body.result.delivered?.length ||
      body.result.queued?.length ||
      body.result.permanent_bounces?.length ||
      body.result.suppressed_recipients?.length
    )
  ) {
    throw new Error("Cloudflare Email response has no delivery receipt.");
  }
  return body.result;
}
