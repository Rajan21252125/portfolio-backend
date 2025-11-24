// script/fix-extensions.js  (ESM-compatible)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readTsconfigOutDir() {
  const cfgPath = path.join(__dirname, '..', 'tsconfig.json');
  if (!fs.existsSync(cfgPath)) return 'dist';
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    return cfg?.compilerOptions?.outDir || 'dist';
  } catch (e) {
    console.warn('Could not parse tsconfig.json, falling back to dist');
    return 'dist';
  }
}

const OUT = readTsconfigOutDir();
const DIST = path.resolve(__dirname, '..', OUT);

if (!fs.existsSync(DIST)) {
  console.error(`dist folder not found at "${DIST}"; run the build first`);
  process.exit(1);
}

const importRegex = /(from\s+['"]|import\(\s*['"])([^'"]+?)\.(ts|tsx|mts|cts)(['"]\s*\)?)/g;
const requireRegex = /(require\(\s*['"])([^'"]+?)\.(ts|tsx|mts|cts)(['"]\s*\))/g;

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      walk(p);
    } else if (p.endsWith('.js') || p.endsWith('.mjs') || p.endsWith('.cjs')) {
      let original = fs.readFileSync(p, 'utf8');
      let s = original;

      s = s.replace(importRegex, (m, p1, p2, ext, p4) => `${p1}${p2}.js${p4}`);
      s = s.replace(requireRegex, (m, p1, p2, ext, p4) => `${p1}${p2}.js${p4}`);

      if (s !== original) {
        fs.writeFileSync(p, s, 'utf8');
        console.log(`Patched imports in ${path.relative(DIST, p)}`);
      }
    }
  }
}

walk(DIST);
console.log(`Done: fixed import extensions in "${OUT}"`);
