import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  Bell,
  ChevronDown,
  Command,
  Database,
  FileClock,
  FileDown,
  FileSpreadsheet,
  LayoutDashboard,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Users,
} from "lucide-react";

import "./_group.css";

const navItems = [
  { label: "Overview", icon: LayoutDashboard, active: true },
  { label: "LMS clients", icon: Users },
  { label: "CKYC requests", icon: FileClock },
  { label: "CKYC download", icon: FileDown },
  { label: "Create data", icon: FileSpreadsheet },
];

const stats = [
  {
    label: "Imported clients",
    value: "96,312",
    delta: "+8.4%",
    detail: "Rows available for search",
    icon: Users,
    tone: "mint",
  },
  {
    label: "Request files",
    value: "1",
    delta: "Active",
    detail: "CKYC files generated",
    icon: FileClock,
    tone: "gold",
  },
  {
    label: "Responses uploaded",
    value: "1",
    delta: "Matched",
    detail: "Files returned by gateway",
    icon: FileSpreadsheet,
    tone: "blue",
  },
  {
    label: "Workspace health",
    value: "Good",
    delta: "Live",
    detail: "Gateway connection active",
    icon: ShieldCheck,
    tone: "lime",
  },
];

const activities = [
  {
    title: "IN2884_03092026_V1.1_S10001_Res.txt",
    type: "CKYC response",
    time: "Today, 07:24 am",
    status: "Response in",
    icon: FileSpreadsheet,
  },
  {
    title: "ckyc_formate_2026-02-01_2026-08-31.csv",
    type: "LMS client import",
    time: "Yesterday, 06:02 am",
    status: "96,312 rows",
    icon: UploadCloud,
  },
  {
    title: "IN2884_03092026_V1.1_S10001.txt",
    type: "Search request",
    time: "03 Sep 2026, 07:24 am",
    status: "Generated",
    icon: FileDown,
  },
];

function StatCard({
  label,
  value,
  delta,
  detail,
  icon: Icon,
  tone,
}: (typeof stats)[number]) {
  return (
    <article className="group rounded-2xl border border-[#e0e7e1] bg-white p-5 shadow-[0_10px_30px_rgba(27,43,48,0.035)] hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(27,43,48,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <p className="mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#7b898d]">
          {label}
        </p>
        <span
          className={`grid size-10 place-items-center rounded-xl ${
            tone === "mint"
              ? "bg-[#e1f4ee] text-[#168b77]"
              : tone === "gold"
                ? "bg-[#fff3cf] text-[#9e7413]"
                : tone === "blue"
                  ? "bg-[#e6f1f6] text-[#347d9a]"
                  : "bg-[#edf3d8] text-[#6b8a21]"
          }`}
        >
          <Icon size={18} strokeWidth={1.8} />
        </span>
      </div>
      <div className="mt-7 flex items-end justify-between gap-3">
        <p className="display text-[34px] font-semibold leading-none tracking-[-0.04em]">
          {value}
        </p>
        <span className="rounded-full bg-[#eff8f4] px-2.5 py-1 text-[10px] font-semibold text-[#168b77]">
          {delta}
        </span>
      </div>
      <p className="mt-3 text-[11px] text-[#7b898d]">{detail}</p>
    </article>
  );
}

export function PremiumDashboard() {
  return (
    <div className="ckyc-premium-dashboard min-h-screen bg-[var(--canvas)]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[242px] shrink-0 flex-col bg-[var(--navy)] px-4 py-5 text-white lg:flex">
          <div className="flex items-center gap-3 border-b border-white/10 px-2 pb-6">
            <div className="flex h-10 w-[150px] items-center rounded-lg bg-white px-2.5">
              <img
                src="/__mockup/images/light-logo.png"
                alt="Light Finance"
                className="h-auto w-full object-contain"
              />
            </div>
          </div>

          <div className="px-2 pt-8">
            <p className="mono mb-3 text-[9px] uppercase tracking-[0.2em] text-white/35">
              Workspace
            </p>
            <nav className="space-y-1.5" aria-label="Main navigation">
              {navItems.map(({ label, icon: Icon, active }) => (
                <a
                  href="#"
                  key={label}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-[12px] font-semibold ${
                    active
                      ? "bg-[#284452] text-white shadow-[inset_3px_0_0_#50c5a7]"
                      : "text-white/55 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon size={16} strokeWidth={active ? 2.2 : 1.8} className={active ? "text-[#7de0c2]" : ""} />
                  <span className="flex-1">{label}</span>
                  {active && <ArrowRight size={13} className="text-[#7de0c2]" />}
                </a>
              ))}
            </nav>
          </div>

          <div className="mt-auto space-y-4">
            <div className="grid-paper rounded-2xl border border-white/10 bg-white/[0.045] p-4">
              <div className="mb-4 flex items-center justify-between">
                <span className="mono text-[9px] uppercase tracking-[0.18em] text-white/40">
                  System status
                </span>
                <span className="size-2 rounded-full bg-[#66d9b5] shadow-[0_0_0_5px_rgba(102,217,181,0.12)]" />
              </div>
              <p className="text-[12px] font-semibold text-white/85">CKYC gateway online</p>
              <p className="mt-1 text-[10px] text-white/40">Last checked just now</p>
            </div>
            <div className="flex items-center gap-3 border-t border-white/10 px-2 pt-4">
              <div className="grid size-8 place-items-center rounded-full bg-[#e6c86a] text-[10px] font-bold text-[#1b3239]">
                OP
              </div>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-white/85">Operations desk</p>
                <p className="mono text-[9px] uppercase tracking-[0.1em] text-white/35">Maker / checker</p>
              </div>
              <Settings2 size={14} className="ml-auto text-white/35" />
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="flex h-[76px] items-center justify-between border-b border-[#dfe6e1] bg-white/80 px-5 backdrop-blur-xl sm:px-8">
            <div className="flex items-center gap-4">
              <div className="grid size-9 place-items-center rounded-xl bg-[#e2f4ed] text-[#168b77] lg:hidden">
                <Activity size={17} />
              </div>
              <div>
                <p className="mono text-[9px] uppercase tracking-[0.19em] text-[#8a9798]">
                  Light Finance / Workspace
                </p>
                <h1 className="mt-1 text-[16px] font-semibold tracking-[-0.01em] text-[var(--ink)]">
                  Overview
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <button className="hidden items-center gap-2 rounded-xl border border-[#dfe6e1] bg-white px-3 py-2 text-[11px] font-medium text-[#7b898d] shadow-sm hover:border-[#b7cbc2] hover:text-[var(--ink)] sm:flex">
                <Search size={14} />
                Search workspace
                <span className="ml-2 flex items-center gap-0.5 rounded-md bg-[#f1f4f0] px-1.5 py-1 mono text-[9px] text-[#83908f]">
                  <Command size={9} /> K
                </span>
              </button>
              <button className="relative grid size-9 place-items-center rounded-xl border border-[#dfe6e1] text-[#718087] hover:bg-[#f4f7f4]" aria-label="Notifications">
                <Bell size={16} />
                <span className="absolute right-2 top-2 size-1.5 rounded-full bg-[#1c9a83]" />
              </button>
              <div className="grid size-9 place-items-center rounded-full bg-[#e7c96b] text-[10px] font-bold text-[#21373d]">
                OP
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 sm:py-10">
            <section className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#cde6dc] bg-[#e9f7f1] px-3 py-1.5 text-[10px] font-semibold text-[#168b77]">
                  <Sparkles size={12} />
                  OPERATIONS OVERVIEW
                </div>
                <h2 className="display max-w-[560px] text-[42px] font-semibold leading-[0.98] tracking-[-0.045em] text-[var(--ink)] sm:text-[52px]">
                  Keep the trail
                  <br />
                  <span className="text-[#1c9a83]">intact.</span>
                </h2>
                <p className="mt-4 max-w-[600px] text-[13px] leading-6 text-[#718087]">
                  A live view of imported LMS records, generated search files, and responses returned by the CKYC gateway.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="inline-flex items-center gap-2 rounded-xl border border-[#dfe6e1] bg-white px-4 py-3 text-[11px] font-semibold text-[var(--ink)] shadow-sm hover:-translate-y-0.5 hover:border-[#b7cbc2]">
                  <ArrowDownToLine size={15} className="text-[#1c9a83]" />
                  Download report
                </button>
                <button className="inline-flex items-center gap-2 rounded-xl bg-[#1c9a83] px-4 py-3 text-[11px] font-semibold text-white shadow-[0_10px_20px_rgba(28,154,131,0.2)] hover:-translate-y-0.5 hover:bg-[#147d6a]">
                  <Plus size={15} />
                  Create request
                </button>
              </div>
            </section>

            <section className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <StatCard key={stat.label} {...stat} />
              ))}
            </section>

            <section className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
              <article className="rounded-2xl border border-[#dfe6e1] bg-white p-5 shadow-[0_10px_30px_rgba(27,43,48,0.035)] sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="mono text-[10px] uppercase tracking-[0.16em] text-[#8a9798]">Request pipeline</p>
                    <h3 className="display mt-2 text-[25px] font-semibold tracking-[-0.025em]">Records moving cleanly</h3>
                  </div>
                  <button className="grid size-9 place-items-center rounded-xl border border-[#dfe6e1] text-[#718087] hover:bg-[#f4f7f4]" aria-label="More pipeline options">
                    <MoreHorizontal size={16} />
                  </button>
                </div>
                <div className="mt-7 flex h-[196px] items-end gap-3 border-b border-[#e8eeea] px-1 pb-0 sm:gap-6">
                  {[38, 58, 48, 74, 65, 92, 82, 100, 88, 114, 104, 126].map((height, index) => (
                    <div key={index} className="group flex h-full flex-1 flex-col justify-end gap-2">
                      <div
                        className={`w-full rounded-t-md ${index > 8 ? "bg-[#1c9a83]" : index > 5 ? "bg-[#9ed9c8]" : "bg-[#dcefe8]"} transition-all group-hover:bg-[#167f6c]`}
                        style={{ height }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex justify-between mono text-[9px] uppercase tracking-[0.12em] text-[#9ba7a8]">
                  <span>01 Sep</span>
                  <span>08 Sep</span>
                  <span>15 Sep</span>
                  <span>Today</span>
                </div>
              </article>

              <article className="grid-paper overflow-hidden rounded-2xl bg-[var(--navy)] p-6 text-white shadow-[0_14px_30px_rgba(23,43,53,0.14)]">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="mono text-[10px] uppercase tracking-[0.16em] text-[#78d8bc]">Quick actions</p>
                    <h3 className="display mt-2 text-[25px] font-semibold leading-tight">Move work<br />forward.</h3>
                  </div>
                  <div className="grid size-10 place-items-center rounded-xl bg-white/10 text-[#78d8bc]">
                    <BarChart3 size={18} />
                  </div>
                </div>
                <div className="mt-8 space-y-2">
                  <button className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-3 text-left text-[11px] font-semibold text-white/80 hover:bg-white/[0.13]">
                    <Database size={15} className="text-[#78d8bc]" />
                    Import LMS client rows
                    <ArrowRight size={14} className="ml-auto text-white/35" />
                  </button>
                  <button className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-3 text-left text-[11px] font-semibold text-white/80 hover:bg-white/[0.13]">
                    <FileDown size={15} className="text-[#e6c86a]" />
                    Prepare a D request
                    <ArrowRight size={14} className="ml-auto text-white/35" />
                  </button>
                </div>
              </article>
            </section>

            <section className="mt-5 rounded-2xl border border-[#dfe6e1] bg-white shadow-[0_10px_30px_rgba(27,43,48,0.035)]">
              <div className="flex flex-col gap-3 border-b border-[#e8eeea] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div>
                  <p className="mono text-[10px] uppercase tracking-[0.16em] text-[#8a9798]">Recent activity</p>
                  <h3 className="display mt-1 text-[23px] font-semibold tracking-[-0.02em]">The latest files in this workspace</h3>
                </div>
                <a href="#" className="inline-flex items-center gap-2 text-[11px] font-semibold text-[#1c9a83] hover:text-[#147d6a]">
                  View all activity <ArrowRight size={14} />
                </a>
              </div>
              <div className="divide-y divide-[#edf1ed]">
                {activities.map(({ title, type, time, status, icon: Icon }) => (
                  <div key={title} className="flex items-center gap-4 px-5 py-4 hover:bg-[#fbfcfa] sm:px-6">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e8f6f0] text-[#1c9a83]">
                      <Icon size={17} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-[var(--ink)]">{title}</p>
                      <p className="mt-1 text-[10px] text-[#8a9798]">{type} · {time}</p>
                    </div>
                    <span className="hidden rounded-full bg-[#eef8f3] px-3 py-1.5 text-[10px] font-semibold text-[#168b77] sm:inline-flex">{status}</span>
                    <ArrowRight size={15} className="text-[#aab7b4]" />
                  </div>
                ))}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}