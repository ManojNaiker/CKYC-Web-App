import { Activity, CheckCircle2, CircleAlert, History } from 'lucide-react';
import { useListAuditLogs } from '@workspace/api-client-react';
import { PageIntro, QueryError } from '@/components/workspace-shell';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function AuditLogs() {
  const auditQuery = useListAuditLogs({ limit: 50, offset: 0 });

  return (
    <div>
      <PageIntro
        eyebrow="Governance"
        title="Audit log"
        description="A server-recorded history of operational mutations and access-management changes. Failed mutations are retained for review."
      />
      {auditQuery.isError ? (
        <QueryError onRetry={() => auditQuery.refetch()} />
      ) : auditQuery.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl border border-border bg-card" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-lg bg-secondary text-primary">
                <History size={17} />
              </div>
              <div>
                <p className="font-display text-lg font-semibold text-foreground">Recent activity</p>
                <p className="text-xs text-muted-foreground">{auditQuery.data?.total ?? 0} recorded events</p>
              </div>
            </div>
            <Activity size={18} className="text-primary" />
          </div>
          {auditQuery.data?.items.length ? (
            <div className="divide-y divide-border">
              {auditQuery.data.items.map((event) => {
                const success = Number(event.metadata.statusCode ?? 200) < 400;
                return (
                  <div key={event.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[24px_minmax(0,1fr)_170px] sm:items-start">
                    <div className={`mt-0.5 ${success ? 'text-[#3b815a]' : 'text-destructive'}`}>
                      {success ? <CheckCircle2 size={17} /> : <CircleAlert size={17} />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{event.summary}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {event.actorName} · {event.action.replaceAll('_', ' ')}
                      </p>
                    </div>
                    <p className="text-left font-mono-ui text-[10px] uppercase tracking-[0.08em] text-muted-foreground sm:text-right">
                      {formatDate(event.createdAt)}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid min-h-56 place-items-center px-6 text-center">
              <div>
                <History size={25} className="mx-auto text-muted-foreground/50" />
                <p className="mt-3 font-display text-lg font-semibold text-foreground">No activity recorded yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Mutations will appear here as the workspace is used.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}