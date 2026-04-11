import {
  test as base,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const GATEWAY = "http://localhost:3001";
const BASE = "http://localhost:3002";

let emailCounter = 0;

function uniqueEmail(): string {
  emailCounter += 1;
  return `qa-${Date.now()}-${emailCounter}@matex-qa.com`;
}

type AuthContext = {
  userId: string;
  email: string;
  token: string;
};

async function registerAndLogin(page: Page): Promise<AuthContext> {
  const email = uniqueEmail();
  const password = "TestPassword123!";
  const phone = "+14165550199";

  const regRes = await page.request.post(`${BASE}/api/mcp`, {
    data: { tool: "auth.register", args: { email, phone, password, account_type: "both" } },
  });
  const regJson = await regRes.json();
  const userId = regJson.data?.user_id ?? "";

  const loginRes = await page.request.post(`${BASE}/api/mcp`, {
    data: { tool: "auth.login", args: { email, password } },
  });
  const loginJson = await loginRes.json();
  const token = loginJson.data?.tokens?.access_token ?? "";

  await page.addInitScript(
    ({ token: t, userId: u, email: e }) => {
      localStorage.setItem("matex_token", t);
      localStorage.setItem(
        "matex_user",
        JSON.stringify({ userId: u, email: e, accountType: "both" }),
      );
    },
    { token, userId, email },
  );

  return { userId, email, token };
}

type AuthFixtures = {
  auth: AuthContext;
};

export const authenticatedTest = base.extend<AuthFixtures>({
  auth: async ({ page }, use) => {
    const ctx = await registerAndLogin(page);
    await use(ctx);
  },
});

export async function seedAuth(page: Page): Promise<AuthContext> {
  return registerAndLogin(page);
}

export async function apiRegister(
  request: APIRequestContext,
): Promise<{ userId: string; email: string; token: string }> {
  const email = uniqueEmail();
  const password = "TestPassword123!";

  const regRes = await request.post(`${GATEWAY}/tool`, {
    data: { tool: "auth.register", args: { email, phone: "+14165550199", password, account_type: "both" } },
  });
  const regJson = await regRes.json();
  const userId = regJson.data?.user_id ?? "";

  const loginRes = await request.post(`${GATEWAY}/tool`, {
    data: { tool: "auth.login", args: { email, password } },
  });
  const loginJson = await loginRes.json();
  const token = loginJson.data?.tokens?.access_token ?? "";

  return { userId, email, token };
}
