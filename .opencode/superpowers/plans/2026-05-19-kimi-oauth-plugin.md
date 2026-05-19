# Kimi OAuth Plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained opencode plugin that provides OAuth login and dynamic model discovery for Kimi for Coding, replicating kimi-cli's exact Device Authorization flow.

**Architecture:** TypeScript ESM plugin exporting `id` and `server` (a `Plugin` function). The server function returns `{ auth, provider }` hooks. OAuth uses Device Authorization Grant (RFC 8628) against `auth.kimi.com`, with file-based token storage and auto-refresh. The provider hook fetches models from `api.kimi.com/coding/v1/models`.

**Tech Stack:** TypeScript, ESM, `@opencode-ai/plugin` + `@opencode-ai/sdk` (peer deps), tsup for bundling, vitest for testing.

---

## File Structure

```
opencode-kimi-oauth/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── constants.ts       # Client ID, endpoints, version, header builders
│   ├── token-store.ts     # File-based credential persistence
│   ├── oauth-client.ts    # Device code + token poll + refresh HTTP calls
│   ├── auth.ts            # AuthHook: authorize + loader (refresh)
│   ├── provider.ts        # ProviderHook: dynamic model listing
│   └── index.ts           # Plugin entry: exports { id, server }
├── tests/
│   ├── constants.test.ts
│   ├── token-store.test.ts
│   ├── oauth-client.test.ts
│   ├── auth.test.ts
│   ├── provider.test.ts
│   └── fixtures/
│       └── responses.ts   # Mock API responses
├── dist/                  # Built output (gitignored)
└── README.md
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "opencode-kimi-oauth",
  "version": "0.1.0",
  "description": "OpenCode plugin for Kimi for Coding OAuth login and model discovery",
  "type": "module",
  "main": "./dist/index.js",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "npm run build"
  },
  "peerDependencies": {
    "@opencode-ai/plugin": ">=1.4.0",
    "@opencode-ai/sdk": ">=1.4.0"
  },
  "devDependencies": {
    "@opencode-ai/plugin": "^1.4.7",
    "@opencode-ai/sdk": "^1.4.7",
    "tsup": "^8.0.0",
    "typescript": "^5.5.0",
    "vitest": "^3.0.0"
  },
  "files": [
    "dist"
  ],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/happyshittake/opencode-kimi-oauth.git"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create tsup.config.ts**

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  external: ["@opencode-ai/plugin", "@opencode-ai/sdk"],
});
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
*.tsbuildinfo
.vitest/
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: Dependencies installed successfully.

- [ ] **Step 6: Initialize git repo**

```bash
git init
git add -A
git commit -m "chore: scaffold project with package.json, tsconfig, tsup"
```

---

### Task 2: Constants Module

**Files:**
- Create: `src/constants.ts`
- Create: `tests/constants.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/constants.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/constants.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/constants.ts
import os from "node:os";

export const CLIENT_ID = "17e5f671-d194-4dfb-9706-5516cb48c098";
export const DEFAULT_OAUTH_HOST = "https://auth.kimi.com";
export const DEFAULT_API_BASE_URL = "https://api.kimi.com/coding/v1";
export const PROVIDER_ID = "kimi-coding-oauth";
export const KIMI_CLI_VERSION = "1.44.0";

export function getOAuthHost(): string {
  return (
    process.env.KIMI_CODE_OAUTH_HOST ||
    process.env.KIMI_OAUTH_HOST ||
    DEFAULT_OAUTH_HOST
  );
}

export function getApiBaseUrl(): string {
  return process.env.KIMI_CODE_BASE_URL || DEFAULT_API_BASE_URL;
}

function getDeviceModel(): string {
  const platform = os.platform();
  const arch = os.arch();
  const release = os.release();
  if (platform === "darwin") return `macOS ${release} ${arch}`;
  if (platform === "linux") return `Linux ${release} ${arch}`;
  if (platform === "win32") return `Windows ${release} ${arch}`;
  return `${platform} ${release} ${arch}`;
}

export function buildDeviceHeaders(deviceId: string): Record<string, string> {
  return {
    "User-Agent": `KimiCLI/${KIMI_CLI_VERSION}`,
    "X-Msh-Platform": "kimi_cli",
    "X-Msh-Version": KIMI_CLI_VERSION,
    "X-Msh-Device-Id": deviceId,
    "X-Msh-Device-Name": os.hostname(),
    "X-Msh-Device-Model": getDeviceModel(),
    "X-Msh-Os-Version": os.release(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/constants.test.ts`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add src/constants.ts tests/constants.test.ts
git commit -m "feat: add constants module with endpoints, client ID, header builders"
```

---

### Task 3: Token Store

**Files:**
- Create: `src/token-store.ts`
- Create: `tests/token-store.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/token-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { TokenStore } from "../src/token-store.js";

// Use a temp directory for tests
const tmpDir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "opencode-kimi-test-"));

describe("TokenStore", () => {
  let store: TokenStore;
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
    store = new TokenStore(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns null when no credentials exist", () => {
    expect(store.load()).toBeNull();
  });

  it("saves and loads credentials round-trip", () => {
    const creds = {
      access_token: "test-access",
      refresh_token: "test-refresh",
      expires_at: Date.now() / 1000 + 3600,
      scope: "all",
      token_type: "Bearer",
    };
    store.save(creds);
    const loaded = store.load();
    expect(loaded).toEqual(creds);
  });

  it("overwrites existing credentials", () => {
    store.save({
      access_token: "old",
      refresh_token: "old-refresh",
      expires_at: 0,
      scope: "all",
      token_type: "Bearer",
    });
    store.save({
      access_token: "new",
      refresh_token: "new-refresh",
      expires_at: 1,
      scope: "all",
      token_type: "Bearer",
    });
    expect(store.load()!.access_token).toBe("new");
  });

  it("clears credentials", () => {
    store.save({
      access_token: "test",
      refresh_token: "test-refresh",
      expires_at: 0,
      scope: "all",
      token_type: "Bearer",
    });
    store.clear();
    expect(store.load()).toBeNull();
  });

  it("creates the directory if it does not exist", () => {
    const nestedDir = path.join(dir, "sub", "dir");
    const nestedStore = new TokenStore(nestedDir);
    nestedStore.save({
      access_token: "test",
      refresh_token: "r",
      expires_at: 0,
      scope: "all",
      token_type: "Bearer",
    });
    expect(nestedStore.load()).not.toBeNull();
  });

  it("isExpired returns true for past expiry", () => {
    const creds = {
      access_token: "test",
      refresh_token: "r",
      expires_at: Date.now() / 1000 - 100,
      scope: "all",
      token_type: "Bearer",
    };
    expect(store.isExpired(creds)).toBe(true);
  });

  it("isExpired returns false for far-future expiry", () => {
    const creds = {
      access_token: "test",
      refresh_token: "r",
      expires_at: Date.now() / 1000 + 99999,
      scope: "all",
      token_type: "Bearer",
    };
    expect(store.isExpired(creds)).toBe(false);
  });

  it("needsRefresh returns true when within 5 min of expiry", () => {
    const creds = {
      access_token: "test",
      refresh_token: "r",
      expires_at: Date.now() / 1000 + 200, // ~3 min
      scope: "all",
      token_type: "Bearer",
    };
    expect(store.needsRefresh(creds)).toBe(true);
  });

  it("needsRefresh returns false when far from expiry", () => {
    const creds = {
      access_token: "test",
      refresh_token: "r",
      expires_at: Date.now() / 1000 + 99999,
      scope: "all",
      token_type: "Bearer",
    };
    expect(store.needsRefresh(creds)).toBe(false);
  });
});

describe("TokenStore deviceId", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("generates and persists a device ID", () => {
    const store = new TokenStore(dir);
    const id1 = store.getDeviceId();
    expect(id1).toBeTypeOf("string");
    expect(id1.length).toBeGreaterThan(0);

    // Creating a new store pointing to same dir should return same ID
    const store2 = new TokenStore(dir);
    const id2 = store2.getDeviceId();
    expect(id2).toBe(id1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/token-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/token-store.ts
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface Credentials {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
  token_type: string;
}

const REFRESH_THRESHOLD_SECONDS = 300; // 5 minutes

export class TokenStore {
  private readonly credsPath: string;
  private readonly deviceIdPath: string;
  private readonly dir: string;

  constructor(baseDir: string) {
    this.dir = baseDir;
    this.credsPath = path.join(baseDir, "credentials.json");
    this.deviceIdPath = path.join(baseDir, "device-id");
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    }
  }

  load(): Credentials | null {
    try {
      if (!fs.existsSync(this.credsPath)) return null;
      const data = fs.readFileSync(this.credsPath, "utf-8");
      return JSON.parse(data) as Credentials;
    } catch {
      return null;
    }
  }

  save(creds: Credentials): void {
    this.ensureDir();
    fs.writeFileSync(this.credsPath, JSON.stringify(creds, null, 2), {
      mode: 0o600,
    });
  }

  clear(): void {
    try {
      if (fs.existsSync(this.credsPath)) {
        fs.unlinkSync(this.credsPath);
      }
    } catch {
      // ignore
    }
  }

  isExpired(creds: Credentials): boolean {
    return creds.expires_at <= Date.now() / 1000;
  }

  needsRefresh(creds: Credentials): boolean {
    const now = Date.now() / 1000;
    return creds.expires_at - now < REFRESH_THRESHOLD_SECONDS;
  }

  getDeviceId(): string {
    try {
      if (fs.existsSync(this.deviceIdPath)) {
        return fs.readFileSync(this.deviceIdPath, "utf-8").trim();
      }
    } catch {
      // fall through to generate
    }
    const id = crypto.randomUUID();
    this.ensureDir();
    fs.writeFileSync(this.deviceIdPath, id, { mode: 0o600 });
    return id;
  }
}

export function getDefaultStoreDir(): string {
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
  // Windows
  const appData = process.env.APPDATA || path.join(process.env.HOME || "~", "AppData", "Roaming");
  return path.join(appData, "opencode-kimi-oauth");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/token-store.test.ts`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add src/token-store.ts tests/token-store.test.ts
git commit -m "feat: add TokenStore with file-based credential persistence"
```

---

### Task 4: OAuth Client

**Files:**
- Create: `src/oauth-client.ts`
- Create: `tests/oauth-client.test.ts`
- Create: `tests/fixtures/responses.ts`

- [ ] **Step 1: Create test fixtures for mock API responses**

```typescript
// tests/fixtures/responses.ts
export const DEVICE_AUTH_RESPONSE = {
  device_code: "dc_abc123def456",
  user_code: "ABCD-1234",
  verification_uri: "https://auth.kimi.com/device",
  verification_uri_complete: "https://auth.kimi.com/device?code=ABCD-1234",
  expires_in: 900,
  interval: 5,
};

export const TOKEN_SUCCESS_RESPONSE = {
  access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-access",
  refresh_token: "rt_abc123def456",
  expires_in: 3600,
  scope: "all",
  token_type: "Bearer",
};

export const TOKEN_PENDING_RESPONSE = {
  error: "authorization_pending",
  error_description: "The user has not yet completed the authorization.",
};

export const TOKEN_SLOW_DOWN_RESPONSE = {
  error: "slow_down",
  error_description: "Polling too frequently.",
};

export const TOKEN_EXPIRED_RESPONSE = {
  error: "expired_token",
  error_description: "The device code has expired.",
};

export const TOKEN_DENIED_RESPONSE = {
  error: "access_denied",
  error_description: "The user denied the authorization request.",
};

export const REFRESH_SUCCESS_RESPONSE = {
  access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refreshed-access",
  refresh_token: "rt_refreshed123",
  expires_in: 3600,
  scope: "all",
  token_type: "Bearer",
};

export const MODELS_RESPONSE = {
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
```

- [ ] **Step 2: Write the test**

```typescript
// tests/oauth-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { OAuthClient } from "../src/oauth-client.js";
import { TokenStore } from "../src/token-store.js";
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
      expect(result.access_token).toBe(TOKEN_SUCCESS_RESPONSE.access_token);
      expect(result.refresh_token).toBe(TOKEN_SUCCESS_RESPONSE.refresh_token);
      expect(result.expires_at).toBeGreaterThan(0);
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/oauth-client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

```typescript
// src/oauth-client.ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/oauth-client.test.ts`
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add src/oauth-client.ts tests/oauth-client.test.ts tests/fixtures/responses.ts
git commit -m "feat: add OAuthClient with device code, polling, and refresh"
```

---

### Task 5: Auth Hook

**Files:**
- Create: `src/auth.ts`
- Create: `tests/auth.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/auth.test.ts
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
      // Speed up: don't actually wait for intervals
      if (result.method !== "auto") throw new Error("Expected auto method");

      const callbackResult = await result.callback();
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/auth.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth.test.ts`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth.ts tests/auth.test.ts
git commit -m "feat: add auth hook with Device OAuth flow and auto-refresh loader"
```

---

### Task 6: Provider Hook (Dynamic Models)

**Files:**
- Create: `src/provider.ts`
- Create: `tests/provider.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/provider.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createProviderHook } from "../src/provider.js";
import { PROVIDER_ID, KIMI_CLI_VERSION } from "../src/constants.js";
import { MODELS_RESPONSE } from "./fixtures/responses.js";
import type { ProviderHook } from "@opencode-ai/plugin";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/provider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/provider.ts
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

        const data: KimiModelsResponse = await resp.json();
        const models: Record<string, Model> = {};

        for (const raw of data.data) {
          models[raw.id] = transformModel(raw);
        }

        return models;
      } catch {
        return {};
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/provider.test.ts`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add src/provider.ts tests/provider.test.ts
git commit -m "feat: add provider hook with dynamic model discovery"
```

---

### Task 7: Plugin Entry Point

**Files:**
- Create: `src/index.ts`
- Create: `tests/index.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/index.test.ts
import { describe, it, expect } from "vitest";
import pluginModule from "../src/index.js";

describe("plugin module", () => {
  it("exports id as kimi-oauth", () => {
    expect(pluginModule.id).toBe("kimi-oauth");
  });

  it("exports server as a function", () => {
    expect(typeof pluginModule.server).toBe("function");
  });

  it("server returns auth and provider hooks", async () => {
    const hooks = await pluginModule.server(
      {
        client: {} as any,
        project: {} as any,
        directory: "/tmp",
        worktree: "/tmp",
        experimental_workspace: { register: () => {} },
        serverUrl: new URL("http://localhost:3000"),
        $: {} as any,
      },
      {}
    );

    expect(hooks.auth).toBeDefined();
    expect(hooks.auth!.provider).toBe("kimi-coding-oauth");
    expect(hooks.provider).toBeDefined();
    expect(hooks.provider!.id).toBe("kimi-coding-oauth");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/index.ts
import type { Plugin, PluginModule, PluginInput, PluginOptions, Hooks } from "@opencode-ai/plugin";
import { createAuthHook } from "./auth.js";
import { createProviderHook } from "./provider.js";
import { TokenStore, getDefaultStoreDir } from "./token-store.js";

export const id = "kimi-oauth";

export const server: Plugin = async (
  _input: PluginInput,
  _options?: PluginOptions
): Promise<Hooks> => {
  const store = new TokenStore(getDefaultStoreDir());
  const authHook = createAuthHook(store);
  const providerHook = createProviderHook();

  return {
    auth: authHook,
    provider: providerHook,
  };
};

export default { id, server } satisfies PluginModule;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/index.test.ts`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/index.test.ts
git commit -m "feat: add plugin entry point wiring auth and provider hooks"
```

---

### Task 8: Build & Integration Verification

**Files:**
- Modify: `package.json` (verify build works)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: ALL PASS — all 5 test files pass.

- [ ] **Step 2: Build the project**

Run: `npm run build`
Expected: `dist/index.js` and `dist/index.d.ts` generated successfully, no TypeScript errors.

- [ ] **Step 3: Verify the built output is valid ESM**

Run: `node -e "import('./dist/index.js').then(m => console.log('id:', m.id, 'server:', typeof m.server))"`
Expected: `id: kimi-oauth server: function`

- [ ] **Step 4: Commit final state**

```bash
git add -A
git commit -m "chore: verify build and integration"
```

---

### Task 9: Update opencode.jsonc to Use Plugin

**Files:**
- Modify: `~/.config/opencode/opencode.jsonc`

- [ ] **Step 1: Add the plugin to opencode config**

Add `opencode-kimi-oauth` to the plugin array in `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "plugin": [
    "superpowers@git+https://github.com/obra/superpowers.git",
    "kimi-oauth@git+https://github.com/happyshittake/opencode-kimi-oauth.git"
  ],
  // Remove the existing kimi-for-coding provider config since
  // the plugin auto-registers kimi-coding-oauth
}
```

Remove the existing `provider.kimi-for-coding` section since the plugin replaces it.

- [ ] **Step 2: Update agent model references**

Update any agent config that references `kimi-for-coding/*` models to use `kimi-coding-oauth/*` instead:

```jsonc
"agent": {
  "general": { "model": "kimi-coding-oauth/kimi-k2-5" },
  "build": { "model": "kimi-coding-oauth/kimi-k2-5" }
}
```

- [ ] **Step 3: Restart opencode and verify**

Restart opencode and verify:
1. The plugin loads without errors
2. Running `/auth kimi-coding-oauth` starts the Device OAuth flow
3. Models appear under `kimi-coding-oauth` provider after login

- [ ] **Step 4: Commit config changes**

```bash
git add -A
git commit -m "chore: update opencode.jsonc to use kimi-oauth plugin"
```
