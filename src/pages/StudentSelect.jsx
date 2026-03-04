import { useState, useRef } from "react";
import { usePlanningContext } from "../App.jsx";

export default function StudentSelect() {
  const {
    alunos,
    selectAluno,
    createAluno,
    deleteAluno,
    cloneAluno,
    exportAluno,
    importAluno,
  } = usePlanningContext();

  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [cloningNome, setCloningNome] = useState(null);
  const [cloneName, setCloneName] = useState("");
  const [cloneError, setCloneError] = useState("");
  const [importError, setImportError] = useState("");
  const importRef = useRef(null);

  function handleCreate(e) {
    e.preventDefault();
    setError("");
    const result = createAluno(newName);
    if (!result.ok) {
      setError(result.error);
    } else {
      setNewName("");
    }
  }

  function handleDelete(nome) {
    if (confirmDelete !== nome) {
      setConfirmDelete(nome);
      return;
    }
    deleteAluno(nome);
    setConfirmDelete(null);
  }

  function handleExport(nome) {
    const json = exportAluno(nome);
    if (!json) return;
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `planejamento_${nome}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCloneSubmit(e) {
    e.preventDefault();
    setCloneError("");
    const result = cloneAluno(cloningNome, cloneName);
    if (!result.ok) {
      setCloneError(result.error);
    } else {
      setCloningNome(null);
      setCloneName("");
    }
  }

  function handleImportFile(e) {
    setImportError("");
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name
      .replace(/\.json$/i, "")
      .replace(/^planejamento_/, "");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = importAluno(name, ev.target.result);
      if (!result.ok) setImportError(result.error);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-lg font-bold tracking-tight text-gray-900">
          Gerador PPC — UFES Elétrica
        </h1>
      </header>

      <div className="flex-1 flex items-start justify-center pt-16 px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-100 mb-4">
              <svg
                className="w-7 h-7 text-blue-600"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">
              Selecione seu perfil
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Cada aluno tem seu planejamento independente.
            </p>
          </div>

          {/* Lista de alunos existentes */}
          {alunos.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                Alunos cadastrados
              </p>
              <ul className="flex flex-col gap-2">
                {alunos.map((nome) => (
                  <li key={nome} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      {/* Botão principal — selecionar */}
                      <button
                        onClick={() => {
                          setConfirmDelete(null);
                          setCloningNome(null);
                          selectAluno(nome);
                        }}
                        className="flex-1 flex items-center gap-3 bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors rounded-xl px-4 py-3 text-left cursor-pointer group"
                      >
                        <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-sm font-bold flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 transition-colors">
                          {nome.charAt(0).toUpperCase()}
                        </span>
                        <span className="font-medium text-gray-800 text-sm truncate">
                          {nome}
                        </span>
                        <svg
                          className="w-4 h-4 text-gray-300 group-hover:text-blue-400 ml-auto flex-shrink-0 transition-colors"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </button>

                      {/* Ações */}
                      <div className="flex gap-1 flex-shrink-0">
                        {/* Clone */}
                        <button
                          onClick={() => {
                            setCloningNome((prev) =>
                              prev === nome ? null : nome,
                            );
                            setCloneName("");
                            setCloneError("");
                            setConfirmDelete(null);
                          }}
                          className={[
                            "px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer",
                            cloningNome === nome
                              ? "bg-blue-600 border-blue-600 text-white"
                              : "bg-white border-gray-300 text-gray-600 hover:border-blue-500 hover:text-blue-600",
                          ].join(" ")}
                        >
                          Clonar
                        </button>

                        {/* Export */}
                        <button
                          onClick={() => handleExport(nome)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium border bg-white border-gray-300 text-gray-600 hover:border-green-500 hover:text-green-600 transition-colors cursor-pointer"
                        >
                          Exportar
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => handleDelete(nome)}
                          onBlur={() => {
                            if (confirmDelete === nome) setConfirmDelete(null);
                          }}
                          className={[
                            "px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer",
                            confirmDelete === nome
                              ? "bg-red-600 border-red-600 text-white"
                              : "bg-white border-gray-300 text-gray-600 hover:border-red-500 hover:text-red-600",
                          ].join(" ")}
                        >
                          {confirmDelete === nome ? "Confirmar" : "Remover"}
                        </button>
                      </div>
                    </div>

                    {/* Formulário de clone inline */}
                    {cloningNome === nome && (
                      <form
                        onSubmit={handleCloneSubmit}
                        className="flex gap-2 pl-2"
                      >
                        <input
                          type="text"
                          value={cloneName}
                          onChange={(e) => {
                            setCloneName(e.target.value);
                            setCloneError("");
                          }}
                          placeholder="Nome do clone"
                          autoFocus
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="submit"
                          disabled={!cloneName.trim()}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                        >
                          Clonar
                        </button>
                      </form>
                    )}
                    {cloningNome === nome && cloneError && (
                      <p className="text-xs text-red-600 pl-2">{cloneError}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Criar novo aluno */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Novo aluno
            </p>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setError("");
                }}
                placeholder="Digite seu nome"
                autoFocus={alunos.length === 0}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={!newName.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2 rounded-lg transition-colors cursor-pointer"
              >
                Criar e entrar
              </button>
            </form>
          </div>

          {/* Importar JSON */}
          <div>
            <input
              ref={importRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportFile}
            />
            <button
              onClick={() => importRef.current?.click()}
              className="w-full py-2 border border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 text-sm rounded-xl transition-colors cursor-pointer"
            >
              Importar planejamento JSON
            </button>
            {importError && (
              <p className="text-xs text-red-600 mt-1">{importError}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
