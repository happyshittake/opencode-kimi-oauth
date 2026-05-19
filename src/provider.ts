import type { ProviderHook, ProviderHookContext } from "@opencode-ai/plugin";
import type { Provider, Model } from "@opencode-ai/sdk/v2";
import { getApiBaseUrl, KIMI_CLI_VERSION, PROVIDER_ID } from "./constants.js";

const DEFAULT_OUTPUT_LIMIT = 16384;

interface KimiModel {
  id: string;
  display_name: string | null;
  context_length: number;
  supports_reasoning: boolean;
  supports_image_in: boolean;
  supports_video_in: boolean;
}

interface KimiModelsResponse {
  data: KimiModel[];
}

function transformModel(raw: KimiModel): Model {
  return {
    id: raw.id,
    providerID: PROVIDER_ID,
    api: {
      id: raw.id,
      url: getApiBaseUrl(),
      npm: "opencode-kimi-oauth",
    },
    name: raw.display_name || raw.id,
    capabilities: {
      reasoning: raw.supports_reasoning,
      toolcall: true,
      temperature: true,
      attachment: raw.supports_image_in || raw.supports_video_in,
      input: {
        text: true,
        audio: false,
        image: raw.supports_image_in,
        video: raw.supports_video_in,
        pdf: false,
      },
      output: {
        text: true,
        audio: false,
        image: false,
        video: false,
        pdf: false,
      },
      interleaved: false,
    },
    cost: {
      input: 0,
      output: 0,
      cache: { read: 0, write: 0 },
    },
    limit: {
      context: raw.context_length,
      output: DEFAULT_OUTPUT_LIMIT,
    },
    status: "active",
    options: {},
    headers: {
      "User-Agent": `KimiCLI/${KIMI_CLI_VERSION}`,
    },
    release_date: "",
  };
}

export function createProviderHook(): ProviderHook {
  return {
    id: PROVIDER_ID,
    models: async (
      _provider: Provider,
      ctx: ProviderHookContext
    ): Promise<Record<string, Model>> => {
      if (!ctx.auth || ctx.auth.type !== "oauth") {
        return {};
      }

      const accessToken = ctx.auth.access;

      try {
        const url = `${getApiBaseUrl()}/models`;
        const resp = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "User-Agent": `KimiCLI/${KIMI_CLI_VERSION}`,
            "X-Msh-Platform": "kimi_cli",
          },
        });

        if (!resp.ok) {
          return {};
        }

        const data = await resp.json();

        if (!data?.data || !Array.isArray(data.data)) {
          return {};
        }

        const models: Record<string, Model> = {};

        for (const raw of data.data) {
          models[raw.id] = transformModel(raw);
        }

        return models;
      } catch (err) {
        console.error("[kimi-oauth] provider models() error:", err);
        return {};
      }
    },
  };
}
