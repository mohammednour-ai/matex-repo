const GATEWAY_URL = process.env.MCP_GATEWAY_URL ?? "http://localhost:3001";

export async function callServer(
  tool: string,
  args: Record<string, unknown>,
  opts: { userId?: string; timeout?: number } = {},
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: { code: string; message: string } }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.userId) {
    headers["x-matex-user-id"] = opts.userId;
  }

  const controller = new AbortController();
  const timeoutMs = opts.timeout ?? 10_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${GATEWAY_URL}/tool`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tool, args }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await response.text();
    try {
      return JSON.parse(text) as { success: boolean; data?: Record<string, unknown>; error?: { code: string; message: string } };
    } catch {
      return { success: false, error: { code: "PARSE_ERROR", message: text.slice(0, 200) } };
    }
  } catch (err) {
    clearTimeout(timer);
    return { success: false, error: { code: "CALL_FAILED", message: err instanceof Error ? err.message : String(err) } };
  }
}
