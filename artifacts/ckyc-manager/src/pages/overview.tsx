import { Link } from 'wouter';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  Database,
  FileCheck2,
  FileClock,
  FileDown,
  FileUp,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Users,
} from 'lucide-react';
import {
  getGetDashboardSummaryQueryKey,
  getListCkycDownloadRequestsQueryKey,
  getListCkycRequestsQueryKey,
  useGetDashboardSummary,
  useListCkycDownloadRequests,
  useListCkycRequests,
} from '@workspace/api-client-react';
import { EmptyState, QueryError } from '@/components/workspace-shell';

function formatDate(value?: string | null) {
  if (!value) return 'No activity yet';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-IN').format(value);
}

function formatPercent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function TotalTile({
  label,
  value,
  detail,
  icon: Icon,
  tone,
  surface,
  testId,
}: {
  label: string;
  value: number | string;
  detail: string;
  icon: typeof Database;
  tone: string;
  surface: string;
  testId: string;
}) {
  return (
    <div className={`min-h-[140px] min-w-0 rounded-2xl border p-4 shadow-sm transition-transform duration-200 hover:-translate-y-0.5 sm:p-5 ${surface}`} data-testid={testId}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-bold leading-4 text-foreground">{label}</p>
        <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${tone}`}>
          <Icon size={20} strokeWidth={1.9} />
        </span>
      </div>
      <p className="mt-2.5 font-display text-[28px] font-bold leading-none tracking-[-0.04em] text-foreground sm:text-[30px]">{value}</p>
      <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{detail}</p>
    </div>
  );
}

function ProgressRing({ value, count, label, color }: { value: number; count: number; label: string; color: string }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2.5">
      <div
        className="grid size-[92px] place-items-center rounded-full sm:size-[100px]"
         style={{ background: `conic-gradient(${color} ${safeValue * 3.6}deg, hsl(190 42% 91%) 0deg)` }}
        aria-label={`${label}: ${safeValue}%`}
      >
        <div className="grid size-[74px] place-items-center rounded-full bg-card text-center sm:size-[80px]">
          <span className="font-mono-ui text-[16px] font-bold text-foreground">{safeValue}%</span>
        </div>
      </div>
      <span className="text-center text-[11px] font-bold leading-4 text-foreground">{label}</span>
      <span className="text-center font-mono-ui text-[10px] text-muted-foreground sm:text-[11px]">{formatNumber(count)} {count === 1 ? 'record' : 'records'}</span>
    </div>
  );
}

function PendingErrorChart({
  errors,
  pendingCount,
}: {
  errors: { name: string; count: number }[];
  pendingCount: number;
}) {
  const maxCount = Math.max(...errors.map((error) => error.count), 1);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-xs sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono-ui text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Pending records</p>
          <h3 className="mt-1 font-display text-[24px] font-semibold tracking-[-.025em] text-foreground">Why records are pending</h3>
          <p className="mt-2 text-[12px] leading-6 text-muted-foreground">Pending records have neither a response ID nor a Final CKYC number.</p>
        </div>
        <div className="rounded-xl border border-[hsl(var(--warning)/.24)] bg-[hsl(var(--warning-bg))] px-4 py-3 text-right">
          <p className="font-mono-ui text-[21px] font-bold leading-none text-[hsl(var(--warning))]">{formatNumber(pendingCount)}</p>
          <p className="mt-1.5 font-mono-ui text-[9px] font-semibold uppercase tracking-[.1em] text-[hsl(var(--warning))]">pending</p>
        </div>
      </div>
      {errors.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-secondary/35 px-4 py-8 text-center text-[12px] text-muted-foreground">
          No pending error reasons.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {errors.map((error) => {
            const percent = formatPercent(error.count, pendingCount);
            const width = Math.max(3, Math.round((error.count / maxCount) * 100));
            return (
              <div key={error.name}>
                <div className="mb-2 flex items-start justify-between gap-4 text-[12px]">
                  <span className="min-w-0 leading-5 text-foreground">{error.name}</span>
                  <span className="shrink-0 font-mono-ui font-semibold text-foreground">{percent}% · {formatNumber(error.count)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--warning-bg))]">
                  <div className="h-full rounded-full bg-[hsl(var(--warning))] transition-all" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Overview() {
  const summary = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const requests = useListCkycRequests({ query: { queryKey: getListCkycRequestsQueryKey() } });
  const downloads = useListCkycDownloadRequests({ query: { queryKey: getListCkycDownloadRequestsQueryKey() } });
  const data = summary.data;
  const recent = requests.data?.slice(0, 7) ?? [];
  const totalClients = data?.totalClients ?? 0;
  const finalCkycUpdated = data?.finalCkycUpdated ?? 0;
  const requestIdUpdated = data?.requestIdUpdated ?? 0;
  const recordsPending = data?.recordsPending ?? 0;
  const finfluxUpdated = data?.finfluxUpdated ?? 0;
  const finfluxPending = data?.finfluxPending ?? 0;
  const finfluxFailed = data?.finfluxFailed ?? 0;
  const finfluxErrors = data?.finfluxErrors ?? [];
  const finfluxTotal = finfluxUpdated + finfluxFailed + finfluxPending;
  const dateLabel = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());

  return (
    <div className="animate-fade">
      {summary.isError ? <QueryError onRetry={() => summary.refetch()} /> : (
        <>
          <section className="mb-5 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
            <div>
               <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-primary/20 bg-secondary px-3 py-1.5 font-mono-ui text-[10px] font-semibold uppercase tracking-[.14em] text-primary">
                 <Sparkles size={14} /> Operations overview
              </div>
              <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
                 <h2 className="font-display text-[40px] font-semibold leading-none tracking-[-.045em] text-foreground sm:text-[48px]">Dashboard</h2>
                <p className="mb-1 font-mono-ui text-[10px] font-medium uppercase tracking-[.08em] text-muted-foreground">{dateLabel}</p>
              </div>
              <p className="mt-3 max-w-[660px] text-[14px] leading-6 text-muted-foreground">
                Keep every LMS record, CKYC request and response visible from one operational workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/requests" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-[12px] font-bold text-foreground shadow-xs hover:-translate-y-0.5 hover:bg-secondary" data-testid="link-view-requests">
                <FileClock size={17} className="text-primary" /> View requests
              </Link>
              <Link href="/clients" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-[12px] font-bold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5" data-testid="link-import-clients">
                <UploadCloud size={17} /> Import client rows
              </Link>
            </div>
          </section>

          <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {summary.isLoading || downloads.isLoading ? [1, 2, 3, 4].map((item) => <div className="h-[140px] animate-pulse rounded-2xl border border-border bg-card" key={item} />) : (
              <>
                 <TotalTile label="LMS clients" value={formatNumber(data?.totalClients ?? 0)} detail="Imported records" icon={Users} tone="bg-[hsl(var(--info-bg))] text-[hsl(var(--info))]" surface="border-[hsl(var(--info)/.22)] bg-[hsl(192_64%_95%)]" testId="metric-imported-clients" />
                 <TotalTile label="CKYC requests" value={data?.generatedRequests ?? 0} detail="Request files created" icon={FileClock} tone="bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]" surface="border-[hsl(183_50%_77%)] bg-[hsl(181_49%_94%)]" testId="metric-request-files" />
                 <TotalTile label="Responses uploaded" value={data?.responsesUploaded ?? 0} detail="Latest workbook ready" icon={FileCheck2} tone="bg-[hsl(var(--success-bg))] text-[hsl(var(--success))]" surface="border-[hsl(var(--success)/.22)] bg-[hsl(154_47%_96%)]" testId="metric-responses-uploaded" />
                 <TotalTile label="Download queue" value={downloads.data?.length ?? 0} detail="Nothing waiting" icon={FileDown} tone="bg-[hsl(var(--warning-bg))] text-[hsl(var(--warning))]" surface="border-[hsl(var(--warning)/.22)] bg-[hsl(43_80%_96%)]" testId="metric-download-queue" />
              </>
            )}
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
              <div className="flex items-start justify-between border-b border-border px-5 py-4 sm:px-6">
                <div>
                  <p className="font-mono-ui text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Latest tasks</p>
                  <h3 className="mt-1 font-display text-[24px] font-semibold tracking-[-.025em] text-foreground">Files to review in your workspace</h3>
                </div>
                <Link href="/requests" className="inline-flex whitespace-nowrap items-center gap-1 text-[12px] font-bold text-primary hover:underline" data-testid="link-view-all-requests">View all <ArrowRight size={15} /></Link>
              </div>
              {recent.length === 0 ? <div className="p-5"><EmptyState icon={FileClock} title="No request files yet" detail="Import client rows, then create your first CKYC search file." action={<Link href="/clients" className="text-[12px] font-bold text-primary underline underline-offset-4" data-testid="link-empty-import">Go to clients</Link>} /></div> : (
                <div className="divide-y divide-border">
                  <div className="hidden grid-cols-[minmax(0,1fr)_120px_110px] gap-4 border-b border-border bg-secondary/45 px-5 py-3 font-mono-ui text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground sm:grid">
                    <span>Task</span><span>Status</span><span>Created</span>
                  </div>
                  {recent.slice(0, 4).map((request) => (
                    <Link href={`/requests/${request.id}`} key={request.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-secondary/35 sm:grid-cols-[minmax(0,1fr)_120px_110px] sm:gap-4" data-testid={`link-recent-request-${request.id}`}>
                      <span className="flex min-w-0 items-center gap-3">
                        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${request.status === 'response_uploaded' ? 'bg-[#dcf3e9] text-[#287b59]' : 'bg-[#fff0c9] text-[#987016]'}`}><FileUp size={17} /></span>
                        <span className="min-w-0"><span className="block truncate font-mono-ui text-[11px] font-semibold text-foreground">{request.fileName}</span><span className="mt-1 block text-[10px] text-muted-foreground">{request.recordCount.toLocaleString('en-IN')} records</span></span>
                      </span>
                      <span className={`rounded-full px-2.5 py-1.5 text-center font-mono-ui text-[9px] font-semibold uppercase tracking-[.06em] ${request.status === 'response_uploaded' ? 'bg-[#dcf3e9] text-[#287b59]' : 'bg-[#fff0c9] text-[#896516]'}`}>{request.status === 'response_uploaded' ? 'Ready' : 'In progress'}</span>
                      <span className="hidden font-mono-ui text-[10px] text-muted-foreground sm:block">{formatDate(request.createdAt).split(',')[0]}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-xs sm:p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono-ui text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Workspace rhythm</p>
                  <h3 className="mt-1 font-display text-[24px] font-semibold tracking-[-.025em] text-foreground">Your CKYC pulse</h3>
                </div>
                <BarChart3 size={21} className="text-primary" />
              </div>
              <div className="mt-6 flex justify-around gap-3">
                 <ProgressRing value={formatPercent(finalCkycUpdated, totalClients)} count={finalCkycUpdated} label="Final CKYC update" color="#12836d" />
                 <ProgressRing value={formatPercent(requestIdUpdated, totalClients)} count={requestIdUpdated} label="Request ID updated" color="#1778a7" />
                 <ProgressRing value={formatPercent(recordsPending, totalClients)} count={recordsPending} label="Records pending" color="#a16b16" />
              </div>
              <div className="mt-7 border-t border-border pt-5">
                <p className="font-mono-ui text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">FinFlux record updates</p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-[#cfe9dc] bg-gradient-to-br from-[#e8f7ef] to-[#f7fcf9] p-4 sm:p-5" data-testid="finflux-updated-summary">
                    <div className="flex items-center gap-2 text-[#287b59]"><CheckCircle2 size={17} /><p className="text-[11px] font-bold uppercase tracking-[.08em]">Updated</p></div>
                    <p className="mt-2 font-display text-[25px] font-bold leading-none text-[#205d45] sm:text-[28px]">{formatNumber(finfluxUpdated)}</p>
                    <p className="mt-1.5 text-[10px] font-medium text-[#4f7b67]">of {formatNumber(finfluxTotal)} client records</p>
                  </div>
                  <div className="rounded-2xl border border-[#f0d3cf] bg-gradient-to-br from-[#fff0ed] to-[#fff9f8] p-4 sm:p-5" data-testid="finflux-failed-summary">
                    <div className="flex items-center gap-2 text-[#a23e36]"><p className="text-[11px] font-bold uppercase tracking-[.08em]">Failed</p></div>
                    <p className="mt-2 font-display text-[25px] font-bold leading-none text-[#8e332d] sm:text-[28px]">{formatNumber(finfluxFailed)}</p>
                    <p className="mt-1.5 text-[10px] font-medium text-[#a65d56]">of {formatNumber(finfluxTotal)} client records</p>
                  </div>
                  <div className="rounded-2xl border border-[#efdfb4] bg-gradient-to-br from-[#fff5d9] to-[#fffaf0] p-4 sm:p-5" data-testid="finflux-pending-summary">
                    <div className="flex items-center gap-2 text-[#896516]"><Clock3 size={17} /><p className="text-[11px] font-bold uppercase tracking-[.08em]">Pending</p></div>
                    <p className="mt-2 font-display text-[25px] font-bold leading-none text-[#775711] sm:text-[28px]">{formatNumber(finfluxPending)}</p>
                    <p className="mt-1.5 text-[10px] font-medium text-[#8c7340]">of {formatNumber(finfluxTotal)} client records</p>
                  </div>
                </div>
                {finfluxErrors.length > 0 && <div className="mt-4 rounded-xl border border-[#f0d3cf] bg-[#fff9f8] p-4" data-testid="finflux-error-summary">
                  <p className="font-mono-ui text-[9px] font-semibold uppercase tracking-[.12em] text-[#a23e36]">Latest FinFlux errors</p>
                  <div className="mt-3 space-y-2">
                    {finfluxErrors.slice(0, 5).map((error) => <div key={error.name} className="flex items-start justify-between gap-3 text-[11px]">
                      <span className="min-w-0 line-clamp-2 leading-5 text-foreground" title={error.name}>{error.name}</span>
                      <span className="shrink-0 font-mono-ui font-semibold text-[#a23e36]">{formatNumber(error.count)}</span>
                    </div>)}
                  </div>
                </div>}
              </div>
              <div className="mt-7 grid grid-cols-2 gap-2">
                 <div className="rounded-2xl bg-sidebar p-4 text-sidebar-foreground sm:p-5">
                   <p className="font-mono-ui text-[10px] font-semibold uppercase tracking-[.1em] text-sidebar-foreground/65">Last import</p>
                  <p className="mt-2 truncate text-[12px] font-semibold">{data?.lastImportFile ?? 'No file imported'}</p>
                   <FileUp size={20} className="mt-4 text-sidebar-primary" />
                </div>
                 <div className="rounded-2xl border border-primary/20 bg-secondary p-4 text-secondary-foreground sm:p-5">
                   <p className="font-mono-ui text-[10px] font-semibold uppercase tracking-[.1em] text-primary">Achievements</p>
                  <p className="mt-2 text-[12px] font-semibold">{data?.responsesUploaded ? 'Response received' : 'Ready for first response'}</p>
                   <CheckCircle2 size={20} className="mt-4 text-primary" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 border-t border-border pt-4 text-[11px] text-muted-foreground">
                <ShieldCheck size={16} className="text-primary" /> Last activity {formatDate(data?.lastActivityAt)}
              </div>
            </div>
          </section>

          <section className="mt-5">
            <PendingErrorChart errors={data?.pendingErrors ?? []} pendingCount={recordsPending} />
          </section>
        </>
      )}
    </div>
  );
}