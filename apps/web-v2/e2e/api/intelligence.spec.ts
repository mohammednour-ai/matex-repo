import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Intelligence API smoke + contract tests.
 *
 * These tests exercise the new /api/intelligence/* routes through the running
 * Next.js server. They rely on the in-memory demo store fallback that the
 * intelligence stack ships with, so they pass without DATABASE_URL or any
 * external API keys (Anthropic/LME/Fastmarkets) configured.
 *
 * Auth model: most routes accept a user_id either via Bearer JWT or via the
 * `x-matex-user-id` header. We use the header for predictable test isolation
 * (each test gets a unique user id).
 */

const SAMPLE_USER = `intel-${Date.now()}@matex-qa.com`;
const SAMPLE_USER_ID = `intel-user-${Date.now()}`;

function authHeaders(userId = SAMPLE_USER_ID): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-matex-user-id": userId,
  };
}

async function expectJson<T = Record<string, unknown>>(res: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  expect(res.status(), `unexpected status from ${res.url()}`).toBeLessThan(500);
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new Error(`Response was not JSON (${res.status()}): ${text.slice(0, 200)}`);
  }
}

test.describe("Intelligence API", () => {
  test("INTEL-API-01: GET /api/intelligence/summary returns the snapshot list", async ({ request }) => {
    const res = await request.get("/api/intelligence/summary");
    const body = await expectJson<{ snapshots: Array<Record<string, unknown>> }>(res);
    expect(Array.isArray(body.snapshots)).toBe(true);
    expect(body.snapshots.length).toBeGreaterThan(0);
    const first = body.snapshots[0]!;
    for (const k of [
      "material_key",
      "material_label",
      "snapshot_date",
      "trend",
      "demand",
      "recommendation",
    ]) {
      expect(first, `snapshot missing field ${k}`).toHaveProperty(k);
    }
    // Trend / demand / recommendation should be drawn from a known vocabulary.
    expect(["up", "down", "stable"]).toContain(first.trend);
    expect(["low", "medium", "high"]).toContain(first.demand);
    expect(["buy", "hold", "sell"]).toContain(first.recommendation);
  });

  test("INTEL-API-02: GET /api/intelligence/summary/[material] returns latest + 30-day history", async ({ request }) => {
    const res = await request.get("/api/intelligence/summary/copper_2");
    const body = await expectJson<{
      material: { key: string; label: string; unit: string };
      latest: Record<string, unknown> | null;
      history: Array<Record<string, unknown>>;
    }>(res);
    expect(body.material.key).toBe("copper_2");
    expect(body.latest).toBeTruthy();
    expect(Array.isArray(body.history)).toBe(true);
    // History sorted oldest → newest.
    if (body.history.length > 1) {
      const dates = body.history.map((h) => String(h.snapshot_date));
      const sorted = [...dates].sort();
      expect(dates).toEqual(sorted);
    }
  });

  test("INTEL-API-03: GET /api/intelligence/summary/[material] 404s for an unknown key", async ({ request }) => {
    const res = await request.get("/api/intelligence/summary/not_a_real_material");
    expect(res.status()).toBe(404);
    const body = await expectJson<{ error: string }>(res);
    expect(body.error).toBe("unknown_material");
  });

  test("INTEL-API-04: POST /api/intelligence/recommend-price returns a usable recommendation", async ({ request }) => {
    const res = await request.post("/api/intelligence/recommend-price", {
      headers: authHeaders(`${SAMPLE_USER_ID}-rec`),
      data: {
        material_key: "copper_2",
        quantity: 50,
        unit: "mt",
        seller_region: "Ontario",
      },
    });
    const body = await expectJson<{
      recommendation: {
        recommended_price: number;
        floor_price: number;
        ceiling_price: number;
        rationale: string | null;
        confidence: number | null;
      };
      ai: { configured: boolean; source: string };
    }>(res);
    expect(body.recommendation.recommended_price).toBeGreaterThan(0);
    expect(body.recommendation.floor_price).toBeLessThanOrEqual(body.recommendation.recommended_price);
    expect(body.recommendation.ceiling_price).toBeGreaterThanOrEqual(body.recommendation.recommended_price);
    expect(["live", "stub"]).toContain(body.ai.source);
  });

  test("INTEL-API-05: POST /api/intelligence/recommend-price 400s without a material", async ({ request }) => {
    const res = await request.post("/api/intelligence/recommend-price", {
      headers: authHeaders(),
      data: { quantity: 10 },
    });
    expect(res.status()).toBe(400);
    const body = await expectJson<{ error: string }>(res);
    expect(body.error).toBe("material_required");
  });

  test("INTEL-API-06: GET /api/intelligence/listing/[id]/metrics lazily provisions a row", async ({ request }) => {
    const listingId = `listing-${Date.now()}`;
    const res = await request.get(`/api/intelligence/listing/${listingId}/metrics`);
    const body = await expectJson<{ metrics: Record<string, unknown> }>(res);
    expect(body.metrics.listing_id).toBe(listingId);
    for (const k of ["views_total", "views_24h", "watchers", "bid_count", "ai_status_label"]) {
      expect(body.metrics, `metrics missing field ${k}`).toHaveProperty(k);
    }
  });

  test("INTEL-API-07: POST /api/intelligence/listing/[id]/metrics recomputes against an asking price", async ({ request }) => {
    const listingId = `listing-${Date.now()}-recompute`;
    const res = await request.post(`/api/intelligence/listing/${listingId}/metrics`, {
      headers: { "content-type": "application/json" },
      data: { material_key: "copper_2", asking_price: 5000 },
    });
    const body = await expectJson<{ metrics: Record<string, unknown> }>(res);
    expect(body.metrics.asking_price).toBe(5000);
    expect(body.metrics.material_key).toBe("copper_2");
    expect(body.metrics.benchmark_avg).not.toBeNull();
    expect(typeof body.metrics.benchmark_delta_pct === "number" || body.metrics.benchmark_delta_pct === null).toBe(true);
  });

  test("INTEL-API-08: GET /api/intelligence/alerts requires a user", async ({ request }) => {
    const res = await request.get("/api/intelligence/alerts");
    expect(res.status()).toBe(401);
    const body = await expectJson<{ error: string }>(res);
    expect(body.error).toBe("unauthenticated");
  });

  test("INTEL-API-09: alerts CRUD lifecycle (create → list → pause → delete)", async ({ request }) => {
    const userId = `alerts-user-${Date.now()}`;
    const headers = authHeaders(userId);

    // Create.
    const createRes = await request.post("/api/intelligence/alerts", {
      headers,
      data: {
        material_key: "copper_2",
        alert_type: "price_below",
        threshold: 4500,
        channels: ["in_app"],
        note: "test alert",
      },
    });
    expect(createRes.status()).toBe(201);
    const created = (await createRes.json()) as { alert: { alert_id: string; status: string } };
    expect(created.alert.alert_id).toBeTruthy();
    expect(created.alert.status).toBe("active");

    // List.
    const listRes = await request.get("/api/intelligence/alerts", { headers });
    const list = (await listRes.json()) as { alerts: Array<{ alert_id: string }> };
    expect(list.alerts.some((a) => a.alert_id === created.alert.alert_id)).toBe(true);

    // Pause.
    const patchRes = await request.patch(`/api/intelligence/alerts/${created.alert.alert_id}`, {
      headers,
      data: { status: "paused" },
    });
    const patched = (await patchRes.json()) as { alert: { status: string } };
    expect(patched.alert.status).toBe("paused");

    // Delete.
    const delRes = await request.delete(`/api/intelligence/alerts/${created.alert.alert_id}`, {
      headers,
    });
    expect(delRes.status()).toBe(200);

    // Confirm gone.
    const afterDelete = await request.get("/api/intelligence/alerts", { headers });
    const remaining = (await afterDelete.json()) as { alerts: Array<{ alert_id: string }> };
    expect(remaining.alerts.find((a) => a.alert_id === created.alert.alert_id)).toBeUndefined();
  });

  test("INTEL-API-10: POST /api/intelligence/alerts validates the payload", async ({ request }) => {
    const headers = authHeaders(`alerts-validation-${Date.now()}`);

    // Unknown material.
    let res = await request.post("/api/intelligence/alerts", {
      headers,
      data: { material_key: "nope", alert_type: "price_below", threshold: 1 },
    });
    expect(res.status()).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("unknown_material");

    // Invalid alert_type.
    res = await request.post("/api/intelligence/alerts", {
      headers,
      data: { material_key: "copper_2", alert_type: "moonshot", threshold: 1 },
    });
    expect(res.status()).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_alert_type");

    // Threshold required for price_below.
    res = await request.post("/api/intelligence/alerts", {
      headers,
      data: { material_key: "copper_2", alert_type: "price_below" },
    });
    expect(res.status()).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("threshold_required");
  });

  test("INTEL-API-11: POST /api/intelligence/run-daily is hidden without INTELLIGENCE_DEBUG_TOKEN", async ({ request }) => {
    // Without the env var (default for tests), the route returns 404 to hide
    // its existence. We can't easily flip env vars per-test, so we just assert
    // the safe-default behaviour.
    const res = await request.post("/api/intelligence/run-daily", { data: {} });
    // 404 (no token configured) or 403 (token configured but not provided) are
    // both acceptable safe states; either way, the pipeline didn't run.
    expect([403, 404]).toContain(res.status());
  });
});
