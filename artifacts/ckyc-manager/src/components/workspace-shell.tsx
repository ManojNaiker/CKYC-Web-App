import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Activity,
  ArrowUpRight,
  Bell,
  ChevronRight,
  ChevronDown,
  Database,
  FileClock,
  FileDown,
  FileSpreadsheet,
  FileUp,
  FolderOpen,
  LayoutDashboard,
  Menu,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import lightFinanceLogo from '@assets/Logo_Light_1788338497887.png';

const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/clients', label: 'LMS Clients', icon: Database },
  { href: '/requests', label: 'CKYC Requests', icon: FileClock },
  { href: '/download-requests', label: 'CKYC Downloads', icon: FileDown },
  { href: '/ckyc-create-data', label: 'CKYC Create Data', icon: FileSpreadsheet },
];

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const current = navItems.find((item) => item.href === location);

  return (
    <div className="ckyc-readable-type min-h-[100dvh] bg-background">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[224px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[82px] items-center justify-between border-b border-sidebar-border px-5">
          <Link href="/" className="flex items-center gap-3" data-testid="link-brand">
            <span className="flex h-11 w-[174px] items-center rounded-xl bg-white px-2.5 shadow-[0_6px_18px_rgba(38,39,51,.08)]">
              <img
                src={lightFinanceLogo}
                alt="Light Finance"
                className="h-auto max-h-9 w-full object-contain"
              />
            </span>
          </Link>
          <button className="rounded-md p-1 text-sidebar-foreground/60 hover:bg-sidebar-accent lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation" data-testid="button-close-menu">
            <X size={18} />
          </button>
        </div>

        <div className="px-3 pt-7">
          <p className="mb-3 px-3 font-mono-ui text-[9px] uppercase tracking-[0.18em] text-sidebar-foreground/40">Workspace</p>
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = location === item.href || (item.href !== '/' && location.startsWith(item.href));
              return (
                <Link
                  href={item.href}
                  key={item.href}
                  onClick={() => setMobileOpen(false)}
                  data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-[12px] font-semibold transition-all ${active ? 'bg-[#272733] text-white shadow-[0_7px_16px_rgba(39,39,51,.16)]' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}
                >
                  <Icon size={16} strokeWidth={active ? 2.2 : 1.8} className={active ? 'text-[#a878e8]' : ''} />
                  <span className="flex-1">{item.label}</span>
                  {active ? <ChevronRight size={14} className="text-[#b48cf0]" /> : <ChevronDown size={13} className="text-sidebar-foreground/35" />}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto px-3 pb-4">
          <div className="rounded-2xl border border-[#e5dcf3] bg-[#f0e9fb] p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono-ui text-[9px] uppercase tracking-[0.18em] text-[#80699a]">Workspace focus</span>
              <Sparkles size={14} className="text-[#986bd2]" />
            </div>
            <p className="text-[12px] font-semibold text-[#5c4778]">Keep the trail complete.</p>
            <Link href="/requests" className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold text-[#8256bd] hover:text-[#5a3b85]" data-testid="link-workspace-focus">Review requests <ArrowUpRight size={12} /></Link>
          </div>
          <div className="mt-4 flex items-center gap-3 border-t border-sidebar-border pt-4">
            <div className="grid size-8 place-items-center rounded-full bg-[#d2a94b] text-[11px] font-bold text-[#24383d]">OP</div>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-sidebar-foreground">Operations desk</p>
              <p className="font-mono-ui text-[9px] uppercase tracking-[0.1em] text-sidebar-foreground/40">Maker / checker</p>
            </div>
            <ArrowUpRight size={14} className="ml-auto text-sidebar-foreground/40" />
          </div>
        </div>
      </aside>

      {mobileOpen && <button className="fixed inset-0 z-30 bg-[#13272d]/45 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" data-testid="button-overlay-menu" />}

      <main className="min-h-[100dvh] lg:pl-[224px]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-border/80 bg-white/90 px-5 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-3">
            <button className="rounded-lg border border-border bg-card p-2 text-foreground/70 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation" data-testid="button-open-menu">
              <Menu size={18} />
            </button>
            <div>
              <p className="font-mono-ui text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Light Finance / {current?.label ?? 'Workspace'}</p>
              <h1 className="mt-0.5 font-display text-[19px] font-semibold tracking-[-0.015em] text-foreground">{current?.label ?? 'Workspace'}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground shadow-xs md:flex">
              <Search size={14} />
              Search workspace
              <span className="ml-3 rounded-md bg-secondary px-1.5 py-0.5 font-mono-ui text-[9px] text-muted-foreground">⌘K</span>
            </div>
            <button className="relative grid size-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-secondary" aria-label="Notifications" data-testid="button-notifications">
              <Bell size={15} />
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-primary" />
            </button>
            <div className="grid size-9 place-items-center rounded-full bg-[#e6c86a] font-mono-ui text-[10px] font-bold text-[#24383d]">OP</div>
          </div>
        </header>
        <div className="mx-auto max-w-[1560px] p-5 sm:p-8">{children}</div>
      </main>
    </div>
  );
}

export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="mb-2 font-mono-ui text-[10px] font-medium uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
        <h2 className="font-display text-[32px] font-semibold leading-[1.08] tracking-[-0.025em] text-foreground sm:text-[38px]">{title}</h2>
        <p className="mt-3 max-w-[620px] text-[13px] leading-[1.7] text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon = FolderOpen, title, detail, action }: { icon?: typeof FolderOpen; title: string; detail: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-[250px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 px-6 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-xl bg-secondary text-primary"><Icon size={22} /></div>
      <h3 className="font-display text-[19px] font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-[360px] text-[12px] leading-5 text-muted-foreground">{detail}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function QueryError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-[12px] text-destructive" data-testid="status-query-error">
      <span>We could not load this workspace data.</span>
      <button onClick={onRetry} className="font-semibold underline underline-offset-4" data-testid="button-retry-query">Retry</button>
    </div>
  );
}
