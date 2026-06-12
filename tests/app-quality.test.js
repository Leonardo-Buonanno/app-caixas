const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function checkScript(relativePath) {
  const result = spawnSync(process.execPath, ["--check", relativePath], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("arquivos JavaScript principais continuam validos", () => {
  checkScript("app.js");
  checkScript("server.js");
  checkScript("service-worker.js");
});

test("textos visiveis nao contem acentuacao quebrada", () => {
  const app = read("app.js");
  const html = read("index.html");
  const visibleFiles = `${app}\n${html}`;

  assert.doesNotMatch(visibleFiles, /[ÃÂ]/);
  assert.doesNotMatch(visibleFiles, /C\?digo|c\?digo|Hist\?rico|Relat\?rio|Fr\?gil|Empilh\?vel/);
  assert.doesNotMatch(visibleFiles, /sele\?\?o|produ\?\?o|ocupa\?\?o|orienta\?\?o|visualiza\?\?o/);
  assert.match(html, /Código de barras/);
  assert.match(html, /Histórico de cálculos/);
  assert.match(app, /Não foi possível/);
});

test("PWA esta configurado para instalacao e uso offline", () => {
  const index = read("index.html");
  const manifest = JSON.parse(read("manifest.webmanifest"));
  const serviceWorker = read("service-worker.js");

  assert.match(index, /rel="manifest"/);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./index.html");
  assert.ok(Array.isArray(manifest.icons));
  assert.ok(manifest.icons.length >= 2);
  assert.match(serviceWorker, /CACHE_NAME/);
  assert.match(serviceWorker, /CORE_ASSETS/);
  assert.match(serviceWorker, /three\.module\.js/);
});

test("recursos de maturidade operacional estao presentes", () => {
  const index = read("index.html");
  const app = read("app.js");

  assert.match(index, /id="production-mode-toggle"/);
  assert.match(index, /id="auto-backup-info"/);
  assert.match(index, /id="audit-log-list"/);
  assert.match(app, /function setProductionMode/);
  assert.match(app, /function writeAutoBackup/);
  assert.match(app, /function addAuditLog/);
  assert.match(app, /function exportAuditLogCsv/);
  assert.match(app, /function syncStateFromServer/);
  assert.match(app, /function syncStateToServer/);
  assert.match(app, /AUDIT_LOG_RESET_AT/);
});

test("historico individual nao exibe exclusao direta", () => {
  const app = read("app.js");

  assert.doesNotMatch(app, /history-delete-button/);
  assert.doesNotMatch(app, /data-history-action="delete"/);
  assert.doesNotMatch(app, /function deleteHistoryRecord\(/);
});

test("aba de codigo de barras ordena comandos em ordem decrescente", () => {
  const app = read("app.js");
  const html = read("index.html");
  const styles = read("styles.css");

  assert.match(app, /function getFinalizerBarcodeCommands/);
  assert.match(app, /getFinalizerBarcodeCommands\(\)\.map\(renderBarcodeCommandCard\)/);
  assert.match(app, /b\.barcode\.localeCompare\(a\.barcode/);
  assert.match(app, /data-command-print/);
  assert.match(app, /function handleFinalizerCommandListClick/);
  assert.match(app, /finalizer-single-printing/);
  assert.doesNotMatch(html, /id="finalizer-print-button"/);
  assert.match(styles, /body\.finalizer-single-printing \.finalizer-print-card:not\(\[data-print-selected\]\)/);
});

test("botao de remover leitura possui estilo dedicado", () => {
  const app = read("app.js");
  const styles = read("styles.css");

  assert.match(app, /class="icon-button barcode-remove-button"/);
  assert.match(app, /title="Remover leitura"/);
  assert.match(styles, /grid-template-columns: repeat\(auto-fit, minmax\(96px, 1fr\)\) 44px/);
  assert.match(styles, /\.barcode-option-grid \.barcode-remove-button \{/);
  assert.match(styles, /min-height: 42px/);
  assert.match(styles, /background: #fffafa/);
});

test("servidor possui persistencia de estado em arquivo", () => {
  const server = read("server.js");

  assert.match(server, /app-state\.json/);
  assert.match(server, /\/api\/state/);
  assert.match(server, /function saveAppState/);
  assert.match(server, /function backupCurrentAppState/);
  assert.match(server, /function pruneStateBackups/);
});

test("servidor aplica regras basicas de seguranca", () => {
  const server = read("server.js");
  const app = read("app.js");

  assert.match(server, /Content-Security-Policy/);
  assert.match(server, /frame-ancestors 'none'/);
  assert.match(server, /X-Content-Type-Options/);
  assert.match(server, /Referrer-Policy/);
  assert.match(server, /Permissions-Policy/);
  assert.match(server, /function isPublicAssetPath/);
  assert.match(server, /function validateApiRequest/);
  assert.match(server, /function isJsonContentType/);
  assert.match(server, /function isSameOriginRequest/);
  assert.match(server, /Cache-Control": "no-store"/);
  assert.match(app, /\/api\/history\.csv/);
  assert.doesNotMatch(app, /\/data\/historico-calculos\.csv/);
});

test("documentacao operacional e inicializador estao presentes", () => {
  const guide = read("docs/guia-operacao.md");
  const launcher = read("iniciar-app.bat");
  const packageJson = JSON.parse(read("package.json"));

  assert.match(guide, /Separar um pedido/);
  assert.match(guide, /Backup e recuperacao/);
  assert.match(launcher, /npm start/);
  assert.ok(packageJson.scripts["test:e2e"]);
});

test("codigos de comando do leitor continuam reservados", () => {
  const app = read("app.js");
  [
    "9999999999999",
    "9999999999998",
    "9999999999997",
    "9999999999996",
    "9999999999901",
    "9999999999902",
    "9999999999903",
    "9999999999904",
    "9999999999905",
  ].forEach((barcode) => assert.match(app, new RegExp(barcode)));
});
