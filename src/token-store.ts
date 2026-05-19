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
