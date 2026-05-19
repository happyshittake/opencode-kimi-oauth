import type { AuthHook, AuthOAuthResult } from "@opencode-ai/plugin";
import type { Auth } from "@opencode-ai/sdk";
import type { Provider } from "@opencode-ai/sdk";
import { OAuthClient } from "./oauth-client.js";
import { TokenStore } from "./token-store.js";
import { KIMI_CLI_VERSION, PROVIDER_ID } from "./constants.js";

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_DURATION_MS = 900_000; // 15 minutes

export function createAuthHook(store: TokenStore): AuthHook {
  return {
    provider: PROVIDER_ID,
    loader: async (
      auth: () => Promise<Auth>,
      _provider: Provider
    ): Promise<Record<string, any>> => {
      const currentAuth = await auth();
      if (currentAuth.type !== "oauth") {
        return {};
      }

      // Check if token needs refresh
      const creds = store.load();
      if (creds && store.needsRefresh(creds)) {
        try {
          const client = new OAuthClient(store.getDeviceId());
          const newToken = await client.refreshToken(creds.refresh_token);
          store.save(newToken);
          return {
            Authorization: `Bearer ${newToken.access_token}`,
            "User-Agent": `KimiCLI/${KIMI_CLI_VERSION}`,
          };
        } catch {
          // Refresh failed — use existing token, hope for the best
        }
      }

      return {
        Authorization: `Bearer ${currentAuth.access}`,
        "User-Agent": `KimiCLI/${KIMI_CLI_VERSION}`,
      };
    },

    methods: [
      {
        type: "oauth",
        label: "Login with Kimi",
        authorize: async (): Promise<AuthOAuthResult> => {
          const client = new OAuthClient(store.getDeviceId());
          const deviceAuth = await client.requestDeviceCode();

          return {
            url: deviceAuth.verification_uri_complete,
            instructions: `To authenticate, visit ${deviceAuth.verification_uri} and enter code: ${deviceAuth.user_code}`,
            method: "auto",
            callback: async () => {
              const startTime = Date.now();
              const interval = deviceAuth.interval * 1000 || POLL_INTERVAL_MS;

              while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
                const result = await client.pollForToken(deviceAuth.device_code);

                if (result.status === "success") {
                  store.save(result.token);
                  return {
                    type: "success" as const,
                    provider: PROVIDER_ID,
                    refresh: result.token.refresh_token,
                    access: result.token.access_token,
                    expires: result.token.expires_at,
                  };
                }

                if (result.status === "expired") {
                  return { type: "failed" as const };
                }

                if (result.status === "denied") {
                  return { type: "failed" as const };
                }

                if (result.status === "error") {
                  return { type: "failed" as const };
                }

                // status === "pending" — wait and poll again
                await new Promise((r) => setTimeout(r, interval));
              }

              return { type: "failed" as const };
            },
          };
        },
      },
    ],
  };
}
