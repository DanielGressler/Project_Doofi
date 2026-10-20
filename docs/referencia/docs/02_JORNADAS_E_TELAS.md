# Jornadas, telas e critérios visuais do protótipo (NÃO são telas implementadas)

## Mapa mínimo de rotas (nomes sugeridos, podem ser ajustados)
| Tela / URL | Persona | Componentes indispensáveis | Estado vazio / erro |
|---|---|---|---|
| `/loja/:slug` | visitante | cabeçalho identificando vendedor, telefone, disponibilidade, produtos, carrinho; modo de entrega | loja suspensa, fora de horário, produto inativo |
| `/loja/:slug/carrinho` | visitante | itens, quantidade, subtotal em R$, voltar ao catálogo | carrinho vazio, preço alterado |
| `/loja/:slug/checkout` | visitante | contato, retirada ou entrega por loja, endereço só se entrega, observações, termos resumidos | CEP inválido, região não atendida, entrega cotada |
| `/pedido/:token` | comprador | status e próximos passos, consulta de proposta, aceitar/rejeitar frete, aviso de cobrança | token inválido/expirado, pedido cancelado |
| `/painel/entrar` | lojista | login, recuperação, aviso de segurança | credenciais erradas, bloqueio de tentativas |
| `/painel/pedidos` | lojista | fila de pedidos, status, total, ação aceitar/recusar/propor frete, detalhes | loja sem pedidos, falha de rede |
| `/painel/catalogo` | lojista | criar/editar item, preço, categoria, disponibilidade | catálogo vazio, validação erro |
| `/painel/loja` | lojista | identificação, horários, contato, regras de retirada/entrega; Pix no P2 | sem chave, alteração de chave pendente |
| `/admin/lojas` (P2 opcional) | operador | provisionar/suspender lojas; no P1 cadastrar as duas lojas por seed/script dev | sem permissão, indisponível |

### Jornada J1 — pedido com retirada
Vendedor publica 3 itens → comprador abre link da loja → seleciona 2 itens → checkout convidado + retirada → servidor valida preço/estoque lógico → gera pedido + protocolo + auditoria numa operação coerente → lojista visualiza → aceita → muda preparo/pronto → entrega em mãos → pedido concluído. No P1 todos os pagamentos são sintéticos.

### Jornada J2 — entrega com taxa fixa
Loja configura taxa e regiões atendidas → comprador informa endereço mínimo → sistema valida regras cadastradas (sem GPS obrigatório) → mostra produtos + taxa + total → cria pedido pendente de aceite → lojista aceita/recusa → entrega administrada pelo lojista. Não prometer rastreio, motoboy contratado ou SLA de entregas da plataforma.

### Jornada J3 — entrega a combinar
Comprador seleciona entrega a combinar → envia solicitação **sem total final e SEM QR Pix** → lojista oferece taxa + prazo/validade → comprador abre link e aceita/rejeita → lojista confirma pedido com valor final → somente em P2 poderá visualizar Pix real do vendedor; expiração e contraproposta são explícitas. Não usar R$0 como taxa provisória.

### Jornada J4 — Pix (P1 simulação / P2 real)
Pedido e total fechados + lojista aceita → (P1: tela demonstrativa com dados fictícios, sem QR cobravel) (P2: BR Code para chave do próprio lojista) → comprador informa `paguei` (declaração) → lojista consulta extrato e confirma MANUALMENTE → estado diferenciado `conferido pelo lojista`; `confirmado pelo banco` só com integração autenticada futura. Pagamento tardio abre ocorrência, não reativa pedido; comprovante anexado nunca é prova definitiva.

### Jornada J5 — pedido falso, preços e conflitos
Cliente muda `total` no navegador: servidor ignora e recalcula; tenta pedido para loja B com IDs de A: rejeitar; duplo clique/retry 10x: retornar mesmo pedido; vende item indisponível: bloquear ou exigir revisão; lojista A tenta atualizar de B: 403 e evento de auditoria; clique `já paguei` não altera `pago`.

## Acessibilidade e comunicação
- Teclado completo, foco visível, contraste, texto sem depender de cor; botões >= área confortável para toque.
- Exibir separadamente `subtotal`, `taxa de entrega`, `total confirmado`; nunca chamar `saldo bancário` ou `liquidado` sem evidência.
- No cabeçalho/rodapé da loja: nome comercial, CNPJ/CPF quando juridicamente exigido e apropriado, endereço/área, contato, políticas de entrega/cancelamento acessíveis; revisar conteúdo legal.
- Entregar feedback imediato de pedido recebido e próxima ação; planejar fallback se o navegador fechar.
- Autenticação e consulta de pedido devem revelar o mínimo possível; token da URL tem alta entropia, revogação e restrições de exibição.
