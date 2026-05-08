import type { ParityFixture } from "../runner.ts";

export function esignFixtures(_env: { userId: string; rw: boolean }): ParityFixture[] {
  return [
    { name: "ping", tool: "esign.ping", args: {} },
    {
      name: "get_document not found",
      tool: "esign.get_document",
      args: { document_id: "00000000-0000-0000-0000-000000000000" },
      expectError: true,
    },
    {
      name: "create_document validation: missing signatories",
      tool: "esign.create_document",
      args: { template_type: "contract" },
      expectError: true,
    },
    {
      name: "verify_hash validation: missing hash",
      tool: "esign.verify_hash",
      args: { document_id: "00000000-0000-0000-0000-000000000000" },
      expectError: true,
    },
  ];
}
