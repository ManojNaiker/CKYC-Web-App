import { ChangeEvent, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Search,
  UploadCloud,
} from "lucide-react";
import {
  exportCkycCreateData,
  getListCkycCreateDataBatchesQueryKey,
  getListCkycCreateDataQueryKey,
  useImportCkycCreateData,
  useListCkycCreateData,
  useListCkycCreateDataBatches,
} from "@workspace/api-client-react";
import { EmptyState, PageIntro, QueryError } from "@/components/workspace-shell";

const PAGE_SIZE = 25;

function readAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

function cleanApiError(error: unknown) {
  if (!(error instanceof Error)) return "The CKYC Create file could not be imported.";
  return error.message.replace(/^HTTP \d+ [^:]+:\s*/, "");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "success" || normalized === "matched") {
    return "bg-[#e2f2e9] text-[#31734d]";
  }
  if (normalized.includes("partially") || normalized.includes("match")) {
    return "bg-[#e4eff8] text-[#386985]";
  }
  return "bg-[#fff1d6] text-[#9b6915]";
}

function reportStatusLabel(status: string) {
  if (status === "partially_matched") return "Partially matched";
  if (status === "matched") return "Matched";
  return "Unmatched";
}

export default function CkycCreateData() {
  const [selectedImportId, setSelectedImportId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [fileName, setFileName] = useState("");
  const [fileContentBase64, setFileContentBase64] = useState("");
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState(false);
  const [exporting, setExporting] = useState(false);

  const batchesQuery = useListCkycCreateDataBatches({
    query: { queryKey: getListCkycCreateDataBatchesQueryKey() },
  });
  const batches = batchesQuery.data ?? [];
  const selectedBatch = batches.find((batch) => batch.id === selectedImportId) ?? null;

  const queryParams = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: status || undefined,
      importId: selectedImportId ?? undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [page, search, selectedImportId, status],
  );
  const rowsQuery = useListCkycCreateData(queryParams, {
    query: {
      queryKey: getListCkycCreateDataQueryKey(queryParams),
      enabled: selectedImportId !== null,
    },
  });
  const importData = useImportCkycCreateData();
  const rows = rowsQuery.data?.items ?? [];
  const total = rowsQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFeedback("");
    setFeedbackError(false);
    try {
      setFileContentBase64(await readAsBase64(file));
    } catch (error) {
      setFileContentBase64("");
      setFeedback(error instanceof Error ? error.message : "Could not read the file.");
      setFeedbackError(true);
    }
  };

  const importFile = () => {
    if (!fileName || !fileContentBase64) {
      setFeedback("Choose an XLSX or CSV file first.");
      setFeedbackError(true);
      return;
    }
    importData.mutate(
      { data: { sourceFileName: fileName, fileContentBase64 } },
      {
        onSuccess: (result) => {
          const unmatched = result.unmatchedClientIds.length
            ? ` ${result.unmatchedClientIds.length} Client ID(s) were not found in the LMS register.`
            : "";
          setFeedback(
            `${result.imported.toLocaleString("en-IN")} row(s) stored from ${result.sourceFileName}.${result.skipped ? ` ${result.skipped} invalid row(s) skipped.` : ""}${unmatched}`,
          );
          setFeedbackError(false);
          setFileName("");
          setFileContentBase64("");
          setSelectedImportId(result.importId);
          setPage(1);
          setSearch("");
          setStatus("");
          void batchesQuery.refetch();
        },
        onError: (error) => {
          setFeedback(cleanApiError(error));
          setFeedbackError(true);
        },
      },
    );
  };

  const openBatch = (importId: number) => {
    setSelectedImportId(importId);
    setSearch("");
    setStatus("");
    setPage(1);
    setFeedback("");
  };

  const goBackToBatches = () => {
    setSelectedImportId(null);
    setSearch("");
    setStatus("");
    setPage(1);
  };

  const downloadReport = async () => {
    if (selectedImportId === null) return;
    setExporting(true);
    setFeedback("");
    try {
      const csv = await exportCkycCreateData({ importId: selectedImportId });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ckyc-create-batch-${selectedImportId}-report.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setFeedback("Batch report downloaded.");
      setFeedbackError(false);
    } catch (error) {
      setFeedback(cleanApiError(error));
      setFeedbackError(true);
    } finally {
      setExporting(false);
    }
  };

  const showing = total
    ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`
    : "0 rows";

  return (
    <div className="animate-fade">
      <PageIntro
        eyebrow="CKYC Create results"
        title="Create data by upload batch."
        description="Store each portal result file as its own batch, check how many rows matched the LMS register, and export a report for reconciliation."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <label
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-primary bg-card px-4 py-2.5 text-[12px] font-bold text-primary shadow-sm hover:bg-secondary"
              data-testid="input-ckyc-create-file"
            >
              <FileSpreadsheet size={15} />
              {fileName || "Choose result file"}
              <input
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="sr-only"
                onChange={chooseFile}
                data-testid="file-input-ckyc-create"
              />
            </label>
            <button
              type="button"
              onClick={importFile}
              disabled={importData.isPending || !fileContentBase64}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[12px] font-bold text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-45"
              data-testid="button-import-ckyc-create"
            >
              <UploadCloud size={15} />
              {importData.isPending ? "Saving…" : "Store file data"}
            </button>
          </div>
        }
      />

      {feedback && (
        <p
          className={`mb-5 text-[11px] ${feedbackError ? "text-destructive" : "text-[#31734d]"}`}
          role="status"
          data-testid="status-ckyc-create-import"
        >
          {feedback}
        </p>
      )}

      {selectedImportId === null ? (
        <BatchList
          batches={batches}
          isLoading={batchesQuery.isLoading}
          isError={batchesQuery.isError}
          onRetry={() => batchesQuery.refetch()}
          onOpen={openBatch}
        />
      ) : (
        <BatchDetail
          batch={selectedBatch}
          rows={rows}
          total={total}
          page={page}
          pageCount={pageCount}
          showing={showing}
          search={search}
          status={status}
          exporting={exporting}
          isLoading={rowsQuery.isLoading}
          isError={rowsQuery.isError}
          onBack={goBackToBatches}
          onExport={downloadReport}
          onRetry={() => rowsQuery.refetch()}
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
          onStatus={(value) => {
            setStatus(value);
            setPage(1);
          }}
          onPrevious={() => setPage((current) => current - 1)}
          onNext={() => setPage((current) => current + 1)}
        />
      )}
    </div>
  );
}

type Batch = {
  id: number;
  sourceFileName: string;
  uploadedCount: number;
  matchedCount: number;
  unmatchedCount: number;
  successCount: number;
  probableMatchCount: number;
  rejectCount: number;
  reportStatus: string;
  createdAt: string;
};

function BatchList({
  batches,
  isLoading,
  isError,
  onRetry,
  onOpen,
}: {
  batches: Batch[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onOpen: (id: number) => void;
}) {
  return (
    <>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <p className="classic-label">Upload batches</p>
          <p className="mt-2 font-display text-[25px] font-semibold">{batches.length.toLocaleString("en-IN")}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <p className="classic-label">Rows uploaded</p>
          <p className="mt-2 font-display text-[25px] font-semibold">
            {batches.reduce((sum, batch) => sum + batch.uploadedCount, 0).toLocaleString("en-IN")}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <p className="classic-label">Rows unmatched</p>
          <p className="mt-2 font-display text-[25px] font-semibold text-[#9b6915]">
            {batches.reduce((sum, batch) => sum + batch.unmatchedCount, 0).toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      {isError ? (
        <QueryError onRetry={onRetry} />
      ) : isLoading ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : !batches.length ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No CKYC Create batches yet"
          detail="Upload the portal CKYC Create XLSX or CSV file to create the first batch report."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <div className="overflow-x-auto">
            <table className="data-table w-full min-w-[980px] text-left">
              <thead className="bg-secondary/55">
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-5 py-3.5 font-medium">Upload batch</th>
                  <th className="px-4 py-3.5 font-medium">Uploaded</th>
                  <th className="px-4 py-3.5 font-medium">LMS match</th>
                  <th className="px-4 py-3.5 font-medium">Portal results</th>
                  <th className="px-4 py-3.5 font-medium">Report status</th>
                  <th className="px-4 py-3.5 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {batches.map((batch) => (
                  <tr key={batch.id} className="align-top transition-colors hover:bg-secondary/25" data-testid={`row-ckyc-create-batch-${batch.id}`}>
                    <td className="px-5 py-4">
                      <p className="max-w-[340px] truncate text-[12px] font-semibold" title={batch.sourceFileName}>{batch.sourceFileName}</p>
                      <p className="mt-1 font-mono-ui text-[9px] uppercase tracking-[.08em] text-muted-foreground">
                        Batch #{batch.id} · {formatDate(batch.createdAt)}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-display text-[19px] font-semibold">{batch.uploadedCount.toLocaleString("en-IN")}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">portal rows</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-[11px] font-semibold text-[#31734d]">{batch.matchedCount.toLocaleString("en-IN")} matched</p>
                      <p className="mt-1 text-[10px] text-[#9b6915]">{batch.unmatchedCount.toLocaleString("en-IN")} unmatched</p>
                    </td>
                    <td className="px-4 py-4 text-[10px] leading-5 text-muted-foreground">
                      <span className="text-[#31734d]">{batch.successCount} success</span>
                      {" · "}
                      <span>{batch.probableMatchCount} probable</span>
                      {" · "}
                      <span>{batch.rejectCount} reject</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2 py-1 font-mono-ui text-[9px] font-bold uppercase tracking-[.08em] ${statusClass(batch.reportStatus)}`}>
                        {reportStatusLabel(batch.reportStatus)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button type="button" onClick={() => onOpen(batch.id)} className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-foreground hover:bg-secondary" data-testid={`button-open-ckyc-create-batch-${batch.id}`}>
                        Open report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

type Row = {
  id: number;
  sourceFileName: string;
  refId: string;
  clientId: string;
  uploadedCkycNumber: string | null;
  referenceNumber: string | null;
  status: string;
  reason: string | null;
  clientName: string | null;
  finalCkycNumber: string | null;
  matchStatus: string;
};

function BatchDetail({
  batch,
  rows,
  total,
  page,
  pageCount,
  showing,
  search,
  status,
  exporting,
  isLoading,
  isError,
  onBack,
  onExport,
  onRetry,
  onSearch,
  onStatus,
  onPrevious,
  onNext,
}: {
  batch: Batch | null;
  rows: Row[];
  total: number;
  page: number;
  pageCount: number;
  showing: string;
  search: string;
  status: string;
  exporting: boolean;
  isLoading: boolean;
  isError: boolean;
  onBack: () => void;
  onExport: () => void;
  onRetry: () => void;
  onSearch: (value: string) => void;
  onStatus: (value: string) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 font-mono-ui text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground hover:text-primary" data-testid="button-back-ckyc-create-batches">
          <ArrowLeft size={14} /> All upload batches
        </button>
        <button type="button" onClick={onExport} disabled={exporting || !batch} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground shadow-sm hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-export-ckyc-create-report">
          <Download size={14} /> {exporting ? "Preparing…" : "Export checking report"}
        </button>
      </div>

      {batch && (
        <>
          <div className="mb-5">
            <p className="classic-label">Selected upload batch</p>
            <h3 className="mt-2 max-w-[800px] truncate font-display text-[24px] font-semibold" title={batch.sourceFileName}>{batch.sourceFileName}</h3>
            <p className="mt-1 font-mono-ui text-[10px] uppercase tracking-[.08em] text-muted-foreground">Batch #{batch.id} · uploaded {formatDate(batch.createdAt)}</p>
          </div>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Metric label="Uploaded" value={batch.uploadedCount} />
            <Metric label="Matched LMS" value={batch.matchedCount} tone="green" />
            <Metric label="Unmatched LMS" value={batch.unmatchedCount} tone="amber" />
            <Metric label="Success" value={batch.successCount} tone="green" />
            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <p className="classic-label">Report status</p>
              <span className={`mt-2 inline-flex rounded-full px-2 py-1 font-mono-ui text-[9px] font-bold uppercase tracking-[.08em] ${statusClass(batch.reportStatus)}`}>
                {reportStatusLabel(batch.reportStatus)}
              </span>
            </div>
          </div>
        </>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex max-w-[760px] flex-1 flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search Client ID, client name, ref ID or reference no"
              className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-4 text-[12px] outline-none placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
              data-testid="input-search-ckyc-create"
            />
          </div>
          <select
            value={status}
            onChange={(event) => onStatus(event.target.value)}
            className="h-11 rounded-lg border border-input bg-card px-3 text-[11px] font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            aria-label="Filter CKYC Create status"
            data-testid="select-ckyc-create-status"
          >
            <option value="">All portal statuses</option>
            <option value="success">success</option>
            <option value="probable_match">probable_match</option>
            <option value="short_confirmed_match">short_confirmed_match</option>
            <option value="short_reject">short_reject</option>
          </select>
        </div>
        <p className="font-mono-ui text-[10px] uppercase tracking-[.11em] text-muted-foreground">{showing}</p>
      </div>

      {isError ? (
        <QueryError onRetry={onRetry} />
      ) : isLoading ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          {[1, 2, 3, 4, 5].map((item) => <div key={item} className="h-12 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : !rows.length ? (
        <EmptyState
          icon={FileSpreadsheet}
          title={total ? "No rows match this filter" : "This batch has no rows"}
          detail={total ? "Try another Client ID, status or reference number." : "The uploaded batch did not contain viewable rows."}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <div className="overflow-x-auto">
            <table className="data-table w-full min-w-[1450px] text-left">
              <thead className="bg-secondary/55">
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-5 py-3.5 font-medium">Client ID</th>
                  <th className="px-4 py-3.5 font-medium">Client</th>
                  <th className="px-4 py-3.5 font-medium">Final CKYC</th>
                  <th className="px-4 py-3.5 font-medium">Uploaded CKYC No</th>
                  <th className="px-4 py-3.5 font-medium">Reference No</th>
                  <th className="px-4 py-3.5 font-medium">Portal status</th>
                  <th className="px-4 py-3.5 font-medium">Reason</th>
                  <th className="px-4 py-3.5 font-medium">Source file</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top transition-colors hover:bg-secondary/25" data-testid={`row-ckyc-create-${row.id}`}>
                    <td className="px-5 py-4">
                      <p className="font-mono-ui text-[11px] font-bold text-foreground">{row.clientId}</p>
                      <p className="mt-1 max-w-[235px] truncate font-mono-ui text-[9px] text-muted-foreground" title={row.refId}>{row.refId}</p>
                    </td>
                    <td className="px-4 py-4">
                      {row.clientName ? (
                        <>
                          <p className="text-[12px] font-semibold">{row.clientName}</p>
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#e2f2e9] px-2 py-1 font-mono-ui text-[9px] font-bold uppercase tracking-[.08em] text-[#31734d]"><CheckCircle2 size={11} /> Matched</span>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#fff1d6] px-2 py-1 font-mono-ui text-[9px] font-bold uppercase tracking-[.08em] text-[#9b6915]"><AlertTriangle size={11} /> Client not found</span>
                      )}
                    </td>
                    <td className="px-4 py-4 font-mono-ui text-[11px] font-semibold text-primary">{row.finalCkycNumber || "—"}</td>
                    <td className="px-4 py-4 font-mono-ui text-[11px]">{row.uploadedCkycNumber || "—"}</td>
                    <td className="px-4 py-4 font-mono-ui text-[11px]">{row.referenceNumber || "—"}</td>
                    <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2 py-1 font-mono-ui text-[9px] font-bold uppercase tracking-[.08em] ${statusClass(row.status)}`}>{row.status}</span></td>
                    <td className="max-w-[280px] px-4 py-4 text-[10px] leading-4 text-muted-foreground" title={row.reason ?? undefined}>{row.reason || "—"}</td>
                    <td className="max-w-[190px] px-4 py-4 truncate font-mono-ui text-[10px] text-muted-foreground" title={row.sourceFileName}>{row.sourceFileName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <p className="text-[11px] text-muted-foreground">Showing {showing}</p>
            <div className="flex items-center gap-1">
              <button disabled={page <= 1} onClick={onPrevious} className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground hover:bg-secondary disabled:opacity-30" aria-label="Previous page" data-testid="button-previous-ckyc-create-page">‹</button>
              <span className="px-2 font-mono-ui text-[10px] text-muted-foreground">{page} / {pageCount}</span>
              <button disabled={page >= pageCount} onClick={onNext} className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground hover:bg-secondary disabled:opacity-30" aria-label="Next page" data-testid="button-next-ckyc-create-page">›</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "green" | "amber" }) {
  const color = tone === "green" ? "text-[#31734d]" : tone === "amber" ? "text-[#9b6915]" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <p className="classic-label">{label}</p>
      <p className={`mt-2 font-display text-[25px] font-semibold ${color}`}>{value.toLocaleString("en-IN")}</p>
    </div>
  );
}