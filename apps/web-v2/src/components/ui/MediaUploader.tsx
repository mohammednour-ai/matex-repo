"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, X, FileVideo } from "lucide-react";
import clsx from "clsx";
import { Spinner } from "@/components/ui/shadcn/spinner";
import { callTool } from "@/lib/api";

type UploadedFile = {
  id: string;
  file: File;
  preview?: string;
  publicUrl?: string;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  errorMsg?: string;
};

type MediaUploaderProps = {
  /** Required for listing photos: MCP presign + DB merge use this id. */
  listingId?: string;
  onUploadComplete?: (urls: string[]) => void;
  maxFiles?: number;
  className?: string;
};

const ACCEPTED_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
};

function layersFromMcpData(data: unknown): Record<string, unknown>[] {
  const layers: Record<string, unknown>[] = [];
  if (!data || typeof data !== "object") return layers;
  const d = data as Record<string, unknown>;
  layers.push(d);
  const ur = d.upstream_response;
  if (ur && typeof ur === "object") {
    const u = ur as Record<string, unknown>;
    layers.push(u);
    const inner = u.data;
    if (inner && typeof inner === "object") layers.push(inner as Record<string, unknown>);
  }
  return layers;
}

function resolveAbsoluteUploadUrl(url: string): string {
  if (url.startsWith("/") && typeof window !== "undefined") {
    return `${window.location.origin}${url}`;
  }
  return url;
}

type UploadPlan =
  | { kind: "noop"; publicUrl: string }
  | { kind: "put"; uploadUrl: string; publicUrl: string; headers?: Record<string, string> };

function parseUploadPlan(data: unknown): UploadPlan | null {
  const layers = layersFromMcpData(data);
  for (const L of layers) {
    if (L.skip_client_put && typeof L.public_url === "string" && L.public_url.length > 0) {
      return { kind: "noop", publicUrl: L.public_url };
    }
  }
  for (const L of layers) {
    const uploadRaw = (L.signed_url ?? L.upload_url) as unknown;
    const pubRaw = (L.public_url ?? L.url) as unknown;
    if (typeof uploadRaw === "string" && uploadRaw.length > 0 && typeof pubRaw === "string" && pubRaw.length > 0) {
      const headers = L.headers;
      const headerObj =
        headers && typeof headers === "object" && !Array.isArray(headers)
          ? (headers as Record<string, string>)
          : undefined;
      return {
        kind: "put",
        uploadUrl: resolveAbsoluteUploadUrl(uploadRaw),
        publicUrl: pubRaw,
        headers: headerObj,
      };
    }
  }
  return null;
}

async function persistListingImageUrl(listingId: string, publicUrl: string): Promise<void> {
  const persist = await callTool("listing.upload_images", {
    listing_id: listingId,
    urls: [publicUrl],
  });
  if (!persist.success) {
    throw new Error(persist.error?.message ?? "Failed to save image on listing");
  }
}

async function uploadFile(
  file: File,
  listingId: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  // Posts the file to the Next.js /api/upload proxy. The proxy uses the
  // supabase-js SDK server-side because Supabase Storage's PUT endpoint
  // rejects the new `sb_secret_*` API key format ("Invalid Compact JWS"),
  // and we'd previously been handing the service-role key to the browser —
  // both a functional and security problem.
  const fd = new FormData();
  fd.append("file", file);
  fd.append("listing_id", listingId);
  const publicUrl = await new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText) as { public_url?: string; error?: string };
          if (body.public_url) return resolve(body.public_url);
          return reject(new Error(body.error ?? "Upload succeeded but no public_url returned"));
        } catch {
          return reject(new Error("Upload response was not valid JSON"));
        }
      }
      try {
        const body = JSON.parse(xhr.responseText) as { error?: string };
        reject(new Error(body.error ?? `Upload failed (${xhr.status})`));
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.open("POST", "/api/upload");
    xhr.send(fd);
  });
  await persistListingImageUrl(listingId, publicUrl);
  return publicUrl;
}

export function MediaUploader({
  listingId,
  onUploadComplete,
  maxFiles = 10,
  className,
}: MediaUploaderProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);

  const updateFile = (id: string, patch: Partial<UploadedFile>) =>
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const startUpload = useCallback(
    async (entry: UploadedFile) => {
      if (!listingId) {
        updateFile(entry.id, {
          status: "error",
          errorMsg: "Save step 1 first (draft listing id required).",
        });
        return;
      }
      updateFile(entry.id, { status: "uploading", progress: 0 });
      try {
        const url = await uploadFile(entry.file, listingId, (pct) => updateFile(entry.id, { progress: pct }));
        updateFile(entry.id, { status: "done", progress: 100, publicUrl: url });
        setFiles((prev) => {
          const next = prev.map((f) =>
            f.id === entry.id ? { ...f, status: "done" as const, progress: 100, publicUrl: url } : f,
          );
          const done = next
            .filter((f) => f.status === "done" && f.publicUrl)
            .map((f) => f.publicUrl as string);
          onUploadComplete?.(done);
          return next;
        });
        return url;
      } catch (e) {
        updateFile(entry.id, {
          status: "error",
          errorMsg: e instanceof Error ? e.message : "Upload failed",
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listingId, onUploadComplete],
  );

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (!listingId) return;
      const remaining = maxFiles - files.length;
      const toAdd = accepted.slice(0, remaining).map<UploadedFile>((file) => ({
        id: `${Date.now()}-${Math.random()}`,
        file,
        preview: file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined,
        progress: 0,
        status: "pending",
      }));
      setFiles((prev) => [...prev, ...toAdd]);
      toAdd.forEach((entry) => startUpload(entry));
    },
    [files.length, listingId, maxFiles, startUpload],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles,
    disabled: !listingId || files.length >= maxFiles,
  });

  const remove = (id: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((f) => f.id !== id);
    });
  };

  const blocked = !listingId;

  return (
    <div className={clsx("flex flex-col gap-3", className)}>
      {blocked && (
        <p className="text-xs text-warning-400 bg-warning-500/10 border border-amber-100 rounded-lg px-3 py-2">
          Complete step 1 and use <strong>Next</strong> (or <strong>Save as draft</strong>) so a draft listing exists before uploading photos.
        </p>
      )}
      <div
        {...getRootProps()}
        className={clsx(
          "flex flex-col items-center justify-center rounded-xl border-2 border-dashed",
          "px-6 py-8 transition-colors duration-150",
          blocked || files.length >= maxFiles
            ? "border-line bg-canvas cursor-not-allowed"
            : isDragActive
            ? "border-blue-400 bg-brand-500/10 cursor-pointer"
            : "border-line-strong bg-surfaceBg cursor-pointer hover:border-orange-400 hover:bg-brand-500/50",
        )}
      >
        <input {...getInputProps()} />
        <UploadCloud className="h-8 w-8 text-fg-subtle mb-2" />
        <p className="text-sm font-medium text-fg-muted">
          {blocked ? "Upload locked until draft exists" : isDragActive ? "Drop files here" : "Drag & drop or click to upload"}
        </p>
        <p className="text-xs text-fg-subtle mt-1">
          JPG, PNG, WebP, MP4, MOV · Up to {maxFiles} files
        </p>
      </div>

      {files.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((entry) => (
            <li
              key={entry.id}
              className="relative rounded-lg overflow-hidden border border-line bg-canvas aspect-square"
            >
              {entry.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={entry.preview}
                  alt={entry.file.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center w-full h-full gap-1 p-2">
                  <FileVideo className="h-6 w-6 text-fg-subtle" />
                  <p className="text-[10px] text-fg-subtle text-center leading-tight line-clamp-2">
                    {entry.file.name}
                  </p>
                </div>
              )}

              {entry.status === "uploading" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 gap-1">
                  <Spinner className="w-5 h-5 text-white" />
                  <span className="text-white text-xs font-medium">
                    {entry.progress}%
                  </span>
                </div>
              )}

              {entry.status === "error" && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-500/80">
                  <p className="text-white text-[10px] px-1 text-center">
                    {entry.errorMsg ?? "Error"}
                  </p>
                </div>
              )}

              {entry.status === "done" && (
                <div className="absolute bottom-1 right-1 h-4 w-4 rounded-full bg-emerald-500 flex items-center justify-center">
                  <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 text-white fill-none stroke-current stroke-2">
                    <path d="M2 5l2.5 2.5L8 3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}

              <button
                onClick={() => remove(entry.id)}
                aria-label="Remove file"
                className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
