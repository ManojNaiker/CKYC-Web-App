import { Link } from 'wouter';
import { ArrowRight, Database, FileCheck2, FileClock, FileUp, RefreshCw, ShieldCheck, UploadCloud } from 'lucide-react';
import { useGetDashboardSummary, useListCkycRequests, getGetDashboardSummaryQueryKey, getListCkycRequestsQueryKey } from '@workspace/api-client-react';
import { PageIntro, EmptyState, QueryError } from '@/components/workspace-shell';

function formatDate(value?: string | null) {
  if (!value) return 'No activity yet';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function Metric({ label, value, hint, icon: Icon, tone }: { label: string; value: number | string; hint: string; icon: typeof Database; tone: string }) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-xs transition-transform duration-200 hover:-translate-y-0.5" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}>
      <div className={`absolute right-0 top-0 h-20 w-20 translate-x-8 -translate-y-8 rounded-full opacity-20 ${tone}`} />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="font-mono-ui text-[9px] uppercase tracking-[0.17em] text-muted-foreground">{label}</p>
          <p className="mt-3 font-display text-[32px] font-bold tracking-[-0.05em] text-foreground">{value}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <span className="grid size-9 place-items-center rounded-lg bg-secondary text-primary"><Icon size={18} /></span>
      </div>
    </div>
  );
}

export default function Overview() {
  const summary = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const requests = useListCkycRequests({ query: { queryKey: getListCkycRequestsQueryKey() } });
  const data = summary.data;
  const recent = requests.data?.slice(0, 5) ?? [];

  return (
    <div className="animate-fade">
      <PageIntro eyebrow="Operations overview" title="Keep the trail intact." description="A live view of imported LMS records, generated search files, and responses returned by the CKYC gateway." action={<Link href="/clients" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[12px] font-bold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5" data-testid="link-import-clients"><UploadCloud size={15} /> Import client rows</Link>} />

      {summary.isError ? <QueryError onRetry={() => summary.refetch()} /> : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summary.isLoading ? [1, 2, 3, 4].map((item) => <div className="h-[142px] animate-pulse rounded-xl border border-border bg-card" key={item} />) : (
              <>
                <Metric label="Imported clients" value={data?.totalClients ?? 0} hint="Rows available for search" icon={Database} tone="bg-primary" />
                <Metric label="Request files" value={data?.generatedRequests ?? 0} hint="CKYC files generated" icon={FileClock} tone="bg-accent" />
                <Metric label="Responses uploaded" value={data?.responsesUploaded ?? 0} hint="Files matched to requests" icon={FileCheck2} tone="bg-[#5c8db0]" />
                <Metric label="Workspace health" value="Good" hint="Gateway connection active" icon={ShieldCheck} tone="bg-[#85b99a]" />
              </>
            )}
          </section>

          <section className="mt-7 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div><h3 className="font-display text-[17px] font-bold tracking-[-0.025em]">Recent request activity</h3><p className="mt-1 text-[11px] text-muted-foreground">The latest files created in this workspace</p></div>
                <Link href="/requests" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:underline" data-testid="link-view-all-requests">View all <ArrowRight size={13} /></Link>
              </div>
              {requests.isError ? <div className="p-5"><QueryError onRetry={() => requests.refetch()} /></div> : requests.isLoading ? <div className="space-y-3 p-5">{[1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}</div> : recent.length === 0 ? <div className="p-5"><EmptyState icon={FileClock} title="No request files yet" detail="Import client rows, then create your first CKYC search file." action={<Link href="/clients" className="text-[12px] font-bold text-primary underline underline-offset-4" data-testid="link-empty-import">Go to clients</Link>} /></div> : (
                <div className="divide-y divide-border">
                  {recent.map((request) => <Link href={`/requests/${request.id}`} key={request.id} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-secondary/40" data-testid={`link-recent-request-${request.id}`}>
                    <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${request.status === 'response_uploaded' ? 'bg-[#e2f2e9] text-[#31734d]' : 'bg-[#fff1d6] text-[#9b6915]'}`}><FileClock size={16} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-mono-ui text-[11px] font-medium text-foreground">{request.fileName}</span><span className="mt-1 block text-[11px] text-muted-foreground">{request.recordCount} records · {formatDate(request.createdAt)}</span></span>
                    <span className={`hidden rounded-full px-2 py-1 font-mono-ui text-[9px] uppercase tracking-[0.08em] sm:block ${request.status === 'response_uploaded' ? 'bg-[#e2f2e9] text-[#31734d]' : 'bg-[#fff1d6] text-[#9b6915]'}`}>{request.status === 'response_uploaded' ? 'Response in' : 'Awaiting response'}</span><ArrowRight size={15} className="text-muted-foreground" />
                  </Link>)}
                </div>
              )}
            </div>

            <div className="relative overflow-hidden rounded-xl bg-sidebar p-6 text-sidebar-foreground shadow-xs">
              <div className="absolute inset-0 hairline-grid opacity-[.12]" />
              <div className="relative">
                <p className="font-mono-ui text-[9px] uppercase tracking-[0.18em] text-sidebar-primary">Workspace pulse</p>
                <h3 className="mt-3 max-w-[240px] font-display text-[25px] font-bold leading-[1.1] tracking-[-0.04em] text-white">Every row accounted for.</h3>
                <p className="mt-4 text-[12px] leading-5 text-sidebar-foreground/65">The last import and activity timestamps keep your operational handoff clear.</p>
                <div className="mt-7 space-y-4 border-t border-sidebar-border pt-5">
                  <div className="flex items-center gap-3"><div className="grid size-8 place-items-center rounded-lg bg-sidebar-accent text-sidebar-primary"><FileUp size={15} /></div><div><p className="font-mono-ui text-[9px] uppercase tracking-[.12em] text-sidebar-foreground/40">Last import</p><p className="mt-1 truncate text-[12px] font-semibold text-white">{data?.lastImportFile ?? 'No file imported'}</p></div></div>
                  <div className="flex items-center gap-3"><div className="grid size-8 place-items-center rounded-lg bg-sidebar-accent text-sidebar-primary"><RefreshCw size={15} /></div><div><p className="font-mono-ui text-[9px] uppercase tracking-[.12em] text-sidebar-foreground/40">Last activity</p><p className="mt-1 text-[12px] font-semibold text-white">{formatDate(data?.lastActivityAt)}</p></div></div>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
