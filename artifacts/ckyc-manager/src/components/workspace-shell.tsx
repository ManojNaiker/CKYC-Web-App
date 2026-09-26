import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  ArrowUpRight,
  ChevronRight,
  Database,
  FileClock,
  FileDown,
  FileSpreadsheet,
  FileUp,
  FolderOpen,
  LayoutDashboard,
  Menu,
  ShieldCheck,
  X,
} from 'lucide-react';
import lightFinanceLogo from '@assets/Logo_Light_1788338497887.png';

const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/clients', label: 'LMS Clients', icon: Database },
  { href: '/requests', label: 'CKYC Requests', icon: FileClock },
  { href: '/download-requests', label: 'CKYC Downloads', icon: FileDown },
  { href: '/ckyc-create-data', label: 'CKYC Create Data', icon: FileSpreadsheet },
  { href: '/finflux-update', label: 'Finflux Update', icon: FileUp },
];

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const current = navItems.find((item) => item.href === location || (item.href !== '/' && location.startsWith(`${item.href}/`)));

  return (
    <div className="ckyc-readable-type min-h-[100dvh] bg-background">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[240px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[8px_0_30px_hsl(208_57%_15%_/_0.08)] transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[86px] items-center justify-between border-b border-sidebar-border px-5">
          <Link href="/" className="flex items-center gap-3" data-testid="link-brand">
            <span className="flex h-11 w-[174px] items-center rounded-lg bg-[#f1faf9] px-2.5 shadow-sm">
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
          <p className="mb-3 px-3 font-mono-ui text-[10px] font-semibold uppercase tracking-[0.17em] text-sidebar-foreground/55">Operations / 01</p>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = location === item.href || (item.href !== '/' && location.startsWith(item.href));
              return (
                <Link
                  href={item.href}
                  key={item.href}
                  onClick={() => setMobileOpen(false)}
                  data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[12px] font-semibold transition-colors ${active ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_3px_0_0_hsl(var(--sidebar-primary))]' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}
                >
                  <Icon size={16} strokeWidth={active ? 2.2 : 1.8} className={active ? 'text-sidebar-primary' : 'text-sidebar-foreground/60'} />
                  <span className="flex-1">{item.label}</span>
                  {active && <ChevronRight size={14} className="text-sidebar-primary" />}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto px-3 pb-4">
          <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/75 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono-ui text-[9px] uppercase tracking-[0.18em] text-sidebar-foreground/65">Workspace focus</span>
              <ShieldCheck size={15} className="text-sidebar-primary" />
            </div>
            <p className="text-[12px] font-semibold text-sidebar-foreground">Keep the trail complete.</p>
            <Link href="/requests" className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold text-sidebar-primary hover:underline" data-testid="link-workspace-focus">Review requests <ArrowUpRight size={12} /></Link>
          </div>
          <div className="mt-4 flex items-center gap-3 border-t border-sidebar-border pt-4">
            <div className="grid size-8 place-items-center rounded-lg bg-sidebar-primary font-mono-ui text-[10px] font-bold text-sidebar-primary-foreground">OP</div>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-sidebar-foreground">Operations desk</p>
              <p className="font-mono-ui text-[9px] uppercase tracking-[0.1em] text-sidebar-foreground/40">Maker / checker</p>
            </div>
            <ArrowUpRight size={14} className="ml-auto text-sidebar-foreground/40" />
          </div>
        </div>
      </aside>

      {mobileOpen && <button className="fixed inset-0 z-30 bg-[#13272d]/45 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" data-testid="button-overlay-menu" />}

        <main className="min-h-[100dvh] lg:pl-[240px]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-border bg-card/95 px-5 shadow-[0_3px_16px_hsl(199_78%_29%_/_0.04)] backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-3">
            <button className="rounded-lg border border-border bg-card p-2 text-foreground/70 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation" data-testid="button-open-menu">
              <Menu size={18} />
            </button>
            <div>
              <p className="font-mono-ui text-[9px] font-semibold uppercase tracking-[0.16em] text-primary">Light Finance / Operations</p>
              <h1 className="mt-0.5 font-display text-[19px] font-semibold tracking-[-0.015em] text-foreground">{current?.label ?? 'Workspace'}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-2 rounded-md border border-border bg-secondary/55 px-3 py-1.5 font-mono-ui text-[10px] font-semibold uppercase tracking-[.1em] text-secondary-foreground sm:inline-flex"><span className="size-1.5 rounded-full bg-[#16846e]" /> Operations desk</span>
            <div className="grid size-9 place-items-center rounded-lg bg-primary font-mono-ui text-[10px] font-bold text-primary-foreground">OP</div>
          </div>
        </header>
        <div className="w-full max-w-none p-4 sm:p-7 xl:p-8">{children}</div>
      </main>
    </div>
  );
}

export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="mb-2 font-mono-ui text-[10px] font-medium uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
        <h2 className="font-display text-[30px] font-semibold leading-[1.08] tracking-[-0.035em] text-foreground sm:text-[36px]">{title}</h2>
        <p className="mt-3 max-w-[620px] text-[13px] leading-[1.7] text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon = FolderOpen, title, detail, action }: { icon?: typeof FolderOpen; title: string; detail: string; action?: React.ReactNode }) {
  return (
     <div className="flex min-h-[250px] flex-col items-center justify-center rounded-xl border border-dashed border-primary/30 bg-[hsl(190_55%_94%)] px-6 text-center">
       <div className="mb-4 grid size-12 place-items-center rounded-xl border border-primary/15 bg-card text-primary shadow-xs"><Icon size={22} /></div>
      <h3 className="font-display text-[19px] font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-[360px] text-[12px] leading-5 text-muted-foreground">{detail}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function QueryError({ onRetry }: { onRetry: () => void }) {
  return (
     <div className="flex items-center justify-between gap-4 rounded-xl border border-destructive/25 bg-[hsl(var(--danger-bg))] px-4 py-3 text-[12px] text-destructive" data-testid="status-query-error">
      <span>We could not load this workspace data.</span>
      <button onClick={onRetry} className="font-semibold underline underline-offset-4" data-testid="button-retry-query">Retry</button>
    </div>
  );
}
