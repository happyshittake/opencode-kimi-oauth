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
