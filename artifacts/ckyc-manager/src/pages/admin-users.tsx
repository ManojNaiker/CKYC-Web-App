import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCurrentAppUserQueryKey,
  getListAdminUsersQueryKey,
  useListAdminUsers,
  useUpdateAdminUserRole,
} from "@workspace/api-client-react";
import { Check, Loader2, Shield, Users } from "lucide-react";
import { EmptyState, PageIntro, QueryError } from "@/components/workspace-shell";
import { roleLabel, type AppRole } from "@/lib/role-access";

const roles: AppRole[] = ["viewer", "manager", "admin"];

function displayDate(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const usersQuery = useListAdminUsers({
    query: { queryKey: getListAdminUsersQueryKey() },
  });
  const updateRole = useUpdateAdminUserRole();
  const [pendingRoles, setPendingRoles] = useState<Record<string, AppRole>>({});
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const users = usersQuery.data?.users ?? [];
  const roleCounts = useMemo(
    () => ({
      admin: users.filter((user) => user.role === "admin").length,
      manager: users.filter((user) => user.role === "manager").length,
      viewer: users.filter((user) => user.role === "viewer").length,
    }),
    [users],
  );

  const saveRole = (userId: string, currentRole: AppRole) => {
    const role = pendingRoles[userId] ?? currentRole;
    if (role === currentRole) return;
    setUpdatingUserId(userId);
    setMessage("");
    updateRole.mutate(
      { userId, data: { role } },
      {
        onSuccess: async () => {
          setPendingRoles((current) => {
            const next = { ...current };
            delete next[userId];
            return next;
          });
          setMessage("User role updated.");
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: getListAdminUsersQueryKey(),
            }),
            queryClient.invalidateQueries({
              queryKey: getGetCurrentAppUserQueryKey(),
            }),
          ]);
          setUpdatingUserId(null);
        },
        onError: (error) => {
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not update the user role.",
          );
          setUpdatingUserId(null);
        },
      },
    );
  };

  return (
    <div>
      <PageIntro
        eyebrow="Access control / Admin"
        title="Manage users"
        description="Assign Viewer, Manager, and Admin access to accounts that have signed in to this workspace."
        action={
          <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">
            <Shield size={15} className="text-primary" />
            {users.length} accounts
          </div>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {roles.map((role) => (
          <div
            key={role}
            className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
          >
            <p className="font-mono-ui text-[10px] uppercase tracking-[.13em] text-muted-foreground">
              {roleLabel(role)} accounts
            </p>
            <p className="mt-1 font-display text-2xl font-semibold text-foreground">
              {roleCounts[role]}
            </p>
          </div>
        ))}
      </div>

      {message && (
        <div
          role="status"
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            message === "User role updated."
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-destructive/25 bg-[hsl(var(--danger-bg))] text-destructive"
          }`}
        >
          {message}
        </div>
      )}

      {usersQuery.isError ? (
        <QueryError onRetry={() => void usersQuery.refetch()} />
      ) : usersQuery.isLoading ? (
        <div className="flex min-h-48 items-center justify-center gap-3 rounded-xl border border-border bg-card text-sm text-muted-foreground">
          <Loader2 size={18} className="animate-spin text-primary" />
          Loading user access…
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No accounts found"
          detail="Accounts appear here after the user signs in for the first time."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="data-table w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Last seen</th>
                  <th className="px-4 py-3">Added</th>
                  <th className="px-4 py-3">Workspace role</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const selectedRole = pendingRoles[user.userId] ?? user.role;
                  const isSaving = updatingUserId === user.userId;
                  return (
                    <tr
                      key={user.userId}
                      className="border-b border-border/70 last:border-0"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground">
                          {user.fullName}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {user.email}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {displayDate(user.lastSeenAt)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {displayDate(user.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={`Role for ${user.email}`}
                          value={selectedRole}
                          onChange={(event) =>
                            setPendingRoles((current) => ({
                              ...current,
                              [user.userId]: event.target.value as AppRole,
                            }))
                          }
                          disabled={isSaving}
                          className="min-w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold"
                        >
                          {roles.map((role) => (
                            <option key={role} value={role}>
                              {roleLabel(role)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => saveRole(user.userId, user.role)}
                          disabled={isSaving || selectedRole === user.role}
                          className="inline-flex min-w-28 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-45"
                        >
                          {isSaving ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Check size={14} />
                          )}
                          {isSaving ? "Saving" : "Save role"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 border-t border-border bg-secondary/30 px-4 py-3 text-xs text-muted-foreground">
            <Shield size={14} className="text-primary" />
            At least one Admin must remain assigned.
          </div>
        </div>
      )}
    </div>
  );
}