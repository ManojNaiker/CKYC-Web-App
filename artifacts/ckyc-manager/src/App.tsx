import { useEffect, useRef } from "react";
import {
  ClerkProvider,
  SignIn,
  SignUp,
  useAuth,
} from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getGetCurrentAppUserQueryKey,
  useGetCurrentAppUser,
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
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY.");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#5041d8",
    colorForeground: "#24233f",
    colorMutedForeground: "#657087",
    colorDanger: "#b42332",
    colorBackground: "#ffffff",
    colorInput: "#f8fafc",
    colorInputForeground: "#24233f",
    colorNeutral: "#d7dbea",
    fontFamily: "DM Sans, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl border border-slate-200",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-slate-900 font-bold",
    headerSubtitle: "text-slate-600",
    socialButtonsBlockButtonText: "text-slate-800 font-semibold",
    formFieldLabel: "text-slate-700",
    footerActionLink: "text-indigo-700 font-semibold",
    footerActionText: "text-slate-600",
    dividerText: "text-slate-500",
    identityPreviewEditButton: "text-indigo-700",
    formFieldSuccessText: "text-emerald-700",
    alertText: "text-red-700",
    logoBox: "justify-center",
    logoImage: "h-10",
    socialButtonsBlockButton: "border-slate-300 bg-white hover:bg-slate-50",
    formButtonPrimary: "bg-indigo-600 hover:bg-indigo-700 text-white font-semibold",
    formFieldInput: "border-slate-300 text-slate-900",
    footerAction: "bg-transparent",
    dividerLine: "bg-slate-200",
    alert: "bg-red-50 border border-red-200",
    otpCodeFieldInput: "border-slate-300",
    formFieldRow: "space-y-1",
    main: "text-slate-900",
  },
};

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
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        appearance={clerkAppearance}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        appearance={clerkAppearance}
      />
    </div>
  );
}

function ClerkCacheInvalidator() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (
      previousUserId.current !== undefined &&
      previousUserId.current !== userId
    ) {
      queryClient.clear();
    }
    previousUserId.current = userId;
  }, [queryClient, userId]);

  return null;
}

function HomeRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingScreen />;
  return isSignedIn ? <ProtectedWorkspace /> : <PublicHome />;
}

function ProtectedWorkspace() {
  const { isLoaded, isSignedIn } = useAuth();
  const currentUser = useGetCurrentAppUser({
    query: {
      queryKey: getGetCurrentAppUserQueryKey(),
      enabled: isLoaded && Boolean(isSignedIn),
      retry: false,
      refetchOnWindowFocus: true,
    },
  });

  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) return <Redirect to="/" />;
  if (currentUser.isLoading) return <LoadingScreen />;
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

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  const stripBase = (path: string) =>
    basePath && path.startsWith(basePath)
      ? path.slice(basePath.length) || "/"
      : path;

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to access Light Finance operations",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "New accounts start with Viewer access",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ClerkCacheInvalidator />
          <ErrorBoundary>
            <Switch>
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />
              <Route path="/" component={HomeRoute} />
              <Route component={ProtectedWorkspace} />
            </Switch>
          </ErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}