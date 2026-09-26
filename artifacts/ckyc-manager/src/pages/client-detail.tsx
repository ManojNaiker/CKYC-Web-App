import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, FileText, Loader2, UserRound } from 'lucide-react';
import { Link, useParams } from 'wouter';
import {
  getGetClientCkycResponseRestorationAuditQueryKey,
  getGetCurrentAppUserQueryKey,
  getListClientsQueryKey,
  useGetClientCkycResponseRestorationAudit,
  useGetCurrentAppUser,
  useListClients,
  useRestoreClientCkycResponseRows,
} from '@workspace/api-client-react';
import { PageIntro, QueryError } from '@/components/workspace-shell';

function getMutationErrorMessage(error: unknown) {
  const apiError = error as { data?: { error?: unknown } };
  if (typeof apiError.data?.error === 'string') return apiError.data.error;
  return error instanceof Error ? error.message : 'Could not restore the CKYC source rows.';
}

function DetailItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="font-mono-ui text-[9px] uppercase tracking-[.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-[12px] font-semibold text-foreground">{value || '—'}</p>
    </div>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
}

export default function ClientDetail() {
  const params = useParams<{ clientId: string }>();
  const clientId = decodeURIComponent(params.clientId ?? '');
  const numericClientId = Number(clientId);
  const clientQuery = { clientId: Number.isInteger(numericClientId) && numericClientId > 0 ? numericClientId : undefined, page: 1, pageSize: 1 };
  const safeClientId = clientQuery.clientId ?? 0;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreFeedback, setRestoreFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const currentUserQuery = useGetCurrentAppUser({
    query: { queryKey: getGetCurrentAppUserQueryKey() },
  });
  const restorationAuditQuery = useGetClientCkycResponseRestorationAudit(
    safeClientId,
    {
      query: {
        enabled: Boolean(clientQuery.clientId),
        queryKey: getGetClientCkycResponseRestorationAuditQueryKey(safeClientId),
      },
    },
  );
  const restoreMutation = useRestoreClientCkycResponseRows();
  const query = useListClients(
    clientQuery,
    { query: { enabled: Boolean(clientQuery.clientId), queryKey: getListClientsQueryKey(clientQuery) } },
  );
  const client = query.data?.items[0];
  const canRestore =
    currentUserQuery.data?.user.role === 'manager' ||
    currentUserQuery.data?.user.role === 'admin';

  const restoreSourceRows = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!restoreFile || !clientQuery.clientId) return;

    setRestoreFeedback(null);
    setReadingFile(true);
    try {
      const content = await restoreFile.text();
      setReadingFile(false);
      await restoreMutation.mutateAsync({
        clientId: clientQuery.clientId,
        data: { fileName: restoreFile.name, content },
      });
      setRestoreFeedback({
        kind: 'success',
        message: 'Source rows restored. The audit entry is saved below.',
      });
      setRestoreFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      void queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
      void queryClient.invalidateQueries({
        queryKey: getGetClientCkycResponseRestorationAuditQueryKey(safeClientId),
      });
    } catch (error) {
      setRestoreFeedback({ kind: 'error', message: getMutationErrorMessage(error) });
    } finally {
      setReadingFile(false);
    }
  };

  if (query.isLoading) {
    return <div className="animate-pulse"><div className="h-5 w-36 rounded bg-muted" /><div className="mt-6 h-12 w-2/3 rounded bg-muted" /><div className="mt-8 h-56 rounded-xl bg-card" /></div>;
  }
  if (query.isError || !client) return <QueryError onRetry={() => query.refetch()} />;

  const hasFinalCkyc = Boolean(client.ckycNumber?.trim());
  const hasResponseSummary = Boolean(client.ckycResponseId || client.ckycResponseFileName);
  const hasMissingSourceRows =
    !client.ckycResponseRequestLine?.trim() ||
    !client.ckycResponseMatchedRow?.trim();
  const isCreateMatch = client.ckycResponseMatchStatus === 'Match via Create CKYC';
  const isUnresolvedResponseError =
    client.ckycResponseStatus === 'error' && !hasFinalCkyc;
  const isFinfluxUpdated = Boolean(client.finfluxCkycUpdatedAt);
  const responseStatus = hasFinalCkyc
    ? isCreateMatch
      ? 'Final CKYC saved from Create data'
      : 'Final CKYC saved'
    : client.ckycResponseId
      ? 'CKYC response ID received'
      : client.ckycResponseStatus === 'error'
        ? 'Response returned without CKYC ID'
        : 'Awaiting CKYC response';

  return (
    <div className="animate-fade">
      <Link href="/clients" className="mb-6 inline-flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[.12em] text-muted-foreground hover:text-primary" data-testid="link-back-clients">
        <ArrowLeft size={14} /> All clients
      </Link>
      <PageIntro
        eyebrow="LMS client detail"
        title={client.ClientName}
        description={`Client ID ${client.ClientID} · Loan ID ${client.loanid}`}
        action={
          <Link href={`/requests?client=${client.id}`} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[12px] font-bold text-primary-foreground shadow-sm hover:-translate-y-0.5" data-testid="link-use-client-in-request">
            Use in CKYC request <ArrowRight size={15} />
          </Link>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <span className="grid size-10 place-items-center rounded-full bg-[#dcefeb] text-primary"><UserRound size={18} /></span>
              <div><p className="font-display text-[17px] font-bold">Client information</p><p className="mt-1 text-[11px] text-muted-foreground">Imported LMS record</p></div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <DetailItem label="LMS Client ID" value={client.ClientID} />
              <DetailItem label="Loan ID" value={client.loanid} />
              <DetailItem label="Gender" value={client.Gender} />
              <DetailItem label="Date of birth" value={client.date_of_birth} />
              <DetailItem label="Mobile" value={client.mobile_no} />
              <DetailItem label="Alternate mobile" value={client.alternate_mobile_no} />
              <DetailItem label="Aadhaar / UID" value={client.Client_UID} />
              <DetailItem label="VID" value={client.Client_VID} />
              <DetailItem label="PAN" value={client.Client_PAN} />
              <DetailItem label="Disbursement date" value={client.disbursedon_date} />
            </div>
          </section>
          <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <span className="grid size-10 place-items-center rounded-lg bg-secondary text-primary"><FileText size={18} /></span>
              <div><p className="font-display text-[17px] font-bold">CKYC response trail</p><p className="mt-1 text-[11px] text-muted-foreground">Saved request and response source rows</p></div>
            </div>
            <div className="mt-5 space-y-4">
              <div>
                <p className="font-mono-ui text-[9px] uppercase tracking-[.14em] text-muted-foreground">Request matched row</p>
                {client.ckycResponseRequestLine
                  ? <pre className="mt-2 overflow-x-auto rounded-lg bg-[#17343a] p-3 font-mono-ui text-[10px] leading-5 text-[#c2e3d9]">{client.ckycResponseRequestLine}</pre>
                  : <p className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-3 text-[11px] leading-5 text-muted-foreground">{hasResponseSummary ? 'The saved history does not contain the request row for this response.' : 'No request row saved yet.'}</p>}
              </div>
              <div>
                <p className="font-mono-ui text-[9px] uppercase tracking-[.14em] text-muted-foreground">Response matched row</p>
                {client.ckycResponseMatchedRow
                  ? <pre className="mt-2 overflow-x-auto rounded-lg bg-[#17343a] p-3 font-mono-ui text-[10px] leading-5 text-[#c2e3d9]">{client.ckycResponseMatchedRow}</pre>
                  : <p className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-3 text-[11px] leading-5 text-muted-foreground">{hasResponseSummary ? 'The response ID and file reference are saved, but the original raw response row was not retained. It cannot be reconstructed without the original response file.' : 'No response row saved yet.'}</p>}
              </div>
              {canRestore && hasMissingSourceRows && client.ckycResponseId && (
                <form
                  onSubmit={restoreSourceRows}
                  className="rounded-lg border border-border bg-muted/25 p-4"
                  data-testid="restore-ckyc-response-rows"
                >
                  <p className="text-[12px] font-bold text-foreground">Restore missing source rows</p>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                    Upload the original CKYC response file. The restore is accepted only when its saved response ID and request sequence identify one exact client row.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.csv,text/plain"
                    onChange={(event) => {
                      setRestoreFile(event.target.files?.[0] ?? null);
                      setRestoreFeedback(null);
                    }}
                    className="mt-3 block w-full text-[11px] text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:font-semibold file:text-secondary-foreground"
                    aria-label="Original CKYC response file"
                  />
                  <button
                    type="submit"
                    disabled={!restoreFile || readingFile || restoreMutation.isPending}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-[11px] font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {(readingFile || restoreMutation.isPending) && <Loader2 size={13} className="animate-spin" />}
                    {readingFile || restoreMutation.isPending ? 'Verifying file…' : 'Restore source rows'}
                  </button>
                  {restoreFeedback && (
                    <p
                      role="status"
                      className={`mt-3 text-[11px] leading-5 ${restoreFeedback.kind === 'success' ? 'text-emerald-700' : 'text-destructive'}`}
                    >
                      {restoreFeedback.message}
                    </p>
                  )}
                </form>
              )}
              {restorationAuditQuery.data?.auditEntry && (
                <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3" data-testid="ckyc-restoration-audit">
                  <p className="font-mono-ui text-[9px] uppercase tracking-[.14em] text-muted-foreground">Restoration audit entry</p>
                  <p className="mt-1 text-[11px] font-semibold text-foreground">
                    {restorationAuditQuery.data.auditEntry.actorEmail ?? restorationAuditQuery.data.auditEntry.actorRole}
                    {' · '}{formatDate(restorationAuditQuery.data.auditEntry.createdAt)}
                  </p>
                  <p className="mt-1 break-words text-[10px] text-muted-foreground">
                    Original response file: {restorationAuditQuery.data.auditEntry.fileName}
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
        <aside className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <p className="font-mono-ui text-[9px] uppercase tracking-[.17em] text-muted-foreground">CKYC status</p>
            <div className="mt-5 flex items-start gap-3">
              <span className={`grid size-9 place-items-center rounded-lg ${isUnresolvedResponseError ? 'bg-[#fff1d6] text-[#9b6915]' : client.ckycResponseId || client.ckycNumber ? 'bg-[#e2f2e9] text-[#31734d]' : 'bg-secondary text-primary'}`}>
                {isUnresolvedResponseError ? <Clock3 size={17} /> : <CheckCircle2 size={17} />}
              </span>
              <div><p className="text-[13px] font-bold">{responseStatus}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{isCreateMatch ? 'Source: CKYC Create data' : client.ckycResponseMatchedBy ? `Matched by ${client.ckycResponseMatchedBy}` : hasResponseSummary && !client.ckycResponseMatchedRow ? 'Cannot verify the name match without the saved response row.' : 'Matched by —'}</p></div>
            </div>
            <div className="mt-5 space-y-3 border-t border-border pt-4">
              <DetailItem label="CKYC response ID" value={client.ckycResponseId} />
              <DetailItem label="Response match status" value={client.ckycResponseMatchStatus} />
              <DetailItem label="Final CKYC number" value={client.ckycNumber} />
              <DetailItem label="Response file" value={client.ckycResponseFileName} />
              {client.ckycResponseError && <DetailItem label={hasFinalCkyc ? 'Previous response message' : 'Response message'} value={client.ckycResponseError} />}
            </div>
          </section>
          <section
            className="rounded-xl border border-border bg-card p-5 shadow-xs"
            data-testid="finflux-client-status"
            aria-label="FinFlux update status"
          >
            <p className="font-mono-ui text-[9px] uppercase tracking-[.17em] text-muted-foreground">FinFlux update status</p>
            <div className="mt-5 flex items-start gap-3">
              <span className={`grid size-9 place-items-center rounded-lg ${isFinfluxUpdated ? 'bg-[#e2f2e9] text-[#31734d]' : hasFinalCkyc ? 'bg-[#fff1d6] text-[#9b6915]' : 'bg-secondary text-muted-foreground'}`}>
                {isFinfluxUpdated ? <CheckCircle2 size={17} /> : <Clock3 size={17} />}
              </span>
              <div>
                <p className="text-[13px] font-bold">{isFinfluxUpdated ? 'Updated' : hasFinalCkyc ? 'Pending' : 'Final CKYC required'}</p>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  {isFinfluxUpdated
                    ? 'The saved Final CKYC number was confirmed in FinFlux.'
                    : hasFinalCkyc
                      ? 'A Final CKYC number is saved, but this identifier has not been confirmed in FinFlux.'
                      : 'Save a Final CKYC number before sending this record to FinFlux.'}
                </p>
              </div>
            </div>
            {client.finfluxCkycUpdatedAt && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="font-mono-ui text-[9px] uppercase tracking-[.14em] text-muted-foreground">Status recorded in manager</p>
                <p className="mt-1 text-[11px] font-semibold text-foreground">{formatDate(client.finfluxCkycUpdatedAt)}</p>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}