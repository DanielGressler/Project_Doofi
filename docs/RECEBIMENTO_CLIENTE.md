# Confirmação de recebimento pelo cliente

Atualização de 24/10/2026. A confirmação continua sendo um botão de demonstração, sem comprovação de entrega física, login de cliente ou verificação por e-mail/SMS.

## Como testar

1. Faça um pedido com dados fictícios. Ao abrir o acompanhamento, ele entra em **Meus pedidos**, acessível pelo cabeçalho e rodapé das telas do cliente.
2. No painel, aceite o pedido e clique em **Pedido pronto**. A conclusão fica bloqueada e o painel informa que aguarda o cliente.
3. No cliente, abra **Meus pedidos** e clique em **Confirmar recebimento**, somente depois de receber os produtos. O mesmo botão também está disponível no acompanhamento individual.
4. O painel consulta o novo estado automaticamente. A loja pode então usar **Entregar pedido → Confirmar entrega** para concluir. Confirmar recebimento não conclui o pedido nem confirma pagamento.

O botão aparece para retirada e entrega quando o estado está em `READY` ou `OUT_FOR_DELIVERY`. Antes disso, a interface explica quando estará disponível. Pedidos cancelados, recusados ou concluídos sem confirmação anterior não aceitam novo recebimento. Os atendimentos concluídos antes desta atualização permanecem encerrados.

## Dados e isolamento

**Meus pedidos** usa apenas referências dos pedidos criados ou acessados nesta aba, até 20, guardadas em `sessionStorage`. Não guarda nome, telefone, e-mail, endereço ou senha. A referência expira localmente em até 30 dias; a validade e revogação do link continuam sendo verificadas no servidor. Abrir o link de acompanhamento em outro dispositivo adiciona o pedido à lista daquela aba. Sem armazenamento, o link individual continua funcionando.

Não há busca por identidade ou lista global de clientes. Cada chamada consulta um pedido específico pelo vínculo já existente. Quem possui o link pode acompanhar e executar as ações do comprador; nesta fase isso é uma declaração de recebimento, sem verificação adicional de identidade. A sessão empresarial não é usada para confirmar pelo cliente.

O servidor registra um evento imutável `CUSTOMER_RECEIPT_CONFIRMED`, restrito ao pedido e à loja. `received_at` é derivado desse evento e não aceita dados enviados em formulários. A leitura independe dos 100 eventos recentes exibidos na interface, evitando perder a confirmação quando o histórico cresce.

## Regra no servidor e concorrência

`POST /api/v1/pedidos/:token/confirm-receipt` usa `{version, nonce}`, com o vínculo e a proteção de origem existentes. A gravação revalida estado, loja, versão e validade do link na transação. Incremento de versão e auditoria são atômicos. O reenvio de uma confirmação já registrada retorna o mesmo fato, sem outro evento.

A transição empresarial para `COMPLETED` exige recebimento confirmado tanto na validação quanto no `UPDATE` transacional. Enviar `received_at`, trocar empresa no payload ou alterar somente a interface não libera a conclusão. A versão otimista continua obrigatória para o lojista.

Falhas de rede não provocam reenvio automático: o cliente consulta o pedido para conferir se a confirmação foi gravada. A lista limita consultas simultâneas a duas, pausa consultas automáticas em aba oculta ou durante uma confirmação e preserva versões mais novas.

## Atualização

Não há migração, reset ou novas dependências: o fato utiliza a auditoria imutável existente. O checkpoint `checkpoint-demo-2026-10-24` permanece inalterado. Voltar para código anterior remove esta nova regra de bloqueio; um rollback deve considerar essa diferença de comportamento.

Testes de backend cobrem autorização por pedido, origem, isolamento entre lojas, reenvio, concorrência, links revogados/expirados durante a gravação, reversão em falha de auditoria, histórico limitado e compatibilidade de pedidos antigos. Os testes de navegador cobrem a confirmação em Meus pedidos, perda da resposta após gravação, liberação do lojista, armazenamento sem contatos, abas de clientes distintas e acessibilidade em 320 px.
