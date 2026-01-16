const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface TurnstileVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Verify a Cloudflare Turnstile token
 * 
 * @param token - The cf-turnstile-response token from the client
 * @param ip - Optional IP address of the client for additional verification
 * @returns true if verification succeeded, false otherwise
 */
export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  
  // If no secret key is configured, skip verification in development
  if (!secretKey) {
    if (process.env.NODE_ENV === "development") {
      console.warn("TURNSTILE_SECRET_KEY not set, skipping verification in development");
      return true;
    }
    console.error("TURNSTILE_SECRET_KEY not configured");
    return false;
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token);
    if (ip) {
      formData.append("remoteip", ip);
    }

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      console.error("Turnstile verification request failed:", response.status);
      return false;
    }

    const result: TurnstileVerifyResponse = await response.json();
    
    if (!result.success) {
      console.warn("Turnstile verification failed:", result["error-codes"]);
    }

    return result.success;
  } catch (error) {
    console.error("Turnstile verification error:", error);
    return false;
  }
}

/**
 * Get the Turnstile site key for client-side use
 * This is safe to expose publicly
 */
export function getTurnstileSiteKey(): string | null {
  return process.env.TURNSTILE_SITE_KEY ?? null;
}
