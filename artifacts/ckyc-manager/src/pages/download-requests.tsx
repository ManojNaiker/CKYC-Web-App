import { ChangeEvent, useState } from "react";
import {
  Download,
  FileDown,
  FileSpreadsheet,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import {
  getListCkycDownloadRequestsQueryKey,
  useGenerateCkycDownloadRequest,
  useListCkycDownloadRequests,
} from "@workspace/api-client-react";
import { EmptyState, PageIntro, QueryError } from "@/components/workspace-shell";

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
  const [sourceFileName, setSourceFileName] = useState("");
  const [fileContentBase64, setFileContentBase64] = useState("");
  const [fileDate, setFileDate] = useState(todayDDMMYYYY());
  const [feedback, setFeedback] = useState("");
  const query = useListCkycDownloadRequests({
    query: { queryKey: getListCkycDownloadRequestsQueryKey() },
  });
  const generate = useGenerateCkycDownloadRequest();

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFeedback("");
    setSourceFileName(file.name);
    try {
      setFileContentBase64(await readAsBase64(file));
    } catch (error) {
      setFileContentBase64("");
      setFeedback(error instanceof Error ? error.message : "Could not read the Excel file.");
    }
  };

  const generateFile = () => {
    if (!fileContentBase64 || !sourceFileName) {
      setFeedback("Choose the CKYC portal Excel response first.");
      return;
    }
    generate.mutate(
      {
        data: {
          sourceFileName,
          fileContentBase64,
          fileDate,
          institutionCode: "IN2884",
          version: "V1.3",
          iraCode: "IRA010815",
        },
      },
      {
        onSuccess: (result) => {
          saveFile(result.fileName, result.content);
          setFeedback(
            `${result.recordCount} CKYC download rows generated as D${result.requestNumber}.`,
          );
          setSourceFileName("");
          setFileContentBase64("");
          void query.refetch();
        },
        onError: (error) => setFeedback(cleanApiError(error)),
      },
    );
  };

  return (
    <div className="animate-fade">
      <PageIntro
        eyebrow="CKYC document retrieval"
        title="Build download requests."
        description="Upload the CKYC portal Excel response. Only rows with a blank numeric KYC Number are selected; rows that already have a KYC Number are skipped."
      />

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <section className="rounded-xl border border-primary/25 bg-card shadow-xs">
          <div className="border-b border-border bg-[#eff8f5] p-5 dark:bg-secondary/45">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                <FileSpreadsheet size={18} />
              </span>
              <div>
                <p className="font-mono-ui text-[9px] uppercase tracking-[.18em] text-primary">
                  Portal Excel response
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
            <label
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-primary/35 bg-background px-4 py-4 hover:border-primary"
              data-testid="input-download-excel"
            >
              <span className="grid size-9 place-items-center rounded-md bg-secondary text-primary">
                <UploadCloud size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold">
                  {sourceFileName || "Select CKYC response Excel"}
                </span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  .xlsx file with KYC Number and ALPHANUMERIC Reference NO
                </span>
              </span>
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={chooseFile}
                data-testid="file-input-download-excel"
              />
            </label>
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
                feedback && !feedback.includes("generated")
                  ? "text-destructive"
                  : "text-[#31734d]"
              }`}
              data-testid="status-download-request"
            >
              {feedback}
            </p>
            <button
              onClick={generateFile}
              disabled={generate.isPending || !fileContentBase64}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[12px] font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45"
              data-testid="button-generate-download-request"
            >
              <FileDown size={15} />
              {generate.isPending ? "Generating…" : "Generate & download TXT"}
            </button>
          </div>
        </section>

        <section>
          <div className="mb-3">
            <p className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-muted-foreground">
              Download request history
            </p>
          </div>
          {query.isError ? (
            <QueryError onRetry={() => query.refetch()} />
          ) : query.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-[76px] animate-pulse rounded-xl bg-card" />
              ))}
            </div>
          ) : !query.data?.length ? (
            <EmptyState
              icon={FileDown}
              title="No download requests yet"
              detail="Upload the CKYC portal Excel response to generate the first D10701 file."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
              <div className="data-table hidden grid-cols-[1fr_110px_150px] gap-4 border-b border-border bg-secondary/55 px-5 py-3 text-muted-foreground md:grid">
                <span>Request file</span>
                <span>Rows</span>
                <span>Created</span>
              </div>
              <div className="divide-y divide-border">
                {query.data.map((request) => (
                  <div
                    key={request.id}
                    className="grid gap-2 px-5 py-4 md:grid-cols-[1fr_110px_150px] md:items-center md:gap-4"
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
                        </span>
                      </span>
                    </span>
                    <span className="font-mono-ui text-[11px] text-muted-foreground">
                      {request.recordCount} rows
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