// Profile list, the app's home screen (UC-01, see docs/USE_CASES.md).
// Also hosts profile selection (UC-03), cloning (UC-04), deletion (UC-05),
// import (UC-06), export (UC-07), and renaming (UC-08).

import { useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useStore } from '../store/index.js';
import { getPpc } from '../data/index.js';
import { SHIFT_LABELS, formatIngress } from '../domain/format.js';
import CreateProfileDialog from '../components/CreateProfileDialog.jsx';
import ProfileNameDialog from '../components/ProfileNameDialog.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import {
  IconCopy,
  IconDownload,
  IconPencil,
  IconPlus,
  IconTrash,
  IconUpload,
  IconUsers,
} from '../components/icons.jsx';

const IMPORT_ERROR_MESSAGES = {
  invalid: 'O arquivo selecionado não é válido.',
  'unknown-ppc':
    'O perfil faz referência a um Projeto Pedagógico de Curso (PPC) que não existe no sistema.',
};

const BUTTON_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
const ACTION_BUTTON_CLASS = `inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-400`;
const DANGER_ACTION_BUTTON_CLASS = `inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 ${BUTTON_FOCUS_CLASS} focus-visible:ring-red-400`;

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
    navigate('/plan');
  }

  function handleExport(profile) {
    const data = exportProfile(profile.id);
    if (!data) return;

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-balance text-slate-900">
            Meus perfis
          </h1>
          <p className="mt-1 text-sm text-pretty text-slate-600">
            Escolha um perfil para continuar seu planejamento, ou crie um novo.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
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
            className={`inline-flex items-center gap-1.5 rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-400`}
          >
            <IconUpload className="size-4" />
            Importar perfil
          </button>
          <button
            type="button"
            onClick={() => createDialogRef.current?.showModal()}
            className={`inline-flex items-center gap-1.5 rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-500`}
          >
            <IconPlus className="size-4" />
            Criar perfil
          </button>
        </div>
      </div>

      {profiles.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 px-6 py-12 text-center">
          <IconUsers className="size-10 text-slate-400" />
          <p className="font-medium text-slate-700">
            Nenhum perfil criado ainda
          </p>
          <p className="max-w-sm text-sm text-pretty text-slate-500">
            Use os botões acima para criar um novo perfil ou importar um perfil
            exportado anteriormente.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {profiles.map((profile) => {
            const ppc = profile.ppcId ? getPpc(profile.ppcId) : null;
            return (
              <li
                key={profile.id}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300"
              >
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-900">
                    <button
                      type="button"
                      onClick={() => handleSelect(profile)}
                      className={`block w-full truncate rounded text-left hover:underline ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-400`}
                    >
                      {profile.name}
                    </button>
                  </h2>
                  <p className="mt-0.5 truncate text-sm text-slate-500">
                    Ingresso {formatIngress(profile)} · Turno{' '}
                    {SHIFT_LABELS[profile.shift]}
                    {ppc ? ` · ${ppc.name}` : ''}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2">
                  <button
                    type="button"
                    onClick={() => handleExport(profile)}
                    className={ACTION_BUTTON_CLASS}
                  >
                    <IconDownload className="size-4" />
                    Exportar
                  </button>
                  <button
                    type="button"
                    onClick={() => setCloneTarget(profile)}
                    className={ACTION_BUTTON_CLASS}
                  >
                    <IconCopy className="size-4" />
                    Clonar
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenameTarget(profile)}
                    className={ACTION_BUTTON_CLASS}
                  >
                    <IconPencil className="size-4" />
                    Renomear
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(profile)}
                    className={`ml-auto ${DANGER_ACTION_BUTTON_CLASS}`}
                  >
                    <IconTrash className="size-4" />
                    Excluir
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <CreateProfileDialog
        ref={createDialogRef}
        onCreated={() => navigate('/plan')}
      />

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
        message={`Tem certeza que deseja excluir o perfil “${deleteTarget?.name}”? Esta ação não pode ser desfeita.`}
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
        message={`Já existe um perfil chamado “${importConflict?.name}”. Deseja sobrescrevê-lo?`}
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
