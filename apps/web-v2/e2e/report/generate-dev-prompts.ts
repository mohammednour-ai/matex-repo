import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

type Attachment = {
  name: string;
  path?: string;
};

type ExtractedTest = {
  title: string;
  file: string;
  project: string;
  status: "passed" | "failed" | "skipped" | "timedOut" | "flaky";
  duration: number;
  errorMessage?: string;
  attachments: Attachment[];
};

type PlaywrightReport = {
  suites: Array<{
    title: string;
    file: string;
    suites?: Array<{
      title: string;
      specs?: Array<{
        title: string;
        tests: Array<{
          projectName?: string;
          status: string;
          duration: number;
          results: Array<{
            status: string;
            duration: number;
            error?: { message?: string };
            attachments?: Attachment[];
          }>;
        }>;
      }>;
    }>;
    specs?: Array<{
      title: string;
      tests: Array<{
        projectName?: string;
        status: string;
        duration: number;
        results: Array<{
          status: string;
          duration: number;
          error?: { message?: string };
          attachments?: Attachment[];
        }>;
      }>;
    }>;
  }>;
};

type RouteHint = {
  route: string;
  likelyFiles: string[];
  fixDirection: string;
};

function extractTests(report: PlaywrightReport): ExtractedTest[] {
  const tests: ExtractedTest[] = [];

  const collectSpecs = (
    file: string,
    suiteTitle: string,
    specs?: Array<{
      title: string;
      tests: Array<{
        projectName?: string;
        status: string;
        duration: number;
        results: Array<{
          status: string;
          duration: number;
          error?: { message?: string };
          attachments?: Attachment[];
        }>;
      }>;
    }>,
  ) => {
    if (!specs) return;

    for (const spec of specs) {
      const test = spec.tests[0];
      const results = test?.results ?? [];
      const firstFailure = results.find(
        (result) => result.status === "failed" || result.status === "timedOut",
      );
      const finalResult = results[results.length - 1];
      const resolvedStatus = (test?.status ?? finalResult?.status ?? "skipped") as ExtractedTest["status"];
      tests.push({
        title: spec.title,
        file,
        project: test?.projectName ?? suiteTitle,
        status: resolvedStatus,
        duration: finalResult?.duration ?? test?.duration ?? 0,
        errorMessage: firstFailure?.error?.message ?? finalResult?.error?.message,
        attachments: firstFailure?.attachments ?? finalResult?.attachments ?? [],
      });
    }
  };

  for (const suite of report.suites) {
    collectSpecs(suite.file, suite.title, suite.specs);
    for (const nestedSuite of suite.suites ?? []) {
      collectSpecs(suite.file, nestedSuite.title || suite.title, nestedSuite.specs);
    }
  }

  return tests;
}

function inferRouteHint(test: ExtractedTest): RouteHint {
  const source = `${test.title} ${test.file}`.toLowerCase();

  if (source.includes("auth") || source.includes("login")) {
    return {
      route: "/login",
      likelyFiles: [
        "apps/web-v2/src/app/(auth)/login/page.tsx",
        "apps/web-v2/src/app/(app)/layout.tsx",
      ],
      fixDirection: "Restore the intended auth entry flow, validation, and redirect behavior without breaking session persistence.",
    };
  }

  if (source.includes("dashboard")) {
    return {
      route: "/dashboard",
      likelyFiles: [
        "apps/web-v2/src/app/(app)/dashboard/page.tsx",
        "apps/web-v2/src/app/(app)/layout.tsx",
      ],
      fixDirection: "Restore the visible dashboard state and loading behavior without regressing sidebar or route guard behavior.",
    };
  }

  if (source.includes("listing")) {
    return {
      route: "/listings",
      likelyFiles: [
        "apps/web-v2/src/app/(app)/listings/page.tsx",
        "apps/web-v2/src/app/(app)/listings/create/page.tsx",
        "apps/web-v2/src/app/(app)/listings/[id]/page.tsx",
      ],
      fixDirection: "Restore the listing workflow or listing detail behavior while keeping the multi-step create flow stable.",
    };
  }

  if (source.includes("search")) {
    return {
      route: "/search",
      likelyFiles: [
        "apps/web-v2/src/app/(app)/search/page.tsx",
        "apps/web-v2/src/components",
      ],
      fixDirection: "Restore search visibility, filtering, or result rendering without regressing saved-search interactions.",
    };
  }

  if (source.includes("auction")) {
    return {
      route: "/auction",
      likelyFiles: [
        "apps/web-v2/src/app/(app)/auction/page.tsx",
        "apps/web-v2/src/app/(app)/auction/[id]/page.tsx",
      ],
      fixDirection: "Restore auction list or room behavior, especially bid interactions and state transitions.",
    };
  }

  if (source.includes("messag")) {
    return {
      route: "/messages",
      likelyFiles: [
        "apps/web-v2/src/app/(app)/messages/page.tsx",
        "apps/web-v2/src/app/(app)/listings/[id]/page.tsx",
      ],
      fixDirection: "Restore messaging thread creation or conversation rendering without breaking listing-linked navigation.",
    };
  }

  if (source.includes("checkout")) {
    return {
      route: "/checkout",
      likelyFiles: ["apps/web-v2/src/app/(app)/checkout/page.tsx"],
      fixDirection: "Restore checkout review and payment-option behavior while keeping totals and tax display consistent.",
    };
  }

  if (source.includes("escrow")) {
    return {
      route: "/escrow",
      likelyFiles: [
        "apps/web-v2/src/app/(app)/escrow/page.tsx",
        "apps/web-v2/src/app/(app)/escrow/create/page.tsx",
      ],
      fixDirection: "Restore escrow list or escrow action behavior without regressing status transitions.",
    };
  }

  if (source.includes("logistics")) {
    return {
      route: "/logistics",
      likelyFiles: ["apps/web-v2/src/app/(app)/logistics/page.tsx"],
      fixDirection: "Restore logistics forms, quote rendering, or shipment actions without breaking validation feedback.",
    };
  }

  if (source.includes("inspection")) {
    return {
      route: "/inspection",
      likelyFiles: ["apps/web-v2/src/app/(app)/inspection/page.tsx"],
      fixDirection: "Restore inspection workflow behavior and related booking states on the inspection page.",
    };
  }

  if (source.includes("contract")) {
    return {
      route: "/contracts",
      likelyFiles: ["apps/web-v2/src/app/(app)/contracts/page.tsx"],
      fixDirection: "Restore contracts list, market widget, or signature workflow behavior without breaking linked transaction context.",
    };
  }

  if (source.includes("setting")) {
    return {
      route: "/settings",
      likelyFiles: ["apps/web-v2/src/app/(app)/settings/page.tsx"],
      fixDirection: "Restore the affected settings tab and persistence behavior without regressing adjacent tabs.",
    };
  }

  if (source.includes("copilot") || source.includes("chat")) {
    return {
      route: "/chat",
      likelyFiles: ["apps/web-v2/src/app/(app)/chat/page.tsx"],
      fixDirection: "Restore the chat interaction flow and visible conversation state without regressing suggestion chips or tool responses.",
    };
  }

  return {
    route: "unknown-route",
    likelyFiles: ["apps/web-v2/src/app", "apps/web-v2/src/components"],
    fixDirection: "Restore the intended user-visible behavior on the failing route without affecting adjacent flows.",
  };
}

function inferSeverity(test: ExtractedTest): "Critical" | "High" | "Medium" {
  const source = `${test.title} ${test.file}`.toLowerCase();

  if (test.status === "timedOut") return "Critical";
  if (test.status === "flaky") return "High";
  if (source.includes("smoke") || source.includes("regression")) return "High";
  if (source.includes("auth") || source.includes("checkout") || source.includes("escrow")) return "High";
  return "Medium";
}

function summarizeExpectedBehavior(title: string): string {
  const parts = title.split(":");
  if (parts.length > 1) {
    return parts.slice(1).join(":").trim();
  }
  return title.trim();
}

function summarizeActualBehavior(errorMessage?: string): string {
  if (!errorMessage) {
    return "The Playwright run reported a failure without a detailed assertion message.";
  }

  return errorMessage
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" ")
    .slice(0, 600);
}

function formatAttachments(attachments: Attachment[]): string[] {
  const visible = attachments.filter((attachment) => attachment.path);
  if (visible.length === 0) {
    return ["- No explicit attachment path was captured. Use the Playwright HTML report, trace, or failure screenshot if available."];
  }

  return visible.map((attachment) => `- ${attachment.name}: \`${attachment.path}\``);
}

function buildPrompt(test: ExtractedTest): string {
  const routeHint = inferRouteHint(test);
  const expected = summarizeExpectedBehavior(test.title);
  const actual = summarizeActualBehavior(test.errorMessage);
  const severity = inferSeverity(test);
  const evidenceLines = formatAttachments(test.attachments).join("\n");
  const likelyFiles = routeHint.likelyFiles.map((file) => `- \`${file}\``).join("\n");

  return [
    `## ${test.title}`,
    "",
    "```text",
    `Fix the failing UI behavior on ${routeHint.route} in \`apps/web-v2\`.`,
    "",
    `Case: ${test.title}`,
    "",
    "Environment:",
    "- UI: http://localhost:3002",
    "- Gateway: http://localhost:3001",
    `- Playwright scope: ${test.project} (${test.file})`,
    "",
    "Reproduction:",
    `1. Run the failing Playwright test that covers "${test.title}".`,
    `2. Open or navigate to ${routeHint.route}.`,
    "3. Repeat the user-visible interaction described by the test.",
    "4. Observe the failing assertion or broken UI state.",
    "",
    "Expected:",
    expected,
    "",
    "Actual:",
    actual,
    "",
    "Evidence:",
    evidenceLines,
    `- Failure duration: ${test.duration}ms`,
    `- Test status in latest run: ${test.status}`,
    "",
    "Likely files to inspect:",
    likelyFiles,
    "",
    "Fix goal:",
    routeHint.fixDirection,
    "",
    `Severity: ${severity}`,
    "```",
    "",
  ].join("\n");
}

function main() {
  const jsonPath = resolve(__dirname, "../../test-results/results.json");
  const outPath = resolve(__dirname, "DEV_FIX_PROMPTS.md");

  if (!existsSync(jsonPath)) {
    const placeholder = [
      "# Developer Fix Prompts",
      "",
      "No Playwright JSON results were found at `apps/web-v2/test-results/results.json`.",
      "",
      "Run a focused Playwright scope first, then rerun this generator:",
      "",
      "- `pnpm --filter @matex/web-v2 test:smoke`",
      "- `pnpm --filter @matex/web-v2 test:uiux`",
      "- `pnpm --filter @matex/web-v2 test:functional`",
      "",
      "After the test run, execute:",
      "",
      "- `pnpm --filter @matex/web-v2 test:dev-prompts`",
      "",
    ].join("\n");

    writeFileSync(outPath, placeholder, "utf-8");
    console.log(`Developer prompt template written to ${outPath}`);
    return;
  }

  const raw = readFileSync(jsonPath, "utf-8");
  const report = JSON.parse(raw) as PlaywrightReport;
  const failures = extractTests(report).filter(
    (test) => test.status === "failed" || test.status === "timedOut" || test.status === "flaky",
  );

  const lines: string[] = [];
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  lines.push("# Developer Fix Prompts");
  lines.push("");
  lines.push(`Generated: ${now}`);
  lines.push("");

  if (failures.length === 0) {
    lines.push("No failing Playwright tests were found in the latest JSON report.");
    lines.push("");
  } else {
    lines.push(`Failing tests found: ${failures.length}`);
    lines.push("");
    for (const failure of failures) {
      lines.push(buildPrompt(failure));
    }
  }

  writeFileSync(outPath, lines.join("\n"), "utf-8");
  console.log(`Developer fix prompts written to ${outPath}`);
  console.log(`  Failures converted: ${failures.length}`);
}

main();
