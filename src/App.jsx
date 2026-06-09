// Static routes (see docs/ARCHITECTURE.md, "State Management and Routing").
// `/profile` resolves the active profile from persisted state; if there is
// none, it redirects to `/` instead of taking the profile id from the URL.

import { Redirect, Route, Router, Switch } from 'wouter';
import { useStore } from './store/index.js';
import ProfileListPage from './pages/ProfileListPage.jsx';
import PlannerPage from './pages/PlannerPage.jsx';

// Served from a GitHub Pages subpath; keep wouter's base in sync with Vite's.
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

function PlannerRoute() {
  const activeProfileId = useStore((state) => state.activeProfileId);
  return activeProfileId ? <PlannerPage /> : <Redirect to="/" />;
}

export default function App() {
  return (
    <Router base={base}>
      <Switch>
        <Route path="/" component={ProfileListPage} />
        <Route path="/profile" component={PlannerRoute} />
      </Switch>
    </Router>
  );
}
