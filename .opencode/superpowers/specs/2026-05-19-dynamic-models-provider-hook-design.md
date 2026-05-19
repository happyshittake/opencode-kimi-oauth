# Design: Wire Provider Hook for Dynamic Model Discovery

**Date:** 2026-05-19
**Status:** Approved

## Problem

Two bugs prevent the kimi-oauth plugin from working end-to-end:

1. **"undefined chat message error"** — The provider hook (`createProviderHook`) exists in `src/provider.ts` but is never imported or returned by `src/index.ts`. Without it, opencode doesn't know the API base URL, model definitions, or how to route chat requests to Kimi's API.

2. **Static model definitions in config** — Models are hardcoded in `opencode.jsonc` instead of being fetched dynamically from Kimi's `/models` endpoint. The user wants dynamic model discovery.

The provider hook was previously removed because it caused a `JSON Parse error: Unexpected identifier "undefined"` crash during startup. Root cause: insufficient error handling in the `models()` function.

## Approach

**Approach B: Wire provider hook + harden with error boundary**

- Import and return `createProviderHook()` in `index.ts`
- Wrap the entire `models()` function body in a defensive error boundary
- Validate API response shape before processing
- Log errors to `console.error` for debugging
- Remove static model definitions from `opencode.jsonc`
- Rebuild, commit, push, reinstall

## Changes

### 1. `src/index.ts` — Wire provider hook

Import `createProviderHook` and include it in the returned hooks:

```typescript
import { createProviderHook } from "./provider.js";

// In server():
return {
  auth: createAuthHook(store),
  provider: createProviderHook(),
};
```

### 2. `src/provider.ts` — Harden models() function

Add response shape validation and comprehensive error logging:

```typescript
models: async (_provider, ctx) => {
  try {
    if (!ctx.auth || ctx.auth.type !== "oauth") return {};
    const resp = await fetch(url, { headers });
    if (!resp.ok) return {};
    const data = await resp.json();
    if (!data?.data || !Array.isArray(data.data)) return {};
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
```

Key hardening:
- `data?.data` null check before array access
- `Array.isArray()` validation
- `console.error` logging (visible in opencode logs)
- Guaranteed `{}` return — never `undefined`, never crashes

### 3. `~/.config/opencode/opencode.jsonc` — Remove static models

Remove the entire `provider.kimi-coding-oauth` section. Models will come exclusively from the provider hook's `models()` function after OAuth login.

### 4. Build, deploy, verify

1. `npm run build` — tsup inlines provider.ts into dist/index.js
2. Commit and push to GitHub
3. Clear plugin cache and reinstall
4. Verify: `opencode providers list` shows kimi-coding-oauth with dynamic models
5. Verify: sending a chat message works without "undefined" error

### 5. Tests

No new tests needed. `tests/index.test.ts` already expects both `auth` and `provider` hooks. `tests/provider.test.ts` covers the provider hook logic. Both should pass after the fix.

## Unauthenticated Behavior

When the user is not logged in (no OAuth token), `models()` returns `{}`. No models appear for the `kimi-coding-oauth` provider until the user authenticates via `/auth kimi-coding-oauth`. This matches how other OAuth providers work.
