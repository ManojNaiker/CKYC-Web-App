import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useLogout } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  Database,
  FileClock,
  FileDown,
  FileSpreadsheet,
  FileUp,
  FolderOpen,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Users,
  X,
} from 'lucide-react';
import lightFinanceLogo from '@assets/Logo_Light_1788338497887.png';
import { roleLabel, type AppRole } from '@/lib/role-access';

type WorkspaceUser = {
  fullName: string;
  email: string;
  role: AppRole;
};

const navItems: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  color: string;
  roles: AppRole[];
}> = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, color: 'text-sky-300', roles: ['viewer', 'manager', 'admin'] },
  { href: '/clients', label: 'LMS Clients', icon: Database, color: 'text-emerald-300', roles: ['viewer', 'manager', 'admin'] },
  { href: '/requests', label: 'CKYC Requests', icon: FileClock, color: 'text-violet-300', roles: ['manager', 'admin'] },
  { href: '/download-requests', label: 'CKYC Downloads', icon: FileDown, color: 'text-amber-300', roles: ['manager', 'admin'] },
  { href: '/ckyc-create-data', label: 'CKYC Create Data', icon: FileSpreadsheet, color: 'text-cyan-300', roles: ['manager', 'admin'] },
  { href: '/finflux-update', label: 'Finflux Update', icon: FileUp, color: 'text-rose-300', roles: ['admin'] },
  { href: '/manage-users', label: 'Manage Users', icon: Users, color: 'text-indigo-300', roles: ['admin'] },
  { href: '/audit-trails', label: 'Audit Trails', icon: History, color: 'text-orange-300', roles: ['admin'] },
];

export function WorkspaceShell({ children, user }: { children: React.ReactNode; user: WorkspaceUser }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const logout = useLogout();
  const queryClient = useQueryClient();
  const signOut = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        window.location.assign(`${basePath || ''}/sign-in`);
      },
    });
  };
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  const visibleNavItems = navItems.filter((item) => item.roles.includes(user.role));
  const current = visibleNavItems.find((item) => item.href === location || (item.href !== '/' && location.startsWith(`${item.href}/`)));
  const initials = user.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'U';

  return (
    <div className="ckyc-readable-type min-h-[100dvh] bg-background">
      <aside className={`app-sidebar fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[8px_0_30px_hsl(250_57%_15%_/_0.2)] transition-transform duration-300 xl:w-[260px] lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[86px] items-center justify-between border-b border-sidebar-border px-5">
          <Link href="/" className="flex items-center gap-3" data-testid="link-brand">
            <span className="flex h-11 w-[190px] items-center rounded-lg bg-[#f1faf9] px-2.5 shadow-sm">
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
            {visibleNavItems.map((item) => {
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
                  <Icon size={18} strokeWidth={active ? 2.2 : 1.8} className={active ? 'text-sidebar-primary' : item.color} />
                  <span className="flex-1">{item.label}</span>
                  {active && <ChevronRight size={14} className="text-sidebar-primary" />}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto px-3 pb-4">
          <div className="mt-4 flex items-center gap-3 border-t border-sidebar-border pt-4">
            <div className="grid size-9 place-items-center rounded-lg bg-sidebar-primary font-mono-ui text-[11px] font-bold text-sidebar-primary-foreground">{initials}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-sidebar-foreground">{user.fullName}</p>
              <p className="truncate font-mono-ui text-[9px] uppercase tracking-[0.1em] text-sidebar-foreground/50">{roleLabel(user.role)}</p>
            </div>
            <button
              type="button"
              onClick={signOut}
              disabled={logout.isPending}
              className="grid size-8 place-items-center rounded-md text-sidebar-foreground/55 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
              aria-label="Sign out"
              title="Sign out"
              data-testid="button-sign-out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen && <button className="fixed inset-0 z-30 bg-[hsl(249_55%_12%_/_0.56)] lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" data-testid="button-overlay-menu" />}

        <main className="min-h-[100dvh] min-w-0 lg:pl-[250px] xl:pl-[260px]">
        <header className="app-topbar sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-border bg-card/95 px-5 shadow-[0_3px_18px_hsl(249_68%_51%_/_0.09)] backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-3">
            <button className="rounded-lg border border-border bg-card p-2 text-foreground/70 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation" data-testid="button-open-menu">
              <Menu size={18} />
            </button>
            <div>
              <p className="font-mono-ui text-[9px] font-semibold uppercase tracking-[0.16em] text-primary">Light Finance / Operations</p>
              <h1 className="mt-0.5 font-display text-[21px] font-semibold tracking-[-0.015em] text-foreground">{current?.label ?? 'Workspace'}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden text-right sm:block">
              <p className="max-w-48 truncate text-[11px] font-semibold text-foreground">{user.fullName}</p>
              <p className="font-mono-ui text-[9px] uppercase tracking-[.1em] text-muted-foreground">{user.email}</p>
            </div>
            <span className="hidden rounded-md border border-border bg-secondary/55 px-2.5 py-1.5 font-mono-ui text-[9px] font-semibold uppercase tracking-[.1em] text-secondary-foreground md:inline-flex">{roleLabel(user.role)}</span>
            <div className="grid size-9 place-items-center rounded-lg bg-primary font-mono-ui text-[10px] font-bold text-primary-foreground">{initials}</div>
            <button
              type="button"
              onClick={signOut}
              disabled={logout.isPending}
              className="grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <div className="w-full min-w-0 max-w-none p-3 sm:p-4 xl:p-5">{children}</div>
      </main>
    </div>
  );
}

export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="mb-1.5 font-mono-ui text-[10px] font-medium uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
        <h2 className="font-display text-[32px] font-semibold leading-[1.08] tracking-[-0.035em] text-foreground sm:text-[38px]">{title}</h2>
        <p className="mt-2 max-w-[620px] text-[13px] leading-[1.6] text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon = FolderOpen, title, detail, action }: { icon?: typeof FolderOpen; title: string; detail: string; action?: React.ReactNode }) {
  return (
     <div className="flex min-h-[250px] flex-col items-center justify-center rounded-xl border border-dashed border-primary/30 bg-[hsl(var(--info-bg))] px-6 text-center">
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
