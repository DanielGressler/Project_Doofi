export interface GuideScene {
  title: string;
  text: string;
  target?: string;
  group?: number;
  dialog?: string;
}

export const storeGuide: GuideScene[] = [
  {
    group: 0,
    target: '#store-form [name="title"]',
    title: "O nome que seu cliente vai encontrar",
    text: "Digite o nome da sua loja de teste neste campo. Ele aparece na vitrine e no painel. Você pode editar os campos enquanto eu explico.",
  },
  {
    group: 0,
    target: '#store-form [name="contact"]',
    title: "Um contato para sua loja",
    text: "Use um telefone fictício com DDD 00. Cada loja mantém seus próprios contatos e configurações.",
  },
  {
    group: 0,
    target: '#store-form [name="hours"]',
    title: "Informe quando você atende",
    text: "Escreva seus horários. A abertura e a pausa da loja são controladas por você; este texto orienta o comprador.",
  },
  {
    group: 1,
    target: '#store-form [name="pickup_address"]',
    title: "Onde retirar o pedido",
    text: "Informe um endereço fictício para retirada. Nenhum dado real é necessário nesta demonstração.",
  },
  {
    group: 1,
    target: '#store-form [name="has_own_delivery"]',
    title: "Você tem entregador próprio?",
    text: "Marque esta opção somente se sua loja faz a entrega. A taxa fixa aparece ao marcar; caso contrário, o comprador pode retirar ou combinar o frete.",
  },
  {
    group: 2,
    target: '#store-form [name="palette"]',
    title: "As cores da loja inteira",
    text: "Escolha sua paleta. A tela muda agora para mostrar o resultado: menu, cartões, avisos, rodapé e personalização. Depois de salvar, o cliente verá as mesmas cores.",
  },
  {
    group: 2,
    target: '#store-form [name="font"]',
    title: "Escolha como sua marca escreve",
    text: "A fonte escolhida acompanha a loja pública e o painel. Experimente as opções e confira a prévia.",
  },
  {
    group: 2,
    target: '#store-form [name="layout"]',
    title: "Organize sua vitrine",
    text: "Escolha Acolhedor, Compacto ou Vitrine. O formato acompanha a navegação do cliente, do cardápio ao acompanhamento do pedido.",
  },
  {
    group: 2,
    target: '#store-form [name="banner_preset"]',
    title: "Um banner pronto para começar",
    text: "Escolha uma ilustração pronta de padaria, frescos ou doces. Não é preciso preparar uma imagem para testar.",
  },
  {
    group: 2,
    target: '#store-form [name="banner"]',
    title: "Prefere usar sua própria imagem?",
    text: "Envie uma foto JPG ou PNG. O sistema ajusta o enquadramento. Seu upload tem prioridade sobre o banner pronto; remova-o quando quiser voltar à ilustração.",
  },
  {
    group: 2,
    target: "#appearance-preview",
    title: "Veja antes de salvar",
    text: "Esta miniatura mostra a loja, os produtos e o rodapé. As mudanças ainda são uma prévia até você salvar.",
  },
  {
    group: 3,
    target: "#save-store",
    title: "Salve e conheça o catálogo",
    text: "Confira os dados e salve para continuar. No catálogo vou apontar os botões e mostrar como preencher um produto e montar um combo.",
  },
];

export const catalogGuide: GuideScene[] = [
  {
    target: '.panel-nav a[href="/painel/catalogo"]',
    title: "Este é o catálogo da sua loja",
    text: "Use este menu para alternar entre Pedidos, Catálogo e Minha loja. Vamos conhecer uma função por vez.",
  },
  {
    target: '[data-open-dialog="product-dialog"]',
    title: "Seu primeiro produto começa aqui",
    text: "Este botão abre a criação. Continue para conhecer os campos ou clique nele para experimentar.",
  },
  {
    dialog: "product-dialog",
    target: '#new-product [name="title"]',
    title: "Dê um nome ao produto",
    text: "Use um nome curto que o comprador reconheça, como Bolo de chocolate. Você pode preencher de verdade enquanto segue o guia.",
  },
  {
    dialog: "product-dialog",
    target: '#new-product [name="category"]',
    title: "A categoria organiza o cardápio",
    text: "Escolha Doces, Bebidas, Pratos principais, Petiscos ou Lanches, ou crie outra categoria. Ela vira um filtro para o cliente.",
  },
  {
    dialog: "product-dialog",
    target: '#new-product [name="description"]',
    title: "Explique o que vem no produto",
    text: "Descreva os ingredientes, a porção ou outra informação que ajude o cliente a escolher.",
  },
  {
    dialog: "product-dialog",
    target: '#new-product [name="price"]',
    title: "Informe o preço em reais",
    text: "Preencha o valor de uma unidade. O total do pedido é calculado pelo sistema com os preços cadastrados.",
  },
  {
    dialog: "product-dialog",
    target: '#new-product [name="image"]',
    title: "Comece com uma ilustração",
    text: "Escolha uma imagem genérica para testar. Ela aparece quando o produto não tem foto própria.",
  },
  {
    dialog: "product-dialog",
    target: '#new-product [name="photo"]',
    title: "Ou envie a foto do seu produto",
    text: "JPG ou PNG de até 2 MB. A foto é ajustada automaticamente e substitui a ilustração.",
  },
  {
    dialog: "product-dialog",
    target: '#new-product [name="unavailable"]',
    title: "Desmarcado significa disponível",
    text: "Marque somente quando não puder vender este item. Isso também bloqueia os combos que dependem dele.",
  },
  {
    dialog: "product-dialog",
    target: '#new-product button[type="submit"]',
    title: "Salve quando os dados estiverem prontos",
    text: "Clique em Criar produto fictício para cadastrar. Se quiser apenas conhecer o sistema, continue o guia sem salvar. Seus campos ficam preservados ao fechar o pop-up.",
  },
  {
    target: "#products-title",
    title: "Cartões compactos para organizar",
    text: "O produto aparece com seu nome e o botão +. Use + para editar todos os detalhes e − para minimizar. As cores seguem a paleta da loja.",
  },
  {
    target: '[data-open-dialog="combo-dialog"]',
    title: "Dois produtos, um combo",
    text: "Depois de cadastrar pelo menos dois produtos individuais, use Novo combo. Os combos ficam em uma seção separada.",
  },
  {
    dialog: "combo-dialog",
    target: '#new-combo [name="component1"]',
    title: "Escolha o primeiro produto",
    text: "O combo usa produtos já cadastrados nesta loja. Produtos de outras empresas não aparecem aqui.",
  },
  {
    dialog: "combo-dialog",
    target: '#new-combo [name="component2"]',
    title: "Escolha o segundo produto",
    text: "Selecione um item diferente do primeiro. O anúncio reúne uma unidade de cada produto.",
  },
  {
    dialog: "combo-dialog",
    target: '#new-combo [name="price"]',
    title: "Defina o preço do conjunto",
    text: "Dê um nome e uma descrição ao combo e informe seu preço total. Ele pode ser diferente da soma dos itens individuais.",
  },
  {
    dialog: "combo-dialog",
    target: '#new-combo button[type="submit"]',
    title: "Crie o anúncio do combo",
    text: "Quando preencher os dados, salve aqui. Se um componente ficar indisponível, o combo também deixa de aceitar novos pedidos.",
  },
  {
    target: ".site-footer",
    title: "O rodapé guarda seus atalhos",
    text: "Volte ao guia por este rodapé quando precisar. Os atalhos e as cores acompanham toda a navegação da loja.",
  },
  {
    target: '.panel-nav a[href="/painel/pedidos"]',
    title: "Agora vamos atender",
    text: "Em Pedidos, cada compra aparece em um cartão central. Recuse à esquerda ou aceite à direita. O pedido em foco mantém a prioridade enquanto os próximos aguardam. Conclua para abrir seu balcão.",
  },
];
