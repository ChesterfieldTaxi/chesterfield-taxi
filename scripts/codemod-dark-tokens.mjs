#!/usr/bin/env node
/**
 * Semantic Dark Mode Token Codemod (`scripts/codemod-dark-tokens.mjs`)
 *
 * Converts hardcoded Tailwind slate/white surface, border, text, gradient, and soft status badge
 * color utilities to semantic `@theme` tokens defined in `app/app.css`.
 *
 * Scoped strictly to paths passed on the command line (files or directories).
 *
 * Usage:
 *   node scripts/codemod-dark-tokens.mjs app/components/domain/dispatch app/components/ui/FloatingWindow.tsx
 *   node scripts/codemod-dark-tokens.mjs --dry-run app/components/domain/dispatch
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const targetArgs = args.filter((a) => !a.startsWith('--'));

if (targetArgs.length === 0) {
  console.error(
    'Usage: node scripts/codemod-dark-tokens.mjs [--dry-run] <path1> [path2 ...]'
  );
  process.exit(1);
}

const VALID_EXTENSIONS = new Set(['.tsx', '.ts']);

function collectFiles(entryPath, out = []) {
  const resolved = path.resolve(process.cwd(), entryPath);
  if (!fs.existsSync(resolved)) {
    console.warn(`[codemod-dark-tokens] Skipping missing path: ${entryPath}`);
    return out;
  }
  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    if (VALID_EXTENSIONS.has(path.extname(resolved))) {
      out.push(resolved);
    }
    return out;
  }
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
      collectFiles(path.join(resolved, entry.name), out);
    }
  }
  return out;
}

/**
 * Maps a single Tailwind color utility token (preserving variant prefixes like `hover:`, `sm:`, `focus:`
 * and opacity suffixes like `/80`, `/95`) to its semantic token counterpart, or returns null if unchanged.
 */
function mapBaseToken(base, opacitySuffix) {
  const opNum = opacitySuffix ? parseInt(opacitySuffix.slice(1), 10) : null;

  // 1. Surfaces (`bg-*`) & Gradients (`from-*`, `via-*`, `to-*`)
  for (const surfProp of ['bg', 'from', 'via', 'to']) {
    if (base === `${surfProp}-white`) {
      if (opNum !== null && opNum < 50) return null;
      return `${surfProp}-surface-card`;
    }
    if (base === `${surfProp}-slate-50` || base === `${surfProp}-gray-50`) {
      return `${surfProp}-surface-subtle`;
    }
    if (base === `${surfProp}-slate-100` || base === `${surfProp}-gray-100`) {
      return `${surfProp}-surface-muted`;
    }
    if (base === `${surfProp}-slate-200` || base === `${surfProp}-gray-200`) {
      return `${surfProp}-surface-emphasis`;
    }
    if (base === `${surfProp}-slate-300` || base === `${surfProp}-gray-300`) {
      return `${surfProp}-surface-strong`;
    }
    if (base === `${surfProp}-emerald-50` || base === `${surfProp}-green-50` || base === `${surfProp}-teal-50`) {
      return `${surfProp}-status-success-bg`;
    }
    if (base === `${surfProp}-emerald-100` || base === `${surfProp}-green-100` || base === `${surfProp}-teal-100`) {
      return `${surfProp}-status-success-bg-strong`;
    }
    if (base === `${surfProp}-amber-50` || base === `${surfProp}-yellow-50`) {
      return `${surfProp}-status-warning-bg`;
    }
    if (base === `${surfProp}-amber-100` || base === `${surfProp}-amber-200` || base === `${surfProp}-yellow-100`) {
      return `${surfProp}-status-warning-bg-strong`;
    }
    if (base === `${surfProp}-rose-50` || base === `${surfProp}-red-50`) {
      return `${surfProp}-status-danger-bg`;
    }
    if (base === `${surfProp}-rose-100` || base === `${surfProp}-red-100`) {
      return `${surfProp}-status-danger-bg-strong`;
    }
    if (base === `${surfProp}-blue-50` || base === `${surfProp}-sky-50` || base === `${surfProp}-cyan-50`) {
      return `${surfProp}-status-info-bg`;
    }
    if (base === `${surfProp}-blue-100` || base === `${surfProp}-sky-100` || base === `${surfProp}-cyan-100`) {
      return `${surfProp}-status-info-bg-strong`;
    }
    if (base === `${surfProp}-indigo-50` || base === `${surfProp}-purple-50` || base === `${surfProp}-violet-50` || base === `${surfProp}-fuchsia-50`) {
      return `${surfProp}-status-staged-bg`;
    }
    if (base === `${surfProp}-indigo-100` || base === `${surfProp}-purple-100` || base === `${surfProp}-violet-100` || base === `${surfProp}-violet-200` || base === `${surfProp}-fuchsia-100`) {
      return `${surfProp}-status-staged-bg-strong`;
    }
  }

  if (base === 'bg-slate-400') return 'bg-fg-subtle';
  if (base === 'bg-slate-500') return 'bg-fg-muted';
  if (base === 'bg-slate-600') return 'bg-surface-strong';
  if (base === 'bg-slate-700') return 'bg-surface-header-muted';
  if (base === 'bg-slate-800') return 'bg-surface-header-elevated';
  if (base === 'bg-slate-900' || base === 'bg-slate-950') {
    if (opNum !== null && opNum <= 85) {
      return 'bg-surface-overlay';
    }
    return 'bg-surface-header';
  }

  // 2. Borders, Dividers & Rings (`border-*`, `divide-*`, `ring-*`)
  for (const prop of ['border', 'divide', 'ring']) {
    if (base === `${prop}-slate-100` || base === `${prop}-gray-100`) return `${prop}-border-faint`;
    if (base === `${prop}-slate-200` || base === `${prop}-gray-200`) return `${prop}-border-subtle`;
    if (base === `${prop}-slate-300` || base === `${prop}-gray-300`) return `${prop}-border-strong`;
    if (base === `${prop}-slate-400` || base === `${prop}-gray-400`) return `${prop}-border-emphasis`;
    if (base === `${prop}-slate-700` || base === `${prop}-slate-800`) return `${prop}-border-header`;

    if (
      base === `${prop}-emerald-200` ||
      base === `${prop}-emerald-300` ||
      base === `${prop}-green-200` ||
      base === `${prop}-green-300` ||
      base === `${prop}-teal-200` ||
      base === `${prop}-teal-300`
    ) {
      return `${prop}-status-success-border`;
    }
    if (
      base === `${prop}-amber-200` ||
      base === `${prop}-amber-300` ||
      base === `${prop}-amber-400` ||
      base === `${prop}-yellow-200` ||
      base === `${prop}-yellow-300`
    ) {
      return `${prop}-status-warning-border`;
    }
    if (
      base === `${prop}-rose-200` ||
      base === `${prop}-rose-300` ||
      base === `${prop}-red-200` ||
      base === `${prop}-red-300`
    ) {
      return `${prop}-status-danger-border`;
    }
    if (
      base === `${prop}-blue-200` ||
      base === `${prop}-blue-300` ||
      base === `${prop}-sky-200` ||
      base === `${prop}-sky-300` ||
      base === `${prop}-cyan-200` ||
      base === `${prop}-cyan-300`
    ) {
      return `${prop}-status-info-border`;
    }
    if (
      base === `${prop}-indigo-200` ||
      base === `${prop}-indigo-300` ||
      base === `${prop}-purple-200` ||
      base === `${prop}-purple-300` ||
      base === `${prop}-violet-100` ||
      base === `${prop}-violet-200` ||
      base === `${prop}-violet-300` ||
      base === `${prop}-violet-400`
    ) {
      return `${prop}-status-staged-border`;
    }
  }

  // Directional slate borders (`border-t-slate-200`, etc.)
  const dirBorderMatch = base.match(/^border-([trblxy])-slate-(100|200|300|700|800)$/);
  if (dirBorderMatch) {
    const [, dir, shade] = dirBorderMatch;
    if (shade === '100') return `border-${dir}-border-faint`;
    if (shade === '200') return `border-${dir}-border-subtle`;
    if (shade === '300') return `border-${dir}-border-strong`;
    return `border-${dir}-border-header`;
  }

  // 3. Foregrounds (`text-*`)
  if (base === 'text-slate-900' || base === 'text-gray-900') return 'text-fg-primary';
  if (base === 'text-slate-800' || base === 'text-gray-800') return 'text-fg-strong';
  if (
    base === 'text-slate-700' ||
    base === 'text-slate-600' ||
    base === 'text-gray-700' ||
    base === 'text-gray-600'
  ) {
    return 'text-fg-secondary';
  }
  if (base === 'text-slate-500' || base === 'text-gray-500') return 'text-fg-muted';
  if (base === 'text-slate-400' || base === 'text-gray-400') return 'text-fg-subtle';
  if (base === 'text-slate-200' || base === 'text-slate-100') return 'text-fg-on-header';

  // Soft Status Foregrounds (`text-*-700` / `800` / `900` / `950`)
  if (
    base === 'text-emerald-700' ||
    base === 'text-emerald-800' ||
    base === 'text-emerald-900' ||
    base === 'text-emerald-950' ||
    base === 'text-green-700' ||
    base === 'text-green-800' ||
    base === 'text-teal-700' ||
    base === 'text-teal-800' ||
    base === 'text-teal-900'
  ) {
    return 'text-status-success-fg';
  }
  if (
    base === 'text-amber-700' ||
    base === 'text-amber-800' ||
    base === 'text-amber-900' ||
    base === 'text-amber-950' ||
    base === 'text-yellow-800' ||
    base === 'text-yellow-900'
  ) {
    return 'text-status-warning-fg';
  }
  if (
    base === 'text-rose-700' ||
    base === 'text-rose-800' ||
    base === 'text-rose-900' ||
    base === 'text-rose-950' ||
    base === 'text-red-700' ||
    base === 'text-red-800' ||
    base === 'text-red-900'
  ) {
    return 'text-status-danger-fg';
  }
  if (
    base === 'text-blue-700' ||
    base === 'text-blue-800' ||
    base === 'text-blue-900' ||
    base === 'text-blue-950' ||
    base === 'text-sky-800' ||
    base === 'text-sky-900' ||
    base === 'text-cyan-700' ||
    base === 'text-cyan-800' ||
    base === 'text-cyan-900'
  ) {
    return 'text-status-info-fg';
  }
  if (
    base === 'text-indigo-700' ||
    base === 'text-indigo-800' ||
    base === 'text-indigo-900' ||
    base === 'text-indigo-950' ||
    base === 'text-purple-800' ||
    base === 'text-purple-900' ||
    base === 'text-violet-700' ||
    base === 'text-violet-800' ||
    base === 'text-violet-900' ||
    base === 'text-violet-950' ||
    base === 'text-fuchsia-800' ||
    base === 'text-fuchsia-900'
  ) {
    return 'text-status-staged-fg';
  }

  return null;
}

const TOKEN_REGEX =
  /(?<=["'`\s])((?:[a-z0-9-]+:)*)((?:bg|from|via|to|text|border(?:-[trblxy])?|divide|ring)-(?:white|(?:slate|gray|emerald|green|teal|amber|yellow|rose|red|blue|sky|cyan|indigo|purple|violet|fuchsia)-(?:50|100|200|300|400|500|600|700|800|900|950)))(\/\d{1,3})?(?=["'`\s])/g;

function transformSource(source) {
  let count = 0;
  const updated = source.replace(TOKEN_REGEX, (fullMatch, variantPrefix = '', base, opacity = '') => {
    if (variantPrefix.includes('dark:')) {
      return fullMatch;
    }
    const mapped = mapBaseToken(base, opacity);
    if (!mapped) return fullMatch;
    count += 1;
    return `${variantPrefix}${mapped}${opacity}`;
  });
  return { updated, count };
}

const files = [];
for (const arg of targetArgs) {
  collectFiles(arg, files);
}

let filesChanged = 0;
let totalReplacements = 0;

for (const filePath of files) {
  const original = fs.readFileSync(filePath, 'utf8');
  const { updated, count } = transformSource(original);
  if (count > 0 && updated !== original) {
    filesChanged += 1;
    totalReplacements += count;
    if (!dryRun) {
      fs.writeFileSync(filePath, updated, 'utf8');
    }
  }
}

console.log(
  `[codemod-dark-tokens] ${dryRun ? '(DRY RUN) ' : ''}Processed ${files.length} files, updated ${filesChanged} files (${totalReplacements} token replacements).`
);
