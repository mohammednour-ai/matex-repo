/**
 * Wire-format envelopes shared between MCP servers and Edge Functions.
 * MCP wraps these in `{ content: [{ type: "text", text: JSON.stringify(...) }] }`;
 * Edge Functions emit them directly as the response body.
 */
export interface OkEnvelope<T = unknown> {
  success: true;
  data: T;
}

export interface FailEnvelope {
  success: false;
  error: { code: string; message: string };
}

export type Envelope<T = unknown> = OkEnvelope<T> | FailEnvelope;

export function okEnvelope<T>(data: T): OkEnvelope<T> {
  return { success: true, data };
}

export function failEnvelope(code: string, message: string): FailEnvelope {
  return { success: false, error: { code, message } };
}
