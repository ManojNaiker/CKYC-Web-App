import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useLogout } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Database,
  ChevronLeft,
  ChevronRight,
  FileClock,
  FileDown,
  FileSpreadsheet,
  FileUp,
  FolderOpen,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
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
  shortLabel: string;
  icon: typeof LayoutDashboard;
  roles: AppRole[];
}> = [
  { href: '/', label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard, roles: ['viewer', 'manager', 'admin'] },
  { href: '/clients', label: 'LMS Clients', shortLabel: 'Clients', icon: Database, roles: ['viewer', 'manager', 'admin'] },
  { href: '/requests', label: 'CKYC Requests', shortLabel: 'Requests', icon: FileClock, roles: ['manager', 'admin'] },
  { href: '/download-requests', label: 'CKYC Downloads', shortLabel: 'Downloads', icon: FileDown, roles: ['manager', 'admin'] },
  { href: '/ckyc-create-data', label: 'CKYC Create Data', shortLabel: 'Create', icon: FileSpreadsheet, roles: ['manager', 'admin'] },
  { href: '/finflux-update', label: 'Finflux Update', shortLabel: 'FinFlux', icon: FileUp, roles: ['admin'] },
  { href: '/manage-users', label: 'Manage Users', shortLabel: 'Users', icon: Users, roles: ['admin'] },
  { href: '/audit-trails', label: 'Audit Trails', shortLabel: 'Audit', icon: History, roles: ['admin'] },
];

export function WorkspaceShell({ children, user }: { children: React.ReactNode; user: WorkspaceUser }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    try {
      return window.localStorage.getItem('ckyc-sidebar-expanded') === 'true';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem('ckyc-sidebar-expanded', String(sidebarExpanded));
    } catch {
      // Keep the toggle usable when browser storage is unavailable.
    }
  }, [sidebarExpanded]);
  const logout = useLogout();
  const queryClient = useQueryClient();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  const [signOutError, setSignOutError] = useState(false);
  const signOut = () => {
    setSignOutError(false);
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        window.location.assign(`${basePath || ''}/sign-in`);
      },
      onError: () => setSignOutError(true),
    });
  };
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
      <aside id="workspace-sidebar" className={`app-sidebar fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-sidebar-border text-sidebar-foreground transition-[width,transform] duration-200 motion-reduce:transition-none lg:translate-x-0 ${sidebarExpanded ? 'lg:w-[248px]' : 'lg:w-[72px]'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className={`flex h-[64px] shrink-0 items-center justify-between border-b border-sidebar-border px-4 ${sidebarExpanded ? 'lg:justify-start lg:px-3' : 'lg:justify-center lg:px-1'}`}>
          <Link href="/" onClick={() => setMobileOpen(false)} className={`flex min-w-0 flex-col items-start gap-0.5 ${sidebarExpanded ? 'lg:flex-row lg:items-center lg:gap-2' : 'lg:block'}`} data-testid="link-brand" aria-label="Light Finance CKYC Manager — Dashboard" title="Light Finance CKYC Manager">
            <span className="flex h-8 w-[138px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#f5f8f6] p-1 lg:hidden"><img src={lightFinanceLogo} alt="Light Finance" className="max-h-full max-w-full object-contain" /></span>
            <span aria-hidden="true" className="hidden size-9 items-center justify-center rounded-md border border-sidebar-border bg-sidebar-accent text-[12px] font-extrabold tracking-[-.08em] text-sidebar-foreground lg:flex">LF</span>
            <span className="text-[10px] font-medium text-sidebar-foreground/55 lg:hidden">CKYC Manager</span>
            {sidebarExpanded && <span aria-hidden="true" className="hidden min-w-0 flex-col leading-tight lg:flex"><span className="truncate text-[12px] font-bold text-sidebar-foreground">Light Finance</span><span className="truncate text-[10px] text-sidebar-foreground/55">CKYC Manager</span></span>}
          </Link>
          <button type="button" className="rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation" data-testid="button-close-menu"><X size={18} /></button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto px-2.5 py-5 ${sidebarExpanded ? 'lg:px-2 lg:py-4' : 'lg:px-1.5 lg:py-3'}`}>
          <p className={`mb-2 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-sidebar-foreground/45 ${sidebarExpanded ? '' : 'lg:sr-only'}`}>Workspace</p>
          <nav aria-label="Workspace navigation" className={`space-y-0.5 ${sidebarExpanded ? 'lg:space-y-0.5' : 'lg:space-y-1'}`}>
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const active = location === item.href || (item.href !== '/' && location.startsWith(item.href));
              return (
                <Link
                  href={item.href}
                  key={item.href}
                  onClick={() => setMobileOpen(false)}
                  data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}
                  aria-current={active ? 'page' : undefined}
                  aria-label={item.label}
                  title={item.label}
                  className={`group flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-[12px] font-semibold transition-colors ${sidebarExpanded ? 'lg:min-h-10 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:py-2' : 'lg:min-h-[54px] lg:flex-col lg:justify-center lg:gap-1 lg:px-0.5 lg:py-1'} ${active ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_hsl(var(--sidebar-primary))]' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}
                >
                  <Icon size={17} strokeWidth={active ? 2 : 1.8} className={`shrink-0 ${active ? 'text-sidebar-primary' : 'text-sidebar-foreground/55'}`} />
                  <span className={`flex-1 ${sidebarExpanded ? '' : 'lg:hidden'}`}>{item.label}</span>
                  <span aria-hidden="true" className={`hidden max-w-full truncate text-[9px] leading-tight ${sidebarExpanded ? '' : 'lg:block'}`}>{item.shortLabel}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className={`border-t border-sidebar-border px-3 py-3 ${sidebarExpanded ? 'lg:px-3' : 'lg:px-1.5'}`}>
          <div className={`flex items-center gap-2.5 ${sidebarExpanded ? 'lg:flex-row' : 'lg:flex-col lg:gap-1'}`}>
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-sidebar-accent text-[10px] font-bold text-sidebar-accent-foreground">{initials}</div>
            <div className={`min-w-0 flex-1 ${sidebarExpanded ? '' : 'lg:hidden'}`}>
              <p className="truncate text-[12px] font-semibold text-sidebar-foreground">{user.fullName}</p>
              <p className="truncate text-[10px] text-sidebar-foreground/55">{roleLabel(user.role)}</p>
            </div>
            <button
              type="button"
              onClick={signOut}
              disabled={logout.isPending}
              className="grid size-8 place-items-center rounded-md text-sidebar-foreground/65 transition hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-50"
              aria-label="Sign out"
              title="Sign out"
              data-testid="button-sign-out"
            >
              <LogOut size={16} />
            </button>
          </div>
          {signOutError && <p role="alert" className={`mt-2 text-[11px] text-[hsl(12_85%_78%)] ${sidebarExpanded ? '' : 'lg:sr-only'}`}>Sign out failed. Please try again.</p>}
        </div>
      </aside>

      {mobileOpen && <button type="button" className="fixed inset-0 z-30 bg-[hsl(215_30%_12%_/_0.55)] lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" data-testid="button-overlay-menu" />}

      <main className={`min-h-[100dvh] min-w-0 transition-[padding] duration-200 motion-reduce:transition-none ${sidebarExpanded ? 'lg:pl-[248px]' : 'lg:pl-[72px]'}`}>
        <header className="app-topbar sticky top-0 z-20 flex h-[56px] items-center justify-between gap-3 border-b border-border px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" className="rounded-md border border-border bg-card p-2 text-foreground/70 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation" data-testid="button-open-menu">
              <Menu size={18} />
            </button>
            <button
              type="button"
              onClick={() => setSidebarExpanded((expanded) => !expanded)}
              aria-controls="workspace-sidebar"
              aria-expanded={sidebarExpanded}
              aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
              title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
              data-testid="button-toggle-sidebar"
              className="hidden size-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground lg:inline-flex"
            >
              {sidebarExpanded ? <ChevronLeft size={17} aria-hidden="true" /> : <ChevronRight size={17} aria-hidden="true" />}
            </button>
            <span className="hidden text-[11px] font-medium text-muted-foreground sm:inline">Light Finance</span>
            <span className="hidden text-border sm:inline">/</span>
            <h1 className="truncate text-[13px] font-bold text-foreground">{current?.label ?? 'Workspace'}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <span className="hidden items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-semibold text-muted-foreground sm:inline-flex"><ShieldCheck size={13} className="text-[hsl(var(--success))]" /> Secure workspace</span>
            <span className="hidden max-w-[190px] truncate text-[11px] font-medium text-muted-foreground md:inline" title={user.email}>{user.email}</span>
            <div className="grid size-7 place-items-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground" title={user.fullName}>{initials}</div>
          </div>
        </header>
        <div className="mx-auto w-full min-w-0 max-w-[1640px] p-4 sm:p-5 xl:p-6">{children}</div>
      </main>
    </div>
  );
}

export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="workspace-intro relative mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <svg aria-hidden="true" className="pointer-events-none absolute right-0 top-0 hidden h-[92px] w-[180px] text-primary/[.075] md:block" viewBox="0 0 180 92" fill="none">
        <path d="M72 4v24h29v20h30v19h31" stroke="currentColor" strokeWidth="1.2" />
        <path d="M98 4v13h25v19h22v17h29" stroke="currentColor" strokeWidth="1" />
        <path d="M149 4v12h15v17h15" stroke="currentColor" strokeWidth="1" />
        <circle cx="101" cy="28" r="3" fill="hsl(var(--primary))" fillOpacity=".28" />
        <circle cx="131" cy="48" r="3" fill="hsl(var(--success))" fillOpacity=".38" />
        <circle cx="162" cy="67" r="3" fill="hsl(var(--accent))" fillOpacity=".48" />
        <circle cx="164" cy="33" r="2.5" fill="hsl(var(--warning))" fillOpacity=".55" />
      </svg>
      <div className="relative z-[1]">
        <p className="mb-1.5 font-mono-ui text-[10px] font-medium uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
        <h2 className="font-display text-[29px] font-semibold leading-[1.08] tracking-[-0.035em] text-foreground">{title}</h2>
        <p className="mt-2 max-w-[620px] text-[13px] leading-[1.6] text-muted-foreground">{description}</p>
      </div>
      {action && <div className="relative z-[1]">{action}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon = FolderOpen, title, detail, action }: { icon?: typeof FolderOpen; title: string; detail: string; action?: React.ReactNode }) {
  return (
     <div className="workspace-empty flex min-h-[250px] flex-col items-center justify-center rounded-xl border border-dashed border-primary/30 bg-[hsl(var(--info-bg))] px-6 text-center">
       <div className="mb-4 grid size-12 place-items-center rounded-xl border border-primary/15 bg-card text-primary shadow-xs"><Icon size={22} /></div>
      <h3 className="font-display text-[19px] font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-[360px] text-[12px] leading-5 text-muted-foreground">{detail}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function QueryError({ onRetry }: { onRetry: () => void }) {
  return (
     <div className="workspace-error flex items-center justify-between gap-4 rounded-xl border border-destructive/25 bg-[hsl(var(--danger-bg))] px-4 py-3 text-[12px] text-destructive" data-testid="status-query-error">
      <span>We could not load this workspace data.</span>
      <button onClick={onRetry} className="font-semibold underline underline-offset-4" data-testid="button-retry-query">Retry</button>
    </div>
  );
}
