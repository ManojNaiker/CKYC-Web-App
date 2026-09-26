import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import lightFinanceLogo from "@assets/Logo_Light_1788338497887.png";

export default function PublicHome() {
  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background px-5 py-12">
      <div className="pointer-events-none absolute -right-32 -top-40 size-[520px] rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -left-28 size-[480px] rounded-full bg-cyan-200/30 blur-3xl" />
      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border border-border bg-card shadow-[0_30px_100px_hsl(249_40%_20%_/_0.12)] lg:grid-cols-[1.1fr_.9fr]">
        <div className="flex flex-col justify-between bg-[#281e66] p-8 text-white sm:p-12">
          <img
            src={lightFinanceLogo}
            alt="Light Finance"
            className="h-12 w-52 rounded-md bg-white px-3 py-1 object-contain"
          />
          <div className="py-14">
            <p className="font-mono-ui text-[10px] font-semibold uppercase tracking-[.2em] text-[#b8dff7]">
              Light Finance / Operations
            </p>
            <h1 className="mt-4 max-w-lg font-display text-4xl font-semibold leading-tight tracking-[-.04em] sm:text-5xl">
              A secure workspace for CKYC operations.
            </h1>
            <p className="mt-5 max-w-lg text-sm leading-7 text-white/75">
              Sign in to review LMS client records, CKYC requests and operational
              workflows assigned to your role.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/65">
            <LockKeyhole size={14} />
            Protected sign-in with verified company email
          </div>
        </div>
        <div className="flex flex-col justify-center p-8 sm:p-12">
          <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck size={22} />
          </span>
          <p className="mt-6 font-mono-ui text-[10px] font-semibold uppercase tracking-[.18em] text-primary">
            Operations portal
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-.03em] text-foreground">
            Welcome
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Sign in with the Admin account to continue.
          </p>
          <Link
            href="/sign-in"
            className="mt-7 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:-translate-y-0.5"
          >
            Sign in <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </main>
  );
}