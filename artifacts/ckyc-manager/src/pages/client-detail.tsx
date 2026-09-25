import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, FileText, UserRound } from 'lucide-react';
import { Link, useParams } from 'wouter';
import { getListClientsQueryKey, useListClients } from '@workspace/api-client-react';
import { PageIntro, QueryError } from '@/components/workspace-shell';

function DetailItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="font-mono-ui text-[9px] uppercase tracking-[.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-[12px] font-semibold text-foreground">{value || '—'}</p>
    </div>
  );
}

export default function ClientDetail() {
  const params = useParams<{ clientId: string }>();
  const clientId = decodeURIComponent(params.clientId ?? '');
  const numericClientId = Number(clientId);
  const clientQuery = { clientId: Number.isInteger(numericClientId) && numericClientId > 0 ? numericClientId : undefined, page: 1, pageSize: 1 };
  const query = useListClients(
    clientQuery,
    { query: { enabled: Boolean(clientQuery.clientId), queryKey: getListClientsQueryKey(clientQuery) } },
  );
  const client = query.data?.items[0];

  if (query.isLoading) {
    return <div className="animate-pulse"><div className="h-5 w-36 rounded bg-muted" /><div className="mt-6 h-12 w-2/3 rounded bg-muted" /><div className="mt-8 h-56 rounded-xl bg-card" /></div>;
  }
  if (query.isError || !client) return <QueryError onRetry={() => query.refetch()} />;

  const hasFinalCkyc = Boolean(client.ckycNumber?.trim());
  const isCreateMatch = client.ckycResponseMatchStatus === 'Match via Create CKYC';
  const isUnresolvedResponseError =
    client.ckycResponseStatus === 'error' && !hasFinalCkyc;
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
              <div><p className="font-display text-[17px] font-bold">CKYC response trail</p><p className="mt-1 text-[11px] text-muted-foreground">The exact rows used for this client</p></div>
            </div>
            <div className="mt-5 space-y-4">
              <div><p className="font-mono-ui text-[9px] uppercase tracking-[.14em] text-muted-foreground">Request matched row</p><pre className="mt-2 overflow-x-auto rounded-lg bg-[#17343a] p-3 font-mono-ui text-[10px] leading-5 text-[#c2e3d9]">{client.ckycResponseRequestLine || 'No request row saved yet.'}</pre></div>
              <div><p className="font-mono-ui text-[9px] uppercase tracking-[.14em] text-muted-foreground">Response matched row</p><pre className="mt-2 overflow-x-auto rounded-lg bg-[#17343a] p-3 font-mono-ui text-[10px] leading-5 text-[#c2e3d9]">{client.ckycResponseMatchedRow || 'No response row saved yet.'}</pre></div>
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
              <div><p className="text-[13px] font-bold">{responseStatus}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{isCreateMatch ? 'Source: CKYC Create data' : `Matched by ${client.ckycResponseMatchedBy || '—'}`}</p></div>
            </div>
            <div className="mt-5 space-y-3 border-t border-border pt-4">
              <DetailItem label="CKYC response ID" value={client.ckycResponseId} />
              <DetailItem label="Response match status" value={client.ckycResponseMatchStatus} />
              <DetailItem label="Final CKYC number" value={client.ckycNumber} />
              <DetailItem label="Response file" value={client.ckycResponseFileName} />
              {client.ckycResponseError && <DetailItem label={hasFinalCkyc ? 'Previous response message' : 'Response message'} value={client.ckycResponseError} />}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}