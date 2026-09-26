import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  getListAdminUsersQueryKey,
  useCreateAdminUser,
  type ProvisionedUserInput,
} from "@workspace/api-client-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
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
import { useQueryClient } from "@tanstack/react-query";
import { Plus, UserPlus } from "lucide-react";
import type { AppRole } from "@/lib/role-access";

const createUserSchema = z.object({
  fullName: z.string().trim().min(1, "Enter the user's name.").max(200),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .max(64, "Username must be 64 characters or fewer.")
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/,
      "Use letters, numbers, dots, underscores, or hyphens; start with a letter or number.",
    ),
  email: z.string().max(320).optional(),
  password: z.string().min(1, "Enter an initial password.").max(1024),
  role: z.enum(["viewer", "manager", "admin"]),
});

type CreateUserFormValues = z.infer<typeof createUserSchema>;

export function AdminUserCreateDialog({
  onCreated,
}: {
  onCreated: (username: string) => void;
}) {
  const queryClient = useQueryClient();
  const createUser = useCreateAdminUser();
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      fullName: "",
      username: "",
      email: "",
      password: "",
      role: "viewer",
    },
  });

  const submit = (values: CreateUserFormValues) => {
    setSubmitError("");
    const input: ProvisionedUserInput = {
      fullName: values.fullName,
      username: values.username,
      email: values.email || "",
      password: values.password,
      role: values.role as AppRole,
    };
    createUser.mutate(
      { data: input },
      {
        onSuccess: async (response) => {
          form.reset();
          setOpen(false);
          onCreated(response.user.username ?? response.user.fullName);
          await queryClient.invalidateQueries({
            queryKey: getListAdminUsersQueryKey(),
          });
        },
        onError: (error) => {
          setSubmitError(
            error instanceof Error
              ? error.message
              : "Could not create the account.",
          );
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          form.reset();
          setSubmitError("");
        }
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          data-testid="button-add-user"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus size={15} />
          Add user
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserPlus size={19} />
          </div>
          <DialogTitle>Add workspace user</DialogTitle>
          <DialogDescription>
            Create a login account and assign its workspace role. Public
            sign-up stays disabled.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(submit)}
            className="space-y-4"
            data-testid="form-add-user"
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
                      data-testid="input-user-full-name"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
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
                        required
                        autoComplete="off"
                        data-testid="input-user-username"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                    </FormControl>
                    <FormDescription>
                      3–64 letters, numbers, dots, underscores, or hyphens.
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
                    <FormLabel>Contact email (optional)</FormLabel>
                    <FormControl>
                      <input
                        {...field}
                        type="email"
                        autoComplete="email"
                        data-testid="input-user-email"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Initial password</FormLabel>
                    <FormControl>
                      <input
                        {...field}
                        required
                        type="password"
                        autoComplete="new-password"
                        data-testid="input-user-password"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                    </FormControl>
                    <FormDescription>
                      Share it with the user securely. It won’t be shown again.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Workspace role</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        data-testid="select-user-role"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
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
                data-testid="status-user-create-error"
                className="rounded-lg border border-destructive/25 bg-[hsl(var(--danger-bg))] px-3 py-2 text-sm text-destructive"
              >
                {submitError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                data-testid="button-cancel-add-user"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="button-submit-add-user"
                disabled={createUser.isPending}
                className="inline-flex min-w-32 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {createUser.isPending && (
                  <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
                )}
                {createUser.isPending ? "Creating…" : "Create user"}
              </button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}