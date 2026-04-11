/** Dispatched by listing overview chips; MatexCopilot listens and prefills/opens. */
export const MATEX_COPILOT_PREFILL = "matex-copilot-prefill";

export type MatexCopilotPrefillDetail = {
  message: string;
  /** Open the copilot panel when true (default true). */
  open?: boolean;
};

export function dispatchCopilotPrefill(detail: MatexCopilotPrefillDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MATEX_COPILOT_PREFILL, { detail }));
}
