import {
  ArrowRight,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronDown,
  Circle,
  FileClock,
  FileDown,
  FileSpreadsheet,
  LayoutDashboard,
  MoreHorizontal,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import type { CSSProperties } from "react";

import "./_group.css";

const navigation = [
  { label: "Dashboard", icon: LayoutDashboard, active: true },
  { label: "LMS clients", icon: Users },
  { label: "CKYC requests", icon: FileClock },
  { label: "Download requests", icon: FileDown },
  { label: "Create data", icon: FileSpreadsheet },
];

const taskRows = [
  {
    title: "Response workbook",
    owner: "CKYC gateway",
    status: "Ready",
    time: "07:24",
    icon: FileSpreadsheet,
    done: true,
  },
  {
    title: "LMS client import",
    owner: "Operations desk",
    status: "In progress",
    time: "06:02",
    icon: UploadCloud,
  },
  {
    title: "Search request",
    owner: "Maker / checker",
    status: "In progress",
    time: "03 Sep",
    icon: FileDown,
  },
  {
    title: "Create data batch",
    owner: "Operations desk",
    status: "To do",
    time: "27 Sep",
    icon: FileClock,
  },
];

const workspaceTotals = [
  {
    label: "LMS clients",
    value: "96,312",
    detail: "Imported records",
    icon: Users,
    accent: "bg-[#eee6ff] text-[#8557c8]",
  },
  {
    label: "CKYC requests",
    value: "1",
    detail: "Request file created",
    icon: FileClock,
    accent: "bg-[#e3f2ff] text-[#4b9fda]",
  },
  {
    label: "Responses uploaded",
    value: "1",
    detail: "Latest workbook ready",
    icon: FileSpreadsheet,
    accent: "bg-[#dff5e8] text-[#4da87c]",
  },
  {
    label: "Download queue",
    value: "0",
    detail: "Nothing waiting",
    icon: FileDown,
    accent: "bg-[#fff1cf] text-[#d2a22d]",
  },
];

function ProgressRing({
  value,
  label,
  color,
  track = "#f1eef5",
}: {
  value: string;
  label: string;
  color: string;
  track?: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <div
        className="ring-progress grid size-[68px] place-items-center rounded-full"
        style={{ "--ring-color": color, "--ring-track": track } as CSSProperties}
      >
        <div className="grid size-[54px] place-items-center rounded-full bg-white">
          <span className="text-[13px] font-bold text-[#28323b]">{value}</span>
        </div>
      </div>
      <span className="text-center text-[9px] font-medium leading-3 text-[#7a818a]">{label}</span>
    </div>
  );
}

export function PremiumDashboard() {
  return (
    <div className="ckyc-premium-dashboard min-h-screen bg-[#f3f3f7] text-[#252a31]">
      <div className="flex min-h-screen gap-2 p-2">
        <aside className="flex w-[188px] shrink-0 flex-col rounded-[18px] border border-white bg-white px-3 py-4 shadow-[0_5px_18px_rgba(43,46,65,0.05)]">
          <div className="flex items-center gap-2 border-b border-[#eff0f3] px-2 pb-5">
            <div className="grid size-8 place-items-center rounded-full bg-[#e7dcff]">
              <span className="size-3 rounded-full bg-[#a77ce9]" />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-bold tracking-[-0.03em] text-[#20242b]">Light</p>
              <p className="text-[8px] uppercase tracking-[0.12em] text-[#a1a5ad]">Finance workspace</p>
            </div>
          </div>

          <nav className="mt-5 space-y-1" aria-label="Main navigation">
            {navigation.map(({ label, icon: Icon, active }) => (
              <button
                key={label}
                type="button"
                className={`flex w-full items-center gap-2.5 rounded-full px-3 py-2.5 text-left text-[10px] font-semibold ${
                  active
                    ? "bg-[#25252d] text-white shadow-[0_5px_12px_rgba(37,37,45,0.15)]"
                    : "text-[#707780] hover:bg-[#f3f1f8] hover:text-[#343841]"
                }`}
              >
                <Icon size={13} strokeWidth={active ? 2.2 : 1.8} />
                <span className="flex-1">{label}</span>
                {active ? <ArrowRight size={11} className="text-[#d8c5ff]" /> : <ChevronDown size={10} className="opacity-40" />}
              </button>
            ))}
          </nav>

          <div className="mt-auto space-y-3">
            <div className="rounded-2xl bg-[#eee6ff] p-3">
              <div className="mb-2 flex items-center justify-between">
                <Sparkles size={14} className="text-[#8557c8]" />
                <button type="button" aria-label="Dismiss assistant" className="text-[#a18ac0] hover:text-[#614291]">
                  <X size={12} />
                </button>
              </div>
              <p className="text-[11px] font-bold text-[#48366b]">AI Assistant</p>
              <p className="mt-1 text-[9px] leading-3.5 text-[#7d6b9e]">Today’s CKYC work is ready to review.</p>
              <button type="button" className="mt-3 text-[9px] font-bold text-[#7447b2]">Open summary →</button>
            </div>
            <div className="flex items-center gap-2 border-t border-[#eff0f3] px-2 pt-3">
              <div className="grid size-7 place-items-center rounded-full bg-[#e7c76b] text-[9px] font-bold text-[#28313a]">OP</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-bold text-[#363b43]">Operations desk</p>
                <p className="text-[8px] text-[#9ba0a7]">Maker / checker</p>
              </div>
              <Settings2 size={13} className="text-[#9ba0a7]" />
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="flex h-[57px] items-center justify-between rounded-[18px] border border-white bg-white px-5 shadow-[0_5px_18px_rgba(43,46,65,0.04)]">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-[17px] font-bold tracking-[-0.04em] text-[#2a2d34]">Dashboard</h1>
                <p className="mt-0.5 text-[8px] text-[#8e949c]">Monday, 03 September 2026 — Sunday, 09 September 2026</p>
              </div>
              <div className="hidden rounded-xl bg-[#eee7ff] px-4 py-2 sm:block">
                <p className="text-[8px] text-[#8f7ca7]">Workspace balance</p>
                <p className="text-[12px] font-bold text-[#3d3253]">96,312 <span className="text-[8px] font-medium text-[#8f7ca7]">clients</span></p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="grid size-7 place-items-center rounded-lg border border-[#ececf0] text-[#858a92] hover:bg-[#f6f5f9]" aria-label="Search">
                <Search size={13} />
              </button>
              <button type="button" className="grid size-7 place-items-center rounded-lg border border-[#ececf0] text-[#858a92] hover:bg-[#f6f5f9]" aria-label="Notifications">
                <Bell size={13} />
              </button>
              <button type="button" className="grid size-7 place-items-center rounded-lg border border-[#ececf0] text-[#858a92] hover:bg-[#f6f5f9]" aria-label="Settings">
                <Settings2 size={13} />
              </button>
              <div className="ml-1 flex items-center gap-1.5">
                <div className="grid size-7 place-items-center rounded-full bg-[#e7c76b] text-[8px] font-bold text-[#28313a]">OP</div>
                <ChevronDown size={11} className="text-[#8b9098]" />
              </div>
            </div>
          </header>

          <section className="grid gap-2 pt-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workspace totals">
            {workspaceTotals.map(({ label, value, detail, icon: Icon, accent }) => (
              <article
                key={label}
                className="flex items-center gap-3 rounded-[18px] border border-white bg-white px-4 py-3 shadow-[0_5px_18px_rgba(43,46,65,0.04)]"
              >
                <div className={`grid size-9 shrink-0 place-items-center rounded-xl ${accent}`}>
                  <Icon size={16} strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[9px] font-semibold text-[#737984]">{label}</p>
                    <p className="text-[18px] font-bold leading-none tracking-[-0.04em] text-[#2f333b]">{value}</p>
                  </div>
                  <p className="mt-1 truncate text-[8px] text-[#a0a5ad]">{detail}</p>
                </div>
              </article>
            ))}
          </section>

          <div className="grid gap-2 pt-2 xl:grid-cols-[1.32fr_0.88fr]">
            <section className="rounded-[18px] border border-white bg-white p-4 shadow-[0_5px_18px_rgba(43,46,65,0.04)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[12px] font-bold text-[#31353d]">Request activity</p>
                  <p className="mt-1 text-[8px] text-[#a0a5ad]">Files processed this week</p>
                </div>
                <button type="button" className="flex items-center gap-1 rounded-lg bg-[#f6f5f9] px-2 py-1.5 text-[8px] text-[#777d85]">
                  This week <ChevronDown size={9} />
                </button>
              </div>
              <div className="mt-4 flex h-[139px] items-end gap-2 border-b border-[#f0f0f3] px-1">
                {[48, 74, 61, 93, 82, 55, 89].map((height, index) => (
                  <div key={index} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                    <span className="text-[7px] text-[#a3a7af]">{[13, 8, 0, 5, 0, 0, 0][index]}</span>
                    <div className="flex h-[100px] w-full items-end rounded-md bg-[#e1f1f9]">
                      <div className={`w-full rounded-md ${index === 3 ? "bg-[#b679ee]" : "bg-[#39a8e9]"}`} style={{ height }} />
                    </div>
                    <span className="text-[7px] text-[#9298a1]">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[8px] text-[#899099]">
                  <span className="size-2 rounded-full bg-[#39a8e9]" /> Requests generated
                  <span className="ml-2 size-2 rounded-full bg-[#b679ee]" /> Selected day
                </div>
                  <span className="text-[9px] font-bold text-[#39a8e9]">5 files today</span>
              </div>
            </section>

            <section className="rounded-[18px] border border-white bg-white p-4 shadow-[0_5px_18px_rgba(43,46,65,0.04)]">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[12px] font-bold text-[#31353d]">Gateway response health</p>
                  <p className="mt-1 text-[8px] text-[#a0a5ad]">Response files returned by CKYC</p>
                </div>
                <div className="rounded-md bg-[#e7f6ef] px-2 py-1 text-[8px] font-bold text-[#4baf84]">94% healthy</div>
              </div>
              <div className="mt-3 flex items-center gap-3 text-[8px] text-[#7f8790]">
                <span><strong className="text-[#4baf84]">1</strong> response uploaded</span>
                <span className="size-1 rounded-full bg-[#ccd1d7]" />
                <span><strong className="text-[#4baf84]">0</strong> failed</span>
              </div>
              <div className="relative mt-5 h-[116px] overflow-hidden rounded-xl bg-[#f7fbfe]">
                <div className="absolute inset-x-3 top-4 flex justify-between text-[7px] text-[#a2a8b0]">
                  <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                </div>
                <svg viewBox="0 0 320 100" className="absolute inset-x-2 bottom-1 h-[90px] w-[calc(100%-16px)]" aria-label="Gateway response trend">
                  <path d="M4 82 C35 78, 30 26, 60 30 S90 78, 123 46 S158 18, 190 52 S220 20, 245 60 S276 20, 316 43" fill="none" stroke="#39a8e9" strokeWidth="2.5" />
                  <path d="M4 82 C35 78, 30 26, 60 30 S90 78, 123 46 S158 18, 190 52 S220 20, 245 60 S276 20, 316 43 L316 100 L4 100 Z" fill="url(#softBlue)" opacity="0.55" />
                  <defs><linearGradient id="softBlue" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#b8e3f8" /><stop offset="1" stopColor="#f7fbfe" /></linearGradient></defs>
                </svg>
                <span className="absolute left-[58%] top-[31%] grid size-6 place-items-center rounded-full bg-[#39a8e9] text-[7px] font-bold text-white shadow-[0_3px_7px_rgba(57,168,233,0.3)]">1</span>
              </div>
            </section>
          </div>

          <div className="grid gap-2 pt-2 xl:grid-cols-[1.32fr_0.88fr]">
            <section className="rounded-[18px] border border-white bg-white p-4 shadow-[0_5px_18px_rgba(43,46,65,0.04)]">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[12px] font-bold text-[#31353d]">Latest tasks</p>
                  <p className="mt-1 text-[8px] text-[#a0a5ad]"><strong className="text-[#4d535c]">4 total</strong>, files to review in your workspace</p>
                </div>
                <div className="flex gap-5 text-center">
                  <div><p className="text-[17px] font-bold text-[#2f333b]">3</p><p className="text-[7px] text-[#9da2aa]">Done</p></div>
                  <div><p className="text-[17px] font-bold text-[#2f333b]">1</p><p className="text-[7px] text-[#9da2aa]">In progress</p></div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-[1.2fr_0.8fr_0.7fr_0.4fr_0.4fr] items-center gap-2 border-y border-[#f0f0f3] py-2 text-[7px] font-medium text-[#a1a6ae]">
                <span>Task</span><span>Owner</span><span>Status</span><span>Time</span><span>Finish date</span>
              </div>
              <div className="divide-y divide-[#f1f1f4]">
                {taskRows.map(({ title, owner, status, time, icon: Icon, done }) => (
                  <div key={title} className="grid grid-cols-[1.2fr_0.8fr_0.7fr_0.4fr_0.4fr] items-center gap-2 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      {done ? <CheckCircle2 size={13} className="shrink-0 text-[#39a8e9]" /> : <Circle size={13} className="shrink-0 text-[#c7cbd1]" />}
                      <Icon size={12} className="shrink-0 text-[#9ca2ab]" />
                      <span className="truncate text-[8px] font-semibold text-[#535963]">{title}</span>
                    </div>
                    <span className="truncate text-[8px] text-[#858b94]">{owner}</span>
                    <span className={`w-fit rounded-full px-2 py-1 text-[7px] font-semibold ${status === "Ready" ? "bg-[#dff5e8] text-[#50a477]" : status === "To do" ? "bg-[#f1f1f4] text-[#858a92]" : "bg-[#e6f0ff] text-[#538cc4]"}`}>{status}</span>
                    <span className="text-[8px] text-[#858b94]">{time}</span>
                    <span className="text-[8px] text-[#858b94]">{done ? "Today" : "27 Sep"}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[18px] border border-white bg-white p-4 shadow-[0_5px_18px_rgba(43,46,65,0.04)]">
              <div className="flex items-center justify-between">
                <div><p className="text-[12px] font-bold text-[#31353d]">Progress</p><p className="mt-1 text-[8px] text-[#a0a5ad]">Workspace rhythm</p></div>
                <MoreHorizontal size={15} className="text-[#969ca4]" />
              </div>
              <div className="mt-5 flex gap-2">
                <ProgressRing value="64%" label="Weekly activity" color="#b679ee" />
                <ProgressRing value="26:43" label="Worked this week" color="#7092e8" track="#eef1f9" />
                <ProgressRing value="77%" label="Focus time" color="#5fd3df" track="#e9f8f9" />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <div className="rounded-[14px] bg-[#25252d] p-3 text-white">
                  <p className="text-[8px] text-white/50">Per month</p>
                  <p className="mt-2 text-[17px] font-bold">9+</p>
                  <p className="text-[8px] text-white/55">requests</p>
                  <div className="mt-3 flex items-end gap-1"><span className="h-3 w-1 rounded bg-[#b679ee]" /><span className="h-5 w-1 rounded bg-[#b679ee]" /><span className="h-8 w-1 rounded bg-[#b679ee]" /><span className="h-4 w-1 rounded bg-[#b679ee]" /></div>
                </div>
                <div className="rounded-[14px] bg-[#f7f7fa] p-3">
                  <p className="text-[8px] font-bold text-[#555b64]">Achievements</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="grid h-11 place-items-center rounded-lg bg-[#e8dcff] text-[17px] text-[#986fe5]"><ShieldCheck size={20} /></div>
                    <div className="grid h-11 place-items-center rounded-lg bg-[#dff5e8] text-[17px] text-[#4da87c]"><BarChart3 size={20} /></div>
                    <div className="grid h-11 place-items-center rounded-lg bg-[#e3f2ff] text-[17px] text-[#4b9fda]"><Users size={20} /></div>
                    <div className="grid h-11 place-items-center rounded-lg bg-[#fff1cf] text-[17px] text-[#d2a22d]"><CheckCircle2 size={20} /></div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <footer className="flex items-center justify-between px-2 py-3 text-[8px] text-[#9da2aa]">
            <span><span className="mr-1 inline-block size-1.5 rounded-full bg-[#58b98b]" /> CKYC gateway online</span>
            <span>Last synced just now</span>
          </footer>
        </main>
      </div>
    </div>
  );
}