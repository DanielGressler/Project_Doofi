# Gates de qualidade: P1 para demonstração; P2 para vendas reais

**Regra:** nenhum gate de P2 pode ser substituído por resultado dos scripts Python, SQL local ou demo HTML v0.9.4.

| Gate | P1 — protótipo com dados fictícios | P2 — piloto com dados e dinheiro reais |
|---|---|---|
| G01 produto | jornada J1–J3 na aplicação, com dois lojistas e estados corretos | fluxos completos com lojistas treinados, canal suporte |
| G02 autonomia | loja gerencia catálogo, entrega e pedidos sem interventor | disponibilidade, cancelamento e pós-venda verificados |
| G03 autorização | teste bloqueia acesso loja A→B no backend e painel | revisão de todas as rotas e links; credenciais/sessões em produção |
| G04 valores | servidor calcula e congela total; teste de manipulação | mesma regra com preço/frete real, QR sem divergência |
| G05 idempotência | reenvio concorrente 10x produz 1 pedido | teste E2E em staging D1 + simulação rede instável |
| G06 pagamento | somente eventos SIMULADOS identificados como tais | QR Pix testado em banco, confirmação manual pelo lojista no extrato, incidentes |
| G07 privacidade | dados fictícios, campos e telas sem vazamento | revisão LGPD/CDC, termos, direitos e classificação de logs |
| G08 auditoria | `order+event` atômicos nos testes; nenhuma origem browser confiável | evidência de auditoria e acesso restrito para reembolso e Pix |
| G09 operação | deploy de homologação protegido com histórico de releases | backup fora do banco, restauração ensaiada, alerta/quota, procedimento 5xx |
| G10 UX | celular e desktop, teclado, textos de erro corretos | avaliação com 5 compradores/lojistas reais, acessibilidade básica revisada |

## Critérios de não-prosseguir (NO-GO)
- Qualquer preço manipulável pelo navegador, pedido duplicado, IDOR, `pay_confirmed` por print, total do pedido não definido com QR cobravel, chave Pix de outra loja, perda de evento de auditoria crítica, rota de pedido vazando endereço, esquema sem restore viável.
- Usuário/lojista sem forma de contato, política de devolução inexistente ou ausência de canal para contestação: bloquear piloto.
- Provedor Free pausando/provavelmente bloqueando transações e sem contingência definida: bloquear piloto.

## Evidências a arquivar no repositório após desenvolvimento
Relatórios de testes (com versões e ambiente), gravação curta da jornada, logs anonimizados de idempotência/cross-tenant, medição de D1/Worker, registro de restore, checklist LGPD/jurídico e assinatura do responsável por go/no-go. **Nenhuma dessas evidências existe para P1 implementado nesta entrega.**
