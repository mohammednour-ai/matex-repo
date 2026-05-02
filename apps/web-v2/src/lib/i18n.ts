/**
 * Lightweight i18n message loader.
 *
 * This is the scaffolding step toward a full next-intl integration. The full
 * integration requires adding a `[locale]` segment to `apps/web-v2/src/app`
 * and wrapping the tree in `<NextIntlClientProvider>`. That structural change
 * is intentionally deferred — see `docs/deferred-work.md` (E) — until a
 * Quebec-resident speaker reviews the FR-CA copy.
 *
 * Today this helper:
 *   - resolves the active locale from the `bilingual_ui` flag + URL `?lang`
 *     query param + a localStorage preference,
 *   - imports the matching message catalog from `apps/web-v2/messages/`,
 *   - exposes a `t(path)` getter that falls back to English on a missing key.
 *
 * Once the structural migration ships, swap this for `useTranslations` from
 * next-intl; the catalog files and key shapes are already aligned.
 */
import en from "../../messages/en.json";
import frCA from "../../messages/fr-CA.json";
import { isFlagEnabled } from "@/lib/flags";

export type Locale = "en" | "fr-CA";
const STORAGE_KEY = "matex_locale";

const catalogs: Record<Locale, typeof en> = {
  en,
  "fr-CA": frCA as typeof en,
};

export function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  if (!isFlagEnabled("bilingual_ui")) return "en";
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("lang");
  if (fromUrl === "fr-CA" || fromUrl === "en") {
    window.localStorage.setItem(STORAGE_KEY, fromUrl);
    return fromUrl;
  }
  const stored = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (stored === "fr-CA" || stored === "en") return stored;
  // Browser preference (only honor fr-CA explicitly; default to en).
  const nav = window.navigator.language ?? "";
  if (nav.toLowerCase().startsWith("fr")) return "fr-CA";
  return "en";
}

export function setLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, locale);
}

function lookup(catalog: unknown, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = catalog;
  for (const part of parts) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

export function t(path: string, locale?: Locale): string {
  const active = locale ?? detectLocale();
  const fromActive = lookup(catalogs[active], path);
  if (fromActive !== undefined) return fromActive;
  // Fall back to English to avoid showing the dotted key in production.
  const fromEn = lookup(catalogs.en, path);
  return fromEn ?? path;
}
