const { test, expect } = require("@playwright/test");

const STORAGE_KEY = "calculadora-caixas-state";

const seededState = {
  boxes: [
    {
      id: "box-test",
      name: "Caixa Teste",
      width: 12,
      height: 10,
      length: 12,
      maxWeight: 10,
      stock: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  products: [
    {
      id: "product-test",
      name: "Produto Teste",
      barcode: "1234567890123",
      weight: 1,
      shape: "box",
      width: 10,
      height: 8,
      length: 12,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  selection: {},
  selectionOptions: {
    "product-test": {
      canRotate: true,
      keepUpright: false,
      stackable: true,
      fragile: false,
    },
  },
  calculationMeta: {
    reference: "",
    user: "",
  },
  history: [],
  auditLog: [],
  appSettings: {
    productionMode: false,
  },
  stateUpdatedAt: "2026-01-01T00:00:00.000Z",
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/state", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { state: null } });
      return;
    }
    await route.fulfill({ json: { ok: true, savedAt: new Date().toISOString() } });
  });
  await page.route("**/api/history**", async (route) => {
    await route.fulfill({ json: { ok: true } });
  });
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: seededState },
  );
});

async function scan(page, barcode) {
  const input = page.locator("#barcode-scan-input");
  await input.fill(barcode);
  await input.press("Enter");
}

async function canvasPixelStats(canvas) {
  return canvas.evaluate((node) => {
    const gl = node.getContext("webgl2") || node.getContext("webgl");
    if (!gl) {
      return { width: node.width, height: node.height, nonBlank: 0 };
    }

    const width = node.width;
    const height = node.height;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    let nonBlank = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const alpha = pixels[index + 3];
      if (alpha > 0 && (red < 245 || green < 245 || blue < 245)) {
        nonBlank += 1;
      }
    }

    return { width, height, nonBlank };
  });
}

test("fluxo por codigo de barras calcula pedido e renderiza 3D", async ({ page }) => {
  await page.goto("/index.html");

  await scan(page, "9999999999903");
  await expect(page.locator("#barcode-scan-multiplier")).toHaveValue("3");

  await scan(page, "1234567890123");
  await expect(page.locator(".barcode-qty-input")).toHaveValue("3");
  await expect(page.locator("#barcode-scan-count")).toContainText("3 leituras");

  await scan(page, "9999999999901");
  await expect(page.locator(".barcode-qty-input")).toHaveValue("1");
  await expect(page.locator("#barcode-scan-count")).toContainText("1 leitura");

  await scan(page, "9999999999999");
  await expect(page.locator("#barcode-scan-status")).toContainText("Pedido finalizado");
  await expect(page.locator(".packed-box")).toContainText("Caixa Teste");

  const canvas = page.locator(".box-3d-canvas canvas").first();
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(1200);
  const stats = await canvasPixelStats(canvas);
  expect(stats.width).toBeGreaterThan(100);
  expect(stats.height).toBeGreaterThan(100);
  expect(stats.nonBlank).toBeGreaterThan(250);
});

test("botao X remove uma leitura individual", async ({ page }) => {
  await page.goto("/index.html");

  await scan(page, "1234567890123");

  const removeButton = page.locator(".barcode-remove-button");
  await expect(removeButton).toBeVisible();
  await expect(removeButton).toHaveAttribute("title", "Remover leitura");

  const buttonBox = await removeButton.boundingBox();
  expect(buttonBox).not.toBeNull();
  expect(buttonBox.width).toBeGreaterThanOrEqual(40);
  expect(buttonBox.height).toBeGreaterThanOrEqual(40);

  await removeButton.click();
  await expect(page.locator("#barcode-scan-count")).toContainText("0 leituras");
  await expect(page.locator(".barcode-empty")).toContainText("Nenhum produto lido");
});

test("opcao pode girar permite encaixe diagonal", async ({ page }) => {
  await page.goto("/index.html");

  const result = await page.evaluate(() => {
    const boxes = [
      {
        id: "box-diagonal",
        name: "Caixa Diagonal",
        width: 10,
        height: 2,
        length: 10,
        maxWeight: 10,
        stock: null,
      },
    ];
    const baseProduct = {
      id: "product-diagonal",
      name: "Produto Diagonal",
      weight: 1,
      shape: "box",
      width: 12,
      height: 1,
      length: 2,
      keepUpright: true,
      stackable: true,
      fragile: false,
      quantity: 1,
    };

    return {
      withoutRotation: calculatePacking(boxes, [{ ...baseProduct, canRotate: false }]),
      withRotation: calculatePacking(boxes, [{ ...baseProduct, canRotate: true }]),
    };
  });

  expect(result.withoutRotation.packedBoxes).toHaveLength(0);
  expect(result.withRotation.packedBoxes).toHaveLength(1);

  const placement = result.withRotation.packedBoxes[0].items[0].placed;
  expect(placement.freeRotation).toBe(true);
  expect(placement.rotation.y).toBeGreaterThan(0);
  expect(placement.width).toBeLessThanOrEqual(10.0001);
  expect(placement.length).toBeLessThanOrEqual(10.0001);
});

test("modo producao fica focado na leitura operacional", async ({ page }) => {
  await page.goto("/index.html");
  await page.click("#production-mode-toggle");

  await expect(page.locator("body")).toHaveClass(/production-mode/);
  await expect(page.locator("#production-mode-toggle")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#barcode-scan-input")).toBeFocused();

  const clearButtonBox = await page.locator("#barcode-clear-button").boundingBox();
  const calculateButtonBox = await page.locator("#barcode-calculate-button").boundingBox();
  expect(clearButtonBox).not.toBeNull();
  expect(calculateButtonBox).not.toBeNull();
  expect(Math.abs(clearButtonBox.y - calculateButtonBox.y)).toBeLessThan(3);
  expect(clearButtonBox.height).toBeGreaterThanOrEqual(50);
  expect(calculateButtonBox.height).toBeGreaterThanOrEqual(50);
  expect(calculateButtonBox.width).toBeGreaterThan(clearButtonBox.width);
});
