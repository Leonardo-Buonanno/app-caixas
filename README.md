# Calculadora de Caixas

App web estatico para cadastrar caixas e produtos, selecionar quantidades e calcular uma distribuicao de produtos nas caixas.

## Como usar

Instale as dependencias e inicie o servidor local:

```bash
npm install
npm start
```

Depois abra `http://localhost:3000` no navegador.

## Funcionalidades

- Aba `Caixas`: cadastro e edicao de caixas com largura, altura e comprimento em centimetros e peso maximo em kg.
- Cadastro de estoque por tipo de caixa; se o estoque ficar vazio, o calculo trata a caixa como sem limite.
- Aba `Produtos`: cadastro e edicao de produtos retangulares ou redondos, com campo opcional de codigo de barras. Produtos redondos usam peso em kg, diametro em centimetros e altura em centimetros.
- Remocao de produtos por CSV: na aba `Produtos`, use `Remover por CSV` e selecione o mesmo arquivo importado para excluir os produtos daquele upload.
- Aba `Home`: selecao de produtos e calculo de caixas necessarias.
- Painel `Ler produtos`: leitura por codigo de barras com adicao automatica, quantidade por leitura, feedback visual/sonoro, resumo de conferencia, soma das quantidades, ajuste manual de unidades lidas e calculo direto da leitura.
- Persistencia local via `localStorage`.
- Calculo com rotacao opcional de produtos, incluindo posicoes diagonais por amostragem de angulos, e heuristica de empacotamento 3D.
- Opcao `manter em pe` na Home: quando marcada, o produto nao pode ser deitado; se tambem puder girar, gira apenas no eixo vertical, incluindo diagonais na base.
- Quantidades de um mesmo produto podem ser distribuidas em caixas diferentes.
- Opcoes por produto selecionado na Home: pode girar, empilhavel e fragil.
- As opcoes da Home comecam desmarcadas para cada produto.
- Resultado com peso, volume ocupado, volume livre, alertas visuais, exportacao CSV, relatorio de separacao e impressao/PDF pelo navegador.
- Resultado com resumo fixo, barras de ocupacao/peso por caixa e legenda na visualizacao 3D.
- Historico local dos ultimos 30 calculos, com filtros por data/texto, resumo, reabertura do resultado, exportacao individual e exclusao individual.
- Historico dos calculos tambem salvo em planilha CSV no arquivo `data/historico-calculos.csv` quando o app roda via `npm start`.
- Persistencia dos cadastros e configuracoes tambem salva no servidor em `data/app-state.json`, com backups rotativos em `data/state-backups`.
- Modo producao para deixar a tela focada em leitura e resultado.
- Auditoria local exportavel em CSV.
- PWA instalavel pelo navegador, com cache offline dos arquivos principais.
- Download do historico completo pelo app.
- Backup JSON de caixas e produtos para exportar/importar cadastros.
- Busca na aba `Produtos`.
- Busca de produtos por nome ou codigo de barras, incluindo leitura por scanner no campo de busca da aba `Produtos`.
- Ao importar produtos por CSV, produtos com o mesmo nome sao atualizados em vez de duplicados.
- Visualizacao 3D interativa dos produtos dentro da caixa, com numeros indicando a ordem de colocacao.
- Lista de ordem e posicao de colocacao com coordenadas X, Y e Z, orientacao final, giro aplicado e cuidados.
- Desenho da caixa com vista superior e lateral, exibindo o nome do produto na posicao calculada.
- Regra para produto redondo: o encaixe usa o cilindro delimitador `diametro x altura x diametro`; a ocupacao considera o volume aproximado do cilindro.
- Ao dividir em mais de uma caixa, o resultado prioriza a primeira caixa com o maior volume ocupado possivel e lista as caixas da mais cheia para a menos cheia.
- Importacao de caixas e produtos via CSV.

## Atalhos de teclado

- `F2`: focar o campo de leitura por codigo de barras.
- `F3`: focar a busca de produtos selecionados na Home.
- `F4`: abrir a aba `Produtos` e focar a busca por nome/codigo.
- `Alt+1`: abrir a aba `Home` e focar a leitura.
- `Alt+2`: abrir a aba `Caixas`.
- `Alt+3`: abrir a aba `Produtos`.
- `Ctrl+Enter`: calcular a selecao atual.
- `Ctrl+Z`: desfazer a ultima leitura feita pelo leitor.
- `Ctrl+M`: ativar ou sair do modo producao.
- `Ctrl+Backspace`: limpar todos os produtos selecionados, com confirmacao.
- `Esc`: limpar o campo atual; se o campo ja estiver vazio, volta o foco para a leitura.

## Validacao

Antes de usar em uma operacao critica, rode:

```bash
npm run check
npm test
```

O teste completo inclui checagens de sintaxe, configuracao PWA, recursos operacionais, fluxo por codigo de barras e renderizacao 3D.

## Guia operacional

Veja tambem `docs/guia-operacao.md`.
## CSV de caixas

Cabecalho aceito:

```csv
name,width,height,length,maxWeight,stock
Caixa P,30,20,40,12,50
```

Tambem aceita cabecalhos em portugues:

```csv
nome,largura,altura,comprimento,pesoMaximo,estoque
Caixa P,30,20,40,12,50
```

## CSV de produtos

Cabecalho aceito:

```csv
name,barcode,weight,shape,width,height,length,diameter
Produto A,7891234567890,1.5,box,10,8,20,
Produto Round,7899876543210,2,round,,15,,10
```

Tambem aceita cabecalhos em portugues:

```csv
nome,codigo_barras,peso,formato,largura,altura,comprimento,diametro
Produto A,7891234567890,1.5,retangular,10,8,20,
Produto Redondo,7899876543210,2,redondo,,15,,10
```

Para codigo de barras, tambem sao aceitos os cabecalhos `codigo`, `codigo de barras`, `barcode`, `ean` e `gtin`.

Para nome do produto, tambem sao aceitos os cabecalhos `produto`, `product`, `descricao` e `description`.

Se o CSV tiver colunas extras, elas sao ignoradas. O importador usa apenas nome, codigo de barras, peso, formato e dimensoes.

Para produtos redondos, use `formato`/`shape` como `redondo` ou preencha `diametro`.

Arquivos exportados do Magento com `profundidade` tambem sao aceitos:

```csv
nome,peso,altura,largura,profundidade
Produto Magento,"3,26","0,24","0,2","0,96"
```

Quando o cabecalho tem `profundidade`, medidas decimais ate 3 sao tratadas como metros e convertidas para centimetros. Exemplo: `0,24` vira `24 cm`.

Se alguma dimensao do produto vier vazia ou como `NULL`, o importador preenche a medida faltante com a maior dimensao conhecida daquele produto para permitir o cadastro.

## Observacoes

- Use centimetros para medidas e kg para peso.
- Campo `maxWeight` vazio significa sem limite.
- Campo `stock`/`estoque` vazio significa sem limite de caixas disponiveis.
- O botao `PDF` abre a impressao do navegador; escolha salvar como PDF.
- O botao `Relatorio` gera uma pagina de separacao com caixas e ordem de colocacao.
- O calculo usa varias ordenacoes de empacotamento e escolhe o melhor resultado encontrado, mas empacotamento 3D perfeito e um problema combinatorio e pode exigir ajustes em casos extremos.
- x = largura
- y = altura
- z = comprimento
