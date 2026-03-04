#!/usr/bin/env node
/**
 * processar-ppc.mjs
 *
 * Gera um PPC em JSON a partir de um arquivo D2 (diagramas) contendo:
 * - nós (disciplinas) no formato:  "N.CODIGO: N.CODIGO NOME..."
 * - arestas no formato:
 *     A -> B
 *     A -> B: co-requisito
 *     A <- B: ...   (invertido para B -> A)
 *
 * Regras importantes:
 * - Linhas iniciadas com "#" NÃO são ignoradas: são tratadas como conteúdo removendo o prefixo "#".
 *   (Isso permite manter o D2 "comentado" e ainda assim gerar o PPC.)
 * - IDs do tipo "1.ELE15923" são normalizados para "ELE15923".
 * - O JSON sempre inclui TODAS as disciplinas (nós), mesmo que não tenham arestas.
 * - Dependências são classificadas em "pre" (pré-requisito) e "co" (co-requisito).
 *
 * Saída: src/data/ppc-2022.json (fixo)
 *
 * Uso:
 *   node scripts/processar-ppc.mjs <arquivo.d2>
 *
 * Exemplo:
 *   node scripts/processar-ppc.mjs input/eletrica_obrigatorias.d2
 */

import fs from "node:fs/promises";
import path from "node:path";

const OUT_PATH = "src/data/ppc-2022.json";

function printHelp(exitCode = 0, msg = "") {
  if (msg) console.error(msg + "\n");
  console.error(
    `Uso:
  node scripts/processar-ppc.mjs <arquivo.d2>

Exemplo:
  node scripts/processar-ppc.mjs input/eletrica_obrigatorias.d2

Saída: ${OUT_PATH} (fixo)
`,
  );
  process.exit(exitCode);
}

function parseArgs(argv) {
  if (argv.includes("-h") || argv.includes("--help")) printHelp(0);

  const input = argv.find((a) => a.endsWith(".d2"));
  if (!input) printHelp(1, "Entrada obrigatória ausente: <arquivo.d2>");

  return { input };
}

function normalizeLine(s) {
  return (s ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[–—]/g, "-")
    .trim();
}

function stripCommentPrefix(line) {
  const t = (line ?? "").trimStart();
  if (!t.startsWith("#")) return line;
  return t.replace(/^#\s*/, "");
}

function normalizeCourseId(id) {
  // Remove prefixo "<semestre>." quando o resto parece código de disciplina.
  // Ex.: "1.ELE15923" -> "ELE15923"
  const trimmed = String(id ?? "").trim();
  const m = trimmed.match(/^\d+\.([A-Z]{2,}\d{3,})$/);
  if (m) return m[1];
  return trimmed;
}

function parseNodeId(id) {
  // Retorna { raw, semestre?, codigo }
  const trimmed = String(id ?? "").trim();

  const m = trimmed.match(/^(\d+)\.([A-Z]{2,}\d{3,})$/);
  if (m) return { raw: trimmed, semestre: Number(m[1]), codigo: m[2] };

  const m2 = trimmed.match(/^([A-Z]{2,}\d{3,})$/);
  if (m2) return { raw: trimmed, semestre: null, codigo: m2[1] };

  return { raw: trimmed, semestre: null, codigo: trimmed };
}

function isD2DirectiveLine(line) {
  // Directives típicas: "direction: right"
  const m = (line ?? "").match(/^(\w+)\s*:\s*(.+)$/);
  if (!m) return false;

  const key = (m[1] ?? "").toLowerCase();
  const value = (m[2] ?? "").trim();

  // Se o valor parece label de disciplina, NÃO é directive
  if (/^\d+\.[A-Z]{2,}\d{3,}\b/.test(value)) return false;
  if (/^[A-Z]{2,}\d{3,}\b/.test(value)) return false;

  if (key === "direction") return true;
  return true;
}

function classifyEdge(rotulo) {
  const t = String(rotulo ?? "")
    .trim()
    .toLowerCase();
  if (
    t.includes("co-requisito") ||
    t.includes("corequisito") ||
    t.includes("correquisito")
  ) {
    return { type: "co", label: rotulo ?? "" };
  }
  return { type: "pre", label: rotulo ?? "" };
}

function parseD2(text) {
  const nodesByRawId = new Map(); // rawId -> { rawId, codigo, semestre_sugerido, nome, labelText }
  const edges = []; // { fromRaw, toRaw, kind: 'pre'|'co', label }
  const lines = text
    .split("\n")
    .map(normalizeLine)
    .map(stripCommentPrefix)
    .map(normalizeLine);

  for (const line of lines) {
    if (!line) continue;
    if (isD2DirectiveLine(line)) continue;

    // 1) Arestas primeiro (porque podem ter ": rotulo")
    const edgeMatch = line.match(/^(.+?)\s*(->|<-)\s*(.+?)(?:\s*:\s*(.+))?$/);
    if (edgeMatch) {
      const left = edgeMatch[1].trim();
      const arrow = edgeMatch[2].trim();
      const right = edgeMatch[3].trim();
      const rotulo = (edgeMatch[4] ?? "").trim();

      let from = left;
      let to = right;
      if (arrow === "<-") {
        // "A <- B" significa B -> A
        from = right;
        to = left;
      }

      const { type, label } = classifyEdge(rotulo);
      edges.push({ fromRaw: from, toRaw: to, kind: type, label });
      continue;
    }

    // 2) Nó: "<id>: <texto>"
    const nodeMatch = line.match(/^([^:#]+?)\s*:\s*(.+)$/);
    if (nodeMatch) {
      const rawId = nodeMatch[1].trim();
      const labelText = nodeMatch[2].trim();
      const parsed = parseNodeId(rawId);

      // tenta extrair nome do labelText:
      // - "N.CODIGO NOME..."
      // - "CODIGO NOME..."
      let nome = "";
      const p1 = labelText.match(/^\d+\.[A-Z]{2,}\d{3,}\s+(.+)$/);
      if (p1) nome = p1[1].trim();
      else {
        const p2 = labelText.match(/^[A-Z]{2,}\d{3,}\s+(.+)$/);
        if (p2) nome = p2[1].trim();
      }

      nodesByRawId.set(rawId, {
        rawId,
        codigo: normalizeCourseId(rawId),
        semestre_sugerido: parsed.semestre ?? null,
        nome,
        labelText,
      });
      continue;
    }
  }

  return { nodesByRawId, edges };
}

function buildPpcJson({ nodesByRawId, edges }) {
  // Estrutura final:
  // {
  //   version: 1,
  //   generatedAt: "...",
  //   courses: {
  //     "ELE15923": { code, name, suggestedSemester, prereq: [...], coreq: [...] }
  //   },
  //   edges: [ { type, from, to, label } ] // opcionalmente útil para inspeção
  // }
  const courses = new Map(); // code -> courseObj
  const getOrCreate = (code) => {
    if (!courses.has(code)) {
      courses.set(code, {
        code,
        name: "",
        suggestedSemester: null,
        prereq: [],
        coreq: [],
      });
    }
    return courses.get(code);
  };

  // 1) inclui todos os nós
  for (const n of nodesByRawId.values()) {
    const c = getOrCreate(n.codigo);
    if (!c.name && n.nome) c.name = n.nome;
    if (c.suggestedSemester === null && n.semestre_sugerido != null) {
      c.suggestedSemester = n.semestre_sugerido;
    }
  }

  // 2) adiciona dependências
  const edgesOut = [];
  for (const e of edges) {
    const from = normalizeCourseId(e.fromRaw);
    const to = normalizeCourseId(e.toRaw);

    // garante nós mínimos
    getOrCreate(from);
    getOrCreate(to);

    edgesOut.push({ type: e.kind, from, to, label: e.label ?? "" });

    const target = getOrCreate(to);
    const arr = e.kind === "co" ? target.coreq : target.prereq;
    if (!arr.includes(from)) arr.push(from);
  }

  // 3) ordena arrays para estabilidade
  for (const c of courses.values()) {
    c.prereq.sort();
    c.coreq.sort();
  }

  // 4) converte para objeto puro com chaves ordenadas
  const sortedCodes = Array.from(courses.keys()).sort();
  const coursesObj = {};
  for (const code of sortedCodes) coursesObj[code] = courses.get(code);

  return {
    version: 1,
    courses: coursesObj,
    edges: edgesOut,
  };
}

async function main() {
  const { input } = parseArgs(process.argv.slice(2));

  const inputPath = path.resolve(input);
  const outPath = path.resolve(OUT_PATH);

  const text = await fs.readFile(inputPath, "utf8");
  const parsed = parseD2(text);

  const ppc = buildPpcJson(parsed);

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(ppc, null, 2) + "\n", "utf8");

  console.log(`OK: PPC JSON gerado em: ${outPath}`);
  console.log(`Cursos: ${Object.keys(ppc.courses).length}`);
  console.log(`Arestas: ${ppc.edges.length}`);
}

main().catch((err) => {
  console.error("Erro:", err?.stack ?? err);
  process.exit(1);
});
