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
