import { FileText, Download, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/cn";

type InspectionReportSectionProps = {
  reportUrl?: string | null;
  inspectorName?: string | null;
  inspectedAt?: string | null;
  inspectionRequired: boolean;
  className?: string;
};

/**
 * Renders a download link for the third-party inspection PDF when the seller
 * (or the inspector) has uploaded one. Otherwise surfaces a placeholder that
 * tells the buyer whether an inspection is mandatory and how to arrange it
 * via the side-rail booking widget.
 */
export function InspectionReportSection({
  reportUrl,
  inspectorName,
  inspectedAt,
  inspectionRequired,
  className,
}: InspectionReportSectionProps) {
  const hasReport = Boolean(reportUrl);

  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-4 space-y-3",
        hasReport ? "border-emerald-200" : "border-steel-200",
        className,
      )}
    >
      <h3 className="font-semibold text-steel-900 text-sm flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-brand-600" />
        Inspection report
      </h3>

      {hasReport ? (
        <>
          <a
            href={reportUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center justify-between gap-3 rounded-lg border border-emerald-200",
              "bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800",
              "hover:bg-emerald-100 transition-colors",
            )}
          >
            <span className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate font-medium">
                Independent inspection report (PDF)
              </span>
            </span>
            <Download className="h-4 w-4 shrink-0" />
          </a>
          {(inspectorName || inspectedAt) && (
            <p className="text-xs text-steel-600">
              {inspectorName && <>Inspector: <span className="font-medium text-steel-700">{inspectorName}</span></>}
              {inspectorName && inspectedAt && " · "}
              {inspectedAt && (
                <>
                  Issued{" "}
                  {new Date(inspectedAt).toLocaleDateString("en-CA", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </>
              )}
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-steel-600">
          {inspectionRequired
            ? "An independent inspection is required before escrow releases on this listing. Use the booking widget in the side rail to schedule one — the resulting PDF will appear here once the inspector files it."
            : "No inspection report has been uploaded for this listing. You can still book a third-party inspection via the side-rail widget; the PDF will appear here when ready."}
        </p>
      )}
    </div>
  );
}
