# Dynamic Models Provider Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing provider hook into the plugin entry point and harden its error handling so models are discovered dynamically from Kimi's API and chat messages work without errors.

**Architecture:** The provider hook (`src/provider.ts`) already exists and is fully tested. The fix is: (1) import and wire it in `src/index.ts`, (2) add response shape validation and error logging to `models()`, (3) remove static model config from `opencode.jsonc`, (4) rebuild and redeploy.

**Tech Stack:** TypeScript, tsup bundler, vitest, opencode plugin API (`@opencode-ai/plugin`)

---

### Task 1: Harden provider.ts models() with response validation and error logging

**Files:**
- Modify: `src/provider.ts:72-108`

- [ ] **Step 1: Write the failing test for malformed API response**

Add a new test to `tests/provider.test.ts` after the existing "returns empty model map on API error" test (after line 142):

```typescript
    it("returns empty model map on malformed API response", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ not_data: [] }),  // missing "data" key
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

    it("logs error to console on fetch failure", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error("Network error"));
      vi.stubGlobal("fetch", fetchMock);
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

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
      expect(consoleSpy).toHaveBeenCalledWith(
        "[kimi-oauth] provider models() error:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/provider.test.ts`
Expected: "returns empty model map on malformed API response" FAILS because the current code tries to iterate `data.data` which is `undefined`. "logs error to console on fetch failure" FAILS because `console.error` is not called.

- [ ] **Step 3: Harden the models() function in `src/provider.ts`**

Replace the entire `models` function body (lines 72-107) with:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/provider.test.ts`
Expected: All tests PASS (6 tests total, including the 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/provider.ts tests/provider.test.ts
git commit -m "fix: harden provider models() with response validation and error logging"
```

---

### Task 2: Wire provider hook in src/index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Run the existing index test to confirm it fails**

Run: `npx vitest run tests/index.test.ts`
Expected: The test "server returns auth and provider hooks" FAILS because `hooks.provider` is `undefined`.

- [ ] **Step 2: Update src/index.ts to import and wire the provider hook**

Replace the entire file content with:

```typescript
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

- [ ] **Step 3: Run the index test to verify it passes**

Run: `npx vitest run tests/index.test.ts`
Expected: All 3 tests PASS, including "server returns auth and provider hooks".

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests across all test files PASS (no regressions).

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire provider hook for dynamic model discovery"
```

---

### Task 3: Remove static model definitions from opencode.jsonc

**Files:**
- Modify: `~/.config/opencode/opencode.jsonc:40-87`

- [ ] **Step 1: Remove the provider.kimi-coding-oauth section**

Edit `~/.config/opencode/opencode.jsonc`. Remove lines 40-87 (the entire `"provider": { "kimi-coding-oauth": { ... } }` block and its trailing comma). The result should go from:

```jsonc
  },
  "provider": {
    "kimi-coding-oauth": {
      ...
    }
  },
  "permission": "allow",
```

to:

```jsonc
  },
  "permission": "allow",
```

The `"permission": "allow"` line should still have its trailing comma before the `"agent"` block.

- [ ] **Step 2: Verify config is valid JSONC**

Run: `node -e "JSON.parse(require('fs').readFileSync('$HOME/.config/opencode/opencode.jsonc','utf8').replace(/\/\/.*|\/\*[\s\S]*?\*\//g,'').replace(/,\s*([}\]])/g,'$1'))" && echo "Valid JSON"`
Expected: "Valid JSON"

---

### Task 4: Build, deploy, and verify

- [ ] **Step 1: Rebuild the plugin**

Run: `npm run build`
Expected: `dist/index.js` is rebuilt with provider hook code included. The file should be larger than before (previously ~296 lines, now ~400+ lines with provider code inlined).

- [ ] **Step 2: Verify provider code is in the bundle**

Run: `grep -c "models" dist/index.js`
Expected: Count > 0 (the provider hook's models function is in the bundle).

- [ ] **Step 3: Commit and push**

```bash
git add -A
git commit -m "feat: dynamic model discovery via provider hook"
git push
```

- [ ] **Step 4: Clear plugin cache and reinstall**

```bash
rm -rf ~/.cache/opencode/packages/kimi-oauth@git+https:/github.com/happyshittake/opencode-kimi-oauth.git
opencode plugin "kimi-oauth@git+https://github.com/happyshittake/opencode-kimi-oauth.git"
```

Expected: "Installed kimi-oauth@git+https://..." with no errors.

- [ ] **Step 5: Verify provider and models appear**

Run: `opencode providers list 2>&1 | grep -i "kimi"`
Expected: `kimi-coding-oauth` appears with `oauth` type.

Run: `opencode run --print-logs "hello" 2>&1 | grep "kimi-coding-oauth"`
Expected: `service=provider providerID=kimi-coding-oauth found` in the logs. No "undefined" errors. No JSON parse errors.
