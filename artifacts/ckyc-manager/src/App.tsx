import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import { WorkspaceShell } from '@/components/workspace-shell';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <WorkspaceShell>
        <Switch>
          <Route path="/" component={Overview} />
          <Route path="/clients/:clientId" component={ClientDetail} />
          <Route path="/clients" component={Clients} />
          <Route path="/requests/:id" component={RequestDetail} />
          <Route path="/requests" component={Requests} />
          <Route path="/download-requests" component={DownloadRequests} />
          <Route component={NotFound} />
        </Switch>
      </WorkspaceShell>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
