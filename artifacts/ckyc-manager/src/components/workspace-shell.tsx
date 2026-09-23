import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Activity,
  ArrowUpRight,
  ChevronRight,
  Database,
  FileClock,
  FileDown,
  FileSpreadsheet,
  FileUp,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react';
import { useClerk } from '@clerk/react';
import { useGetCurrentUser } from '@workspace/api-client-react';
import lightFinanceLogo from '@assets/Logo_Light_1788338497887.png';

const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard, permission: undefined },
  { href: '/clients', label: 'LMS clients', icon: Database, permission: undefined },
  { href: '/requests', label: 'CKYC requests', icon: FileClock, permission: undefined },
  { href: '/download-requests', label: 'CKYC download', icon: FileDown, permission: 'workspace:read' },
  { href: '/ckyc-create-data', label: 'CKYC Create data', icon: FileSpreadsheet, permission: 'workspace:write' },
  { href: '/audit-logs', label: 'Audit log', icon: ShieldCheck, permission: 'audit:read' },
  { href: '/users', label: 'User management', icon: UsersRound, permission: 'users:read' },
];

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { signOut } = useClerk();
  const currentUserQuery = useGetCurrentUser();
  const current = navItems.find((item) => item.href === location) ?? navItems.find((item) => item.href !== '/' && location.startsWith(item.href));
  const permissions = currentUserQuery.data?.permissions ?? [];
  const visibleNavItems = navItems.filter((item) => !item.permission || permissions.includes(item.permission));
  const displayName = currentUserQuery.data?.displayName ?? 'Operations desk';
  const role = currentUserQuery.data?.role ?? 'secure workspace';
  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-[100dvh] bg-background">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[82px] items-center justify-between border-b border-sidebar-border px-6">
          <Link href="/" className="flex items-center gap-3" data-testid="link-brand">
            <span className="flex h-11 w-[190px] items-center rounded-md bg-white px-2.5 shadow-sm">
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

        <div className="px-4 pt-7">
          <p className="mb-3 px-2 font-mono-ui text-[9px] uppercase tracking-[0.18em] text-sidebar-foreground/40">Workspace</p>
          <nav className="space-y-1">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const active = location === item.href || (item.href !== '/' && location.startsWith(item.href));
              return (
                <Link
                  href={item.href}
                  key={item.href}
                  onClick={() => setMobileOpen(false)}
                  data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}
                  className={`group flex items-center gap-3 border-l-2 px-3 py-2.5 text-[13px] font-semibold transition-colors ${active ? 'border-sidebar-primary bg-sidebar-accent text-white' : 'border-transparent text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-white'}`}
                >
                  <Icon size={17} strokeWidth={active ? 2.3 : 1.8} className={active ? 'text-sidebar-primary' : ''} />
                  <span className="flex-1">{item.label}</span>
                  {active && <ChevronRight size={14} className="text-sidebar-primary" />}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto px-4 pb-5">
          <div className="rounded-md border border-sidebar-border bg-sidebar-accent/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono-ui text-[9px] uppercase tracking-[0.18em] text-sidebar-foreground/50">System status</span>
              <span className="size-2 rounded-full bg-sidebar-primary shadow-[0_0_0_4px_hsl(var(--sidebar-primary)/.12)]" />
            </div>
            <p className="text-[12px] font-medium text-sidebar-foreground/80">CKYC gateway online</p>
            <p className="mt-1 font-mono-ui text-[10px] text-sidebar-foreground/45">Last checked just now</p>
          </div>
          <div className="mt-5 flex items-center gap-3 border-t border-sidebar-border pt-4">
             <div className="grid size-8 place-items-center rounded-full bg-[#d2a94b] text-[11px] font-bold text-[#24383d]">{initials || 'OP'}</div>
            <div className="min-w-0">
               <p className="truncate text-[12px] font-semibold text-white">{displayName}</p>
               <p className="font-mono-ui text-[9px] uppercase tracking-[0.1em] text-sidebar-foreground/40">{role}</p>
            </div>
             <button
               type="button"
               onClick={() => void signOut({ redirectUrl: '/' })}
               className="ml-auto rounded-md p-1.5 text-sidebar-foreground/40 transition hover:bg-sidebar-accent hover:text-white"
               aria-label="Sign out"
               data-testid="button-sign-out"
             >
               <LogOut size={14} />
             </button>
          </div>
        </div>
      </aside>

      {mobileOpen && <button className="fixed inset-0 z-30 bg-[#13272d]/45 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" data-testid="button-overlay-menu" />}

      <main className="min-h-[100dvh] lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-[70px] items-center justify-between border-b border-border/80 bg-background/95 px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <button className="rounded-lg border border-border bg-card p-2 text-foreground/70 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation" data-testid="button-open-menu">
              <Menu size={18} />
            </button>
            <div>
              <p className="font-mono-ui text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Light Finance / {current?.label ?? 'Workspace'}</p>
              <h1 className="mt-0.5 font-display text-[19px] font-semibold tracking-[-0.015em] text-foreground">{current?.label ?? 'Workspace'}</h1>
            </div>
          </div>
          <div className="hidden items-center gap-4 sm:flex">
            <div className="flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <Activity size={14} className="text-primary" /> Live workspace
            </div>
            <div className="h-5 w-px bg-border" />
            <div className="grid size-8 place-items-center rounded-full bg-secondary font-mono-ui text-[10px] font-bold text-secondary-foreground">OP</div>
          </div>
        </header>
        <div className="mx-auto max-w-[1500px] p-5 sm:p-8">{children}</div>
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
