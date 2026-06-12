const { test, expect } = require("@playwright/test");

function box(overrides = {}) {
  return {
    id: "box",
    name: "Caixa",
    width: 10,
    height: 10,
    length: 10,
    maxWeight: 10,
    stock: null,
    ...overrides,
  };
}

function product(overrides = {}) {
  return {
    id: "product",
    name: "Produto",
    weight: 1,
    shape: "box",
    width: 5,
    height: 5,
    length: 5,
    quantity: 1,
    canRotate: false,
    keepUpright: false,
    stackable: false,
    fragile: false,
    ...overrides,
  };
}

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
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/index.html");
});

async function calculate(page, boxes, products) {
  return page.evaluate(
    ({ boxes: inputBoxes, products: inputProducts }) => calculatePacking(inputBoxes, inputProducts),
    { boxes, products },
  );
}

function placementsOverlap(a, b) {
  const rangesOverlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd - 0.0001 && bStart < aEnd - 0.0001;
  return (
    rangesOverlap(a.x, a.x + a.width, b.x, b.x + b.width) &&
    rangesOverlap(a.y, a.y + a.height, b.y, b.y + b.height) &&
    rangesOverlap(a.z, a.z + a.length, b.z, b.z + b.length)
  );
}

function expectNoPlacementOverlaps(result) {
  result.packedBoxes.forEach((packedBox) => {
    for (let leftIndex = 0; leftIndex < packedBox.items.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < packedBox.items.length; rightIndex += 1) {
        const left = packedBox.items[leftIndex];
        const right = packedBox.items[rightIndex];
        expect(
          placementsOverlap(left.placed, right.placed),
          `${left.name} sobrepoe ${right.name} em ${packedBox.box.name}`,
        ).toBe(false);
      }
    }
  });
}

test("retorna erros para entradas vazias ou caixas invalidas", async ({ page }) => {
  await expect(calculate(page, [], [product()])).resolves.toMatchObject({
    error: "Cadastre pelo menos uma caixa.",
    packedBoxes: [],
    unpacked: [],
  });

  await expect(calculate(page, [box()], [])).resolves.toMatchObject({
    error: "Selecione pelo menos um produto.",
    packedBoxes: [],
    unpacked: [],
  });

  await expect(calculate(page, [box({ width: 0 })], [product()])).resolves.toMatchObject({
    error: "Cadastre uma caixa valida.",
    packedBoxes: [],
    unpacked: [],
  });
});

test("calcula encaixe exato, volume livre, ocupacao e peso total", async ({ page }) => {
  const result = await calculate(page, [box()], [product({ width: 10, height: 10, length: 10, weight: 4 })]);

  expect(result.error).toBe("");
  expect(result.unpacked).toHaveLength(0);
  expect(result.packedBoxes).toHaveLength(1);
  expect(result.packedBoxes[0].items).toHaveLength(1);
  expect(result.packedBoxes[0].usedVolume).toBe(1000);
  expect(result.packedBoxes[0].freeVolume).toBe(0);
  expect(result.packedBoxes[0].fillRate).toBe(1);
  expect(result.totalWeight).toBe(4);
});

test("respeita limite de peso e usa outra caixa quando ha estoque ilimitado", async ({ page }) => {
  const result = await calculate(page, [box({ maxWeight: 2 })], [
    product({ id: "heavy", name: "Pesado", weight: 2 }),
    product({ id: "light", name: "Leve", weight: 1 }),
  ]);

  expect(result.error).toBe("");
  expect(result.unpacked).toHaveLength(0);
  expect(result.packedBoxes).toHaveLength(2);
  expect(result.packedBoxes.map((packedBox) => packedBox.totalWeight).sort()).toEqual([1, 2]);
  expect(result.totalWeight).toBe(3);
});

test("respeita estoque limitado de caixas", async ({ page }) => {
  const result = await calculate(page, [box({ maxWeight: 2, stock: 1 })], [
    product({ id: "heavy", name: "Pesado", weight: 2 }),
    product({ id: "light", name: "Leve", weight: 1 }),
  ]);

  expect(result.packedBoxes).toHaveLength(1);
  expect(result.packedBoxes[0].totalWeight).toBe(2);
  expect(result.unpacked).toHaveLength(1);
  expect(result.unpacked[0]).toMatchObject({
    id: "light",
    unpackedReason: "estoque de caixas insuficiente",
  });
});

test("nao aloca produto maior que as caixas ou acima do peso maximo", async ({ page }) => {
  const tooLarge = await calculate(page, [box()], [product({ width: 11 })]);
  expect(tooLarge.packedBoxes).toHaveLength(0);
  expect(tooLarge.unpacked).toHaveLength(1);
  expect(tooLarge.unpacked[0].id).toBe("product");

  const tooHeavy = await calculate(page, [box({ maxWeight: 2 })], [product({ weight: 3 })]);
  expect(tooHeavy.packedBoxes).toHaveLength(0);
  expect(tooHeavy.unpacked).toHaveLength(1);
  expect(tooHeavy.unpacked[0].id).toBe("product");
});

test("usa a menor caixa que consegue completar o pedido", async ({ page }) => {
  const result = await calculate(page, [
    box({ id: "small", name: "Pequena", width: 5, height: 5, length: 5 }),
    box({ id: "large", name: "Grande", width: 10, height: 5, length: 5 }),
  ], [
    product({ quantity: 2, width: 5, height: 5, length: 5 }),
  ]);

  expect(result.unpacked).toHaveLength(0);
  expect(result.packedBoxes).toHaveLength(1);
  expect(result.packedBoxes[0].box.id).toBe("large");
  expect(result.packedBoxes[0].items).toHaveLength(2);
});

test("diferencia produto sem giro, giro em pe e giro livre", async ({ page }) => {
  const boxes = [box({ width: 10, height: 2, length: 10 })];
  const baseProduct = product({
    width: 12,
    height: 1,
    length: 2,
    keepUpright: true,
  });

  const withoutRotation = await calculate(page, boxes, [product({ ...baseProduct, canRotate: false })]);
  const uprightRotation = await calculate(page, boxes, [product({ ...baseProduct, canRotate: true })]);

  expect(withoutRotation.packedBoxes).toHaveLength(0);
  expect(withoutRotation.unpacked).toHaveLength(1);
  expect(uprightRotation.packedBoxes).toHaveLength(1);
  expect(uprightRotation.packedBoxes[0].items[0].placed.freeRotation).toBe(true);
  expect(uprightRotation.packedBoxes[0].items[0].placed.height).toBe(1);
});

test("produto redondo so deita quando pode girar livremente", async ({ page }) => {
  const boxes = [box({ width: 12, height: 5, length: 5 })];
  const roundProduct = product({
    shape: "round",
    diameter: 5,
    width: 5,
    height: 12,
    length: 5,
  });

  const withoutRotation = await calculate(page, boxes, [product({ ...roundProduct, canRotate: false })]);
  const uprightOnly = await calculate(page, boxes, [product({ ...roundProduct, canRotate: true, keepUpright: true })]);
  const freeRotation = await calculate(page, boxes, [product({ ...roundProduct, canRotate: true, keepUpright: false })]);

  expect(withoutRotation.packedBoxes).toHaveLength(0);
  expect(uprightOnly.packedBoxes).toHaveLength(0);
  expect(freeRotation.packedBoxes).toHaveLength(1);
  expect(freeRotation.packedBoxes[0].items[0].placed).toMatchObject({
    width: 12,
    height: 5,
    length: 5,
  });
  expect(freeRotation.packedBoxes[0].usedVolume).toBeCloseTo(Math.PI * 2.5 * 2.5 * 12, 8);
});

test("empilha somente quando o produto e empilhavel e nao fragil", async ({ page }) => {
  const boxes = [box({ stock: 1 })];
  const slab = product({ width: 10, height: 5, length: 10, quantity: 2 });

  const notStackable = await calculate(page, boxes, [product({ ...slab, stackable: false, fragile: false })]);
  const stackable = await calculate(page, boxes, [product({ ...slab, stackable: true, fragile: false })]);
  const fragile = await calculate(page, boxes, [product({ ...slab, stackable: true, fragile: true })]);

  expect(notStackable.packedBoxes).toHaveLength(1);
  expect(notStackable.packedBoxes[0].items).toHaveLength(1);
  expect(notStackable.unpacked).toHaveLength(1);

  expect(stackable.packedBoxes).toHaveLength(1);
  expect(stackable.packedBoxes[0].items).toHaveLength(2);
  expect(stackable.unpacked).toHaveLength(0);

  expect(fragile.packedBoxes).toHaveLength(1);
  expect(fragile.packedBoxes[0].items).toHaveLength(1);
  expect(fragile.unpacked).toHaveLength(1);
});

test("nao gera sobreposicao nas coordenadas de produtos dentro da mesma caixa", async ({ page }) => {
  const result = await calculate(page, [box()], [
    product({ id: "base-a", name: "Base A", width: 4, height: 5, length: 10, stackable: true }),
    product({ id: "top-a", name: "Topo A", width: 4, height: 5, length: 10 }),
    product({ id: "side-b", name: "Lado B", width: 6, height: 5, length: 5 }),
    product({ id: "side-c", name: "Lado C", width: 6, height: 5, length: 5 }),
  ]);

  expect(result.unpacked).toHaveLength(0);
  expect(result.packedBoxes).toHaveLength(1);
  expect(result.packedBoxes[0].items).toHaveLength(4);
  expectNoPlacementOverlaps(result);
});

test("nao aloca produto com dimensoes invalidas", async ({ page }) => {
  const invalidDimensions = await calculate(page, [box()], [product({ width: 0 })]);

  expect(invalidDimensions.packedBoxes).toHaveLength(0);
  expect(invalidDimensions.unpacked).toHaveLength(1);
  expect(invalidDimensions.unpacked[0].id).toBe("product");

  const invalidWeight = await calculate(page, [box()], [product({ weight: -1 })]);

  expect(invalidWeight.packedBoxes).toHaveLength(0);
  expect(invalidWeight.unpacked).toHaveLength(1);
  expect(invalidWeight.unpacked[0].id).toBe("product");
});
