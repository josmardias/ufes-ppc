// App-wide top bar (see docs/ARCHITECTURE.md, "src/components"). Gives every
// screen a consistent way back to the profile list — the planner previously
// had no navigation back to "/" other than the browser's back button.

import { Link, useLocation } from 'wouter';
import { IconArrowLeft } from './icons.jsx';

const FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400';

export default function Header() {
  const [location] = useLocation();
  const isHome = location === '/';

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-2xl items-center gap-4 px-6 py-3">
        {!isHome && (
          <Link
            href="/"
            className={`flex shrink-0 items-center gap-1 rounded text-sm font-medium text-slate-600 hover:text-slate-900 ${FOCUS_CLASS}`}
          >
            <IconArrowLeft className="size-4" />
            Meus perfis
          </Link>
        )}
        <Link
          href="/"
          className={`rounded text-sm font-semibold tracking-tight text-slate-900 hover:text-slate-700 ${FOCUS_CLASS} ${isHome ? '' : 'ml-auto'}`}
        >
          Planejador PPC
        </Link>
      </div>
    </header>
  );
}
