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
