import { ChangeEvent, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Search,
  UploadCloud,
} from "lucide-react";
import {
  getListCkycCreateDataQueryKey,
  useImportCkycCreateData,
  useListCkycCreateData,
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

function statusClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "success") return "bg-[#e2f2e9] text-[#31734d]";
  if (normalized.includes("match")) return "bg-[#e4eff8] text-[#386985]";
  return "bg-[#fff1d6] text-[#9b6915]";
}

export default function CkycCreateData() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [fileName, setFileName] = useState("");
  const [fileContentBase64, setFileContentBase64] = useState("");
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState(false);

  const queryParams = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: status || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [page, search, status],
  );
  const query = useListCkycCreateData(queryParams, {
    query: { queryKey: getListCkycCreateDataQueryKey(queryParams) },
  });
  const importData = useImportCkycCreateData();
  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
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
          void query.refetch();
        },
        onError: (error) => {
          setFeedback(cleanApiError(error));
          setFeedbackError(true);
        },
      },
    );
  };

  const showing = total
    ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`
    : "0 rows";

  return (
    <div className="animate-fade">
      <PageIntro
        eyebrow="CKYC Create results"
        title="Create data by Client ID."
        description="Upload the portal result file to store every CKYC Create row. Each ref ID is decoded into a Client ID and matched with the LMS register so the final CKYC number and reference number are visible together."
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

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <p className="classic-label">Stored rows</p>
          <p className="mt-2 font-display text-[25px] font-semibold">{total.toLocaleString("en-IN")}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <p className="classic-label">Current page matched</p>
          <p className="mt-2 font-display text-[25px] font-semibold text-[#31734d]">
            {rows.filter((row) => row.matchStatus === "matched").length}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <p className="classic-label">Current page unmatched</p>
          <p className="mt-2 font-display text-[25px] font-semibold text-[#9b6915]">
            {rows.filter((row) => row.matchStatus === "unmatched").length}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex max-w-[760px] flex-1 flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search Client ID, client name, ref ID or reference no"
              className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-4 text-[12px] outline-none placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
              data-testid="input-search-ckyc-create"
            />
          </div>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
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

      {query.isError ? (
        <QueryError onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          {[1, 2, 3, 4, 5].map((item) => <div key={item} className="h-12 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : !rows.length ? (
        <EmptyState
          icon={FileSpreadsheet}
          title={total ? "No rows match this filter" : "No CKYC Create data yet"}
          detail={total ? "Try another Client ID, status or reference number." : "Upload the portal CKYC Create XLSX or CSV file to build the Client ID-wise view."}
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
              <button disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground hover:bg-secondary disabled:opacity-30" aria-label="Previous page" data-testid="button-previous-ckyc-create-page"><ChevronLeft size={15} /></button>
              <span className="px-2 font-mono-ui text-[10px] text-muted-foreground">{page} / {pageCount}</span>
              <button disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)} className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground hover:bg-secondary disabled:opacity-30" aria-label="Next page" data-testid="button-next-ckyc-create-page"><ChevronRight size={15} /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}