# Apresentacao - Calculadora de Caixas

## Objetivo da apresentacao

Mostrar que o app foi criado para resolver um problema real da operacao: escolher caixas com mais seguranca, acelerar a separacao de pedidos e reduzir erros de volume, peso e quantidade.

## Abertura sugerida

"Eu desenvolvi este app para apoiar a separacao e embalagem de pedidos. A ideia foi transformar uma decisao que muitas vezes depende de calculo manual ou experiencia do operador em um processo mais rapido, padronizado e conferivel."

## Slide 1 - Problema que o app resolve

Pontos do slide:

- Escolher a caixa ideal manualmente pode gerar erro.
- Produtos diferentes exigem cuidado com peso, volume, fragilidade e posicao.
- A separacao por codigo de barras precisava ser rapida.
- Era importante guardar historico, backup e auditoria.

Fala sugerida:

"O problema principal era operacional. Quando temos varios produtos com tamanhos e pesos diferentes, escolher a caixa certa manualmente toma tempo e pode gerar desperdicio de espaco, excesso de peso ou retrabalho. Por isso criei uma ferramenta para calcular, conferir e registrar esse processo."

## Slide 2 - O que foi criado

Pontos do slide:

- App web chamado Calculadora de Caixas.
- Cadastro de caixas com dimensoes, peso maximo e estoque.
- Cadastro de produtos com peso, medidas, formato e codigo de barras.
- Leitura por scanner ou selecao manual.
- Resultado com caixas usadas, ocupacao, peso, ordem de colocacao, relatorio, CSV, PDF e 3D.

Fala sugerida:

"O app permite cadastrar as caixas disponiveis e os produtos. Depois, o operador pode ler os codigos de barras ou selecionar os produtos manualmente. Ao calcular, o sistema informa quais caixas usar, como os produtos foram distribuidos e mostra alertas quando algo nao couber ou passar do limite."

## Slide 3 - Como foi desenvolvido

Pontos do slide:

- Interface feita com HTML, CSS e JavaScript.
- Servidor local feito em Node.js.
- Dados salvos no navegador e tambem em arquivos locais.
- Three.js usado para a visualizacao 3D.
- Testes com Node e Playwright.
- PWA instalavel e com cache offline dos arquivos principais.

Fala sugerida:

"Usei HTML, CSS e JavaScript porque sao tecnologias simples, leves e suficientes para esse tipo de ferramenta. O app roda no navegador e o servidor local em Node.js salva historico e estado em arquivos. Para a parte visual, usei Three.js, que permite mostrar a caixa em 3D com os produtos posicionados. Tambem deixei testes automatizados para validar pontos importantes, como leitura por codigo de barras, renderizacao 3D e configuracao PWA."

## Slide 4 - Por que fiz desse jeito

Pontos do slide:

- App local para reduzir dependencia externa.
- JavaScript puro para facilitar manutencao.
- CSV e JSON por serem formatos simples e acessiveis.
- Scanner tratado como teclado para funcionar com leitores comuns.
- Heuristica 3D porque empacotamento perfeito e um problema complexo.
- Opcoes por produto: girar, manter em pe, empilhavel e fragil.

Fala sugerida:

"A decisao de fazer um app local foi para facilitar o uso na operacao, sem depender de uma infraestrutura complexa. Usei CSV e JSON porque sao formatos faceis de importar, exportar e conferir. O leitor de codigo de barras funciona como teclado, entao nao precisei de integracao especial com hardware. No calculo das caixas, usei uma heuristica: o app testa diferentes ordenacoes, como volume, peso, maior lado e area de base, e escolhe o melhor resultado encontrado. Isso e importante porque encaixe 3D perfeito e um problema combinatorio, entao a solucao precisa ser rapida e boa o suficiente para uso pratico."

## Slide 5 - Valor para a empresa

Pontos do slide:

- Mais velocidade na separacao.
- Menos erro na escolha de caixa.
- Melhor aproveitamento de volume e peso.
- Conferencia visual com 3D e ordem de colocacao.
- Historico, backup e auditoria.
- Base para futuras integracoes.

Fala sugerida:

"O ganho esperado e padronizar a separacao e reduzir erro. O operador nao precisa decidir tudo manualmente: ele le os produtos, calcula e confere. Alem disso, o app gera historico, backup e auditoria, o que ajuda a acompanhar o uso e recuperar informacoes. Como proximo passo, da para pensar em integrar com pedidos reais, importar catalogo automaticamente e medir economia de caixas ao longo do tempo."

## Demonstração rapida

Ordem recomendada:

1. Abrir o app.
2. Mostrar as abas de Caixas e Produtos.
3. Mostrar um produto com codigo de barras.
4. Ir para Home e fazer uma leitura.
5. Calcular caixas.
6. Mostrar resultado, alertas, ocupacao, ordem de colocacao e 3D.
7. Mostrar historico, backup e auditoria.

Fala curta para a demo:

"Aqui eu tenho as caixas cadastradas e os produtos com suas medidas. Na Home, o operador faz a leitura pelo codigo de barras. Depois de calcular, o app mostra a caixa usada, peso, volume ocupado, produtos posicionados e uma visualizacao 3D para conferencia. O resultado tambem pode ser exportado ou impresso."

## Perguntas que podem aparecer

### Por que nao fez direto em Excel?

"Porque o Excel ajudaria no calculo simples, mas nao resolveria bem leitura por codigo de barras, historico, relatorio, backup, auditoria, modo producao e visualizacao 3D no mesmo fluxo operacional."

### O calculo sempre encontra a melhor caixa possivel?

"Ele busca um bom resultado testando diferentes estrategias, mas empacotamento 3D perfeito e um problema combinatorio. Por isso a solucao foi feita para ser pratica, rapida e conferivel, com alertas e visualizacao do resultado."

### Precisa de internet?

"O app roda localmente pelo servidor Node.js. Ele tambem tem configuracao PWA e cache dos arquivos principais para melhorar o uso no navegador."

### Onde os dados ficam salvos?

"Os dados ficam no navegador via localStorage e, quando o app roda pelo servidor, tambem sao salvos em arquivos locais como JSON e CSV na pasta data."

### Como sei que esta funcionando?

"Inclui validacoes automaticas. O projeto tem checagem de sintaxe, testes de qualidade e teste end-to-end com Playwright para simular o fluxo de codigo de barras e validar a visualizacao 3D."

## Encerramento sugerido

"A ideia nao foi criar apenas uma calculadora, mas uma ferramenta operacional: ela ajuda na decisao da embalagem, acelera a separacao, registra historico e deixa o processo mais padronizado. Com ajustes futuros, pode virar uma base para integracao com pedidos e controle ainda mais completo da expedicao."
