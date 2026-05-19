import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createAuthHook } from "../src/auth.js";
import { TokenStore } from "../src/token-store.js";
import { PROVIDER_ID } from "../src/constants.js";
import type { AuthHook } from "@opencode-ai/plugin";
import {
  DEVICE_AUTH_RESPONSE,
  TOKEN_SUCCESS_RESPONSE,
  TOKEN_PENDING_RESPONSE,
  REFRESH_SUCCESS_RESPONSE,
} from "./fixtures/responses.js";

const tmpDir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "opencode-kimi-auth-test-"));

describe("createAuthHook", () => {
  let dir: string;
  let store: TokenStore;
  let authHook: AuthHook;

  beforeEach(() => {
    dir = tmpDir();
    store = new TokenStore(dir);
    authHook = createAuthHook(store);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("has correct provider ID", () => {
    expect(authHook.provider).toBe(PROVIDER_ID);
  });

  it("has one oauth method", () => {
    expect(authHook.methods).toHaveLength(1);
    expect(authHook.methods[0].type).toBe("oauth");
    expect(authHook.methods[0].label).toBe("Login with Kimi");
  });

  describe("authorize", () => {
    it("returns auto method with URL, instructions, and callback", async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(DEVICE_AUTH_RESPONSE),
      });
      vi.stubGlobal("fetch", fetchMock);

      const method = authHook.methods[0];
      if (method.type !== "oauth") throw new Error("Expected oauth method");

      const result = await method.authorize();
      expect(result.url).toBe(DEVICE_AUTH_RESPONSE.verification_uri_complete);
      expect(result.instructions).toContain(DEVICE_AUTH_RESPONSE.user_code);
      expect(result.method).toBe("auto");
      expect(typeof result.callback).toBe("function");
    });

    it("callback returns success after polling", async () => {
      vi.useFakeTimers();

      // First call: device code request
      // Subsequent calls: token polling
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(DEVICE_AUTH_RESPONSE),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(TOKEN_PENDING_RESPONSE),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(TOKEN_SUCCESS_RESPONSE),
        });
      vi.stubGlobal("fetch", fetchMock);

      const method = authHook.methods[0];
      if (method.type !== "oauth") throw new Error("Expected oauth method");

      const result = await method.authorize();
      if (result.method !== "auto") throw new Error("Expected auto method");

      const callbackPromise = result.callback();
      // Advance past the polling interval
      await vi.advanceTimersByTimeAsync(6000);

      const callbackResult = await callbackPromise;
      vi.useRealTimers();

      if (callbackResult.type !== "success") throw new Error("Expected success");
      expect(callbackResult.access).toBe(TOKEN_SUCCESS_RESPONSE.access_token);
      expect(callbackResult.refresh).toBe(TOKEN_SUCCESS_RESPONSE.refresh_token);
      expect(callbackResult.expires).toBeGreaterThan(0);
    });
  });

  describe("loader", () => {
    it("returns headers with valid token", async () => {
      const creds = {
        access_token: "valid-token",
        refresh_token: "valid-refresh",
        expires_at: Date.now() / 1000 + 99999,
        scope: "all",
        token_type: "Bearer",
      };
      store.save(creds);

      const mockAuth = async () => ({
        type: "oauth" as const,
        refresh: creds.refresh_token,
        access: creds.access_token,
        expires: creds.expires_at,
      });

      const result = await authHook.loader!(mockAuth, {} as any);
      expect(result["Authorization"]).toBe(`Bearer ${creds.access_token}`);
      expect(result["User-Agent"]).toBe("KimiCLI/1.44.0");
    });

    it("refreshes expired token via loader", async () => {
      const creds = {
        access_token: "expired-token",
        refresh_token: "valid-refresh",
        expires_at: Date.now() / 1000 - 100, // expired
        scope: "all",
        token_type: "Bearer",
      };
      store.save(creds);

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(REFRESH_SUCCESS_RESPONSE),
      });
      vi.stubGlobal("fetch", fetchMock);

      const mockAuth = async () => ({
        type: "oauth" as const,
        refresh: creds.refresh_token,
        access: creds.access_token,
        expires: creds.expires_at,
      });

      const result = await authHook.loader!(mockAuth, {} as any);
      expect(result["Authorization"]).toBe(`Bearer ${REFRESH_SUCCESS_RESPONSE.access_token}`);
    });
  });
});
