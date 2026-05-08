// Storage parity fixtures — read-only / signed-URL only, no DB mutation.

import type { ParityFixture } from "../runner.ts";

export function storageFixtures(_env: { userId: string; rw: boolean }): ParityFixture[] {
  return [
    { name: "ping", tool: "storage.ping", args: {} },
    {
      name: "generate_signed_upload_url missing path",
      tool: "storage.generate_signed_upload_url",
      args: {},
      expectError: true,
    },
    {
      name: "generate_signed_download_url missing path",
      tool: "storage.generate_signed_download_url",
      args: {},
      expectError: true,
    },
  ];
}
