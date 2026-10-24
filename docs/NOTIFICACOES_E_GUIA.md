# Paleta, guia contextual e avisos de pedidos

## Paleta da loja

A paleta e as fontes salvas em Minha loja acompanham a loja pública, carrinho, checkout, acompanhamento, catálogo, pedidos e personalização do lojista. A identidade é carregada a partir da loja da sessão autenticada; uma empresa não escolhe nem recebe o tema de outra.

Ao trocar a paleta na personalização, a tela inteira muda para prévia. A gravação continua explícita em Salvar configurações. Os cartões do catálogo usam fundo suave, borda e botão + da paleta, mantendo apenas nome e + quando recolhidos. Vermelho de recusa e cores de estado continuam tendo significado de ação/estado, e imagens ilustrativas mantêm suas cores próprias.

## Tutorial com orientações flutuantes

O X no aviso do guia substitui a antiga caixa de seleção de pular o tutorial. Está disponível no cadastro e durante o roteiro. Após criar a conta, pular continua sendo uma operação autenticada com CSRF, permissão de proprietário e controle de versão. Campos, arquivos selecionados e rascunhos não são enviados nem apagados ao pular.

O roteiro aponta para um controle por vez. A personalização tem 12 orientações para identidade, entrega, cores, fontes, layout, banners, prévia e gravação. O catálogo tem 18 orientações para navegação, campos do produto, disponibilidade, combos, rodapé e atendimento. Os campos permanecem utilizáveis durante as explicações, com Voltar, Continuar, pausa das animações e respeito à preferência de movimento reduzido.

Nas criações, o mesmo aviso acompanha os campos dentro do pop-up, preservando a navegação por teclado do diálogo. Fechar a criação preserva o rascunho e retorna à orientação do botão de criação. Salvar o produto avança à explicação dos cartões, sem reabrir uma criação vazia após a recarga. O guia pode ser retomado no rodapé.

## Notificações de compra

O aviso usa apenas o cartão central. Mostra produtos e quantidades, cliente, retirada/endereço, produtos, entrega, total e observações. Cotação, motivo de recusa e decisões continuam no cartão. O protocolo não aparece nesse aviso; continua disponível na lista e nos detalhes do pedido para consulta.

Os botões de atualizar pedidos e atualizar pedido em foco foram removidos. Com a aba visível, a consulta automática do painel ocorre em intervalos de aproximadamente 5 segundos, com variação para distribuir chamadas, apenas uma leitura em andamento e espera progressiva em falhas. O retorno da conexão ou da aba antecipa a leitura. Não há envio automático de decisões.

O pedido em foco mantém a prioridade quando chegam outros, ao minimizar o aviso e quando uma cotação antiga retorna à fila. Antes de liberar uma prioridade ausente do lote, o sistema consulta seu detalhe. Uma decisão confirmada ou um pedido atendido por outro operador libera a próxima entrada. Falhas/conflitos provocam nova leitura para conferir o estado, sem repetir a gravação. O preenchimento do motivo de recusa não é descartado ao minimizar e reabrir o mesmo pedido.

Som opcional e pausa das consultas ficam em Preferências dos avisos, recolhidas por padrão. O som depende de uma ação do usuário e continua sujeito às permissões do navegador. Os avisos funcionam com o painel aberto; esta alteração não adiciona notificações com o navegador fechado.

## Atualização

Não há migração de banco ou dependência nova nesta revisão. A publicação usa os comandos de homologação existentes. Não executa reset nem muda os acessos, os validadores de dados fictícios ou o isolamento de empresas/clientes. A migração para Supabase permanece uma etapa separada.

## Conferência

179 testes de código/integração aprovados e 34 cenários de navegador aprovados: a suíte completa de 32 cenários, seguida das regressões adicionais de cadastro real pelo guia e de leitura lenta do pedido prioritário. A conferência inclui isolamento, cookies, dados sintéticos, personalização no painel e no cliente, foco/teclado, contraste e reflow em 320 px, rascunhos preservados pelo X, consultas automáticas e decisões concorrentes. A análise estática terminou sem diagnósticos.

Prévia no celular: [catálogo em destaque](evidencias/catalogo-destaque-mobile.png), [guia de cadastro de produto](evidencias/guia-produto-mobile.png), [personalização](evidencias/guia-personalizacao-mobile.png) e [aviso de compra](evidencias/fila-pedidos-mobile.png).
