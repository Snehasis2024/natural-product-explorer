import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react';
import { HashRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider } from './lib/app-context';
import { Layout, Page } from './components/Layout';
import { EmptyState, ErrorState, Spinner } from './components/ui';
import { HomePage } from './pages/Home';

const CompoundPage = lazy(() => import('./pages/Explorer').then((m) => ({ default: m.CompoundPage })));
const AnalyzePage = lazy(() => import('./pages/Explorer').then((m) => ({ default: m.AnalyzePage })));
const SearchPage = lazy(() => import('./pages/Search').then((m) => ({ default: m.SearchPage })));
const PredictPage = lazy(() => import('./pages/Predict').then((m) => ({ default: m.PredictPage })));
const ComparePage = lazy(() => import('./pages/Compare').then((m) => ({ default: m.ComparePage })));
const ExplorePage = lazy(() => import('./pages/Explore').then((m) => ({ default: m.ExplorePage })));
const DatabasesPage = lazy(() => import('./pages/Databases').then((m) => ({ default: m.DatabasesPage })));
const AboutPage = lazy(() => import('./pages/About').then((m) => ({ default: m.AboutPage })));

/** Keeps a render error inside one page instead of blanking the whole app. */
class PageErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (this.state.error) {
      return <Page><ErrorState title="This view failed to render" message={this.state.error.message} action={<Link to="/" className="btn mt-2">Go home</Link>} /></Page>;
    }
    return this.props.children;
  }
}

function Boundary({ children }: { children: ReactNode }) {
  const loc = useLocation();
  return <PageErrorBoundary resetKey={loc.pathname + loc.search}>{children}</PageErrorBoundary>;
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <ScrollTop />
        <Layout>
          <Boundary>
          <Suspense fallback={<Page><Spinner label="Loading…" /></Page>}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/explore" element={<ExplorePage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/predict" element={<PredictPage />} />
              <Route path="/compare" element={<ComparePage />} />
              <Route path="/databases" element={<DatabasesPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/compound/:id" element={<CompoundPage />} />
              <Route path="/analyze" element={<AnalyzePage />} />
              <Route path="*" element={<Page><EmptyState title="Page not found" message="This page does not exist." action={<Link to="/" className="btn mt-2">Go home</Link>} /></Page>} />
            </Routes>
          </Suspense>
          </Boundary>
        </Layout>
      </HashRouter>
    </AppProvider>
  );
}
