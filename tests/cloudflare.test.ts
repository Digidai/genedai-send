import { afterEach, describe, expect, it, vi } from "vitest";
import { sendCloudflare } from "../worker/cloudflare";
import type { Env } from "../worker/types";
const message = {
  from: "hello@genedai.me",
  to: "person@example.com",
  subject: "Hello",
  text: "Hello",
};
const account = "48d9ccaf5ee7914c803b5d0656462848";
afterEach(() => vi.restoreAllMocks());
describe("Cloudflare Email transport", () => {
  it("retains the native binding when no dedicated API token is configured", async () => {
    const send = vi.fn().mockResolvedValue({ messageId: "native-receipt" });
    const fetch = vi.spyOn(globalThis, "fetch");
    expect(
      await sendCloudflare({ EMAIL: { send } } as unknown as Env, message),
    ).toEqual({ messageId: "native-receipt" });
    expect(send).toHaveBeenCalledWith(message);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses the dedicated account token over REST and preserves actual delivery results", async () => {
    const send = vi.fn();
    const response = {
      message_id: "cf-receipt",
      delivered: [message.to],
      queued: [],
    };
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true, result: response })),
      );
    const result = await sendCloudflare(
      {
        EMAIL: { send },
        CLOUDFLARE_EMAIL_API_TOKEN: "test-only-token",
        CLOUDFLARE_EMAIL_ACCOUNT_ID: account,
      } as unknown as Env,
      message,
    );
    expect(result).toEqual(response);
    expect(send).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      `https://api.cloudflare.com/client/v4/accounts/${account}/email/sending/send`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(message),
        headers: expect.objectContaining({
          Authorization: "Bearer test-only-token",
        }),
      }),
    );
  });
  it("rejects a missing account ID before exposing a token to the network", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    await expect(
      sendCloudflare(
        { CLOUDFLARE_EMAIL_API_TOKEN: "test-token" } as Env,
        message,
      ),
    ).rejects.toMatchObject({ code: "E_CONFIGURATION" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("marks explicit permission rejections as permanent failures without exposing credentials", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ code: 10102, message: "Forbidden" }],
        }),
        { status: 403 },
      ),
    );
    await expect(
      sendCloudflare(
        {
          CLOUDFLARE_EMAIL_API_TOKEN: "test-token",
          CLOUDFLARE_EMAIL_ACCOUNT_ID: account,
        } as Env,
        message,
      ),
    ).rejects.toMatchObject({
      code: "E_CLOUDFLARE_REJECTED",
      message: "Cloudflare Email rejected the request (10102).",
    });
  });
  it("only classifies explicit 429 responses as automatically retryable", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ success: false, errors: [] }), {
          status: 429,
        }),
      );
    const env = {
      CLOUDFLARE_EMAIL_API_TOKEN: "test-token",
      CLOUDFLARE_EMAIL_ACCOUNT_ID: account,
    } as Env;
    await expect(sendCloudflare(env, message)).rejects.toMatchObject({
      code: "E_RATE_LIMIT_EXCEEDED",
    });
    fetch.mockResolvedValue(
      new Response(JSON.stringify({ success: false, errors: [] }), {
        status: 503,
      }),
    );
    await expect(sendCloudflare(env, message)).rejects.toMatchObject({
      code: undefined,
    });
  });
  it("does not invent acceptance if a successful response has no receipt", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, result: {} })),
    );
    await expect(
      sendCloudflare(
        {
          CLOUDFLARE_EMAIL_API_TOKEN: "test-token",
          CLOUDFLARE_EMAIL_ACCOUNT_ID: account,
        } as Env,
        message,
      ),
    ).rejects.toThrow("no delivery receipt");
  });
});
