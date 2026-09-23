import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListAppUsersQueryKey,
  useListAppUsers,
  useUpdateAppUser,
} from '@workspace/api-client-react';
import type { AppUser, AppUserRole, AppUserStatus } from '@workspace/api-client-react';
import { ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import { PageIntro, QueryError } from '@/components/workspace-shell';

const roleLabels: Record<AppUserRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  viewer: 'Viewer',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function UserManagement() {
  const queryClient = useQueryClient();
  const usersQuery = useListAppUsers();
  const updateUser = useUpdateAppUser();
  const [savingId, setSavingId] = useState<number | null>(null);

  async function changeUser(user: AppUser, field: 'role' | 'status', value: string) {
    setSavingId(user.id);
    try {
      await updateUser.mutateAsync({
        id: user.id,
        data: field === 'role'
          ? { role: value as AppUserRole }
          : { status: value as AppUserStatus },
      });
      await queryClient.invalidateQueries({ queryKey: getListAppUsersQueryKey() });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div>
      <PageIntro
        eyebrow="Administration"
        title="User management"
        description="Assign application roles and control workspace access. New Clerk users enter as Viewer until an Admin promotes them."
      />
      {usersQuery.isError ? (
        <QueryError onRetry={() => usersQuery.refetch()} />
      ) : usersQuery.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl border border-border bg-card" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-lg bg-secondary text-primary">
                <UsersRound size={17} />
              </div>
              <div>
                <p className="font-display text-lg font-semibold text-foreground">Workspace members</p>
                <p className="text-xs text-muted-foreground">{usersQuery.data?.total ?? 0} registered application users</p>
              </div>
            </div>
            <ShieldCheck size={18} className="text-primary" />
          </div>
          <div className="divide-y divide-border">
            {usersQuery.data?.items.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                saving={savingId === user.id}
                onChange={changeUser}
              />
            ))}
          </div>
        </div>
      )}
      {updateUser.isError && (
        <p className="mt-3 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-xs text-destructive">
          {(updateUser.error as { data?: { error?: string } })?.data?.error ?? 'The account change could not be saved.'}
        </p>
      )}
    </div>
  );
}

function UserRow({
  user,
  saving,
  onChange,
}: {
  user: AppUser;
  saving: boolean;
  onChange: (user: AppUser, field: 'role' | 'status', value: string) => Promise<void>;
}) {
  return (
    <div className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1.5fr)_180px_150px_190px] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[#dceef0] text-primary">
          <UserRound size={17} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{user.displayName}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <p className="mt-1 font-mono-ui text-[9px] uppercase tracking-[0.1em] text-muted-foreground/70">
            Last seen {formatDate(user.lastSeenAt)}
          </p>
        </div>
      </div>
      <label className="text-xs text-muted-foreground">
        <span className="mb-1.5 block font-mono-ui text-[9px] uppercase tracking-[0.14em]">Role</span>
        <select
          value={user.role}
          disabled={saving}
          onChange={(event) => void onChange(user, 'role', event.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring"
        >
          {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="text-xs text-muted-foreground">
        <span className="mb-1.5 block font-mono-ui text-[9px] uppercase tracking-[0.14em]">Status</span>
        <select
          value={user.status}
          disabled={saving}
          onChange={(event) => void onChange(user, 'status', event.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
      </label>
      <div className="text-left lg:text-right">
        <p className={`inline-flex rounded-full px-2.5 py-1 font-mono-ui text-[9px] uppercase tracking-[0.12em] ${user.status === 'active' ? 'bg-[#e3f2e8] text-[#31704b]' : 'bg-[#f6e5e1] text-[#a64940]'}`}>
          {saving ? 'Saving…' : user.status}
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">Joined {formatDate(user.createdAt)}</p>
      </div>
    </div>
  );
}