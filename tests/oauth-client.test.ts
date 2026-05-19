import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OAuthClient } from "../src/oauth-client.js";
import {
  DEVICE_AUTH_RESPONSE,
  TOKEN_SUCCESS_RESPONSE,
  TOKEN_PENDING_RESPONSE,
  TOKEN_EXPIRED_RESPONSE,
  TOKEN_DENIED_RESPONSE,
  REFRESH_SUCCESS_RESPONSE,
} from "./fixtures/responses.js";

function mockFetch(responses: Array<{ ok: boolean; status: number; json: () => Promise<any> }>) {
  const mock = vi.fn();
  responses.forEach((resp, i) => {
    mock.mockResolvedValueOnce(resp);
  });
  return mock;
}

describe("OAuthClient", () => {
  let client: OAuthClient;

  beforeEach(() => {
    client = new OAuthClient("test-device-id");
  });

  describe("requestDeviceCode", () => {
    it("sends correct request and returns device auth", async () => {
      const fetchMock = mockFetch([
        { ok: true, status: 200, json: () => Promise.resolve(DEVICE_AUTH_RESPONSE) },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const result = await client.requestDeviceCode();
      expect(result.device_code).toBe("dc_abc123def456");
      expect(result.user_code).toBe("ABCD-1234");
      expect(result.verification_uri_complete).toContain("code=ABCD-1234");
      expect(result.interval).toBe(5);

      // Verify request
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain("/api/oauth/device_authorization");
      expect(init.method).toBe("POST");
      expect(init.headers["User-Agent"]).toBe("KimiCLI/1.44.0");
      expect(init.headers["X-Msh-Device-Id"]).toBe("test-device-id");
    });

    it("throws on non-OK response", async () => {
      const fetchMock = mockFetch([
        { ok: false, status: 500, json: () => Promise.resolve({ error: "server_error" }) },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      await expect(client.requestDeviceCode()).rejects.toThrow();
    });
  });

  describe("pollForToken", () => {
    it("returns token on immediate success", async () => {
      const fetchMock = mockFetch([
        { ok: true, status: 200, json: () => Promise.resolve(TOKEN_SUCCESS_RESPONSE) },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const result = await client.pollForToken("dc_abc123def456");
      expect(result.status).toBe("success");
      if (result.status === "success") {
        expect(result.token.access_token).toBe(TOKEN_SUCCESS_RESPONSE.access_token);
        expect(result.token.refresh_token).toBe(TOKEN_SUCCESS_RESPONSE.refresh_token);
        expect(result.token.expires_at).toBeGreaterThan(0);
      }
    });

    it("returns pending status when not yet authorized", async () => {
      const fetchMock = mockFetch([
        { ok: true, status: 200, json: () => Promise.resolve(TOKEN_PENDING_RESPONSE) },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const result = await client.pollForToken("dc_abc123def456");
      expect(result.status).toBe("pending");
    });

    it("returns expired status", async () => {
      const fetchMock = mockFetch([
        { ok: true, status: 200, json: () => Promise.resolve(TOKEN_EXPIRED_RESPONSE) },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const result = await client.pollForToken("dc_abc123def456");
      expect(result.status).toBe("expired");
    });

    it("returns denied status", async () => {
      const fetchMock = mockFetch([
        { ok: true, status: 200, json: () => Promise.resolve(TOKEN_DENIED_RESPONSE) },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const result = await client.pollForToken("dc_abc123def456");
      expect(result.status).toBe("denied");
    });
  });

  describe("refreshToken", () => {
    it("sends refresh request and returns new credentials", async () => {
      const fetchMock = mockFetch([
        { ok: true, status: 200, json: () => Promise.resolve(REFRESH_SUCCESS_RESPONSE) },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const result = await client.refreshToken("rt_old_token");
      expect(result.access_token).toBe(REFRESH_SUCCESS_RESPONSE.access_token);
      expect(result.refresh_token).toBe(REFRESH_SUCCESS_RESPONSE.refresh_token);
      expect(result.expires_at).toBeGreaterThan(0);

      // Verify request
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain("/api/oauth/token");
      expect(init.method).toBe("POST");
      const body = init.body as string;
      expect(body).toContain("grant_type=refresh_token");
      expect(body).toContain("refresh_token=rt_old_token");
    });

    it("throws on 401 response (token rejected)", async () => {
      const fetchMock = mockFetch([
        { ok: false, status: 401, json: () => Promise.resolve({ error: "invalid_grant" }) },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      await expect(client.refreshToken("bad_token")).rejects.toThrow("Token rejected");
    });

    it("retries on transient failures", async () => {
      const fetchMock = mockFetch([
        { ok: false, status: 500, json: () => Promise.resolve({ error: "server_error" }) },
        { ok: false, status: 502, json: () => Promise.resolve({ error: "bad_gateway" }) },
        { ok: true, status: 200, json: () => Promise.resolve(REFRESH_SUCCESS_RESPONSE) },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const result = await client.refreshToken("rt_old_token");
      expect(result.access_token).toBe(REFRESH_SUCCESS_RESPONSE.access_token);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("throws after max retries exceeded", async () => {
      const fetchMock = mockFetch([
        { ok: false, status: 500, json: () => Promise.resolve({ error: "server_error" }) },
        { ok: false, status: 500, json: () => Promise.resolve({ error: "server_error" }) },
        { ok: false, status: 500, json: () => Promise.resolve({ error: "server_error" }) },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      await expect(client.refreshToken("rt_old_token")).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
