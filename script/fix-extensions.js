// script/fix-extensions.js  (ESM-compatible)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(DIST)) {
  console.error('dist folder not found; run the build first');
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
      let s = fs.readFileSync(p, 'utf8');

      // replace import/from and dynamic import(...) style
      s = s.replace(importRegex, (m, p1, p2, ext, p4) => `${p1}${p2}.js${p4}`);

      // replace require('...') if present
      s = s.replace(requireRegex, (m, p1, p2, ext, p4) => `${p1}${p2}.js${p4}`);

      // save only if changed
      if (s !== fs.readFileSync(p, 'utf8')) {
        fs.writeFileSync(p, s, 'utf8');
        console.log(`Patched imports in ${path.relative(DIST, p)}`);
      }
    }
  }
}

walk(DIST);
console.log('Done: fixed import extensions in dist');
