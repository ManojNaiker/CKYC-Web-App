import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Database, Download, FileSpreadsheet, Search, SlidersHorizontal, UploadCloud, X } from 'lucide-react';
import { exportClients, getListClientsQueryKey, useImportClients, useListClients } from '@workspace/api-client-react';
import type { ClientInput } from '@workspace/api-client-react';
import { PageIntro, EmptyState, QueryError } from '@/components/workspace-shell';
import { LMS_HEADERS, parseCsv, REQUIRED_LMS_VALUES } from '@/lib/csv';

const PAGE_SIZE = 12;
const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'matched', label: 'ID received' },
  { value: 'error', label: 'No ID / error' },
  { value: 'awaiting', label: 'Awaiting response' },
] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number]['value'];
type ClientRegisterFilters = {
  search: string;
  status: StatusFilter;
  page: number;
};

const DEFAULT_CLIENT_REGISTER_FILTERS: ClientRegisterFilters = {
  search: '',
  status: '',
  page: 1,
};

function parseClientRegisterFilters(query: string): ClientRegisterFilters {
  const params = new URLSearchParams(query);
  const requestedStatus = params.get('status') ?? '';
  const status = STATUS_OPTIONS.some((option) => option.value === requestedStatus)
    ? (requestedStatus as StatusFilter)
    : '';
  const requestedPage = params.get('page');
  const parsedPage = requestedPage ? Number(requestedPage) : NaN;
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0
    ? parsedPage
    : DEFAULT_CLIENT_REGISTER_FILTERS.page;

  return {
    search: params.get('search') ?? DEFAULT_CLIENT_REGISTER_FILTERS.search,
    status,
    page,
  };
}

function serializeClientRegisterFilters(filters: ClientRegisterFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.status) params.set('status', filters.status);
  if (filters.page > 1) params.set('page', String(filters.page));
  return params.toString();
}

function ImportPanel({ onDone, onImported }: { onDone: () => void; onImported: () => void }) {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ClientInput[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [missingHeaders, setMissingHeaders] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const importClients = useImportClients();

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseCsv(String(reader.result ?? ''));
        setHeaders(parsed.headers);
        setRows(parsed.rows);
        setMissingHeaders(parsed.missingHeaders);
        setMessage('');
      } catch (error) {
        setHeaders([]);
        setRows([]);
        setMissingHeaders([...LMS_HEADERS]);
        setMessage(
          error instanceof Error
            ? `Could not parse this CSV. ${error.message} Choose another file and try again.`
            : 'Could not parse this CSV. Check that quoted values are closed, then choose another file.',
        );
      }
    };
    reader.readAsText(file);
  };
  const submit = () => {
    if (!rows.length) { setMessage('Choose a CSV with at least one client row.'); return; }
    importClients.mutate({ data: { fileName, headers, rows } }, { onSuccess: (result) => {
      const countMessage = `${result.imported} rows imported${result.duplicates ? `, ${result.duplicates} duplicate${result.duplicates === 1 ? '' : 's'} ignored` : ''}${result.skipped ? `, ${result.skipped} skipped` : ''}.`;
      const reasonMessage = missingHeaders.length
        ? ` Missing required columns: ${missingHeaders.join(', ')}.`
        : result.skipped
          ? ` Skipped rows must include: ${REQUIRED_LMS_VALUES.join(', ')}.`
          : '';
      setMessage(`${countMessage}${reasonMessage}`);
      onImported();
    }, onError: () => setMessage('Import could not be completed. Check the file columns and retry.') });
  };

  return <div className="rounded-xl border border-primary/25 bg-[#eff8f5] p-5 shadow-xs dark:bg-card"><div className="flex items-start justify-between gap-4"><div><p className="font-mono-ui text-[9px] uppercase tracking-[.18em] text-primary">New import</p><h3 className="mt-1 font-display text-[19px] font-bold tracking-[-.03em]">Bring in LMS rows</h3><p className="mt-1 text-[12px] leading-5 text-muted-foreground">Upload a CSV export to add rows to the working register.</p></div><button onClick={onDone} className="rounded-md p-1 text-muted-foreground hover:bg-card" aria-label="Close import panel" data-testid="button-close-import"><X size={17} /></button></div>
    <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-primary/35 bg-card px-4 py-3 transition-colors hover:border-primary" data-testid="input-import-file"><span className="grid size-9 place-items-center rounded-md bg-secondary text-primary"><FileSpreadsheet size={17} /></span><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold">{fileName || 'Select LMS CSV export'}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{rows.length ? `${rows.length} rows ready to import` : 'CSV format · max 20 MB'}</span></span><input type="file" accept=".csv,text/csv" className="sr-only" onChange={chooseFile} data-testid="file-input-clients" /></label>
     <div className="mt-4 flex items-center justify-between gap-3"><p className={`text-[11px] ${message.toLowerCase().includes('could not') || message.includes('Choose') ? 'text-destructive' : 'text-[#31734d]'}`} data-testid="status-import">{message}</p><button onClick={submit} disabled={importClients.isPending || !rows.length} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[12px] font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45" data-testid="button-submit-import">{importClients.isPending ? 'Importing…' : <><UploadCloud size={14} /> Import rows</>}</button></div>
  </div>;
}

export default function Clients() {
  const searchQuery = useSearch();
  const [, navigate] = useLocation();
  const filters = useMemo(() => parseClientRegisterFilters(searchQuery), [searchQuery]);
  const { search, page, status } = filters;
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const serializedFilters = useMemo(() => serializeClientRegisterFilters(filters), [filters]);

  useEffect(() => {
    const currentQuery = new URLSearchParams(searchQuery).toString();
    if (currentQuery !== serializedFilters) {
      navigate(`/clients${serializedFilters ? `?${serializedFilters}` : ''}`, { replace: true });
    }
  }, [navigate, searchQuery, serializedFilters]);

  const updateFilters = (updates: Partial<ClientRegisterFilters>) => {
    const nextFilters = { ...filters, ...updates };
    const nextQuery = serializeClientRegisterFilters(nextFilters);
    navigate(`/clients${nextQuery ? `?${nextQuery}` : ''}`, { replace: true });
  };
  const setPage = (nextPage: number | ((current: number) => number)) => {
    updateFilters({ page: typeof nextPage === 'function' ? nextPage(page) : nextPage });
  };

  const queryParams = { search: search || undefined, status: status || undefined, page, pageSize: PAGE_SIZE };
  const query = useListClients(queryParams, { query: { queryKey: getListClientsQueryKey(queryParams) } });
  const clients = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showing = useMemo(() => total ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}` : '0 clients', [page, total]);
  const hasFilters = Boolean(search || status);
  const downloadReport = async () => {
    setExporting(true);
    setExportError('');
    try {
      const csv = await exportClients({
        search: search || undefined,
        status: status || undefined,
      });
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `ckyc-client-results-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError('Report could not be downloaded. Please retry.');
    } finally {
      setExporting(false);
    }
  };

  return <div className="animate-fade"><PageIntro eyebrow="LMS client register" title="Know every record." description="Search the imported loan book before preparing a CKYC file. The register is the source of truth for what enters a request." action={<div className="flex flex-wrap gap-2"><button onClick={downloadReport} disabled={exporting || total === 0} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-[12px] font-bold text-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-45" data-testid="button-export-clients"><Download size={15} /> {exporting ? 'Preparing…' : 'Download report'}</button><button onClick={() => setImportOpen((open) => !open)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[12px] font-bold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5" data-testid="button-toggle-import"><UploadCloud size={15} /> Import LMS rows</button></div>} />
    {exportError && <p className="mb-4 text-[11px] text-destructive" role="alert" data-testid="status-export-error">{exportError}</p>}
    {importOpen && <div className="mb-6 animate-rise"><ImportPanel onDone={() => setImportOpen(false)} onImported={() => { void query.refetch(); }} /></div>}
     <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex max-w-[680px] flex-1 flex-col gap-3 sm:flex-row"><div className="relative min-w-0 flex-1"><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => updateFilters({ search: event.target.value, page: 1 })} placeholder="Search by name, loan ID, PAN or Client ID" className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-4 text-[12px] outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15" data-testid="input-search-clients" /></div><label className="relative flex h-11 shrink-0 items-center gap-2 rounded-lg border border-input bg-card px-3 text-[11px] text-muted-foreground focus-within:border-primary focus-within:ring-2 focus:ring-primary/15"><SlidersHorizontal size={14} className="text-primary" /><span className="sr-only">Filter by CKYC status</span><select value={status} onChange={(event) => updateFilters({ status: event.target.value as StatusFilter, page: 1 })} className="h-full min-w-[155px] appearance-none bg-transparent pr-5 text-[11px] font-semibold text-foreground outline-none" aria-label="Filter by CKYC status" data-testid="select-status-filter">{STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div><div className="flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[.11em] text-muted-foreground"><Database size={14} className="text-primary" /> {showing}</div></div>
      {query.isError ? <QueryError onRetry={() => query.refetch()} /> : query.isLoading ? <div className="overflow-hidden rounded-xl border border-border bg-card"><div className="space-y-3 p-5">{[1,2,3,4,5,6].map((i) => <div className="h-12 animate-pulse rounded-lg bg-muted" key={i} />)}</div></div> : clients.length === 0 ? <EmptyState icon={Database} title={hasFilters ? 'No matching clients' : 'Your client register is empty'} detail={hasFilters ? 'Try a different search or CKYC status filter.' : 'Import an LMS CSV export to create the working register.'} action={!hasFilters && <button onClick={() => setImportOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[12px] font-bold text-primary-foreground" data-testid="button-empty-import"><UploadCloud size={14} /> Import rows</button>} /> : <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs"><div className="overflow-x-auto"><table className="data-table w-full min-w-[1080px] text-left"><thead className="bg-secondary/55"><tr className="border-b border-border text-muted-foreground"><th className="px-5 py-3.5 font-medium">Client</th><th className="px-4 py-3.5 font-medium">Loan ID</th><th className="px-4 py-3.5 font-medium">PAN</th><th className="px-4 py-3.5 font-medium">Contact</th><th className="px-4 py-3.5 font-medium">CKYC response</th><th className="px-4 py-3.5 font-medium">Disbursed</th><th className="px-4 py-3.5 font-medium">Added</th><th className="px-3 py-3.5" /></tr></thead><tbody className="divide-y divide-border">{clients.map((client) => <tr className="group transition-colors hover:bg-secondary/30" key={client.id} data-testid={`row-client-${client.id}`}><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#dcefeb] font-mono-ui text-[10px] font-medium text-primary">{client.ClientName.split(' ').map((part) => part[0]).slice(0,2).join('')}</span><div><p className="text-[12px] font-semibold text-foreground">{client.ClientName}</p><p className="mt-0.5 font-mono-ui text-[10px] text-muted-foreground">{client.ClientID}</p></div></div></td><td className="px-4 font-mono-ui text-[11px] text-foreground/75">{client.loanid}</td><td className="px-4 font-mono-ui text-[11px] text-foreground/75">{client.Client_PAN || '—'}</td><td className="px-4"><p className="font-mono-ui text-[11px] text-foreground/75">{client.mobile_no || '—'}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{client.Gender} · {client.date_of_birth}</p></td><td className="max-w-[280px] px-4">{client.ckycResponseId ? <div data-testid={`status-ckyc-matched-${client.id}`}><span className="inline-flex rounded-full bg-[#e2f2e9] px-2 py-1 text-[9px] font-bold uppercase tracking-[.08em] text-[#31734d]">ID received</span><p className="mt-1 font-mono-ui text-[11px] font-semibold text-[#245b3d]">{client.ckycResponseId}</p></div> : client.ckycResponseStatus === 'error' ? <div data-testid={`status-ckyc-error-${client.id}`}><span className="inline-flex rounded-full bg-[#fff1d6] px-2 py-1 text-[9px] font-bold uppercase tracking-[.08em] text-[#9b6915]">No ID</span><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground" title={client.ckycResponseError ?? undefined}>{client.ckycResponseError}</p></div> : <span className="text-[10px] text-muted-foreground">Awaiting response</span>}</td><td className="px-4 font-mono-ui text-[10px] text-muted-foreground">{client.disbursedon_date}</td><td className="px-4 font-mono-ui text-[10px] text-muted-foreground">{new Intl.DateTimeFormat('en-IN', { day:'2-digit', month:'short' }).format(new Date(client.createdAt))}</td><td className="px-3"><Link href={`/requests?client=${client.id}`} className="grid size-8 place-items-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-secondary hover:text-primary group-hover:opacity-100" title="Use in request" data-testid={`link-use-client-${client.id}`}><ArrowRight size={15} /></Link></td></tr>)}</tbody></table></div><div className="flex items-center justify-between border-t border-border px-5 py-3"><p className="text-[11px] text-muted-foreground">Showing {showing}</p><div className="flex items-center gap-1"><button disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground disabled:opacity-30 hover:bg-secondary" aria-label="Previous page" data-testid="button-previous-page"><ChevronLeft size={15} /></button><span className="px-2 font-mono-ui text-[10px] text-muted-foreground">{page} / {pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)} className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground disabled:opacity-30 hover:bg-secondary" aria-label="Next page" data-testid="button-next-page"><ChevronRight size={15} /></button></div></div></div>}
  </div>;
}
