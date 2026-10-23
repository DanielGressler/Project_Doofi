# Auditoria de concorrência e desempenho

Data: 23/10/2026. Base examinada: commit `e606e4c`. Escopo: Worker Astro, D1, autenticação, catálogo, checkout, cotações, acompanhamento, painel, upload e dependências. Os testes usam dados fictícios e o emulador local. A execução não acessou o banco remoto nem realizou carga no endereço público.

## Falhas e correções

| Prioridade             | Constatação                                                                                                                                                       | Correção e evidência                                                                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alta                   | Produto podia mudar de preço entre a leitura do catálogo e a gravação do pedido.                                                                                  | O `INSERT` do pedido verifica as versões dos produtos e dos componentes de combos dentro da transação. Mudança concorrente retorna 409 `CATALOG_CHANGED`, sem pedido, itens ou pagamento parcial.  |
| Alta                   | Fechar a loja durante esse intervalo ainda permitia concluir um novo pedido.                                                                                      | O commit verifica loja ativa, aberta e com a versão lida. A validade do intento também é revalidada no SQL.                                                                                        |
| Alta                   | Uma cotação podia expirar depois da validação em JavaScript e antes da atualização do pedido.                                                                     | O próprio `UPDATE` exige cotação vigente e token não revogado/expirado. O teste força uma expiração exatamente nessa fronteira.                                                                    |
| Média                  | Consultas independentes podiam misturar status antigo com pagamento ou eventos mais recentes.                                                                     | O acompanhamento reúne suas sete leituras em um `batch` transacional. O painel recebe lista e indicadores de um mesmo snapshot.                                                                    |
| Média                  | `setInterval` iniciava outra atualização mesmo com uma consulta anterior pendente.                                                                                | Polling compartilhado com uma chamada em andamento por tela, atualização nova após mutações, pausa em abas ocultas e espaçamento progressivo após erro.                                            |
| Média                  | Cada atualização do painel buscava lista e resumo separadamente, repetindo sessão e validação JWT.                                                                | `/painel/visao-geral` entrega os dois resultados. A verificação JWT é reutilizada somente para o mesmo objeto Request, token e configuração.                                                       |
| Média                  | O limitador atualizava o contador mesmo depois de rejeitar a chamada.                                                                                             | O contador para no teto. O limite anterior já era atômico; a correção elimina escritas dos excedentes e informa o tempo restante em `Retry-After`.                                                 |
| Média                  | Sessões, intentos e buckets expirados acumulavam; login podia executar uma exclusão global extensa.                                                               | Limpeza indexada de até 256 linhas por tabela na primeira chamada permitida por escopo/IP/minuto. A rotação de login remove diretamente a sessão anterior.                                         |
| Média                  | Consultas de composição não tinham índice por loja; listagem de pedidos precisava ordenar empates em estrutura temporária.                                        | Migração 0004 adiciona índices de escopo e expiração e ajusta a direção do índice de pedidos. O índice simples de catálogo, agora redundante, é removido.                                          |
| Média                  | Checkout carregava anúncios fora do carrinho; associação de combos fazia busca repetida por produto.                                                              | Checkout consulta apenas os IDs selecionados. Produtos e composição são lidos juntos, e um Map agrupa componentes em tempo linear. Validação de dois componentes passa de duas consultas para uma. |
| Média                  | Conversão de imagem criava arrays por pixel e recalculava coordenadas para cada ponto. Uploads simultâneos podiam multiplicar buffers grandes na mesma instância. | Conversão escreve diretamente nos buffers, pré-calcula colunas e mantém uma vaga de upload por instância. Excedente recebe 503 `IMAGE_CAPACITY` com nova tentativa em dois segundos.               |
| Baixa                  | `available` e `unavailable` podiam ser enviados com valores contraditórios.                                                                                       | O campo atual é `unavailable`; o anterior continua compatível quando coerente. Contradições e booleanos malformados retornam 422.                                                                  |
| Baixa                  | Validação de versão herdava o teto monetário de 100.000.                                                                                                          | `versionField` valida um inteiro seguro, separado dos limites de preços e fretes. Edição com versão 100.001 é coberta por teste.                                                                   |
| Baixa                  | O nome `green` confundia a ilustração da loja de demonstração com a paleta escolhida pelo lojista.                                                                | `usesFreshIllustration` deixa explícito que o campo histórico seleciona arte/texto. `palette` continua responsável pelas cores da página.                                                          |
| Média, desenvolvimento | `npm audit` apontou Vitest e `@vitest/mocker` vulneráveis a leitura de arquivos/injeção no mecanismo de mocks.                                                    | Vitest atualizado de 4.1.0 para 4.1.12, com lockfile consistente. A versão está dentro do intervalo aceito pelo plugin Cloudflare.                                                                 |

Os quatro primeiros testes de reprodução executados antes das correções falharam como esperado: checkout com preço antigo, checkout após fechamento, aceite de cotação expirada e contador ainda crescendo após o teto. A falha do contador não representava liberação de tentativas além do limite.

## Redução de trabalho por atualização

“Chamada D1” nesta tabela significa uma operação no binding (`first`, `all`, `run` ou `batch`). Um batch ainda executa suas consultas SQL; a redução de chamadas não equivale a reduzir todas as linhas lidas ou o custo SQL na mesma proporção.

| Caminho                             | Antes                                                                               | Depois                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Atualização do painel               | 2 requisições HTTP; 5 chamadas D1; 4 verificações JWT passando por middleware e API | 1 requisição HTTP; 2 chamadas D1, com 4 consultas SQL; 1 verificação JWT   |
| Consulta de acompanhamento          | 8 chamadas D1, incluindo limitador                                                  | 2 chamadas D1, com as mesmas 8 consultas SQL, fora a manutenção amortizada |
| Consulta pública do catálogo        | 3 chamadas D1                                                                       | 2 chamadas D1, com 3 consultas SQL                                         |
| Declaração/conferência de pagamento | Leitura de itens, cotação e pagamento                                               | Leitura somente do pagamento necessário à operação                         |
| Cabeçalho do painel                 | Consulta adicional à loja                                                           | Nome e slug vêm da consulta autenticada da sessão                          |
| Composição de catálogo em memória   | Varredura de todos os vínculos para cada produto                                    | Agrupamento por ID de combo, sem varreduras repetidas                      |

Os orçamentos de chamadas são verificados em [query-budget.test.ts](../tests/query-budget.test.ts). O teste de JWT confirma uma única verificação para oito consumidores simultâneos da mesma requisição e recusa a reutilização para outro token ou audiência.

## Integridade sob concorrência

[concurrency.test.ts](../tests/concurrency.test.ts) executa:

- 40 reenvios simultâneos do mesmo checkout: um pedido e um evento de criação.
- 30 checkouts independentes simultâneos: 30 pedidos, totais corretos e isolamento entre lojas.
- 40 chamadas simultâneas com teto 12: exatamente 12 permitidas e contador saturado em 12.
- 12 criações simultâneas com 49 anúncios existentes: apenas uma nova criação, respeitando o limite de 50.
- Mudanças de preço, fechamento, indisponibilidade de componente e expiração do intento entre leitura e commit: conflito sem gravação parcial.
- Expiração da cotação entre validação e atualização: total continua indefinido e não existe auditoria de aceite.
- Carrinho de 20 combos envolvendo 50 anúncios. As versões são passadas como JSON, mantendo 26 parâmetros no `INSERT`, abaixo do limite D1 de 100.
- Limpeza limitada de registros expirados, preservando sessões e intentos válidos.

[polling.test.ts](../tests/polling.test.ts) simula respostas lentas, falhas, `Retry-After`, aba indisponível e timeout. O prazo de 30 segundos não cancela retroativamente uma operação já recebida pelo servidor; por isso a idempotência do checkout e as versões das demais mutações continuam necessárias.

Os testes de imagem também conferem cores, composição da transparência sobre branco, orientação EXIF e liberação da vaga de processamento. Os testes de jornada preservam catálogo, combos, checkout, cotações, pagamento simulado, personalização global e isolamento A/B.

## Medição HTTP local

Execute `npm run preview -- --port 4321` após um build local. Em outro terminal, rode `npm run test:load`.

O script faz cinco leituras de aquecimento e mais 100 leituras de catálogo em cada nível de concorrência: 1, 10, 30 e 50. Cada resposta precisa ser HTTP 200 e conter loja e produtos válidos. O JSON de resultados fica em `.local/load-tests/latest.json`, fora do Git. A execução desta auditoria usa banco local separado e recém-preenchido.

Os tempos medem HTTP, Worker compilado e D1 emulado na mesma máquina, sem Cloudflare Access remoto. Não constituem comparação de latência com a versão anterior, SLA ou promessa de capacidade de produção.

Resultado desta execução, com Node 24.19.0 e catálogo inicial de três anúncios por loja:

| Concorrência | Leituras | Falhas | p50       | p95       |
| ------------ | -------- | ------ | --------- | --------- |
| 1            | 100      | 0      | 11,64 ms  | 15,21 ms  |
| 10           | 100      | 0      | 66,46 ms  | 95,18 ms  |
| 30           | 100      | 0      | 171,89 ms | 218,53 ms |
| 50           | 100      | 0      | 238,10 ms | 365,27 ms |

Foram 400 respostas válidas nas rodadas medidas, além das cinco de aquecimento. O teste usa catálogo pequeno; ele confirma o cenário exercitado e não caracteriza o comportamento com milhares de lojas ou históricos extensos.

## Verificações concluídas

- 70 testes de código em nove arquivos, executados com Vitest 4.1.12 e D1 local.
- 11 cenários Playwright: jornadas de pedido, isolamento, imagens, categorias, combos, personalização e acessibilidade.
- `astro check`: zero erros, avisos e sugestões.
- Formatação e verificação de whitespace aprovadas.
- Builds local e de homologação aprovados; publicação de homologação validada com `--dry-run`.
- Exportação e restauração locais aprovadas, com zero pedidos sem evento de criação e zero totais inconsistentes.
- `npm audit` completo: zero vulnerabilidades após atualizar Vitest e o lockfile.
- 400 leituras HTTP medidas, sem falhas, incluindo uma rodada com 50 clientes concorrentes.

## Aplicar no Cloudflare

Depois de atualizar o projeto local a partir do GitHub, no Prompt de Comando do Windows:

```bat
cd /d "D:\myprojects\Project_Doofi-main"
set DOOFI_D1_DATABASE_ID=fab28cb0-aeef-4215-a9d2-08c791cf7fa0
npm run db:migrate:staging
```

O comando exige o login Cloudflare já autorizado no computador. Aplica as migrações pendentes ao banco informado. A 0004 altera índices, sem recriar tabelas de negócio ou repetir o seed. O deploy conectado ao GitHub continua usando `npm run build:staging` e `npm run deploy:staging`.

O código funciona antes da aplicação desses índices, mas a medição e os planos de consulta pressupõem a migração aplicada. As três variáveis de acesso e o controle por convidados continuam necessários conforme o [guia de hospedagem](HOSPEDAGEM_CLOUDFLARE.md).

## Limites e próxima medição

- D1 continua sendo o ponto central das escritas. Aumentar instâncias do Worker não torna as gravações de um mesmo banco ilimitadas.
- O resumo ainda agrega o histórico da própria loja. Com grandes volumes, medir esse custo antes de decidir por agregados persistidos ou outro modelo de leitura.
- O limitador de acompanhamento ainda escreve no D1. Se ele dominar o tráfego, avaliar um limitador distribuído da plataforma mantendo a mesma política de acesso.
- JPEG/PNG continuam sendo normalizados no Worker e armazenados no D1. A vaga de processamento protege a memória de cada instância; limites reais de CPU e armazenamento do plano precisam ser medidos. Para crescer, avaliar processamento de imagens e armazenamento de objetos adequados ao volume.
- A trilha pública mostra os últimos 100 eventos. A auditoria completa do lojista permanece disponível e pode precisar de paginação conforme crescer.
- As chamadas de autenticação não usam cache compartilhado de sessão. Revogações continuam sendo conferidas em cada nova requisição.
- A limpeza é acionada por tráfego e não substitui uma política de retenção de pedidos/auditoria ou backups remotos.

Referências: [limites e concorrência do D1](https://developers.cloudflare.com/d1/platform/limits/), [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) e [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8).
