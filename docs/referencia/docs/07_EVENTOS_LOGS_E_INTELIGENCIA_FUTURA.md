# Registro de atividades sem encarecer o primeiro protótipo

## Separação de três trilhas
1. **Auditoria obrigatória de segurança:** login de lojista, tentativas negadas, mudança de configuração/chave Pix, criação de pedido, aceite, cancelamento, confirmação manual e abertura de reembolso. Somente backend produz evento confiável; preservação conforme necessidade jurídica e operacional documentada.
2. **Fatos de domínio:** pedido criado/aceito/entregue, item e preço snapshot, modalidade de entrega; alimentam indicadores do vendedor **sem** depender de clique ou cookie analítico.
3. **Eventos comportamentais opcionais** (mais tarde): visualização de produto, clique em anúncio, abertura de carrinho, origem de campanha. Consentimento ou outra base legal pertinente documentada, armazenamento curto, minimização e agregação. Não gravar clique por requisição indiscriminadamente no D1.

## P1 obrigatório
- Auditar transições críticas numa operação coerente com negócio; registrar `correlation_id`, loja, data, ator interno e motivo. Não gravar PII, IP completo ou identificador bancário no evento de métrica.
- Contagem básica **derivada de pedidos persistidos**: número de pedidos, recusados, concluídos, ticket médio de pedidos, item com mais unidades vendidas (status comercial separado do recebimento financeiro). Sem dashboard de publicidade.
- Coleta de clique e anúncios **desligada** por padrão, sem scripts trackers externos ou cross-site.

## P2 e futuro
- Documentar retenção proporcional por classe, anonimização, pedido de exclusão e processo de purge. A retenção anterior de 14 dias para cliques é **parâmetro sugerido**, não exigência da LGPD; precisa de justificativa de finalidade e aprovação jurídica.
- Analytics com `event_id`/nonce e dedup; contadores agregados por dia/loja/item com janela e atraso explícitos. Não agrupar usuários de lojas distintas para publicidade comportamental sem base e transparência.
- Futuro catálogo de métricas: visualizações, conversão, vendas, recompra, demanda por horário, anúncios, margem **apenas se custo de produto for cadastrado**. VRM permanece sigla ambígua: definir fórmula com usuário antes de qualquer regra.
- Se os eventos começarem a consumir parte relevante dos 500MB de D1 ou 100k rows written/dia do plano Free, antes fazer amostragem/agrupamento ou mover eventos para outro armazenamento com política apropriada. Nunca sacrificar gravação de pedido.

## Verificações
Comprovar que browser não pode criar `bank_reconciled` ou logs `seller_confirmed`; falha em click tracking não impede pedido; falha em registrar evento financeiro crítico impede alteração do estado; nenhum token/chave Pix/contato completo entra em log analítico.
