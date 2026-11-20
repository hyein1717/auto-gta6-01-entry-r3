// EMBER BAY — hand-in program (Node 22, standard library only).
//
// The game itself is this directory's game/ folder: plain static files a
// desktop browser loads fully offline (game/index.html, its ES modules, and
// the vendored three.js build under game/vendor/). This program hands the
// entry in: it copies game/ and screenshots/ from beside this file to the
// output directory and writes dossier.json — the summary the judge reads —
// with the vendored make.fun library, which must stay byte-identical.
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const GAME_TITLE = 'EMBER BAY';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Counts files and bytes under a directory, recursively — the manifest this
// program reports is computed from the real tree, never hard-coded.
function measureTree(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = measureTree(full);
      files += sub.files;
      bytes += sub.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += statSync(full).size;
    }
  }
  return { files, bytes };
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

const gameMeasure = measureTree(join(here, 'game'));
const shotMeasure = existsSync(join(here, 'screenshots'))
  ? measureTree(join(here, 'screenshots'))
  : { files: 0, bytes: 0 };
// The vendored three.js build dominates the byte count; naming it keeps the
// manifest honest about how much of the entry is engine and how much is game.
const engineBytes = statSync(join(here, 'game', 'vendor', 'three.module.min.js')).size;
console.log(
  `${GAME_TITLE} hand-in: ${gameMeasure.files} game files (${gameMeasure.bytes} bytes, ` +
  `${engineBytes} of them the vendored three.js engine), ` +
  `${shotMeasure.files} screenshots (${shotMeasure.bytes} bytes) -> ${out}`,
);

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
