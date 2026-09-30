import { Link } from 'wouter';
import {
  ArrowRight, CircleAlert, Clock3, Database, FileCheck2, FileClock,
  FileDown, FileText, FileUp, ShieldCheck, Users,
} from 'lucide-react';
import {
  getGetDashboardSummaryQueryKey,
  getListCkycDownloadRequestsQueryKey,
  getListCkycRequestsQueryKey,
  useGetDashboardSummary,
  useListCkycDownloadRequests,
  useListCkycRequests,
} from '@workspace/api-client-react';
import lightFinanceLogo from '@assets/Logo_Light_1788338497887.png';
import { EmptyState, QueryError } from '@/components/workspace-shell';

const number = (value: number) => new Intl.NumberFormat('en-IN').format(value);
const date = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
  : 'No activity yet';
const percent = (value: number, total: number) => total > 0 ? Math.min(100, Math.round(value / total * 100)) : 0;

function Metric({ label, value, note, icon: Icon, color, testId }: {
  label: string; value: number | string; note: string; icon: typeof Database; color: string; testId: string;
}) {
  return (
    <div data-testid={testId} className="relative flex min-h-[112px] flex-col justify-between overflow-hidden rounded-lg border border-border bg-card px-4 py-3.5 shadow-[0_1px_2px_hsl(210_30%_20%_/.03)]">
      <span className="absolute inset-x-0 bottom-0 h-[2px]" style={{ backgroundColor: color }} />
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
        <Icon size={17} style={{ color }} strokeWidth={1.8} aria-hidden="true" />
      </div>
      <div>
        <p className="font-display text-[27px] font-bold leading-none tracking-[-.045em] text-foreground">{typeof value === 'number' ? number(value) : value}</p>
        <p className="mt-1.5 text-[10px] text-muted-foreground">{note}</p>
      </div>
    </div>
  );
}

function PanelHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3.5 sm:px-5">
    <div><p className="text-[10px] font-bold uppercase tracking-[.13em] text-muted-foreground">{eyebrow}</p><h3 className="mt-0.5 text-[14px] font-bold tracking-[-.015em] text-foreground">{title}</h3></div>
    {action}
  </div>;
}

function SectionLink({ href, children, testId }: { href: string; children: React.ReactNode; testId: string }) {
  return <Link href={href} data-testid={testId} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline hover:underline-offset-4">{children}<ArrowRight size={14} /></Link>;
}

function ProgressLine({ label, value, total, color, testId }: { label: string; value: number; total: number; color: string; testId?: string }) {
  const share = percent(value, total);
  return <div className="space-y-1.5">
    <div className="flex items-baseline justify-between gap-3"><span className="text-[11px] font-semibold text-foreground">{label}</span><span className="whitespace-nowrap font-mono-ui text-[11px] font-medium text-foreground"><span data-testid={testId}>{number(value)}</span> <span className="text-muted-foreground">/ {share}%</span></span></div>
    <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuenow={share} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: color }} />
    </div>
  </div>;
}

function LoadingRows({ count = 4 }: { count?: number }) {
  return <div className="animate-pulse space-y-3 p-5" aria-label="Loading dashboard data">{Array.from({ length: count }, (_, index) => <div key={index} className="h-10 rounded-md bg-muted" />)}</div>;
}

export default function Overview() {
  const summary = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const requests = useListCkycRequests({ query: { queryKey: getListCkycRequestsQueryKey() } });
  const downloads = useListCkycDownloadRequests({ query: { queryKey: getListCkycDownloadRequestsQueryKey() } });
  const data = summary.data;
  const today = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());
  const total = data?.totalClients ?? 0;
  const updated = Math.min(Math.max(data?.finalCkycUpdated ?? 0, 0), total);
  const remaining = Math.max(0, total - updated);
  const updatedShare = percent(updated, total);
  const finfluxTotal = (data?.finfluxUpdated ?? 0) + (data?.finfluxPending ?? 0) + (data?.finfluxFailed ?? 0);
  const pendingErrors = data?.pendingErrors ?? [];
  const maxPendingError = Math.max(1, ...pendingErrors.map(item => item.count));

  if (summary.isError) return <div className="animate-fade space-y-4 pb-8">
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[.15em] text-primary">Operations overview</p>
      <h2 className="mt-1 font-display text-[24px] font-bold tracking-[-.04em] text-foreground sm:text-[29px]">Dashboard</h2>
    </div>
    <div className="rounded-lg border border-border bg-card p-5 sm:p-7">
      <h3 className="text-[15px] font-bold text-foreground">Dashboard data is unavailable</h3>
      <p className="mt-1.5 max-w-xl text-[12px] leading-5 text-muted-foreground">We could not retrieve the current workspace summary. Counts and import details are hidden until the data can be loaded.</p>
      <div className="mt-4 max-w-xl"><QueryError onRetry={() => void summary.refetch()} /></div>
    </div>
  </div>;

  return <div className="animate-fade space-y-4 pb-8">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[.15em] text-primary">Operations overview</p>
        <h2 className="mt-1 font-display text-[24px] font-bold tracking-[-.04em] text-foreground sm:text-[29px]">Dashboard</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">LMS identities and CKYC exchanges, in one place.</p>
      </div>
      <p className="pb-0.5 text-[11px] font-medium text-muted-foreground">{today}</p>
    </div>

    <section aria-label="Workspace summary" className="rounded-lg border border-border bg-card px-4 py-4 shadow-[0_1px_2px_hsl(210_30%_20%_/.03)] sm:px-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-border bg-[#f3f7f5] p-1"><img src={lightFinanceLogo} alt="" className="max-h-full max-w-full object-contain" /></span>
          <div className="min-w-0"><p className="text-[14px] font-bold text-foreground">Light Finance <span className="font-medium text-muted-foreground">/ CKYC operations</span></p><p className="mt-0.5 text-[11px] text-muted-foreground">Client register and portal exchange status</p></div>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 border-t border-border pt-3 sm:grid-cols-3 md:border-l md:border-t-0 md:py-0 md:pl-6">
          <div><p className="text-[10px] text-muted-foreground">Last import</p><p data-testid="text-last-import" className="mt-1 max-w-[170px] truncate font-mono-ui text-[10px] font-semibold text-foreground" title={data?.lastImportFile ?? undefined}>{summary.isLoading ? 'Loading…' : data?.lastImportFile ?? 'Not imported'}</p></div>
          <div><p className="text-[10px] text-muted-foreground">Last activity</p><p data-testid="text-last-activity" className="mt-1 whitespace-nowrap text-[11px] font-semibold text-foreground">{summary.isLoading ? 'Loading…' : date(data?.lastActivityAt)}</p></div>
          <div className="col-span-2 sm:col-span-1"><p className="text-[10px] text-muted-foreground">Register status</p><p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-foreground"><ShieldCheck size={13} className="text-[hsl(var(--success))]" /> CKYC workspace</p></div>
        </div>
      </div>
    </section>

    <section aria-label="Key metrics" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {summary.isLoading || downloads.isLoading
        ? Array.from({ length: 4 }, (_, index) => <div key={index} className="h-[112px] animate-pulse rounded-lg border border-border bg-card" />)
        : <>
          <Metric label="LMS clients" value={total} note="Records in register" icon={Users} color="#3286aa" testId="metric-imported-clients" />
          <Metric label="CKYC requests" value={data?.generatedRequests ?? 0} note="Search files generated" icon={FileClock} color="#4f82b0" testId="metric-request-files" />
          <Metric label="Responses uploaded" value={data?.responsesUploaded ?? 0} note="Search responses received" icon={FileCheck2} color="#489276" testId="metric-responses-uploaded" />
          <Metric label="Download requests" value={downloads.isError ? '—' : downloads.data?.length ?? 0} note={downloads.isError ? 'Currently unavailable' : 'Files in download register'} icon={FileDown} color="#bd9447" testId="metric-download-queue" />
        </>}
    </section>
    {downloads.isError && <QueryError onRetry={() => void downloads.refetch()} />}

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(310px,1fr)]">
      <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
        <PanelHeading eyebrow="Client register" title="CKYC reconciliation" action={<SectionLink href="/clients" testId="link-import-clients">Open clients</SectionLink>} />
        {summary.isLoading ? <LoadingRows count={3} /> : <div className="p-4 sm:p-5">
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_210px]">
            <div className="space-y-5">
              <ProgressLine label="Final CKYC updated" value={data?.finalCkycUpdated ?? 0} total={total} color="#318c71" />
              <ProgressLine label="Request ID updated" value={data?.requestIdUpdated ?? 0} total={total} color="#3487ad" />
              <ProgressLine label="Records pending" value={data?.recordsPending ?? 0} total={total} color="#bf9446" testId="metric-records-pending" />
            </div>
            <div className="flex flex-col items-center justify-center border-t border-border pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0" data-testid="ring-final-ckyc">
              <div className="grid size-[116px] place-items-center rounded-full" role="img" aria-label={`${number(updated)} of ${number(total)} clients have a final CKYC number; ${number(remaining)} remain without one`} style={{ background: `conic-gradient(#318c71 ${updatedShare}%, hsl(var(--muted)) ${updatedShare}%)` }}>
                <div className="grid size-[88px] place-items-center rounded-full bg-card text-center"><div><span className="block font-display text-[23px] font-bold leading-none text-foreground">{updatedShare}%</span><span className="mt-1 block text-[9px] font-semibold text-muted-foreground">Final CKYC</span></div></div>
              </div>
              <div className="mt-3 flex w-full justify-center gap-4 text-[10px]">
                <span className="flex items-center gap-1.5 text-foreground"><span className="size-1.5 rounded-full bg-[#318c71]" />{number(updated)} updated</span>
                <span className="flex items-center gap-1.5 text-muted-foreground"><span className="size-1.5 rounded-full bg-muted-foreground/40" />{number(remaining)} remaining</span>
              </div>
            </div>
          </div>
        </div>}
      </section>

      <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
        <PanelHeading eyebrow="Downstream updates" title="FinFlux delivery" action={<FileUp size={17} className="text-muted-foreground" />} />
        {summary.isLoading ? <LoadingRows count={3} /> : <div className="p-4 sm:p-5">
          <div className="grid grid-cols-3 divide-x divide-border rounded-md border border-border bg-background py-3">
            {[
              { label: 'Updated', value: data?.finfluxUpdated ?? 0, tone: 'text-[hsl(var(--success))]', testId: 'finflux-updated-summary' },
              { label: 'Pending', value: data?.finfluxPending ?? 0, tone: 'text-[hsl(var(--warning))]', testId: 'finflux-pending-summary' },
              { label: 'Failed', value: data?.finfluxFailed ?? 0, tone: 'text-destructive', testId: 'finflux-failed-summary' },
            ].map(item => <div key={item.label} data-testid={item.testId} className="px-2 text-center"><p className={`font-display text-[21px] font-bold leading-none ${item.tone}`}>{number(item.value)}</p><p className="mt-1.5 text-[10px] font-semibold text-muted-foreground">{item.label}</p></div>)}
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground">{number(finfluxTotal)} client records in the FinFlux update workflow</p>
          {(data?.finfluxErrors?.length ?? 0) > 0 && <div data-testid="finflux-error-summary" className="mt-3 border-t border-border pt-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-destructive">Reported errors</p>{data?.finfluxErrors.slice(0, 3).map(error => <div key={error.name} className="flex justify-between gap-3 py-1 text-[11px]"><span className="min-w-0 truncate text-muted-foreground" title={error.name}>{error.name}</span><span className="font-mono-ui font-semibold text-foreground">{number(error.count)}</span></div>)}</div>}
        </div>}
      </section>
    </div>

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(310px,1fr)]">
      <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
        <PanelHeading eyebrow="Exchange activity" title="Recent CKYC requests" action={<SectionLink href="/requests" testId="link-view-all-requests">View all</SectionLink>} />
        {requests.isLoading ? <LoadingRows /> : requests.isError ? <div className="p-4"><QueryError onRetry={() => void requests.refetch()} /></div> : !requests.data?.length ? <div className="p-4"><EmptyState icon={FileText} title="No requests yet" detail="Once a CKYC search file is generated, it will appear here." action={<Link href="/clients" data-testid="link-empty-import" className="text-[11px] font-bold text-primary underline underline-offset-4">Go to clients</Link>} /></div> : <>
          <div className="hidden grid-cols-[minmax(0,1fr)_80px_112px_90px] gap-3 border-b border-border bg-muted/40 px-4 py-2 text-[10px] font-bold uppercase tracking-[.09em] text-muted-foreground sm:grid sm:px-5"><span>File name</span><span>Records</span><span>Status</span><span>Created</span></div>
          <div className="divide-y divide-border">{requests.data.slice(0, 6).map(request => <Link href={`/requests/${request.id}`} key={request.id} data-testid={`link-recent-request-${request.id}`} className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/45 sm:grid-cols-[minmax(0,1fr)_80px_112px_90px] sm:px-5">
            <span className="flex min-w-0 items-center gap-2"><FileText size={15} className="shrink-0 text-primary" /><span className="min-w-0"><span className="block truncate font-mono-ui text-[11px] font-medium text-foreground group-hover:text-primary">{request.fileName}</span><span className="mt-0.5 block text-[10px] text-muted-foreground sm:hidden">{number(request.recordCount)} records · {date(request.createdAt)}</span></span></span>
            <span className="hidden font-mono-ui text-[11px] text-foreground sm:block">{number(request.recordCount)}</span>
            <span className={`rounded px-2 py-1 text-center text-[10px] font-semibold ${request.status === 'response_uploaded' ? 'bg-[hsl(var(--success-bg))] text-[hsl(var(--success))]' : 'bg-[hsl(var(--warning-bg))] text-[hsl(var(--warning))]'}`}>{request.status === 'response_uploaded' ? 'Response uploaded' : 'Generated'}</span>
            <span className="hidden text-[10px] text-muted-foreground sm:block">{date(request.createdAt)}</span>
          </Link>)}</div>
        </>}
        <div className="border-t border-border px-4 py-3 sm:px-5"><SectionLink href="/requests" testId="link-view-requests">View requests</SectionLink></div>
      </section>

      <div className="space-y-4">
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <PanelHeading eyebrow="Exceptions" title="Why records are pending" action={<CircleAlert size={17} className="text-[hsl(var(--warning))]" />} />
          {summary.isLoading ? <LoadingRows count={3} /> : pendingErrors.length === 0 ? <div className="px-5 py-7 text-[11px] text-muted-foreground">No pending error reasons reported.</div> : <div className="space-y-3.5 p-4 sm:p-5">{pendingErrors.slice(0, 6).map(error => <div key={error.name}>
            <div className="flex justify-between gap-3 text-[11px]"><span className="min-w-0 truncate text-foreground" title={error.name}>{error.name}</span><span className="shrink-0 font-mono-ui font-semibold text-foreground">{number(error.count)}</span></div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[hsl(var(--warning))]" style={{ width: `${Math.round(error.count / maxPendingError * 100)}%` }} /></div>
          </div>)}</div>}
        </section>
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <PanelHeading eyebrow="Portal exchange" title="Recent download requests" action={<SectionLink href="/download-requests" testId="link-view-downloads">View all</SectionLink>} />
          {downloads.isLoading ? <LoadingRows count={2} /> : downloads.isError ? <div className="p-4"><QueryError onRetry={() => void downloads.refetch()} /></div> : !downloads.data?.length ? <div className="px-5 py-6 text-[11px] text-muted-foreground">No download requests generated yet.</div> : <div className="divide-y divide-border">{downloads.data.slice(0, 3).map(item => <div key={item.id} className="flex items-center gap-2.5 px-4 py-2.5 sm:px-5"><FileDown size={15} className="shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="truncate font-mono-ui text-[10px] font-medium text-foreground" title={item.fileName}>{item.fileName}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{number(item.recordCount)} records · {date(item.createdAt)}</p></div><span className={`shrink-0 text-[10px] font-semibold ${item.responseFileName ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--warning))]'}`}>{item.responseFileName ? 'Received' : 'Awaiting'}</span></div>)}</div>}
        </section>
      </div>
    </div>
    <div className="flex items-center gap-1.5 pt-1 text-[10px] text-muted-foreground"><Clock3 size={13} /> Dashboard reflects the latest saved workspace data.</div>
  </div>;
}