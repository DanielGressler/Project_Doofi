# Modelo de dados mínimo e contratos funcionais (ANTES DE CODIFICAR)

## Decisão: esquema lean + histórico preservado
`referencia_v094/db/001_schema_draft.sql` e `002_logs_telemetria.sql` são estudos amplos. Não executar esses arquivos como migrations finais sem revisar compatibilidade D1, volume e restrições. Implementar primeiro o conjunto abaixo, migrando por scripts versionados e com testes de consistência. Dados em valores monetários são **inteiros em centavos de real**.

| Entidade | Campos mínimos / regra | Teste obrigatório |
|---|---|---|
| `stores` | `id`, `slug` único, título, contato, status, timezone, horários, taxas e modo entrega | loja inativa não recebe pedido |
| `users` | `id`, identidade autenticada, status | sessão não confere permissão sozinha |
| `store_memberships` | `store_id`, `user_id`, papel `owner/staff`, ativo | A não consulta B; operador não vira dono implícito |
| `categories`, `products` | `id`, `store_id`, preço centavos, disponível, foto ref opcional, timestamp | IDs entre lojas rejeitados |
| `orders` | `id`, `store_id`, `public_token_hash`, protocolo, status, `idempotency_key` única por escopo, preço/total congelados | retry 10x gera 1 pedido |
| `order_items` | `order_id`, `store_id`, `product_id`, título e preço snapshot, quantidade, subtotal | alteração catálogo não muda compra passada |
| `delivery_quotes` | `order_id`, propostas com taxa/prazo, expiração, aceitação explícita comprador e lojista | frete indefinido não tem QR nem valor falso |
| `payment_records` | `order_id`, método, valor elegível, estado `not_collected/customer_declared/seller_confirmed/bank_reconciled`, ator e instante | declaração não vira liquidação |
| `audit_events` | `id`, `store_id`, actor_id, ação, entidade, timestamp e metadados mínimos | pedido + evento numa operação atômica |
| `refund_cases` P2 | `order_id`, solicitação, motivo, estado, evidência autorizada, origem da transação | nenhuma restituição bancária automática |

**Não implementar análise de cliques em tabela transacional de alto volume no primeiro protótipo.** Requisitos de consentimento e retenção são para etapa futura. `bank_reconciled` permanece sempre ausente sem API bancaria confiável.

## Regras transacionais
1. `POST pedido`: resolver `store_id` pelo recurso/rota e sessão/contexto **server-side**, não confiar no `store_id`, preço ou total enviado pelo cliente. Bloquear preços negativos/quantidade inválida/loja indisponível.
2. `idempotency_key` por checkout, escopo por loja e identidade/intent; payload incompatível com mesma chave retorna conflito. Unicidade em DB; transação inclui pedido, itens, estados e auditoria. Não depender de verificação `SELECT` + `INSERT` sem exclusão concorrente.
3. Estado do pedido e estado financeiro são máquinas separadas; cancelar pedido não desfaz Pix depositado. `CANCELLED/COMPLETED` são finais para o fluxo logístico, casos financeiros permanecem como incidentes/eventos.
4. `audit_events` críticos escritos junto ao fato que audita; falha de auditoria obrigatória deve impedir commit. Nunca receber evento financeiro confiável diretamente do navegador.
5. Token público deve ser aleatório de alta entropia, comparado por hash, revogável quando necessário; página de consulta não exibe endereço/telefone integral.
6. Endereço do cliente não aparece em analytics e não deve entrar em logs de erros; acesso apenas às pessoas que participam da entrega.
7. Chave Pix **não** faz parte de P1 com dados verdadeiros. P2 cadastra vinculada a `store_id` com histórico; troca exige reautenticação, notificação e atualização apenas para novos pedidos.

## Endpoints funcionais conceituais (nomes não vinculantes)
| Método/rota | Requer | Resposta esperada / erro crítico |
|---|---|---|
| `GET /loja/:slug` | público | catálogo publicado ou 404/inativo |
| `POST /api/v1/lojas/:slug/pedidos` | convidado + proteção abuso | protocolo, status, token; `409` chave idempotência conflitante, `422` preço/endereço não aceitos |
| `GET /api/v1/pedidos/:token/status` | token público | status mínimo, cotação e próximos passos; `404` sem vazamento |
| `POST /api/v1/pedidos/:token/aceitar-cotacao` | token + verificação da intenção e nonce | aceita última proposta válida, sem alteração silenciosa |
| `GET /api/v1/painel/pedidos` | sessão lojista | somente pedidos da loja da associação ativa |
| `POST /api/v1/painel/pedidos/:id/transicoes` | sessão lojista + CSRF | alteração autorizada, versão otimista ou conflito `409` |
| `POST /api/v1/painel/produtos` | lojista dono/staff autorizado | valida preço e ownership |
| `PATCH /api/v1/painel/loja/configuracoes` | dono + CSRF | grava taxas e horários com auditoria |
| `POST /api/v1/painel/pedidos/:id/confirmacao-pix` P2 | lojista autorizado | afirma conferência humana, não integração bancária |
| `POST /api/v1/painel/pedidos/:id/reembolso` P2 | lojista autorizado | abre caso, **não transfere recursos** |

**Respostas e autorização:** Erros seguros sem detalhes internos; autenticação por cookie HTTPOnly+Secure+SameSite, proteção CSRF, rate limiting, check de papel no servidor e ownership de cada ID. Cookies de analytics (se houver no futuro) são separados de sessão essencial.

## Trilha de migração e teste
- Inicial criar 2 lojas sintéticas, ~3 produtos em cada, usuários TESTE sem dados reais.
- Testar `PRAGMA foreign_keys`/FK/índices únicos e comportamento em D1 verdadeiro; não assumir que SQLite local equivale totalmente à implantação.
- Medir linhas lidas/escritas por pedido, medir tamanho por auditoria; validar export/restore.
- Diagramas UML históricos são referências, não representam automaticamente o novo modelo mínimo.
