# Auditoria breve do recebimento

Revisão de 24/10/2026, sobre o fluxo de Meus pedidos, acompanhamento público e conclusão pelo lojista.

| Falha reproduzida                                                                                                                         | Correção                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metadados históricos inválidos ou nulos causavam HTTP 500 no acompanhamento; valores de status desconhecidos também chegavam à interface. | A leitura tolera o evento malformado e publica somente status reconhecidos. O evento original permanece na auditoria; estado e recebimento continuam vindo dos registros autoritativos. |
| Uma consulta de Meus pedidos sem mudança na versão apagava o erro de uma confirmação recusada.                                            | O bloco de recebimento é preservado quando versão e recebimento não mudam. Os detalhes da loja continuam sendo atualizados.                                                             |
| Uma resposta iniciada antes da interação por teclado recriava o botão e perdia o foco, tanto na lista quanto no acompanhamento.           | Se o foco estava no bloco de recebimento, ele volta ao controle correspondente ou ao estado final. A consulta não desloca a rolagem.                                                    |

As falhas foram reproduzidas antes das correções em testes de D1/workerd e navegador. Os novos cenários retêm respostas de rede para simular a chegada após o foco e verificam que Espaço ainda confirma o recebimento. O teste de erro também muda o título da loja sem alterar o pedido, comprovando a atualização dos dados sem apagar a mensagem.

Validação local aprovada: **198 testes de backend e 11 cenários de navegador do fluxo de recebimento**, além de tipos, formatação e build. A suíte completa da CI contém 45 cenários de navegador.

A validação mantém os testes de origem, isolamento entre lojas/clientes, links expirados/revogados, concorrência, resposta perdida e bloqueio da conclusão antes do recebimento. Não foram alterados login, permissões, valores, regras de pagamento ou formato de armazenamento. Não exige migração, reset ou dependências novas.

Comandos: `npm run check`, `npm run lint`, `npm test`, `npm run build` e `npm run test:e2e`. A CI executa também a restauração de uma cópia do D1 local antes da integração na `main`.

Esta é uma revisão dirigida aos fluxos recentes; não constitui uma auditoria exaustiva de todo o projeto ou teste de capacidade do ambiente remoto. O checkpoint anterior permanece inalterado.
