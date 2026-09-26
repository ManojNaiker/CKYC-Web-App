import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  getGetCurrentAppUserQueryKey,
  getListAdminUsersQueryKey,
  useUpdateAdminUser,
  type AdminUserUpdate,
  type AppUser,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Shield, UserRoundPen } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { roleLabel, type AppRole } from "@/lib/role-access";

function makeEditUserSchema(currentUsername: string | null) {
  return z
    .object({
      fullName: z.string().trim().min(1, "Enter the user's name.").max(200),
      email: z.string().trim().min(1, "Enter a contact email.").max(320),
      username: z
        .string()
        .trim()
        .max(64)
        .refine(
          (value) =>
            value === "" || /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(value),
          "Use 3–64 letters, numbers, dots, underscores, or hyphens; start with a letter or number.",
        ),
      password: z.string().max(1024),
      role: z.enum(["viewer", "manager", "admin"]),
    })
    .superRefine((values, context) => {
      if (currentUsername && !values.username) {
        context.addIssue({
          code: "custom",
          path: ["username"],
          message: "Choose a replacement username instead of removing this login.",
        });
      }
      if (!currentUsername && values.username && !values.password) {
        context.addIssue({
          code: "custom",
          path: ["password"],
          message: "Set an initial password to enable this user's login.",
        });
      }
      if (!values.username && values.password) {
        context.addIssue({
          code: "custom",
          path: ["username"],
          message: "Set a username before setting a password.",
        });
      }
    });
}

type EditUserFormValues = z.infer<ReturnType<typeof makeEditUserSchema>>;

function formValuesFor(user: AppUser): EditUserFormValues {
  return {
    fullName: user.fullName,
    email: user.email,
    username: user.username ?? "",
    password: "",
    role: user.role,
  };
}

export function AdminUserEditDialog({
  user,
  onSaved,
}: {
  user: AppUser;
  onSaved: (user: AppUser) => void;
}) {
  const queryClient = useQueryClient();
  const updateUser = useUpdateAdminUser();
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const isBootstrapAdmin = user.username === "admin";
  const schema = useMemo(
    () => makeEditUserSchema(user.username),
    [user.username],
  );
  const form = useForm<EditUserFormValues>({
    resolver: zodResolver(schema),
    defaultValues: formValuesFor(user),
  });
  const enteredUsername = form.watch("username");
  const requiresInitialPassword =
    !isBootstrapAdmin && !user.username && enteredUsername.trim().length > 0;

  const handleOpenChange = (nextOpen: boolean) => {
    form.reset(formValuesFor(user));
    setSubmitError("");
    setOpen(nextOpen);
  };

  const submit = (values: EditUserFormValues) => {
    setSubmitError("");
    const input: AdminUserUpdate = {
      fullName: values.fullName.trim(),
      email: values.email.trim(),
      username: values.username.trim() || null,
      role: values.role as AppRole,
      ...(values.password.length > 0 ? { password: values.password } : {}),
    };

    updateUser.mutate(
      { userId: user.userId, data: input },
      {
        onSuccess: async (response) => {
          form.reset(formValuesFor(response.user));
          onSaved(response.user);
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: getListAdminUsersQueryKey(),
            }),
            queryClient.invalidateQueries({
              queryKey: getGetCurrentAppUserQueryKey(),
            }),
          ]);
          setOpen(false);
        },
        onError: (error) => {
          setSubmitError(
            error instanceof Error
              ? error.message
              : "Could not update the user account.",
          );
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          data-testid={`button-edit-user-${user.userId}`}
          aria-label={`Edit ${user.fullName}`}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
        >
          <Pencil size={14} />
          Edit
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserRoundPen size={19} />
          </div>
          <DialogTitle>Edit workspace user</DialogTitle>
          <DialogDescription>
            Update this user's profile, sign-in details, and workspace role.
          </DialogDescription>
        </DialogHeader>

        {isBootstrapAdmin && (
          <div
            data-testid="text-bootstrap-account-note"
            className="flex gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground"
          >
            <Shield size={15} className="mt-0.5 shrink-0 text-primary" />
            <span>
              This is the bootstrap Admin account. Its username is fixed and
              its password is managed through Replit Secrets; you can update
              its profile here.
            </span>
          </div>
        )}

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(submit)}
            className="space-y-4"
            data-testid={`form-edit-user-${user.userId}`}
          >
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name</FormLabel>
                  <FormControl>
                    <input
                      {...field}
                      required
                      autoComplete="name"
                      maxLength={200}
                      disabled={updateUser.isPending}
                      data-testid="input-edit-user-full-name"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <input
                        {...field}
                        required={Boolean(user.username)}
                        autoComplete="username"
                        maxLength={64}
                        disabled={isBootstrapAdmin || updateUser.isPending}
                        data-testid="input-edit-user-username"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                      />
                    </FormControl>
                    <FormDescription>
                      {isBootstrapAdmin
                        ? "The bootstrap username is fixed."
                        : user.username
                          ? "Use a new username to rename this login."
                          : "Leave blank for no local login, or set a username and initial password."}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact email</FormLabel>
                    <FormControl>
                      <input
                        {...field}
                        required
                        type="email"
                        autoComplete="email"
                        maxLength={320}
                        disabled={updateUser.isPending}
                        data-testid="input-edit-user-email"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {!isBootstrapAdmin && (
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {user.username ? "New password" : "Initial password"}
                      </FormLabel>
                      <FormControl>
                        <input
                          {...field}
                          required={requiresInitialPassword}
                          type="password"
                          autoComplete="new-password"
                          maxLength={1024}
                          disabled={updateUser.isPending}
                          data-testid="input-edit-user-password"
                          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                        />
                      </FormControl>
                      <FormDescription>
                        {user.username
                          ? "Leave blank to keep the current password."
                          : "Required when adding a username; leave blank to keep this account without local sign-in."}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Workspace role</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        disabled={isBootstrapAdmin || updateUser.isPending}
                        data-testid="select-edit-user-role"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                      >
                        {isBootstrapAdmin ? (
                          <option value="admin">Admin</option>
                        ) : (
                          <>
                            <option value="viewer">{roleLabel("viewer")}</option>
                            <option value="manager">{roleLabel("manager")}</option>
                            <option value="admin">{roleLabel("admin")}</option>
                          </>
                        )}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {submitError && (
              <p
                role="alert"
                data-testid="status-user-edit-error"
                className="rounded-lg border border-destructive/25 bg-[hsl(var(--danger-bg))] px-3 py-2 text-sm text-destructive"
              >
                {submitError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                data-testid="button-cancel-edit-user"
                onClick={() => handleOpenChange(false)}
                disabled={updateUser.isPending}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="button-submit-edit-user"
                disabled={updateUser.isPending}
                className="inline-flex min-w-32 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {updateUser.isPending && (
                  <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
                )}
                {updateUser.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}