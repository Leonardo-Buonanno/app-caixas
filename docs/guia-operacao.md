# Guia rapido de operacao

## Abrir o app

1. Execute `npm start` na pasta do projeto.
2. Abra `http://127.0.0.1:3000/index.html`.
3. Se o navegador oferecer instalacao, use o botao `Instalar app` no topo.

## Separar um pedido

1. Entre na Home.
2. Leia os codigos de barras dos produtos.
3. Para multiplas unidades, leia antes o codigo de quantidade: 2, 3, 4 ou 5.
4. Leia `1 quantidade` para corrigir a ultima leitura para uma unidade.
5. Leia `Finalizar pedido` para calcular as caixas.
6. Confira alertas, ordem de colocacao e visualizacao 3D.
7. Leia `Novo pedido` para preparar a proxima separacao.

## Modo producao

Use `Ctrl+M` ou o botao `Modo producao` para deixar a tela focada em leitura e resultado.

## Backup e recuperacao

- O app salva no navegador e tambem em `data/app-state.json` quando aberto pelo `server.js`.
- O servidor mantem backups rotativos em `data/state-backups`.
- A Home permite baixar o ultimo backup automatico local.
- Use `Exportar backup` antes de grandes importacoes ou alteracoes de cadastro.

## Auditoria

A Home registra eventos importantes, como cadastro, importacao, calculo, backup e modo producao.
Use `Baixar auditoria` para gerar CSV.

## Validacao tecnica

Rode antes de usar em uma operacao critica:

```bash
npm run check
npm test
```
