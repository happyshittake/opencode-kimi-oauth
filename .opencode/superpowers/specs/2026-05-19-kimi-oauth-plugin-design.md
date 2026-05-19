# Kimi OAuth Plugin for OpenCode — Design Spec

**Date**: 2026-05-19
**Status**: Approved
**Repository**: `github.com/happyshittake/opencode-kimi-oauth`

## Overview

An opencode plugin that enables OAuth login using Kimi for Coding (Moonshot AI's developer platform). The plugin replicates the authentication behavior of [kimi-cli](https://github.com/MoonshotAI/kimi-cli), spoofing identical headers and using the same Device Authorization Grant flow.

The plugin is self-contained — users only need to add it to the `plugin` array in `opencode.jsonc`. It auto-registers the `kimi-coding-oauth` provider with dynamic model discovery from the Kimi API.

## Installation

```jsonc
// opencode.jsonc
{
  "plugin": ["kimi-oauth@git+https://github.com/happyshittake/opencode-kimi-oauth.git"]
}
```

No `provider` configuration needed. Models are referenced as `kimi-coding-oauth/<model-id>` (e.g., `kimi-coding-oauth/k2p6`).

## Architecture

### File Structure

```
opencode-kimi-oauth/
├── package.json          # ESM module, peerDeps: @opencode-ai/plugin, @opencode-ai/sdk
├── tsconfig.json         # TypeScript config targeting ESM
├── src/
│   ├── index.ts          # Plugin entry point — exports { id, server }
│   ├── auth.ts           # AuthHook: Device OAuth flow + token refresh loader
│   ├── provider.ts       # ProviderHook: Dynamic model discovery from Kimi API
│   ├── oauth-client.ts   # Low-level OAuth HTTP client (device code, poll token, refresh)
│   ├── token-store.ts    # File-based token persistence
│   └── constants.ts      # Client ID, endpoints, version, header config
└── dist/                 # Built output (gitignored)
```

### Plugin Registration

The plugin exports a `PluginModule`:

```typescript
export const id = "kimi-oauth";
export const server: Plugin = async (input, options) => {
  // Initialize token store, load device ID
  // Return hooks
  return {
    auth: authHook,
    provider: providerHook,
  };
};
```

## OAuth Flow (Device Authorization Grant)

Replicates kimi-cli's exact OAuth flow (RFC 8628).

### Endpoints

| Endpoint | URL |
|----------|-----|
| OAuth Host | `https://auth.kimi.com` |
| Device Authorization | `POST https://auth.kimi.com/api/oauth/device_authorization` |
| Token | `POST https://auth.kimi.com/api/oauth/token` |
| API Base | `https://api.kimi.com/coding/v1` |

Environment variable overrides (matching kimi-cli):
- `KIMI_CODE_OAUTH_HOST` or `KIMI_OAUTH_HOST` → override auth host
- `KIMI_CODE_BASE_URL` → override API base URL

### Client Credentials

- **Client ID**: `17e5f671-d194-4dfb-9706-5516cb48c098`
- **No client_secret** (public client)

### Step-by-Step Flow

1. **User triggers login** — opencode TUI shows auth method labeled "Login with Kimi"
2. **Request device code**:
   ```
   POST /api/oauth/device_authorization
   Content-Type: application/x-www-form-urlencoded

   client_id=17e5f671-d194-4dfb-9706-5516cb48c098
   ```
3. **Display instructions** — Show verification URL + user code
4. **Auto-open browser** — opencode opens `verification_uri_complete` using `method: "auto"`
5. **Poll for token** — Every 5 seconds:
   ```
   POST /api/oauth/token
   Content-Type: application/x-www-form-urlencoded

   client_id=17e5f671-d194-4dfb-9706-5516cb48c098
   device_code=<device_code>
   grant_type=urn:ietf:params:oauth:grant-type:device_code
   ```
6. **Store tokens** — Save to file on success
7. **Return to opencode** — AuthSuccess with `refresh`, `access`, `expires`

### Custom Headers (Spoofing kimi-cli)

Every OAuth request includes these headers, matching kimi-cli exactly:

```
User-Agent: KimiCLI/1.44.0
X-Msh-Platform: kimi_cli
X-Msh-Version: 1.44.0
X-Msh-Device-Id: <persisted-UUID>
X-Msh-Device-Name: <hostname>
X-Msh-Device-Model: <OS info, e.g. "macOS 14.0 arm64">
X-Msh-Os-Version: <os version>
```

### Auth Hook Definition

```typescript
const authHook: AuthHook = {
  provider: "kimi-coding-oauth",
  loader: async (auth, provider) => {
    // Check if token needs refresh
    // Refresh if within 5 minutes of expiry
    // Return headers: { Authorization: "Bearer <token>", User-Agent: "KimiCLI/1.44.0" }
  },
  methods: [
    {
      type: "oauth",
      label: "Login with Kimi",
      authorize: async () => {
        // 1. Request device code from auth.kimi.com
        // 2. Return { url, instructions, method: "auto", callback }
        // 3. callback() polls token endpoint until user authorizes
      },
    },
  ],
};
```

## Token Management

### Storage

**Location**: `~/.local/share/opencode-kimi-oauth/credentials.json`
**Permissions**: `0o600` (user read/write only)

**Format**:
```json
{
  "access_token": "<jwt>",
  "refresh_token": "<token>",
  "expires_at": 1716123456.789,
  "scope": "all",
  "token_type": "Bearer"
}
```

**Device ID**: Persisted UUID at `~/.local/share/opencode-kimi-oauth/device-id`

### Token Refresh

**Trigger**: When access token is within 5 minutes of expiry.

```
POST /api/oauth/token
Content-Type: application/x-www-form-urlencoded

client_id=17e5f671-d194-4dfb-9706-5516cb48c098
grant_type=refresh_token
refresh_token=<refresh_token>
```

**Error handling**:
- 401/403 response → token rejected, prompt user to re-login
- Transient failure → retry up to 3 times with exponential backoff (2^n seconds)
- File locking to prevent concurrent refresh races across opencode instances

## Provider Hook (Dynamic Model Discovery)

### Registration

```typescript
const providerHook: ProviderHook = {
  id: "kimi-coding-oauth",
  models: async (provider, ctx) => {
    // 1. Get access token from ctx.auth
    // 2. Fetch models from Kimi API
    // 3. Transform into opencode ModelV2 format
    // 4. Return model map
  },
};
```

### Model Fetching

Fetches available models from the Kimi API using the OAuth access token:

```
GET https://api.kimi.com/coding/v1/models
Authorization: Bearer <access_token>
User-Agent: KimiCLI/1.44.0
X-Msh-Platform: kimi_cli
```

**Kimi API response format**:
```json
{
  "data": [
    {
      "id": "kimi-k2-5",
      "display_name": "Kimi K2.5",
      "context_length": 256000,
      "supports_reasoning": true,
      "supports_image_in": true,
      "supports_video_in": true
    }
  ]
}
```

Fields per model:
| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Model identifier (e.g., `kimi-k2-5`) |
| `display_name` | `string \| null` | Human-readable name |
| `context_length` | `number` | Context window size in tokens |
| `supports_reasoning` | `boolean` | Whether model supports reasoning/thinking |
| `supports_image_in` | `boolean` | Whether model accepts image input |
| `supports_video_in` | `boolean` | Whether model accepts video input |

### Model Mapping

Each Kimi model is transformed into opencode's `Model` type:

- `id`: Kimi's `id` field (e.g., `kimi-k2-5`, `kimi-k2-thinking`)
- `providerID`: `kimi-coding-oauth`
- `name`: `display_name` from API, fallback to `id`
- `capabilities.reasoning`: `supports_reasoning`
- `capabilities.toolcall`: `true` (all Kimi models support tool calling)
- `capabilities.temperature`: `true`
- `capabilities.attachment`: `supports_image_in || supports_video_in`
- `capabilities.input.image`: `supports_image_in`
- `capabilities.input.video`: `supports_video_in`
- `limit.context`: `context_length` from API
- `limit.output`: 16384 (default, Kimi models share a common output limit)
- `headers`: `{ "User-Agent": "KimiCLI/1.44.0" }` on each model for API request spoofing

### Fallback Behavior

If model discovery fails (no auth, API down):
- Return an empty model map
- opencode will show the provider as available but with no models until auth completes

## Error States

| Scenario | Behavior |
|----------|----------|
| No internet | Clear error: "Cannot connect to Kimi auth server" |
| User denies OAuth | "Authorization denied" with retry option |
| Token expired + refresh succeeds | Transparent — new token used |
| Token expired + refresh fails (401/403) | Prompt user to re-login |
| API returns 401 during model fetch | Trigger re-auth flow |
| Concurrent refresh attempts | File locking prevents race conditions |

## Dependencies

- `@opencode-ai/plugin` (peer dependency) — plugin hook types
- `@opencode-ai/sdk` (peer dependency) — client types
- TypeScript build toolchain (tsup or unbuild)

## Build & Distribution

- **Build**: TypeScript → ESM JavaScript
- **Output**: `dist/` directory with the compiled plugin
- **Entry point**: `dist/index.js` (referenced in `package.json` exports)
- **Distribution**: Git repository, installed via opencode's git-based plugin resolution
