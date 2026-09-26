import { useState } from "react";
import {
  getListAuditTrailsQueryKey,
  useListAuditTrails,
} from "@workspace/api-client-react";
import { ChevronLeft, ChevronRight, ClipboardList, Download, Loader2 } from "lucide-react";
import { EmptyState, PageIntro, QueryError } from "@/components/workspace-shell";
import { roleLabel, type AppRole } from "@/lib/role-access";

const PAGE_SIZE = 50;

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isDataTransfer(path: string): boolean {
  return path.includes("/export") || path.endsWith("/file");
}

export default function AuditTrails() {
  const [offset, setOffset] = useState(0);
  const queryParams = { limit: PAGE_SIZE, offset };
  const query = useListAuditTrails(queryParams, {
    query: {
      queryKey: getListAuditTrailsQueryKey(queryParams),
      refetchOnWindowFocus: true,
    },
  });
  const events = query.data?.events ?? [];
  const total = query.data?.total ?? 0;
  const hasPrevious = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  return (
    <div>
      <PageIntro
        eyebrow="Governance / Admin"
        title="Audit trails"
        description="Review workspace changes, role updates, and CKYC or client exports and downloads."
        action={
          <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">
            <ClipboardList size={15} className="text-primary" />
            {total.toLocaleString()} events
          </div>
        }
      />

      {query.isError ? (
        <QueryError onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <div className="flex min-h-48 items-center justify-center gap-3 rounded-xl border border-border bg-card text-sm text-muted-foreground">
          <Loader2 size={18} className="animate-spin text-primary" />
          Loading audit history…
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No audit events yet"
          detail="Changes and sensitive exports will appear here as they happen."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="data-table w-full min-w-[920px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Request ID</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const transfer = isDataTransfer(event.path);
                  const assignedRole = event.metadata?.assignedRole;
                  return (
                    <tr
                      key={event.id}
                      className="border-b border-border/70 last:border-0"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {formatTimestamp(event.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground">
                          {event.actorEmail ?? "Account unavailable"}
                        </p>
                        <p className="mt-0.5 font-mono-ui text-[10px] uppercase tracking-[.08em] text-muted-foreground">
                          {roleLabel(event.actorRole as AppRole)}
                        </p>
                      </td>
                      <td className="max-w-[430px] px-4 py-3">
                        <div className="flex items-start gap-2">
                          {transfer ? (
                            <Download
                              size={15}
                              className="mt-0.5 text-amber-600"
                            />
                          ) : (
                            <ClipboardList
                              size={15}
                              className="mt-0.5 text-primary"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="font-mono-ui text-xs font-semibold text-foreground">
                              {event.method} {event.path}
                            </p>
                            {typeof assignedRole === "string" && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Assigned role: {assignedRole}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 font-mono-ui text-[10px] font-semibold ${
                            event.statusCode >= 400
                              ? "bg-[hsl(var(--danger-bg))] text-destructive"
                              : "bg-[hsl(var(--success-bg))] text-[hsl(var(--success))]"
                          }`}
                        >
                          {event.statusCode}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono-ui text-[10px] text-muted-foreground">
                        {event.requestId ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {offset + 1}–{Math.min(offset + events.length, total)} of{" "}
              {total}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
                disabled={!hasPrevious}
                className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground hover:bg-secondary disabled:opacity-35"
                aria-label="Previous audit events"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => setOffset((current) => current + PAGE_SIZE)}
                disabled={!hasNext}
                className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground hover:bg-secondary disabled:opacity-35"
                aria-label="Next audit events"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}