import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import BusinessContextPage from "./pages/BusinessContext";
import Conversations from "./pages/Conversations";
import Home from "./pages/Home";
import Tasks from "./pages/Tasks";
import Vault from "./pages/Vault";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/conversations" component={Conversations} />
      <Route path="/context" component={BusinessContextPage} />
      <Route path="/vault" component={Vault} />
      <Route path="/tasks" component={Tasks} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
