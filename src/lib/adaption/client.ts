export interface AdaptionConfig {
  apiKey: string | null;
  baseUrl: string;
  configured: boolean;
}

export function getAdaptionConfig(): AdaptionConfig {
  const apiKey = process.env.ADAPTION_API_KEY?.trim() || null;
  const baseUrl = (process.env.ADAPTION_BASE_URL?.trim() || "https://api.adaptionlabs.ai").replace(/\/$/, "");
  return { apiKey, baseUrl, configured: Boolean(apiKey) };
}

/**
 * Test the live Adaption connection against the documented API
 * (GET /api/v1/datasets). Returns the real outcome; never claims
 * success without a verified response.
 */
export async function testAdaptionConnection(): Promise<{
  ok: boolean;
  status: number | null;
  message: string;
}> {
  const config = getAdaptionConfig();
  if (!config.configured) {
    return {
      ok: false,
      status: null,
      message: "ADAPTION_API_KEY is not set. Live connection was not attempted.",
    };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(`${config.baseUrl}/api/v1/datasets`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (res.ok) {
      return { ok: true, status: res.status, message: "Connected. Adaption API responded successfully." };
    }
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      status: res.status,
      message: `Adaption API responded with status ${res.status}. ${body.slice(0, 200)}`.trim(),
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, status: null, message: `Connection failed: ${reason}` };
  }
}
