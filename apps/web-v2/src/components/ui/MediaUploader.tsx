"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, X, FileVideo } from "lucide-react";
import clsx from "clsx";
import { Spinner } from "./Spinner";
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

type SignedUploadEnvelope = {
  signed_url?: string;
  public_url?: string;
  upload_url?: string;
  url?: string;
};

function extractSignedUpload(data: unknown): { signed_url: string; public_url: string } | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const candidates: SignedUploadEnvelope[] = [];
  candidates.push(root as SignedUploadEnvelope);
  const ur = root.upstream_response as Record<string, unknown> | undefined;
  if (ur && typeof ur === "object") {
    candidates.push(ur as SignedUploadEnvelope);
    const inner = ur.data as Record<string, unknown> | undefined;
    if (inner && typeof inner === "object") candidates.push(inner as SignedUploadEnvelope);
  }
  for (const c of candidates) {
    const signed = c.signed_url ?? c.upload_url;
    const pub = c.public_url ?? c.url;
    if (signed && pub) return { signed_url: signed, public_url: pub };
  }
  return null;
}

async function uploadFile(
  file: File,
  onProgress: (pct: number) => void,
): Promise<string> {
  const res = await callTool("listing.upload_images", {
    filename: file.name,
    content_type: file.type,
    size_bytes: file.size,
  });
  if (!res.success) {
    throw new Error(res.error?.message ?? "Failed to get upload URL");
  }
  const signed = extractSignedUpload(res.data);
  if (!signed) {
    throw new Error("Upload service did not return a signed URL");
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status < 300 ? resolve(signed.public_url) : reject(new Error("Upload failed"));
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.open("PUT", signed.signed_url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.send(file);
  });
}

export function MediaUploader({
  onUploadComplete,
  maxFiles = 10,
  className,
}: MediaUploaderProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);

  const updateFile = (id: string, patch: Partial<UploadedFile>) =>
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const startUpload = useCallback(
    async (entry: UploadedFile) => {
      updateFile(entry.id, { status: "uploading", progress: 0 });
      try {
        const url = await uploadFile(entry.file, (pct) =>
          updateFile(entry.id, { progress: pct })
        );
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
    [onUploadComplete]
  );

  const onDrop = useCallback(
    (accepted: File[]) => {
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
    [files.length, maxFiles, startUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles,
    disabled: files.length >= maxFiles,
  });

  const remove = (id: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((f) => f.id !== id);
    });
  };

  return (
    <div className={clsx("flex flex-col gap-3", className)}>
      <div
        {...getRootProps()}
        className={clsx(
          "flex flex-col items-center justify-center rounded-xl border-2 border-dashed",
          "px-6 py-8 cursor-pointer transition-colors duration-150",
          isDragActive
            ? "border-blue-400 bg-blue-50"
            : files.length >= maxFiles
            ? "border-slate-200 bg-slate-50 cursor-not-allowed"
            : "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/40"
        )}
      >
        <input {...getInputProps()} />
        <UploadCloud className="h-8 w-8 text-slate-400 mb-2" />
        <p className="text-sm font-medium text-slate-700">
          {isDragActive ? "Drop files here" : "Drag & drop or click to upload"}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          JPG, PNG, WebP, MP4, MOV · Up to {maxFiles} files
        </p>
      </div>

      {files.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((entry) => (
            <li
              key={entry.id}
              className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50 aspect-square"
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
                  <FileVideo className="h-6 w-6 text-slate-400" />
                  <p className="text-[10px] text-slate-500 text-center leading-tight line-clamp-2">
                    {entry.file.name}
                  </p>
                </div>
              )}

              {/* Progress overlay */}
              {entry.status === "uploading" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 gap-1">
                  <Spinner className="w-5 h-5 text-white" />
                  <span className="text-white text-xs font-medium">
                    {entry.progress}%
                  </span>
                </div>
              )}

              {/* Error overlay */}
              {entry.status === "error" && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-500/80">
                  <p className="text-white text-[10px] px-1 text-center">
                    {entry.errorMsg ?? "Error"}
                  </p>
                </div>
              )}

              {/* Done checkmark */}
              {entry.status === "done" && (
                <div className="absolute bottom-1 right-1 h-4 w-4 rounded-full bg-emerald-500 flex items-center justify-center">
                  <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 text-white fill-none stroke-current stroke-2">
                    <path d="M2 5l2.5 2.5L8 3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}

              {/* Remove button */}
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
