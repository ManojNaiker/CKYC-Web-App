import { useMemo, useState } from "react";
import {
  getListAdminUsersQueryKey,
  useListAdminUsers,
} from "@workspace/api-client-react";
import { Loader2, Shield, Users } from "lucide-react";
import { AdminUserCreateDialog } from "@/components/admin-user-create-dialog";
import { AdminUserEditDialog } from "@/components/admin-user-edit-dialog";
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
  const usersQuery = useListAdminUsers({
    query: { queryKey: getListAdminUsersQueryKey() },
  });
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

  return (
    <div>
      <PageIntro
        eyebrow="Access control / Admin"
        title="Manage users"
        description="Create accounts, update user profiles and sign-in details, and manage workspace roles."
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <AdminUserCreateDialog
              onCreated={(username) => {
                setMessage(`Account @${username} created.`);
              }}
            />
            <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">
              <Shield size={15} className="text-primary" />
              {users.length} accounts
            </div>
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
            message.startsWith("User ") || message.startsWith("Account @")
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
          detail="Add a user account here. Public sign-up is disabled."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="data-table w-full min-w-[800px] border-collapse text-left">
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
                  return (
                    <tr
                      key={user.userId}
                      className="border-b border-border/70 last:border-0"
                    >
                      <td className="px-4 py-3">
                        <p
                          data-testid={`text-user-name-${user.userId}`}
                          className="font-semibold text-foreground"
                        >
                          {user.fullName}
                        </p>
                        {user.username && (
                          <p
                            data-testid={`text-user-username-${user.userId}`}
                            className="mt-0.5 text-xs font-medium text-primary"
                          >
                            @{user.username}
                          </p>
                        )}
                        <p
                          data-testid={`text-user-email-${user.userId}`}
                          className="mt-0.5 text-xs text-muted-foreground"
                        >
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
                        <span
                          data-testid={`text-user-role-${user.userId}`}
                          className="inline-flex rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs font-semibold text-foreground"
                        >
                          {roleLabel(user.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <AdminUserEditDialog
                          user={user}
                          onSaved={(updatedUser) => {
                            const identity =
                              updatedUser.username ??
                              updatedUser.fullName;
                            setMessage(`User ${identity} updated.`);
                          }}
                        />
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