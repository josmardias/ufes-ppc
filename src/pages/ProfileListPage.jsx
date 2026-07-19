// Profile list, the app's home screen (UC-01, see docs/USE_CASES.md).
// Also hosts profile selection (UC-03), cloning (UC-04), deletion (UC-05),
// import (UC-06), export (UC-07), and renaming (UC-08).

import { useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useStore } from '../store/index.js';
import CreateProfileDialog from '../components/CreateProfileDialog.jsx';
import ProfileNameDialog from '../components/ProfileNameDialog.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

const IMPORT_ERROR_MESSAGES = {
  invalid: 'O arquivo selecionado não é válido.',
  'unknown-ppc': 'O perfil faz referência a um Projeto Pedagógico de Curso (PPC) que não existe no sistema.',
};

function buildExportFilename(name) {
  const slug =
    name
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'perfil';
  const date = new Date().toISOString().slice(0, 10);
  return `${slug}-${date}.json`;
}

export default function ProfileListPage() {
  const profiles = useStore((state) => state.profiles);
  const setActiveProfileId = useStore((state) => state.setActiveProfileId);
  const cloneProfile = useStore((state) => state.cloneProfile);
  const deleteProfile = useStore((state) => state.deleteProfile);
  const renameProfile = useStore((state) => state.renameProfile);
  const exportProfile = useStore((state) => state.exportProfile);
  const importProfile = useStore((state) => state.importProfile);

  const createDialogRef = useRef(null);
  const fileInputRef = useRef(null);
  const [, navigate] = useLocation();

  const [cloneTarget, setCloneTarget] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [importConflict, setImportConflict] = useState(null);
  const [importError, setImportError] = useState(null);

  function handleSelect(profile) {
    setActiveProfileId(profile.id);
    navigate('/profile');
  }

  function handleExport(profile) {
    const data = exportProfile(profile.id);
    if (!data) return;

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = buildExportFilename(profile.name);
    link.click();
    URL.revokeObjectURL(url);
  }

  function runImport(raw, options) {
    const result = importProfile(raw, options);
    if (result.ok) return;
    if (result.error === 'duplicate') {
      setImportConflict({ raw, name: result.name });
    } else {
      setImportError(IMPORT_ERROR_MESSAGES[result.error]);
    }
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    runImport(await file.text());
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Meus perfis</h1>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImportFile}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700"
          >
            Importar perfil
          </button>
          <button
            type="button"
            onClick={() => createDialogRef.current?.showModal()}
            className="rounded bg-slate-900 px-3 py-1 text-sm text-white"
          >
            Criar perfil
          </button>
        </div>
      </div>

      {profiles.length === 0 ? (
        <p className="mt-4 text-slate-600">Nenhum perfil criado ainda.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {profiles.map((profile) => (
            <li key={profile.id} className="flex items-center justify-between rounded border border-slate-200 p-3">
              <button
                type="button"
                onClick={() => handleSelect(profile)}
                className="text-left font-medium text-slate-900 hover:underline"
              >
                {profile.name}
              </button>
              <div className="flex gap-3 text-sm text-slate-600">
                <button type="button" onClick={() => handleExport(profile)}>
                  Exportar
                </button>
                <button type="button" onClick={() => setCloneTarget(profile)}>
                  Clonar
                </button>
                <button type="button" onClick={() => setRenameTarget(profile)}>
                  Renomear
                </button>
                <button type="button" onClick={() => setDeleteTarget(profile)} className="text-red-600">
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateProfileDialog ref={createDialogRef} onCreated={() => navigate('/profile')} />

      <ProfileNameDialog
        open={cloneTarget != null}
        title="Clonar perfil"
        confirmLabel="Clonar"
        initialName=""
        onSubmit={(name) => cloneProfile(cloneTarget.id, name)}
        onClose={() => setCloneTarget(null)}
      />

      <ProfileNameDialog
        open={renameTarget != null}
        title="Renomear perfil"
        confirmLabel="Salvar"
        initialName={renameTarget?.name ?? ''}
        onSubmit={(name) => renameProfile(renameTarget.id, name)}
        onClose={() => setRenameTarget(null)}
      />

      <ConfirmDialog
        open={deleteTarget != null}
        title="Excluir perfil"
        message={`Tem certeza que deseja excluir o perfil "${deleteTarget?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        danger
        onConfirm={() => {
          deleteProfile(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={importConflict != null}
        title="Perfil já existe"
        message={`Já existe um perfil chamado "${importConflict?.name}". Deseja sobrescrevê-lo?`}
        confirmLabel="Sobrescrever"
        onConfirm={() => {
          runImport(importConflict.raw, { overwrite: true });
          setImportConflict(null);
        }}
        onCancel={() => setImportConflict(null)}
      />

      <ConfirmDialog
        open={importError != null}
        title="Não foi possível importar"
        message={importError ?? ''}
        confirmLabel="OK"
        cancelLabel={null}
        onConfirm={() => setImportError(null)}
        onCancel={() => setImportError(null)}
      />
    </main>
  );
}
