const STORAGE_KEY = "calculadora-caixas-state";
const AUTO_BACKUP_STORAGE_KEY = "calculadora-caixas-autobackups";
const APP_VERSION = "1.2.1";
const EPSILON = 0.0001;
const HISTORY_LIMIT = 30;
const AUDIT_LOG_LIMIT = 120;
const AUDIT_LOG_RESET_AT = "2026-05-18T15:26:59.270-03:00";
const AUTO_BACKUP_LIMIT = 5;
const SEARCH_DEBOUNCE_DELAY = 140;
const STATE_SAVE_DEBOUNCE_DELAY = 220;
const SERVER_STATE_SYNC_DELAY = 650;
const BARCODE_AUTO_SCAN_DELAY = 180;
const BARCODE_AMBIGUOUS_SCAN_DELAY = 900;
const ORIENTATION_CACHE_LIMIT = 800;
const UPRIGHT_ROTATION_STEP_DEGREES = 5;
const FREE_ROTATION_STEP_DEGREES = 10;
const RIGHT_ANGLE_DEGREES = 90;
const ORDER_END_BARCODE = "9999999999999";
const NEW_ORDER_BARCODE = "9999999999998";
const CLEAR_ORDER_BARCODE = "9999999999997";
const UNDO_LAST_READING_BARCODE = "9999999999996";
const LAST_READING_SINGLE_BARCODE = "9999999999901";
const QUANTITY_COMMANDS = [
  { barcode: "9999999999902", quantity: 2 },
  { barcode: "9999999999903", quantity: 3 },
  { barcode: "9999999999904", quantity: 4 },
  { barcode: "9999999999905", quantity: 5 },
];
const BARCODE_COMMANDS = [
  {
    action: "finish-order",
    barcode: ORDER_END_BARCODE,
    title: "Finalizar pedido",
    subtitle: "Calculadora de Caixas",
    ariaLabel: "Código de barras finalizador",
  },
  {
    action: "new-order",
    barcode: NEW_ORDER_BARCODE,
    title: "Novo pedido",
    subtitle: "Limpar e preparar leitura",
    ariaLabel: "Código de barras para novo pedido",
  },
  {
    action: "clear-order",
    barcode: CLEAR_ORDER_BARCODE,
    title: "Limpar pedido",
    subtitle: "Ler duas vezes para confirmar",
    ariaLabel: "Código de barras para limpar pedido",
  },
  {
    action: "undo-last-reading",
    barcode: UNDO_LAST_READING_BARCODE,
    title: "Desfazer leitura",
    subtitle: "Remove a ultima leitura",
    ariaLabel: "Código de barras para desfazer a última leitura",
  },
  {
    action: "last-reading-single",
    barcode: LAST_READING_SINGLE_BARCODE,
    title: "1 quantidade",
    subtitle: "Corrigir ultima leitura",
    ariaLabel: "Código de barras para 1 quantidade",
  },
  ...QUANTITY_COMMANDS.map((command) => ({
    action: "quantity",
    barcode: command.barcode,
    quantity: command.quantity,
    title: `${command.quantity} quantidades`,
    subtitle: "Quantidade por leitura",
    ariaLabel: `Código de barras para ${command.quantity} quantidades`,
  })),
];
const RESERVED_BARCODES = BARCODE_COMMANDS.map((command) => command.barcode);
const BARCODE_COMMAND_MAP = new Map(BARCODE_COMMANDS.map((command) => [command.barcode, command]));
const PRODUCT_NAME_CSV_ALIASES = ["name", "nome", "produto", "product", "descricao", "description"];
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232", "2331112",
];
const PRODUCT_FALL_START_DELAY_MS = 180;
const PRODUCT_FALL_DURATION_MS = 760;
const PRODUCT_FALL_STAGGER_FAST_MS = 240;
const PRODUCT_FALL_STAGGER_BASE_MS = 360;
const PRODUCT_FALL_STAGGER_SLOW_MS = 430;
const DEFAULT_SELECTION_OPTIONS = {
  canRotate: false,
  keepUpright: false,
  stackable: false,
  fragile: false,
};

const state = loadState();
const ptBrCollator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
const orientationCache = new Map();
let lastPacking = null;
let threeModulePromise = null;
let active3DViews = [];
let pending3DRenderObservers = [];
let barcodeScanTimer = null;
let audioContext = null;
let barcodeReadUndoStack = [];
let pendingUnknownBarcode = "";
let pendingClearOrderConfirmation = false;
let highlightedProductId = null;
let productCache = null;
let saveStateTimer = null;
let serverStateSyncTimer = null;
let lastServerStateSync = "";
let deferredInstallPrompt = null;

const elements = {
  boxCount: document.querySelector("#box-count"),
  productCount: document.querySelector("#product-count"),
  productionModeToggle: document.querySelector("#production-mode-toggle"),
  installAppButton: document.querySelector("#install-app-button"),
  tabButtons: document.querySelectorAll(".tab-button"),
  tabPanels: document.querySelectorAll(".tab-panel"),
  boxForm: document.querySelector("#box-form"),
  productForm: document.querySelector("#product-form"),
  boxFormTitle: document.querySelector("#box-form-title"),
  productFormTitle: document.querySelector("#product-form-title"),
  boxSubmitButton: document.querySelector("#box-submit-button"),
  productSubmitButton: document.querySelector("#product-submit-button"),
  boxCancelButton: document.querySelector("#box-cancel-button"),
  productCancelButton: document.querySelector("#product-cancel-button"),
  boxImportButton: document.querySelector("#box-import-button"),
  productImportButton: document.querySelector("#product-import-button"),
  productRemoveImportButton: document.querySelector("#product-remove-import-button"),
  boxImportInput: document.querySelector("#box-import-input"),
  productImportInput: document.querySelector("#product-import-input"),
  productRemoveImportInput: document.querySelector("#product-remove-import-input"),
  boxesList: document.querySelector("#boxes-list"),
  productsList: document.querySelector("#products-list"),
  selectionTable: document.querySelector("#selection-table"),
  productSearch: document.querySelector("#product-search"),
  productListSearch: document.querySelector("#product-list-search"),
  barcodeScanInput: document.querySelector("#barcode-scan-input"),
  barcodeScanMultiplier: document.querySelector("#barcode-scan-multiplier"),
  barcodeClearButton: document.querySelector("#barcode-clear-button"),
  barcodeCalculateButton: document.querySelector("#barcode-calculate-button"),
  barcodeScanStatus: document.querySelector("#barcode-scan-status"),
  barcodeScanCount: document.querySelector("#barcode-scan-count"),
  barcodeScanSummary: document.querySelector("#barcode-scan-summary"),
  barcodeUnknownActions: document.querySelector("#barcode-unknown-actions"),
  barcodeUnknownCode: document.querySelector("#barcode-unknown-code"),
  barcodeRegisterButton: document.querySelector("#barcode-register-button"),
  barcodeReadList: document.querySelector("#barcode-read-list"),
  calculateButton: document.querySelector("#calculate-button"),
  clearSelection: document.querySelector("#clear-selection"),
  exportCsvButton: document.querySelector("#export-csv-button"),
  reportButton: document.querySelector("#report-button"),
  printButton: document.querySelector("#print-button"),
  finalizerPrintButton: document.querySelector("#finalizer-print-button"),
  finalizerCommandList: document.querySelector("#finalizer-command-list"),
  results: document.querySelector("#results"),
  resultStatus: document.querySelector("#result-status"),
  historyList: document.querySelector("#history-list"),
  historyFilterSearch: document.querySelector("#history-filter-search"),
  historyFilterStart: document.querySelector("#history-filter-start"),
  historyFilterEnd: document.querySelector("#history-filter-end"),
  historyExportButton: document.querySelector("#history-export-button"),
  backupExportButton: document.querySelector("#backup-export-button"),
  backupFilterStart: document.querySelector("#backup-filter-start"),
  backupFilterEnd: document.querySelector("#backup-filter-end"),
  backupImportButton: document.querySelector("#backup-import-button"),
  backupImportInput: document.querySelector("#backup-import-input"),
  autoBackupInfo: document.querySelector("#auto-backup-info"),
  autoBackupExportButton: document.querySelector("#auto-backup-export-button"),
  auditLogList: document.querySelector("#audit-log-list"),
  auditExportButton: document.querySelector("#audit-export-button"),
};

const packingStrategies = [
  { name: "volume", order: "volume" },
  { name: "peso", order: "weight" },
  { name: "maior lado", order: "side" },
  { name: "area base", order: "base" },
];

const debouncedRenderSelectionTable = debounce(renderSelectionTable);
const debouncedRenderProductList = debounce(() => renderEntityList("products"));
const debouncedRenderHistory = debounce(renderHistory);

elements.tabButtons.forEach((button) => {
  button.addEventListener("click", () => activateTab(button.dataset.tab));
});

elements.boxForm.addEventListener("submit", (event) => {
  event.preventDefault();
  upsertBox(readBoxForm());
});

elements.productForm.addEventListener("submit", (event) => {
  event.preventDefault();
  upsertProduct(readProductForm());
});

elements.productForm.addEventListener("change", (event) => {
  if (event.target.name === "shape") {
    syncProductShapeFields();
  }
});

elements.boxCancelButton.addEventListener("click", resetBoxForm);
elements.productCancelButton.addEventListener("click", resetProductForm);

elements.boxImportButton.addEventListener("click", () => elements.boxImportInput.click());
elements.productImportButton.addEventListener("click", () => elements.productImportInput.click());
elements.productRemoveImportButton.addEventListener("click", () => elements.productRemoveImportInput.click());

elements.boxImportInput.addEventListener("change", () => importFromFile(elements.boxImportInput, "boxes"));
elements.productImportInput.addEventListener("change", () =>
  importFromFile(elements.productImportInput, "products"),
);
elements.productRemoveImportInput.addEventListener("change", () => removeProductsFromCsvFile(elements.productRemoveImportInput));

elements.productSearch.addEventListener("input", debouncedRenderSelectionTable);
elements.productListSearch.addEventListener("input", debouncedRenderProductList);
elements.productListSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    searchProductByScannedBarcode();
  }
});
elements.boxesList.addEventListener("click", handleEntityListClick);
elements.productsList.addEventListener("click", handleEntityListClick);
elements.selectionTable.addEventListener("click", handleSelectionTableClick);
elements.selectionTable.addEventListener("focusin", handleSelectionTableFocus);
elements.selectionTable.addEventListener("change", handleSelectionTableChange);
elements.selectionTable.addEventListener("input", handleSelectionTableInput);
elements.barcodeScanInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    clearBarcodeScanTimer();
    addBarcodeReading();
  }
});
elements.barcodeScanInput.addEventListener("input", scheduleBarcodeAutoReading);
elements.barcodeScanMultiplier.addEventListener("change", () => {
  elements.barcodeScanMultiplier.value = getBarcodeScanMultiplier();
  elements.barcodeScanInput.focus();
});
elements.barcodeClearButton.addEventListener("click", clearCurrentSelection);
elements.barcodeCalculateButton.addEventListener("click", () => calculateCurrentSelection({ scrollToResults: true }));
elements.barcodeRegisterButton.addEventListener("click", startQuickProductRegistrationFromBarcode);
elements.barcodeReadList.addEventListener("click", handleBarcodeReadListClick);
elements.barcodeReadList.addEventListener("focusin", handleBarcodeReadListFocus);
elements.barcodeReadList.addEventListener("input", handleBarcodeReadListInput);
elements.barcodeReadList.addEventListener("change", handleBarcodeReadListChange);
elements.historyList.addEventListener("click", handleHistoryListClick);
elements.historyFilterSearch.addEventListener("input", debouncedRenderHistory);
elements.historyFilterStart.addEventListener("input", debouncedRenderHistory);
elements.historyFilterEnd.addEventListener("input", debouncedRenderHistory);
elements.backupFilterStart.addEventListener("input", syncBackupDateFields);
elements.backupFilterEnd.addEventListener("input", syncBackupDateFields);

elements.calculateButton.addEventListener("click", () => calculateCurrentSelection({ scrollToResults: true }));
document.addEventListener("keydown", handleKeyboardShortcuts);
document.addEventListener("fullscreenchange", sync3DFullscreenState);
window.addEventListener("pagehide", flushPendingStateSave);
window.addEventListener("beforeunload", flushPendingStateSave);

function calculateCurrentSelection(options = {}) {
  const selected = getSelectedItems();
  const result = calculatePacking(state.boxes, selected);
  lastPacking = { result, selectedProducts: selected };
  renderResults(result, selected, { animate3D: true });
  addAuditLog(result.error ? "calculo_com_erro" : "calculo_realizado", result.error || `${selected.length} produto(s), ${result.packedBoxes.length} caixa(s).`, {
    persist: Boolean(result.error),
  });
  addHistoryRecord(result, selected);
  if (options.scrollToResults) {
    scrollToResult3D();
  }
  elements.barcodeScanInput.focus({ preventScroll: true });
  return result;
}

function scrollToResult3D() {
  requestAnimationFrame(() => {
    const target = elements.results.querySelector(".box-3d-view") || elements.results;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

elements.clearSelection.addEventListener("click", clearCurrentSelection);

function clearCurrentSelection() {
  const totalBeforeClear = Object.values(state.selection).reduce((sum, quantity) => sum + Math.max(0, Math.floor(Number(quantity) || 0)), 0);
  clearSelectionState();
  if (totalBeforeClear > 0) {
    addAuditLog("pedido_limpo", `${totalBeforeClear} unidade(s) removida(s) da seleção.`);
  }
  commit();
  renderInitialResult();
  setBarcodeScanStatus("Aguardando leitura.", "pending");
  elements.barcodeScanInput.value = "";
  elements.barcodeScanInput.focus();
}

function clearSelectionState() {
  state.selection = {};
  barcodeReadUndoStack = [];
  setPendingUnknownBarcode("");
  resetClearOrderConfirmation();
  highlightedProductId = null;
}

function clearCurrentSelectionWithConfirmation() {
  const hasSelection = Object.values(state.selection).some((quantity) => Number(quantity) > 0);
  if (!hasSelection) {
    setBarcodeScanStatus("Nenhum produto selecionado para limpar.", "pending");
    focusBarcodeScanner();
    return;
  }

  const confirmed = window.confirm("Limpar todos os produtos selecionados e leituras atuais?");
  if (confirmed) {
    clearCurrentSelection();
  }
}

elements.exportCsvButton.addEventListener("click", exportLastResultCsv);
elements.reportButton.addEventListener("click", printLastSeparationReport);
elements.printButton.addEventListener("click", printLastResult);
if (elements.finalizerPrintButton) {
  elements.finalizerPrintButton.addEventListener("click", () => printFinalizerBarcode());
}
elements.finalizerCommandList.addEventListener("click", handleFinalizerCommandListClick);
elements.historyExportButton.addEventListener("click", exportFullHistoryCsv);
elements.backupExportButton.addEventListener("click", exportBackupJson);
elements.autoBackupExportButton.addEventListener("click", exportLatestAutoBackupJson);
elements.backupImportButton.addEventListener("click", () => elements.backupImportInput.click());
elements.backupImportInput.addEventListener("change", importBackupJson);
elements.auditExportButton.addEventListener("click", exportAuditLogCsv);
elements.productionModeToggle.addEventListener("click", () => setProductionMode(!state.appSettings.productionMode));
elements.installAppButton.addEventListener("click", installApp);
window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
window.addEventListener("appinstalled", handleAppInstalled);

render();
renderFinalizerBarcode();
setResultStatus("Aguardando cálculo", "pending");
syncProductShapeFields();
syncBackupDateFields();
applyProductionMode();
registerServiceWorker();
runWhenIdle(syncStateFromServer);
runWhenIdle(() => writeAutoBackup("abertura"));
runWhenIdle(syncAllHistoryRecordsToSpreadsheet);

function activateTab(tabName) {
  elements.tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });
  elements.tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === `${tabName}-panel`);
  });
}

function readBoxForm() {
  const form = elements.boxForm;
  return normalizeBox({
    id: getField(form, "id").value || createId(),
    name: getField(form, "name").value.trim(),
    width: getField(form, "width").value,
    height: getField(form, "height").value,
    length: getField(form, "length").value,
    maxWeight: getField(form, "maxWeight").value,
    stock: getField(form, "stock").value,
  });
}

function readProductForm() {
  const form = elements.productForm;
  const shape = getField(form, "shape").value;
  return normalizeProduct({
    id: getField(form, "id").value || createId(),
    name: getField(form, "name").value.trim(),
    barcode: getField(form, "barcode").value.trim(),
    weight: getField(form, "weight").value,
    shape,
    width: getField(form, "width").value,
    height: getField(form, "height").value,
    length: getField(form, "length").value,
    diameter: getField(form, "diameter").value,
  });
}

function getField(form, name) {
  return form.elements.namedItem(name);
}

function upsertBox(box) {
  const index = state.boxes.findIndex((item) => item.id === box.id);
  const action = index >= 0 ? "caixa_atualizada" : "caixa_cadastrada";
  const now = new Date().toISOString();
  if (index >= 0) {
    state.boxes[index] = normalizeBox({
      ...box,
      createdAt: state.boxes[index].createdAt,
      updatedAt: now,
    });
  } else {
    state.boxes.push(normalizeBox({
      ...box,
      createdAt: box.createdAt || now,
      updatedAt: box.updatedAt || now,
    }));
  }
  addAuditLog(action, box.name);
  resetBoxForm();
  commit();
  renderInitialResult();
}

function upsertProduct(product) {
  if (isReservedBarcode(product.barcode)) {
    window.alert(`O código de barras ${product.barcode} está reservado para comandos do leitor.`);
    return;
  }

  const duplicateBarcode = findDuplicateProductBarcode(product.barcode, product.id);
  if (duplicateBarcode) {
    window.alert(`O código de barras ${product.barcode} já está cadastrado no produto "${duplicateBarcode.name}".`);
    return;
  }

  const index = state.products.findIndex((item) => item.id === product.id);
  const action = index >= 0 ? "produto_atualizado" : "produto_cadastrado";
  const now = new Date().toISOString();
  if (index >= 0) {
    state.products[index] = normalizeProduct({
      ...product,
      createdAt: state.products[index].createdAt,
      updatedAt: now,
    });
  } else {
    state.products.push(normalizeProduct({
      ...product,
      createdAt: product.createdAt || now,
      updatedAt: product.updatedAt || now,
    }));
  }
  invalidateProductCache();
  addAuditLog(action, product.barcode ? `${product.name} (${product.barcode})` : product.name);
  const savedBarcode = normalizeBarcode(product.barcode);
  resetProductForm();
  commit();
  renderInitialResult();
  if (savedBarcode && savedBarcode === pendingUnknownBarcode) {
    setPendingUnknownBarcode("");
    setBarcodeScanStatus(`Produto cadastrado para o código ${savedBarcode}.`, "ready");
  }
}

function editBox(id) {
  const box = state.boxes.find((item) => item.id === id);
  if (!box) {
    return;
  }

  getField(elements.boxForm, "id").value = box.id;
  getField(elements.boxForm, "name").value = box.name;
  getField(elements.boxForm, "width").value = box.width;
  getField(elements.boxForm, "height").value = box.height;
  getField(elements.boxForm, "length").value = box.length;
  getField(elements.boxForm, "maxWeight").value = box.maxWeight || "";
  getField(elements.boxForm, "stock").value = box.stock ?? "";
  elements.boxFormTitle.textContent = "Editar caixa";
  elements.boxSubmitButton.textContent = "Salvar caixa";
  elements.boxCancelButton.classList.remove("hidden");
  activateTab("boxes");
}

function editProduct(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product) {
    return;
  }

  getField(elements.productForm, "id").value = product.id;
  getField(elements.productForm, "name").value = product.name;
  getField(elements.productForm, "barcode").value = product.barcode || "";
  getField(elements.productForm, "weight").value = product.weight;
  getField(elements.productForm, "shape").value = product.shape || "box";
  getField(elements.productForm, "width").value = product.width;
  getField(elements.productForm, "height").value = product.height;
  getField(elements.productForm, "length").value = product.length;
  getField(elements.productForm, "diameter").value = product.diameter || "";
  syncProductShapeFields();
  elements.productFormTitle.textContent = "Editar produto";
  elements.productSubmitButton.textContent = "Salvar produto";
  elements.productCancelButton.classList.remove("hidden");
  activateTab("products");
}

function resetBoxForm() {
  elements.boxForm.reset();
  getField(elements.boxForm, "id").value = "";
  elements.boxFormTitle.textContent = "Adicionar caixa";
  elements.boxSubmitButton.textContent = "Adicionar caixa";
  elements.boxCancelButton.classList.add("hidden");
}

function resetProductForm() {
  elements.productForm.reset();
  getField(elements.productForm, "id").value = "";
  syncProductShapeFields();
  elements.productFormTitle.textContent = "Adicionar produto";
  elements.productSubmitButton.textContent = "Adicionar produto";
  elements.productCancelButton.classList.add("hidden");
}

function syncProductShapeFields() {
  const shapeField = getField(elements.productForm, "shape");
  if (!shapeField) {
    return;
  }

  const isRound = shapeField.value === "round";
  elements.productForm.querySelectorAll(".product-rect-field").forEach((field) => {
    const input = field.querySelector("input");
    field.classList.toggle("hidden", isRound);
    if (input) {
      input.disabled = isRound;
      input.required = !isRound;
    }
  });
  elements.productForm.querySelectorAll(".product-round-field").forEach((field) => {
    const input = field.querySelector("input");
    field.classList.toggle("hidden", !isRound);
    if (input) {
      input.disabled = !isRound;
      input.required = isRound;
    }
  });
}

function syncBackupDateFields() {
  elements.backupFilterEnd.min = elements.backupFilterStart.value || "";
  elements.backupFilterStart.max = elements.backupFilterEnd.value || "";
}

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadState() {
  const fallback = {
    boxes: [],
    products: [],
    selection: {},
    selectionOptions: {},
    calculationMeta: {
      reference: "",
      user: "",
    },
    history: [],
    auditLog: [],
    appSettings: {
      productionMode: false,
    },
    stateUpdatedAt: "1970-01-01T00:00:00.000Z",
  };

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const loaded = saved ? JSON.parse(saved) : fallback;
    return normalizeState({ ...fallback, ...loaded });
  } catch {
    return normalizeState(fallback);
  }
}

function normalizeState(rawState) {
  const products = Array.isArray(rawState.products)
    ? rawState.products.map(normalizeProduct).filter((product) => hasValidDimensions(product) && !isReservedBarcode(product.barcode))
    : [];
  const productIds = new Set(products.map((product) => product.id));
  const selection = {};
  const selectionOptions = {};

  Object.entries(rawState.selection || {}).forEach(([id, quantity]) => {
    if (productIds.has(id)) {
      const parsed = Math.max(0, Math.floor(toNumber(quantity, 0)));
      if (parsed > 0) {
        selection[id] = parsed;
      }
    }
  });

  Object.entries(rawState.selectionOptions || {}).forEach(([id, options]) => {
    if (productIds.has(id)) {
      selectionOptions[id] = normalizeSelectionOptions(options);
    }
  });

  return {
    boxes: Array.isArray(rawState.boxes)
      ? rawState.boxes.map(normalizeBox).filter(hasValidDimensions)
      : [],
    products,
    selection,
    selectionOptions,
    calculationMeta: normalizeCalculationMeta(rawState.calculationMeta),
    history: normalizeHistory(rawState.history),
    auditLog: normalizeAuditLog(rawState.auditLog),
    appSettings: normalizeAppSettings(rawState.appSettings),
    stateUpdatedAt: normalizeDateString(rawState.stateUpdatedAt || rawState.updatedAt, "1970-01-01T00:00:00.000Z"),
  };
}

function normalizeAuditLog(auditLog) {
  if (!Array.isArray(auditLog)) {
    return [];
  }

  const resetTimestamp = new Date(AUDIT_LOG_RESET_AT).getTime();
  return auditLog
    .filter((record) => record && record.action)
    .filter((record) => {
      const createdAt = new Date(record.createdAt).getTime();
      return !Number.isFinite(resetTimestamp) || !Number.isFinite(createdAt) || createdAt > resetTimestamp;
    })
    .slice(0, AUDIT_LOG_LIMIT)
    .map((record) => ({
      id: record.id || createId(),
      createdAt: normalizeDateString(record.createdAt, inferDateFromId(record.id) || new Date().toISOString()),
      action: String(record.action || "").trim(),
      detail: String(record.detail || "").trim(),
    }));
}

function normalizeAppSettings(settings) {
  return {
    productionMode: settings?.productionMode === true,
  };
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((record) => record && record.result && Array.isArray(record.result.packedBoxes) && !record.result.error)
    .slice(0, HISTORY_LIMIT)
    .map((record) => ({
      id: record.id || createId(),
      createdAt: record.createdAt || new Date().toISOString(),
      meta: normalizeCalculationMeta(record.meta),
      result: record.result,
      selectedProducts: Array.isArray(record.selectedProducts) ? record.selectedProducts : [],
    }));
}

function normalizeCalculationMeta(meta) {
  return {
    reference: String((meta && meta.reference) || "").trim(),
    user: String((meta && meta.user) || "").trim(),
  };
}

function normalizeBox(box) {
  const id = box.id || createId();
  const createdAt = normalizeDateString(box.createdAt, inferDateFromId(id) || new Date().toISOString());
  const updatedAt = normalizeDateString(box.updatedAt, createdAt);

  return {
    id,
    name: String(box.name || "Caixa").trim(),
    width: toNumber(box.width, 0),
    height: toNumber(box.height, 0),
    length: toNumber(box.length, 0),
    maxWeight: toOptionalNumber(box.maxWeight),
    stock: toOptionalInteger(box.stock),
    createdAt,
    updatedAt,
  };
}

function normalizeProduct(product) {
  const id = product.id || createId();
  const createdAt = normalizeDateString(product.createdAt, inferDateFromId(id) || new Date().toISOString());
  const updatedAt = normalizeDateString(product.updatedAt, createdAt);
  const barcode = normalizeBarcode(product.barcode ?? product.codigoBarras ?? product.codigo_barras ?? product.ean ?? product.gtin);
  const shape = getProductShape(product);
  const height = toNumber(product.height, 0);

  if (shape === "round") {
    const diameter = toNumber(product.diameter ?? product.diametro ?? product.width ?? product.length, 0);
    return {
      id,
      name: String(product.name || "Produto").trim(),
      barcode,
      weight: toNumber(product.weight, 0),
      shape,
      diameter,
      width: diameter,
      height,
      length: diameter,
      fragile: product.fragile === true,
      canRotate: product.canRotate === true,
      keepUpright: product.keepUpright === true,
      stackable: product.stackable === true,
      createdAt,
      updatedAt,
    };
  }

  return {
    id,
    name: String(product.name || "Produto").trim(),
    barcode,
    weight: toNumber(product.weight, 0),
    shape,
    diameter: null,
    width: toNumber(product.width, 0),
    height,
    length: toNumber(product.length, 0),
    fragile: product.fragile === true,
    canRotate: product.canRotate === true,
    keepUpright: product.keepUpright === true,
    stackable: product.stackable === true,
    createdAt,
    updatedAt,
  };
}

function getProductShape(product) {
  const shape = String(product.shape || product.formato || product.tipo || "").trim().toLowerCase();
  const diameter = toNumber(product.diameter ?? product.diametro, 0);
  if (diameter > 0 || ["round", "redondo", "cilindro", "circular"].includes(shape)) {
    return "round";
  }
  return "box";
}

function isRoundProduct(product) {
  return product.shape === "round";
}

function normalizeSelectionOptions(options) {
  return {
    canRotate: options && options.canRotate === true,
    keepUpright: options && options.keepUpright === true,
    stackable: options && options.stackable === true,
    fragile: options && options.fragile === true,
  };
}

function normalizeBarcode(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "");
}

function compareText(a, b) {
  return ptBrCollator.compare(String(a || ""), String(b || ""));
}

function getBarcodeCommand(value) {
  const normalized = normalizeBarcode(value);
  return BARCODE_COMMAND_MAP.get(normalized) || null;
}

function isReservedBarcode(value) {
  return Boolean(getBarcodeCommand(value));
}

function hasReservedBarcodePrefix(value) {
  const normalized = normalizeBarcode(value);
  return RESERVED_BARCODES.some((reservedBarcode) =>
    Boolean(normalized) && normalized.length < reservedBarcode.length && reservedBarcode.startsWith(normalized),
  );
}

function runBarcodeCommand(value) {
  const command = getBarcodeCommand(value);
  if (!command) {
    return false;
  }
  if (command.action !== "clear-order") {
    resetClearOrderConfirmation();
  }
  if (command.action === "finish-order") {
    finishBarcodeOrder();
    return true;
  }
  if (command.action === "new-order") {
    startNewBarcodeOrder();
    return true;
  }
  if (command.action === "clear-order") {
    clearBarcodeOrderWithConfirmation();
    return true;
  }
  if (command.action === "undo-last-reading") {
    undoLastBarcodeReadingFromCommand();
    return true;
  }
  if (command.action === "last-reading-single") {
    setLastBarcodeReadingToSingleQuantity();
    return true;
  }
  if (command.action === "quantity") {
    setBarcodeScanQuantity(command.quantity);
    return true;
  }
  return false;
}

function renderFinalizerBarcode() {
  if (!elements.finalizerCommandList) {
    return;
  }

  elements.finalizerCommandList.innerHTML = getFinalizerBarcodeCommands().map(renderBarcodeCommandCard).join("");
  elements.finalizerCommandList.querySelectorAll("[data-command-barcode-value]").forEach((card) => {
    renderCommandBarcode(
      card.querySelector("[data-command-barcode]"),
      card.querySelector("[data-command-code]"),
      card.dataset.commandBarcodeValue,
    );
  });
}

function getFinalizerBarcodeCommands() {
  return BARCODE_COMMANDS.slice().sort((a, b) =>
    b.barcode.localeCompare(a.barcode, "pt-BR", { numeric: true }),
  );
}

function renderBarcodeCommandCard(command) {
  return `
    <div class="finalizer-print-card" data-command-barcode-value="${escapeHtml(command.barcode)}">
      <div class="finalizer-print-heading">
        <strong>${escapeHtml(command.title)}</strong>
        <span>${escapeHtml(command.subtitle)}</span>
      </div>
      <div class="finalizer-barcode" data-command-barcode aria-label="${escapeHtml(command.ariaLabel)}"></div>
      <div class="finalizer-code" data-command-code>${escapeHtml(command.barcode)}</div>
      <button class="ghost-button finalizer-card-print-button finalizer-screen-only" type="button" data-command-print="${escapeHtml(command.barcode)}" aria-label="Imprimir ${escapeHtml(command.title)}">Imprimir</button>
    </div>
  `;
}

function handleFinalizerCommandListClick(event) {
  const button = event.target.closest("[data-command-print]");
  if (!button || !elements.finalizerCommandList.contains(button)) {
    return;
  }

  printFinalizerBarcode(button.dataset.commandPrint);
}

function renderCommandBarcode(barcodeElement, codeElement, barcode) {
  if (!barcodeElement || !codeElement) {
    return;
  }

  codeElement.textContent = barcode;
  barcodeElement.replaceChildren(buildCode128Svg(barcode));
}

function buildCode128Svg(value) {
  const moduleWidth = 2;
  const quietZone = 20;
  const height = 92;
  const svgNamespace = "http://www.w3.org/2000/svg";
  const codeValues = [104];
  let checksum = 104;

  Array.from(String(value)).forEach((character, index) => {
    const codeValue = character.charCodeAt(0) - 32;
    if (codeValue < 0 || codeValue > 94) {
      throw new Error("Código inválido para Code 128.");
    }
    codeValues.push(codeValue);
    checksum += codeValue * (index + 1);
  });

  codeValues.push(checksum % 103, 106);

  let x = quietZone;
  const bars = [];
  codeValues.forEach((codeValue) => {
    const pattern = CODE128_PATTERNS[codeValue];
    Array.from(pattern).forEach((widthCharacter, index) => {
      const width = Number(widthCharacter) * moduleWidth;
      if (index % 2 === 0) {
        bars.push({ x, width });
      }
      x += width;
    });
  });

  const svg = document.createElementNS(svgNamespace, "svg");
  svg.setAttribute("viewBox", `0 0 ${x + quietZone} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Código de barras ${value}`);
  svg.setAttribute("preserveAspectRatio", "none");

  const background = document.createElementNS(svgNamespace, "rect");
  background.setAttribute("width", "100%");
  background.setAttribute("height", "100%");
  background.setAttribute("fill", "#ffffff");
  svg.append(background);

  bars.forEach((bar) => {
    const rect = document.createElementNS(svgNamespace, "rect");
    rect.setAttribute("x", String(bar.x));
    rect.setAttribute("y", "0");
    rect.setAttribute("width", String(bar.width));
    rect.setAttribute("height", String(height));
    rect.setAttribute("fill", "#000000");
    svg.append(rect);
  });

  return svg;
}

function hasValidDimensions(item) {
  return item.width > 0 && item.height > 0 && item.length > 0;
}

function toNumber(value, fallback) {
  const normalized = typeof value === "string" ? value.trim().replace(",", ".") : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toOptionalNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toOptionalInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Math.floor(toNumber(value, Number.NaN));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeDateString(value, fallback) {
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString();
  }

  const fallbackDate = new Date(fallback);
  return Number.isNaN(fallbackDate.getTime()) ? new Date().toISOString() : fallbackDate.toISOString();
}

function inferDateFromId(id) {
  const timestamp = Number(String(id || "").split("-")[0]);
  if (!Number.isFinite(timestamp) || timestamp < 946684800000) {
    return null;
  }

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function debounce(callback, delay = SEARCH_DEBOUNCE_DELAY) {
  let timer = null;
  return (...args) => {
    if (timer) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      timer = null;
      callback(...args);
    }, delay);
  };
}

function runWhenIdle(callback) {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(callback, { timeout: 2000 });
    return;
  }
  window.setTimeout(callback, 800);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || window.location.protocol === "file:") {
    return;
  }

  navigator.serviceWorker.register("service-worker.js").catch((error) => {
    console.warn("Não foi possível registrar o modo offline.", error);
  });
}

async function syncStateFromServer() {
  if (!canUseServerStorage()) {
    return;
  }

  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (!payload.state) {
      scheduleServerStateSync("primeira_sincronizacao");
      return;
    }

    const serverState = normalizeState(payload.state);
    const serverUpdatedAt = new Date(serverState.stateUpdatedAt).getTime();
    const localUpdatedAt = new Date(state.stateUpdatedAt).getTime();

    if (Number.isFinite(serverUpdatedAt) && serverUpdatedAt > localUpdatedAt) {
      replaceState(serverState);
      persistLocalStateOnly();
      render();
      renderInitialResult();
      setBarcodeScanStatus("Dados carregados do armazenamento do servidor.", "ready");
      addAuditLog("estado_servidor_carregado", formatHistoryDate(serverState.stateUpdatedAt), { persist: true });
      return;
    }

    scheduleServerStateSync("sincronizacao_local");
  } catch (error) {
    console.warn("Não foi possível sincronizar o estado com o servidor.", error);
  }
}

function replaceState(nextState) {
  Object.keys(state).forEach((key) => {
    delete state[key];
  });
  Object.assign(state, nextState);
  invalidateProductCache();
  barcodeReadUndoStack = [];
  highlightedProductId = null;
  pendingUnknownBarcode = "";
  pendingClearOrderConfirmation = false;
}

function persistLocalStateOnly() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function scheduleServerStateSync(reason = "alteracao_manual") {
  if (!canUseServerStorage()) {
    return;
  }

  lastServerStateSync = reason;
  if (serverStateSyncTimer) {
    window.clearTimeout(serverStateSyncTimer);
  }
  serverStateSyncTimer = window.setTimeout(() => {
    serverStateSyncTimer = null;
    syncStateToServer(lastServerStateSync);
  }, SERVER_STATE_SYNC_DELAY);
}

async function syncStateToServer(reason = "alteracao_manual") {
  if (!canUseServerStorage()) {
    return;
  }

  try {
    const response = await fetch("/api/state", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        appVersion: APP_VERSION,
        reason,
        state: cloneForStorage(state),
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.warn("Não foi possível salvar o estado no servidor.", error);
  }
}

function canUseServerStorage() {
  return window.location.protocol !== "file:" && typeof fetch === "function";
}

function handleBeforeInstallPrompt(event) {
  event.preventDefault();
  deferredInstallPrompt = event;
  elements.installAppButton.classList.remove("hidden");
}

async function installApp() {
  if (!deferredInstallPrompt) {
    return;
  }

  deferredInstallPrompt.prompt();
  const result = await deferredInstallPrompt.userChoice;
  addAuditLog("instalacao_pwa", result.outcome === "accepted" ? "Instalação aceita." : "Instalação recusada.", { persist: true });
  deferredInstallPrompt = null;
  elements.installAppButton.classList.add("hidden");
}

function handleAppInstalled() {
  deferredInstallPrompt = null;
  elements.installAppButton.classList.add("hidden");
  addAuditLog("app_instalado", "PWA instalado no dispositivo.", { persist: true });
}

function invalidateProductCache() {
  productCache = null;
}

function getProductCache() {
  if (!productCache) {
    productCache = buildProductCache();
  }
  return productCache;
}

function buildProductCache() {
  const sortedProducts = state.products.slice().sort((a, b) => compareText(a.name, b.name));
  const productsById = new Map();
  const productsByBarcode = new Map();
  const productBarcodes = [];
  const searchTextById = new Map();
  const importNameIndex = new Map();

  state.products.forEach((product, index) => {
    productsById.set(product.id, product);
    searchTextById.set(product.id, getProductSelectionSearchText(product));

    const barcode = normalizeBarcode(product.barcode);
    if (barcode) {
      productBarcodes.push(barcode);
      if (!productsByBarcode.has(barcode)) {
        productsByBarcode.set(barcode, []);
      }
      productsByBarcode.get(barcode).push(product);
    }

    const importName = normalizeImportName(product.name);
    if (importName && !importNameIndex.has(importName)) {
      importNameIndex.set(importName, index);
    }
  });

  return {
    importNameIndex,
    productBarcodes,
    productsByBarcode,
    productsById,
    searchTextById,
    sortedProducts,
  };
}

function saveState(reason = "alteracao_manual") {
  if (saveStateTimer) {
    window.clearTimeout(saveStateTimer);
    saveStateTimer = null;
  }
  persistState(reason);
  writeAutoBackup(reason);
}

function scheduleStateSave() {
  if (saveStateTimer) {
    window.clearTimeout(saveStateTimer);
  }
  saveStateTimer = window.setTimeout(() => {
    saveStateTimer = null;
    persistState("edicao_rapida");
  }, STATE_SAVE_DEBOUNCE_DELAY);
}

function flushPendingStateSave() {
  if (saveStateTimer) {
    window.clearTimeout(saveStateTimer);
    saveStateTimer = null;
    persistState("flush");
  }
  if (serverStateSyncTimer) {
    window.clearTimeout(serverStateSyncTimer);
    serverStateSyncTimer = null;
    syncStateToServer(lastServerStateSync || "flush");
  }
}

function persistState(reason = "alteracao_manual") {
  state.stateUpdatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleServerStateSync(reason);
}

function commit(reason = "alteracao_manual") {
  saveState(reason);
  render();
}

function render() {
  elements.boxCount.textContent = state.boxes.length;
  elements.productCount.textContent = state.products.length;
  renderEntityList("boxes");
  renderEntityList("products");
  renderSelectionTable();
  renderBarcodeSelectionViews();
  renderUnknownBarcodeAction();
  renderHistory();
  renderAutoBackupInfo();
  renderAuditLog();
  applyProductionMode();
}

function renderBarcodeSelectionViews(selectedItems = getSelectedItems()) {
  updateBarcodeScanCount(selectedItems);
  renderBarcodeReadList(selectedItems);
  renderBarcodeSummary(selectedItems);
}

function setProductionMode(enabled) {
  state.appSettings.productionMode = Boolean(enabled);
  addAuditLog(enabled ? "modo_producao_ativado" : "modo_producao_desativado", "");
  saveState("modo_producao");
  applyProductionMode();
  if (enabled) {
    activateTab("home");
    focusBarcodeScanner();
  }
}

function applyProductionMode() {
  const enabled = state.appSettings.productionMode === true;
  document.body.classList.toggle("production-mode", enabled);
  elements.productionModeToggle.setAttribute("aria-pressed", String(enabled));
  elements.productionModeToggle.textContent = enabled ? "Sair do modo produção" : "Modo produção";
}

function addAuditLog(action, detail = "", options = {}) {
  state.auditLog = [
    {
      id: createId(),
      createdAt: new Date().toISOString(),
      action,
      detail: String(detail || "").trim(),
    },
    ...state.auditLog,
  ].slice(0, AUDIT_LOG_LIMIT);

  if (options.persist) {
    saveState("auditoria");
    renderAuditLog();
  }
}

function renderAuditLog() {
  if (!elements.auditLogList) {
    return;
  }

  const records = state.auditLog.slice(0, 12);
  elements.auditLogList.classList.toggle("empty-state", !records.length);
  if (!records.length) {
    elements.auditLogList.textContent = "Nenhum evento registrado.";
    return;
  }

  elements.auditLogList.innerHTML = records
    .map((record) => `
      <article class="audit-log-item">
        <span>${escapeHtml(formatHistoryDate(record.createdAt))}</span>
        <strong>${escapeHtml(formatAuditAction(record.action))}</strong>
        ${record.detail ? `<small>${escapeHtml(record.detail)}</small>` : ""}
      </article>
    `)
    .join("");
}

function formatAuditAction(action) {
  return String(action || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function exportAuditLogCsv() {
  if (!state.auditLog.length) {
    window.alert("Nenhum evento de auditoria para exportar.");
    return;
  }

  const rows = [
    ["id", "data", "ação", "detalhe"],
    ...state.auditLog.map((record) => [record.id, record.createdAt, record.action, record.detail]),
  ];
  downloadFile(`auditoria-${getSafeFilenamePart(new Date().toISOString())}.csv`, toCsv(rows), "text/csv;charset=utf-8");
}

function renderEntityList(type) {
  const isBox = type === "boxes";
  const list = isBox ? elements.boxesList : elements.productsList;
  const items = isBox ? state.boxes : state.products;
  const productListCache = isBox ? null : getProductCache();
  const searchTerm = !isBox && elements.productListSearch
    ? elements.productListSearch.value.trim().toLowerCase()
    : "";
  const sortedItems = isBox
    ? items.slice().sort((a, b) => compareText(a.name, b.name))
    : productListCache.sortedProducts;
  const visibleItems = sortedItems.filter((item) => {
    const searchText = isBox ? getEntitySearchText(item, true) : productListCache.searchTextById.get(item.id) || "";
    return !searchTerm || searchText.includes(searchTerm);
  });

  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML = `<div class="empty-state">Nenhum item cadastrado.</div>`;
    return;
  }

  if (!visibleItems.length) {
    list.innerHTML = `<div class="empty-state">Nenhum produto encontrado.</div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  visibleItems.forEach((item) => {
    const card = document.createElement("article");
    card.className = `entity-card ${isBox ? "box-card" : "product-card"}`;
    card.dataset.entityId = item.id;
    card.innerHTML = `
      <div>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${isBox ? getBoxDetails(item) : getProductDetails(item)}</p>
      </div>
      <div class="entity-actions">
        <button class="edit-button" type="button" data-entity-action="edit">Editar</button>
        <button class="icon-button" type="button" data-entity-action="remove" aria-label="Remover">x</button>
      </div>
    `;

    fragment.append(card);
  });
  list.append(fragment);
}

function handleEntityListClick(event) {
  const button = event.target.closest("[data-entity-action]");
  if (!button) {
    return;
  }

  const card = button.closest(".entity-card[data-entity-id]");
  if (!card) {
    return;
  }

  const type = card.closest("#boxes-list") ? "boxes" : "products";
  const id = card.dataset.entityId;
  if (button.dataset.entityAction === "edit") {
    if (type === "boxes") {
      editBox(id);
    } else {
      editProduct(id);
    }
    return;
  }

  if (button.dataset.entityAction === "remove") {
    removeEntity(type, id);
  }
}

function getEntitySearchText(item, isBox) {
  const details = isBox ? getBoxDetails(item) : getProductDetails(item);
  return `${item.name} ${item.barcode || ""} ${details}`.toLowerCase();
}

function getBoxDetails(box) {
  const maxWeight = box.maxWeight ? `${formatNumber(box.maxWeight)} kg max.` : "sem limite de peso";
  const stock = box.stock === null ? "estoque sem limite" : `${box.stock} em estoque`;
  return `${formatDimensions(box)} | ${maxWeight} | ${stock}`;
}

function getProductDetails(product) {
  const barcode = product.barcode ? `código ${product.barcode} | ` : "";
  return `${barcode}${getProductShapeLabel(product)} | ${formatDimensions(product)} | ${formatNumber(product.weight)} kg`;
}

function getProductShapeLabel(product) {
  return isRoundProduct(product) ? "redondo" : "retangular";
}

function getProductRules(product) {
  const rules = [];
  rules.push(product.canRotate ? "gira" : "não gira");
  if (product.keepUpright) {
    rules.push("manter em pé");
  }
  if (product.fragile) {
    rules.push("frágil");
  }
  rules.push(product.stackable ? "empilhável" : "não empilhável");
  return rules;
}

function removeEntity(type, id) {
  const removedItem = state[type].find((item) => item.id === id);
  state[type] = state[type].filter((item) => item.id !== id);
  if (type === "products") {
    delete state.selection[id];
    delete state.selectionOptions[id];
    invalidateProductCache();
    if (getField(elements.productForm, "id").value === id) {
      resetProductForm();
    }
  }
  if (type === "boxes" && getField(elements.boxForm, "id").value === id) {
    resetBoxForm();
  }
  addAuditLog(type === "products" ? "produto_removido" : "caixa_removida", removedItem?.name || id);
  commit();
  renderInitialResult();
}

function renderSelectionTable() {
  elements.selectionTable.innerHTML = "";

  if (!state.products.length) {
    elements.selectionTable.innerHTML = `
      <tr>
        <td colspan="8" class="sr-status">Nenhum produto cadastrado.</td>
      </tr>
    `;
    return;
  }

  const searchTerm = elements.productSearch.value.trim().toLowerCase();
  const productListCache = getProductCache();
  const visibleProducts = productListCache.sortedProducts
    .filter((product) => (productListCache.searchTextById.get(product.id) || "").includes(searchTerm));

  if (!visibleProducts.length) {
    elements.selectionTable.innerHTML = `
      <tr>
        <td colspan="8" class="sr-status">Nenhum produto encontrado.</td>
      </tr>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  visibleProducts.forEach((product) => {
    const options = getSelectionOptions(product.id);
    const row = document.createElement("tr");
    row.dataset.productId = product.id;
    row.classList.toggle("selection-row-highlight", product.id === highlightedProductId);
    row.innerHTML = `
        <td>
          <strong>${escapeHtml(product.name)}</strong>
          ${product.barcode ? `<span class="muted-line">Código ${escapeHtml(product.barcode)}</span>` : ""}
        </td>
        <td data-label="Pode girar">
          <label class="table-checkbox">
            <input class="selection-option-input rotate-input" type="checkbox" data-option="canRotate" ${options.canRotate ? "checked" : ""} />
            Pode girar
          </label>
        </td>
        <td data-label="Manter em pé">
          <label class="table-checkbox">
            <input class="selection-option-input upright-input" type="checkbox" data-option="keepUpright" ${options.keepUpright ? "checked" : ""} />
            Em pé
          </label>
        </td>
        <td data-label="Empilhável">
          <label class="table-checkbox">
            <input class="selection-option-input stack-input" type="checkbox" data-option="stackable" ${options.stackable ? "checked" : ""} />
            Empilhável
          </label>
        </td>
        <td data-label="Frágil">
          <label class="table-checkbox">
            <input class="selection-option-input fragile-input" type="checkbox" data-option="fragile" ${options.fragile ? "checked" : ""} />
            Frágil
          </label>
        </td>
        <td data-label="Dimensões">${formatDimensions(product)}</td>
        <td data-label="Peso">${formatNumber(product.weight)} kg</td>
        <td data-label="Unid.">
          <input class="qty-input" type="number" min="0" step="1" value="${state.selection[product.id] || 0}" aria-label="Quantidade de ${escapeHtml(product.name)}" />
        </td>
      `;

    fragment.append(row);
  });
  elements.selectionTable.append(fragment);
}

function syncSelectionTableProduct(productId) {
  const row = Array.from(elements.selectionTable.querySelectorAll("tr[data-product-id]"))
    .find((item) => item.dataset.productId === productId);
  if (!row) {
    return;
  }

  const options = getSelectionOptions(productId);
  row.classList.toggle("selection-row-highlight", productId === highlightedProductId);
  const quantityInput = row.querySelector(".qty-input");
  if (quantityInput) {
    quantityInput.value = state.selection[productId] || 0;
  }
  row.querySelectorAll(".selection-option-input").forEach((input) => {
    input.checked = options[input.dataset.option] === true;
  });
}

function handleSelectionTableClick(event) {
  if (event.target.closest("input, button, label, select")) {
    return;
  }

  const row = event.target.closest("tr[data-product-id]");
  if (row) {
    setHighlightedProduct(row.dataset.productId);
  }
}

function handleSelectionTableFocus(event) {
  const row = event.target.closest("tr[data-product-id]");
  if (row) {
    setHighlightedProduct(row.dataset.productId);
  }
}

function handleSelectionTableChange(event) {
  const input = event.target;
  if (!input.matches(".selection-option-input")) {
    return;
  }

  const row = input.closest("tr[data-product-id]");
  if (!row) {
    return;
  }

  updateSelectionOption(row.dataset.productId, input.dataset.option, input.checked);
  renderBarcodeSelectionViews();
}

function handleSelectionTableInput(event) {
  const input = event.target;
  if (!input.matches(".qty-input")) {
    return;
  }

  const row = input.closest("tr[data-product-id]");
  if (!row) {
    return;
  }

  setSelectedQuantity(row.dataset.productId, input.value);
  renderBarcodeSelectionViews();
}

function getProductSelectionSearchText(product) {
  return `${product.name} ${product.barcode || ""} ${getProductDetails(product)}`.toLowerCase();
}

function scheduleBarcodeAutoReading() {
  clearBarcodeScanTimer();
  const barcode = normalizeBarcode(elements.barcodeScanInput.value);
  if (!barcode) {
    setBarcodeScanStatus("Aguardando leitura.", "pending");
    setPendingUnknownBarcode("");
    return;
  }

  const delay = hasLongerProductBarcodePrefix(barcode) || hasReservedBarcodePrefix(barcode)
    ? BARCODE_AMBIGUOUS_SCAN_DELAY
    : BARCODE_AUTO_SCAN_DELAY;
  barcodeScanTimer = window.setTimeout(() => {
    barcodeScanTimer = null;
    const currentBarcode = normalizeBarcode(elements.barcodeScanInput.value);
    if (!currentBarcode) {
      return;
    }

    if (runBarcodeCommand(currentBarcode)) {
      return;
    }

    const product = findProductByBarcode(currentBarcode);
    if (product) {
      setPendingUnknownBarcode("");
      if (hasLongerProductBarcodePrefix(currentBarcode)) {
        setBarcodeScanStatus(`Código ${currentBarcode} também inicia outro código cadastrado. Pressione Enter para confirmar.`, "warning");
        return;
      }
      addBarcodeReading(currentBarcode);
      return;
    }

    if (!hasProductBarcodePrefix(currentBarcode) && !hasReservedBarcodePrefix(currentBarcode)) {
      handleUnknownBarcode(currentBarcode);
    }
  }, delay);
}

function clearBarcodeScanTimer() {
  if (barcodeScanTimer) {
    window.clearTimeout(barcodeScanTimer);
    barcodeScanTimer = null;
  }
}

function addBarcodeReading(value = elements.barcodeScanInput.value) {
  clearBarcodeScanTimer();
  const barcode = normalizeBarcode(value);
  if (!barcode) {
    setBarcodeScanStatus("Informe ou leia um código de barras.", "warning");
    elements.barcodeScanInput.focus();
    return;
  }

  if (runBarcodeCommand(barcode)) {
    return;
  }

  resetClearOrderConfirmation();
  const product = findProductByBarcode(barcode);
  if (!product) {
    handleUnknownBarcode(barcode);
    return;
  }

  const increment = getBarcodeScanMultiplier();
  const previousQuantity = Math.max(0, Math.floor(Number(state.selection[product.id]) || 0));
  const quantity = previousQuantity + increment;
  ensureSelectionOptions(product.id);
  setSelectedQuantity(product.id, quantity);
  barcodeReadUndoStack.push({ productId: product.id, productName: product.name, quantity: increment });
  setPendingUnknownBarcode("");
  highlightedProductId = product.id;
  syncSelectionTableProduct(product.id);
  renderBarcodeSelectionViews();
  applyProductHighlight();
  elements.barcodeScanMultiplier.value = "1";
  const resetMessage = increment > 1 ? " Quantidade voltou para 1." : "";
  setBarcodeScanStatus(`${product.name}: +${increment}. Total ${quantity} unidade(s).${resetMessage}`, "ready");
  playScanFeedback("success");
  elements.barcodeScanInput.value = "";
  elements.barcodeScanInput.focus();
}

function finishBarcodeOrder() {
  clearBarcodeScanTimer();
  setPendingUnknownBarcode("");
  elements.barcodeScanInput.value = "";

  if (!getSelectedItems().length) {
    setBarcodeScanStatus("Código de finalização lido, mas não há produtos selecionados.", "warning");
    playScanFeedback("error");
    elements.barcodeScanInput.focus();
    return;
  }

  const result = calculateCurrentSelection({ scrollToResults: true });
  if (result.error) {
    setBarcodeScanStatus(`Código de finalização lido. ${result.error}`, "warning");
    playScanFeedback("error");
    return;
  }

  const finishAlerts = getFinishValidationAlerts(result);
  if (finishAlerts.critical.length) {
    setBarcodeScanStatus(`Pedido calculado com alerta: ${finishAlerts.critical.join(" ")}`, "error");
    playScanFeedback("error");
    return;
  }
  if (finishAlerts.warning.length) {
    setBarcodeScanStatus(`Pedido calculado. Conferir: ${finishAlerts.warning.join(" ")}`, "warning");
    playScanFeedback("error");
    return;
  }

  setBarcodeScanStatus("Pedido finalizado e calculado sem alertas.", "ready");
  playScanFeedback("success");
}

function startNewBarcodeOrder() {
  clearBarcodeScanTimer();
  activateTab("home");
  elements.barcodeScanMultiplier.value = "1";
  clearCurrentSelection();
  setBarcodeScanStatus("Novo pedido iniciado. Leia o primeiro produto.", "ready");
  playScanFeedback("success");
  focusBarcodeScanner();
}

function undoLastBarcodeReadingFromCommand() {
  clearBarcodeScanTimer();
  setPendingUnknownBarcode("");
  activateTab("home");
  elements.barcodeScanMultiplier.value = "1";
  elements.barcodeScanInput.value = "";
  undoLastBarcodeReading({ playFeedback: true });
}

function clearBarcodeOrderWithConfirmation() {
  clearBarcodeScanTimer();
  setPendingUnknownBarcode("");
  activateTab("home");
  elements.barcodeScanMultiplier.value = "1";
  elements.barcodeScanInput.value = "";

  const hasSelection = Object.values(state.selection).some((quantity) => Number(quantity) > 0);
  if (!hasSelection) {
    resetClearOrderConfirmation();
    setBarcodeScanStatus("Nenhum produto selecionado para limpar.", "pending");
    focusBarcodeScanner();
    return;
  }

  if (!pendingClearOrderConfirmation) {
    pendingClearOrderConfirmation = true;
    setBarcodeScanStatus("Leia Limpar pedido novamente para confirmar.", "warning");
    playScanFeedback("error");
    focusBarcodeScanner();
    return;
  }

  clearCurrentSelection();
  setBarcodeScanStatus("Pedido limpo. Leia o primeiro produto.", "ready");
  playScanFeedback("success");
  focusBarcodeScanner();
}

function resetClearOrderConfirmation() {
  pendingClearOrderConfirmation = false;
}

function setBarcodeScanQuantity(quantity) {
  const normalizedQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
  clearBarcodeScanTimer();
  setPendingUnknownBarcode("");
  activateTab("home");
  elements.barcodeScanMultiplier.value = String(normalizedQuantity);
  elements.barcodeScanInput.value = "";
  setBarcodeScanStatus(`Quantidade por leitura ajustada para ${normalizedQuantity}.`, "ready");
  playScanFeedback("success");
  focusBarcodeScanner();
}

function setLastBarcodeReadingToSingleQuantity() {
  clearBarcodeScanTimer();
  setPendingUnknownBarcode("");
  activateTab("home");
  elements.barcodeScanMultiplier.value = "1";
  elements.barcodeScanInput.value = "";

  const lastReading = barcodeReadUndoStack[barcodeReadUndoStack.length - 1];
  if (!lastReading) {
    setBarcodeScanStatus("Nenhuma leitura para ajustar para 1 quantidade.", "warning");
    playScanFeedback("error");
    focusBarcodeScanner();
    return;
  }

  const currentQuantity = Math.max(0, Math.floor(Number(state.selection[lastReading.productId]) || 0));
  if (currentQuantity <= 0) {
    setBarcodeScanStatus("O último produto lido não está mais selecionado.", "warning");
    playScanFeedback("error");
    focusBarcodeScanner();
    return;
  }

  const lastIncrement = Math.max(1, Math.floor(Number(lastReading.quantity) || 1));
  const previousQuantity = Math.max(0, currentQuantity - lastIncrement);
  const nextQuantity = previousQuantity + 1;
  setSelectedQuantity(lastReading.productId, nextQuantity);
  lastReading.quantity = 1;
  highlightedProductId = lastReading.productId;
  syncSelectionTableProduct(lastReading.productId);
  renderBarcodeSelectionViews();
  applyProductHighlight();
  setBarcodeScanStatus(`${lastReading.productName}: ultima leitura ajustada para 1. Total ${nextQuantity} unidade(s).`, "ready");
  playScanFeedback("success");
  focusBarcodeScanner();
}

function handleUnknownBarcode(barcode) {
  setPendingUnknownBarcode(barcode);
  setBarcodeScanStatus(`Código ${pendingUnknownBarcode} não encontrado no cadastro.`, "error");
  playScanFeedback("error");
  elements.barcodeScanInput.select();
}

function setPendingUnknownBarcode(barcode) {
  pendingUnknownBarcode = normalizeBarcode(barcode);
  renderUnknownBarcodeAction();
}

function renderUnknownBarcodeAction() {
  if (!elements.barcodeUnknownActions) {
    return;
  }

  const hasUnknownCode = Boolean(pendingUnknownBarcode);
  elements.barcodeUnknownActions.classList.toggle("hidden", !hasUnknownCode);
  elements.barcodeUnknownCode.textContent = pendingUnknownBarcode;
}

function startQuickProductRegistrationFromBarcode() {
  const barcode = pendingUnknownBarcode || normalizeBarcode(elements.barcodeScanInput.value);
  if (!barcode) {
    setBarcodeScanStatus("Leia um código antes de cadastrar.", "warning");
    focusBarcodeScanner();
    return;
  }

  resetProductForm();
  activateTab("products");
  elements.productListSearch.value = "";
  renderEntityList("products");
  getField(elements.productForm, "barcode").value = barcode;
  elements.productFormTitle.textContent = "Cadastrar código lido";
  elements.productSubmitButton.textContent = "Salvar produto";
  setBarcodeScanStatus(`Cadastro rápido aberto para o código ${barcode}.`, "ready");
  const nameField = getField(elements.productForm, "name");
  nameField.focus();
  nameField.select();
}

function findProductByBarcode(barcode) {
  const normalized = normalizeBarcode(barcode);
  if (!normalized) {
    return null;
  }
  return getProductCache().productsByBarcode.get(normalized)?.[0] || null;
}

function findDuplicateProductBarcode(barcode, productId) {
  const normalized = normalizeBarcode(barcode);
  if (!normalized) {
    return null;
  }
  return getProductCache().productsByBarcode.get(normalized)?.find((product) => product.id !== productId) || null;
}

function hasProductBarcodePrefix(barcode) {
  const normalized = normalizeBarcode(barcode);
  return Boolean(normalized) && getProductCache().productBarcodes.some((productBarcode) => productBarcode.startsWith(normalized));
}

function hasLongerProductBarcodePrefix(barcode) {
  const normalized = normalizeBarcode(barcode);
  return Boolean(normalized) && getProductCache().productBarcodes.some((productBarcode) =>
    productBarcode.length > normalized.length && productBarcode.startsWith(normalized),
  );
}

function renderBarcodeReadList(selectedItems = getSelectedItems()) {
  const selected = selectedItems;

  if (!selected.length) {
    elements.barcodeReadList.innerHTML = `<div class="barcode-empty">Nenhum produto lido.</div>`;
    return;
  }

  elements.barcodeReadList.innerHTML = selected
    .slice()
    .sort((a, b) => compareText(a.name, b.name))
    .map((product) => `
      <div class="barcode-read-item ${product.id === highlightedProductId ? "barcode-read-item-active" : ""}" data-product-id="${escapeHtml(product.id)}">
        <span class="barcode-read-meta">
          <strong>${escapeHtml(product.name)}</strong>
          ${product.barcode ? `<small>${escapeHtml(product.barcode)}</small>` : ""}
        </span>
        <label class="barcode-qty-control">
          Unid.
          <input class="barcode-qty-input" type="number" min="0" step="1" value="${escapeHtml(product.quantity)}" data-product-id="${escapeHtml(product.id)}" aria-label="Quantidade de ${escapeHtml(product.name)}" />
        </label>
        <div class="barcode-option-grid" aria-label="Regras de ${escapeHtml(product.name)}">
          <label class="barcode-option"><input class="barcode-option-input" type="checkbox" data-product-id="${escapeHtml(product.id)}" data-option="canRotate" ${product.canRotate ? "checked" : ""} /> Girar</label>
          <label class="barcode-option"><input class="barcode-option-input" type="checkbox" data-product-id="${escapeHtml(product.id)}" data-option="keepUpright" ${product.keepUpright ? "checked" : ""} /> Em pé</label>
          <label class="barcode-option"><input class="barcode-option-input" type="checkbox" data-product-id="${escapeHtml(product.id)}" data-option="stackable" ${product.stackable ? "checked" : ""} /> Empilhável</label>
          <label class="barcode-option"><input class="barcode-option-input" type="checkbox" data-product-id="${escapeHtml(product.id)}" data-option="fragile" ${product.fragile ? "checked" : ""} /> Frágil</label>
          <button class="icon-button barcode-remove-button" type="button" data-product-id="${escapeHtml(product.id)}" aria-label="Remover leitura" title="Remover leitura">X</button>
        </div>
      </div>
    `)
    .join("");

}

function handleBarcodeReadListFocus(event) {
  const input = event.target.closest(".barcode-qty-input");
  if (input) {
    setHighlightedProduct(input.dataset.productId);
  }
}

function handleBarcodeReadListInput(event) {
  const input = event.target;
  if (!input.matches(".barcode-qty-input")) {
    return;
  }

  const productId = input.dataset.productId;
  const quantity = setSelectedQuantity(productId, input.value);
  syncSelectionTableProduct(productId);
  renderBarcodeSelectionViews();

  if (quantity === 0) {
    setBarcodeScanStatus("Leitura removida.", "pending");
    return;
  }

  const product = getProductCache().productsById.get(productId);
  setBarcodeScanStatus(`${product ? product.name : "Produto"}: ${quantity} unidade(s).`, "ready");
}

function handleBarcodeReadListChange(event) {
  const input = event.target;
  if (input.matches(".barcode-qty-input")) {
    elements.barcodeScanInput.focus();
    return;
  }

  if (!input.matches(".barcode-option-input")) {
    return;
  }

  const productId = input.dataset.productId;
  const option = input.dataset.option;
  setHighlightedProduct(productId);
  updateSelectionOption(productId, option, input.checked);
  syncSelectionTableProduct(productId);
  renderBarcodeSelectionViews();
  const product = getProductCache().productsById.get(productId);
  setBarcodeScanStatus(`${product ? product.name : "Produto"}: regras atualizadas.`, "ready");
}

function handleBarcodeReadListClick(event) {
  const removeButton = event.target.closest(".barcode-remove-button");
  if (removeButton) {
    const productId = removeButton.dataset.productId;
    setSelectedQuantity(productId, 0);
    barcodeReadUndoStack = barcodeReadUndoStack.filter((entry) => entry.productId !== productId);
    syncSelectionTableProduct(productId);
    renderBarcodeSelectionViews();
    setBarcodeScanStatus("Leitura removida.", "pending");
    elements.barcodeScanInput.focus();
    return;
  }

  if (event.target.closest("input, button, label")) {
    return;
  }

  const card = event.target.closest(".barcode-read-item[data-product-id]");
  if (card) {
    setHighlightedProduct(card.dataset.productId, { scrollToResults: true });
  }
}

function undoLastBarcodeReading(options = {}) {
  const lastReading = barcodeReadUndoStack.pop();
  if (!lastReading) {
    setBarcodeScanStatus("Nenhuma leitura para desfazer.", "pending");
    if (options.playFeedback) {
      playScanFeedback("error");
    }
    focusBarcodeScanner();
    return false;
  }

  const currentQuantity = Math.max(0, Math.floor(Number(state.selection[lastReading.productId]) || 0));
  const nextQuantity = Math.max(0, currentQuantity - lastReading.quantity);
  setSelectedQuantity(lastReading.productId, nextQuantity);
  setPendingUnknownBarcode("");
  highlightedProductId = nextQuantity > 0 ? lastReading.productId : null;
  syncSelectionTableProduct(lastReading.productId);
  renderBarcodeSelectionViews();
  applyProductHighlight();
  setBarcodeScanStatus(`${lastReading.productName}: leitura desfeita.`, "pending");
  if (options.playFeedback) {
    playScanFeedback("success");
  }
  focusBarcodeScanner();
  return true;
}

function updateBarcodeScanCount(selectedItems = getSelectedItems()) {
  const total = selectedItems.reduce((sum, product) => sum + product.quantity, 0);
  elements.barcodeScanCount.textContent = `${total} ${total === 1 ? "leitura" : "leituras"}`;
  elements.barcodeScanCount.classList.toggle("status-ready", total > 0);
  elements.barcodeScanCount.classList.toggle("status-pending", total === 0);
}

function renderBarcodeSummary(selectedItems = getSelectedItems()) {
  const selected = selectedItems;
  const totalUnits = selected.reduce((sum, product) => sum + product.quantity, 0);
  const totalProducts = selected.length;
  const rotateCount = selected.filter((product) => product.canRotate).length;
  const stackableCount = selected.filter((product) => product.stackable).length;
  const fragileCount = selected.filter((product) => product.fragile).length;
  const uprightCount = selected.filter((product) => product.keepUpright).length;
  const productsWithoutRules = selected.filter((product) => {
    const options = getSelectionOptions(product.id);
    return !options.canRotate && !options.keepUpright && !options.stackable && !options.fragile;
  }).length;

  elements.barcodeScanSummary.innerHTML = `
    <span><strong>${totalUnits}</strong> Unidades</span>
    <span><strong>${totalProducts}</strong> Produtos diferentes</span>
    <span><strong>${productsWithoutRules}</strong> Sem regra marcada</span>
    <span><strong>${rotateCount}</strong> Pode girar</span>
    <span><strong>${stackableCount}</strong> Empilhável</span>
    <span><strong>${fragileCount}</strong> Frágil </span>
    <span><strong>${uprightCount}</strong> Em pé</span>
  `;
}

function setSelectedQuantity(productId, value) {
  const quantity = Math.max(0, Math.floor(Number(value) || 0));
  if (quantity > 0) {
    state.selection[productId] = quantity;
  } else {
    delete state.selection[productId];
  }
  scheduleStateSave();
  return quantity;
}

function getBarcodeScanMultiplier() {
  return Math.max(1, Math.floor(Number(elements.barcodeScanMultiplier.value) || 1));
}

function ensureSelectionOptions(productId) {
  if (!state.selectionOptions[productId]) {
    state.selectionOptions[productId] = { ...DEFAULT_SELECTION_OPTIONS };
  }
}

function setBarcodeScanStatus(text, variant) {
  elements.barcodeScanStatus.textContent = text;
  elements.barcodeScanStatus.classList.remove("barcode-status-pending", "barcode-status-ready", "barcode-status-warning", "barcode-status-error", "barcode-status-flash");
  elements.barcodeScanStatus.classList.add(`barcode-status-${variant}`);
  void elements.barcodeScanStatus.offsetWidth;
  elements.barcodeScanStatus.classList.add("barcode-status-flash");
  elements.barcodeScanInput.classList.remove("barcode-input-ready", "barcode-input-warning", "barcode-input-error");
  if (variant === "ready") {
    elements.barcodeScanInput.classList.add("barcode-input-ready");
  }
  if (variant === "warning") {
    elements.barcodeScanInput.classList.add("barcode-input-warning");
  }
  if (variant === "error") {
    elements.barcodeScanInput.classList.add("barcode-input-error");
  }
}

function playScanFeedback(type) {
  try {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = type === "success" ? 880 : 220;
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.12);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.14);
  } catch {
    // Feedback sonoro depende de permissão do navegador.
  }
}

function handleKeyboardShortcuts(event) {
  if (event.defaultPrevented || (event.altKey && !["1", "2", "3", "4", "5"].includes(event.key))) {
    return;
  }

  const isEditingField = isEditableShortcutTarget(event.target);
  const isScannerField = event.target === elements.barcodeScanInput;

  if (event.key === "F2") {
    event.preventDefault();
    focusBarcodeScanner();
    return;
  }

  if (event.key === "F3") {
    event.preventDefault();
    activateTab("home");
    elements.productSearch.focus();
    elements.productSearch.select();
    return;
  }

  if (event.key === "F4") {
    event.preventDefault();
    activateTab("products");
    elements.productListSearch.focus();
    elements.productListSearch.select();
    return;
  }

  if (event.altKey && !event.ctrlKey && !event.shiftKey) {
    const tabByKey = { 1: "home", 2: "boxes", 3: "products", 4: "help", 5: "finalizer" };
    if (tabByKey[event.key]) {
      event.preventDefault();
      activateTab(tabByKey[event.key]);
      if (event.key === "1") {
        focusBarcodeScanner();
      }
    }
    return;
  }

  if (event.ctrlKey && !event.shiftKey && event.key === "Enter") {
    if (isEditingField && !isScannerField && event.target !== elements.barcodeScanMultiplier) {
      return;
    }
    event.preventDefault();
    calculateCurrentSelection({ scrollToResults: true });
    return;
  }

  if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === "z") {
    if (isEditingField && !isScannerField) {
      return;
    }
    event.preventDefault();
    undoLastBarcodeReading();
    return;
  }

  if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === "m") {
    event.preventDefault();
    setProductionMode(!state.appSettings.productionMode);
    return;
  }

  if (event.ctrlKey && event.key === "Backspace") {
    if (isEditingField && !isScannerField) {
      return;
    }
    event.preventDefault();
    clearCurrentSelectionWithConfirmation();
    return;
  }

  if (event.key === "Escape") {
    handleEscapeShortcut(event);
  }
}

function isEditableShortcutTarget(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target && target.isContentEditable === true);
}

function handleEscapeShortcut(event) {
  if (closeExpanded3DView()) {
    event.preventDefault();
    return;
  }

  const target = event.target;
  const isEditable = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
  if (isEditable && target.value) {
    event.preventDefault();
    target.value = "";
    target.dispatchEvent(new Event("input", { bubbles: true }));
    if (target === elements.barcodeScanInput) {
      clearBarcodeScanTimer();
      setBarcodeScanStatus("Aguardando leitura.", "pending");
    }
    return;
  }

  event.preventDefault();
  focusBarcodeScanner();
}

function focusBarcodeScanner() {
  activateTab("home");
  clearBarcodeScanTimer();
  elements.barcodeScanInput.focus({ preventScroll: true });
  elements.barcodeScanInput.select();
}

function searchProductByScannedBarcode() {
  const barcode = normalizeBarcode(elements.productListSearch.value);
  const product = findProductByBarcode(barcode);
  if (!product) {
    renderEntityList("products");
    return;
  }

  elements.productListSearch.value = product.barcode;
  renderEntityList("products");
  const card = Array.from(elements.productsList.querySelectorAll(".entity-card"))
    .find((item) => item.dataset.entityId === product.id);
  if (card) {
    card.classList.add("entity-card-highlight");
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function addHistoryRecord(result, selectedProducts) {
  if (result.error) {
    return;
  }

  const record = {
    id: createId(),
    createdAt: new Date().toISOString(),
    meta: normalizeCalculationMeta({}),
    result: cloneForStorage(result),
    selectedProducts: cloneForStorage(selectedProducts),
  };

  state.history = [record, ...state.history].slice(0, HISTORY_LIMIT);
  saveState("calculo");
  renderHistory();
  syncHistoryRecordToSpreadsheet(record);
}

async function syncHistoryRecordToSpreadsheet(record) {
  if (!canUseHistorySpreadsheet()) {
    return;
  }

  try {
    const response = await fetch("/api/history", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildSpreadsheetHistoryRecord(record)),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.warn("Não foi possível salvar o histórico na planilha.", error);
  }
}

async function syncAllHistoryRecordsToSpreadsheet() {
  if (!canUseHistorySpreadsheet() || !state.history.length) {
    return;
  }

  for (const record of state.history) {
    await syncHistoryRecordToSpreadsheet(record);
  }
}

function canUseHistorySpreadsheet() {
  return window.location.protocol !== "file:" && typeof fetch === "function";
}

function buildSpreadsheetHistoryRecord(record) {
  const result = record.result || {};
  const packedBoxes = Array.isArray(result.packedBoxes) ? result.packedBoxes : [];
  const unpacked = Array.isArray(result.unpacked) ? result.unpacked : [];
  const selectedProducts = Array.isArray(record.selectedProducts) ? record.selectedProducts : [];

  return {
    id: record.id,
    createdAt: record.createdAt,
    reference: record.meta?.reference || "",
    user: record.meta?.user || "",
    selectedProducts: getFullProductsSummary(selectedProducts),
    totalProducts: selectedProducts.reduce((sum, product) => sum + product.quantity, 0),
    boxesCount: packedBoxes.length,
    boxesUsed: getBoxesUsedSummary(packedBoxes),
    averageFillRatePercent: formatNumber((Number(result.averageFillRate) || 0) * 100),
    totalWeightKg: formatNumber(Number(result.totalWeight) || 0),
    unpackedProducts: getGroupedItemsSummary(unpacked),
    boxDetails: getBoxDetailsSummary(packedBoxes),
  };
}

function getFullProductsSummary(products) {
  if (!products.length) {
    return "Sem produtos registrados";
  }

  return products.map((product) => `${product.quantity} x ${product.name}`).join(" | ");
}

function getGroupedItemsSummary(items) {
  if (!items.length) {
    return "";
  }

  return groupItemsByName(items).map((item) => `${item.quantity} x ${item.name}`).join(" | ");
}

function getBoxesUsedSummary(packedBoxes) {
  if (!packedBoxes.length) {
    return "";
  }

  const grouped = new Map();
  packedBoxes.forEach((packedBox) => {
    const name = packedBox.box.name;
    grouped.set(name, (grouped.get(name) || 0) + 1);
  });

  return Array.from(grouped.entries())
    .map(([name, quantity]) => `${quantity} x ${name}`)
    .join(" | ");
}

function getBoxDetailsSummary(packedBoxes) {
  return packedBoxes
    .map((packedBox, index) => {
      const itemCount = Array.isArray(packedBox.items) ? packedBox.items.length : 0;
      return `Caixa ${index + 1} - ${packedBox.box.name}: ${itemCount} itens, ${formatPercent(
        packedBox.fillRate,
      )} ocupação, ${formatNumber(packedBox.totalWeight)} kg`;
    })
    .join(" | ");
}

function renderHistory() {
  if (!elements.historyList) {
    return;
  }

  elements.historyList.innerHTML = "";
  const records = getFilteredHistoryRecords();
  elements.historyList.classList.toggle("empty-state", !records.length);

  if (!state.history.length) {
    elements.historyList.textContent = "Nenhum cálculo salvo no histórico.";
    return;
  }

  if (!records.length) {
    elements.historyList.textContent = "Nenhum cálculo encontrado com os filtros atuais.";
    return;
  }

  const fragment = document.createDocumentFragment();
  records.forEach((record) => {
    const card = document.createElement("article");
    card.className = "history-card";
    card.dataset.historyId = record.id;
    card.innerHTML = `
      <div class="history-main">
        <div>
          <h3>${escapeHtml(formatHistoryDate(record.createdAt))}</h3>
          <p>${escapeHtml(getHistoryProductsSummary(record.selectedProducts))}</p>
        </div>
        <div class="history-metrics">
          <span><strong>${record.result.packedBoxes.length}</strong> caixas</span>
          <span><strong>${formatPercent(record.result.averageFillRate)}</strong> ocupação média</span>
          <span><strong>${formatNumber(record.result.totalWeight)} kg</strong> peso</span>
          <span><strong>${record.result.unpacked.length}</strong> sem caixa</span>
        </div>
      </div>
      <div class="history-actions">
        <button class="ghost-button history-open-button" type="button" data-history-action="open">Reabrir</button>
        <button class="ghost-button history-export-button" type="button" data-history-action="export">CSV</button>
        <button class="ghost-button history-report-button" type="button" data-history-action="report">Relatório</button>
      </div>
    `;

    fragment.append(card);
  });
  elements.historyList.append(fragment);
}

function handleHistoryListClick(event) {
  const button = event.target.closest("[data-history-action]");
  if (!button) {
    return;
  }

  const card = button.closest(".history-card[data-history-id]");
  if (!card) {
    return;
  }

  const id = card.dataset.historyId;
  if (button.dataset.historyAction === "open") {
    openHistoryRecord(id);
    return;
  }
  if (button.dataset.historyAction === "export") {
    exportHistoryRecordCsv(id);
    return;
  }
  if (button.dataset.historyAction === "report") {
    printHistoryRecordReport(id);
  }
}

function getFilteredHistoryRecords() {
  const search = elements.historyFilterSearch.value.trim().toLowerCase();
  const start = elements.historyFilterStart.value ? new Date(`${elements.historyFilterStart.value}T00:00:00`) : null;
  const end = elements.historyFilterEnd.value ? new Date(`${elements.historyFilterEnd.value}T23:59:59`) : null;

  return state.history.filter((record) => {
    const createdAt = new Date(record.createdAt);
    if (start && createdAt < start) {
      return false;
    }
    if (end && createdAt > end) {
      return false;
    }
    if (!search) {
      return true;
    }
    return getHistorySearchText(record).includes(search);
  });
}

function getHistorySearchText(record) {
  const boxes = (record.result?.packedBoxes || []).map((packedBox) => packedBox.box.name).join(" ");
  const products = (record.selectedProducts || []).map((product) => product.name).join(" ");
  return `${products} ${boxes} ${formatHistoryDate(record.createdAt)}`.toLowerCase();
}

function openHistoryRecord(id) {
  const record = state.history.find((item) => item.id === id);
  if (!record) {
    return;
  }

  const restored = restoreHistoryRecordSelection(record);
  const result = cloneForStorage(record.result);
  const selectedProducts = cloneForStorage(record.selectedProducts);
  lastPacking = { result, selectedProducts };
  render();
  renderResults(result, selectedProducts);
  setResultStatus(result.unpacked.length ? "Histórico parcial" : "Histórico", "history");
  setBarcodeScanStatus(`${restored.loaded} produto(s) do histórico carregado(s) para edição.`, "ready");
  if (restored.restoredProducts > 0) {
    setBarcodeScanStatus(`${restored.loaded} produto(s) carregado(s). ${restored.restoredProducts} produto(s) restaurado(s) no cadastro.`, "ready");
  }
  if (restored.skipped > 0) {
    window.alert(`${restored.skipped} produto(s) do histórico não puderam ser restaurados por falta de dimensões válidas.`);
  }
  document.querySelector(".barcode-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  elements.barcodeScanInput.focus({ preventScroll: true });
}

function restoreHistoryRecordSelection(record) {
  const selectedProducts = Array.isArray(record.selectedProducts) ? record.selectedProducts : [];
  state.selection = {};
  barcodeReadUndoStack = [];
  state.calculationMeta = normalizeCalculationMeta(record.meta);
  elements.productSearch.value = "";

  let loaded = 0;
  let restoredProducts = 0;
  let skipped = 0;

  selectedProducts.forEach((product) => {
    const targetId = getOrRestoreHistoryProduct(product);
    if (!targetId) {
      skipped += 1;
      return;
    }

    const quantity = Math.max(0, Math.floor(Number(product.quantity) || 0));
    if (quantity <= 0) {
      return;
    }

    state.selection[targetId] = quantity;
    state.selectionOptions[targetId] = normalizeSelectionOptions(product);
    loaded += 1;
    if (targetId === product.id && !state.products.some((item) => item.id === product.id && item !== product)) {
      // Contagem ajustada em getOrRestoreHistoryProduct.
    }
  });

  restoredProducts = state.products.filter((product) => product.restoredFromHistory === true).length;
  state.products = state.products.map((product) => {
    if (!product.restoredFromHistory) {
      return product;
    }
    const copy = { ...product };
    delete copy.restoredFromHistory;
    return copy;
  });
  invalidateProductCache();

  saveState();
  return { loaded, restoredProducts, skipped };
}

function getOrRestoreHistoryProduct(product) {
  if (!product) {
    return null;
  }

  const barcode = normalizeBarcode(product.barcode);
  const name = normalizeImportName(product.name);
  const byId = product.id ? state.products.find((item) => item.id === product.id) : null;
  if (byId) {
    return byId.id;
  }

  const byBarcode = barcode ? state.products.find((item) => normalizeBarcode(item.barcode) === barcode) : null;
  if (byBarcode) {
    return byBarcode.id;
  }

  const byName = name ? state.products.find((item) => normalizeImportName(item.name) === name) : null;
  if (byName) {
    return byName.id;
  }

  const restoredProduct = normalizeProduct(product);
  if (!hasValidDimensions(restoredProduct)) {
    return null;
  }

  restoredProduct.restoredFromHistory = true;
  state.products.push(restoredProduct);
  return restoredProduct.id;
}

function cloneForStorage(value) {
  return JSON.parse(JSON.stringify(value));
}

function formatHistoryDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Cálculo salvo";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getHistoryProductsSummary(products) {
  if (!products.length) {
    return "Sem produtos registrados";
  }

  const summary = products
    .slice(0, 3)
    .map((product) => `${product.quantity} x ${product.name}`)
    .join(", ");
  const remaining = products.length > 3 ? ` +${products.length - 3}` : "";
  return `${summary}${remaining}`;
}

function getSelectionOptions(productId) {
  return {
    ...DEFAULT_SELECTION_OPTIONS,
    ...(state.selectionOptions[productId] || {}),
  };
}

function updateSelectionOption(productId, option, value) {
  state.selectionOptions[productId] = {
    ...getSelectionOptions(productId),
    [option]: value,
  };
  scheduleStateSave();
}

function getSelectedItems() {
  const productsById = getProductCache().productsById;
  return Object.entries(state.selection)
    .map(([productId, selectedQuantity]) => {
      const product = productsById.get(productId);
      if (!product) {
        return null;
      }
      return {
        ...product,
        ...getSelectionOptions(productId),
        quantity: Math.max(0, Math.floor(Number(selectedQuantity) || 0)),
      };
    })
    .filter(Boolean)
    .filter((product) => product.quantity > 0);
}

function calculatePacking(boxes, selectedProducts) {
  if (!boxes.length) {
    return { packedBoxes: [], unpacked: [], error: "Cadastre pelo menos uma caixa." };
  }

  if (!selectedProducts.length) {
    return { packedBoxes: [], unpacked: [], error: "Selecione pelo menos um produto." };
  }

  const boxOptions = boxes
    .map((box) => ({
      ...normalizeBox(box),
      volume: getVolume(box),
    }))
    .filter(hasValidDimensions)
    .sort((a, b) => a.volume - b.volume);

  if (!boxOptions.length) {
    return { packedBoxes: [], unpacked: [], error: "Cadastre uma caixa valida." };
  }

  const items = expandProducts(selectedProducts);
  const plans = packingStrategies.map((strategy) => buildPackingPlan(boxOptions, items, strategy));
  return plans.sort(comparePlans)[0];
}

function buildPackingPlan(boxOptions, sourceItems, strategy) {
  const remaining = sortItemsForStrategy(
    sourceItems.map((item) => ({ ...item })),
    strategy,
  );
  const unpacked = [];
  const packedBoxes = [];
  const usedBoxCounts = new Map();

  while (remaining.length) {
    const availableBoxes = boxOptions.filter((box) => {
      const used = usedBoxCounts.get(box.id) || 0;
      return used < getBoxStock(box);
    });

    if (!availableBoxes.length) {
      unpacked.push(
        ...remaining.splice(0).map((item) => ({
          ...item,
          unpackedReason: "estoque de caixas insuficiente",
        })),
      );
      break;
    }

    const hasPackableItem = remaining.some((item) =>
      availableBoxes.some((box) => itemFitsEmptyBox(item, box)),
    );

    if (!hasPackableItem) {
      unpacked.push(
        ...remaining.splice(0).map((item) => ({
          ...item,
          unpackedReason: boxOptions.some((box) => itemFitsEmptyBox(item, box))
            ? "estoque de caixas insuficiente"
            : "",
        })),
      );
      break;
    }

    const simulations = availableBoxes
      .map((box) => simulateBox(box, remaining, strategy))
      .filter((simulation) => simulation.items.length > 0)
      .sort(compareSimulations);

    if (!simulations.length) {
      const blockedIndex = remaining.findIndex(
        (item) => !boxOptions.some((box) => itemFitsEmptyBox(item, box)),
      );
      unpacked.push(remaining.splice(blockedIndex >= 0 ? blockedIndex : 0, 1)[0]);
      continue;
    }

    const best = getBestSimulationForRemaining(simulations, remaining.length);
    packedBoxes.push(createPackedBox(best));
    usedBoxCounts.set(best.box.id, (usedBoxCounts.get(best.box.id) || 0) + 1);

    const packedIds = new Set(best.items.map((item) => item.instanceId));
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      if (packedIds.has(remaining[index].instanceId)) {
        remaining.splice(index, 1);
      }
    }
  }

  return createPlanResult(packedBoxes, unpacked, strategy.name);
}

function getBestSimulationForRemaining(simulations, remainingCount) {
  const completeSimulations = simulations
    .filter((simulation) => simulation.items.length === remainingCount)
    .sort(compareCompleteSimulations);

  return completeSimulations[0] || simulations[0];
}

function expandProducts(products) {
  return products.flatMap((product) => {
    const normalized = normalizeProduct(product);
    const quantity = Math.max(0, Math.floor(Number(product.quantity) || 0));
    return Array.from({ length: quantity }, (_, index) => ({
      ...normalized,
      instanceId: `${normalized.id}-${index}`,
      volume: getVolume(normalized),
      packingVolume: getPackingVolume(normalized),
    }));
  });
}

function simulateBox(box, candidates, strategy) {
  const spaces = [
    {
      x: 0,
      y: 0,
      z: 0,
      width: box.width,
      height: box.height,
      length: box.length,
    },
  ];
  const items = [];
  let usedVolume = 0;
  let totalWeight = 0;

  sortItemsForStrategy(candidates.slice(), strategy).forEach((item) => {
    if (!canAddItemToBox(item, box, totalWeight)) {
      return;
    }

    const placement = findPlacement(item, spaces, items);
    if (!placement) {
      return;
    }

    items.push({
      ...item,
      placed: placement,
    });
    usedVolume += item.volume;
    totalWeight += item.weight;
    splitSpace(spaces, placement.spaceIndex, placement, item);
  });

  return {
    box,
    items,
    usedVolume,
    totalWeight,
    fillRate: usedVolume / box.volume,
  };
}

function canAddItemToBox(item, box, currentWeight) {
  const maxWeight = getBoxMaxWeight(box);

  return (
    itemFitsEmptyBox(item, box) &&
    currentWeight + item.weight <= maxWeight + EPSILON
  );
}

function itemFitsEmptyBox(item, box) {
  return (
    hasValidDimensions(item) &&
    hasValidWeight(item) &&
    item.weight <= getBoxMaxWeight(box) + EPSILON &&
    getOrientations(item).some((orientation) => fitsInSpace(orientation, box))
  );
}

function hasValidWeight(item) {
  return Number.isFinite(Number(item.weight)) && Number(item.weight) >= 0;
}

function findPlacement(item, spaces, packedItems = []) {
  let best = null;
  const orientations = getOrientations(item);

  spaces.forEach((space, spaceIndex) => {
    orientations.forEach((orientation) => {
      if (!fitsInSpace(orientation, space)) {
        return;
      }

      const score = getSpaceVolume(space) - getPackingVolume(orientation);
      const candidate = {
        ...orientation,
        x: space.x,
        y: space.y,
        z: space.z,
        space,
        spaceIndex,
        score,
      };

      if (placementOverlapsItems(candidate, packedItems)) {
        return;
      }

      if (!best || comparePlacements(candidate, best) < 0) {
        best = candidate;
      }
    });
  });

  return best;
}

function placementOverlapsItems(placement, packedItems) {
  return packedItems.some((item) => placementsOverlap(placement, item.placed));
}

function placementsOverlap(a, b) {
  if (!a || !b) {
    return false;
  }

  return (
    rangesOverlap(a.x, a.x + a.width, b.x, b.x + b.width) &&
    rangesOverlap(a.y, a.y + a.height, b.y, b.y + b.height) &&
    rangesOverlap(a.z, a.z + a.length, b.z, b.z + b.length)
  );
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd - EPSILON && bStart < aEnd - EPSILON;
}

function comparePlacements(a, b) {
  return (
    a.score - b.score ||
    a.y - b.y ||
    a.z - b.z ||
    a.x - b.x ||
    a.height - b.height ||
    a.width - b.width
  );
}

function splitSpace(spaces, spaceIndex, placement, item) {
  const original = spaces.splice(spaceIndex, 1)[0];
  const rightWidth = original.width - placement.width;
  const frontLength = original.length - placement.length;
  const topHeight = original.height - placement.height;

  const nextSpaces = [
    {
      x: original.x + placement.width,
      y: original.y,
      z: original.z,
      width: rightWidth,
      height: original.height,
      length: original.length,
    },
    {
      x: original.x,
      y: original.y,
      z: original.z + placement.length,
      width: placement.width,
      height: original.height,
      length: frontLength,
    },
  ];

  if (item.stackable && !item.fragile) {
    nextSpaces.push({
      x: original.x,
      y: original.y + placement.height,
      z: original.z,
      width: placement.width,
      height: topHeight,
      length: placement.length,
    });
  }

  nextSpaces
    .filter((space) => space.width > EPSILON && space.height > EPSILON && space.length > EPSILON)
    .forEach((space) => spaces.push(space));

  spaces.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x || getSpaceVolume(a) - getSpaceVolume(b));
}

function compareSimulations(a, b) {
  return (
    b.fillRate - a.fillRate ||
    a.box.volume - b.box.volume ||
    b.usedVolume - a.usedVolume ||
    b.items.length - a.items.length ||
    b.totalWeight - a.totalWeight
  );
}

function compareCompleteSimulations(a, b) {
  return (
    a.box.volume - b.box.volume ||
    b.fillRate - a.fillRate ||
    getSimulationFreeVolume(a) - getSimulationFreeVolume(b) ||
    b.usedVolume - a.usedVolume ||
    b.totalWeight - a.totalWeight
  );
}

function getSimulationFreeVolume(simulation) {
  return simulation.box.volume - simulation.usedVolume;
}

function comparePlans(a, b) {
  return (
    a.unpacked.length - b.unpacked.length ||
    a.packedBoxes.length - b.packedBoxes.length ||
    b.firstBoxFillRate - a.firstBoxFillRate ||
    a.firstBoxFreeVolume - b.firstBoxFreeVolume ||
    a.freeVolume - b.freeVolume ||
    b.averageFillRate - a.averageFillRate ||
    a.weightSpread - b.weightSpread
  );
}

function sortItemsForStrategy(items, strategy) {
  return items.sort((a, b) => {
    const stackPriority = getStackPriority(a) - getStackPriority(b);
    if (stackPriority !== 0) {
      return stackPriority;
    }

    if (strategy.order === "weight") {
      return b.weight - a.weight || b.volume - a.volume || compareNames(a, b);
    }

    if (strategy.order === "side") {
      return getLargestSide(b) - getLargestSide(a) || b.volume - a.volume || compareNames(a, b);
    }

    if (strategy.order === "base") {
      return getLargestBaseArea(b) - getLargestBaseArea(a) || b.volume - a.volume || compareNames(a, b);
    }

    return b.volume - a.volume || b.weight - a.weight || compareNames(a, b);
  });
}

function getStackPriority(item) {
  return item.fragile || !item.stackable ? 1 : 0;
}

function getLargestSide(item) {
  return Math.max(item.width, item.height, item.length);
}

function getLargestBaseArea(item) {
  const width = Number(item.width) || 0;
  const height = Number(item.height) || 0;
  const length = Number(item.length) || 0;
  const largest = Math.max(width, height, length);
  const smallest = Math.min(width, height, length);
  return largest * (width + height + length - largest - smallest);
}

function compareNames(a, b) {
  return compareText(a.name, b.name);
}

function getOrientations(item) {
  const cacheKey = [
    item.canRotate === true ? "1" : "0",
    item.keepUpright === true ? "1" : "0",
    isRoundProduct(item) ? "round" : "box",
    item.width,
    item.height,
    item.length,
  ].join("|");
  const cached = orientationCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let orientations;
  if (!item.canRotate) {
    orientations = [createOrientation(item.width, item.height, item.length)];
  } else if (item.keepUpright) {
    orientations = getUprightOrientations(item);
  } else if (isRoundProduct(item)) {
    orientations = getAxisAlignedOrientations(item);
  } else {
    orientations = getFreeRotationOrientations(item);
  }

  if (orientationCache.size >= ORIENTATION_CACHE_LIMIT) {
    orientationCache.clear();
  }
  orientationCache.set(cacheKey, orientations);
  return orientations;
}

function getAxisAlignedOrientations(item) {
  const dimensions = [item.width, item.height, item.length];
  return getUniqueOrientations([
    [dimensions[0], dimensions[1], dimensions[2]],
    [dimensions[0], dimensions[2], dimensions[1]],
    [dimensions[1], dimensions[0], dimensions[2]],
    [dimensions[1], dimensions[2], dimensions[0]],
    [dimensions[2], dimensions[0], dimensions[1]],
    [dimensions[2], dimensions[1], dimensions[0]],
  ]);
}

function getUprightOrientations(item) {
  if (isRoundProduct(item)) {
    return getUniqueOrientations([
      createOrientation(item.width, item.height, item.length),
      createOrientation(item.length, item.height, item.width),
    ]);
  }

  return getUniqueOrientations(
    getRotationAngles(UPRIGHT_ROTATION_STEP_DEGREES)
      .map((angle) => createRotatedBoxOrientation(item, { x: 0, y: angle, z: 0 })),
  );
}

function getFreeRotationOrientations(item) {
  const angles = getRotationAngles(FREE_ROTATION_STEP_DEGREES);
  const orientations = [];

  angles.forEach((x) => {
    angles.forEach((y) => {
      angles.forEach((z) => {
        orientations.push(createRotatedBoxOrientation(item, { x, y, z }));
      });
    });
  });

  return getUniqueOrientations(orientations);
}

function getRotationAngles(step) {
  const angles = [];
  for (let angle = 0; angle < RIGHT_ANGLE_DEGREES; angle += step) {
    angles.push(angle);
  }
  if (angles[angles.length - 1] !== RIGHT_ANGLE_DEGREES) {
    angles.push(RIGHT_ANGLE_DEGREES);
  }
  return angles;
}

function createRotatedBoxOrientation(item, rotation) {
  const extents = getRotatedBoxExtents(item.width, item.height, item.length, rotation);
  const isFreeRotation = !isAxisAlignedRotation(rotation);
  return createOrientation(extents.width, extents.height, extents.length, isFreeRotation ? rotation : null, isFreeRotation);
}

function getRotatedBoxExtents(width, height, length, rotation) {
  const x = degreesToRadians(rotation.x);
  const y = degreesToRadians(rotation.y);
  const z = degreesToRadians(rotation.z);
  const a = Math.cos(x);
  const b = Math.sin(x);
  const c = Math.cos(y);
  const d = Math.sin(y);
  const e = Math.cos(z);
  const f = Math.sin(z);

  const m11 = c * e;
  const m12 = -c * f;
  const m13 = d;
  const m21 = a * f + b * d * e;
  const m22 = a * e - b * d * f;
  const m23 = -b * c;
  const m31 = b * f - a * d * e;
  const m32 = b * e + a * d * f;
  const m33 = a * c;

  return {
    width: Math.abs(m11) * width + Math.abs(m12) * height + Math.abs(m13) * length,
    height: Math.abs(m21) * width + Math.abs(m22) * height + Math.abs(m23) * length,
    length: Math.abs(m31) * width + Math.abs(m32) * height + Math.abs(m33) * length,
  };
}

function createOrientation(width, height, length, rotation = null, freeRotation = false) {
  const orientation = {
    width: normalizeOrientationSize(width),
    height: normalizeOrientationSize(height),
    length: normalizeOrientationSize(length),
  };

  if (rotation) {
    orientation.rotation = normalizeRotation(rotation);
  }
  if (freeRotation) {
    orientation.freeRotation = true;
  }

  return orientation;
}

function normalizeOrientationSize(value) {
  const rounded = Number(Number(value || 0).toFixed(4));
  return Math.abs(rounded) < EPSILON ? 0 : rounded;
}

function normalizeRotation(rotation) {
  return {
    x: normalizeRotationAngle(rotation.x),
    y: normalizeRotationAngle(rotation.y),
    z: normalizeRotationAngle(rotation.z),
  };
}

function normalizeRotationAngle(value) {
  const normalized = Number(Number(value || 0).toFixed(2));
  return Math.abs(normalized) < EPSILON ? 0 : normalized;
}

function isAxisAlignedRotation(rotation) {
  return [rotation.x, rotation.y, rotation.z].every((angle) => {
    const normalized = Math.abs(normalizeRotationAngle(angle)) % RIGHT_ANGLE_DEGREES;
    return normalized <= EPSILON || RIGHT_ANGLE_DEGREES - normalized <= EPSILON;
  });
}

function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function getUniqueOrientations(permutations) {
  const seen = new Set();
  const orientations = [];
  permutations.forEach((permutation) => {
    const orientation = Array.isArray(permutation)
      ? createOrientation(permutation[0], permutation[1], permutation[2])
      : permutation;
    const key = `${orientation.width}|${orientation.height}|${orientation.length}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    orientations.push(orientation);
  });
  return orientations;
}

function fitsInSpace(item, space) {
  return (
    item.width <= space.width + EPSILON &&
    item.height <= space.height + EPSILON &&
    item.length <= space.length + EPSILON
  );
}

function createPackedBox(simulation) {
  const boxVolume = simulation.box.volume;
  const freeVolume = Math.max(0, boxVolume - simulation.usedVolume);
  const weightCapacity = getBoxMaxWeight(simulation.box);
  const weightRate = Number.isFinite(weightCapacity) ? simulation.totalWeight / weightCapacity : null;
  const warnings = [];
  const fillRate = simulation.usedVolume / boxVolume;

  if (fillRate < 0.35) {
    warnings.push("Baixa ocupação de volume.");
  }
  if (weightRate !== null && weightRate >= 0.9) {
    warnings.push("Peso perto do limite da caixa.");
  }

  return {
    box: simulation.box,
    items: simulation.items,
    usedVolume: simulation.usedVolume,
    freeVolume,
    fillRate,
    totalWeight: simulation.totalWeight,
    weightCapacity,
    weightRate,
    warnings,
  };
}

function createPlanResult(packedBoxes, unpacked, strategyName) {
  const orderedBoxes = packedBoxes.slice().sort(comparePackedBoxesByFill);
  const usedVolume = packedBoxes.reduce((sum, packedBox) => sum + packedBox.usedVolume, 0);
  const freeVolume = packedBoxes.reduce((sum, packedBox) => sum + packedBox.freeVolume, 0);
  const totalWeight = packedBoxes.reduce((sum, packedBox) => sum + packedBox.totalWeight, 0);
  const averageFillRate = packedBoxes.length
    ? packedBoxes.reduce((sum, packedBox) => sum + packedBox.fillRate, 0) / packedBoxes.length
    : 0;
  const weights = packedBoxes.map((packedBox) => packedBox.totalWeight);
  const weightSpread = weights.length ? Math.max(...weights) - Math.min(...weights) : 0;

  return {
    packedBoxes: orderedBoxes,
    unpacked,
    strategyName,
    usedVolume,
    freeVolume,
    totalWeight,
    averageFillRate,
    weightSpread,
    firstBoxFillRate: orderedBoxes[0] ? orderedBoxes[0].fillRate : 0,
    firstBoxFreeVolume: orderedBoxes[0] ? orderedBoxes[0].freeVolume : 0,
    error: "",
  };
}

function comparePackedBoxesByFill(a, b) {
  return (
    b.fillRate - a.fillRate ||
    a.freeVolume - b.freeVolume ||
    b.usedVolume - a.usedVolume ||
    b.items.length - a.items.length ||
    a.box.volume - b.box.volume
  );
}

function getBoxMaxWeight(box) {
  return box.maxWeight || Number.POSITIVE_INFINITY;
}

function getBoxStock(box) {
  return box.stock === null ? Number.POSITIVE_INFINITY : box.stock;
}

function getVolume(item) {
  if (isRoundProduct(item)) {
    const radius = item.diameter / 2;
    return Math.PI * radius * radius * item.height;
  }
  return getPackingVolume(item);
}

function getPackingVolume(item) {
  return item.width * item.height * item.length;
}

function getSpaceVolume(space) {
  return space.width * space.height * space.length;
}

function renderResults(result, selectedProducts, options = {}) {
  setExportButtons(false);
  dispose3DViews();
  elements.results.classList.remove("empty-state");
  elements.results.innerHTML = "";

  if (result.error) {
    setResultStatus("Pendente", "pending");
    elements.results.classList.add("empty-state");
    elements.results.textContent = result.error;
    lastPacking = null;
    return;
  }

  setResultStatus(result.unpacked.length ? "Parcial" : "Calculado", result.unpacked.length ? "warning" : "ready");
  setExportButtons(result.packedBoxes.length > 0);

  const totalProducts = selectedProducts.reduce((sum, product) => sum + product.quantity, 0);
  const packedProducts = result.packedBoxes.reduce((sum, box) => sum + box.items.length, 0);

  const summary = document.createElement("div");
  summary.className = "result-summary";
  summary.innerHTML = `
    <div class="metric"><strong>${result.packedBoxes.length}</strong><span>caixas necessárias</span></div>
    <div class="metric"><strong>${packedProducts}/${totalProducts}</strong><span>unidades alocadas</span></div>
    <div class="metric"><strong>${formatNumber(result.totalWeight)} kg</strong><span>peso total</span></div>
    <div class="metric"><strong>${formatPercent(result.averageFillRate)}</strong><span>volume ocupado médio</span></div>
    <div class="metric"><strong>${formatVolume(result.freeVolume)}</strong><span>volume livre</span></div>
  `;
  elements.results.append(summary);
  const validation = renderValidationMessages(result, selectedProducts);
  if (validation) {
    elements.results.append(validation);
  }

  result.packedBoxes.forEach((packedBox, index) => {
    elements.results.append(renderPackedBox(packedBox, index + 1, options));
  });

  applyProductHighlight();

  if (result.unpacked.length) {
    const warning = document.createElement("div");
    warning.className = "warning-box";
    warning.innerHTML = `<strong>Produtos sem caixa compatível:</strong> ${groupItemsByName(result.unpacked)
      .map((item) => `${item.quantity} x ${escapeHtml(item.name)} (${getUnpackedReason(item, state.boxes)})`)
      .join(", ")}`;
    elements.results.append(warning);
  }
}

function renderPackedBox(packedBox, index, options = {}) {
  const article = document.createElement("article");
  article.className = "packed-box";

  const maxWeight = Number.isFinite(packedBox.weightCapacity)
    ? `${formatNumber(packedBox.weightCapacity)} kg max.`
    : "sem limite de peso";

  article.innerHTML = `
    <header>
      <h3>Caixa ${index}: ${escapeHtml(packedBox.box.name)}</h3>
      <div class="box-details">
        <span>${formatDimensions(packedBox.box)}</span>
        <span>${formatPercent(packedBox.fillRate)} volume ocupado</span>
        <span>${formatVolume(packedBox.freeVolume)} livres</span>
        <span>${formatNumber(packedBox.totalWeight)} kg / ${maxWeight}</span>
      </div>
    </header>
  `;

  const boxWarnings = Array.isArray(packedBox.warnings) ? packedBox.warnings : [];
  if (boxWarnings.length) {
    const warnings = document.createElement("div");
    warnings.className = "box-warnings";
    warnings.innerHTML = boxWarnings.map((warning) => `<span>${escapeHtml(warning)}</span>`).join("");
    article.append(warnings);
  }

  article.append(renderBoxDrawing(packedBox, options));

  return article;
}

function renderValidationMessages(result, selectedProducts) {
  const messages = getValidationMessages(result, selectedProducts);
  if (!messages.length) {
    return null;
  }

  const section = document.createElement("section");
  section.className = "validation-list";
  section.innerHTML = messages
    .map(
      (message) => `
        <div class="validation-item ${message.type}">
          <strong>${escapeHtml(message.title)}</strong>
          <span>${escapeHtml(message.text)}</span>
        </div>
      `,
    )
    .join("");
  return section;
}

function getValidationMessages(result, selectedProducts = [], options = {}) {
  const messages = [];

  if (result.unpacked.length) {
    messages.push({
      type: "danger",
      title: "Produtos sem caixa",
      text: groupItemsByName(result.unpacked)
        .map((item) => `${item.quantity} x ${item.name} (${getUnpackedReason(item, state.boxes)})`)
        .join(", "),
    });
  }

  if (options.includeMissingRules) {
    const productsWithoutRules = selectedProducts.filter((product) => {
      const productOptions = getSelectionOptions(product.id);
      return !productOptions.canRotate && !productOptions.keepUpright && !productOptions.stackable && !productOptions.fragile;
    }).length;
    if (productsWithoutRules) {
      messages.push({
        type: "warning",
        title: "Produtos sem regra marcada",
        text: `${productsWithoutRules} produto(s) sem regra marcada.`,
      });
    }
  }

  getUsedBoxCounts(result.packedBoxes).forEach((used, boxId) => {
    const box = state.boxes.find((item) => item.id === boxId);
    if (box && box.stock !== null && used >= box.stock) {
      messages.push({
        type: "warning",
        title: "Estoque de caixa no limite",
        text: `${box.name}: usadas ${used} de ${box.stock} caixas disponíveis.`,
      });
    }
  });

  result.packedBoxes.forEach((packedBox, index) => {
    if (packedBox.fillRate < 0.35) {
      messages.push({
        type: "warning",
        title: `Caixa ${index + 1} com baixa ocupação`,
        text: `${packedBox.box.name} ficou com ${formatPercent(packedBox.fillRate)} de ocupação.`,
      });
    }
    if (packedBox.weightRate !== null && packedBox.weightRate >= 0.9) {
      messages.push({
        type: "warning",
        title: `Caixa ${index + 1} perto do limite de peso`,
        text: `${formatNumber(packedBox.totalWeight)} kg usados de ${formatNumber(packedBox.weightCapacity)} kg.`,
      });
    }
    const restrictedItems = packedBox.items.filter((item) => item.fragile || !item.stackable);
    if (restrictedItems.length) {
      messages.push({
        type: "warning",
        title: `Caixa ${index + 1} com cuidado de empilhamento`,
        text: `${restrictedItems.length} produto(s) frágil ou não empilhável. Confira a ordem de colocação.`,
      });
    }
  });

  return messages;
}

function getFinishValidationAlerts(result, selectedProducts = getSelectedItems()) {
  const messages = getValidationMessages(result, selectedProducts, { includeMissingRules: true });

  return {
    critical: messages.filter((message) => message.type === "danger").map(formatFinishValidationAlert),
    warning: messages.filter((message) => message.type !== "danger").map(formatFinishValidationAlert),
  };
}

function formatFinishValidationAlert(message) {
  return `${message.title}: ${message.text}`;
}

function getUsedBoxCounts(packedBoxes) {
  const counts = new Map();
  packedBoxes.forEach((packedBox) => {
    counts.set(packedBox.box.id, (counts.get(packedBox.box.id) || 0) + 1);
  });
  return counts;
}

function renderBoxDrawing(packedBox, options = {}) {
  const section = document.createElement("section");
  section.className = "box-drawing";
  section.innerHTML = `
    <div class="placement-title-row">
      <h4>Visualização da caixa</h4>
      <span>Arraste a visão 3D para girar e use a roda do mouse para aproximar.</span>
    </div>
    <div class="box-3d-view">
      <div class="box-3d-heading">
        <div class="box-3d-heading-copy">
          <h5>Visão 3D dos produtos dentro da caixa</h5>
          <span>Largura = X | Altura = Y | Comprimento = Z</span>
        </div>
        <button class="box-3d-fullscreen-button" type="button" aria-label="Abrir visualização 3D em tela cheia" aria-pressed="false">
          <span class="fullscreen-icon" aria-hidden="true"></span>
          <span class="fullscreen-label">Tela cheia</span>
        </button>
      </div>
      <div class="box-3d-canvas" role="img" aria-label="Visão 3D da caixa ${escapeHtml(packedBox.box.name)}">
        <span class="sr-status">Carregando visualização 3D...</span>
      </div>
    </div>
    ${render3DLegend(packedBox.items)}
    ${renderPlacementOrder(packedBox.items)}
    <div class="box-drawing-grid">
      ${renderProjectionSvg(packedBox, "top")}
      ${renderProjectionSvg(packedBox, "side")}
    </div>
  `;

  section.querySelectorAll(".box-legend-button[data-product-id], .placement-steps li[data-product-id], .product-projection-shape[data-product-id]").forEach((element) => {
    element.addEventListener("click", () => setHighlightedProduct(element.dataset.productId));
  });

  section.querySelector(".box-3d-fullscreen-button")?.addEventListener("click", () => {
    toggle3DFullscreen(section.querySelector(".box-3d-view"));
  });

  requestAnimationFrame(() => {
    scheduleBox3DRender(section.querySelector(".box-3d-canvas"), packedBox, {
      animateProducts: options.animate3D === true,
    });
  });

  return section;
}

function renderPlacementOrder(items) {
  const orderedItems = sortPlacedItems(items);
  return `
    <section class="placement-order" aria-label="Ordem e posição de colocação">
      <div class="placement-order-header">
        <h5>Ordem e posição de colocação</h5>
        <span>Comece pelas camadas mais baixas e siga a ordem numerada.</span>
      </div>
      <ol class="placement-steps">
        ${orderedItems
          .map(
            (item, index) => `
              <li class="${item.id === highlightedProductId ? "placement-step-highlight" : ""}" data-product-id="${escapeHtml(item.id)}">
                <span class="step-number">${index + 1}</span>
                <div class="step-body">
                  <strong>${escapeHtml(item.name)}</strong>
                  <div class="step-meta">
                    <span>${formatPlacementPosition(item.placed)}</span>
                    <span>orientação: ${formatPlacementSize(item.placed)}</span>
                    <span>giro: ${formatRotationApplied(item)}</span>
                    <span>${getPlacementCare(item)}</span>
                  </div>
                </div>
              </li>
            `,
          )
          .join("")}
      </ol>
    </section>
  `;
}

function render3DLegend(items) {
  const groupedItems = groupItemsByName(items);
  if (!groupedItems.length) {
    return "";
  }

  return `
    <section class="box-legend" aria-label="Legenda dos produtos na visualização">
      <div class="box-legend-header">
        <h5>Legenda dos produtos</h5>
        <span>Clique em um produto para destacar no 3D, nas vistas e na ordem.</span>
      </div>
      <div class="box-legend-grid">
        ${groupedItems
          .map((item) => `
            <button class="box-legend-button ${item.id === highlightedProductId ? "legend-highlight" : ""}" type="button" data-product-id="${escapeHtml(item.id)}">
              <span class="legend-swatch" style="background: ${getItemColor(item)}"></span>
              <span class="legend-main">
                <strong>${escapeHtml(item.name)}</strong>
                <small>${item.quantity} un. | ${escapeHtml(getPlacementCare(item))}</small>
              </span>
              <span class="legend-tags">
                ${item.canRotate ? '<span class="legend-tag">Gira</span>' : ""}
                ${item.keepUpright ? '<span class="legend-tag">Em pé</span>' : ""}
                ${item.stackable ? '<span class="legend-tag">Empilha</span>' : '<span class="legend-tag legend-tag-warning">Não empilha</span>'}
                ${item.fragile ? '<span class="legend-tag legend-tag-danger">Frágil</span>' : ""}
              </span>
            </button>
          `)
          .join("")}
      </div>
    </section>
  `;
}

function renderProjectionSvg(packedBox, projection) {
  const svgWidth = 900;
  const svgHeight = 560;
  const padding = 34;
  const plotTop = 58;
  const plotWidth = svgWidth - padding * 2;
  const plotHeight = svgHeight - plotTop - padding;
  const isTop = projection === "top";
  const horizontalSize = packedBox.box.width;
  const verticalSize = isTop ? packedBox.box.length : packedBox.box.height;
  const scale = Math.min(plotWidth / horizontalSize, plotHeight / verticalSize);
  const drawingWidth = horizontalSize * scale;
  const drawingHeight = verticalSize * scale;
  const originX = padding + (plotWidth - drawingWidth) / 2;
  const originY = plotTop + (plotHeight - drawingHeight) / 2;
  const title = isTop ? "Vista superior" : "Vista lateral";
  const verticalLabel = isTop ? "comprimento" : "altura";

  const rects = getProjectionDrawOrder(packedBox.items, projection)
    .map((item) => {
      const placement = item.placed;
      const x = originX + placement.x * scale;
      const width = placement.width * scale;
      const y = isTop
        ? originY + placement.z * scale
        : originY + (packedBox.box.height - placement.y - placement.height) * scale;
      const height = (isTop ? placement.length : placement.height) * scale;
      const color = getItemColor(item);
      const stroke = item.fragile ? "#d92d20" : "#08233f";
      const dash = item.fragile || !item.stackable ? 'stroke-dasharray="5 3"' : "";
      const fontSize = getSvgFontSize(width, height);
      const label = escapeHtml(getSvgLabel(item.name, width));
      const fullLabel = escapeHtml(item.name);
      const shape = renderProductProjectionShape(item, projection, x, y, width, height, color, stroke, dash);

      return `
        <g>
          <title>${fullLabel} | ${formatPlacementPosition(placement)}</title>
          ${shape}
          <text x="${formatSvgNumber(x + width / 2)}" y="${formatSvgNumber(y + height / 2)}" text-anchor="middle" dominant-baseline="middle" font-size="${formatSvgNumber(fontSize)}">${label}</text>
        </g>
      `;
    })
    .join("");

  return `
    <article class="box-svg-card">
      <h5>${title}</h5>
      <svg viewBox="0 0 ${svgWidth} ${svgHeight}" role="img" aria-label="${title} da caixa ${escapeHtml(packedBox.box.name)}">
        <rect x="${formatSvgNumber(originX)}" y="${formatSvgNumber(originY)}" width="${formatSvgNumber(drawingWidth)}" height="${formatSvgNumber(drawingHeight)}" rx="6" fill="#ffffff" stroke="#08233f" stroke-width="2"></rect>
        ${rects}
        <text x="${formatSvgNumber(originX + drawingWidth / 2)}" y="24" text-anchor="middle" font-size="13" fill="#08233f">largura: ${formatNumber(packedBox.box.width)} cm</text>
        <text x="16" y="${formatSvgNumber(originY + drawingHeight / 2)}" text-anchor="middle" font-size="13" fill="#08233f" transform="rotate(-90 16 ${formatSvgNumber(originY + drawingHeight / 2)})">${verticalLabel}: ${formatNumber(verticalSize)} cm</text>
      </svg>
    </article>
  `;
}

function renderProductProjectionShape(item, projection, x, y, width, height, color, stroke, dash) {
  const shapeClass = [
    "product-projection-shape",
    item.fragile ? "product-projection-fragile" : "",
    item.id === highlightedProductId ? "product-projection-highlight" : "",
  ].filter(Boolean).join(" ");
  const attrs = `class="${shapeClass}" data-product-id="${escapeHtml(item.id)}" fill="${color}" fill-opacity="0.78" stroke="${stroke}" stroke-width="2" ${dash}`;
  if (isRoundProduct(item) && shouldRenderRoundProjection(item, projection)) {
    return `<ellipse cx="${formatSvgNumber(x + width / 2)}" cy="${formatSvgNumber(y + height / 2)}" rx="${formatSvgNumber(width / 2)}" ry="${formatSvgNumber(height / 2)}" ${attrs}></ellipse>`;
  }

  const radius = isRoundProduct(item) ? Math.max(4, Math.min(width, height) * 0.22) : 4;
  return `<rect x="${formatSvgNumber(x)}" y="${formatSvgNumber(y)}" width="${formatSvgNumber(width)}" height="${formatSvgNumber(height)}" rx="${formatSvgNumber(radius)}" ${attrs}></rect>`;
}

function shouldRenderRoundProjection(item, projection) {
  const axis = getRoundAxis(item, item.placed);
  return (projection === "top" && axis === "y") || (projection === "side" && axis === "z");
}

function scheduleBox3DRender(container, packedBox, options = {}) {
  if (!container || !container.isConnected) {
    return;
  }

  const startRender = () => {
    if (!container.isConnected || container.dataset.renderStarted === "true") {
      return;
    }
    container.dataset.renderStarted = "true";
    renderBox3D(container, packedBox, options);
  };

  if (!("IntersectionObserver" in window)) {
    startRender();
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        return;
      }
      observer.disconnect();
      pending3DRenderObservers = pending3DRenderObservers.filter((item) => item !== observer);
      startRender();
    },
    {
      rootMargin: "360px 0px",
      threshold: 0.01,
    },
  );

  pending3DRenderObservers.push(observer);
  observer.observe(container);

  requestAnimationFrame(() => {
    if (!container.isConnected || !isElementNearViewport(container, 360)) {
      return;
    }
    observer.disconnect();
    pending3DRenderObservers = pending3DRenderObservers.filter((item) => item !== observer);
    startRender();
  });
}

function isElementNearViewport(element, margin = 0) {
  if (!element || !element.isConnected) {
    return false;
  }

  const bounds = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

  return (
    bounds.bottom >= -margin &&
    bounds.right >= -margin &&
    bounds.top <= viewportHeight + margin &&
    bounds.left <= viewportWidth + margin
  );
}

async function renderBox3D(container, packedBox, options = {}) {
  if (!container || !container.isConnected) {
    return;
  }

  try {
    const THREE = await loadThree();
    if (!container.isConnected) {
      return;
    }

    container.innerHTML = "";
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.append(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, get3DFarPlane(packedBox.box));
    const target = new THREE.Vector3(0, packedBox.box.height / 2, 0);
    const maxSize = Math.max(packedBox.box.width, packedBox.box.height, packedBox.box.length);
    camera.position.set(maxSize * 1.25, packedBox.box.height + maxSize * 0.9, maxSize * 1.35);
    camera.lookAt(target);

    const root = new THREE.Group();
    scene.add(root);

    add3DLights(THREE, scene);
    add3DBoxShell(THREE, root, packedBox.box);
    const productObjects = [];
    sortPlacedItems(packedBox.items).forEach((item, index) => {
      const productObject = add3DProduct(THREE, root, packedBox.box, item, index + 1);
      if (productObject) {
        productObjects.push(productObject);
      }
    });
    let fallAnimation = options.animateProducts && !prefersReducedMotion()
      ? create3DFallAnimation(productObjects, packedBox.box)
      : null;
    let fallStartObserver = null;

    let isDragging = false;
    let lastPointer = { x: 0, y: 0 };
    let rotationX = 0;
    let rotationY = -0.45;
    root.rotation.y = rotationY;

    let view = null;

    const requestRender = () => {
      if (!view || view.animationId) {
        return;
      }
      view.animationId = requestAnimationFrame(renderFrame);
    };

    const resize = () => {
      const width = Math.max(320, container.clientWidth || 320);
      const height = Math.max(360, container.clientHeight || 360);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      requestRender();
    };

    const renderFrame = (timestamp) => {
      view.animationId = 0;
      let keepAnimating = false;
      if (fallAnimation && fallAnimation.started) {
        if (update3DFallAnimation(fallAnimation, timestamp)) {
          fallStartObserver?.disconnect();
          fallStartObserver = null;
          fallAnimation = null;
        } else {
          keepAnimating = true;
        }
      }
      renderer.render(scene, camera);
      if (keepAnimating) {
        requestRender();
      }
    };

    view = {
      camera,
      renderer,
      resizeObserver: new ResizeObserver(resize),
      scene,
      productObjects,
      animationId: 0,
      fallStartObserver: null,
      requestRender,
    };

    active3DViews.push(view);
    apply3DHighlight(view);
    view.resizeObserver.observe(container);
    if (fallAnimation) {
      fallStartObserver = observe3DFallAnimationStart(container, fallAnimation, requestRender);
      view.fallStartObserver = fallStartObserver;
    }
    resize();
    requestRender();

    renderer.domElement.addEventListener("pointerdown", (event) => {
      isDragging = true;
      lastPointer = { x: event.clientX, y: event.clientY };
      renderer.domElement.setPointerCapture(event.pointerId);
    });

    renderer.domElement.addEventListener("pointermove", (event) => {
      if (!isDragging) {
        return;
      }

      const deltaX = event.clientX - lastPointer.x;
      const deltaY = event.clientY - lastPointer.y;
      lastPointer = { x: event.clientX, y: event.clientY };
      rotationY += deltaX * 0.008;
      rotationX = clamp(rotationX + deltaY * 0.006, -0.45, 0.28);
      root.rotation.y = rotationY;
      root.rotation.x = rotationX;
      requestRender();
    });

    renderer.domElement.addEventListener("pointerup", (event) => {
      isDragging = false;
      renderer.domElement.releasePointerCapture(event.pointerId);
    });

    renderer.domElement.addEventListener("wheel", (event) => {
      event.preventDefault();
      camera.zoom = clamp(camera.zoom - event.deltaY * 0.001, 0.65, 2.3);
      camera.updateProjectionMatrix();
      requestRender();
    }, { passive: false });
  } catch (error) {
    container.innerHTML = `<span class="sr-status">Não foi possível carregar a visualização 3D.</span>`;
  }
}

function create3DFallAnimation(productObjects, box) {
  if (!Array.isArray(productObjects) || !productObjects.length) {
    return null;
  }

  const maxSize = Math.max(box.width, box.height, box.length);
  const fallPadding = Math.max(10, maxSize * 0.18);
  const stagger = get3DFallStagger(productObjects.length);
  const items = productObjects.map((productObject, index) => {
    const placementHeight = Number(productObject.placement?.height) || 0;
    const finalY = productObject.group.position.y;
    const startY = box.height + placementHeight / 2 + fallPadding;

    productObject.group.visible = false;
    productObject.group.position.y = startY;

    return {
      productObject,
      delay: PRODUCT_FALL_START_DELAY_MS + index * stagger,
      duration: PRODUCT_FALL_DURATION_MS,
      finalY,
      startY,
      completed: false,
    };
  });

  return {
    completed: false,
    items,
    started: false,
    startTime: 0,
  };
}

function observe3DFallAnimationStart(container, animation, onStart) {
  const startAnimation = () => {
    if (start3DFallAnimation(animation)) {
      onStart?.();
    }
  };

  if (!("IntersectionObserver" in window)) {
    startAnimation();
    return null;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.28)) {
        startAnimation();
        observer.disconnect();
      }
    },
    {
      threshold: [0.28, 0.45, 0.65],
    },
  );

  observer.observe(container);
  requestAnimationFrame(() => {
    if (is3DCanvasVisible(container)) {
      startAnimation();
      observer.disconnect();
    }
  });

  return observer;
}

function start3DFallAnimation(animation, timestamp = performance.now()) {
  if (!animation || animation.started || animation.completed) {
    return false;
  }

  animation.started = true;
  animation.startTime = timestamp;
  return true;
}

function update3DFallAnimation(animation, timestamp) {
  if (!animation || animation.completed) {
    return true;
  }

  if (!animation.started) {
    return false;
  }

  const elapsed = (Number.isFinite(timestamp) ? timestamp : performance.now()) - animation.startTime;
  let completedItems = 0;

  animation.items.forEach((item) => {
    const itemElapsed = elapsed - item.delay;
    if (itemElapsed < 0) {
      return;
    }

    item.productObject.group.visible = true;
    const progress = clamp(itemElapsed / item.duration, 0, 1);
    const easedProgress = easeOutCubic(progress);
    item.productObject.group.position.y = item.startY + (item.finalY - item.startY) * easedProgress;

    if (progress >= 1) {
      item.productObject.group.position.y = item.finalY;
      item.completed = true;
    }

    if (item.completed) {
      completedItems += 1;
    }
  });

  animation.completed = completedItems === animation.items.length;
  return animation.completed;
}

function get3DFallStagger(itemCount) {
  if (itemCount <= 8) {
    return PRODUCT_FALL_STAGGER_SLOW_MS;
  }
  if (itemCount <= 18) {
    return PRODUCT_FALL_STAGGER_BASE_MS;
  }
  return PRODUCT_FALL_STAGGER_FAST_MS;
}

function easeOutCubic(progress) {
  return 1 - Math.pow(1 - progress, 3);
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

function is3DCanvasVisible(container) {
  if (!container || !container.isConnected) {
    return false;
  }

  const bounds = container.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const visibleWidth = Math.min(bounds.right, viewportWidth) - Math.max(bounds.left, 0);
  const visibleHeight = Math.min(bounds.bottom, viewportHeight) - Math.max(bounds.top, 0);

  if (visibleWidth <= 0 || visibleHeight <= 0 || bounds.width <= 0 || bounds.height <= 0) {
    return false;
  }

  const visibleRatio = (visibleWidth * visibleHeight) / (bounds.width * bounds.height);
  return visibleRatio >= 0.28;
}

function toggle3DFullscreen(viewElement) {
  if (!viewElement) {
    return;
  }

  if (is3DViewFullscreen(viewElement)) {
    exit3DFullscreen(viewElement);
    return;
  }

  enter3DFullscreen(viewElement);
}

function enter3DFullscreen(viewElement) {
  document.querySelectorAll(".box-3d-view.is-expanded").forEach((expandedView) => {
    if (expandedView !== viewElement) {
      set3DExpandedFallback(expandedView, false);
    }
  });

  if (typeof viewElement.requestFullscreen === "function") {
    try {
      const fullscreenRequest = viewElement.requestFullscreen();
      if (fullscreenRequest && typeof fullscreenRequest.catch === "function") {
        fullscreenRequest.catch(() => {
          set3DExpandedFallback(viewElement, true);
        });
      }
    } catch {
      set3DExpandedFallback(viewElement, true);
    }
    return;
  }

  set3DExpandedFallback(viewElement, true);
}

function exit3DFullscreen(viewElement) {
  if (document.fullscreenElement === viewElement && typeof document.exitFullscreen === "function") {
    const fullscreenExit = document.exitFullscreen();
    if (fullscreenExit && typeof fullscreenExit.catch === "function") {
      fullscreenExit.catch(() => {});
    }
    return;
  }

  set3DExpandedFallback(viewElement, false);
}

function closeExpanded3DView() {
  const expandedView = document.querySelector(".box-3d-view.is-expanded");
  if (expandedView) {
    set3DExpandedFallback(expandedView, false);
    return true;
  }

  if (document.fullscreenElement?.classList.contains("box-3d-view") && typeof document.exitFullscreen === "function") {
    const fullscreenExit = document.exitFullscreen();
    if (fullscreenExit && typeof fullscreenExit.catch === "function") {
      fullscreenExit.catch(() => {});
    }
    return true;
  }

  return false;
}

function set3DExpandedFallback(viewElement, expanded) {
  viewElement.classList.toggle("is-expanded", expanded);
  sync3DFullscreenState();
}

function sync3DFullscreenState() {
  const hasExpanded3DView = Boolean(
    document.querySelector(".box-3d-view.is-expanded") ||
      document.fullscreenElement?.classList.contains("box-3d-view"),
  );
  document.body.classList.toggle("has-3d-expanded", hasExpanded3DView);
  update3DFullscreenButtons();
}

function is3DViewFullscreen(viewElement) {
  return document.fullscreenElement === viewElement || viewElement.classList.contains("is-expanded");
}

function update3DFullscreenButtons() {
  document.querySelectorAll(".box-3d-view").forEach((viewElement) => {
    const button = viewElement.querySelector(".box-3d-fullscreen-button");
    if (!button) {
      return;
    }

    const isFullscreen = is3DViewFullscreen(viewElement);
    button.setAttribute("aria-pressed", String(isFullscreen));
    button.setAttribute(
      "aria-label",
      isFullscreen ? "Sair da tela cheia da visualização 3D" : "Abrir visualização 3D em tela cheia",
    );

    const label = button.querySelector(".fullscreen-label");
    if (label) {
      label.textContent = isFullscreen ? "Sair" : "Tela cheia";
    }
  });
}

function loadThree() {
  if (!threeModulePromise) {
    threeModulePromise = import("./node_modules/three/build/three.module.js");
  }
  return threeModulePromise;
}

function add3DLights(THREE, scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xf2a000, 2.4));

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(90, 120, 80);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.7);
  fillLight.position.set(-70, 70, -90);
  scene.add(fillLight);
}

function add3DBoxShell(THREE, root, box) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(box.width, box.length),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  root.add(floor);

  const boxGeometry = new THREE.BoxGeometry(box.width, box.height, box.length);
  const edges = new THREE.EdgesGeometry(boxGeometry);
  const shell = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0x08233f, transparent: true, opacity: 0.72 }),
  );
  shell.position.y = box.height / 2;
  root.add(shell);

  const gridSize = Math.max(box.width, box.length);
  const divisions = Math.max(2, Math.min(24, Math.round(gridSize / 5)));
  const grid = new THREE.GridHelper(gridSize, divisions, 0x08233f, 0xf2a000);
  grid.position.y = 0.03;
  root.add(grid);
}

function add3DProduct(THREE, root, box, item, order) {
  const placement = item.placed;
  const color = new THREE.Color(getItemColor(item));
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.58,
    metalness: 0.03,
    transparent: true,
    opacity: 0.86,
  });
  const geometry = create3DProductGeometry(THREE, item, placement);
  const group = new THREE.Group();
  group.userData.productId = item.id;
  group.position.set(
    placement.x + placement.width / 2 - box.width / 2,
    placement.y + placement.height / 2,
    placement.z + placement.length / 2 - box.length / 2,
  );

  const mesh = new THREE.Mesh(geometry, material);
  apply3DProductRotation(mesh, item, placement);
  group.add(mesh);

  const edgeMaterial = new THREE.LineBasicMaterial({
    color: item.fragile ? 0xd92d20 : 0x08233f,
    transparent: true,
    opacity: 0.88,
  });
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
  apply3DProductRotation(edge, item, placement);
  group.add(edge);

  const label = create3DLabel(THREE, `${order}`);
  label.position.set(0, placement.height / 2 + getLabelLift(box), 0);
  label.scale.setScalar(getLabelScale(box));
  group.add(label);

  root.add(group);
  return {
    productId: item.id,
    fragile: item.fragile,
    placement,
    group,
    mesh,
    material,
    edgeMaterial,
    label,
  };
}

function create3DProductGeometry(THREE, item, placement) {
  if (!isRoundProduct(item)) {
    if (shouldRenderRotatedBox(item, placement)) {
      return new THREE.BoxGeometry(item.width, item.height, item.length);
    }
    return new THREE.BoxGeometry(placement.width, placement.height, placement.length);
  }

  const axis = getRoundAxis(item, placement);
  let radius = Math.min(placement.width, placement.length) / 2;
  let depth = placement.height;
  const geometry = (() => {
    if (axis === "x") {
      radius = Math.min(placement.height, placement.length) / 2;
      depth = placement.width;
      const cylinder = new THREE.CylinderGeometry(radius, radius, depth, 48);
      cylinder.rotateZ(Math.PI / 2);
      return cylinder;
    }

    if (axis === "z") {
      radius = Math.min(placement.width, placement.height) / 2;
      depth = placement.length;
      const cylinder = new THREE.CylinderGeometry(radius, radius, depth, 48);
      cylinder.rotateX(Math.PI / 2);
      return cylinder;
    }

    return new THREE.CylinderGeometry(radius, radius, depth, 48);
  })();

  return geometry;
}

function shouldRenderRotatedBox(item, placement) {
  return !isRoundProduct(item) && Boolean(placement.rotation);
}

function apply3DProductRotation(object, item, placement) {
  if (!shouldRenderRotatedBox(item, placement)) {
    return;
  }

  object.rotation.set(
    degreesToRadians(placement.rotation.x),
    degreesToRadians(placement.rotation.y),
    degreesToRadians(placement.rotation.z),
  );
}

function create3DLabel(THREE, text) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#08233f";
  context.beginPath();
  context.arc(64, 64, 46, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#ffffff";
  context.lineWidth = 8;
  context.stroke();
  context.fillStyle = "#ffffff";
  context.font = "bold 58px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 64, 67);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  return new THREE.Sprite(material);
}

function get3DFarPlane(box) {
  return Math.max(box.width, box.height, box.length) * 20 + 100;
}

function getLabelLift(box) {
  return Math.max(1.5, Math.max(box.width, box.height, box.length) * 0.025);
}

function getLabelScale(box) {
  return Math.max(4, Math.max(box.width, box.height, box.length) * 0.12);
}

function setHighlightedProduct(productId, options = {}) {
  highlightedProductId = productId || null;
  applyProductHighlight();
  if (options.scrollToResults) {
    scrollToHighlightedProduct();
  }
}

function applyProductHighlight() {
  document.querySelectorAll(".barcode-read-item[data-product-id]").forEach((item) => {
    item.classList.toggle("barcode-read-item-active", item.dataset.productId === highlightedProductId);
  });
  document.querySelectorAll("#selection-table tr[data-product-id]").forEach((row) => {
    row.classList.toggle("selection-row-highlight", row.dataset.productId === highlightedProductId);
  });
  document.querySelectorAll(".placement-steps li[data-product-id]").forEach((item) => {
    item.classList.toggle("placement-step-highlight", item.dataset.productId === highlightedProductId);
  });
  document.querySelectorAll(".box-legend-button[data-product-id]").forEach((button) => {
    button.classList.toggle("legend-highlight", button.dataset.productId === highlightedProductId);
  });
  document.querySelectorAll(".product-projection-shape[data-product-id]").forEach((shape) => {
    shape.classList.toggle("product-projection-highlight", shape.dataset.productId === highlightedProductId);
  });
  active3DViews.forEach(apply3DHighlight);
}

function apply3DHighlight(view) {
  if (!view || !Array.isArray(view.productObjects)) {
    return;
  }

  const hasHighlight = Boolean(highlightedProductId);
  view.productObjects.forEach((object) => {
    const isHighlighted = hasHighlight && object.productId === highlightedProductId;
    const isMuted = hasHighlight && !isHighlighted;
    object.group.scale.setScalar(isHighlighted ? 1.045 : 1);
    object.material.opacity = isMuted ? 0.24 : 0.86;
    if (object.material.emissive) {
      object.material.emissive.set(isHighlighted ? 0xf2a000 : 0x000000);
      object.material.emissiveIntensity = isHighlighted ? 0.32 : 0;
    }
    object.material.needsUpdate = true;
    object.edgeMaterial.opacity = isMuted ? 0.2 : 0.95;
    object.edgeMaterial.color.set(isHighlighted ? 0xf2a000 : object.fragile ? 0xd92d20 : 0x08233f);
    object.edgeMaterial.needsUpdate = true;
    if (object.label && object.label.material) {
      object.label.material.opacity = isMuted ? 0.35 : 1;
      object.label.material.needsUpdate = true;
    }
  });
  view.requestRender?.();
}

function scrollToHighlightedProduct() {
  if (!highlightedProductId) {
    return;
  }

  const target = Array.from(document.querySelectorAll(".placement-steps li[data-product-id], .box-legend-button[data-product-id]"))
    .find((element) => element.dataset.productId === highlightedProductId);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function dispose3DViews() {
  pending3DRenderObservers.forEach((observer) => observer.disconnect());
  pending3DRenderObservers = [];

  document.querySelectorAll(".box-3d-view.is-expanded").forEach((viewElement) => {
    viewElement.classList.remove("is-expanded");
  });
  if (document.fullscreenElement?.classList.contains("box-3d-view") && typeof document.exitFullscreen === "function") {
    const fullscreenExit = document.exitFullscreen();
    if (fullscreenExit && typeof fullscreenExit.catch === "function") {
      fullscreenExit.catch(() => {});
    }
  }

  active3DViews.forEach((view) => {
    cancelAnimationFrame(view.animationId);
    view.resizeObserver.disconnect();
    view.fallStartObserver?.disconnect();
    disposeObject3D(view.scene);
    view.renderer.dispose();
    view.renderer.forceContextLoss();
    view.renderer.domElement.remove();
  });
  active3DViews = [];
  sync3DFullscreenState();
}

function disposeObject3D(object) {
  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        Object.values(material).forEach((value) => {
          if (value && typeof value.dispose === "function") {
            value.dispose();
          }
        });
        material.dispose();
      });
    }
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getProjectionDrawOrder(items, projection) {
  return items.slice().sort((a, b) => {
    const placeA = a.placed;
    const placeB = b.placed;

    if (projection === "top") {
      return placeA.y - placeB.y || placeA.z - placeB.z || placeA.x - placeB.x;
    }

    return placeA.z - placeB.z || placeA.y - placeB.y || placeA.x - placeB.x;
  });
}

function getItemColor(item) {
  const palette = [
    "#f2a000",
    "#2f80ed",
    "#27ae60",
    "#eb5757",
    "#9b51e0",
    "#00a3a3",
    "#f2994a",
    "#5651d7",
    "#219653",
    "#d946ef",
    "#0891b2",
    "#b45309",
  ];
  let hash = 0;
  const key = item.id || item.name;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) % palette.length;
  }
  return palette[hash];
}

function getSvgFontSize(width, height) {
  return Math.max(7, Math.min(12, width / 7, height / 2.2));
}

function getSvgLabel(name, width) {
  const maxChars = Math.max(2, Math.floor(width / 7));
  if (name.length <= maxChars) {
    return name;
  }
  return `${name.slice(0, Math.max(1, maxChars - 1))}.`;
}

function formatSvgNumber(value) {
  return Number(value).toFixed(2);
}

function sortPlacedItems(items) {
  return items.slice().sort((a, b) => {
    const placeA = a.placed;
    const placeB = b.placed;
    return (
      placeA.y - placeB.y ||
      placeA.z - placeB.z ||
      placeA.x - placeB.x ||
      compareText(a.name, b.name)
    );
  });
}

function formatPlacementPosition(placement) {
  const xEnd = placement.x + placement.width;
  const yEnd = placement.y + placement.height;
  const zEnd = placement.z + placement.length;
  return `x ${formatNumber(placement.x)}-${formatNumber(xEnd)} cm, y ${formatNumber(placement.y)}-${formatNumber(yEnd)} cm, z ${formatNumber(placement.z)}-${formatNumber(zEnd)} cm`;
}

function formatPlacementSize(placement) {
  return `${formatNumber(placement.width)} x ${formatNumber(placement.height)} x ${formatNumber(placement.length)} cm`;
}

function wasItemRotated(item) {
  const placement = item.placed;
  return (
    hasPlacementFreeRotation(placement) ||
    Math.abs(placement.width - item.width) > EPSILON ||
    Math.abs(placement.height - item.height) > EPSILON ||
    Math.abs(placement.length - item.length) > EPSILON
  );
}

function hasPlacementFreeRotation(placement) {
  return Boolean(placement && placement.freeRotation && placement.rotation);
}

function formatRotationApplied(item) {
  if (hasPlacementFreeRotation(item.placed)) {
    return `livre (${formatRotationAngles(item.placed.rotation)})`;
  }
  return wasItemRotated(item) ? "sim" : "não";
}

function formatRotationAngles(rotation) {
  const parts = [
    ["X", rotation.x],
    ["Y", rotation.y],
    ["Z", rotation.z],
  ].filter(([, angle]) => Math.abs(Number(angle) || 0) > EPSILON);

  if (!parts.length) {
    return "eixos principais";
  }

  return parts.map(([axis, angle]) => `${axis} ${formatNumber(angle)} graus`).join(", ");
}

function getRoundAxis(item, placement) {
  if (!isRoundProduct(item) || !wasItemRotated(item)) {
    return "y";
  }

  if (Math.abs(placement.width - item.height) <= EPSILON && Math.abs(placement.width - item.diameter) > EPSILON) {
    return "x";
  }
  if (Math.abs(placement.length - item.height) <= EPSILON && Math.abs(placement.length - item.diameter) > EPSILON) {
    return "z";
  }
  return "y";
}

function getPlacementCare(item) {
  const care = [];
  if (item.keepUpright) {
    care.push("manter em pé");
  }
  if (item.fragile) {
    care.push("frágil: não colocar nada em cima");
    return care.join("; ");
  }
  if (!item.stackable) {
    care.push("não empilhável: não colocar nada em cima");
    return care.join("; ");
  }
  care.push("empilhável");
  return care.join("; ");
}

function groupItemsByName(items) {
  const grouped = new Map();
  items.forEach((item) => {
    const key = item.id;
    const current = grouped.get(key) || { ...item, quantity: 0 };
    current.quantity += 1;
    grouped.set(key, current);
  });
  return Array.from(grouped.values()).sort((a, b) => compareText(a.name, b.name));
}

function getUnpackedReason(item, boxes) {
  if (item.unpackedReason) {
    return item.unpackedReason;
  }

  if (!hasValidDimensions(item)) {
    return "dimensoes invalidas";
  }

  if (!hasValidWeight(item)) {
    return "peso invalido";
  }

  const normalizedBoxes = boxes.map(normalizeBox);
  const fitsDimensions = normalizedBoxes.some((box) =>
    getOrientations(item).some((orientation) => fitsInSpace(orientation, box)),
  );

  if (!fitsDimensions) {
    return "dimensões maiores que as caixas";
  }

  const fitsWeight = normalizedBoxes.some((box) => item.weight <= getBoxMaxWeight(box) + EPSILON);
  if (!fitsWeight) {
    return "peso acima do limite";
  }

  return "restrições de empacotamento";
}

function renderInitialResult() {
  dispose3DViews();
  lastPacking = null;
  setExportButtons(false);
  setResultStatus("Aguardando cálculo", "pending");
  elements.results.className = "results empty-state";
  elements.results.textContent = "Nenhum cálculo disponível.";
}

function setExportButtons(enabled) {
  elements.exportCsvButton.disabled = !enabled;
  elements.reportButton.disabled = !enabled;
  elements.printButton.disabled = !enabled;
}

function setResultStatus(text, variant) {
  elements.resultStatus.textContent = text;
  elements.resultStatus.classList.remove("status-pending", "status-ready", "status-warning", "status-history");
  elements.resultStatus.classList.add(`status-${variant}`);
}

function importFromFile(input, type) {
  const file = input.files && input.files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const result = importCsv(String(reader.result || ""), type);
    input.value = "";
    addAuditLog(type === "boxes" ? "caixas_importadas" : "produtos_importados", formatImportMessage(result));
    commit();
    renderInitialResult();
    window.alert(formatImportMessage(result));
  });
  reader.readAsText(file);
}

function removeProductsFromCsvFile(input) {
  const file = input.files && input.files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const names = getProductNamesFromCsv(String(reader.result || ""));
    input.value = "";

    if (!names.size) {
      window.alert("Nenhum produto encontrado neste CSV.");
      return;
    }

    const matchedIds = state.products
      .filter((product) => names.has(normalizeImportName(product.name)))
      .map((product) => product.id);

    if (!matchedIds.length) {
      window.alert("Nenhum produto cadastrado corresponde aos nomes desse CSV.");
      return;
    }

    const confirmed = window.confirm(
      `Remover ${matchedIds.length} produto(s) cadastrado(s) que aparecem neste CSV? Esta ação não remove caixas nem histórico.`,
    );

    if (!confirmed) {
      return;
    }

    const removeIds = new Set(matchedIds);
    state.products = state.products.filter((product) => !removeIds.has(product.id));
    matchedIds.forEach((id) => {
      delete state.selection[id];
      delete state.selectionOptions[id];
    });
    invalidateProductCache();
    addAuditLog("produtos_removidos_por_csv", `${matchedIds.length} produto(s) removido(s).`);
    resetProductForm();
    commit();
    renderInitialResult();
    window.alert(`${matchedIds.length} produto(s) removido(s).`);
  });
  reader.readAsText(file);
}

function getProductNamesFromCsv(csvText) {
  const rows = parseCsv(csvText).filter((row) => row.some((cell) => String(cell).trim()));
  if (rows.length < 2) {
    return new Set();
  }

  const headers = rows[0].map(normalizeHeader);
  const names = new Set();
  rows.slice(1).forEach((row) => {
    const name = getCsvValue(row, headers, PRODUCT_NAME_CSV_ALIASES);
    if (name) {
      names.add(normalizeImportName(name));
    }
  });
  return names;
}

function normalizeImportName(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function importCsv(csvText, type) {
  const rows = parseCsv(csvText).filter((row) => row.some((cell) => String(cell).trim()));
  if (rows.length < 2) {
    return { added: 0, updated: 0, skipped: 0 };
  }

  const headers = rows[0].map(normalizeHeader);
  let added = 0;
  let updated = 0;
  let skipped = 0;
  let duplicateBarcodes = 0;
  const csvBarcodes = new Set();
  const existingProductBarcodes = new Map();
  const existingProductNames = new Map();
  const indexProductForImport = (product, index) => {
    const barcode = normalizeBarcode(product.barcode);
    if (barcode && !existingProductBarcodes.has(barcode)) {
      existingProductBarcodes.set(barcode, index);
    }
    const name = normalizeImportName(product.name);
    if (name && !existingProductNames.has(name)) {
      existingProductNames.set(name, index);
    }
  };

  if (type === "products") {
    state.products.forEach(indexProductForImport);
  }

  rows.slice(1).forEach((row) => {
    const entity = type === "boxes" ? parseBoxCsvRow(row, headers) : parseProductCsvRow(row, headers);
    if (!entity || !hasValidDimensions(entity)) {
      skipped += 1;
      return;
    }

    if (type === "products") {
      if (isReservedBarcode(entity.barcode)) {
        skipped += 1;
        return;
      }

      const normalizedBarcode = normalizeBarcode(entity.barcode);
      const normalizedName = normalizeImportName(entity.name);

      if (normalizedBarcode) {
        if (csvBarcodes.has(normalizedBarcode)) {
          duplicateBarcodes += 1;
          skipped += 1;
          return;
        }
        csvBarcodes.add(normalizedBarcode);
      }

      let existingIndex = -1;
      if (normalizedBarcode && existingProductBarcodes.has(normalizedBarcode)) {
        existingIndex = existingProductBarcodes.get(normalizedBarcode);
      }
      if (existingIndex < 0 && normalizedName && existingProductNames.has(normalizedName)) {
        existingIndex = existingProductNames.get(normalizedName);
      }

      if (existingIndex >= 0) {
        state.products[existingIndex] = normalizeProduct({
          ...entity,
          id: state.products[existingIndex].id,
          createdAt: state.products[existingIndex].createdAt,
          updatedAt: new Date().toISOString(),
        });
        indexProductForImport(state.products[existingIndex], existingIndex);
        updated += 1;
        return;
      }
    }

    const newIndex = state[type].length;
    state[type].push(entity);
    if (type === "products") {
      indexProductForImport(entity, newIndex);
    }
    added += 1;
  });

  if (type === "products" && (added || updated)) {
    invalidateProductCache();
  }

  return { added, updated, skipped, duplicateBarcodes };
}

function formatImportMessage(result) {
  const parts = [`${result.added} registros importados`];
  if (result.updated) {
    parts.push(`${result.updated} atualizados`);
  }
  if (result.duplicateBarcodes) {
    parts.push(`${result.duplicateBarcodes} códigos duplicados ignorados`);
  }
  parts.push(`${result.skipped} linhas ignoradas`);
  return `${parts.join(". ")}.`;
}

function parseBoxCsvRow(row, headers) {
  const box = normalizeBox({
    id: createId(),
    name: getCsvValue(row, headers, ["name", "nome"]) || "Caixa",
    width: getCsvValue(row, headers, ["width", "largura"]),
    height: getCsvValue(row, headers, ["height", "altura"]),
    length: getCsvValue(row, headers, ["length", "comprimento", "depth", "profundidade"]),
    maxWeight: getCsvValue(row, headers, ["maxweight", "pesomaximo", "limitepeso"]),
    stock: getCsvValue(row, headers, ["stock", "estoque", "quantidadecaixas", "quantidade"]),
  });
  return box;
}

function parseProductCsvRow(row, headers) {
  const usesDepthHeader = headers.includes("profundidade") || headers.includes("depth");
  const diameter = getCsvDimensionValue(row, headers, ["diameter", "diametro"], usesDepthHeader);
  const dimensions = inferMissingCsvDimensions({
    width: getCsvDimensionValue(row, headers, ["width", "largura"], usesDepthHeader),
    height: getCsvDimensionValue(row, headers, ["height", "altura"], usesDepthHeader),
    length: getCsvDimensionValue(row, headers, ["length", "comprimento", "depth", "profundidade"], usesDepthHeader),
  });
  const product = normalizeProduct({
    id: createId(),
    name: getCsvValue(row, headers, PRODUCT_NAME_CSV_ALIASES) || "Produto",
    barcode: getCsvValue(row, headers, [
      "barcode",
      "codigobarras",
      "codigodebarras",
      "codigo",
      "ean",
      "gtin",
    ]),
    weight: getCsvValue(row, headers, ["weight", "peso"]),
    shape: getCsvValue(row, headers, ["shape", "formato", "tipo"]) || (diameter ? "round" : "box"),
    diameter,
    width: dimensions.width,
    height: dimensions.height,
    length: dimensions.length,
  });
  return product;
}

function inferMissingCsvDimensions(dimensions) {
  const normalized = {
    width: toNumber(dimensions.width, Number.NaN),
    height: toNumber(dimensions.height, Number.NaN),
    length: toNumber(dimensions.length, Number.NaN),
  };
  const knownDimensions = Object.values(normalized).filter((value) => Number.isFinite(value) && value > 0);

  if (!knownDimensions.length) {
    return dimensions;
  }

  const fallback = Math.max(...knownDimensions);
  return {
    width: normalized.width > 0 ? normalized.width : fallback,
    height: normalized.height > 0 ? normalized.height : fallback,
    length: normalized.length > 0 ? normalized.length : fallback,
  };
}

function getCsvDimensionValue(row, headers, aliases, convertSmallDecimalToCentimeters) {
  const rawValue = getCsvValue(row, headers, aliases);
  const value = toNumber(rawValue, Number.NaN);
  if (!Number.isFinite(value)) {
    return rawValue;
  }

  if (convertSmallDecimalToCentimeters && value > 0 && value <= 3) {
    return value * 100;
  }

  return value;
}

function parseCsv(text) {
  const delimiter = detectCsvDelimiter(text);
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  rows.push(row);
  return rows;
}

function detectCsvDelimiter(text) {
  const firstLine = String(text).split(/\r?\n/)[0] || "";
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

function normalizeHeader(header) {
  return String(header)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getCsvValue(row, headers, aliases) {
  const index = headers.findIndex((header) => aliases.includes(header));
  return index >= 0 ? row[index] : "";
}

function exportLastResultCsv() {
  if (!lastPacking || !lastPacking.result.packedBoxes.length) {
    return;
  }

  const csv = buildPackingCsv(lastPacking.result);
  downloadFile("resultado-caixas.csv", csv, "text/csv;charset=utf-8");
}

function exportHistoryRecordCsv(id) {
  const record = state.history.find((item) => item.id === id);
  if (!record || !record.result?.packedBoxes?.length) {
    return;
  }

  downloadFile(`resultado-${getSafeFilenamePart(record.createdAt)}.csv`, buildPackingCsv(record.result), "text/csv;charset=utf-8");
}

async function exportFullHistoryCsv() {
  if (canUseHistorySpreadsheet()) {
    try {
      const response = await fetch("/api/history.csv", { cache: "no-store" });
      if (response.ok) {
        const text = await response.text();
        downloadFile("historico-calculos.csv", text, "text/csv;charset=utf-8");
        return;
      }
    } catch (error) {
      console.warn("Não foi possível baixar o histórico central.", error);
    }
  }

  downloadFile("historico-calculos.csv", buildHistoryCsv(state.history), "text/csv;charset=utf-8");
}

function buildHistoryCsv(records) {
  const rows = [
    [
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
    ],
  ];

  records.forEach((record) => {
    const spreadsheetRecord = buildSpreadsheetHistoryRecord(record);
    rows.push([
      spreadsheetRecord.id,
      spreadsheetRecord.createdAt,
      spreadsheetRecord.selectedProducts,
      spreadsheetRecord.totalProducts,
      spreadsheetRecord.boxesCount,
      spreadsheetRecord.boxesUsed,
      spreadsheetRecord.averageFillRatePercent,
      spreadsheetRecord.totalWeightKg,
      spreadsheetRecord.unpackedProducts,
      spreadsheetRecord.boxDetails,
      spreadsheetRecord.reference,
      spreadsheetRecord.user,
    ]);
  });

  return ["sep=;", ...rows.map((row) => row.map(escapeSemicolonCell).join(";"))].join("\n");
}

function exportBackupJson() {
  const range = getBackupDateRange();
  if (!range) {
    return;
  }

  const boxes = filterEntitiesForBackup(state.boxes, range);
  const products = filterEntitiesForBackup(state.products, range);

  if ((range.start || range.end) && !boxes.length && !products.length) {
    window.alert("Nenhum cadastro encontrado no periodo selecionado.");
    return;
  }

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    dateFilter: {
      from: range.startValue || null,
      to: range.endValue || null,
    },
    boxes: cloneForStorage(boxes),
    products: cloneForStorage(products),
  };

  downloadFile(`backup-cadastros-${getSafeFilenamePart(backup.exportedAt)}.json`, JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
  addAuditLog("backup_exportado", `${boxes.length} caixa(s), ${products.length} produto(s).`, { persist: true });
}

function buildBackupSnapshot(reason = "automatico") {
  return {
    version: 2,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    reason,
    boxes: cloneForStorage(state.boxes),
    products: cloneForStorage(state.products),
    auditLog: cloneForStorage(state.auditLog),
    appSettings: cloneForStorage(state.appSettings),
  };
}

function writeAutoBackup(reason = "automatico") {
  try {
    const snapshot = buildBackupSnapshot(reason);
    const dataHash = JSON.stringify({
      boxes: snapshot.boxes,
      products: snapshot.products,
    });
    const backups = getAutoBackups();
    if (backups[0]?.dataHash === dataHash) {
      renderAutoBackupInfo();
      return;
    }

    localStorage.setItem(
      AUTO_BACKUP_STORAGE_KEY,
      JSON.stringify([{ ...snapshot, dataHash }, ...backups].slice(0, AUTO_BACKUP_LIMIT)),
    );
    renderAutoBackupInfo();
  } catch (error) {
    console.warn("Não foi possível criar backup automático.", error);
  }
}

function getAutoBackups() {
  try {
    const saved = localStorage.getItem(AUTO_BACKUP_STORAGE_KEY);
    const backups = saved ? JSON.parse(saved) : [];
    return Array.isArray(backups) ? backups.filter((backup) => backup && Array.isArray(backup.products) && Array.isArray(backup.boxes)) : [];
  } catch {
    return [];
  }
}

function renderAutoBackupInfo() {
  if (!elements.autoBackupInfo) {
    return;
  }

  const backups = getAutoBackups();
  elements.autoBackupExportButton.disabled = !backups.length;
  if (!backups.length) {
    elements.autoBackupInfo.textContent = "Backup automático ainda não criado.";
    return;
  }

  const latest = backups[0];
  elements.autoBackupInfo.textContent = `Ultimo backup automatico: ${formatHistoryDate(latest.exportedAt)} (${backups.length}/${AUTO_BACKUP_LIMIT} salvos).`;
}

function exportLatestAutoBackupJson() {
  const latest = getAutoBackups()[0];
  if (!latest) {
    window.alert("Nenhum backup automatico encontrado.");
    return;
  }

  const backup = { ...latest };
  delete backup.dataHash;
  downloadFile(`backup-automatico-${getSafeFilenamePart(backup.exportedAt)}.json`, JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
  addAuditLog("backup_automatico_baixado", formatHistoryDate(backup.exportedAt), { persist: true });
}

function getBackupDateRange() {
  const startValue = elements.backupFilterStart.value;
  const endValue = elements.backupFilterEnd.value;
  const start = startValue ? new Date(`${startValue}T00:00:00`) : null;
  const end = endValue ? new Date(`${endValue}T23:59:59`) : null;

  if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime()))) {
    window.alert("Informe um periodo valido para exportar o backup.");
    return null;
  }

  if (start && end && start > end) {
    window.alert("A data inicial do backup não pode ser maior que a data final.");
    return null;
  }

  return { startValue, endValue, start, end };
}

function filterEntitiesForBackup(items, range) {
  if (!range.start && !range.end) {
    return items;
  }

  return items.filter((item) =>
    [item.createdAt, item.updatedAt].some((value) => isDateWithinBackupRange(value, range)),
  );
}

function isDateWithinBackupRange(value, range) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  if (range.start && date < range.start) {
    return false;
  }

  if (range.end && date > range.end) {
    return false;
  }

  return true;
}

function importBackupJson() {
  const file = elements.backupImportInput.files && elements.backupImportInput.files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const backup = JSON.parse(String(reader.result || "{}"));
      const boxes = Array.isArray(backup.boxes) ? backup.boxes.map(normalizeBox).filter(hasValidDimensions) : [];
      const products = Array.isArray(backup.products)
        ? backup.products.map(normalizeProduct).filter((product) => hasValidDimensions(product) && !isReservedBarcode(product.barcode))
        : [];

      if (!boxes.length && !products.length) {
        throw new Error("Backup vazio");
      }

      const confirmed = window.confirm("Importar este backup vai substituir os cadastros atuais de caixas e produtos. Deseja continuar?");
      if (!confirmed) {
        return;
      }

      state.boxes = boxes;
      state.products = products;
      state.selection = {};
      state.selectionOptions = {};
      invalidateProductCache();
      addAuditLog("backup_importado", `${boxes.length} caixa(s), ${products.length} produto(s).`);
      saveState();
      render();
      renderInitialResult();
      window.alert(`Backup importado: ${boxes.length} caixas e ${products.length} produtos.`);
    } catch (error) {
      window.alert("Não foi possível importar o backup. Verifique se o arquivo JSON está correto.");
    } finally {
      elements.backupImportInput.value = "";
    }
  });
  reader.readAsText(file);
}

function buildPackingCsv(result) {
  const rows = [
    [
      "caixa_numero",
      "caixa",
      "ordem_colocação",
      "produto",
      "formato_produto",
      "diametro_produto_cm",
      "quantidade",
      "dimensoes_produto_cm",
      "peso_unitário_kg",
      "peso_total_produto_kg",
      "peso_total_caixa_kg",
      "peso_maximo_caixa_kg",
      "ocupacao_caixa_percentual",
      "volume_livre_cm3",
      "posicao_x_cm",
      "posicao_y_cm",
      "posicao_z_cm",
      "orientacao_final_cm",
      "giro_aplicado",
      "cuidados",
    ],
  ];

  result.packedBoxes.forEach((packedBox, boxIndex) => {
    sortPlacedItems(packedBox.items).forEach((item, itemIndex) => {
      rows.push([
        boxIndex + 1,
        packedBox.box.name,
        itemIndex + 1,
        item.name,
        getProductShapeLabel(item),
        isRoundProduct(item) ? formatNumber(item.diameter) : "",
        1,
        formatDimensions(item),
        formatNumber(item.weight),
        formatNumber(item.weight),
        formatNumber(packedBox.totalWeight),
        Number.isFinite(packedBox.weightCapacity) ? formatNumber(packedBox.weightCapacity) : "",
        formatNumber(packedBox.fillRate * 100),
        formatNumber(packedBox.freeVolume),
        formatNumber(item.placed.x),
        formatNumber(item.placed.y),
        formatNumber(item.placed.z),
        formatPlacementSize(item.placed),
        formatRotationApplied(item),
        getPlacementCare(item),
      ]);
    });
  });

  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function escapeCsvCell(value) {
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function toCsv(rows) {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function escapeSemicolonCell(value) {
  const text = String(value ?? "");
  if (/[;"\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function getSafeFilenamePart(value) {
  return String(value || new Date().toISOString())
    .replace(/[:.]/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 40);
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function printLastResult() {
  if (!lastPacking || !lastPacking.result.packedBoxes.length) {
    return;
  }
  window.print();
}

function printFinalizerBarcode(barcode = "") {
  const selectedBarcode = normalizeBarcode(barcode);
  activateTab("finalizer");
  renderFinalizerBarcode();
  const hasSingleSelection = selectFinalizerPrintCard(selectedBarcode);
  document.body.classList.add("finalizer-printing");
  document.body.classList.toggle("finalizer-single-printing", hasSingleSelection);

  const cleanup = () => {
    document.body.classList.remove("finalizer-printing");
    document.body.classList.remove("finalizer-single-printing");
    clearFinalizerPrintSelection();
    window.removeEventListener("afterprint", cleanup);
  };

  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
  window.setTimeout(cleanup, 1000);
}

function selectFinalizerPrintCard(barcode) {
  let hasSelection = false;

  elements.finalizerCommandList.querySelectorAll("[data-command-barcode-value]").forEach((card) => {
    const isSelected = Boolean(barcode) && card.dataset.commandBarcodeValue === barcode;
    card.toggleAttribute("data-print-selected", isSelected);
    hasSelection = hasSelection || isSelected;
  });

  return hasSelection;
}

function clearFinalizerPrintSelection() {
  elements.finalizerCommandList.querySelectorAll("[data-print-selected]").forEach((card) => {
    card.removeAttribute("data-print-selected");
  });
}

function printLastSeparationReport() {
  if (!lastPacking || !lastPacking.result.packedBoxes.length) {
    return;
  }

  printSeparationReport({
    id: "atual",
    createdAt: new Date().toISOString(),
    meta: cloneForStorage(state.calculationMeta),
    result: cloneForStorage(lastPacking.result),
    selectedProducts: cloneForStorage(lastPacking.selectedProducts),
  });
}

function printHistoryRecordReport(id) {
  const record = state.history.find((item) => item.id === id);
  if (!record || !record.result?.packedBoxes?.length) {
    return;
  }

  printSeparationReport(record);
}

function printSeparationReport(record) {
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    window.alert("Não foi possível abrir o relatório. Verifique se o navegador bloqueou pop-ups.");
    return;
  }

  reportWindow.document.write(buildSeparationReportHtml(record));
  reportWindow.document.close();
  reportWindow.focus();
  setTimeout(() => {
    reportWindow.print();
  }, 250);
}

function buildSeparationReportHtml(record) {
  const result = record.result;
  const selectedProducts = Array.isArray(record.selectedProducts) ? record.selectedProducts : [];

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Relatório de separação</title>
    <style>
      body { margin: 0; padding: 28px; color: #08233f; font-family: Arial, sans-serif; }
      h1, h2, h3, p { margin-top: 0; }
      h1 { font-size: 24px; margin-bottom: 8px; }
      h2 { font-size: 18px; margin: 22px 0 10px; }
      h3 { font-size: 15px; margin-bottom: 8px; }
      .meta, .summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 18px; margin-bottom: 18px; }
      .meta span, .summary span { border: 1px solid #d8dee5; border-radius: 6px; padding: 8px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
      th, td { border: 1px solid #d8dee5; padding: 7px 8px; text-align: left; vertical-align: top; font-size: 12px; }
      th { background: #f2a000; color: #08233f; }
      .box { page-break-inside: avoid; margin-top: 18px; }
      .warning { border: 1px solid #f2a000; border-radius: 6px; padding: 10px; margin: 12px 0; }
      @media print { body { padding: 16px; } }
    </style>
  </head>
  <body>
    <h1>Relatório de separação</h1>
    <div class="meta">
      <span><strong>Data:</strong> ${escapeHtml(formatHistoryDate(record.createdAt))}</span>
      <span><strong>ID do cálculo:</strong> ${escapeHtml(record.id)}</span>
    </div>
    <div class="summary">
      <span><strong>Caixas:</strong> ${result.packedBoxes.length}</span>
      <span><strong>Peso total:</strong> ${formatNumber(result.totalWeight)} kg</span>
      <span><strong>Ocupação média:</strong> ${formatPercent(result.averageFillRate)}</span>
      <span><strong>Produtos sem caixa:</strong> ${result.unpacked.length}</span>
    </div>
    <h2>Produtos selecionados</h2>
    <table>
      <thead>
        <tr><th>Produto</th><th>Quantidade</th><th>Dimensões</th><th>Peso unitário</th><th>Regras</th></tr>
      </thead>
      <tbody>
        ${selectedProducts
          .map(
            (product) => `<tr>
              <td>${escapeHtml(product.name)}</td>
              <td>${product.quantity}</td>
              <td>${escapeHtml(formatDimensions(product))}</td>
              <td>${formatNumber(product.weight)} kg</td>
              <td>${escapeHtml(getProductRules(product).join(", "))}</td>
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
    <h2>Ordem de separação por caixa</h2>
    ${result.packedBoxes.map((packedBox, index) => renderReportBox(packedBox, index + 1)).join("")}
    ${result.unpacked.length ? renderReportUnpacked(result.unpacked) : ""}
  </body>
</html>`;
}

function renderReportBox(packedBox, index) {
  const maxWeight = Number.isFinite(packedBox.weightCapacity)
    ? `${formatNumber(packedBox.weightCapacity)} kg`
    : "sem limite";

  return `<section class="box">
    <h3>Caixa ${index}: ${escapeHtml(packedBox.box.name)}</h3>
    <p>${escapeHtml(formatDimensions(packedBox.box))} | ${formatPercent(packedBox.fillRate)} ocupação | ${formatNumber(packedBox.totalWeight)} kg / ${maxWeight}</p>
    ${Array.isArray(packedBox.warnings) && packedBox.warnings.length ? `<div class="warning">${packedBox.warnings.map(escapeHtml).join("<br>")}</div>` : ""}
    <table>
      <thead>
        <tr><th>Ordem</th><th>Produto</th><th>Posição</th><th>Orientação</th><th>Giro</th><th>Cuidados</th></tr>
      </thead>
      <tbody>
        ${sortPlacedItems(packedBox.items)
          .map(
            (item, itemIndex) => `<tr>
              <td>${itemIndex + 1}</td>
              <td>${escapeHtml(item.name)}</td>
              <td>${escapeHtml(formatPlacementPosition(item.placed))}</td>
              <td>${escapeHtml(formatPlacementSize(item.placed))}</td>
              <td>${escapeHtml(formatRotationApplied(item))}</td>
              <td>${escapeHtml(getPlacementCare(item))}</td>
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  </section>`;
}

function renderReportUnpacked(items) {
  return `<section class="warning">
    <h2>Produtos sem caixa compatível</h2>
    <p>${groupItemsByName(items)
      .map((item) => `${item.quantity} x ${escapeHtml(item.name)} (${escapeHtml(getUnpackedReason(item, state.boxes))})`)
      .join("<br>")}</p>
  </section>`;
}

function formatDimensions(item) {
  if (isRoundProduct(item)) {
    return `diametro ${formatNumber(item.diameter)} cm x altura ${formatNumber(item.height)} cm`;
  }
  return `${formatNumber(item.width)} x ${formatNumber(item.height)} x ${formatNumber(item.length)} cm`;
}

function formatVolume(value) {
  return `${formatNumber(value)} cm3`;
}

function formatPercent(value) {
  return `${formatNumber(value * 100)}%`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
