# Especificação funcional do primeiro protótipo

## Quem usará
**Visitante comprador (sem conta)** vê catálogo e envia pedido com contato mínimo. **Lojista administrador** configura loja, preço e pedido no seu próprio painel. **Operador da plataforma** cria/ativa lojas e ajuda no suporte; acesso restrito, com ações auditadas. Lojista não vê dados de outra loja.

## P1 — MUST: primeiro protótipo funcional (SEM VENDA OU PIX REAIS)
| ID | Recurso | Comportamento observável | Regra/invariante |
|---|---|---|---|
| F01 | Gerenciamento de 2 lojas | criar loja fictícia A/B por seed de desenvolvimento (sem painel global P1); slug único, identidade, telefone comercial, horário e retirada/entrega | `tenant` isolado em dados e painel |
| F02 | Catálogo | listar categoria, item, imagem de teste, preço, disponibilidade | valores em centavos; mudanças não alteram pedido antigo |
| F03 | Carrinho de uma loja | adicionar, remover, alterar quantidade, subtotal | nenhum carrinho multi-loja; totals recalculados no servidor |
| F04 | Checkout convidado | nome de referência, contato para retorno, observação opcional, modalidade de entrega | minimização de dados e aceite informado; sem CPF obrigatório |
| F05 | Entrega do próprio lojista | retirada gratuita, entrega com taxa fixa definida pela loja ou frete a combinar | sem coleta pela plataforma, sem roteirização nem API de entregador |
| F06 | Cotação de entrega | se `a combinar`, vendedor propõe taxa + prazo, consumidor aceita explicitamente | total só fechado após aceite; nenhuma cobrança antecipada |
| F07 | Pedido idempotente | grava itens, snapshot de preço, frete, total, status inicial e token externo | duplo envio ≡ um pedido; preço nunca vem do navegador |
| F08 | Painel de pedidos | lojista recebe lista, aceita, recusa, prepara, conclui entrega/retirada | somente membro autorizado da loja; auditoria por transição |
| F09 | Consulta do comprador | link imprevisível para ver situação do pedido e proposta de frete | sem expor histórico completo nem PII por URL previsível |
| F10 | Pagamento demonstrativo | opção pagar na retirada/entrega; exibir estado Pix **simulado sem chave real** | prova que fluxo suporta Pix; não recebe, transfere nem autentica banco |
| F11 | Auditoria essencial | grava quem alterou produtos/preços, pedido, status, conta recebedora de teste e reclamação | logs de domínio server-side, imutabilidade lógica, acesso restrito |
| F12 | Identificação e segurança | login real ou credencial DEV segregada para demo interna; 2 perfis; restrições A/B; logout | sem usar credencial DEV em público; login real obrigatório P2 |
| F13 | Interface responsiva/acessível | fluxo completo no celular pequeno e por teclado; erros compreensíveis | validar em dispositivo real e com leitores adequados |

## P2 — MUST para piloto comercial fechado com pedidos reais
- Autenticação segura, recuperação de acesso, autorização por loja, proteção de alteração de chave Pix com reautenticação, notificações e auditoria.
- **QR Code Pix real com BR Code testado em bancos**, emitido somente depois de pedido + total fechado + aceite do lojista, com recebedor destacado, sem taxa/retensão da plataforma.
- Cliques/prints/comprovantes do consumidor **não** confirmam pagamento. Lojista verifica extrato e marca `confirmado pelo lojista` com data/responsável; não usar rótulo `validado pelo banco`.
- Estados de cancelamento, divergência, pagamento tardio, solicitações de reembolso e confirmação documental pelo vendedor; sem **estorno bancário automatizado**; MED é procedimento bancário separado.
- Backups externos, exercício de restauração, monitoramento, limitação anti-spam, suporte e termos/políticas revisadas antes da primeira venda real.
- Treinamento do vendedor para conferência bancária e entrega por conta própria.

## SHOULD pós-primeira fatia, se for essencial ao piloto
- Complementos/preços variantes de produtos (modificador simples por item, sem árvore arbitrária de regras).
- Operador ajudante da loja com papéis distintos; alertas leves no painel; export CSV de pedidos com consentimento/controle.
- Resumo de pedidos por período, ticket médio **de pedidos** e cancelamentos, sem inferir liquidação bancária.
- Fotos de produtos em R2 com transformação/limites; no P1 usar assets de teste.

## LATER — excluído do primeiro protótipo
Marketplace agregador, múltiplas lojas no carrinho, comissionamento por venda, split, intermediador financeiro, API bancária obrigatória, confirmação Pix automática, conta bancária da plataforma para receber pedidos, GPS em tempo real, mapas e rotas, APIs climáticas, anúncios impulsionados, avaliações públicas, recomendações preditivas/VRM (definição ainda pendente), CRM multi-loja, app nativo, push complexo e analytics de clique individual. Preparar nomes de interfaces/módulos, **não implementar**.

## Não-funcionais desde o primeiro commit
Prioridade: correção de total/idempotência > autorização multiempresa > auditabilidade > UX do celular > custo > features adicionais. Todos os dados fictícios em P1; todas as interações reais bloqueadas até aprovação de P2.
