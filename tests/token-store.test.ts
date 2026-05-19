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
