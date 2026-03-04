#!/usr/bin/env node
/**
 * processar-oferta.mjs
 *
 * Parser de oferta (PDF) -> JSON, refeito do zero com base em blocos:
 *   Disciplina -> Turma -> Horarios (dia/inicio/fim) + docente (quando aparecer)
 *
 * Objetivo:
 * - Ler 1 PDF de oferta
 * - Extrair texto com pdf-parse
 * - Identificar registros tabulares com o padrão observado:
 *     <periodo> (linha numérica 1..12)
 *     <CODIGO - NOME> (pode quebrar em múltiplas linhas)
 *     <CH> (número)
 *     (uma ou mais turmas)
 *       <TURMA> ex: "06.1 N"
 *       ... vários tokens de coluna ...
 *       <Dia> <Início> <Fim>
 *       (às vezes o docente aparece como um token "humano" próximo do bloco; às vezes não aparece)
 *
 * Importante:
 * - Horários SEMPRE existem no relatório. Docente às vezes não aparece como texto (pode ficar vazio).
 * - O PDF pode "colocar" o primeiro horário antes do primeiro token de TURMA (ou depois de um TURMA sem que turmaAtual tenha sido setada no momento certo).
 *   Este parser bufferiza horários até capturar a primeira turma do bloco da disciplina e então os anexa.
 *
 * Saída:
 * - JSON com a lista de disciplinas e suas turmas.
 *
 * Saída: src/data/oferta-semestre-<n>.json (fixo, pretty-printed)
 *
 * Uso:
 *   node scripts/processar-oferta.mjs --pdf input/relatorio.pdf --semestre 1
 *
 * Obrigatório:
 *   --pdf <arquivo.pdf>
 *   --semestre 1|2
 *
 * Opcional:
 *   --debug               (logs no stderr)
 *
 * Dependências:
 *   npm i pdf-parse
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import pdf from "pdf-parse";

function usage(exitCode = 1, msg = "") {
  if (msg) console.error(msg + "\n");
  console.error(
    [
      "Uso:",
      "  node scripts/processar-oferta.mjs --pdf <arquivo.pdf> --semestre <1|2> [--debug]",
      "",
      "Exemplos:",
      "  node scripts/processar-oferta.mjs --pdf input/relatorio.pdf --semestre 1",
      "  node scripts/processar-oferta.mjs --pdf input/relatorio.pdf --semestre 2",
      "",
      "Saída: src/data/oferta-semestre-<n>.json (fixo, pretty-printed)",
    ].join("\n"),
  );
  process.exit(exitCode);
}

function parseArgs(argv) {
  const out = {
    pdf: "",
    semestre: null,
    debug: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    if (a === "-h" || a === "--help") usage(0);
    if (a === "--debug") {
      out.debug = true;
      continue;
    }

    if (a === "--pdf") {
      const v = argv[i + 1];
      if (!v) usage(1, "Faltou valor para --pdf");
      out.pdf = v;
      i++;
      continue;
    }

    if (a === "--semestre") {
      const v = argv[i + 1];
      if (!v || !/^[12]$/.test(v))
        usage(1, "Valor inválido para --semestre (use 1 ou 2)");
      out.semestre = Number(v);
      i++;
      continue;
    }

    usage(1, `Argumento desconhecido: ${a}`);
  }

  if (!out.pdf) usage(1, "Parâmetro obrigatório ausente: --pdf <arquivo.pdf>");
  if (out.semestre === null)
    usage(1, "Parâmetro obrigatório ausente: --semestre <1|2>");

  out.out = `src/data/oferta-semestre-${out.semestre}.json`;

  return out;
}

function makeLogger(enabled) {
  return (...args) => {
    if (!enabled) return;
    console.error("[debug]", ...args);
  };
}

function normalizeLine(s) {
  return (s ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function isIntegerToken(s) {
  return typeof s === "string" && /^\d+$/.test(s.trim());
}

function isPeriodoToken(s) {
  if (!isIntegerToken(s)) return false;
  const n = Number(s);
  return Number.isFinite(n) && n >= 1 && n <= 12;
}

function isHorarioToken(s) {
  return typeof s === "string" && /^\d{2}:\d{2}$/.test(s.trim());
}

function isDiaSemanaToken(s) {
  if (typeof s !== "string") return false;
  const t = s.trim().toLowerCase();
  return (
    t === "seg" ||
    t === "ter" ||
    t === "qua" ||
    t === "qui" ||
    t === "sex" ||
    t === "sab" ||
    t === "sáb" ||
    t === "dom"
  );
}

function isTurmaToken(s) {
  // Ex: "06.1 N"
  return typeof s === "string" && /^\d{2}\.\d\s+[A-Z]$/i.test(s.trim());
}

function parseCodigoNomeLine(s) {
  // Ex: "INF15927 - PROGRAMAÇÃO I"
  const m = String(s ?? "").match(/^([A-Z]{2,}\d{3,})\s*-\s*(.+)$/);
  if (!m) return null;
  return { codigo: m[1].trim(), nomeParte: m[2].trim() };
}

function isProbablyDocenteToken(s) {
  // Heurística conservadora: 2+ palavras, sem ":" e sem "|", não é cabeçalho, não é "INTEGRADO II", etc.
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (!t) return false;

  const upper = t.toUpperCase();
  const headerLike = new Set([
    "PERÍODO",
    "DISCIPLINA",
    "CH",
    "TURMA",
    "ESCOPO",
    "SITUAÇÃO",
    "VAGAS",
    "OFERTADAS",
    "OCUPADAS",
    "DISPONÍVEIS",
    "HORÁRIOS",
    "DIA",
    "INÍCIO",
    "FIM",
    "DOCENTE",
  ]);
  if (headerLike.has(upper)) return false;
  if (upper.startsWith("RELATÓRIO OFERTA")) return false;

  if (t.includes(":")) return false;
  if (t.includes("|")) return false;
  if (t.includes("-")) return false;

  // Evita fragmentos comuns de nome de disciplina
  if (/^INTEGRADO\s+(I|II|III|IV|V|VI|VII|VIII|IX|X)$/i.test(t)) return false;
  if (/^CURSO\s+(I|II|III|IV|V)$/i.test(t)) return false;
  if (/^(I|II|III|IV|V|VI|VII|VIII|IX|X)$/i.test(t)) return false;
  if (/^(DE|DA|DO|DAS|DOS)\b/i.test(t)) return false;

  // precisa ter 2+ palavras
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;

  // alguma evidência de texto "humano": minúscula ou acento
  const hasLower = /[a-zà-ÿ]/.test(t);
  const hasAccents = /[À-ÖØ-öø-ÿÇç]/.test(t);
  if (!hasLower && !hasAccents) return false;

  return true;
}

function parseTextToOferta(lines, semestre, dbg) {
  /**
   * Máquina de estados:
   * - periodoAtual: último período visto (1..12)
   * - disciplinaAtual: { periodo, codigo, nome, ch, turmas: Map<turma, TurmaInfo> }
   * - turmaAtual: string (quando dentro de uma turma)
   * - horariosPendentes: quando um horário aparece antes da primeira TURMA do bloco da disciplina
   *
   * Regras:
   * - Encontrou novo "CODIGO - NOME": flush disciplina anterior e começa outra
   * - Dentro de disciplina:
   *   * Captura CH: primeiro número isolado após nome
   *   * Captura TURMA: token "06.1 N" inicia (ou troca) turmaAtual
   *   * Captura horário: sequência (Dia, HH:MM, HH:MM) adiciona horário à turmaAtual
   *   * Captura docente: token humano logo após um horário (janela curta) associa à turmaAtual (se vazio)
   *
   * Importante:
   * - A extração do PDF pode trazer tokens de uma disciplina "colados" no começo da próxima.
   * - Por isso, o flush ocorre ao detectar novo código/nome ou novo período.
   */

  const disciplinas = [];
  let periodoAtual = null;

  /** @type {null | { periodo:number|null, codigo:string, nomeParts:string[], ch:number|null, turmas: Map<string, any> }} */
  let disc = null;
  let turmaAtual = "";
  /** @type {Array<{dia:string,inicio:string,fim:string}>} */
  let horariosPendentes = [];

  function flushDiscIfAny() {
    if (!disc) return;

    const codigo = disc.codigo?.trim();
    const nome = disc.nomeParts.join(" ").replace(/\s+/g, " ").trim();
    const ch = disc.ch;

    if (!codigo || !nome) {
      disc = null;
      turmaAtual = "";
      horariosPendentes = [];
      return;
    }

    // Converte map de turmas em array
    const turmas = Array.from(disc.turmas.entries()).map(([turma, info]) => {
      const horarios = Array.from(info.horarios.values()).map((h) => ({
        dia: h.dia,
        inicio: h.inicio,
        fim: h.fim,
      }));

      // ordena horarios para estabilidade
      const dayOrder = {
        Seg: 1,
        Ter: 2,
        Qua: 3,
        Qui: 4,
        Sex: 5,
        Sab: 6,
        Dom: 7,
      };
      horarios.sort((a, b) => {
        const da = dayOrder[a.dia] ?? 99;
        const db = dayOrder[b.dia] ?? 99;
        if (da !== db) return da - db;
        if (a.inicio !== b.inicio) return a.inicio.localeCompare(b.inicio);
        return a.fim.localeCompare(b.fim);
      });

      return {
        turma,
        horarios,
        docente: info.docente ?? "",
      };
    });

    // ordena turmas por nome
    turmas.sort((a, b) => a.turma.localeCompare(b.turma));

    disciplinas.push({
      semestre,
      periodo: disc.periodo ?? periodoAtual ?? null,
      codigo,
      nome,
      carga_horaria: typeof ch === "number" ? ch : null,
      turmas,
    });

    disc = null;
    turmaAtual = "";
    horariosPendentes = [];
  }

  function ensureDisc() {
    if (disc) return disc;
    disc = {
      periodo: periodoAtual,
      codigo: "",
      nomeParts: [],
      ch: null,
      turmas: new Map(),
    };
    return disc;
  }

  function ensureTurma(turma) {
    const d = ensureDisc();
    const t = String(turma ?? "").trim();
    if (!t) return null;
    if (!d.turmas.has(t)) {
      d.turmas.set(t, {
        docente: "",
        // horarios dedup por chave "Dia HH:MM-HH:MM"
        horarios: new Map(),
      });
    }
    return d.turmas.get(t);
  }

  function normalizeDia(token) {
    const t = String(token ?? "")
      .trim()
      .toLowerCase();
    if (t === "seg") return "Seg";
    if (t === "ter") return "Ter";
    if (t === "qua") return "Qua";
    if (t === "qui") return "Qui";
    if (t === "sex") return "Sex";
    if (t === "sab" || t === "sáb") return "Sab";
    if (t === "dom") return "Dom";
    return String(token ?? "").trim();
  }

  // Percorre tokens/linhas
  for (let i = 0; i < lines.length; i++) {
    const tok = lines[i];

    // Período
    //
    // IMPORTANTE:
    // Após já termos capturado um código de disciplina (disc != null),
    // números 1..12 aparecem com frequência como "ruído" da tabela (ex.: colunas como Escopo/Situação, contadores, etc.).
    // Se fizermos flush ao ver esses tokens, acabamos finalizando a disciplina prematuramente e perdendo horários.
    //
    // Regra adotada:
    // - Se NÃO estamos dentro de uma disciplina, usamos o token como período.
    // - Se JÁ estamos dentro de uma disciplina, ignoramos o token (não flush, não muda periodoAtual).
    if (isPeriodoToken(tok)) {
      if (!disc) {
        periodoAtual = Number(tok);
      }
      continue;
    }

    // Novo "CODIGO - NOME"
    const cn = parseCodigoNomeLine(tok);
    if (cn) {
      if (disc) flushDiscIfAny();

      disc = {
        periodo: periodoAtual,
        codigo: cn.codigo,
        nomeParts: [cn.nomeParte],
        ch: null,
        turmas: new Map(),
      };
      turmaAtual = "";
      horariosPendentes = [];
      continue;
    }

    // Se não estamos dentro de uma disciplina, ignora
    if (!disc) continue;

    // Continuação do nome (até capturar CH)
    if (disc.ch === null) {
      if (isIntegerToken(tok)) {
        disc.ch = Number(tok);
        continue;
      }

      const upper = tok.toUpperCase();
      const headerLike =
        upper === "PERÍODO" ||
        upper === "DISCIPLINA" ||
        upper === "CH" ||
        upper === "TURMA" ||
        upper === "ESCOPO" ||
        upper === "SITUAÇÃO" ||
        upper === "VAGAS" ||
        upper === "OFERTADAS" ||
        upper === "OCUPADAS" ||
        upper === "DISPONÍVEIS" ||
        upper === "HORÁRIOS" ||
        upper === "DIA" ||
        upper === "INÍCIO" ||
        upper === "FIM" ||
        upper === "DOCENTE" ||
        upper.startsWith("RELATÓRIO OFERTA") ||
        upper.startsWith("PÁGINA ");

      if (
        !headerLike &&
        !isTurmaToken(tok) &&
        !isDiaSemanaToken(tok) &&
        !isHorarioToken(tok)
      ) {
        disc.nomeParts.push(tok);
      }
      continue;
    }

    // TURMA
    if (isTurmaToken(tok)) {
      turmaAtual = tok.trim();
      const info = ensureTurma(turmaAtual);

      // Se já vimos horários antes da primeira turma, anexa agora na primeira turma capturada.
      if (info && horariosPendentes.length > 0) {
        for (const h of horariosPendentes) {
          const key = `${h.dia} ${h.inicio}-${h.fim}`;
          if (!info.horarios.has(key)) info.horarios.set(key, h);
        }
        horariosPendentes = [];
      }
      continue;
    }

    // Horário: Dia + HH:MM + HH:MM
    if (
      isDiaSemanaToken(tok) &&
      isHorarioToken(lines[i + 1]) &&
      isHorarioToken(lines[i + 2])
    ) {
      const dia = normalizeDia(tok);
      const inicio = lines[i + 1];
      const fim = lines[i + 2];

      // Se ainda não temos turma, bufferiza para anexar assim que a primeira turma aparecer.
      if (!turmaAtual) {
        horariosPendentes.push({ dia, inicio, fim });
        i += 2;
        continue;
      }

      const info = ensureTurma(turmaAtual);
      const key = `${dia} ${inicio}-${fim}`;
      if (info && !info.horarios.has(key)) {
        info.horarios.set(key, { dia, inicio, fim });
      }

      // tenta capturar docente logo após o horário (janela curta)
      let docente = "";
      for (let k = i + 3; k < Math.min(lines.length, i + 18); k++) {
        const t = lines[k];

        if (isTurmaToken(t)) break;
        if (parseCodigoNomeLine(t)) break;
        if (isPeriodoToken(t)) break;

        if (isIntegerToken(t)) continue;
        if (isDiaSemanaToken(t)) continue;
        if (isHorarioToken(t)) continue;

        if (isProbablyDocenteToken(t)) {
          docente = t;
          break;
        }
      }

      if (docente) {
        if (info && !info.docente) info.docente = docente;
      }

      i += 2;
      continue;
    }

    // ignora
  }

  // flush final
  flushDiscIfAny();

  if (horariosPendentes.length > 0) {
    dbg(
      "Aviso: horários pendentes sem turma no final do parsing (serão ignorados):",
      horariosPendentes,
    );
  }

  return disciplinas;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbg = makeLogger(args.debug);

  const pdfPath = path.resolve(args.pdf);
  if (!fs.existsSync(pdfPath) || !fs.statSync(pdfPath).isFile()) {
    usage(1, `Arquivo não encontrado: ${args.pdf}`);
  }

  dbg("lendo pdf:", pdfPath);
  const buf = await fsp.readFile(pdfPath);
  const data = await pdf(buf);

  const lines = String(data.text ?? "")
    .split("\n")
    .map(normalizeLine)
    .filter((l) => l.length > 0);

  dbg("chars:", String(data.text ?? "").length, "lines:", lines.length);

  const disciplinas = parseTextToOferta(lines, args.semestre, dbg);

  const payload = {
    semestre: args.semestre,
    fonte_pdf: path.basename(pdfPath),
    gerado_em: new Date().toISOString(),
    disciplinas,
  };

  const outPath = path.resolve(args.out);
  await fsp.mkdir(path.dirname(outPath), { recursive: true });
  await fsp.writeFile(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

  console.log(`OK: ${disciplinas.length} disciplinas`);
  console.log(`JSON gerado em: ${outPath}`);
}

main().catch((err) => {
  console.error("Erro:", err?.stack ?? err);
  process.exit(1);
});
