import {
  CLIENT_ID,
  getOAuthHost,
  buildDeviceHeaders,
} from "./constants.js";

export interface DeviceAuthResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
  token_type: string;
}

export type PollResult =
  | { status: "success"; token: TokenResponse }
  | { status: "pending" }
  | { status: "expired" }
  | { status: "denied" }
  | { status: "error"; message: string };

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;

export class OAuthClient {
  private readonly deviceId: string;

  constructor(deviceId: string) {
    this.deviceId = deviceId;
  }

  private async makeRequest(
    endpoint: string,
    body: Record<string, string>
  ): Promise<Response> {
    const url = `${getOAuthHost()}${endpoint}`;
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      ...buildDeviceHeaders(this.deviceId),
    };
    const formBody = Object.entries(body)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    return fetch(url, {
      method: "POST",
      headers,
      body: formBody,
    });
  }

  async requestDeviceCode(): Promise<DeviceAuthResponse> {
    const resp = await this.makeRequest("/api/oauth/device_authorization", {
      client_id: CLIENT_ID,
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(
        `Device authorization request failed: ${resp.status} ${JSON.stringify(err)}`
      );
    }

    return resp.json();
  }

  async pollForToken(deviceCode: string): Promise<PollResult> {
    const resp = await this.makeRequest("/api/oauth/token", {
      client_id: CLIENT_ID,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });

    const data = await resp.json();

    if (data.access_token) {
      return {
        status: "success",
        token: {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
          scope: data.scope || "all",
          token_type: data.token_type || "Bearer",
        },
      };
    }

    if (data.error === "authorization_pending") return { status: "pending" };
    if (data.error === "slow_down") return { status: "pending" };
    if (data.error === "expired_token") return { status: "expired" };
    if (data.error === "access_denied") return { status: "denied" };

    return { status: "error", message: data.error_description || data.error || "Unknown error" };
  }

  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1)));
      }

      try {
        const resp = await this.makeRequest("/api/oauth/token", {
          client_id: CLIENT_ID,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        });

        if (resp.status === 401 || resp.status === 403) {
          throw new Error("Token rejected");
        }

        if (!resp.ok) {
          lastError = new Error(`Refresh failed: ${resp.status}`);
          continue;
        }

        const data = await resp.json();
        return {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
          scope: data.scope || "all",
          token_type: data.token_type || "Bearer",
        };
      } catch (err) {
        lastError = err as Error;
        if ((err as Error).message === "Token rejected") throw err;
      }
    }

    throw lastError || new Error("Refresh failed after max retries");
  }
}
