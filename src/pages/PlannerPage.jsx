// The planner for the active profile (see docs/USE_CASES.md, Schedule Planner).

import { useActiveProfile } from '../hooks/useActiveProfile.js';

export default function PlannerPage() {
  const profile = useActiveProfile();

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-pretty wrap-break-word text-slate-900">{profile.name}</h1>
    </main>
  );
}
