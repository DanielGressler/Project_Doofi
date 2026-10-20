# Rastreabilidade mínima de requisito → critério → cenário → marco

| Requisito | Evidência necessária | Cenário feature | Marco |
|---|---|---|---|
| F01/F12 lojas + autorização | 2 lojas isoladas, 403 ou 404 sem vazamento | Isolamento do painel | P1 |
| F02/F03 catálogo e carrinho | preço e tenant validados | pedido de loja A não mistura à B | P1 |
| F04/F05 checkout e entrega | total validado, endereço só na entrega | pedido único com retirada | P1 |
| F06 cotação | sem Pix com frete indefinido | frete a combinar não gera cobrança | P1 |
| F07 idempotência | 10 envios resultam 1 registro | pedido único com retirada | P1 |
| F08 painel | transições autorizadas e logadas | isolamento do painel | P1 |
| F09 consulta cliente | token não enumerável + dado minimizado | pedido único com retirada | P1 |
| F10 Pix simulado | nenhuma cobrança verdadeira P1 | print de comprovante é insuficiente | P1 |
| F11 auditoria | pedido e evento atômico, rollback | falha na auditoria bloqueia alteração | P1 |
| P2 Pix real | QR só com total e aceite; vendedor recebe direto | frete a combinar / print | P2 |
| P2 reembolso | case separado de devolução bancária | pagamento posterior cancelamento | P2 |
| Logs e métricas | cliques opcionais não impedem checkout | analytics opcional falha | P1 |
