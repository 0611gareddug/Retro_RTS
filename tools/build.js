// Retro RTS 빌드: src/ → index.html + game.js (압축·난독화)
// 사용법: node tools/build.js [--dev]
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'src');
const ORDER = ['core', 'data', 'map', 'sprites', 'sim', 'ai', 'render', 'audio', 'ui', 'input', 'tutorial', 'net', 'main', 'guard'];
const dev = process.argv.includes('--dev');
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(SRC, 'style.css'), 'utf8');

if (dev) {
  const out = html.replace('<!--STYLE-->', '<link rel="stylesheet" href="src/style.css">')
    .replace('<!--SCRIPT-->', ORDER.map((f) => `<script src="src/${f}.js"></script>`).join('\n'));
  fs.writeFileSync(path.join(ROOT, 'dev.html'), out);
  console.log('dev.html 생성');
  process.exit(0);
}

let ts = null;
for (const p of ['typescript', '/opt/npm-tools/node_modules/typescript']) { try { ts = require(p); break; } catch (e) { /* 다음 */ } }
let code = 'window.R=window.R||{};window.R.PROD_BUILD=true;\n' + ORDER.map((f) => fs.readFileSync(path.join(SRC, f + '.js'), 'utf8')).join('\n;\n');
if (ts) {
  code = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020, removeComments: true, module: ts.ModuleKind.None } }).outputText;
}
// 줄 앞 공백·빈 줄 제거
code = code.split('\n').map((l) => l.trim()).filter((l) => l.length).join('\n');
// XOR + base64 난독화
const key = crypto.randomBytes(16);
const buf = Buffer.from(code, 'utf8');
for (let i = 0; i < buf.length; i++) buf[i] ^= key[(i * 7 + (i >> 3)) % key.length];
const b64 = buf.toString('base64');
const loader = `(function(){var k=[${[...key].join(',')}],s=atob("${b64}"),n=s.length,b=new Uint8Array(n);for(var i=0;i<n;i++)b[i]=s.charCodeAt(i)^k[(i*7+(i>>3))%${key.length}];var c=new TextDecoder().decode(b);(new Function(c))();})();`;
fs.writeFileSync(path.join(ROOT, 'game.js'), loader);
const ver = crypto.createHash('md5').update(loader).digest('hex').slice(0, 8);
const minCss = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '').replace(/\s*([{};:,])\s*/g, '$1');
html = html.replace('<!--STYLE-->', `<style>${minCss}</style>`).replace('<!--SCRIPT-->', `<script src="game.js?v=${ver}"></script>`);
fs.writeFileSync(path.join(ROOT, 'index.html'), html);
console.log('index.html + game.js 생성', (loader.length / 1024).toFixed(0) + 'KB', 'v=' + ver);
