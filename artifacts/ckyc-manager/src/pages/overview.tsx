import { Link } from 'wouter';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
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
  testId,
}: {
  label: string;
  value: number | string;
  detail: string;
  icon: typeof Database;
  tone: string;
  testId: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-xs" data-testid={testId}>
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tone}`}>
        <Icon size={17} strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold text-muted-foreground">{label}</p>
        <p className="mt-0.5 truncate text-[9px] text-muted-foreground/75">{detail}</p>
      </div>
      <p className="font-display text-[22px] font-semibold tracking-[-0.04em] text-foreground">{value}</p>
    </div>
  );
}

function ProgressRing({ value, count, label, color }: { value: number; count: number; label: string; color: string }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <div
        className="grid size-[74px] place-items-center rounded-full"
        style={{ background: `conic-gradient(${color} ${safeValue * 3.6}deg, #edf0f4 0deg)` }}
        aria-label={`${label}: ${safeValue}%`}
      >
        <div className="grid size-[58px] place-items-center rounded-full bg-card text-center">
          <span className="font-mono-ui text-[13px] font-semibold text-foreground">{safeValue}%</span>
        </div>
      </div>
      <span className="text-center text-[10px] font-semibold text-foreground">{label}</span>
      <span className="font-mono-ui text-[9px] text-muted-foreground">{formatNumber(count)} records</span>
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
          <p className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-muted-foreground">Pending records</p>
          <h3 className="mt-1 font-display text-[22px] font-semibold tracking-[-.025em] text-foreground">Why records are pending</h3>
          <p className="mt-2 text-[11px] leading-5 text-muted-foreground">Pending records have neither a response ID nor a Final CKYC number.</p>
        </div>
        <div className="rounded-xl bg-[#fff0c9] px-3 py-2 text-right">
          <p className="font-mono-ui text-[18px] font-semibold leading-none text-[#9d761f]">{formatNumber(pendingCount)}</p>
          <p className="mt-1 font-mono-ui text-[8px] uppercase tracking-[.1em] text-[#9d761f]/75">pending</p>
        </div>
      </div>
      {errors.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-secondary/35 px-4 py-8 text-center text-[11px] text-muted-foreground">
          No pending error reasons.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {errors.map((error) => {
            const percent = formatPercent(error.count, pendingCount);
            const width = Math.max(3, Math.round((error.count / maxCount) * 100));
            return (
              <div key={error.name}>
                <div className="mb-2 flex items-start justify-between gap-4 text-[10px]">
                  <span className="min-w-0 leading-4 text-foreground">{error.name}</span>
                  <span className="shrink-0 font-mono-ui font-semibold text-muted-foreground">{percent}% · {formatNumber(error.count)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#f1e7cd]">
                  <div className="h-full rounded-full bg-[#d2a94b] transition-all" style={{ width: `${width}%` }} />
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
  const dateLabel = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());

  return (
    <div className="animate-fade">
      {summary.isError ? <QueryError onRetry={() => summary.refetch()} /> : (
        <>
          <section className="mb-5 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#dfd3f2] bg-[#f0e9fb] px-3 py-1.5 font-mono-ui text-[9px] font-medium uppercase tracking-[.14em] text-[#7c5baa]">
                <Sparkles size={12} /> Operations overview
              </div>
              <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
                <h2 className="font-display text-[38px] font-semibold leading-none tracking-[-.045em] text-foreground sm:text-[48px]">Dashboard</h2>
                <p className="mb-1 font-mono-ui text-[9px] uppercase tracking-[.08em] text-muted-foreground">{dateLabel}</p>
              </div>
              <p className="mt-3 max-w-[660px] text-[13px] leading-6 text-muted-foreground">
                Keep every LMS record, CKYC request and response visible from one operational workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/requests" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-[11px] font-semibold text-foreground shadow-xs hover:-translate-y-0.5 hover:bg-secondary" data-testid="link-view-requests">
                <FileClock size={15} className="text-primary" /> View requests
              </Link>
              <Link href="/clients" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-[11px] font-semibold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5" data-testid="link-import-clients">
                <UploadCloud size={15} /> Import client rows
              </Link>
            </div>
          </section>

          <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summary.isLoading || downloads.isLoading ? [1, 2, 3, 4].map((item) => <div className="h-[74px] animate-pulse rounded-2xl border border-border bg-card" key={item} />) : (
              <>
                <TotalTile label="LMS clients" value={formatNumber(data?.totalClients ?? 0)} detail="Imported records" icon={Users} tone="bg-[#e9ddfb] text-[#8d5bd2]" testId="metric-imported-clients" />
                <TotalTile label="CKYC requests" value={data?.generatedRequests ?? 0} detail="Request files created" icon={FileClock} tone="bg-[#dceffd] text-[#4a9bc7]" testId="metric-request-files" />
                <TotalTile label="Responses uploaded" value={data?.responsesUploaded ?? 0} detail="Latest workbook ready" icon={FileCheck2} tone="bg-[#dcf3e9] text-[#4aa37e]" testId="metric-responses-uploaded" />
                <TotalTile label="Download queue" value={downloads.data?.length ?? 0} detail="Nothing waiting" icon={FileDown} tone="bg-[#fff0c9] text-[#b48a27]" testId="metric-download-queue" />
              </>
            )}
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[1.18fr_.82fr]">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
              <div className="flex items-start justify-between border-b border-border px-5 py-4 sm:px-6">
                <div>
                  <p className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-muted-foreground">Latest tasks</p>
                  <h3 className="mt-1 font-display text-[22px] font-semibold tracking-[-.025em] text-foreground">Files to review in your workspace</h3>
                </div>
                <Link href="/requests" className="inline-flex whitespace-nowrap items-center gap-1 text-[10px] font-semibold text-primary hover:underline" data-testid="link-view-all-requests">View all <ArrowRight size={13} /></Link>
              </div>
              {recent.length === 0 ? <div className="p-5"><EmptyState icon={FileClock} title="No request files yet" detail="Import client rows, then create your first CKYC search file." action={<Link href="/clients" className="text-[12px] font-bold text-primary underline underline-offset-4" data-testid="link-empty-import">Go to clients</Link>} /></div> : (
                <div className="divide-y divide-border">
                  <div className="hidden grid-cols-[minmax(0,1fr)_120px_110px] gap-4 border-b border-border bg-secondary/45 px-5 py-3 font-mono-ui text-[9px] uppercase tracking-[.1em] text-muted-foreground sm:grid">
                    <span>Task</span><span>Status</span><span>Created</span>
                  </div>
                  {recent.slice(0, 4).map((request) => (
                    <Link href={`/requests/${request.id}`} key={request.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-secondary/35 sm:grid-cols-[minmax(0,1fr)_120px_110px] sm:gap-4" data-testid={`link-recent-request-${request.id}`}>
                      <span className="flex min-w-0 items-center gap-3">
                        <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${request.status === 'response_uploaded' ? 'bg-[#dcf3e9] text-[#428c6c]' : 'bg-[#fff0c9] text-[#b48a27]'}`}><FileUp size={15} /></span>
                        <span className="min-w-0"><span className="block truncate font-mono-ui text-[10px] font-medium text-foreground">{request.fileName}</span><span className="mt-1 block text-[9px] text-muted-foreground">{request.recordCount.toLocaleString('en-IN')} records</span></span>
                      </span>
                      <span className={`rounded-full px-2 py-1 text-center font-mono-ui text-[8px] uppercase tracking-[.06em] ${request.status === 'response_uploaded' ? 'bg-[#dcf3e9] text-[#428c6c]' : 'bg-[#fff0c9] text-[#9d761f]'}`}>{request.status === 'response_uploaded' ? 'Ready' : 'In progress'}</span>
                      <span className="hidden font-mono-ui text-[9px] text-muted-foreground sm:block">{formatDate(request.createdAt).split(',')[0]}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-xs sm:p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-muted-foreground">Workspace rhythm</p>
                  <h3 className="mt-1 font-display text-[22px] font-semibold tracking-[-.025em] text-foreground">Your CKYC pulse</h3>
                </div>
                <BarChart3 size={18} className="text-primary" />
              </div>
              <div className="mt-6 flex justify-around gap-3">
                <ProgressRing value={formatPercent(finalCkycUpdated, totalClients)} count={finalCkycUpdated} label="Final CKYC update" color="#ae75e4" />
                <ProgressRing value={formatPercent(requestIdUpdated, totalClients)} count={requestIdUpdated} label="Request ID updated" color="#4a9bd2" />
                <ProgressRing value={formatPercent(recordsPending, totalClients)} count={recordsPending} label="Records pending" color="#d2a94b" />
              </div>
              <div className="mt-7 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-[#272733] p-4 text-white">
                  <p className="font-mono-ui text-[9px] uppercase tracking-[.1em] text-white/45">Last import</p>
                  <p className="mt-2 truncate text-[11px] font-semibold">{data?.lastImportFile ?? 'No file imported'}</p>
                  <FileUp size={18} className="mt-4 text-[#ae75e4]" />
                </div>
                <div className="rounded-xl bg-[#f0e9fb] p-4 text-[#5c4778]">
                  <p className="font-mono-ui text-[9px] uppercase tracking-[.1em] text-[#8b72a6]">Achievements</p>
                  <p className="mt-2 text-[11px] font-semibold">{data?.responsesUploaded ? 'Response received' : 'Ready for first response'}</p>
                  <CheckCircle2 size={18} className="mt-4 text-[#986bd2]" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 border-t border-border pt-4 text-[10px] text-muted-foreground">
                <ShieldCheck size={14} className="text-primary" /> Last activity {formatDate(data?.lastActivityAt)}
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