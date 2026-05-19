import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createProviderHook } from "../src/provider.js";
import { PROVIDER_ID, KIMI_CLI_VERSION } from "../src/constants.js";
import type { ProviderHook } from "@opencode-ai/plugin";

const MODELS_RESPONSE = {
  data: [
    {
      id: "kimi-k2-5",
      display_name: "Kimi K2.5",
      context_length: 256000,
      supports_reasoning: true,
      supports_image_in: true,
      supports_video_in: true,
    },
    {
      id: "kimi-k2-thinking",
      display_name: "Kimi K2 Thinking",
      context_length: 131072,
      supports_reasoning: true,
      supports_image_in: false,
      supports_video_in: false,
    },
    {
      id: "kimi-k2-pro",
      display_name: null,
      context_length: 128000,
      supports_reasoning: false,
      supports_image_in: true,
      supports_video_in: false,
    },
  ],
};

describe("createProviderHook", () => {
  let providerHook: ProviderHook;

  beforeEach(() => {
    providerHook = createProviderHook();
  });

  it("has correct provider ID", () => {
    expect(providerHook.id).toBe(PROVIDER_ID);
  });

  describe("models", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("fetches and transforms models from Kimi API", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(MODELS_RESPONSE),
      });
      vi.stubGlobal("fetch", fetchMock);

      const ctx = {
        auth: {
          type: "oauth" as const,
          refresh: "rt_test",
          access: "at_test",
          expires: Date.now() / 1000 + 99999,
        },
      };

      const result = await providerHook.models!({} as any, ctx);
      const keys = Object.keys(result);
      expect(keys).toHaveLength(3);

      // Check kimi-k2-5
      const k25 = result["kimi-k2-5"];
      expect(k25).toBeDefined();
      expect(k25.id).toBe("kimi-k2-5");
      expect(k25.name).toBe("Kimi K2.5");
      expect(k25.capabilities.reasoning).toBe(true);
      expect(k25.capabilities.toolcall).toBe(true);
      expect(k25.capabilities.attachment).toBe(true);
      expect(k25.capabilities.input.image).toBe(true);
      expect(k25.capabilities.input.video).toBe(true);
      expect(k25.limit.context).toBe(256000);
      expect(k25.headers["User-Agent"]).toBe(`KimiCLI/${KIMI_CLI_VERSION}`);

      // Check kimi-k2-thinking
      const thinking = result["kimi-k2-thinking"];
      expect(thinking.capabilities.reasoning).toBe(true);
      expect(thinking.capabilities.attachment).toBe(false);
      expect(thinking.capabilities.input.image).toBe(false);

      // Check kimi-k2-pro with null display_name
      const pro = result["kimi-k2-pro"];
      expect(pro.name).toBe("kimi-k2-pro"); // fallback to id
    });

    it("sends Authorization header with access token", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(MODELS_RESPONSE),
      });
      vi.stubGlobal("fetch", fetchMock);

      const ctx = {
        auth: {
          type: "oauth" as const,
          refresh: "rt_test",
          access: "at_test_123",
          expires: Date.now() / 1000 + 99999,
        },
      };

      await providerHook.models!({} as any, ctx);

      const [url, init] = fetchMock.mock.calls[0];
      expect(init.headers["Authorization"]).toBe("Bearer at_test_123");
    });

    it("returns empty model map when no auth", async () => {
      const result = await providerHook.models!({} as any, { auth: undefined });
      expect(Object.keys(result)).toHaveLength(0);
    });

    it("returns empty model map on API error", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });
      vi.stubGlobal("fetch", fetchMock);

      const ctx = {
        auth: {
          type: "oauth" as const,
          refresh: "rt_test",
          access: "at_test",
          expires: Date.now() / 1000 + 99999,
        },
      };

      const result = await providerHook.models!({} as any, ctx);
      expect(Object.keys(result)).toHaveLength(0);
    });
  });
});
