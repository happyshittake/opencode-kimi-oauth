# opencode-kimi-oauth

An [OpenCode](https://opencode.ai) plugin that adds OAuth 2.0 Device Authorization Grant login and dynamic model discovery for **Kimi for Coding**.

## Features

- **OAuth 2.0 Device Flow** — Log in with Kimi via `https://auth.kimi.com/device` using the same flow as the official `kimi-cli`
- **Auto-refresh** — Access tokens are automatically refreshed before expiry (5-minute threshold)
- **Dynamic models** — Fetches the latest model list from `api.kimi.com/coding/v1/models` after login
- **File-based token storage** — Securely stores credentials in platform-standard directories

## Installation

Add to your `~/.config/opencode/opencode.jsonc`:

```json
{
  "plugin": [
    "kimi-oauth@git+https://github.com/happyshittake/opencode-kimi-oauth.git"
  ]
}
```

Restart OpenCode. The plugin auto-registers the `kimi-coding-oauth` provider — no manual provider config needed.

## Usage

### Login

```
/auth kimi-coding-oauth
```

1. A browser opens to `https://auth.kimi.com/device` with a pre-filled code
2. Confirm the login on the Kimi website
3. Return to OpenCode — you're authenticated

### Select a Model

Once logged in, models appear under the `kimi-coding-oauth` provider:

```json
{
  "agent": {
    "general": {
      "model": "kimi-coding-oauth/kimi-k2-5"
    }
  }
}
```

Available models are fetched dynamically from the Kimi API and may include:

- `kimi-k2-5` — Full multimodal support (text, image, video)
- `kimi-k2-thinking` — Reasoning mode
- `kimi-k2-pro` — Pro capabilities

### Logout

To clear stored credentials, delete the token directory:

| Platform | Path |
|----------|------|
| macOS | `~/.local/share/opencode-kimi-oauth/` |
| Linux | `~/.local/share/opencode-kimi-oauth/` or `$XDG_DATA_HOME/opencode-kimi-oauth/` |
| Windows | `%APPDATA%\opencode-kimi-oauth\` |

## Architecture

```
src/
├── constants.ts    # Client ID, endpoints, header builders
├── token-store.ts  # File-based credential persistence
├── oauth-client.ts # Device code + token poll + refresh HTTP calls
├── auth.ts         # AuthHook: authorize + loader (auto-refresh)
├── provider.ts     # ProviderHook: dynamic model listing
└── index.ts        # Plugin entry point
```

- **OAuth endpoint**: `https://auth.kimi.com`
- **API endpoint**: `https://api.kimi.com/coding/v1`
- **Client ID**: `17e5f671-d194-4dfb-9706-5516cb48c098` (same as kimi-cli)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `KIMI_CODE_OAUTH_HOST` | Override OAuth host (default: `https://auth.kimi.com`) |
| `KIMI_OAUTH_HOST` | Fallback OAuth host override |
| `KIMI_CODE_BASE_URL` | Override API base URL (default: `https://api.kimi.com/coding/v1`) |

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build
```

## License

MIT
