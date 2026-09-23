import { Link } from 'wouter';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Database,
  FileCheck2,
  FileClock,
  FileDown,
  FileUp,
  RefreshCw,
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

function ProgressRing({ value, label, color }: { value: number; label: string; color: string }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="grid size-[74px] place-items-center rounded-full"
        style={{ background: `conic-gradient(${color} ${safeValue * 3.6}deg, #edf0f4 0deg)` }}
        aria-label={`${label}: ${safeValue}%`}
      >
        <div className="grid size-[58px] place-items-center rounded-full bg-card text-center">
          <span className="font-mono-ui text-[13px] font-semibold text-foreground">{safeValue}%</span>
        </div>
      </div>
      <span className="text-center text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

export default function Overview() {
  const summary = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const requests = useListCkycRequests({ query: { queryKey: getListCkycRequestsQueryKey() } });
  const downloads = useListCkycDownloadRequests({ query: { queryKey: getListCkycDownloadRequestsQueryKey() } });
  const data = summary.data;
  const recent = requests.data?.slice(0, 7) ?? [];
  const awaiting = Math.max(0, (data?.generatedRequests ?? 0) - (data?.responsesUploaded ?? 0));
  const responseCoverage = data?.generatedRequests ? Math.round(((data.responsesUploaded ?? 0) / data.generatedRequests) * 100) : 0;
  const activityBars = [...recent].reverse();
  const maxRecords = Math.max(...activityBars.map((request) => request.recordCount), 1);
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

          <section className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
              <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
                <div>
                  <p className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-muted-foreground">Request activity</p>
                  <h3 className="mt-1 font-display text-[22px] font-semibold tracking-[-.025em] text-foreground">Files processed this week</h3>
                </div>
                <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[10px] font-semibold text-muted-foreground" type="button">
                  This week <ChevronDown size={13} />
                </button>
              </div>
              {requests.isError ? <div className="p-5"><QueryError onRetry={() => requests.refetch()} /></div> : requests.isLoading ? <div className="h-[260px] animate-pulse bg-muted/50" /> : (
                <div className="p-5 sm:p-6">
                  <div className="flex h-[190px] items-end gap-2 border-b border-border px-1 sm:gap-4">
                    {(activityBars.length ? activityBars : Array.from({ length: 7 }, () => null)).map((request, index) => {
                      const height = request ? Math.max(28, Math.round((request.recordCount / maxRecords) * 100)) : 18;
                      return (
                        <div className="group flex h-full flex-1 flex-col justify-end gap-2" key={request?.id ?? `empty-${index}`}>
                          <div className={`relative w-full rounded-t-lg ${request?.status === 'response_uploaded' ? 'bg-[#ae75e4]' : 'bg-[#3ca9dc]'} transition-all group-hover:brightness-95`} style={{ height: `${height}%` }}>
                            {request && <span className="absolute -top-5 left-1/2 -translate-x-1/2 font-mono-ui text-[8px] text-muted-foreground">{request.recordCount.toLocaleString('en-IN')}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#3ca9dc]" /> Requests generated</span>
                      <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#ae75e4]" /> Response received</span>
                    </div>
                    <span className="font-mono-ui text-[10px] font-semibold text-primary">{recent.length} files visible</span>
                  </div>
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
              <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
                <div>
                  <p className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-muted-foreground">Gateway response health</p>
                  <h3 className="mt-1 font-display text-[22px] font-semibold tracking-[-.025em] text-foreground">CKYC handoff status</h3>
                </div>
                <span className="rounded-full bg-[#dcf3e9] px-2.5 py-1 font-mono-ui text-[9px] font-semibold text-[#428c6c]">Online</span>
              </div>
              <div className="p-5 sm:p-6">
                <div className="rounded-2xl bg-[#f5f9fc] p-4">
                  <div className="flex h-[112px] items-end gap-2">
                    {[46, 64, 54, 76, 61, 82, 69, 88, 74, 91].map((height, index) => <div key={index} className="flex-1 rounded-t-full bg-[#a8d9f0]" style={{ height: `${height}%` }} />)}
                  </div>
                  <div className="mt-3 flex justify-between font-mono-ui text-[8px] uppercase tracking-[.1em] text-muted-foreground"><span>Gateway</span><span>Latest sync</span></div>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                  <div><p className="font-display text-[24px] font-semibold">{data?.responsesUploaded ?? 0}</p><p className="mt-1 text-[9px] text-muted-foreground">Response uploaded</p></div>
                  <div><p className="font-display text-[24px] font-semibold">{awaiting}</p><p className="mt-1 text-[9px] text-muted-foreground">Awaiting response</p></div>
                  <div><p className="font-display text-[24px] font-semibold text-[#428c6c]">0</p><p className="mt-1 text-[9px] text-muted-foreground">Failed tracked</p></div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[1.18fr_.82fr]">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
              <div className="flex items-start justify-between border-b border-border px-5 py-4 sm:px-6">
                <div>
                  <p className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-muted-foreground">Latest tasks</p>
                  <h3 className="mt-1 font-display text-[22px] font-semibold tracking-[-.025em] text-foreground">Files to review in your workspace</h3>
                </div>
                <Link href="/requests" className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline" data-testid="link-view-all-requests">View all <ArrowRight size={13} /></Link>
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
                <ProgressRing value={data?.totalClients ? 100 : 0} label="Records loaded" color="#ae75e4" />
                <ProgressRing value={responseCoverage} label="Responses matched" color="#4a9bd2" />
                <ProgressRing value={data?.generatedRequests ? Math.round((awaiting / data.generatedRequests) * 100) : 0} label="Queue remaining" color="#5ec4c3" />
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
        </>
      )}
    </div>
  );
}