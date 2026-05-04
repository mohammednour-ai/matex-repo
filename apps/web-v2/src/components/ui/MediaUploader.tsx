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
  const res = await callTool("listing.upload_images", {
    listing_id: listingId,
    file_name: file.name,
    content_type: file.type || "application/octet-stream",
    size_bytes: file.size,
  });
  if (!res.success) {
    throw new Error(res.error?.message ?? "Failed to get upload URL");
  }
  const plan = parseUploadPlan(res.data);
  if (!plan) {
    throw new Error("Upload service did not return a usable upload plan (public_url / upload_url).");
  }

  if (plan.kind === "noop") {
    onProgress(100);
    await persistListingImageUrl(listingId, plan.publicUrl);
    return plan.publicUrl;
  }

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.open("PUT", plan.uploadUrl);
    if (plan.headers) {
      for (const [k, v] of Object.entries(plan.headers)) {
        if (v != null && v !== "") xhr.setRequestHeader(k, String(v));
      }
    } else {
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    }
    xhr.send(file);
  });

  await persistListingImageUrl(listingId, plan.publicUrl);
  return plan.publicUrl;
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
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Complete step 1 and use <strong>Next</strong> (or <strong>Save as draft</strong>) so a draft listing exists before uploading photos.
        </p>
      )}
      <div
        {...getRootProps()}
        className={clsx(
          "flex flex-col items-center justify-center rounded-xl border-2 border-dashed",
          "px-6 py-8 transition-colors duration-150",
          blocked || files.length >= maxFiles
            ? "border-sky-200 bg-sky-50 cursor-not-allowed"
            : isDragActive
            ? "border-blue-400 bg-blue-50 cursor-pointer"
            : "border-sky-300 bg-white cursor-pointer hover:border-orange-400 hover:bg-orange-50/50",
        )}
      >
        <input {...getInputProps()} />
        <UploadCloud className="h-8 w-8 text-sky-400 mb-2" />
        <p className="text-sm font-medium text-sky-700">
          {blocked ? "Upload locked until draft exists" : isDragActive ? "Drop files here" : "Drag & drop or click to upload"}
        </p>
        <p className="text-xs text-sky-400 mt-1">
          JPG, PNG, WebP, MP4, MOV · Up to {maxFiles} files
        </p>
      </div>

      {files.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((entry) => (
            <li
              key={entry.id}
              className="relative rounded-lg overflow-hidden border border-sky-200 bg-sky-50 aspect-square"
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
                  <FileVideo className="h-6 w-6 text-sky-400" />
                  <p className="text-[10px] text-sky-500 text-center leading-tight line-clamp-2">
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
