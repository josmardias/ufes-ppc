# ufes-ppc

Curriculum planning tool for Electrical Engineering — UFES.

## Live app

https://josmardias.github.io/ufes-ppc/

## Local development

```sh
npm install
npx vite
```

## Data pipeline scripts

These scripts update the bundled data in `src/data/`.
Run them when offer PDFs or the PPC definition change.

### Generate PPC JSON (from D2 file)

```sh
node scripts/processar-ppc.mjs scripts/input/eletrica-obrigatorias.d2
# fixed output: src/data/ppc-2022.json
```

### Generate offer JSON (from PDFs)

```sh
node scripts/processar-oferta.mjs --pdf scripts/input/<1st-semester-report>.pdf --semestre 1
node scripts/processar-oferta.mjs --pdf scripts/input/<2nd-semester-report>.pdf --semestre 2
# fixed output: src/data/oferta-semestre-1.json, src/data/oferta-semestre-2.json
```

## Production build

```sh
npm run build
# outputs to dist/ — ready for GitHub Pages
```

Automatic deployment via GitHub Actions on every push to `main`.

## Repository

https://github.com/josmardias/ufes-ppc