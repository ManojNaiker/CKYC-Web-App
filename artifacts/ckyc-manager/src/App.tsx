import { type ReactNode, useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Overview from '@/pages/overview';
import Clients from '@/pages/clients';
import ClientDetail from '@/pages/client-detail';
import Requests from '@/pages/requests';
import RequestDetail from '@/pages/request-detail';
import DownloadRequests from '@/pages/download-requests';
import CkycCreateData from '@/pages/ckyc-create-data';
import UserManagement from '@/pages/user-management';
import AuditLogs from '@/pages/audit-logs';
import { WorkspaceShell } from '@/components/workspace-shell';
import lightFinanceLogo from '@assets/Logo_Light_1788338497887.png';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#087f9f',
    colorForeground: '#24383d',
    colorMutedForeground: '#718087',
    colorDanger: '#b84d44',
    colorBackground: '#fffefa',
    colorInput: '#fffefa',
    colorInputForeground: '#24383d',
    colorNeutral: '#d9d5c9',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '0.45rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffefa] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'font-display tracking-tight',
    headerSubtitle: 'text-muted-foreground',
    formFieldLabel: 'text-foreground',
    footerActionLink: 'text-primary',
    footerActionText: 'text-muted-foreground',
    socialButtonsBlockButton: 'border-border bg-background',
    formButtonPrimary: 'bg-primary hover:bg-primary/90',
    formFieldInput: 'border-input bg-background',
    alert: 'border-destructive/30',
    alertText: 'text-destructive',
    dividerLine: 'bg-border',
    dividerText: 'text-muted-foreground',
    logoBox: 'h-12',
    logoImage: 'max-h-12',
  },
};

function LoadingScreen() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background">
      <div className="text-center">
        <div className="mx-auto mb-4 h-2 w-20 overflow-hidden rounded-full bg-secondary">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
        </div>
        <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Loading secure workspace
        </p>
      </div>
    </div>
  );
}

function LandingPage() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto flex min-h-[100dvh] max-w-6xl flex-col justify-between px-6 py-8 sm:px-10">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-[190px] items-center rounded-md bg-white px-2.5 shadow-sm">
            <img src={lightFinanceLogo} alt="Light Finance" className="h-auto max-h-9 w-full object-contain" />
          </span>
          <span className="font-mono-ui text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            Secure operations portal
          </span>
        </div>
        <div className="grid gap-12 py-20 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
          <div>
            <p className="mb-4 font-mono-ui text-[10px] uppercase tracking-[0.22em] text-primary">
              Light CKYC Web Application
            </p>
            <h1 className="max-w-2xl font-display text-5xl font-semibold leading-[1.02] tracking-[-0.04em] text-foreground sm:text-7xl">
              A controlled workspace for CKYC operations.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">
              Sign in to manage LMS clients, create requests, upload responses, and review the activity history for your team.
            </p>
            <button
              type="button"
              onClick={() => setLocation('/sign-in')}
              className="mt-9 inline-flex items-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
            >
              Sign in to workspace
            </button>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.2em] text-primary">Access model</p>
            <div className="mt-6 space-y-5">
              {[
                ['Admin', 'Manage users, roles, statuses, and all CKYC workflows.'],
                ['Manager', 'Run operational workflows and review audit history.'],
                ['Viewer', 'Read workspace data without mutation permissions.'],
              ].map(([role, detail]) => (
                <div key={role} className="border-b border-border pb-5 last:border-0 last:pb-0">
                  <p className="font-display text-lg font-semibold text-foreground">{role}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Access is enforced on the server for every protected action.
        </p>
      </div>
    </div>
  );
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function HomeRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingScreen />;
  return isSignedIn ? <WorkspaceRoutes /> : <LandingPage />;
}

function WorkspaceRoutes() {
  return (
    <RoutedErrorBoundary>
      <WorkspaceShell>
        <Switch>
          <Route path="/" component={Overview} />
          <Route path="/clients/:clientId" component={ClientDetail} />
          <Route path="/clients" component={Clients} />
          <Route path="/requests/:id" component={RequestDetail} />
          <Route path="/requests" component={Requests} />
          <Route path="/download-requests" component={DownloadRequests} />
          <Route path="/ckyc-create-data" component={CkycCreateData} />
          <Route path="/users" component={UserManagement} />
          <Route path="/audit-logs" component={AuditLogs} />
          <Route component={NotFound} />
        </Switch>
      </WorkspaceShell>
    </RoutedErrorBoundary>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) {
        queryClient.clear();
      }
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

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
            title: 'Welcome back',
            subtitle: 'Sign in to access your workspace',
          },
        },
        signUp: {
          start: {
            title: 'Create your account',
            subtitle: 'Request access to the CKYC workspace',
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route component={HomeRedirect} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;