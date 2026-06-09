// Profile list, the app's home screen (UC-01, see docs/USE_CASES.md).

import { useStore } from '../store/index.js';

export default function ProfileListPage() {
  const profiles = useStore((state) => state.profiles);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-slate-900">Meus perfis</h1>

      {profiles.length === 0 ? (
        <p className="mt-4 text-slate-600">Nenhum perfil criado ainda.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {profiles.map((profile) => (
            <li key={profile.id} className="rounded border border-slate-200 p-3">
              {profile.name}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
