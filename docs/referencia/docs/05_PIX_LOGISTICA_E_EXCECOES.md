# Pix direto, entrega do lojista e casos excepcionais

## P1 — apenas demonstrar regras, nunca cobrar
- Nenhuma chave Pix real no banco DEV; sem QR cobravel. Uma tela **de simulação** indica o momento em que o QR poderá aparecer no futuro.
- `PAY_AT_PICKUP` e `PAY_ON_DELIVERY` podem aparecer como métodos simulados e são pagos somente ao lojista na vida real.
- Entrega: `PICKUP` ou `SELLER_DELIVERY_FIXED` ou `SELLER_DELIVERY_QUOTE`. Taxa/lugar/prazo informados pela loja; a plataforma não calcula frete por mapa e não contrata motoboy.

## P2 — pagamento direto, sem conta de trânsito
- Gerar Pix BR Code estático com recebedor e chave **da loja**, valor em centavos conferido, `txid` quando aplicável conforme manual BACEN. Exibir nome esperado do recebedor para conferência no app bancário; testes com bancos concretos dos pilotos.
- Ordem de desbloqueio: carrinho → total (inclui frete) conhecido → aceite da proposta pelo comprador (se cotação) → aceite do vendedor → Pix exibido. Nunca cobrar no estado de frete indefinido.
- A plataforma **não** verifica a compensação do Pix sem acesso bancário autenticado. `PAGUEI` = autodeclaração; comprovante = documento contestável; `VENDEDOR CONFIRMOU` = somente registro de conferência humana; `BANCO CONCILIADO` = só se integração oficial autenticada futura.
- Pix agendado/falso, nome de destinatário divergente, valor incorreto, pedido cancelado ou `txid` reaproveitado: exibir ocorrência e pedir intervenção do vendedor. QR estático pode continuar pagável após cancelamento; aplicação não promete revogação bancária automática.
- Não capturar senha, cartão, token ou sessão bancária. Tarifas Pix comerciais dependem de bancos e contas dos vendedores. Nenhuma garantia de Pix gratuito universal.

## Cancelamento, devolução e MED
- Pedido cancelado com pagamento real: abrir ocorrência, contatar vendedor e usar funcionalidade de **devolução da transação Pix original no banco**, conferindo valor, destinatário e protocolo. Não solicitar ao comprador chave nova por mensagens.
- A operação no banco deve ser realizada pelo titular autorizado, fora do site. O sistema registra solicitação, comprovante apresentado pelo lojista, conferência/contestação, sem alegar transferência concluída automaticamente.
- Não duplicar reembolso: saldo devolvível baseia-se em créditos **verificados pelo vendedor ou banco conforme origem rotulada**, devoluções confirmadas e pendências; bloquear automatismo durante MED/contestação, caso exista. Lembre-se: software não controla nem impede 2 devoluções manuais feitas pelo banco fora dele.
- MED tem elegibilidade e rito conduzidos pelo PSP, não serve para desfazer qualquer desacordo comercial; evitar automatizar interpretações da legislação.
- Tratamento de reclamações e direito de arrependimento no comércio eletrônico requer avaliação jurídica; termos não eliminam direitos do consumidor.

## Caso de venda falsa
- Um pedido criado não equivale a venda recebida. KPIs separados: `pedidos criados`, `aceitos`, `confirmados pelo lojista`, `conciliados pelo banco` (último ausente sem banco), `cancelados` e `devoluções declaradas`.
- Detectar repetição de identificadores fornecidos pelo lojista, padrões de pedidos sintéticos, múltiplos reembolsos, mudança brusca de chave Pix; marcar apenas como **suspeita**, sem declarar fraude automaticamente.
- Logs do servidor e comprovantes bancários legíveis quando estritamente necessários, com retenção, proteção e controle de acesso. Não capturar fotos como suposta prova definitiva.

## API geográfica e climática
**Não essenciais** em P1/P2: vendedor define bairro/região/taxa manualmente. CEP auxilia preenchimento, mas validação do CEP não determina entregabilidade. O clima pode apoiar gestão futuramente, mas não deve participar do valor ou liberação de pedido inicial. Documentar adaptadores `AddressLookupProvider` e `WeatherProvider` apenas como pontos de extensão, sem código e sem cobrança recorrente.
