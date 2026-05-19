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
