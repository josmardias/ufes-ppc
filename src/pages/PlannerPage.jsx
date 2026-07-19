// The planner for the active profile (see docs/USE_CASES.md, Schedule Planner).
// The Schedule Planner itself (UC-09 onward) is not implemented yet; this
// page surfaces the active profile's data and says so plainly instead of
// rendering a bare, unexplained stub.

import { useActiveProfile } from '../hooks/useActiveProfile.js';
import { getPpc } from '../data/index.js';
import { SHIFT_LABELS, formatIngress } from '../domain/format.js';

export default function PlannerPage() {
  const profile = useActiveProfile();
  const ppc = profile?.ppcId ? getPpc(profile.ppcId) : null;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-pretty wrap-break-word text-slate-900">{profile.name}</h1>
      <p className="mt-1 text-sm text-slate-600">
        Ingresso {formatIngress(profile)} · Turno {SHIFT_LABELS[profile.shift]}
        {ppc ? ` · ${ppc.name}` : ''}
      </p>

      <div className="mt-8 rounded-lg border border-dashed border-slate-300 px-6 py-10 text-center">
        <p className="font-medium text-slate-700">Planejador de matrícula em construção</p>
        <p className="mt-1 text-sm text-pretty text-slate-500">
          Em breve você poderá montar seu cronograma semestre a semestre por aqui.
        </p>
      </div>
    </main>
  );
}
