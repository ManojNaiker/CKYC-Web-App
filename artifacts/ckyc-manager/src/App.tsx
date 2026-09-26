import { useEffect, useRef, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getGetCurrentAppUserQueryKey,
  useGetCurrentAppUser,
  useLogin,
} from "@workspace/api-client-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceShell } from "@/components/workspace-shell";
import AuditTrails from "@/pages/audit-trails";
import AdminUsers from "@/pages/admin-users";
import ClientDetail from "@/pages/client-detail";
import Clients from "@/pages/clients";
import CkycCreateData from "@/pages/ckyc-create-data";
import DownloadRequests from "@/pages/download-requests";
import FinfluxUpdate from "@/pages/finflux-update";
import NotFound from "@/pages/not-found";
import Overview from "@/pages/overview";
import PublicHome from "@/pages/public-home";
import RequestDetail from "@/pages/request-detail";
import Requests from "@/pages/requests";
import { canAccessPage, type AppRole } from "@/lib/role-access";
import {
  Redirect,
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from "wouter";

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type CurrentUser = {
  userId: string;
  email: string;
  fullName: string;
  role: AppRole;
  createdAt: string;
  lastSeenAt: string | null;
};

function LoadingScreen() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground shadow-sm">
        <span className="size-2 animate-pulse rounded-full bg-primary" />
        Loading secure workspace…
      </div>
    </div>
  );
}

function SignInPage() {
  const login = useLogin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8">
      <form className="w-full max-w-[440px] space-y-5 rounded-2xl border border-border bg-card p-8 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          login.mutate({ data: { username, password } }, {
            onSuccess: () => {
              const target = new URLSearchParams(window.location.search).get("returnTo");
              window.location.assign(target?.startsWith("/") ? target : (basePath || "/"));
            },
            onError: (cause) => {
              const status = (cause as { status?: number }).status;
              setError(
                status === 503
                  ? "Sign-in is temporarily unavailable. Please contact your administrator."
                  : "Invalid username or password.",
              );
              setPassword("");
            },
          });
        }}>
        <h1 className="font-display text-2xl font-semibold">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to access Light Finance operations.</p>
        <label className="block text-sm font-medium" htmlFor="username">Username
          <input id="username" required autoComplete="username" className="mt-1 w-full rounded-lg border p-2.5"
            value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label className="block text-sm font-medium" htmlFor="password">Password
          <input id="password" required type="password" autoComplete="current-password" className="mt-1 w-full rounded-lg border p-2.5"
            value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={login.isPending} className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground">
          {login.isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

function HomeRoute() {
  const currentUser = useGetCurrentAppUser({ query: { queryKey: getGetCurrentAppUserQueryKey(), retry: false } });
  const queryClient = useQueryClient();
  const previousUserId = useRef<string | undefined>(undefined);
  const userId = currentUser.data?.user.userId;
  useEffect(() => {
    if (previousUserId.current !== undefined && previousUserId.current !== userId) {
      queryClient.clear();
    }
    previousUserId.current = userId;
  }, [queryClient, userId]);
  if (currentUser.isLoading) return <LoadingScreen />;
  return currentUser.data?.user ? <ProtectedWorkspace /> : <PublicHome />;
}

function ProtectedWorkspace() {
  const currentUser = useGetCurrentAppUser({
    query: {
      queryKey: getGetCurrentAppUserQueryKey(),
      retry: false,
      refetchOnWindowFocus: true,
    },
  });

  if (currentUser.isLoading) return <LoadingScreen />;
  if (currentUser.isError && (currentUser.error as { status?: number }).status === 401) {
    return <Redirect to={`/sign-in?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`} />;
  }
  if (currentUser.isError || !currentUser.data?.user) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background p-5">
        <div className="max-w-lg rounded-2xl border border-border bg-card p-7 shadow-sm">
          <p className="font-mono-ui text-[10px] font-semibold uppercase tracking-[.18em] text-primary">
            Account access
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold text-foreground">
            We could not verify your workspace role.
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Use your verified company email. If this continues, ask an
            administrator to review your account.
          </p>
          <button
            type="button"
            onClick={() => void currentUser.refetch()}
            className="mt-5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return <WorkspacePages user={currentUser.data.user as CurrentUser} />;
}

function WorkspacePages({ user }: { user: CurrentUser }) {
  const [location] = useLocation();
  const allowed = canAccessPage(user.role, location);

  return (
    <WorkspaceShell user={user}>
      {allowed ? (
        <Switch>
          <Route path="/" component={Overview} />
          <Route path="/clients/:clientId" component={ClientDetail} />
          <Route path="/clients" component={Clients} />
          <Route path="/requests/:id" component={RequestDetail} />
          <Route path="/requests" component={Requests} />
          <Route path="/download-requests" component={DownloadRequests} />
          <Route path="/ckyc-create-data" component={CkycCreateData} />
          <Route path="/finflux-update" component={FinfluxUpdate} />
          <Route path="/manage-users" component={AdminUsers} />
          <Route path="/audit-trails" component={AuditTrails} />
          <Route component={NotFound} />
        </Switch>
      ) : (
        <AccessDenied />
      )}
    </WorkspaceShell>
  );
}

function AccessDenied() {
  return (
    <div className="rounded-2xl border border-border bg-card p-7 shadow-sm">
      <p className="font-mono-ui text-[10px] font-semibold uppercase tracking-[.18em] text-destructive">
        Access restricted
      </p>
      <h2 className="mt-2 font-display text-2xl font-semibold text-foreground">
        Your role cannot open this section.
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Choose one of the pages available in your sidebar, or ask an
        administrator to change your role.
      </p>
    </div>
  );
}

function AppRoutes() {
  return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ErrorBoundary>
            <Switch>
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/" component={HomeRoute} />
              <Route component={ProtectedWorkspace} />
            </Switch>
          </ErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
  );
}

export default function App() {
  return (
    <WouterRouter base={basePath}>
      <AppRoutes />
    </WouterRouter>
  );
}