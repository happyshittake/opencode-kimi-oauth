import { describe, it, expect } from "vitest";
import {
  CLIENT_ID,
  DEFAULT_OAUTH_HOST,
  DEFAULT_API_BASE_URL,
  getOAuthHost,
  getApiBaseUrl,
  buildDeviceHeaders,
  PROVIDER_ID,
  KIMI_CLI_VERSION,
} from "../src/constants.js";

describe("constants", () => {
  it("exports the correct client ID", () => {
    expect(CLIENT_ID).toBe("17e5f671-d194-4dfb-9706-5516cb48c098");
  });

  it("exports default OAuth host", () => {
    expect(DEFAULT_OAUTH_HOST).toBe("https://auth.kimi.com");
  });

  it("exports default API base URL", () => {
    expect(DEFAULT_API_BASE_URL).toBe("https://api.kimi.com/coding/v1");
  });

  it("exports provider ID", () => {
    expect(PROVIDER_ID).toBe("kimi-coding-oauth");
  });

  it("exports kimi CLI version", () => {
    expect(KIMI_CLI_VERSION).toBe("1.44.0");
  });

  it("getOAuthHost returns default when no env override", () => {
    delete process.env.KIMI_CODE_OAUTH_HOST;
    delete process.env.KIMI_OAUTH_HOST;
    expect(getOAuthHost()).toBe("https://auth.kimi.com");
  });

  it("getOAuthHost respects KIMI_CODE_OAUTH_HOST", () => {
    process.env.KIMI_CODE_OAUTH_HOST = "https://custom-auth.example.com";
    expect(getOAuthHost()).toBe("https://custom-auth.example.com");
    delete process.env.KIMI_CODE_OAUTH_HOST;
  });

  it("getOAuthHost falls back to KIMI_OAUTH_HOST", () => {
    process.env.KIMI_OAUTH_HOST = "https://fallback-auth.example.com";
    expect(getOAuthHost()).toBe("https://fallback-auth.example.com");
    delete process.env.KIMI_OAUTH_HOST;
  });

  it("getApiBaseUrl returns default when no env override", () => {
    delete process.env.KIMI_CODE_BASE_URL;
    expect(getApiBaseUrl()).toBe("https://api.kimi.com/coding/v1");
  });

  it("getApiBaseUrl respects KIMI_CODE_BASE_URL", () => {
    process.env.KIMI_CODE_BASE_URL = "https://custom-api.example.com/v1";
    expect(getApiBaseUrl()).toBe("https://custom-api.example.com/v1");
    delete process.env.KIMI_CODE_BASE_URL;
  });

  it("buildDeviceHeaders returns required headers with string values", () => {
    const headers = buildDeviceHeaders("test-device-id");
    expect(headers["User-Agent"]).toBe("KimiCLI/1.44.0");
    expect(headers["X-Msh-Platform"]).toBe("kimi_cli");
    expect(headers["X-Msh-Version"]).toBe("1.44.0");
    expect(headers["X-Msh-Device-Id"]).toBe("test-device-id");
    expect(headers["X-Msh-Device-Name"]).toBeTypeOf("string");
    expect(headers["X-Msh-Device-Model"]).toBeTypeOf("string");
    expect(headers["X-Msh-Os-Version"]).toBeTypeOf("string");
  });
});
