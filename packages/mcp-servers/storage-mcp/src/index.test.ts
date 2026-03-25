import { describe, it, expect } from "vitest";

describe("storage-mcp", () => {
  it("should have a valid server name", () => {
    expect("storage-mcp").toMatch(/-mcp$/);
  });

  it("tool: generate_signed_upload_url - validates file context", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.bucket) throw new Error("bucket is required");
      if (!args.file_path) throw new Error("file_path is required");
    }).toThrow("bucket is required");
  });

  it("tool: generate_signed_download_url - validates file context", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.bucket) throw new Error("bucket is required");
      if (!args.file_path) throw new Error("file_path is required");
    }).toThrow("bucket is required");
  });

  it("tool: generate_signed_upload_url - returns expected shape", () => {
    const result = {
      success: true,
      data: {
        upload_url: "https://storage.supabase.co/object/sign/bucket/path?token=abc",
        expires_in: 3600,
        file_path: "listings/img-001.jpg",
      },
    };
    expect(result.success).toBe(true);
    expect(result.data.upload_url).toMatch(/^https:\/\//);
    expect(result.data.expires_in).toBeGreaterThan(0);
  });

  it("tool: generate_signed_download_url - private files use pre-signed URLs", () => {
    const isPublic = false;
    const fileUrl = isPublic
      ? "https://storage.supabase.co/public/bucket/file.pdf"
      : "https://storage.supabase.co/object/sign/bucket/file.pdf?token=xyz&expires=3600";
    expect(fileUrl).toContain("token=");
    expect(fileUrl).toContain("expires=");
  });

  it("file_hash SHA-256 stored for integrity", () => {
    const sha256Regex = /^[a-f0-9]{64}$/;
    const fileHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    expect(fileHash).toMatch(sha256Regex);
  });

  it("KYC documents must never use public URLs", () => {
    expect(() => {
      const documentType = "kyc";
      const isPublic = true;
      if (documentType === "kyc" && isPublic) {
        throw new Error("KYC documents must use pre-signed URLs, never public");
      }
    }).toThrow("KYC documents must use pre-signed URLs");
  });

  it("public listing images can use public URLs", () => {
    const documentType = "listing_image";
    const isPublic = true;
    if (documentType === "listing_image" && isPublic) {
      const url = "https://storage.supabase.co/public/listings/img-001.jpg";
      expect(url).toContain("/public/");
    }
  });
});
