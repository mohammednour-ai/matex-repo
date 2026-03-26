const required = [
  "DATABASE_URL",
  "JWT_SECRET",
];

const recommended = [
  "REDIS_URL",
  "STRIPE_SECRET_KEY",
  "SENDGRID_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SENTRY_DSN",
];

let hasErrors = false;

console.log("Matex environment validation (matexhub.ca)\n");

console.log("Required:");
for (const key of required) {
  const value = process.env[key];
  if (!value) {
    console.log(`  MISSING  ${key}`);
    hasErrors = true;
  } else {
    console.log(`  OK       ${key} (${value.length} chars)`);
  }
}

console.log("\nRecommended:");
for (const key of recommended) {
  const value = process.env[key];
  if (!value) {
    console.log(`  MISSING  ${key} (optional but recommended)`);
  } else {
    console.log(`  OK       ${key} (${value.length} chars)`);
  }
}

// JWT_SECRET strength check
const jwtSecret = process.env.JWT_SECRET;
if (jwtSecret === "dev-secret-change-me") {
  console.log("\n  WARNING  JWT_SECRET is the default dev value. Set a strong unique secret for production.");
  hasErrors = true;
} else if (jwtSecret && jwtSecret.length < 32) {
  console.log("\n  WARNING  JWT_SECRET is too short (min 32 chars recommended).");
}

if (hasErrors) {
  console.log("\nFATAL: Required environment variables are missing or insecure.");
  process.exit(1);
} else {
  console.log("\nAll required variables present.");
}
