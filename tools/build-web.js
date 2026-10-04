// Packs the game into one self-contained web page: every script, the
// stylesheet and the fonts (as data URIs) inlined. No server needed.
//   npm run build:web      → dist/web/index.html (full page, open locally or host anywhere)
//                           → dist/web/echo-artifact.html (body-only, for claude.ai hosting)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist', 'web');

const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');

// Stylesheet with fonts embedded
let css = fs.readFileSync(path.join(SRC, 'css', 'style.css'), 'utf8');
css = css.replace(/url\('\.\.\/fonts\/([^']+)'\)/g, (_, f) => {
  const b64 = fs.readFileSync(path.join(SRC, 'fonts', f)).toString('base64');
  return `url(data:font/woff2;base64,${b64})`;
});
// The page commits to one dark look; tell the browser so form controls match.
css = ':root { color-scheme: dark; }\n' + css;

// Scripts in the order index.html loads them
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const js = scripts.map(s => {
  const code = fs.readFileSync(path.join(SRC, s), 'utf8');
  return `// ---- ${s}\n${code.replace(/<\/script/gi, '<\\/script')}`;
}).join('\n');

// Body markup (everything between <body> and the first script tag)
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script')).trim();

const title = '<title>ECHO</title>';
const inner = `${title}
<style>
${css}
</style>
${body}
<script>
${js}
</script>
`;

const full = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
</head>
<body>
${inner}</body>
</html>
`;

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), full);
fs.writeFileSync(path.join(OUT, 'echo-artifact.html'), inner);
console.log(`Wrote dist/web/index.html (${(full.length / 1024).toFixed(0)} KB) from ${scripts.length} scripts.`);
