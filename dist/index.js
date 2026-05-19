// src/constants.ts
import os from "os";
var CLIENT_ID = "17e5f671-d194-4dfb-9706-5516cb48c098";
var DEFAULT_OAUTH_HOST = "https://auth.kimi.com";
var DEFAULT_API_BASE_URL = "https://api.kimi.com/coding/v1";
var PROVIDER_ID = "kimi-coding-oauth";
var KIMI_CLI_VERSION = "1.44.0";
function getOAuthHost() {
  return process.env.KIMI_CODE_OAUTH_HOST || process.env.KIMI_OAUTH_HOST || DEFAULT_OAUTH_HOST;
}
function getApiBaseUrl() {
  return process.env.KIMI_CODE_BASE_URL || DEFAULT_API_BASE_URL;
}
function getDeviceModel() {
  const platform = os.platform();
  const arch = os.arch();
  const release = os.release();
  if (platform === "darwin") return `macOS ${release} ${arch}`;
  if (platform === "linux") return `Linux ${release} ${arch}`;
  if (platform === "win32") return `Windows ${release} ${arch}`;
  return `${platform} ${release} ${arch}`;
}
function buildDeviceHeaders(deviceId) {
  return {
    "User-Agent": `KimiCLI/${KIMI_CLI_VERSION}`,
    "X-Msh-Platform": "kimi_cli",
    "X-Msh-Version": KIMI_CLI_VERSION,
    "X-Msh-Device-Id": deviceId,
    "X-Msh-Device-Name": os.hostname(),
    "X-Msh-Device-Model": getDeviceModel(),
    "X-Msh-Os-Version": os.release()
  };
}

// src/oauth-client.ts
var MAX_RETRIES = 3;
var BASE_RETRY_DELAY_MS = 1e3;
var OAuthClient = class {
  deviceId;
  constructor(deviceId) {
    this.deviceId = deviceId;
  }
  async makeRequest(endpoint, body) {
    const url = `${getOAuthHost()}${endpoint}`;
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      ...buildDeviceHeaders(this.deviceId)
    };
    const formBody = Object.entries(body).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    return fetch(url, {
      method: "POST",
      headers,
      body: formBody
    });
  }
  async requestDeviceCode() {
    const resp = await this.makeRequest("/api/oauth/device_authorization", {
      client_id: CLIENT_ID
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(
        `Device authorization request failed: ${resp.status} ${JSON.stringify(err)}`
      );
    }
    return resp.json();
  }
  async pollForToken(deviceCode) {
    const resp = await this.makeRequest("/api/oauth/token", {
      client_id: CLIENT_ID,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code"
    });
    const data = await resp.json();
    if (data.access_token) {
      return {
        status: "success",
        token: {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: Math.floor(Date.now() / 1e3) + (data.expires_in || 3600),
          scope: data.scope || "all",
          token_type: data.token_type || "Bearer"
        }
      };
    }
    if (data.error === "authorization_pending") return { status: "pending" };
    if (data.error === "slow_down") return { status: "pending" };
    if (data.error === "expired_token") return { status: "expired" };
    if (data.error === "access_denied") return { status: "denied" };
    return { status: "error", message: data.error_description || data.error || "Unknown error" };
  }
  async refreshToken(refreshToken) {
    let lastError = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1)));
      }
      try {
        const resp = await this.makeRequest("/api/oauth/token", {
          client_id: CLIENT_ID,
          grant_type: "refresh_token",
          refresh_token: refreshToken
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
          expires_at: Math.floor(Date.now() / 1e3) + (data.expires_in || 3600),
          scope: data.scope || "all",
          token_type: data.token_type || "Bearer"
        };
      } catch (err) {
        lastError = err;
        if (err.message === "Token rejected") throw err;
      }
    }
    throw lastError || new Error("Refresh failed after max retries");
  }
};

// src/auth.ts
var POLL_INTERVAL_MS = 5e3;
var MAX_POLL_DURATION_MS = 9e5;
function createAuthHook(store) {
  return {
    provider: PROVIDER_ID,
    loader: async (auth, _provider) => {
      const currentAuth = await auth();
      if (currentAuth.type !== "oauth") {
        return {};
      }
      const creds = store.load();
      if (creds && store.needsRefresh(creds)) {
        try {
          const client = new OAuthClient(store.getDeviceId());
          const newToken = await client.refreshToken(creds.refresh_token);
          store.save(newToken);
          return {
            Authorization: `Bearer ${newToken.access_token}`,
            "User-Agent": `KimiCLI/${KIMI_CLI_VERSION}`
          };
        } catch {
        }
      }
      return {
        Authorization: `Bearer ${currentAuth.access}`,
        "User-Agent": `KimiCLI/${KIMI_CLI_VERSION}`
      };
    },
    methods: [
      {
        type: "oauth",
        label: "Login with Kimi",
        authorize: async () => {
          const client = new OAuthClient(store.getDeviceId());
          const deviceAuth = await client.requestDeviceCode();
          return {
            url: deviceAuth.verification_uri_complete,
            instructions: `To authenticate, visit ${deviceAuth.verification_uri} and enter code: ${deviceAuth.user_code}`,
            method: "auto",
            callback: async () => {
              const startTime = Date.now();
              const interval = deviceAuth.interval * 1e3 || POLL_INTERVAL_MS;
              while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
                const result = await client.pollForToken(deviceAuth.device_code);
                if (result.status === "success") {
                  store.save(result.token);
                  return {
                    type: "success",
                    provider: PROVIDER_ID,
                    refresh: result.token.refresh_token,
                    access: result.token.access_token,
                    expires: result.token.expires_at
                  };
                }
                if (result.status === "expired") {
                  return { type: "failed" };
                }
                if (result.status === "denied") {
                  return { type: "failed" };
                }
                if (result.status === "error") {
                  return { type: "failed" };
                }
                await new Promise((r) => setTimeout(r, interval));
              }
              return { type: "failed" };
            }
          };
        }
      }
    ]
  };
}

// src/provider.ts
var DEFAULT_OUTPUT_LIMIT = 16384;
function transformModel(raw) {
  return {
    id: raw.id,
    providerID: PROVIDER_ID,
    api: {
      id: raw.id,
      url: getApiBaseUrl(),
      npm: "opencode-kimi-oauth"
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
        pdf: false
      },
      output: {
        text: true,
        audio: false,
        image: false,
        video: false,
        pdf: false
      },
      interleaved: false
    },
    cost: {
      input: 0,
      output: 0,
      cache: { read: 0, write: 0 }
    },
    limit: {
      context: raw.context_length,
      output: DEFAULT_OUTPUT_LIMIT
    },
    status: "active",
    options: {},
    headers: {
      "User-Agent": `KimiCLI/${KIMI_CLI_VERSION}`
    },
    release_date: ""
  };
}
function createProviderHook() {
  return {
    id: PROVIDER_ID,
    models: async (_provider, ctx) => {
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
            "X-Msh-Platform": "kimi_cli"
          }
        });
        if (!resp.ok) {
          return {};
        }
        const data = await resp.json();
        if (!data?.data || !Array.isArray(data.data)) {
          return {};
        }
        const models = {};
        for (const raw of data.data) {
          models[raw.id] = transformModel(raw);
        }
        return models;
      } catch (err) {
        console.error("[kimi-oauth] provider models() error:", err);
        return {};
      }
    }
  };
}

// src/token-store.ts
import fs from "fs";
import path from "path";
import crypto from "crypto";
var REFRESH_THRESHOLD_SECONDS = 300;
var TokenStore = class {
  credsPath;
  deviceIdPath;
  dir;
  constructor(baseDir) {
    this.dir = baseDir;
    this.credsPath = path.join(baseDir, "credentials.json");
    this.deviceIdPath = path.join(baseDir, "device-id");
  }
  ensureDir() {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true, mode: 448 });
    }
  }
  load() {
    try {
      if (!fs.existsSync(this.credsPath)) return null;
      const data = fs.readFileSync(this.credsPath, "utf-8");
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  save(creds) {
    this.ensureDir();
    fs.writeFileSync(this.credsPath, JSON.stringify(creds, null, 2), {
      mode: 384
    });
  }
  clear() {
    try {
      if (fs.existsSync(this.credsPath)) {
        fs.unlinkSync(this.credsPath);
      }
    } catch {
    }
  }
  isExpired(creds) {
    return creds.expires_at <= Date.now() / 1e3;
  }
  needsRefresh(creds) {
    const now = Date.now() / 1e3;
    return creds.expires_at - now < REFRESH_THRESHOLD_SECONDS;
  }
  getDeviceId() {
    try {
      if (fs.existsSync(this.deviceIdPath)) {
        return fs.readFileSync(this.deviceIdPath, "utf-8").trim();
      }
    } catch {
    }
    const id2 = crypto.randomUUID();
    this.ensureDir();
    fs.writeFileSync(this.deviceIdPath, id2, { mode: 384 });
    return id2;
  }
};
function getDefaultStoreDir() {
  const platform = process.platform;
  if (platform === "linux") {
    const xdg = process.env.XDG_DATA_HOME;
    if (xdg) return path.join(xdg, "opencode-kimi-oauth");
    return path.join(process.env.HOME || "~", ".local", "share", "opencode-kimi-oauth");
  }
  if (platform === "darwin") {
    return path.join(
      process.env.HOME || "~",
      ".local",
      "share",
      "opencode-kimi-oauth"
    );
  }
  const appData = process.env.APPDATA || path.join(process.env.HOME || "~", "AppData", "Roaming");
  return path.join(appData, "opencode-kimi-oauth");
}

// src/index.ts
var id = "kimi-oauth";
var server = async (_input, _options) => {
  const store = new TokenStore(getDefaultStoreDir());
  const authHook = createAuthHook(store);
  const providerHook = createProviderHook();
  return {
    auth: authHook,
    provider: providerHook
  };
};
var index_default = { id, server };
export {
  index_default as default,
  id,
  server
};
//# sourceMappingURL=index.js.map