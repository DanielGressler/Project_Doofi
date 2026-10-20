# API P1

Prefixo `/api/v1`. Respostas JSON, `Cache-Control: no-store`. Todos os endpoints exigem host loopback e `APP_MODE=local-demo`. Mutações exigem `Origin` igual à origem da requisição; bodies em JSON. Rotas de painel usam a loja da sessão, sem parâmetro de tenant confiado ao cliente.

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

Checkout: `intent`, `items:[{productId,quantity}]`, `fulfillment:PICKUP|FIXED|QUOTE`, `payment:PIX_SIMULATED|ON_FULFILLMENT_SIMULATED`, `name`, `contact`, `note` opcional, `consent:true`, `syntheticData:true`. Entregas exigem `address`, `neighborhood` atendido e `postalCode` com oito dígitos. Campos monetários enviados pelo navegador não determinam o total. Mesmo intento com dados de checkout diferentes retorna 409.

Produtos: `title`, `description`, `category`, `price` em centavos, `available` booleano, `image` no conjunto sintético; edição também exige `version`. Configuração: `title`, `description`, `contact`, `hours`, `pickup_address`, `neighborhoods` separados por vírgula, `delivery_fee` em centavos, `is_open` booleano, `version`.

Erros: 401 sessão ausente/inativa; 403 origem/CSRF/ambiente; 404 recurso não encontrado ou de outra loja; 409 conflito de versão/estado/intento; 413 tamanho; 415 formato; 422 validação; 429 excesso de tentativas; 500 erro interno com ID de correlação. IDs de outra loja não revelam sua existência. Não existe endpoint para conciliação bancária, Pix real ou upload de comprovantes.

## Aparência da loja

`PATCH /painel/loja` aceita `palette:terracotta|forest|ocean|plum`, `font:editorial|simple|classic`, `layout:cozy|compact|showcase`, `banner_id` e `has_own_delivery` booleano, além dos campos de configuração existentes. Campos de aparência omitidos preservam o valor atual. Opções fora dos conjuntos permitidos retornam 422. O layout é persistido pela migração 0003.

`GET /pedidos/:token` inclui `palette`, `font` e `layout` no objeto público `store` para aplicar a aparência também ao acompanhamento. A resposta continua sem contato ou endereço do comprador.
