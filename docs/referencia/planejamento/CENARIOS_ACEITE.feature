# language: pt
Funcionalidade: loja digital multiempresa com entrega do vendedor

  Cenário: pedido único com retirada
    Dado que a loja A esteja publicada com produtos disponíveis
    Quando um comprador seleciona dois itens e escolhe retirada
    E envia o mesmo checkout duas vezes usando a mesma chave de idempotência
    Então existe somente um pedido persistido com valores calculados pelo servidor
    E o lojista A o encontra em sua fila
    E o cliente o acompanha com um token imprevisível

  Cenário: pedido de loja A não se mistura à B
    Dado que existem lojas A e B com preços distintos
    Quando o comprador tenta incluir item da loja B num carrinho da A
    Então a operação é rejeitada sem criar pedido

  Cenário: isolamento do painel
    Dado que o lojista A está autenticado
    Quando tenta consultar ou alterar pedido da loja B pelo identificador
    Então recebe resposta sem informação da loja B
    E o evento de autorização negada é registrado sem dados pessoais sensíveis

  Cenário: frete a combinar não gera cobrança
    Dado que a loja escolheu taxa de entrega a combinar
    Quando o comprador envia solicitação sem preço de frete
    Então o pedido fica pendente de cotação
    E não é exibido Pix real nem declarado total numérico final
    Quando a loja propõe taxa e prazo
    E o cliente aceita a proposta válida
    E a loja aceita o pedido
    Então o total fica congelado para eventual pagamento no piloto

  Cenário: print de comprovante é insuficiente
    Dado um pedido aceito de valor conhecido no piloto
    Quando o comprador afirma que pagou e envia print
    Então o sistema registra somente declaração do cliente
    E a confirmação permanece pendente de conferência manual pelo lojista

  Cenário: pagamento posterior ao cancelamento
    Dado que o pedido está cancelado
    Quando comprador declara Pix após o cancelamento
    Então o pedido não volta automaticamente ao estado aceito
    E uma ocorrência de pagamento tardio fica disponível ao vendedor

  Cenário: alteração de preço não altera pedido passado
    Dado um pedido com item de R$ 10 salvo com preço snapshot
    Quando o vendedor altera o catálogo para R$ 12
    Então o pedido histórico mantém o preço antigo

  Cenário: analytics opcional falha sem bloquear pedido
    Dado que o comprador não deu consentimento para tracking opcional
    Quando realiza checkout
    Então o servidor grava pedido e auditoria crítica
    E não grava visualização pessoal ou clique de anúncio

  Cenário: falha na auditoria bloqueia a alteração crítica
    Dado que o banco recusa a gravação do evento crítico
    Quando o vendedor tenta cancelar o pedido
    Então o banco não persiste a transição sem a auditoria
