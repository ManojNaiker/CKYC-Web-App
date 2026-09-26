import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Database,
  Download,
  FileSpreadsheet,
  KeyRound,
  ListChecks,
  LockKeyhole,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  getGetFinfluxCkycUpdateJobQueryKey,
  getListClientsQueryKey,
  getFinfluxCkycUpdateJob,
  listClients,
  useCreateFinfluxCkycUpdateJob,
  useGetFinfluxCkycUpdateJob,
  useListClients,
  usePreviewFinfluxCkycImport,
} from '@workspace/api-client-react';
import type {
  Client,
  FinfluxCkycImportPreviewResponse,
  FinfluxCkycUpdateJob,
} from '@workspace/api-client-react';
import { EmptyState, PageIntro, QueryError } from '@/components/workspace-shell';

type Mode = 'clients' | 'file';
type SelectedRecord = { clientId: string; ckycNumber: string; clientName?: string };
type FinfluxGroup = 'finalCkyc' | 'requestIdUpdated' | 'recordsPending';
type BatchProgress = {
  status: 'running' | 'stopping' | 'completed' | 'stopped' | 'failed';
  totalRecords: number;
  totalBatches: number;
  currentBatch: number;
  completedRecords: number;
  successCount: number;
  failureCount: number;
  activeJob?: FinfluxCkycUpdateJob;
  error?: string;
};
type BatchReport = { batchCount: number; results: FinfluxCkycUpdateJob['results'] };
type FinfluxSubmissionRecord = {
  clientId: string;
  ckycNumber: string;
  sourceRowNumber?: number;
};

const PAGE_SIZE = 8;
const SELECT_ALL_PAGE_SIZE = 2000;
const FINFLUX_JOB_LIMIT = 1000;
const FINFLUX_BATCH_SIZE = 100;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const JOB_STORAGE_KEY = 'finflux-ckyc-update-job-id';

function getSavedJobId() {
  try {
    return window.sessionStorage.getItem(JOB_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function errorMessage(error: unknown) {
  if (error && typeof error === 'object') {
    const candidate = error as { message?: string; error?: string; response?: { data?: { error?: string } } };
    return candidate.response?.data?.error || candidate.error || candidate.message || 'The request could not be completed.';
  }
  return 'The request could not be completed.';
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function isAuthError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return message.includes('401') || message.includes('unauthor') || message.includes('credential') || message.includes('password') || message.includes('login');
}

function isNotFoundError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const value = error as { status?: unknown; response?: { status?: unknown } };
  return value.status === 404 || value.response?.status === 404;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadResultsReport(results: FinfluxCkycUpdateJob['results'], fileName: string) {
  const header = ['row_number', 'client_id', 'ckyc_number', 'status', 'resource_id', 'message', 'status_code', 'duration_ms'];
  const lines = [
    header.join(','),
    ...results.map((result) =>
      [
        result.rowNumber,
        result.clientId,
        result.ckycNumber,
        result.status,
        result.resourceId,
        result.message,
        result.statusCode,
        result.durationMs,
      ]
        .map(csvCell)
        .join(','),
    ),
  ];
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

function downloadJobReport(job: FinfluxCkycUpdateJob) {
  downloadResultsReport(job.results, `finflux-ckyc-update-${job.id}.csv`);
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'success' || status === 'completed'
      ? 'bg-[#dcefeb] text-[#246c5d]'
      : status === 'failed'
        ? 'bg-[#fff0ed] text-[#a23e36]'
        : status === 'running'
          ? 'bg-[#e7f1f6] text-[#27677d]'
          : 'bg-[#fff4db] text-[#8c641d]';
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-mono-ui text-[9px] font-semibold uppercase tracking-[.12em] ${tone}`}>{status}</span>;
}

function JobPanel({ job, onDownload, onRetry }: { job: FinfluxCkycUpdateJob | undefined; onDownload: () => void; onRetry: () => void }) {
  if (!job) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/55 p-5">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-secondary text-primary"><Clock3 size={18} /></div>
          <div>
            <p className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-muted-foreground">Job monitor</p>
            <p className="mt-1 text-[12px] font-semibold text-foreground">No update job is running</p>
          </div>
        </div>
        <p className="mt-4 text-[11px] leading-5 text-muted-foreground">After authentication, progress and the per-record response will appear here. Credentials are never stored in this workspace.</p>
      </div>
    );
  }

  const progress = job.total ? Math.min(100, Math.round((job.processed / job.total) * 100)) : 0;
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs" aria-label="Finflux update job">
      <div className="border-b border-border bg-[#f1f7f5] px-5 py-4 dark:bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-primary">Job monitor</p>
            <div className="mt-1 flex items-center gap-2.5"><h3 className="font-display text-[19px] font-semibold">Finflux write {job.id}</h3><StatusPill status={job.status} /></div>
          </div>
          <button onClick={onDownload} disabled={!job.results.length} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-download-finflux-report">
            <Download size={14} /> Download CSV
          </button>
        </div>
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between font-mono-ui text-[10px] text-muted-foreground"><span>{job.processed} of {job.total} processed</span><span>{progress}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-[#d9e8e3]"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>
        </div>
        {job.error && <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px] text-destructive"><CircleAlert size={14} className="mt-0.5 shrink-0" />{job.error}</div>}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border/70 bg-card px-3 py-2"><p className="font-mono-ui text-[9px] uppercase tracking-[.12em] text-muted-foreground">Total</p><p className="mt-1 font-mono-ui text-[16px] font-semibold">{job.total}</p></div>
          <div className="rounded-lg border border-border/70 bg-card px-3 py-2"><p className="font-mono-ui text-[9px] uppercase tracking-[.12em] text-muted-foreground">Accepted</p><p className="mt-1 font-mono-ui text-[16px] font-semibold text-primary">{job.successCount}</p></div>
          <div className="rounded-lg border border-border/70 bg-card px-3 py-2"><p className="font-mono-ui text-[9px] uppercase tracking-[.12em] text-muted-foreground">Rejected</p><p className="mt-1 font-mono-ui text-[16px] font-semibold text-destructive">{job.failureCount}</p></div>
        </div>
      </div>
      {job.status === 'failed' && !job.results.length ? (
        <div className="flex items-center justify-between gap-3 px-5 py-4 text-[11px] text-muted-foreground"><span>The job could not be completed.</span><button onClick={onRetry} className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline" data-testid="button-retry-job"><RefreshCw size={13} /> Check again</button></div>
      ) : job.results.length ? (
        <div className="overflow-x-auto">
          <table className="data-table w-full min-w-[860px] text-left">
            <thead className="bg-secondary/45"><tr className="border-b border-border text-muted-foreground"><th className="px-5 py-3">Row</th><th className="px-3 py-3">Client ID</th><th className="px-3 py-3">CKYC number</th><th className="px-3 py-3">Result</th><th className="px-3 py-3">FinFlux resource ID</th><th className="px-3 py-3">Message</th><th className="px-3 py-3">Time</th></tr></thead>
            <tbody className="divide-y divide-border">
              {job.results.map((result) => <tr key={`${result.rowNumber}-${result.clientId}`} className="text-[11px]"><td className="px-5 py-3 font-mono-ui text-muted-foreground">{result.rowNumber}</td><td className="px-3 py-3 font-mono-ui font-semibold">{result.clientId}</td><td className="px-3 py-3 font-mono-ui text-foreground/75">{result.ckycNumber}</td><td className="px-3 py-3"><StatusPill status={result.status} /></td><td className="px-3 py-3 font-mono-ui text-foreground/75">{result.resourceId ?? '—'}</td><td className="max-w-[260px] px-3 py-3 text-muted-foreground">{result.message}{result.statusCode ? ` · ${result.statusCode}` : ''}</td><td className="px-3 py-3 font-mono-ui text-muted-foreground">{result.durationMs === null ? '—' : `${result.durationMs} ms`}</td></tr>)}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-5 py-5 text-[11px] text-muted-foreground">Waiting for the first Finflux response. This page will refresh while the job is queued or running.</div>
      )}
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border px-5 py-3 font-mono-ui text-[9px] uppercase tracking-[.08em] text-muted-foreground">
        <span>Created {formatDate(job.createdAt)}</span>{job.startedAt && <span>Started {formatDate(job.startedAt)}</span>}{job.completedAt && <span>Completed {formatDate(job.completedAt)}</span>}
      </div>
    </section>
  );
}

function FilePreview({ preview, onClear }: { preview: FinfluxCkycImportPreviewResponse; onClear: () => void }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs" aria-label="Import preview">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-[#fbf7ed] px-5 py-4">
        <div>
          <p className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-[#8c641d]">Review before write</p>
          <h3 className="mt-1 font-display text-[19px] font-semibold">{preview.fileName}</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">{preview.totalRows} rows parsed · {preview.validCount} eligible · {preview.invalidCount} excluded</p>
        </div>
        <button onClick={onClear} className="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground" aria-label="Clear import preview" data-testid="button-clear-preview"><X size={16} /></button>
      </div>
      {preview.invalidCount > 0 && <div className="flex items-start gap-2 border-b border-[#eadcbf] bg-[#fffaf0] px-5 py-3 text-[11px] leading-5 text-[#785b25]"><CircleAlert size={15} className="mt-0.5 shrink-0" /><span>Invalid rows stay visible for audit and will not be sent to Finflux. Only eligible rows will be included.</span></div>}
      {preview.rows.length ? (
        <div className="max-h-[390px] overflow-auto">
          <table className="data-table w-full min-w-[600px] text-left">
            <thead className="sticky top-0 bg-card"><tr className="border-b border-border text-muted-foreground"><th className="px-5 py-3">Row</th><th className="px-3 py-3">Client ID</th><th className="px-3 py-3">CKYC number</th><th className="px-3 py-3">Validation</th></tr></thead>
            <tbody className="divide-y divide-border">{preview.rows.map((row) => <tr key={row.rowNumber} className="text-[11px]"><td className="px-5 py-3 font-mono-ui text-muted-foreground">{row.rowNumber}</td><td className="px-3 py-3 font-mono-ui font-semibold">{row.clientId || '—'}</td><td className="px-3 py-3 font-mono-ui text-foreground/75">{row.ckycNumber || '—'}</td><td className="px-3 py-3">{row.valid ? <span className="inline-flex items-center gap-1.5 font-semibold text-primary"><Check size={13} /> Eligible</span> : <span className="inline-flex items-center gap-1.5 text-destructive"><CircleAlert size={13} /> {row.error || 'Invalid row'}</span>}</td></tr>)}</tbody>
          </table>
        </div>
      ) : <EmptyState icon={FileSpreadsheet} title="The file has no data rows" detail="Choose a CSV or XLSX with client_id and ckyc_number columns." />}
    </section>
  );
}

export default function FinfluxUpdate() {
  const [mode, setMode] = useState<Mode>('clients');
  const [search, setSearch] = useState('');
  const [finfluxGroup, setFinfluxGroup] = useState<FinfluxGroup>('finalCkyc');
  const [page, setPage] = useState(1);
  const [selectedRecords, setSelectedRecords] = useState<Record<string, SelectedRecord>>({});
  const [selectingAll, setSelectingAll] = useState(false);
  const [selectionError, setSelectionError] = useState('');
  const [batchProgress, setBatchProgress] = useState<BatchProgress>();
  const [batchReport, setBatchReport] = useState<BatchReport>();
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<FinfluxCkycImportPreviewResponse>();
  const [fileError, setFileError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [jobId, setJobId] = useState(getSavedJobId);
  const queryClient = useQueryClient();
  const stopAfterCurrentBatch = useRef(false);
  useEffect(() => () => {
    stopAfterCurrentBatch.current = true;
  }, []);

  const clientParams = useMemo(() => ({ search: search.trim() || undefined, page, pageSize: PAGE_SIZE, finfluxGroup }), [finfluxGroup, page, search]);
  const clientsQuery = useListClients(clientParams, { query: { queryKey: getListClientsQueryKey(clientParams) } });
  const clients = clientsQuery.data?.items ?? [];
  const total = clientsQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedList = useMemo(() => Object.values(selectedRecords), [selectedRecords]);
  const validSelected = useMemo(() => selectedList.filter((record) => record.clientId.trim() && record.ckycNumber.trim()), [selectedList]);
  const validPreview = useMemo(() => (preview?.rows ?? []).filter((row) => row.valid && row.clientId?.trim() && row.ckycNumber?.trim()), [preview]);
  const canEditSelectedRecords = finfluxGroup === 'finalCkyc';
  const batchIsActive = batchProgress?.status === 'running' || batchProgress?.status === 'stopping';
  const selectionBusy = selectingAll || batchIsActive;
  const currentPageSelected = canEditSelectedRecords && clients.length > 0 && clients.every((client) => Boolean(selectedRecords[client.ClientID]));

  const previewMutation = usePreviewFinfluxCkycImport();
  const createJobMutation = useCreateFinfluxCkycUpdateJob();
  const jobQuery = useGetFinfluxCkycUpdateJob(
    { jobId: jobId || 'pending' },
    {
      query: {
        enabled: Boolean(jobId) && !batchIsActive,
        queryKey: getGetFinfluxCkycUpdateJobQueryKey({ jobId: jobId || 'pending' }),
        refetchInterval: (query) => {
          if (batchIsActive) return false;
          const status = query.state.data?.status;
          return status === 'queued' || status === 'running' ? 1800 : false;
        },
      },
    },
  );
  const job = jobQuery.data;
  useEffect(() => {
    if (isNotFoundError(jobQuery.error)) {
      setJobId('');
      try {
        window.sessionStorage.removeItem(JOB_STORAGE_KEY);
      } catch {
        // The job monitor can still recover on this page if storage is unavailable.
      }
      return;
    }
    if (job?.status === 'completed' || job?.status === 'failed') {
      void queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
      if (!batchIsActive) void queryClient.invalidateQueries();
    }
  }, [batchIsActive, job?.status, jobQuery.error, queryClient]);
  const displayedJob = batchIsActive
    ? batchProgress?.activeJob ?? job
    : job || batchProgress?.activeJob;
  const records: FinfluxSubmissionRecord[] = mode === 'clients'
    ? validSelected.map(({ clientId, ckycNumber }) => ({ clientId, ckycNumber }))
    : validPreview.map((row) => ({
        clientId: row.clientId as string,
        ckycNumber: row.ckycNumber as string,
        sourceRowNumber: row.rowNumber,
      }));
  const invalidSelectedCount = selectedList.length - validSelected.length;
  const canSubmit = Boolean(
    username.trim() &&
    password &&
    records.length > 0 &&
    (mode === 'clients' || records.length <= FINFLUX_JOB_LIMIT) &&
    !createJobMutation.isPending &&
    !selectionBusy
  );

  const toggleClient = (client: Client) => {
    if (!canEditSelectedRecords) return;
    setSelectedRecords((current) => {
      if (current[client.ClientID]) {
        const next = { ...current };
        delete next[client.ClientID];
        return next;
      }
      return { ...current, [client.ClientID]: { clientId: client.ClientID, ckycNumber: client.ckycNumber || '', clientName: client.ClientName } };
    });
  };

  const updateClientNumber = (client: Client, value: string) => {
    if (!canEditSelectedRecords) return;
    setSelectedRecords((current) => ({ ...current, [client.ClientID]: { clientId: client.ClientID, ckycNumber: value, clientName: client.ClientName } }));
  };

  const toggleCurrentPage = () => {
    if (!canEditSelectedRecords) return;
    setSelectedRecords((current) => {
      const next = { ...current };
      if (currentPageSelected) {
        clients.forEach((client) => { delete next[client.ClientID]; });
      } else {
        clients.forEach((client) => { next[client.ClientID] = { clientId: client.ClientID, ckycNumber: current[client.ClientID]?.ckycNumber ?? client.ckycNumber ?? '', clientName: client.ClientName }; });
      }
      return next;
    });
  };

  const selectAllMatching = async () => {
    if (!canEditSelectedRecords || !total || selectingAll) return;
    setSelectingAll(true);
    setSelectionError('');
    const next = { ...selectedRecords };

    try {
      const pageCount = Math.ceil(total / SELECT_ALL_PAGE_SIZE);
      for (let requestedPage = 1; requestedPage <= pageCount; requestedPage += 1) {
        const response = await listClients({
          search: search.trim() || undefined,
          page: requestedPage,
          pageSize: SELECT_ALL_PAGE_SIZE,
          finfluxGroup,
        });
        if (response.items.length === 0 && requestedPage <= pageCount) {
          throw new Error('The matching client list changed while it was loading. Please try again.');
        }
        response.items.forEach((client) => {
          const existing = next[client.ClientID];
          next[client.ClientID] = {
            clientId: client.ClientID,
            ckycNumber: existing?.ckycNumber ?? client.ckycNumber ?? '',
            clientName: client.ClientName,
          };
        });
      }
      setSelectedRecords(next);
    } catch (error) {
      setSelectionError(errorMessage(error));
    } finally {
      setSelectingAll(false);
    }
  };

  const readFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileError('');
    setPreview(undefined);
    setFileName(file.name);
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.csv') && !lowerName.endsWith('.xlsx')) {
      setFileError('Choose a .csv or .xlsx file.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileError('This file is larger than 15 MB. Choose a smaller export.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      previewMutation.mutate({ data: { fileName: file.name, fileContentBase64: base64 } }, {
        onSuccess: (response) => setPreview(response),
        onError: (error) => setFileError(errorMessage(error)),
      });
    };
    reader.onerror = () => setFileError('This file could not be read. Choose it again or use another export.');
    reader.readAsDataURL(file);
  };

  const runSequentialBatches = async (
    batchRecords: FinfluxSubmissionRecord[],
    credentials: { username: string; password: string },
    removeSuccessfulFromClientSelection: boolean,
  ) => {
    const totalBatches = Math.ceil(batchRecords.length / FINFLUX_BATCH_SIZE);
    const successfulClientIds = new Set<string>();
    const combinedResults: FinfluxCkycUpdateJob['results'] = [];
    const reportedBatchIds = new Set<string>();
    let completedRecords = 0;
    let successCount = 0;
    let failureCount = 0;
    let inFlightRecords = 0;
    let inFlightSuccessCount = 0;
    let inFlightFailureCount = 0;
    let finalStatus: BatchProgress['status'] = 'completed';
    let finalError: string | undefined;
    let latestPolledJob: FinfluxCkycUpdateJob | undefined;
    let currentBatchOffset = 0;
    const addBatchResults = (job: FinfluxCkycUpdateJob) => {
      if (reportedBatchIds.has(job.id)) return;
      reportedBatchIds.add(job.id);
      combinedResults.push(...job.results.map((result) => ({
        ...result,
        rowNumber:
          batchRecords[currentBatchOffset + result.rowNumber - 1]?.sourceRowNumber ??
          currentBatchOffset + result.rowNumber,
      })));
    };
    stopAfterCurrentBatch.current = false;
    setBatchReport(undefined);
    setBatchProgress({
      status: 'running',
      totalRecords: batchRecords.length,
      totalBatches,
      currentBatch: 0,
      completedRecords: 0,
      successCount: 0,
      failureCount: 0,
    });

    try {
      for (let offset = 0; offset < batchRecords.length; offset += FINFLUX_BATCH_SIZE) {
        const batchNumber = Math.floor(offset / FINFLUX_BATCH_SIZE) + 1;
        if (stopAfterCurrentBatch.current && offset > 0) {
          finalStatus = 'stopped';
          break;
        }
        inFlightRecords = 0;
        inFlightSuccessCount = 0;
        inFlightFailureCount = 0;
        currentBatchOffset = offset;
        latestPolledJob = undefined;
        const batch = batchRecords.slice(offset, offset + FINFLUX_BATCH_SIZE);
        setBatchProgress((current) => current ? { ...current, currentBatch: batchNumber, activeJob: undefined } : current);

        const accepted = await createJobMutation.mutateAsync({
          data: {
            credentials,
            records: batch.map(({ clientId, ckycNumber }) => ({ clientId, ckycNumber })),
          },
        });
        setPassword('');
        setJobId(accepted.id);
        try {
          window.sessionStorage.setItem(JOB_STORAGE_KEY, accepted.id);
        } catch {
          // The active job can still be monitored while this page remains open.
        }

        let currentJob: FinfluxCkycUpdateJob;
        let pollFailures = 0;
        while (true) {
          try {
            currentJob = await getFinfluxCkycUpdateJob({ jobId: accepted.id });
            pollFailures = 0;
            latestPolledJob = currentJob;
          } catch {
            pollFailures += 1;
            if (pollFailures >= 5) {
              throw new Error(`Could not confirm the result of batch ${batchNumber}. Check its job results before retrying.`);
            }
            await new Promise((resolve) => window.setTimeout(resolve, 1800));
            continue;
          }

          currentJob.results.forEach((result) => {
            if (result.status === 'success') successfulClientIds.add(result.clientId);
          });
          inFlightRecords = currentJob.processed;
          inFlightSuccessCount = currentJob.successCount;
          inFlightFailureCount = currentJob.failureCount;
          setBatchProgress((current) => current ? {
            ...current,
            currentBatch: batchNumber,
            completedRecords: completedRecords + currentJob.processed,
            successCount: successCount + currentJob.successCount,
            failureCount: failureCount + currentJob.failureCount,
            activeJob: currentJob,
          } : current);
          if (currentJob.status === 'completed' || currentJob.status === 'failed') break;
          await new Promise((resolve) => window.setTimeout(resolve, 1800));
        }

        completedRecords += inFlightRecords;
        successCount += inFlightSuccessCount;
        failureCount += inFlightFailureCount;
        addBatchResults(currentJob);
        latestPolledJob = undefined;
        inFlightRecords = 0;
        inFlightSuccessCount = 0;
        inFlightFailureCount = 0;
        if (currentJob.status === 'failed') {
          finalStatus = 'failed';
          finalError = currentJob.error || `Batch ${batchNumber} failed. Later batches were not sent.`;
          break;
        }
        if (currentJob.successCount === 0 && currentJob.failureCount > 0) {
          finalStatus = 'failed';
          finalError = `Batch ${batchNumber} had no accepted records. Later batches were not sent; review its row results before retrying.`;
          break;
        }
        if (stopAfterCurrentBatch.current && batchNumber < totalBatches) {
          finalStatus = 'stopped';
          break;
        }
      }
    } catch (error) {
      finalStatus = 'failed';
      finalError = errorMessage(error);
      completedRecords += inFlightRecords;
      successCount += inFlightSuccessCount;
      failureCount += inFlightFailureCount;
      if (latestPolledJob) addBatchResults(latestPolledJob);
    } finally {
      setPassword('');
      if (combinedResults.length > 0) {
        setBatchReport({ batchCount: reportedBatchIds.size, results: combinedResults });
      }
      if (removeSuccessfulFromClientSelection && successfulClientIds.size > 0) {
        setSelectedRecords((current) => {
          const next = { ...current };
          successfulClientIds.forEach((clientId) => { delete next[clientId]; });
          return next;
        });
      }
      await queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
      setBatchProgress((current) => current ? {
        ...current,
        status: finalStatus,
        completedRecords,
        successCount,
        failureCount,
        error: finalError,
      } : current);
      stopAfterCurrentBatch.current = false;
    }
  };

  const submit = () => {
    setSubmitError('');
    if (!username.trim()) { setSubmitError('Enter the Finflux username before submitting.'); return; }
    if (!password) { setSubmitError('Enter the Finflux password before submitting.'); return; }
    if (!records.length) { setSubmitError(mode === 'clients' ? 'Select at least one valid client row.' : 'There are no eligible rows in this preview.'); return; }
    if (mode === 'file' && records.length > FINFLUX_JOB_LIMIT) { setSubmitError('File imports are limited to 1,000 eligible rows. Split the file into smaller files.'); return; }
    const usesBatches = records.length > FINFLUX_BATCH_SIZE;
    const confirmed = window.confirm(
      usesBatches
        ? `Send ${records.length.toLocaleString('en-IN')} CKYC identifiers to Finflux in ${Math.ceil(records.length / FINFLUX_BATCH_SIZE)} sequential jobs of up to 100 records? These writes cannot be undone from CKYC Manager. Keep this page open until all batches finish.`
        : `Send ${records.length} CKYC identifier${records.length === 1 ? '' : 's'} to Finflux? This uses LMS ClientID and cannot be undone from CKYC Manager. Continue only if the selected records or import preview are correct.`,
    );
    if (!confirmed) return;
    setBatchProgress(undefined);
    setBatchReport(undefined);
    if (usesBatches) {
      void runSequentialBatches(
        records,
        { username: username.trim(), password },
        mode === 'clients',
      );
      return;
    }
    createJobMutation.mutate({
      data: {
        credentials: { username: username.trim(), password },
        records: records.map(({ clientId, ckycNumber }) => ({ clientId, ckycNumber })),
      },
    }, {
      onSuccess: (accepted) => {
        setPassword('');
        setJobId(accepted.id);
        try {
          window.sessionStorage.setItem(JOB_STORAGE_KEY, accepted.id);
        } catch {
          // The active page can still monitor the job if browser storage is unavailable.
        }
      },
      onError: (error) => setSubmitError(isAuthError(error) ? 'Finflux did not accept these credentials. Check the username and password, then try again.' : errorMessage(error)),
    });
  };

  return (
    <div className="animate-fade">
      <PageIntro
        eyebrow="Finflux / CKYC identifier delivery"
        title="One write. Clear results."
        description="Review saved CKYC results or validate an import, then send only the records you approve to Finflux. The LMS ClientID is used as the outgoing identifier."
        action={<div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-[#eef7f4] px-3 py-2 text-[10px] font-semibold text-[#286e5f]"><ShieldCheck size={15} /><span>Review before write</span></div>}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <button onClick={() => setMode('clients')} disabled={selectionBusy} className={`rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${mode === 'clients' ? 'border-primary/45 bg-[#eef7f4] shadow-xs' : 'border-border bg-card hover:bg-secondary/40'}`} aria-pressed={mode === 'clients'} data-testid="button-mode-clients">
          <div className="flex items-start justify-between gap-3"><span className={`grid size-9 place-items-center rounded-lg ${mode === 'clients' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-primary'}`}><Database size={17} /></span>{mode === 'clients' && <Check size={16} className="text-primary" />}</div>
          <p className="mt-3 text-[13px] font-semibold">Use saved CKYC results</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Browse the LMS register and edit the outgoing number before selection.</p>
        </button>
        <button onClick={() => setMode('file')} disabled={selectionBusy} className={`rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${mode === 'file' ? 'border-primary/45 bg-[#eef7f4] shadow-xs' : 'border-border bg-card hover:bg-secondary/40'}`} aria-pressed={mode === 'file'} data-testid="button-mode-file">
          <div className="flex items-start justify-between gap-3"><span className={`grid size-9 place-items-center rounded-lg ${mode === 'file' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-primary'}`}><FileSpreadsheet size={17} /></span>{mode === 'file' && <Check size={16} className="text-primary" />}</div>
          <p className="mt-3 text-[13px] font-semibold">Preview an import file</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Validate a CSV or XLSX with the exact client_id and ckyc_number headers.</p>
        </button>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(330px,.8fr)]">
        <div className="space-y-5">
          {mode === 'clients' ? (
            <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs" aria-label="Select LMS clients">
              <div className="border-b border-border px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-primary">Source register</p><h3 className="mt-1 font-display text-[20px] font-semibold">Choose client records</h3><p className="mt-1 text-[11px] text-muted-foreground">Outgoing client ID: LMS ClientID. Database IDs are not sent.</p></div><div className="rounded-lg bg-secondary px-3 py-2 text-right"><p className="font-mono-ui text-[9px] uppercase tracking-[.12em] text-muted-foreground">Selected</p><p className="font-mono-ui text-[18px] font-semibold text-primary">{selectedList.length}</p></div></div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <label className="sm:w-[225px]">
                    <span className="sr-only">Filter CKYC readiness group</span>
                    <select value={finfluxGroup} disabled={selectionBusy} onChange={(event) => { setFinfluxGroup(event.target.value as FinfluxGroup); setSelectedRecords({}); setSelectionError(''); setPage(1); }} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-[11px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60" data-testid="select-finflux-group">
                      <option value="finalCkyc">Final CKYC update</option>
                      <option value="requestIdUpdated">Request ID updated</option>
                      <option value="recordsPending">Records pending</option>
                    </select>
                  </label>
                  <label className="relative min-w-0 flex-1">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <span className="sr-only">Search clients</span>
                    <input value={search} disabled={selectionBusy} onChange={(event) => { setSearch(event.target.value); setSelectionError(''); setPage(1); }} placeholder="Search name, loan ID or ClientID" className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-[11px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60" data-testid="input-search-finflux-clients" />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={toggleCurrentPage} disabled={!clients.length || !canEditSelectedRecords || selectionBusy} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-[11px] font-semibold hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-select-page">
                      <ListChecks size={14} /> {currentPageSelected ? 'Clear page' : 'Select page'}
                    </button>
                    <button type="button" onClick={() => void selectAllMatching()} disabled={!total || !canEditSelectedRecords || selectionBusy} aria-label={`Select all ${total.toLocaleString('en-IN')} matching eligible clients across all pages`} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-primary/25 bg-secondary px-3 text-[11px] font-semibold text-primary hover:bg-accent/70 disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-select-all-clients">
                      <ListChecks size={14} /> {selectingAll ? 'Loading clients…' : `Select all ${total.toLocaleString('en-IN')}`}
                    </button>
                    {selectedList.length > 0 && <button type="button" disabled={selectionBusy} onClick={() => { setSelectedRecords({}); setSelectionError(''); }} className="inline-flex h-10 items-center justify-center rounded-lg px-2 text-[11px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-clear-all-selection">
                      Clear selection
                    </button>}
                  </div>
                </div>
                {selectionError && <div className="mt-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-[11px] text-destructive" role="alert">{selectionError}</div>}
                {!canEditSelectedRecords && <p className="mt-3 rounded-lg border border-[#eadcae] bg-[#fff8e5] px-3 py-2 text-[10px] leading-5 text-[#81651c]">These clients do not have a final CKYC number yet, so they are view-only and cannot be sent to FinFlux.</p>}
              </div>
              {clientsQuery.isError ? <div className="p-5"><QueryError onRetry={() => clientsQuery.refetch()} /></div> : clientsQuery.isLoading ? <div className="space-y-3 p-5">{[1, 2, 3, 4, 5].map((item) => <div key={item} className="h-[72px] animate-pulse rounded-lg bg-muted" />)}</div> : clients.length === 0 ? <EmptyState icon={Database} title={search ? 'No clients match this search' : 'No LMS clients available'} detail={search ? 'Try a ClientID, name or loan ID with fewer terms.' : 'Import LMS rows before preparing a Finflux update.'} /> : (
                <>
                  <div className="overflow-x-auto"><table className="data-table w-full min-w-[780px] text-left"><thead className="bg-secondary/45"><tr className="border-b border-border text-muted-foreground"><th className="w-12 px-5 py-3"><span className="sr-only">Select</span></th><th className="px-3 py-3">Client</th><th className="px-3 py-3">Loan ID</th><th className="px-3 py-3">FinFlux status</th><th className="px-3 py-3">Outgoing CKYC number</th></tr></thead><tbody className="divide-y divide-border">{clients.map((client) => {
                    const selected = selectedRecords[client.ClientID];
                    return <tr key={client.id} className={`transition-colors ${selected ? 'bg-[#f4faf8]' : 'hover:bg-secondary/30'}`} data-testid={`row-finflux-client-${client.id}`}>
                      <td className="px-5 py-4"><input type="checkbox" checked={Boolean(selected)} disabled={!canEditSelectedRecords || selectionBusy} onChange={() => toggleClient(client)} aria-label={`Select ${client.ClientName}`} className="size-4 accent-[hsl(var(--primary))] disabled:cursor-not-allowed disabled:opacity-40" data-testid={`checkbox-finflux-client-${client.id}`} /></td>
                      <td className="px-3 py-4"><div className="flex items-center gap-2.5"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#dcefeb] font-mono-ui text-[9px] font-semibold text-primary">{initials(client.ClientName)}</span><div><p className="text-[12px] font-semibold">{client.ClientName}</p><p className="mt-0.5 font-mono-ui text-[10px] text-muted-foreground">{client.ClientID}</p></div></div></td>
                      <td className="px-3 py-4 font-mono-ui text-[10px] text-muted-foreground">{client.loanid}</td>
                      <td className="px-3 py-4">{client.finfluxCkycUpdatedAt ? <><span className="inline-flex rounded-full bg-[#dcf3e9] px-2 py-1 font-mono-ui text-[8px] font-semibold uppercase tracking-[.08em] text-[#31734d]">Updated</span>{client.finfluxResourceId && <p className="mt-1 font-mono-ui text-[9px] text-muted-foreground">Resource ID {client.finfluxResourceId}</p>}</> : client.ckycNumber ? <span className="inline-flex rounded-full bg-[#fff0c9] px-2 py-1 font-mono-ui text-[8px] font-semibold uppercase tracking-[.08em] text-[#9d761f]">Pending</span> : <span className="inline-flex rounded-full bg-secondary px-2 py-1 font-mono-ui text-[8px] font-semibold uppercase tracking-[.08em] text-muted-foreground">Final CKYC required</span>}</td>
                      <td className="px-3 py-4"><label><span className="sr-only">CKYC number for {client.ClientName}</span><input value={selected?.ckycNumber ?? client.ckycNumber ?? ''} disabled={!canEditSelectedRecords || selectionBusy} onChange={(event) => updateClientNumber(client, event.target.value)} placeholder="Enter CKYC number" className={`h-9 w-full max-w-[205px] rounded-md border bg-background px-2.5 font-mono-ui text-[11px] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60 ${selected && !selected.ckycNumber.trim() ? 'border-[#d2a94b]' : 'border-input'}`} data-testid={`input-finflux-ckyc-${client.id}`} /></label>{client.ckycNumber && <p className="mt-1 text-[9px] text-primary">Saved final CKYC prefilled</p>}</td>
                    </tr>;
                  })}</tbody></table></div>
                  <div className="flex items-center justify-between border-t border-border px-5 py-3"><p className="font-mono-ui text-[10px] text-muted-foreground">{total ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}` : '0 clients'}</p><div className="flex items-center gap-1"><button disabled={page <= 1 || selectionBusy} onClick={() => setPage((current) => current - 1)} className="grid size-8 place-items-center rounded-md border border-border hover:bg-secondary disabled:opacity-30" aria-label="Previous client page" data-testid="button-finflux-previous-page"><ChevronLeft size={15} /></button><span className="px-2 font-mono-ui text-[10px] text-muted-foreground">{page} / {pageCount}</span><button disabled={page >= pageCount || selectionBusy} onClick={() => setPage((current) => current + 1)} className="grid size-8 place-items-center rounded-md border border-border hover:bg-secondary disabled:opacity-30" aria-label="Next client page" data-testid="button-finflux-next-page"><ChevronRight size={15} /></button></div></div>
                </>
              )}
            </section>
          ) : (
            <section className="rounded-xl border border-border bg-card p-5 shadow-xs" aria-label="Upload Finflux CKYC import">
              <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-lg bg-secondary text-primary"><UploadCloud size={18} /></span><div><p className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-primary">Source file</p><h3 className="mt-1 font-display text-[20px] font-semibold">Validate before sending</h3><p className="mt-1 max-w-[560px] text-[11px] leading-5 text-muted-foreground">The preview service checks the exact headers and each row. Nothing is written to Finflux until you submit with credentials.</p></div></div>
               <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-primary/35 bg-[#f4faf8] px-4 py-4 transition-colors hover:border-primary dark:bg-secondary/30" data-testid="input-finflux-file"><span className="grid size-9 place-items-center rounded-md bg-card text-primary"><FileSpreadsheet size={17} /></span><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold">{fileName || 'Choose CSV or XLSX'}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{previewMutation.isPending ? 'Reading and validating rows…' : 'Required headers: client_id, ckyc_number · Max 15 MB'}</span></span><input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={readFile} data-testid="file-input-finflux" /></label>
              {fileError && <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px] leading-5 text-destructive" role="alert"><CircleAlert size={14} className="mt-0.5 shrink-0" />{fileError}</div>}
              {previewMutation.isPending && <div className="mt-4 space-y-2" aria-label="Loading preview"><div className="h-10 animate-pulse rounded-md bg-muted" /><div className="h-10 animate-pulse rounded-md bg-muted" /><div className="h-10 animate-pulse rounded-md bg-muted" /></div>}
            </section>
          )}
          {mode === 'file' && preview && <FilePreview preview={preview} onClear={() => { setPreview(undefined); setFileName(''); setFileError(''); }} />}
          {batchProgress && (
            <section className="rounded-xl border border-primary/20 bg-[#eef7f4] p-4" aria-live="polite" data-testid="panel-finflux-batch-progress">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-primary">Sequential batch run</p>
                  <p className="mt-1 text-[13px] font-semibold text-foreground">
                    {batchProgress.status === 'running' || batchProgress.status === 'stopping'
                      ? `Batch ${Math.max(1, batchProgress.currentBatch)} of ${batchProgress.totalBatches}`
                      : batchProgress.status === 'completed'
                        ? 'All batches finished'
                        : batchProgress.status === 'stopped'
                          ? 'Stopped after the current batch'
                          : 'Batch run stopped'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {batchReport && (
                    <button
                      type="button"
                      onClick={() => downloadResultsReport(batchReport.results, `finflux-ckyc-batch-run-${batchReport.batchCount}-jobs.csv`)}
                      className="rounded-lg border border-border bg-card px-3 py-2 text-[10px] font-semibold text-foreground hover:bg-secondary"
                      data-testid="button-download-finflux-batch-report"
                    >
                      <Download size={13} className="mr-1.5 inline" /> Download {batchReport.results.length.toLocaleString('en-IN')} results
                    </button>
                  )}
                  {(batchProgress.status === 'running' || batchProgress.status === 'stopping') && (
                    <button
                      type="button"
                      disabled={batchProgress.status === 'stopping'}
                      onClick={() => {
                        stopAfterCurrentBatch.current = true;
                        setBatchProgress((current) => current ? { ...current, status: 'stopping' } : current);
                      }}
                      className="rounded-lg border border-border bg-card px-3 py-2 text-[10px] font-semibold text-foreground hover:bg-secondary disabled:opacity-50"
                      data-testid="button-stop-finflux-batches"
                    >
                      {batchProgress.status === 'stopping' ? 'Stopping after this batch…' : 'Stop after this batch'}
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between font-mono-ui text-[10px] text-muted-foreground">
                <span>{batchProgress.completedRecords.toLocaleString('en-IN')} / {batchProgress.totalRecords.toLocaleString('en-IN')} processed</span>
                <span>{batchProgress.totalRecords ? Math.round((batchProgress.completedRecords / batchProgress.totalRecords) * 100) : 0}%</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#d9e8e3]">
                <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${batchProgress.totalRecords ? Math.min(100, (batchProgress.completedRecords / batchProgress.totalRecords) * 100) : 0}%` }} />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono-ui text-[10px]">
                <span className="text-primary">Accepted {batchProgress.successCount.toLocaleString('en-IN')}</span>
                <span className="text-destructive">Rejected {batchProgress.failureCount.toLocaleString('en-IN')}</span>
                <span className="text-muted-foreground">Each batch contains up to 100 records</span>
              </div>
              {batchProgress.error && <p className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px] leading-5 text-destructive" role="alert">{batchProgress.error}</p>}
              {batchProgress.status === 'stopped' && batchProgress.completedRecords < batchProgress.totalRecords && <p className="mt-2 text-[10px] leading-4 text-muted-foreground">The remaining selected records were not sent. You can review the current job and start another run for the remaining rows.</p>}
              {batchProgress.status === 'failed' && <p className="mt-2 text-[10px] leading-4 text-muted-foreground">Later batches were not sent. Check the current job results before retrying.</p>}
              <p className="mt-2 text-[10px] leading-4 text-muted-foreground">The detailed result table below shows the current or most recent batch.</p>
            </section>
          )}
          <JobPanel job={displayedJob} onDownload={() => displayedJob && downloadJobReport(displayedJob)} onRetry={() => jobQuery.refetch()} />
          {jobQuery.isError && <QueryError onRetry={() => jobQuery.refetch()} />}
        </div>

        <aside className="space-y-5 xl:sticky xl:top-[92px]">
          <form
            onSubmit={(event) => { event.preventDefault(); submit(); }}
            className="rounded-xl border border-border bg-card p-5 shadow-xs"
            aria-label="Finflux credentials and submission"
          >
            <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-lg bg-[#fff4db] text-[#8c641d]"><KeyRound size={18} /></span><div><p className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-[#8c641d]">Step 02 / Authenticate</p><h3 className="mt-1 font-display text-[20px] font-semibold">Authorize the write</h3><p className="mt-1 text-[11px] leading-5 text-muted-foreground">For multiple batches, credentials stay in temporary page memory until the run finishes. They are never written to browser storage.</p></div></div>
            <div className="mt-5 space-y-3"><label className="block"><span className="classic-label">Finflux username</span><input name="username" value={username} onChange={(event) => setUsername(event.target.value)} disabled={selectionBusy} autoComplete="username" className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-[12px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60" data-testid="input-finflux-username" /></label><label className="block"><span className="classic-label">Finflux password</span><input name="password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={selectionBusy} type="password" autoComplete="current-password" className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-[12px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60" data-testid="input-finflux-password" /></label></div>
            <div className="mt-4 rounded-lg border border-border bg-secondary/35 p-3"><div className="flex items-center gap-2 text-[10px] font-semibold text-foreground"><LockKeyhole size={13} className="text-primary" /> Credentials are not persisted</div><p className="mt-1.5 pl-5 text-[10px] leading-4 text-muted-foreground">No username, password or Finflux token is written to browser storage.</p></div>
            {submitError && <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px] leading-5 text-destructive" role="alert"><CircleAlert size={14} className="mt-0.5 shrink-0" />{submitError}</div>}
            <button type="submit" disabled={!canSubmit} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-[12px] font-bold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45" data-testid="button-submit-finflux-update"><Send size={15} />{batchIsActive ? `Sending batch ${batchProgress?.currentBatch || 1} of ${batchProgress?.totalBatches || 1}…` : createJobMutation.isPending ? 'Authenticating…' : `Send ${records.length || 0} record${records.length === 1 ? '' : 's'} to Finflux`}</button>
            {records.length > FINFLUX_BATCH_SIZE && !batchIsActive && <p className="mt-2 text-[10px] leading-4 text-muted-foreground">Will send in {Math.ceil(records.length / FINFLUX_BATCH_SIZE)} sequential batches of up to 100. Keep this page open until the run finishes.</p>}
            {mode === 'file' && records.length > FINFLUX_JOB_LIMIT && <p className="mt-2 text-[10px] text-destructive">File imports are limited to 1,000 eligible rows per file. Split the file into smaller files.</p>}
          </form>
          <section className="rounded-xl border border-border bg-[#f7f5ef] p-5 dark:bg-card" aria-label="Submission summary">
            <div className="flex items-center gap-2"><ListChecks size={15} className="text-primary" /><p className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-muted-foreground">Ready to send</p></div>
            <div className="mt-3 space-y-2 text-[11px]"><div className="flex items-center justify-between"><span className="text-muted-foreground">Eligible records</span><strong className="font-mono-ui text-primary">{records.length}</strong></div><div className="flex items-center justify-between"><span className="text-muted-foreground">Excluded / incomplete</span><strong className="font-mono-ui">{mode === 'clients' ? invalidSelectedCount : (preview?.invalidCount ?? 0)}</strong></div><div className="flex items-center justify-between"><span className="text-muted-foreground">Outgoing identifier</span><strong className="font-mono-ui">ClientID</strong></div></div>
            {mode === 'clients' && invalidSelectedCount > 0 && <p className="mt-3 border-t border-border pt-3 text-[10px] leading-4 text-[#8c641d]">Selected rows without a CKYC number remain visible but will be excluded.</p>}
            {mode === 'file' && preview && !validPreview.length && <p className="mt-3 border-t border-border pt-3 text-[10px] leading-4 text-destructive">No valid rows can be submitted from this preview.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}