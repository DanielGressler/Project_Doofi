# Preparo, entrega e avisos de confirmação

Atualização de 24/10/2026. Funcionalidade de demonstração, com dados fictícios e confirmação manual. Não registra entrega física, localização de entregador ou pagamento real.

Complemento posterior: a conclusão agora exige a [confirmação de recebimento pelo cliente](RECEBIMENTO_CLIENTE.md), inclusive no servidor. O roteiro abaixo descreve a entrega manual original; siga também o novo passo do cliente antes de concluir.

## Uso

1. Aceite o pedido na fila ou nos detalhes. Em frete a combinar, o comprador precisa aceitar a proposta antes do aceite da loja.
2. Prepare os produtos e clique na barra **Pedido pronto**. O estado passa a `READY` tanto para retirada quanto para entrega. No acompanhamento, o cliente recebe instruções adequadas ao tipo escolhido.
3. Clique em **Entregar pedido** para abrir a confirmação. **Voltar** ou Escape fecham sem alterar o pedido. **Confirmar entrega** conclui o atendimento (`COMPLETED`).
4. Abra o cartão **Histórico de transações** quando precisar consultar o registro. Ele começa minimizado e mostra até os 100 eventos mais recentes, em ordem cronológica. Os eventos anteriores continuam armazenados no banco.

Aceite, recusa, envio de cotação, pedido pronto, entrega e conferência simulada de pagamento geram um aviso pequeno de confirmação. Ele desaparece suavemente após 20 segundos, com pausa enquanto o ponteiro ou o foco estiverem no aviso. O X permite fechar antes. Preferência por movimento reduzido remove a animação. A chegada de pedidos continua na fila existente; ela não usa esse aviso temporário.

Erros de validação, rede ou conflito permanecem visíveis. Se a resposta de uma operação se perder, o sistema consulta o estado do pedido antes de liberar os botões, sem reenviar a operação automaticamente. Só apresenta confirmação recuperada quando a leitura comprova o estado esperado.

## Auditoria e correções

| Problema                                                                                        | Correção e verificação                                                                                                                                 |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pedido, cotação e pagamento consultados separadamente poderiam representar momentos diferentes. | Uma leitura em lote D1 retorna um retrato consistente, sempre restrito à loja. Teste com gravação intercalada confirma a mesma versão e pagamento.     |
| Dois cliques ou ações simultâneas na página poderiam disputar a mesma versão.                   | Bloqueio compartilhado dos controles durante gravação e conferência posterior; versão otimista no servidor e auditoria atômica continuam obrigatórias. |
| Uma resposta antiga de consulta poderia liberar botões antes da conferência da gravação.        | Leituras anteriores à mutação são descartadas. Teste retém e libera respostas fora de ordem.                                                           |
| Confirmação aberta poderia ficar desatualizada após alteração por outro atendente.              | A confirmação guarda a versão exibida e fecha quando uma nova versão chega. O servidor também rejeita versão obsoleta.                                 |
| Voltar pelo histórico do navegador poderia restaurar uma tela antiga.                           | Retorno do cache de navegação fecha a confirmação e bloqueia os controles até uma nova consulta.                                                       |
| Resposta perdida após uma gravação poderia induzir repetição ou mensagem incorreta.             | Reconciliação pela leitura do estado; teste interrompe a resposta depois da gravação e confirma um único evento por ação.                              |
| Auditoria sem limite aumentava custo de leitura e renderização.                                 | Carregamento apenas ao expandir, limite de 100 eventos, consultas serializadas e tratamento de metadados históricos malformados.                       |
| `READY` tinha texto específico de retirada mesmo quando usado para entrega.                     | Rótulo geral **Pedido pronto**, com instruções diferentes para retirada e entrega.                                                                     |
| Fechar um aviso poderia devolver foco a botão já escondido.                                     | Retorno ao controle original apenas quando disponível; alternativa no título da página. Teste de teclado e análise automatizada de acessibilidade.     |

Os alvos de transição e a ação principal ficam em um módulo compartilhado entre servidor e interface. Os estados antigos `PREPARING` e `OUT_FOR_DELIVERY` continuam aceitos para compatibilidade. A conclusão não confirma automaticamente pagamento; o fluxo de conferência simulada permanece separado.

O escopo da loja vem da sessão, sem aceitar identificador empresarial do navegador. Preços, itens e contatos permanecem nos vínculos existentes; não foram criadas contas de cliente, verificadores ou cookies novos. Avisos usam texto simples e memória da página, sem gravar dados de pedidos no navegador.

## Validação e publicação

- Validação local: **185 testes de backend e 40 cenários de navegador aprovados**, além de análise de tipos e formatação. Build local, build de homologação e deploy em modo `--dry-run` aprovados.
- Testes de backend em workerd/D1 cobrem retirada, entrega fixa, cotação, isolamento entre lojas, concorrência e reversão atômica em falha de auditoria.
- Testes de navegador cobrem as duas modalidades, barra em tela de 320 px, cancelamento da confirmação, histórico recolhido, foco, acessibilidade, duração dos avisos, respostas atrasadas/perdidas e outro atendente.
- A suíte completa também verifica checkout, catálogo, tutorial, paleta, notificações e segurança existentes.

Comandos: `npm run check`, `npm run lint`, `npm test`, `npm run build` e `npm run test:e2e`. O build de homologação é verificado separadamente com `npm run build:staging` e deploy em modo `--dry-run`.

Esta alteração não exige migração, reset ou atualização de dependências. A integração na `main` deve ocorrer após os checks passarem. O checkpoint anterior `checkpoint-demo-2026-10-24` permanece no commit `5265241`; ele não restaura dados do banco. A execução local e a publicação na Cloudflare são verificações diferentes; o teste autenticado no endereço remoto continua sendo uma etapa de aceitação com a conta autorizada.
