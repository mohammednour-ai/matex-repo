"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";
import { Download } from "lucide-react";

export type ListingsTableRow = {
  listing_id: string;
  title: string;
  sale_mode: "fixed" | "bidding" | "auction";
  status: "draft" | "active" | "sold" | "ended" | "archived";
  asking_price?: number;
  starting_bid?: number;
  reserve_price?: number;
  category?: string;
  quantity?: number;
  unit?: string;
  view_count: number;
  bids_count: number;
  created_at: string;
  updated_at?: string;
};

function formatPrice(row: ListingsTableRow): string {
  const price = row.asking_price ?? row.starting_bid ?? row.reserve_price;
  if (!price) return "—";
  return `$${price.toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function csvEscape(value: string | number | undefined): string {
  if (value === undefined || value === null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function exportCsv(rows: ListingsTableRow[]): void {
  const header = [
    "listing_id",
    "title",
    "sale_mode",
    "status",
    "category",
    "quantity",
    "unit",
    "price_cad",
    "view_count",
    "bids_count",
    "created_at",
  ];
  const body = rows.map((r) =>
    [
      r.listing_id,
      r.title,
      r.sale_mode,
      r.status,
      r.category,
      r.quantity,
      r.unit,
      r.asking_price ?? r.starting_bid ?? r.reserve_price ?? "",
      r.view_count,
      r.bids_count,
      r.created_at,
    ]
      .map(csvEscape)
      .join(","),
  );
  const csv = [header.join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `matex-listings-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const columns: ColumnDef<ListingsTableRow>[] = [
  { accessorKey: "title", header: "Title", cell: (i) => <span className="font-medium text-steel-900">{i.getValue() as string}</span> },
  { accessorKey: "category", header: "Category", cell: (i) => (i.getValue() as string) ?? "—" },
  {
    accessorKey: "sale_mode",
    header: "Sale mode",
    cell: (i) => <span className="capitalize">{i.getValue() as string}</span>,
  },
  { accessorKey: "status", header: "Status", cell: (i) => <span className="capitalize">{i.getValue() as string}</span> },
  {
    id: "price",
    header: "Price",
    accessorFn: (row) => row.asking_price ?? row.starting_bid ?? row.reserve_price ?? 0,
    cell: (i) => formatPrice(i.row.original),
  },
  {
    accessorKey: "quantity",
    header: "Qty",
    cell: (i) => {
      const r = i.row.original;
      const q = r.quantity;
      if (q === undefined || q === null) return "—";
      return `${q}${r.unit ? ` ${r.unit}` : ""}`;
    },
  },
  { accessorKey: "view_count", header: "Views" },
  { accessorKey: "bids_count", header: "Bids" },
  {
    accessorKey: "updated_at",
    header: "Updated",
    cell: (i) => formatDate((i.getValue() as string) ?? i.row.original.created_at),
  },
];

export function ListingsTable({ rows }: { rows: ListingsTableRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "updated_at", desc: true }]);
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-steel-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-steel-200 px-4 py-3">
        <p className="text-sm text-steel-600">
          {rows.length} listing{rows.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={() => exportCsv(rows)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-steel-200 bg-white px-3 py-1.5 text-xs font-semibold text-steel-700 hover:bg-steel-50"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-steel-50 text-left text-xs uppercase tracking-wide text-steel-500">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="cursor-pointer select-none px-4 py-3 font-semibold"
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    <span className="inline-flex items-center gap-1">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getIsSorted() === "asc"
                        ? " ▲"
                        : h.column.getIsSorted() === "desc"
                          ? " ▼"
                          : null}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-steel-100">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-steel-50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 text-steel-700">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
