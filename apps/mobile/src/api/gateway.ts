const GATEWAY_URL =
  process.env.EXPO_PUBLIC_GATEWAY_URL ?? "https://api.matexhub.ca";

interface ToolResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function callTool<T = unknown>(
  tool: string,
  args: Record<string, unknown>,
  token?: string
): Promise<ToolResponse<T>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${GATEWAY_URL}/tools/${tool}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ args }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "Request failed");
    return { success: false, error: `${response.status}: ${message}` };
  }

  const data = (await response.json()) as T;
  return { success: true, data };
}
