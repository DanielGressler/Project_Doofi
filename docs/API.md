# API P1

Prefixo `/api/v1`. Respostas JSON, `Cache-Control: no-store`. No modo local, os endpoints exigem host loopback e `APP_MODE=local-demo`. Em homologação, exigem `APP_MODE=staging-demo`, HTTPS, o host autorizado e um JWT Cloudflare Access válido, conforme o [guia de hospedagem](HOSPEDAGEM_CLOUDFLARE.md). Mutações exigem `Origin` igual à origem da requisição; bodies em JSON. Rotas de painel usam a loja da sessão, sem parâmetro de tenant confiado ao cliente.

| Método    | Caminho                                   | Autorização/função                                     |
| --------- | ----------------------------------------- | ------------------------------------------------------ |
| GET       | `/health`                                 | Consulta D1 local                                      |
| POST      | `/login`                                  | `{email,password}` de demonstração; cookie de sessão   |
| GET       | `/session`                                | Estado da sessão e CSRF quando autenticado             |
| POST      | `/logout`                                 | Cookie + `X-CSRF-Token`; revoga sessão                 |
| GET       | `/lojas/:slug`                            | Loja publicada e catálogo                              |
| POST      | `/lojas/:slug/intent`                     | `{}`; emite intento aleatório com validade de uma hora |
| POST      | `/lojas/:slug/pedidos`                    | Checkout idempotente; 201 também no replay             |
| GET       | `/pedidos/:token`                         | Status mínimo sem PII do comprador; nonce das ações    |
| POST      | `/pedidos/:token/accept-quote`            | `{version,nonce,quoteVersion}`                         |
| POST      | `/pedidos/:token/reject-quote`            | `{version,nonce,quoteVersion}`; cancela a solicitação  |
| POST      | `/pedidos/:token/declare-payment`         | `{version,nonce}`; somente declaração simulada         |
| GET       | `/painel/pedidos`                         | Sessão; 100 mais recentes da própria loja              |
| GET       | `/painel/visao-geral`                     | Sessão; `{orders,summary}` em um snapshot transacional |
| GET       | `/painel/pedidos/:id`                     | Sessão + ownership; detalhes para atendimento          |
| GET       | `/painel/pedidos/:id/auditoria`           | Sessão + ownership; trilha restrita                    |
| POST      | `/painel/pedidos/:id/transicoes`          | Sessão + CSRF; `{version,status,reason}`               |
| POST      | `/painel/pedidos/:id/cotacao`             | Sessão + CSRF; `{version,fee,estimate,validMinutes}`   |
| POST      | `/painel/pedidos/:id/simular-conferencia` | Sessão + CSRF; `{version}`; somente simulação          |
| GET       | `/painel/resumo`                          | Indicadores derivados de pedidos da própria loja       |
| GET       | `/painel/catalogo`                        | Catálogo da própria loja                               |
| POST      | `/painel/produtos`                        | Sessão + CSRF; cria produto fictício                   |
| PATCH     | `/painel/produtos/:id`                    | Sessão + CSRF + ownership + versão                     |
| GET/PATCH | `/painel/loja`                            | Configuração própria; alteração exige owner e CSRF     |
| POST      | `/painel/imagens?kind=product\|banner`    | Sessão + CSRF; corpo binário JPG/PNG, até 2 MB e 4 MP  |

Checkout: `intent`, `items:[{productId,quantity}]`, `fulfillment:PICKUP|FIXED|QUOTE`, `payment:PIX_SIMULATED|ON_FULFILLMENT_SIMULATED`, `name`, `contact`, `note` opcional, `consent:true`, `syntheticData:true`. Entregas exigem `address`, `neighborhood` atendido e `postalCode` com oito dígitos. Campos monetários enviados pelo navegador não determinam o total. Mesmo intento com dados de checkout diferentes retorna 409.

Produtos: `title`, `description`, `category`, `price` em centavos, `unavailable` booleano (marcado significa indisponível), `image` no conjunto sintético; edição também exige `version`. `available` permanece aceito para clientes anteriores. Se ambos forem enviados, precisam ser booleanos opostos; contradições retornam 422. Combos usam `is_combo:true` e dois `componentIds` distintos da mesma loja. `image_id` associa uma foto enviada pelo endpoint de imagens. Configuração: `title`, `description`, `contact`, `hours`, `pickup_address`, `neighborhoods` separados por vírgula, `delivery_fee` em centavos, `is_open` booleano, `version`.

Erros: 401 sessão ausente/inativa; 403 origem/CSRF/ambiente; 404 recurso não encontrado ou de outra loja; 409 conflito de versão/estado/intento; 413 tamanho; 415 formato; 422 validação; 429 excesso de tentativas; 503 capacidade temporária de processamento de imagem; 500 erro interno com ID de correlação. IDs de outra loja não revelam sua existência. Não existe endpoint para conciliação bancária, Pix real ou upload de comprovantes.

O checkout retorna 409 com `code:CATALOG_CHANGED` se loja, produtos, componentes de combos ou validade do intento mudarem entre a leitura e o commit. O cliente deve revisar o carrinho antes de reenviar. Pedidos já criados continuam recuperáveis pelo mesmo intento e payload, mesmo após alteração do catálogo.

O aceite de frete revalida a expiração da cotação no próprio `UPDATE`. A versão usada em alterações é um inteiro seguro, separado do limite monetário de 100.000 centavos.

`GET /pedidos/:token` inclui os últimos 100 eventos públicos, em ordem cronológica, lidos na mesma transação de status, pagamento e cotação. O histórico completo continua armazenado na auditoria restrita ao lojista. `/painel/pedidos` e `/painel/resumo` permanecem disponíveis; a interface usa `/painel/visao-geral` para obter lista e indicadores consistentes com uma única requisição.

429 informa `Retry-After` com os segundos restantes da janela. Uploads têm uma vaga de processamento por instância de execução: concorrência acima dela retorna 503, `code:IMAGE_CAPACITY` e `Retry-After:2`, antes de carregar outra imagem na memória. Esse limite protege a instância; não é um limite global de uploads de toda a implantação.

## Aparência da loja

`PATCH /painel/loja` aceita `palette:terracotta|forest|ocean|plum`, `font:editorial|simple|classic`, `layout:cozy|compact|showcase`, `banner_id` e `has_own_delivery` booleano, além dos campos de configuração existentes. Campos de aparência omitidos preservam o valor atual. Opções fora dos conjuntos permitidos retornam 422. O layout é persistido pela migração 0003.

`GET /pedidos/:token` inclui `palette`, `font` e `layout` no objeto público `store` para aplicar a aparência também ao acompanhamento. A resposta continua sem contato ou endereço do comprador.
