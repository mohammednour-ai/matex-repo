const target = String(process.env.VALIDATE_ENV_TARGET ?? "local").toLowerCase();
const profile = String(process.env.VALIDATE_ENV_PROFILE ?? "full").toLowerCase();

const profiles = {
  gateway: {
    required: ["JWT_SECRET", "MCP_DOMAIN_ENDPOINTS_JSON"],
    recommended: ["REDIS_URL", "MCP_GATEWAY_URL", "NEXT_PUBLIC_GATEWAY_URL", "SENTRY_DSN"],
  },
  web: {
    required: ["MCP_GATEWAY_URL"],
    recommended: ["NEXT_PUBLIC_GATEWAY_URL", "NEXT_PUBLIC_APP_URL", "SENTRY_DSN"],
  },
  adapters: {
    required: ["DATABASE_URL", "JWT_SECRET"],
    recommended: ["REDIS_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SENTRY_DSN"],
  },
  full: {
    required: ["DATABASE_URL", "JWT_SECRET", "MCP_GATEWAY_URL"],
    recommended: [
      "REDIS_URL",
      "MCP_DOMAIN_ENDPOINTS_JSON",
      "STRIPE_SECRET_KEY",
      "SENDGRID_API_KEY",
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_PHONE_NUMBER",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "NEXT_PUBLIC_APP_URL",
      "SENTRY_DSN",
    ],
  },
};

const chosen = profiles[profile] ?? profiles.full;
const required = [...chosen.required];
const recommended = [...chosen.recommended];

if (target === "production" && (profile === "gateway" || profile === "full")) {
  for (const key of ["REDIS_URL", "MCP_DOMAIN_ENDPOINTS_JSON"]) {
    if (!required.includes(key)) required.push(key);
  }
}

let hasErrors = false;

function printPresence(keys, label, isRequired) {
  console.log(`${label}:`);
  for (const key of keys) {
    const value = process.env[key];
    if (!value) {
      if (isRequired) {
        console.log(`  MISSING  ${key}`);
        hasErrors = true;
      } else {
        console.log(`  MISSING  ${key} (optional but recommended)`);
      }
    } else {
      console.log(`  OK       ${key} (${value.length} chars)`);
    }
  }
}

console.log(`Matex environment validation (target=${target}, profile=${profile})\n`);
printPresence(required, "Required", true);
console.log("");
printPresence(recommended, "Recommended", false);

const jwtSecret = process.env.JWT_SECRET;
if (jwtSecret === "dev-secret-change-me") {
  console.log("\n  WARNING  JWT_SECRET is the default dev value.");
  hasErrors = true;
} else if (jwtSecret && jwtSecret.length < 32) {
  console.log("\n  WARNING  JWT_SECRET is too short (min 32 chars recommended).");
}

const redisUrl = process.env.REDIS_URL?.trim();
if (redisUrl && !(redisUrl.startsWith("redis://") || redisUrl.startsWith("rediss://"))) {
  console.log("\n  WARNING  REDIS_URL should start with redis:// or rediss://");
  if (target === "production") hasErrors = true;
}

const gatewayUrl = process.env.MCP_GATEWAY_URL?.trim();
if (target === "production" && gatewayUrl && !gatewayUrl.startsWith("https://")) {
  console.log("\n  WARNING  MCP_GATEWAY_URL should be HTTPS in production.");
}

const routing = process.env.MCP_DOMAIN_ENDPOINTS_JSON?.trim();
if (routing) {
  try {
    const parsed = JSON.parse(routing);
    const mustHave = ["auth", "profile", "listing", "search", "payments", "escrow", "auction", "admin"];
    const missing = mustHave.filter((d) => !parsed[d]);
    if (missing.length > 0) {
      console.log(`\n  WARNING  MCP_DOMAIN_ENDPOINTS_JSON missing domains: ${missing.join(", ")}`);
      if (target === "production") hasErrors = true;
    }
  } catch {
    console.log("\n  WARNING  MCP_DOMAIN_ENDPOINTS_JSON is not valid JSON.");
    hasErrors = true;
  }
}

if (hasErrors) {
  console.log("\nFATAL: Environment validation failed.");
  process.exit(1);
}

console.log("\nAll required checks passed.");
