import { ChangeEvent, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Check,
  FileCheck2,
  FileClock,
  FilePlus2,
  Search,
  SlidersHorizontal,
  UploadCloud,
  X,
} from "lucide-react";
import {
  getListCkycRequestsQueryKey,
  getListClientsQueryKey,
  useGenerateCkycRequest,
  useListCkycRequests,
  useListClients,
} from "@workspace/api-client-react";
import type {
  Client,
  CkycClientInput,
  CkycRequestInput,
} from "@workspace/api-client-react";
import { EmptyState, PageIntro, QueryError } from "@/components/workspace-shell";

function todayDDMMYYYY() {
  const date = new Date();
  return `${String(date.getDate()).padStart(2, "0")}${String(
    date.getMonth() + 1,
  ).padStart(2, "0")}${date.getFullYear()}`;
}

const MAX_CKYC_SEARCH_ROWS = 1_000_000;
const CLIENT_LIST_PAGE_SIZE = 200;

function cleanIdentifier(value: string) {
  return value.trim().replace(/^'/, "");
}

function createRowsForClient(
  client: Client,
  startingSequence: number,
): CkycClientInput[] {
  const rows: CkycClientInput[] = [];
  const base = {
    clientId: client.id,
    name: client.ClientName,
    dateOfBirth: client.date_of_birth,
    gender: client.Gender,
  };

  const aadhaar = cleanIdentifier(client.Client_UID);
  const aadhaarDigits = aadhaar.replace(/\D/g, "");
  if (aadhaarDigits) {
    rows.push({
      ...base,
      searchType: "E",
      searchValue: aadhaarDigits.slice(-4).padStart(4, "0"),
      sequence: startingSequence + rows.length,
    });
  }

  const otherIdentifiers = [client.Client_VID, client.Client_PAN]
    .map(cleanIdentifier)
    .filter(Boolean);
  for (const identifier of otherIdentifiers) {
    rows.push({
      ...base,
      searchType: "B",
      searchValue: identifier,
      sequence: startingSequence + rows.length,
    });
  }

  return rows;
}

function CreateRequest({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [clientPage, setClientPage] = useState(1);
  const [fileDate, setFileDate] = useState(todayDDMMYYYY());
  const [version, setVersion] = useState("V1.1");
  const [institutionCode, setInstitutionCode] = useState("IN2884");
  const [feedback, setFeedback] = useState("");
  const clientsQuery = useListClients(
    { page: 1, pageSize: MAX_CKYC_SEARCH_ROWS },
    {
      query: {
        queryKey: getListClientsQueryKey({
          page: 1,
          pageSize: MAX_CKYC_SEARCH_ROWS,
        }),
      },
    },
  );
  const generate = useGenerateCkycRequest();
  const clients = (clientsQuery.data?.items ?? []).filter(
    (client) => client.ckycResponseStatus === null,
  );
  const selectedIds = useMemo(() => new Set(selected), [selected]);
  const selectedClients = clients.filter((client) => selectedIds.has(client.id));
  const clientPageCount = Math.max(
    1,
    Math.ceil(clients.length / CLIENT_LIST_PAGE_SIZE),
  );
  const visibleClients = clients.slice(
    (clientPage - 1) * CLIENT_LIST_PAGE_SIZE,
    clientPage * CLIENT_LIST_PAGE_SIZE,
  );
  let nextSequence = 1;
  const ckycRows = selectedClients.flatMap((client) => {
    const rows = createRowsForClient(client, nextSequence);
    nextSequence += rows.length;
    return rows;
  });
  const rowCount = ckycRows.length;
  const fields: {
    label: string;
    value: string;
    setter: (value: string) => void;
  }[] = [
    { label: "File date", value: fileDate, setter: setFileDate },
    { label: "Version", value: version, setter: setVersion },
    {
      label: "Institution code",
      value: institutionCode,
      setter: setInstitutionCode,
    },
  ];

  const toggle = (id: number) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const generateFile = () => {
    if (!selectedClients.length) {
      setFeedback("Select at least one client to generate a file.");
      return;
    }
    if (!ckycRows.length) {
      setFeedback("Selected clients have no Aadhaar, VID, or PAN value.");
      return;
    }

    const payload: CkycRequestInput = {
      fileDate,
      version,
      institutionCode,
      documentSetName: "10022",
      rowCount: String(rowCount),
      clients: ckycRows,
    };
    generate.mutate(
      { data: payload },
      {
        onSuccess: () => {
          setFeedback(`${rowCount} CKYC rows generated.`);
          setTimeout(onClose, 500);
        },
        onError: () =>
          setFeedback(
            "The file could not be generated. Review the request details and retry.",
          ),
      },
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-primary/25 bg-card shadow-md">
      <div className="flex items-start justify-between border-b border-border bg-[#eff8f5] px-5 py-5 dark:bg-secondary/45">
        <div>
          <p className="font-mono-ui text-[9px] uppercase tracking-[.18em] text-primary">
            Create request file
          </p>
          <h3 className="mt-1 font-display text-[21px] font-bold tracking-[-.03em]">
            Prepare a CKYC search
          </h3>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Aadhaar creates E rows; every other available KYC identifier creates a B row.
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-card"
          aria-label="Close create request"
          data-testid="button-close-create-request"
        >
          <X size={18} />
        </button>
      </div>
      <div className="grid gap-0 lg:grid-cols-[1fr_360px]">
        <div className="border-b border-border p-5 lg:border-b-0 lg:border-r">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-muted-foreground">
                Select clients
              </p>
              <p className="mt-1 text-[12px] font-semibold">
                 {selected.length.toLocaleString("en-IN")} of{" "}
                 {clients.length.toLocaleString("en-IN")} selected ·{" "}
                 {rowCount.toLocaleString("en-IN")} CKYC rows
              </p>
            </div>
            <button
              onClick={() =>
                setSelected(
                  selected.length === clients.length
                    ? []
                    : clients.map((client) => client.id),
                )
              }
              className="text-[11px] font-bold text-primary hover:underline"
              data-testid="button-select-all-clients"
            >
              {selected.length === clients.length ? "Clear all" : "Select all"}
            </button>
          </div>
          {clientsQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="h-12 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : clients.length === 0 ? (
            <p className="rounded-lg bg-secondary p-4 text-[12px] text-muted-foreground">
              No awaiting clients are available. Clients with a CKYC ID or a
              completed error response are excluded from repeat requests.
            </p>
          ) : (
             <>
             <div className="max-h-[320px] overflow-y-auto rounded-lg border border-border">
               {visibleClients.map((client) => (
                <button
                  key={client.id}
                  onClick={() => toggle(client.id)}
                  className="flex w-full items-center gap-3 border-b border-border px-3 py-3 text-left last:border-0 hover:bg-secondary/40"
                  data-testid={`button-select-client-${client.id}`}
                >
                  <span
                    className={`grid size-5 shrink-0 place-items-center rounded border ${
                       selectedIds.has(client.id)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-card"
                    }`}
                  >
                     {selectedIds.has(client.id) && <Check size={13} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold">
                      {client.ClientName}
                    </span>
                    <span className="mt-0.5 block font-mono-ui text-[10px] text-muted-foreground">
                      {client.ClientID} · {client.Client_UID ? "Aadhaar" : "No Aadhaar"} ·{" "}
                      {[client.Client_VID, client.Client_PAN].filter(Boolean).length} B docs
                    </span>
                  </span>
                </button>
              ))}
            </div>
             {clientPageCount > 1 && (
               <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
                 <span>
                   Clients{" "}
                   {((clientPage - 1) * CLIENT_LIST_PAGE_SIZE + 1).toLocaleString(
                     "en-IN",
                   )}
                   –
                   {Math.min(
                     clientPage * CLIENT_LIST_PAGE_SIZE,
                     clients.length,
                   ).toLocaleString("en-IN")}{" "}
                   of {clients.length.toLocaleString("en-IN")}
                 </span>
                 <span className="flex items-center gap-2">
                   <button
                     type="button"
                     disabled={clientPage === 1}
                     onClick={() => setClientPage((page) => page - 1)}
                     className="rounded border border-border px-2 py-1 font-semibold text-foreground disabled:opacity-40"
                   >
                     Previous
                   </button>
                   <span>
                     Page {clientPage.toLocaleString("en-IN")} /{" "}
                     {clientPageCount.toLocaleString("en-IN")}
                   </span>
                   <button
                     type="button"
                     disabled={clientPage === clientPageCount}
                     onClick={() => setClientPage((page) => page + 1)}
                     className="rounded border border-border px-2 py-1 font-semibold text-foreground disabled:opacity-40"
                   >
                     Next
                   </button>
                 </span>
               </div>
             )}
             </>
          )}
        </div>
        <div className="p-5">
          <p className="mb-3 font-mono-ui text-[9px] uppercase tracking-[.16em] text-muted-foreground">
            File configuration
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {fields.map(({ label, value, setter }) => (
              <label key={label} className="block">
                <span className="classic-label mb-1.5 block">
                  {label}
                </span>
                <input
                  type="text"
                  value={value}
                  onChange={(event) => setter(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono-ui text-[11px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  data-testid={`input-request-${label.toLowerCase().replaceAll(" ", "-")}`}
                />
              </label>
            ))}
            <label className="block">
              <span className="classic-label mb-1.5 block">
                Row count
              </span>
              <input
                type="text"
                value={rowCount}
                readOnly
                className="h-9 w-full cursor-not-allowed rounded-md border border-input bg-muted px-3 font-mono-ui text-[11px] text-muted-foreground outline-none"
                data-testid="input-request-row-count"
              />
            </label>
          </div>
             <p
               className={`mt-4 min-h-[16px] text-[11px] ${
              feedback.includes("could") ||
              feedback.includes("Select") ||
               feedback.includes("no Aadhaar") ||
               feedback.includes("10 lakh")
                ? "text-destructive"
                : "text-[#31734d]"
            }`}
            data-testid="status-generate-request"
          >
            {feedback}
          </p>
           {rowCount > MAX_CKYC_SEARCH_ROWS && (
             <p className="mb-2 text-[11px] text-destructive">
               CERSAI allows a maximum of 10 lakh CKYC rows per search file.
               Split this selection into smaller files.
             </p>
           )}
          <button
            onClick={generateFile}
             disabled={
               generate.isPending ||
               clientsQuery.isLoading ||
               rowCount > MAX_CKYC_SEARCH_ROWS
             }
            className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[12px] font-bold text-primary-foreground disabled:opacity-50"
            data-testid="button-generate-request"
          >
            {generate.isPending ? (
              "Generating file…"
            ) : (
              <>
                <FilePlus2 size={15} /> Generate search file
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function statusLabel(status: string) {
  return status === "response_uploaded" ? "Response uploaded" : "Awaiting response";
}

export default function Requests() {
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState<
    "all" | "generated" | "response_uploaded"
  >("all");
  const [search, setSearch] = useState("");
  const query = useListCkycRequests({
    query: { queryKey: getListCkycRequestsQueryKey() },
  });
  const requests = useMemo(
    () =>
      (query.data ?? []).filter(
        (request) =>
          (filter === "all" || request.status === filter) &&
          request.fileName.toLowerCase().includes(search.toLowerCase()),
      ),
    [query.data, filter, search],
  );

  return (
    <div className="animate-fade">
      <PageIntro
        eyebrow="File control"
        title="Requests, accounted for."
        description="Every generated search file has a clear handoff: what went out, when it went out, and whether a response has come back."
        action={
          <button
            onClick={() => setCreateOpen((open) => !open)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[12px] font-bold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5"
            data-testid="button-open-create-request"
          >
            <FilePlus2 size={15} /> Create request
          </button>
        }
      />
      {createOpen && (
        <div className="mb-7 animate-rise">
          <CreateRequest
            onClose={() => {
              setCreateOpen(false);
              query.refetch();
            }}
          />
        </div>
      )}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative max-w-[400px] flex-1">
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a request file"
            className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-4 text-[12px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            data-testid="input-search-requests"
          />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} className="text-muted-foreground" />
          <div className="flex rounded-lg border border-border bg-card p-1">
            {[
              ["all", "All files"],
              ["generated", "Awaiting response"],
              ["response_uploaded", "Responses in"],
            ].map(([value, label]) => (
              <button
                onClick={() =>
                  setFilter(value as "all" | "generated" | "response_uploaded")
                }
                key={value}
                className={`rounded-md px-3 py-1.5 text-[10px] font-semibold transition-colors ${
                  filter === value
                    ? "bg-secondary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`button-filter-${value}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {query.isError ? (
        <QueryError onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="h-[78px] animate-pulse rounded-xl border border-border bg-card"
            />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <EmptyState
          icon={FileClock}
          title={query.data?.length ? "No files match this view" : "No CKYC files generated"}
          detail={
            query.data?.length
              ? "Try changing the status filter or search term."
              : "Once you have imported clients, create a search file to start the trail."
          }
          action={
            !query.data?.length && (
              <button
                onClick={() => setCreateOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[12px] font-bold text-primary-foreground"
                data-testid="button-empty-create-request"
              >
                <FilePlus2 size={14} /> Create request
              </button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <div className="data-table hidden grid-cols-[1fr_120px_150px_160px_28px] items-center gap-4 border-b border-border bg-secondary/55 px-5 py-3 text-muted-foreground md:grid">
            <span>Request file</span>
            <span>CKYC rows</span>
            <span>Created</span>
            <span>Status</span>
            <span />
          </div>
          <div className="divide-y divide-border">
            {requests.map((request) => (
              <Link
                href={`/requests/${request.id}`}
                key={request.id}
                className="grid grid-cols-1 gap-3 px-5 py-4 transition-colors hover:bg-secondary/30 md:grid-cols-[1fr_120px_150px_160px_28px] md:items-center md:gap-4"
                data-testid={`link-request-${request.id}`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-lg ${
                      request.status === "response_uploaded"
                        ? "bg-[#e2f2e9] text-[#31734d]"
                        : "bg-[#fff1d6] text-[#9b6915]"
                    }`}
                  >
                    {request.status === "response_uploaded" ? (
                      <FileCheck2 size={16} />
                    ) : (
                      <FileClock size={16} />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-mono-ui text-[11px] font-medium text-foreground">
                      {request.fileName}
                    </span>
                    <span className="mt-1 block text-[10px] text-muted-foreground md:hidden">
                      {request.recordCount} CKYC rows · {statusLabel(request.status)}
                    </span>
                  </span>
                </span>
                <span className="hidden font-mono-ui text-[11px] text-muted-foreground md:block">
                  {request.recordCount} rows
                </span>
                <span className="hidden font-mono-ui text-[10px] text-muted-foreground md:block">
                  {new Intl.DateTimeFormat("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  }).format(new Date(request.createdAt))}
                </span>
                <span
                  className={`hidden w-fit rounded-full px-2.5 py-1 font-mono-ui text-[9px] uppercase tracking-[.08em] md:block ${
                    request.status === "response_uploaded"
                      ? "bg-[#e2f2e9] text-[#31734d]"
                      : "bg-[#fff1d6] text-[#9b6915]"
                  }`}
                >
                  {statusLabel(request.status)}
                </span>
                <ArrowRight size={15} className="hidden text-muted-foreground md:block" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}