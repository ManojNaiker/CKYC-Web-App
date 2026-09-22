import { ChangeEvent, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Download,
  FileDown,
  FileSpreadsheet,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import {
  getListCkycDownloadRequestsQueryKey,
  getListCkycDownloadResponseFilesQueryKey,
  useArchiveCkycDownloadResponseFile,
  useGenerateCkycDownloadRequestBatch,
  useListCkycDownloadResponseFiles,
  useListCkycDownloadRequests,
  useRestoreCkycDownloadResponseFile,
  useUploadCkycDownloadResponse,
} from "@workspace/api-client-react";
import { EmptyState, PageIntro, QueryError } from "@/components/workspace-shell";
import { parseClientSelectionCsv } from "@/lib/csv";

function todayDDMMYYYY() {
  const date = new Date();
  return `${String(date.getDate()).padStart(2, "0")}${String(
    date.getMonth() + 1,
  ).padStart(2, "0")}${date.getFullYear()}`;
}

function saveFile(name: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/plain;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function readAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the Excel file."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

function cleanApiError(error: unknown) {
  if (!(error instanceof Error)) return "The download request could not be generated.";
  return error.message.replace(/^HTTP \d+ [^:]+:\s*/, "");
}

export default function DownloadRequests() {
  const [fileDate, setFileDate] = useState(todayDDMMYYYY());
  const [disbursementFrom, setDisbursementFrom] = useState("");
  const [disbursementTo, setDisbursementTo] = useState("");
  const [maxRows, setMaxRows] = useState("200000");
  const [clientFileName, setClientFileName] = useState("");
  const [clientReferences, setClientReferences] = useState<string[]>([]);
  const [clientFileFeedback, setClientFileFeedback] = useState("");
  const [generateFeedback, setGenerateFeedback] = useState("");
  const [generatedLots, setGeneratedLots] = useState<
    Array<{ fileName: string; content: string; recordCount: number }>
  >([]);
  const [responseFileName, setResponseFileName] = useState("");
  const [savedResponseFileName, setSavedResponseFileName] = useState("");
  const [savedResponseRecordId, setSavedResponseRecordId] = useState<number | null>(
    null,
  );
  const [responseContentBase64, setResponseContentBase64] = useState("");
  const [showArchivedResponseFiles, setShowArchivedResponseFiles] =
    useState(false);
  const [responseFileActionId, setResponseFileActionId] = useState<number | null>(
    null,
  );
  const [responseFileActionFeedback, setResponseFileActionFeedback] = useState("");
  const [responseFeedback, setResponseFeedback] = useState("");
  const historyQuery = useListCkycDownloadRequests({
    query: { queryKey: getListCkycDownloadRequestsQueryKey() },
  });
  const responseFilesQuery = useListCkycDownloadResponseFiles(
    { includeArchived: showArchivedResponseFiles },
    { query: { queryKey: getListCkycDownloadResponseFilesQueryKey({ includeArchived: showArchivedResponseFiles }) } },
  );
  const generateBatch = useGenerateCkycDownloadRequestBatch();
  const uploadResponse = useUploadCkycDownloadResponse();
  const archiveResponseFile = useArchiveCkycDownloadResponseFile();
  const restoreResponseFile = useRestoreCkycDownloadResponseFile();

  const chooseClientFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setClientFileName(file.name);
    setClientFileFeedback("");
    setClientReferences([]);
    try {
      const parsed = parseClientSelectionCsv(await file.text());
      setClientReferences(parsed.references);
      setClientFileFeedback(
        `${parsed.references.length.toLocaleString("en-IN")} client references loaded from ${parsed.header}.`,
      );
    } catch (error) {
      setClientFileName("");
      setClientFileFeedback(
        error instanceof Error ? error.message : "Could not read the client CSV.",
      );
    }
  };

  const chooseResponseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setResponseFeedback("");
    setSavedResponseFileName("");
    setSavedResponseRecordId(null);
    setResponseFileName(file.name);
    try {
      setResponseContentBase64(await readAsBase64(file));
    } catch (error) {
      setResponseContentBase64("");
      setResponseFeedback(
        error instanceof Error ? error.message : "Could not read the Excel file.",
      );
    }
  };

  const generateFile = () => {
    setGenerateFeedback("");
    setGeneratedLots([]);
    const rowLimit = Number(maxRows);
    if (!Number.isInteger(rowLimit) || rowLimit < 1 || rowLimit > 1_000_000) {
      setGenerateFeedback("Rows per file must be a whole number between 1 and 1,000,000.");
      return;
    }
    if (!clientReferences.length) {
      setGenerateFeedback("Upload a client CSV before generating download files.");
      return;
    }
    if (
      disbursementFrom &&
      disbursementTo &&
      disbursementFrom > disbursementTo
    ) {
      setGenerateFeedback("Disbursement From date cannot be after the To date.");
      return;
    }

    generateBatch.mutate(
      {
        data: {
          clientReferences,
          maxRows: rowLimit,
          sourceFileName: clientFileName,
          fileDate,
          disbursementFrom: disbursementFrom || undefined,
          disbursementTo: disbursementTo || undefined,
          institutionCode: "IN2884",
          version: "V1.3",
          iraCode: "IRA010815",
        },
      },
      {
        onSuccess: (result) => {
          setGeneratedLots(result.requests);
          result.requests.forEach((request, index) => {
            window.setTimeout(
              () => saveFile(request.fileName, request.content),
              index * 150,
            );
          });
          setGenerateFeedback(
            `${result.requests.length} file lot(s) generated with ${result.totalRecordCount.toLocaleString(
              "en-IN",
            )} rows. ${result.matchedClientCount.toLocaleString(
              "en-IN",
            )} selected clients matched.`,
          );
          void historyQuery.refetch();
        },
        onError: (error) => setGenerateFeedback(cleanApiError(error)),
      },
    );
  };

  const importResponse = () => {
    if (!responseContentBase64 || !responseFileName) {
      setResponseFeedback("Choose the CKYC portal Excel or final CKYC TXT response first.");
      return;
    }
    uploadResponse.mutate(
      {
        data: {
          sourceFileName: responseFileName,
          fileContentBase64: responseContentBase64,
        },
      },
      {
        onSuccess: (result) => {
          const missing = result.missingReferences.length
            ? ` ${result.missingReferences.length} unmatched reference(s) skipped.`
            : "";
          setResponseFeedback(
            result.updatedCount
              ? `${result.updatedCount} final CKYC number${result.updatedCount === 1 ? "" : "s"} saved. ${result.storedRecordCount} response row(s) stored.${missing}`
              : `${result.storedRecordCount} final CKYC response row(s) stored${
                  result.requestNumber === null
                    ? ""
                    : ` for D${result.requestNumber}`
                }. ${
                  result.requestMatched
                    ? "The matching request was updated."
                    : "The response is saved and will link when the matching request is generated."
                }${missing}`,
          );
          setSavedResponseFileName(responseFileName);
          setSavedResponseRecordId(result.storedRecordId);
          setResponseContentBase64("");
          void historyQuery.refetch();
          void responseFilesQuery.refetch();
        },
        onError: (error) => setResponseFeedback(cleanApiError(error)),
      },
    );
  };

  const updateResponseFileArchiveState = (id: number, archive: boolean) => {
    setResponseFileActionId(id);
    setResponseFileActionFeedback("");
    const mutation = archive ? archiveResponseFile : restoreResponseFile;
    mutation.mutate(
      { id },
      {
        onSuccess: () => {
          setResponseFileActionFeedback(
            archive
              ? "Response file archived. It remains downloadable and can be restored."
              : "Response file restored to the active list.",
          );
          void responseFilesQuery.refetch();
        },
        onError: (error) => setResponseFileActionFeedback(cleanApiError(error)),
        onSettled: () => setResponseFileActionId(null),
      },
    );
  };

  const persistedResponseRequest = historyQuery.data?.find(
    (request) => request.responseFileName,
  );
  const persistedResponseFile = responseFilesQuery.data?.find(
    (responseFile) => !responseFile.archivedAt,
  );
  const displayedResponseFileName =
    savedResponseFileName ||
    persistedResponseFile?.sourceFileName ||
    persistedResponseRequest?.responseFileName ||
    "";
  const displayedResponseRecordId =
    savedResponseRecordId ?? persistedResponseFile?.id ?? null;
  const savedResponseRequest = displayedResponseFileName
    ? historyQuery.data?.find(
        (request) => request.responseFileName === displayedResponseFileName,
      )
    : undefined;
  const savedResponseRequestId = savedResponseRequest?.id;

  return (
    <div className="animate-fade">
      <PageIntro
        eyebrow="CKYC document retrieval"
        title="Build download requests."
        description="Generate the portal TXT from saved CKYC response IDs and LMS dates of birth. After processing, upload the portal Excel or final CKYC TXT response; both files are retained and matched to their D request when available."
      />

      <div className="space-y-6">
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
          <section className="rounded-xl border border-primary/25 bg-card shadow-xs">
            <div className="border-b border-border bg-[#eff8f5] p-5 dark:bg-secondary/45">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                  <FileDown size={18} />
                </span>
                <div>
                  <p className="font-mono-ui text-[9px] uppercase tracking-[.18em] text-primary">
                    Pending CKYC response IDs
                  </p>
                  <h3 className="mt-1 font-display text-[20px] font-semibold">
                    Prepare the next D request
                  </h3>
                </div>
              </div>
            </div>
            <div className="space-y-4 p-5">
              <label className="block">
                <span className="classic-label mb-1.5 block">File date</span>
                <input
                  value={fileDate}
                  onChange={(event) => setFileDate(event.target.value)}
                  maxLength={8}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono-ui text-[11px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  data-testid="input-download-file-date"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="classic-label mb-1.5 block">
                    Disbursement From
                  </span>
                  <input
                    type="date"
                    value={disbursementFrom}
                    onChange={(event) => setDisbursementFrom(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono-ui text-[11px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    data-testid="input-download-disbursement-from"
                  />
                </label>
                <label className="block">
                  <span className="classic-label mb-1.5 block">
                    Disbursement To
                  </span>
                  <input
                    type="date"
                    value={disbursementTo}
                    onChange={(event) => setDisbursementTo(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono-ui text-[11px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    data-testid="input-download-disbursement-to"
                  />
                </label>
              </div>
              <p className="text-[10px] leading-4 text-muted-foreground">
                Only LMS loans in this range are considered. If one Client ID
                has multiple loans, it is added only once because its CKYC is
                the same.
              </p>
              <label className="block">
                <span className="classic-label mb-1.5 block">
                  Rows per CERSAI file
                </span>
                <input
                  type="number"
                  min={1}
                  max={1000000}
                  step={1}
                  value={maxRows}
                  onChange={(event) => setMaxRows(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono-ui text-[11px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  data-testid="input-download-max-rows"
                />
                <span className="mt-1 block text-[10px] text-muted-foreground">
                  Each TXT will contain no more than this many type 60 rows.
                </span>
              </label>
              <label
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-primary/35 bg-background px-3 py-3 hover:border-primary"
                data-testid="input-download-client-file"
              >
                <UploadCloud size={17} className="text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-semibold">
                    {clientFileName || "Upload clients for download"}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    CSV: LMS Client ID, Loan ID, or CKYC Response ID
                  </span>
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={chooseClientFile}
                  data-testid="file-input-download-client-file"
                />
              </label>
              <p
                className={`min-h-[16px] text-[10px] ${
                  clientFileFeedback && !clientFileFeedback.includes("loaded")
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
                data-testid="status-download-client-file"
              >
                {clientFileFeedback ||
                  "Use the client register export to select exactly which clients should be included."}
              </p>
              <div className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-semibold">Selected clients</span>
                  <span className="rounded-full bg-[#e2f2e9] px-2.5 py-1 font-mono-ui text-[10px] font-bold text-[#31734d]">
                    {clientReferences.length.toLocaleString("en-IN")}
                  </span>
                </div>
                <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
                  Only uploaded clients with a matched CKYC response ID and no final KYC number are included.
                </p>
              </div>
              <div className="rounded-lg bg-secondary/65 p-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold">
                  <ShieldCheck size={14} className="text-primary" />
                  Fixed gateway configuration
                </div>
                <p className="mt-2 font-mono-ui text-[10px] leading-5 text-muted-foreground">
                  IN2884 · V1.3 · IRA010815 · next unique ID starts from D10701
                </p>
              </div>
              <p
                className={`min-h-[18px] text-[11px] ${
                  generateFeedback && !generateFeedback.includes("generated")
                    ? "text-destructive"
                    : "text-[#31734d]"
                }`}
                data-testid="status-download-request"
              >
                {generateFeedback}
              </p>
              <button
                onClick={generateFile}
                disabled={
                  generateBatch.isPending || clientReferences.length === 0
                }
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[12px] font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45"
                data-testid="button-generate-download-request"
              >
                <FileDown size={15} />
                {generateBatch.isPending
                  ? "Generating lots…"
                  : "Generate & download TXT lots"}
              </button>
              {generatedLots.length > 0 && (
                <div className="space-y-2 rounded-lg border border-primary/20 bg-secondary/35 p-3">
                  <p className="text-[10px] font-semibold text-primary">
                    Generated lots
                  </p>
                  {generatedLots.map((lot) => (
                    <button
                      key={lot.fileName}
                      type="button"
                      onClick={() => saveFile(lot.fileName, lot.content)}
                      className="flex w-full items-center justify-between gap-3 rounded-md bg-background px-2.5 py-2 text-left hover:bg-card"
                    >
                      <span className="min-w-0 truncate font-mono-ui text-[10px]">
                        {lot.fileName}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {lot.recordCount.toLocaleString("en-IN")} rows
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card shadow-xs">
            <div className="border-b border-border p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                  <FileSpreadsheet size={18} />
                </span>
                <div>
                  <p className="font-mono-ui text-[9px] uppercase tracking-[.18em] text-primary">
                    Portal result
                  </p>
                  <h3 className="mt-1 font-display text-[18px] font-semibold">
                    Save final CKYC numbers
                  </h3>
                </div>
              </div>
            </div>
            <div className="space-y-4 p-5">
              <label
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-primary/35 bg-background px-4 py-4 hover:border-primary"
                data-testid="input-download-response-excel"
              >
                <span className="grid size-9 place-items-center rounded-md bg-secondary text-primary">
                  <UploadCloud size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold">
                    {responseFileName ||
                      savedResponseFileName ||
                      "Select final CKYC response file"}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    Accepts portal Excel or CERSAI TXT response
                  </span>
                </span>
                <input
                  type="file"
                  accept=".xlsx,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain"
                  className="sr-only"
                  onChange={chooseResponseFile}
                  data-testid="file-input-download-response-excel"
                />
              </label>
              <p
                className={`min-h-[18px] text-[11px] ${
                  responseFeedback &&
                  !responseFeedback.includes("saved")
                    ? "text-destructive"
                    : "text-[#31734d]"
                }`}
                data-testid="status-download-response"
              >
                {responseFeedback}
              </p>
              {displayedResponseFileName && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-[#31734d]/25 bg-[#e2f2e9] px-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2 text-[10px] text-[#31734d]">
                    <FileSpreadsheet size={14} className="shrink-0" />
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        Uploaded final CKYC file
                      </span>
                      <span className="mt-0.5 block truncate font-mono-ui">
                        {displayedResponseFileName}
                      </span>
                    </span>
                  </span>
                  {displayedResponseRecordId ? (
                    <a
                      href={`/api/ckyc/download-requests/response-files/${displayedResponseRecordId}/file`}
                      download={displayedResponseFileName}
                      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-[#31734d]/35 bg-background px-2 text-[10px] font-semibold text-[#31734d] hover:bg-white"
                      data-testid={`button-download-uploaded-final-${displayedResponseRecordId}`}
                    >
                      <Download size={12} />
                      Download
                    </a>
                  ) : savedResponseRequestId ? (
                    <a
                      href={`/api/ckyc/download-requests/${savedResponseRequestId}/response-file`}
                      download={displayedResponseFileName}
                      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-[#31734d]/35 bg-background px-2 text-[10px] font-semibold text-[#31734d] hover:bg-white"
                      data-testid={`button-download-uploaded-final-${savedResponseRequestId}`}
                    >
                      <Download size={12} />
                      Download
                    </a>
                  ) : null}
                </div>
              )}
              <button
                onClick={importResponse}
                disabled={uploadResponse.isPending || !responseContentBase64}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-primary bg-background text-[12px] font-bold text-primary disabled:cursor-not-allowed disabled:opacity-45"
                data-testid="button-upload-download-response"
              >
                <CheckCircle2 size={15} />
                {uploadResponse.isPending
                  ? "Saving response…"
                  : "Save final CKYC response"}
              </button>
            </div>
          </section>
        </div>

        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <p className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-muted-foreground">
              Uploaded final response files
            </p>
            <label className="inline-flex cursor-pointer items-center gap-2 text-[10px] text-muted-foreground">
              <input
                type="checkbox"
                checked={showArchivedResponseFiles}
                onChange={(event) =>
                  setShowArchivedResponseFiles(event.target.checked)
                }
                className="size-3.5 accent-primary"
                data-testid="checkbox-show-archived-response-files"
              />
              Show archived
            </label>
          </div>
          <p className="mb-3 text-[10px] leading-4 text-muted-foreground">
            Archive old uploads to remove them from the active list without deleting
            their audit record, request links, or download access.
          </p>
          {responseFileActionFeedback && (
            <p
              className={`mb-3 text-[10px] ${
                responseFileActionFeedback.includes("could not") ||
                responseFileActionFeedback.includes("HTTP")
                  ? "text-destructive"
                  : "text-[#31734d]"
              }`}
              data-testid="status-response-file-archive"
            >
              {responseFileActionFeedback}
            </p>
          )}
          {responseFilesQuery.isError ? (
            <QueryError onRetry={() => responseFilesQuery.refetch()} />
          ) : responseFilesQuery.isLoading ? (
            <div className="rounded-xl border border-border bg-card p-5 text-[11px] text-muted-foreground shadow-xs">
              Loading uploaded response files…
            </div>
          ) : !responseFilesQuery.data?.length ? (
            <EmptyState
              icon={FileSpreadsheet}
              title="No final response files saved yet"
              detail="Uploaded portal Excel and CERSAI TXT files will remain available here, even when they do not match a generated D request."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
              <div className="data-table hidden grid-cols-[minmax(0,1fr)_110px_150px_250px] gap-4 border-b border-border bg-secondary/55 px-5 py-3 text-muted-foreground md:grid">
                <span>Response file</span>
                <span>Rows</span>
                <span>Request link</span>
                <span>Uploaded / manage</span>
              </div>
              <div className="divide-y divide-border">
                {responseFilesQuery.data.map((responseFile) => (
                  <div
                    key={responseFile.id}
                    className="grid gap-2 px-5 py-4 md:grid-cols-[minmax(0,1fr)_110px_150px_250px] md:items-center md:gap-4"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#e2f2e9] text-[#31734d]">
                        <FileSpreadsheet size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-mono-ui text-[11px] font-medium">
                          {responseFile.sourceFileName}
                        </span>
                        <span className="mt-1 block truncate text-[10px] text-muted-foreground">
                          {responseFile.archivedAt
                            ? "Archived · retained for audit and download"
                            : "Active · stored independently from request history"}
                        </span>
                      </span>
                    </span>
                    <span className="font-mono-ui text-[11px] text-muted-foreground">
                      {responseFile.recordCount} rows
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {responseFile.requestNumber
                        ? `D${responseFile.requestNumber}`
                        : "No matching request"}
                    </span>
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono-ui text-[10px] text-muted-foreground">
                        {new Intl.DateTimeFormat("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        }).format(new Date(responseFile.createdAt))}
                      </span>
                      <span className="flex items-center gap-2">
                        <a
                          href={`/api/ckyc/download-requests/response-files/${responseFile.id}/file`}
                          download={responseFile.sourceFileName}
                          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[#31734d]/35 px-2 text-[10px] font-semibold text-[#31734d] hover:bg-[#e2f2e9]"
                          data-testid={`button-download-uploaded-response-file-${responseFile.id}`}
                        >
                          <Download size={13} />
                          Download
                        </a>
                        <button
                          type="button"
                          onClick={() =>
                            updateResponseFileArchiveState(
                              responseFile.id,
                              !responseFile.archivedAt,
                            )
                          }
                          disabled={responseFileActionId === responseFile.id}
                          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-[10px] font-semibold text-muted-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                          data-testid={`button-${
                            responseFile.archivedAt ? "restore" : "archive"
                          }-uploaded-response-file-${responseFile.id}`}
                        >
                          {responseFile.archivedAt ? (
                            <ArchiveRestore size={13} />
                          ) : (
                            <Archive size={13} />
                          )}
                          {responseFile.archivedAt ? "Restore" : "Archive"}
                        </button>
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section>
          <div className="mb-3">
            <p className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-muted-foreground">
              Download request history
            </p>
          </div>
          {historyQuery.isError ? (
            <QueryError onRetry={() => historyQuery.refetch()} />
          ) : historyQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-[76px] animate-pulse rounded-xl bg-card" />
              ))}
            </div>
          ) : !historyQuery.data?.length ? (
            <EmptyState
              icon={FileDown}
              title="No download requests yet"
              detail="Upload a CKYC search response first, then generate the first D10701 file."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
              <div className="data-table hidden grid-cols-[minmax(0,1fr)_90px_210px_150px] gap-4 border-b border-border bg-secondary/55 px-5 py-3 text-muted-foreground md:grid">
                <span>Request file</span>
                <span>Rows</span>
                <span>Downloads</span>
                <span>Created</span>
              </div>
              <div className="divide-y divide-border">
                {historyQuery.data.map((request) => (
                  <div
                    key={request.id}
                    className="grid gap-2 px-5 py-4 md:grid-cols-[minmax(0,1fr)_90px_210px_150px] md:items-center md:gap-4"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#e2f2e9] text-[#31734d]">
                        <Download size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-mono-ui text-[11px] font-medium">
                          {request.fileName}
                        </span>
                        <span className="mt-1 block truncate text-[10px] text-muted-foreground">
                          From {request.sourceFileName}
                          {request.responseFileName
                            ? ` · Response saved: ${request.responseFileName}`
                            : " · Response pending"}
                        </span>
                      </span>
                    </span>
                    <span className="font-mono-ui text-[11px] text-muted-foreground">
                      {request.recordCount} rows
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <a
                        href={`/api/ckyc/download-requests/${request.id}/file`}
                        download={request.fileName}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-primary/35 px-2 text-[10px] font-semibold text-primary hover:bg-secondary"
                        data-testid={`button-redownload-download-request-${request.id}`}
                      >
                        <Download size={13} />
                        Request TXT
                      </a>
                      {request.responseFileName ? (
                        <a
                          href={`/api/ckyc/download-requests/${request.id}/response-file`}
                          download={request.responseFileName}
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[#31734d]/35 px-2 text-[10px] font-semibold text-[#31734d] hover:bg-[#e2f2e9]"
                          data-testid={`button-download-final-ckyc-${request.id}`}
                        >
                          <FileSpreadsheet size={13} />
                          Final CKYC
                        </a>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          Final file pending
                        </span>
                      )}
                    </span>
                    <span className="font-mono-ui text-[10px] text-muted-foreground">
                      {new Intl.DateTimeFormat("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      }).format(new Date(request.createdAt))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}