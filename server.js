const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT) || 3000;
const root = __dirname;
const historyDirectory = path.join(root, "data");
const historyFile = path.join(historyDirectory, "historico-calculos.csv");
const appStateFile = path.join(historyDirectory, "app-state.json");
const appStateBackupDirectory = path.join(historyDirectory, "state-backups");
const stateBackupLimit = 5;
const jsonBodyLimitBytes = 5 * 1024 * 1024;
const publicFiles = new Set([
  "app.js",
  "index.html",
  "manifest.webmanifest",
  "service-worker.js",
  "styles.css",
  path.join("node_modules", "three", "build", "three.core.js"),
  path.join("node_modules", "three", "build", "three.module.js"),
]);
const publicAssetExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico"]);
const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), serial=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};
const historyColumns = [
  "id_calculo",
  "data_calculo",
  "produtos_selecionados",
  "total_produtos",
  "quantidade_caixas",
  "caixas_usadas",
  "ocupacao_media_percentual",
  "peso_total_kg",
  "produtos_sem_caixa",
  "detalhes_caixas",
  "referencia",
  "responsavel",
];

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png",
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    handleApiRequest(request, response, url);
    return;
  }

  if (!["GET", "HEAD"].includes(request.method)) {
    sendText(response, 405, "Method not allowed", {
      Allow: "GET, HEAD",
    });
    return;
  }

  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(root, pathname));
  const relativePath = path.relative(root, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  if (!isPublicAssetPath(relativePath)) {
    sendText(response, 404, "Not found");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendText(response, 404, "Not found");
      return;
    }

    writeSecureHead(response, 200, {
      "Cache-Control": getCacheControl(filePath),
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(request.method === "HEAD" ? undefined : content);
  });
});

server.listen(port, () => {
  console.log(`Calculadora de Caixas: http://localhost:${port}`);
});

async function handleApiRequest(request, response, url) {
  try {
    if (!validateApiRequest(request, response)) {
      return;
    }

    if (url.pathname === "/api/state" && request.method === "GET") {
      const storedState = await readAppState();
      sendJson(response, 200, storedState || { state: null });
      return;
    }

    if (url.pathname === "/api/state" && request.method === "PUT") {
      const statePayload = await readJsonBody(request);
      const saved = await saveAppState(statePayload);
      sendJson(response, 200, {
        ok: true,
        savedAt: saved.savedAt,
        file: path.relative(root, appStateFile),
      });
      return;
    }

    if (url.pathname === "/api/history" && request.method === "POST") {
      const record = await readJsonBody(request);
      await saveHistoryRecord(record);
      sendJson(response, 200, {
        ok: true,
        file: path.relative(root, historyFile),
      });
      return;
    }

    if (url.pathname === "/api/history.csv" && request.method === "GET") {
      const csv = await readHistoryCsv();
      sendCsv(response, 200, csv || "sep=;\n");
      return;
    }

    if (url.pathname.startsWith("/api/history/") && request.method === "DELETE") {
      const id = decodeURIComponent(url.pathname.replace("/api/history/", ""));
      if (!isSafeRecordId(id)) {
        sendJson(response, 400, { error: "Invalid history id" });
        return;
      }
      await deleteHistoryRecord(id);
      sendJson(response, 200, {
        ok: true,
        file: path.relative(root, historyFile),
      });
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      error: error.expose ? error.message : "Internal server error",
    });
  }
}

function validateApiRequest(request, response) {
  if (request.method === "OPTIONS") {
    sendText(response, 405, "Method not allowed", {
      Allow: "GET, POST, PUT, DELETE",
    });
    return false;
  }

  if (isMutatingMethod(request.method) && !isSameOriginRequest(request)) {
    sendJson(response, 403, { error: "Forbidden" });
    return false;
  }

  if (["POST", "PUT"].includes(request.method) && !isJsonContentType(request.headers["content-type"])) {
    sendJson(response, 415, { error: "Content-Type must be application/json" });
    return false;
  }

  return true;
}

function isMutatingMethod(method) {
  return ["DELETE", "PATCH", "POST", "PUT"].includes(method);
}

function isSameOriginRequest(request) {
  const origin = request.headers.origin;
  if (origin) {
    const expectedOrigin = `${request.socket.encrypted ? "https" : "http"}://${request.headers.host}`;
    if (origin !== expectedOrigin) {
      return false;
    }
  }

  const fetchSite = request.headers["sec-fetch-site"];
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "none";
}

function isJsonContentType(contentType) {
  return /^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i.test(String(contentType || ""));
}

function isSafeRecordId(id) {
  return /^[A-Za-z0-9_.:-]+$/.test(String(id || ""));
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = true;
  return error;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;
    let settled = false;

    const fail = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };

    request.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > jsonBodyLimitBytes) {
        fail(createHttpError(413, "Payload too large"));
        request.destroy();
        return;
      }
      body += chunk;
    });

    request.on("end", () => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(createHttpError(400, "Invalid JSON"));
      }
    });

    request.on("error", (error) => {
      if (!settled) {
        fail(error);
      }
    });
  });
}

async function readAppState() {
  try {
    const content = await fs.promises.readFile(appStateFile, "utf8");
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" ? parsed : { state: null };
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function saveAppState(payload) {
  const savedAt = new Date().toISOString();
  const normalized = {
    savedAt,
    appVersion: String(payload.appVersion || ""),
    reason: String(payload.reason || "alteracao_manual"),
    state: payload.state && typeof payload.state === "object" ? payload.state : {},
  };

  await fs.promises.mkdir(historyDirectory, { recursive: true });
  await backupCurrentAppState();
  const temporaryFile = `${appStateFile}.tmp`;
  await fs.promises.writeFile(temporaryFile, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  await fs.promises.rename(temporaryFile, appStateFile);
  await pruneStateBackups();
  return normalized;
}

async function backupCurrentAppState() {
  try {
    await fs.promises.access(appStateFile);
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  await fs.promises.mkdir(appStateBackupDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.promises.copyFile(appStateFile, path.join(appStateBackupDirectory, `app-state-${stamp}.json`));
}

async function pruneStateBackups() {
  try {
    const entries = await fs.promises.readdir(appStateBackupDirectory, { withFileTypes: true });
    const backups = entries
      .filter((entry) => entry.isFile() && /^app-state-.+\.json$/.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .reverse();

    await Promise.all(
      backups.slice(stateBackupLimit).map((name) => fs.promises.unlink(path.join(appStateBackupDirectory, name))),
    );
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function saveHistoryRecord(record) {
  const normalized = normalizeHistoryRecord(record);
  await fs.promises.mkdir(historyDirectory, { recursive: true });
  const lines = await readHistoryLines();
  const row = historyColumns.map((column) => escapeSpreadsheetCell(normalized[column])).join(";");
  const nextLines = [
    "sep=;",
    historyColumns.join(";"),
    ...lines
      .filter((line) => line && line !== "sep=;" && !line.startsWith("id_calculo;"))
      .filter((line) => !line.startsWith(`${normalized.id_calculo};`)),
    row,
  ];

  await fs.promises.writeFile(historyFile, `${nextLines.join("\n")}\n`, "utf8");
}

async function deleteHistoryRecord(id) {
  if (!id) {
    return;
  }

  await fs.promises.mkdir(historyDirectory, { recursive: true });
  const lines = await readHistoryLines();
  const nextLines = [
    "sep=;",
    historyColumns.join(";"),
    ...lines
      .filter((line) => line && line !== "sep=;" && !line.startsWith("id_calculo;"))
      .filter((line) => !line.startsWith(`${id};`)),
  ];

  await fs.promises.writeFile(historyFile, `${nextLines.join("\n")}\n`, "utf8");
}

async function readHistoryLines() {
  try {
    const content = await fs.promises.readFile(historyFile, "utf8");
    return content.split(/\r?\n/).filter(Boolean);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function readHistoryCsv() {
  try {
    return await fs.promises.readFile(historyFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function normalizeHistoryRecord(record) {
  return {
    id_calculo: String(record.id || ""),
    data_calculo: String(record.createdAt || ""),
    produtos_selecionados: String(record.selectedProducts || ""),
    total_produtos: String(record.totalProducts || 0),
    quantidade_caixas: String(record.boxesCount || 0),
    caixas_usadas: String(record.boxesUsed || ""),
    ocupacao_media_percentual: String(record.averageFillRatePercent || "0"),
    peso_total_kg: String(record.totalWeightKg || "0"),
    produtos_sem_caixa: String(record.unpackedProducts || ""),
    detalhes_caixas: String(record.boxDetails || ""),
    referencia: String(record.reference || ""),
    responsavel: String(record.user || ""),
  };
}

function escapeSpreadsheetCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[;"\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function isPublicAssetPath(relativePath) {
  const normalized = path.normalize(relativePath);
  if (publicFiles.has(normalized)) {
    return true;
  }

  const assetPrefix = `assets${path.sep}`;
  return normalized.startsWith(assetPrefix) && publicAssetExtensions.has(path.extname(normalized).toLowerCase());
}

function getCacheControl(filePath) {
  const filename = path.basename(filePath);
  if (filename === "index.html" || filename === "service-worker.js") {
    return "no-cache";
  }
  return "public, max-age=3600";
}

function writeSecureHead(response, statusCode, headers = {}) {
  response.writeHead(statusCode, {
    ...securityHeaders,
    ...headers,
  });
}

function sendText(response, statusCode, message, headers = {}) {
  writeSecureHead(response, statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    ...headers,
  });
  response.end(message);
}

function sendCsv(response, statusCode, csv) {
  writeSecureHead(response, statusCode, {
    "Cache-Control": "no-store",
    "Content-Disposition": 'attachment; filename="historico-calculos.csv"',
    "Content-Type": "text/csv; charset=utf-8",
  });
  response.end(csv);
}

function sendJson(response, statusCode, payload) {
  writeSecureHead(response, statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}
