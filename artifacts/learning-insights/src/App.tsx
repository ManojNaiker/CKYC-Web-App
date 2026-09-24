import { useState, type ReactNode } from 'react';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  Copy,
  Download,
  Filter,
  GraduationCap,
  LayoutDashboard,
  MessageSquareText,
  MoreHorizontal,
  Search,
  Settings,
  Share2,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, CartesianGrid, XAxis, YAxis, AreaChart, Area } from 'recharts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Router as WouterRouter, Switch, useLocation } from 'wouter';

type Program = {
  id: string;
  course: string;
  audience: string;
  participants: number;
  change: number;
  progress: number;
  due: string;
  score: number;
  color: string;
};

type Team = {
  id: string;
  name: string;
  members: number;
  growth: number;
  completion: number;
  status: 'On track' | 'Needs attention' | 'Ahead';
  color: string;
};

type Department = {
  id: string;
  name: string;
  score: number;
  completion: number;
  learners: number;
  color: string;
};

const programs: Program[] = [
  { id: 'it-english', course: 'IT English', audience: 'for Tech Teams', participants: 68, change: 32, progress: 86, due: '7 Jan 2026', score: 4.8, color: '#5bd6a0' },
  { id: 'ux-research', course: 'UX Research', audience: 'Product & Design', participants: 34, change: 6, progress: 24, due: '4 Jan 2026', score: 4.4, color: '#67c7ef' },
  { id: 'soft-skills', course: 'Soft Skills', audience: 'Engineering Teams', participants: 51, change: -16, progress: 46, due: '26 Dec 2025', score: 5.0, color: '#f3c76a' },
];

const teams: Team[] = [
  { id: 'team-members', name: 'Team members', members: 154, growth: 8.4, completion: 76, status: 'On track', color: '#0d93c8' },
  { id: 'engineering', name: 'Engineering', members: 61, growth: 13.2, completion: 82, status: 'Ahead', color: '#79cba2' },
  { id: 'product', name: 'Product', members: 37, growth: 8.7, completion: 73, status: 'On track', color: '#efbc66' },
  { id: 'design', name: 'Design', members: 28, growth: 5.1, completion: 69, status: 'Needs attention', color: '#f28f93' },
  { id: 'sales', name: 'Sales', members: 16, growth: 4.5, completion: 71, status: 'On track', color: '#9d8be6' },
  { id: 'ops', name: 'Operations', members: 12, growth: -2.4, completion: 61, status: 'Needs attention', color: '#89a9c7' },
];

const departments: Department[] = [
  { id: 'marketing', name: 'Marketing', score: 4.9, completion: 91, learners: 18, color: '#edc369' },
  { id: 'development', name: 'Development', score: 4.4, completion: 82, learners: 61, color: '#f5cd78' },
  { id: 'design-department', name: 'Design', score: 3.9, completion: 76, learners: 28, color: '#f4cf83' },
  { id: 'management', name: 'Management', score: 3.5, completion: 68, learners: 11, color: '#f6d797' },
  { id: 'finance', name: 'Finance', score: 1.8, completion: 44, learners: 9, color: '#f5deb0' },
  { id: 'hr', name: 'HR Department', score: 0.9, completion: 28, learners: 7, color: '#f2e6c9' },
];

const spending = [
  { name: 'Online courses', value: 32, amount: '$8,160', color: '#b7b0dc' },
  { name: 'Certifications', value: 24, amount: '$12,500', color: '#e7cef0' },
  { name: 'Workshops', value: 16, amount: '$3,350', color: '#f7d5a6' },
  { name: 'Learning platforms', value: 28, amount: '$6,240', color: '#9edcc5' },
];

const learningHours = [
  { day: 'Mon', hours: 2.8, last: 2.3 },
  { day: 'Tue', hours: 4.2, last: 3.2 },
  { day: 'Wed', hours: 3.6, last: 3.1 },
  { day: 'Thu', hours: 5.1, last: 3.8 },
  { day: 'Fri', hours: 4.5, last: 4.1 },
  { day: 'Sat', hours: 2.1, last: 1.8 },
  { day: 'Sun', hours: 1.6, last: 1.2 },
];

const trendData = [
  { week: 'W1', complete: 48, target: 58 },
  { week: 'W2', complete: 54, target: 61 },
  { week: 'W3', complete: 61, target: 65 },
  { week: 'W4', complete: 76, target: 70 },
];

const navItems = [
  { id: 'Overview', icon: LayoutDashboard },
  { id: 'Programs', icon: BookOpen },
  { id: 'Teams', icon: Users },
  { id: 'Reports', icon: BarChart3 },
  { id: 'Calendar', icon: CalendarDays },
];

const queryClient = new QueryClient();

function PanelHeading({ icon: Icon, title, detail, action }: { icon?: typeof Activity; title: string; detail?: string; action?: string }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-2">
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="h-3.5 w-3.5 text-[hsl(var(--primary))]" strokeWidth={2.4} /> : null}
        <h2 className="panel-title">{title}</h2>
        {detail ? <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{detail}</span> : null}
      </div>
      <button className="rounded-md p-1 text-[hsl(var(--muted-foreground))] transition hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]" aria-label={action ?? `Open ${title}`} data-testid={`button-more-${title.toLowerCase().replaceAll(' ', '-')}`}>
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function MiniProgress({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--muted))]">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${value}%`, backgroundColor: color }} />
    </div>
  );
}

function Rail({ activeNav, setActiveNav }: { activeNav: string; setActiveNav: (value: string) => void }) {
  return (
    <aside className="dashboard-rail flex w-[70px] shrink-0 flex-col items-center gap-5 py-5 md:min-h-[100dvh]">
      <button onClick={() => setActiveNav('Overview')} className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] shadow-[0_5px_15px_hsl(196_100%_54%_/_0.22)]" title="Learning Insights home" data-testid="button-home">
        <GraduationCap className="h-5 w-5" strokeWidth={2.5} />
      </button>
      <div className="rail-label text-[8px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--sidebar-foreground)/0.48)]">Workspace</div>
      <nav className="flex flex-1 flex-col items-center gap-2" aria-label="Primary navigation">
        {navItems.map(({ id, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveNav(id)}
            className={`rail-button group relative grid h-10 w-10 place-items-center rounded-xl ${activeNav === id ? 'is-active' : ''}`}
            title={id}
            aria-label={id}
            data-testid={`button-nav-${id.toLowerCase()}`}
          >
            <Icon className="h-[17px] w-[17px]" strokeWidth={1.8} />
            <span className="pointer-events-none absolute left-[54px] z-30 hidden whitespace-nowrap rounded-md bg-[hsl(var(--sidebar))] px-2 py-1 text-[10px] font-semibold text-white shadow-lg group-hover:block">{id}</span>
          </button>
        ))}
        <div className="rail-divider my-2 h-px w-7 bg-[hsl(var(--sidebar-border))]" />
        <button onClick={() => setActiveNav('Settings')} className={`rail-button grid h-10 w-10 place-items-center rounded-xl ${activeNav === 'Settings' ? 'is-active' : ''}`} title="Settings" aria-label="Settings" data-testid="button-nav-settings">
          <Settings className="h-[17px] w-[17px]" strokeWidth={1.8} />
        </button>
      </nav>
      <button onClick={() => setActiveNav('Settings')} className="rail-button relative grid h-9 w-9 place-items-center rounded-full border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent))] text-[11px] font-bold text-white" title="Account: Alan Carter" aria-label="Account menu" data-testid="button-account">
        AC
        <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-[hsl(var(--sidebar))] bg-[#58d69a]" />
      </button>
    </aside>
  );
}

function Header({ dateRange, setDateRange, query, setQuery, setFeedbackOpen, setShareOpen }: { dateRange: string; setDateRange: (value: string) => void; query: string; setQuery: (value: string) => void; setFeedbackOpen: (value: boolean) => void; setShareOpen: (value: boolean) => void }) {
  return (
    <header className="mb-6 flex flex-col justify-between gap-4 border-b border-[hsl(var(--border))] pb-5 lg:flex-row lg:items-center">
      <div>
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#55d69c]" />
          Learning operations / Today
        </div>
        <h1 className="font-['Space_Grotesk'] text-[28px] font-semibold tracking-[-0.055em] text-[hsl(var(--foreground))] sm:text-[32px]">Good morning, Alan</h1>
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Here is what is moving across your learning workspace.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[210px] flex-1 lg:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="search-input h-9 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] pl-9 pr-3 text-xs outline-none transition focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary)/0.12)]" placeholder="Search for data / people..." aria-label="Search dashboard" data-testid="input-search" />
        </label>
        <div className="flex items-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <CalendarDays className="ml-2.5 h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
          <select value={dateRange} onChange={(event) => setDateRange(event.target.value)} className="h-9 appearance-none bg-transparent px-2 text-[11px] font-semibold text-[hsl(var(--foreground))] outline-none" aria-label="Select date range" data-testid="select-date-range">
            <option value="Last 30 days">Last 30 days</option>
            <option value="Last quarter">Last quarter</option>
            <option value="This year">This year</option>
          </select>
          <ChevronDown className="mr-2 h-3 w-3 text-[hsl(var(--muted-foreground))]" />
        </div>
        <button onClick={() => setFeedbackOpen(true)} className="flex h-9 items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-[11px] font-semibold text-[hsl(var(--foreground))] transition hover:bg-[hsl(var(--muted))]" data-testid="button-feedback">
          <MessageSquareText className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
          Feedback
        </button>
        <button onClick={() => setShareOpen(true)} className="flex h-9 items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-3.5 text-[11px] font-semibold text-white shadow-[0_3px_8px_hsl(199_93%_42%_/_0.2)] transition hover:-translate-y-px hover:bg-[hsl(199_93%_38%)]" data-testid="button-share">
          <Share2 className="h-3.5 w-3.5" />
          Share
        </button>
        <button className="grid h-9 w-9 place-items-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] transition hover:bg-[hsl(var(--muted))]" title="Notifications" aria-label="Notifications" data-testid="button-notifications">
          <Bell className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}

function ProgramsPanel({ query }: { query: string }) {
  const filteredPrograms = programs.filter((program) => `${program.course} ${program.audience}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="panel rounded-xl p-4 lg:col-span-7" data-testid="panel-active-learning-programs">
      <PanelHeading icon={BookOpen} title="Active learning programs" detail="3 live" action="View all programs" />
      <div className="overflow-x-auto soft-scroll">
        <div className="min-w-[560px]">
          <div className="mb-2 grid grid-cols-[1.5fr_.65fr_.8fr_.85fr_.55fr] gap-3 px-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]">
            <span>Course</span><span>Participants</span><span>Progress</span><span>Due date</span><span>Avg. score</span>
          </div>
          {filteredPrograms.length ? filteredPrograms.map((program) => (
            <div key={program.id} className="group grid grid-cols-[1.5fr_.65fr_.8fr_.85fr_.55fr] items-center gap-3 border-t border-[hsl(var(--border)/0.7)] px-1 py-3 text-[11px] transition hover:bg-[hsl(var(--muted)/0.45)]" data-testid={`row-program-${program.id}`}>
              <div className="min-w-0">
                <div className="truncate font-semibold text-[hsl(var(--foreground))]">{program.course}</div>
                <div className="mt-0.5 truncate text-[10px] text-[hsl(var(--muted-foreground))]">{program.audience}</div>
              </div>
              <div className="font-semibold text-[hsl(var(--foreground))]">{program.participants}<span className={`ml-1.5 text-[9px] ${program.change > 0 ? 'text-[#49b982]' : 'text-[#dc7777]'}`}>{program.change > 0 ? '+' : ''}{program.change}</span></div>
              <div className="flex items-center gap-2">
                <MiniProgress value={program.progress} color={program.color} />
                <span className="w-7 text-right text-[10px] font-semibold">{program.progress}%</span>
              </div>
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{program.due}</span>
              <span className="flex items-center gap-1 font-semibold"><span className="h-1.5 w-1.5 rounded-full bg-[#efc467]" />{program.score.toFixed(1)}</span>
            </div>
          )) : <div className="border-t border-[hsl(var(--border))] py-7 text-center text-xs text-[hsl(var(--muted-foreground))]">No programs match “{query}”.</div>}
        </div>
      </div>
    </section>
  );
}

function GrowthPanel() {
  return (
    <section className="panel rounded-xl p-4 lg:col-span-5" data-testid="panel-growth-status">
      <PanelHeading icon={Activity} title="Growth status overview" detail="by team" action="Open growth report" />
      <div className="flex gap-5">
        <div className="relative grid h-[132px] w-[132px] shrink-0 place-items-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={teams.slice(1)} dataKey="members" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={59} paddingAngle={2} stroke="none">
                {teams.slice(1).map((team) => <Cell key={team.id} fill={team.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute text-center">
            <div className="font-['Space_Grotesk'] text-[24px] font-semibold leading-none text-[hsl(var(--foreground))]">154</div>
            <div className="mt-1 text-[9px] text-[hsl(var(--muted-foreground))]">Team members</div>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2.5 pt-1">
          {teams.slice(1, 5).map((team) => (
            <div key={team.id} className="flex items-center justify-between gap-2 text-[10px]">
              <span className="flex min-w-0 items-center gap-1.5 truncate text-[hsl(var(--muted-foreground))]"><i className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: team.color }} />{team.name}</span>
              <span className="font-semibold text-[hsl(var(--foreground))]">{team.members}</span>
            </div>
          ))}
          <div className="mt-1 flex items-center gap-2 border-t border-[hsl(var(--border))] pt-2 text-[10px]"><span className="h-1.5 w-1.5 rounded-full bg-[#58d69a]" /><span className="text-[hsl(var(--muted-foreground))]">Undergoing training</span><span className="ml-auto font-semibold">132</span></div>
          <div className="flex items-center gap-2 text-[10px]"><span className="h-1.5 w-1.5 rounded-full bg-[#e0e5e8]" /><span className="text-[hsl(var(--muted-foreground))]">Not assigned</span><span className="ml-auto font-semibold">16</span></div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#edf0f2]"><div className="h-full w-[86%] rounded-full bg-[#75ce9e]" /></div>
        <span className="rounded bg-[hsl(var(--foreground))] px-1.5 py-0.5 text-[9px] font-semibold text-white">86%</span>
      </div>
    </section>
  );
}

function PerformancePanel({ query }: { query: string }) {
  const filtered = departments.filter((department) => department.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="panel rounded-xl p-4 lg:col-span-4" data-testid="panel-team-performance">
      <PanelHeading icon={BarChart3} title="Team performance" detail="avg. score" action="View departments" />
      <div className="space-y-3.5">
        {filtered.map((department) => (
          <div key={department.id} data-testid={`row-department-${department.id}`}>
            <div className="mb-1.5 flex items-center justify-between text-[10px]">
              <span className="font-medium text-[hsl(var(--muted-foreground))]">{department.name}</span>
              <span className="font-bold text-[hsl(var(--foreground))]">{department.score.toFixed(1)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-[hsl(var(--muted))]"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${department.score * 20}%`, backgroundColor: department.color }} /></div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-start gap-2 border-t border-[hsl(var(--border))] pt-3 text-[10px] leading-relaxed text-[hsl(var(--muted-foreground))]">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#e7b95f]" />
        <span>Marketing shows the strongest progress, while HR needs the most support.</span>
      </div>
    </section>
  );
}

function SpendingPanel() {
  return (
    <section className="panel rounded-xl p-4 lg:col-span-5" data-testid="panel-spending-overview">
      <PanelHeading icon={BriefcaseBusiness} title="Spending overview" detail="FY 2025" action="Export spending" />
      <div className="mb-3 grid grid-cols-3 gap-3">
        <div><div className="data-label">Total spending</div><div className="mt-1 text-sm font-bold">$24,350.00</div></div>
        <div><div className="data-label">Monthly average</div><div className="mt-1 text-sm font-bold">$1,260.00</div></div>
        <div><div className="data-label">Annual budget</div><div className="mt-1 text-sm font-bold">$30,000.00</div></div>
      </div>
      <div className="grid grid-cols-[130px_1fr] items-center gap-2">
        <div className="h-[122px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={spending} dataKey="value" cx="50%" cy="50%" innerRadius={31} outerRadius={52} paddingAngle={2} stroke="none">
                {spending.map((item) => <Cell key={item.name} fill={item.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2">
          {spending.map((item) => <div key={item.name} className="flex items-center gap-2 text-[10px]"><span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: item.color }} /><span className="flex-1 text-[hsl(var(--muted-foreground))]">{item.name}</span><span className="font-semibold">{item.amount}</span></div>)}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[hsl(var(--muted-foreground))]"><ArrowUpRight className="h-3 w-3 text-[#54ba8b]" />Online courses took the largest share this month.</div>
    </section>
  );
}

function LearningTimePanel() {
  return (
    <section className="panel rounded-xl p-4 lg:col-span-3" data-testid="panel-learning-time">
      <PanelHeading icon={Clock3} title="Learning time" detail="hours / day" action="Open time report" />
      <div className="h-[125px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={learningHours} barGap={2} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="hsl(214 26% 90%)" />
            <XAxis dataKey="day" tick={{ fontSize: 8, fill: 'hsl(218 17% 48%)' }} axisLine={false} tickLine={false} />
            <YAxis hide domain={[0, 6]} />
            <RechartsTooltip cursor={{ fill: 'hsl(216 27% 93% / .6)' }} content={({ active, payload }) => active && payload?.length ? <div className="chart-tooltip"><p>{payload[0].payload.day}</p><p className="font-semibold">{payload[0].value} hours</p></div> : null} />
            <Bar dataKey="hours" fill="#f4c667" radius={[3, 3, 0, 0]} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex items-center gap-1 text-[10px] text-[hsl(var(--muted-foreground))]"><ArrowUpRight className="h-3 w-3 text-[#53ba8c]" /><span className="font-semibold text-[#53ba8c]">18%</span> more learning hours vs last month.</div>
    </section>
  );
}

function CompletionPanel() {
  return (
    <section className="relative overflow-hidden rounded-xl bg-[linear-gradient(135deg,#1e9dce,#207db8)] p-4 text-white shadow-[0_5px_17px_hsl(199_93%_42%_/_0.18)] lg:col-span-3" data-testid="panel-completion-rate">
      <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full border-[18px] border-white/10" />
      <PanelHeading icon={ClipboardCheck} title="Learning completion rate" detail="all active courses" action="Open completion report" />
      <div className="relative mt-3 flex items-end justify-between">
        <div><div className="font-['Space_Grotesk'] text-[30px] font-semibold tracking-[-0.06em]">76%</div><div className="text-[10px] text-white/75">Complete</div></div>
        <div className="mb-1 flex-1 px-4"><div className="h-1.5 rounded-full bg-white/30"><div className="h-full w-[76%] rounded-full bg-white" /></div></div>
        <div className="text-right"><div className="font-['Space_Grotesk'] text-[22px] font-semibold tracking-[-0.06em]">24%</div><div className="text-[10px] text-white/75">In progress</div></div>
      </div>
      <div className="relative mt-5 flex items-center gap-1.5 border-t border-white/20 pt-3 text-[10px] text-white/80"><ArrowUpRight className="h-3 w-3" />Completion rate is 12% higher than it was last month.</div>
    </section>
  );
}

function TrendPanel() {
  return (
    <section className="panel rounded-xl p-4 lg:col-span-7" data-testid="panel-completion-trend">
      <PanelHeading icon={Activity} title="Completion momentum" detail="last 4 weeks" action="View trend details" />
      <div className="h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trendData} margin={{ top: 8, right: 4, left: -25, bottom: 0 }}>
            <defs><linearGradient id="completionFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0d93c8" stopOpacity={0.28} /><stop offset="100%" stopColor="#0d93c8" stopOpacity={0.02} /></linearGradient></defs>
            <CartesianGrid vertical={false} stroke="hsl(214 26% 90%)" />
            <XAxis dataKey="week" tick={{ fontSize: 9, fill: 'hsl(218 17% 48%)' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'hsl(218 17% 48%)' }} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}%`} />
            <RechartsTooltip content={({ active, payload }) => active && payload?.length ? <div className="chart-tooltip"><p>{payload[0].payload.week}</p><p className="font-semibold text-[#0d93c8]">{payload[0].value}% complete</p></div> : null} />
            <Area type="monotone" dataKey="target" stroke="#d9c493" strokeDasharray="4 4" strokeWidth={1.5} fill="none" />
            <Area type="monotone" dataKey="complete" stroke="#0d93c8" strokeWidth={2.5} fill="url(#completionFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function TeamPulsePanel({ query }: { query: string }) {
  const filteredTeams = teams.filter((team) => team.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="panel rounded-xl p-4 lg:col-span-5" data-testid="panel-team-pulse">
      <PanelHeading icon={Users} title="Team pulse" detail="growth and completion" action="Open team details" />
      <div className="overflow-x-auto soft-scroll">
        <table className="w-full min-w-[390px] text-left text-[10px]">
          <thead><tr className="border-b border-[hsl(var(--border))] text-[9px] uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]"><th className="pb-2 font-semibold">Team</th><th className="pb-2 font-semibold">Growth</th><th className="pb-2 font-semibold">Complete</th><th className="pb-2 text-right font-semibold">Status</th></tr></thead>
          <tbody>
            {filteredTeams.slice(0, 5).map((team) => <tr key={team.id} className="border-b border-[hsl(var(--border)/0.7)] last:border-0"><td className="py-2.5 font-semibold">{team.name}</td><td className={`py-2.5 font-semibold ${team.growth > 0 ? 'text-[#43b47e]' : 'text-[#dc7777]'}`}>{team.growth > 0 ? '+' : ''}{team.growth}%</td><td className="py-2.5"><div className="flex items-center gap-2"><MiniProgress value={team.completion} color={team.color} /><span className="w-7">{team.completion}%</span></div></td><td className="py-2.5 text-right"><span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${team.status === 'Ahead' ? 'bg-[#e4f5ed] text-[#348c63]' : team.status === 'Needs attention' ? 'bg-[#fff0dd] text-[#a97932]' : 'bg-[#eaf4f8] text-[#397e9d]'}`}>{team.status}</span></td></tr>)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Modal({ type, onClose }: { type: 'share' | 'feedback'; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); } catch { /* Clipboard can be unavailable in preview contexts. */ }
    setCopied(true);
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[hsl(221_37%_18%_/_0.38)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={type === 'share' ? 'Share dashboard' : 'Send feedback'}>
      <div className="w-full max-w-[410px] rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div><h2 className="font-['Space_Grotesk'] text-lg font-semibold">{type === 'share' ? 'Share this view' : 'Send product feedback'}</h2><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{type === 'share' ? 'Give your team a direct link to this learning snapshot.' : 'Tell us what would make your daily review easier.'}</p></div>
          <button onClick={onClose} className="rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" aria-label="Close dialog" data-testid="button-close-dialog"><X className="h-4 w-4" /></button>
        </div>
        {type === 'share' ? <div><div className="mb-4 flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.45)] p-2.5 text-[11px] text-[hsl(var(--muted-foreground))]"><span className="min-w-0 flex-1 truncate">{window.location.origin}/learning-insights/</span><button onClick={copyLink} className="flex shrink-0 items-center gap-1 rounded-md bg-[hsl(var(--card))] px-2 py-1.5 font-semibold text-[hsl(var(--foreground))] shadow-sm" data-testid="button-copy-link">{copied ? <Check className="h-3 w-3 text-[#43b47e]" /> : <Copy className="h-3 w-3" />}{copied ? 'Copied' : 'Copy link'}</button></div><button onClick={onClose} className="h-9 w-full rounded-lg bg-[hsl(var(--primary))] text-xs font-semibold text-white" data-testid="button-done-sharing">Done</button></div> : <div><textarea className="mb-3 h-28 w-full resize-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-xs outline-none focus:border-[hsl(var(--primary))]" placeholder="Your feedback..." aria-label="Feedback message" data-testid="textarea-feedback" /><button onClick={() => setSent(true)} className="h-9 w-full rounded-lg bg-[hsl(var(--primary))] text-xs font-semibold text-white" data-testid="button-send-feedback">{sent ? 'Feedback sent' : 'Send feedback'}</button></div>}
      </div>
    </div>
  );
}

function Home() {
  const [activeNav, setActiveNav] = useState('Overview');
  const [dateRange, setDateRange] = useState('Last 30 days');
  const [query, setQuery] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const activeCopy = activeNav === 'Overview' ? 'Your learning activity at a glance' : `${activeNav} workspace`;
  return (
    <div className="dashboard-shell flex min-h-[100dvh] flex-col md:flex-row">
      <Rail activeNav={activeNav} setActiveNav={setActiveNav} />
      <main className="dashboard-main min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-10 lg:py-7">
        <div className="mx-auto max-w-[1450px]">
          <Header dateRange={dateRange} setDateRange={setDateRange} query={query} setQuery={setQuery} setFeedbackOpen={setFeedbackOpen} setShareOpen={setShareOpen} />
          <div className="mb-5 flex items-center justify-between">
            <div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--primary))]">{activeNav}</div><div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{activeCopy} <span className="mx-1 text-[hsl(var(--border))]">/</span> {dateRange}</div></div>
            <div className="hidden items-center gap-2 text-[10px] text-[hsl(var(--muted-foreground))] sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#54be8b]" />Data updated 8 min ago <button className="ml-2 rounded-md border border-[hsl(var(--border))] p-1.5 hover:bg-[hsl(var(--muted))]" title="Help" aria-label="Help" data-testid="button-help"><CircleHelp className="h-3 w-3" /></button></div>
          </div>
          <label className="mb-4 flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 md:hidden">
            <Search className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-xs outline-none" placeholder="Filter teams and programs" aria-label="Filter dashboard data" data-testid="input-mobile-filter" />
          </label>
          <div className="mb-5 hidden max-w-[310px] md:block">
            <label className="relative block">
              <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] pl-9 pr-3 text-xs outline-none transition focus:border-[hsl(var(--primary))]" placeholder="Filter dashboard data" aria-label="Filter dashboard data" data-testid="input-filter" />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <ProgramsPanel query={query} />
            <GrowthPanel />
            <PerformancePanel query={query} />
            <SpendingPanel />
            <LearningTimePanel />
            <CompletionPanel />
            <TrendPanel />
            <TeamPulsePanel query={query} />
          </div>
          <footer className="mt-6 flex flex-col justify-between gap-2 border-t border-[hsl(var(--border))] pt-4 text-[10px] text-[hsl(var(--muted-foreground))] sm:flex-row"><span>Learning Insights · Internal workspace</span><span className="flex items-center gap-2"><Download className="h-3 w-3" />Reports are ready to export from each panel</span></footer>
        </div>
      </main>
      {shareOpen ? <Modal type="share" onClose={() => setShareOpen(false)} /> : null}
      {feedbackOpen ? <Modal type="feedback" onClose={() => setFeedbackOpen(false)} /> : null}
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <RoutedErrorBoundary><Router /></RoutedErrorBoundary>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;