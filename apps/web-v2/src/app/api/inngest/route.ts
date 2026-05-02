import { serve } from "inngest/next";
import { inngest, inngestFunctions } from "@/lib/inngest";

/**
 * Inngest webhook handler. Inngest Cloud (or the dev server) discovers and
 * triggers the registered functions via this endpoint. Without
 * `INNGEST_SIGNING_KEY` in the environment the platform won't dispatch
 * events; the route mounts safely either way.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions,
});
