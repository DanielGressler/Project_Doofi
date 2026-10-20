# Catálogo e personalização · P1.1 · 20/10/2026

Esta versão continua local e usa pedidos/pagamentos simulados. Acrescenta funcionalidades sem apagar o banco existente. Não foi publicada em produção.

## Atualizar no Windows

1. Pare o servidor com Ctrl+C.
2. Com o servidor parado, faça uma cópia da pasta do projeto, incluindo `.wrangler/state`. Ela contém o banco local. A pasta pode estar oculta.
3. Copie o conteúdo da nova versão sobre a pasta anterior. Preserve `.wrangler/state` e configurações locais. O ZIP não contém banco, sessões, dependências ou credenciais.
4. No Prompt de Comando, execute um comando por vez, avançando somente se o anterior terminar sem erro:

```bat
cd /d "D:\myprojects\Project_Doofi-main"
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Se o npm informar que os scripts de instalação de `workerd` e `esbuild` não foram autorizados, execute `npm install-scripts approve workerd esbuild` e `npm rebuild workerd esbuild` antes da migração. Esse comando de aprovação depende da versão do npm; use-o somente quando o aviso do próprio npm indicar essa política.

Abra http://localhost:4321/demo no mesmo computador e mantenha o terminal aberto. Node >=22.22, preferencialmente 24. O wrapper foi corrigido para iniciar o JavaScript declarado por cada pacote e funcionar no Windows; não executa os arquivos shell de `node_modules/.bin`.

A migração 0002 preserva produtos, preços e pedidos. Lojas existentes começam com **Possui entregador próprio desmarcado**; ative a opção em Minha loja se aplicável. As duas lojas de demonstração criadas em um banco novo já têm essa opção marcada. O seed não sobrescreve lojas existentes.

## Categorias

No Catálogo, o campo oferece Doces, Bebidas, Pratos principais, Petiscos, Lanches e Combos como exemplos. Também aceita categorias próprias. As sugestões conhecidas são normalizadas no backend, inclusive espaços e variação de maiúsculas. As categorias usadas nos anúncios viram filtros na vitrine. O filtro Todos os produtos restaura a listagem completa.

## Combos

Use + Novo combo. Informe nome, categoria, descrição, dois produtos diferentes da mesma loja e o preço total. Cada unidade do combo representa uma unidade de cada componente. Os anúncios individuais continuam disponíveis. Não são permitidos combos aninhados ou itens de outra loja.

O preço do combo é definido pelo lojista e não acompanha automaticamente os preços individuais. Se um componente ficar indisponível, o combo fica indisponível automaticamente, inclusive na validação do checkout. Ao reativar o componente, o combo volta a aceitar pedidos, desde que sua própria caixa de indisponibilidade não esteja marcada.

O pedido registra o preço do combo e os nomes dos componentes vigentes no envio. Edições posteriores não alteram esse registro. O protótipo não possui controle quantitativo de estoque.

## Indisponibilidade

A caixa Produto indisponível (ou Combo indisponível) fica desmarcada para anúncios disponíveis. Marque e salve somente para interromper novos pedidos do anúncio. Pedidos anteriores permanecem registrados.

## Imagens próprias

Produtos e combos mantêm ilustrações genéricas. Para usar foto própria, escolha Foto própria e salve. A foto enviada tem prioridade sobre a ilustração; o servidor valida a propriedade da imagem antes de associá-la ao anúncio. Remover foto e voltar à ilustração restaura a imagem genérica. Se escolher uma nova foto e marcar remoção ao mesmo tempo, a nova foto tem prioridade.

Formatos aceitos: JPG e PNG (PNG de 8 bits não entrelaçado). Limites: 2 MB e 4 megapixels por arquivo. Imagens maiores precisam ser reduzidas antes do envio. SVG, GIF e WebP não são aceitos nesta versão.

O processamento ocorre no backend: decodificação, correção da orientação EXIF em JPEG, recorte central, redimensionamento, fundo branco para transparência e conversão para JPEG sem os metadados originais. Produtos: 960 × 720 px. Banner: 1600 × 600 px. O recorte pode remover as bordas; mantenha o conteúdo principal no centro. Arquivos pequenos são ampliados e podem perder nitidez.

As imagens normalizadas são persistidas no D1 local. O limite é de 150 uploads por loja, incluindo imagens substituídas e envios abandonados. Não há expurgo automático de imagens nesta P1. Para uma operação remota, planejar armazenamento de objetos e limpeza antes de liberar uploads públicos.

## Minha loja

Escolha uma das quatro paletas (Terracota, Verde, Azul, Ameixa) e um dos três estilos de fonte (Acolhedora, Moderna, Clássica). A prévia mostra a combinação sem exigir códigos de cores. Escolha opcionalmente um banner e clique em Salvar configurações. A vitrine e o checkout usam a aparência salva. Recarregue Minha loja após salvar um banner para visualizar o arquivo persistido e a opção de remoção.

## Entrega

Possui entregador próprio controla o campo de taxa fixa em Minha loja e a opção de taxa fixa no checkout. Ao desmarcar e salvar, o backend também rejeita novos pedidos enviados manualmente nessa modalidade. Retirada e frete a combinar continuam disponíveis. A taxa anterior é preservada para eventual reativação e os pedidos existentes mantêm os valores registrados.

## Roteiro de conferência

1. Crie uma categoria Bebidas e confira o filtro da vitrine.
2. Crie um combo de dois produtos, compre uma unidade e confira o preço e a composição.
3. Indisponibilize um dos produtos; confira que o combo também fica bloqueado. Reative o produto.
4. Envie uma foto própria e confira que a ilustração deixa de aparecer. Remova a foto e confirme a restauração.
5. Em Minha loja, altere fonte, paleta e banner. Confira vitrine e checkout.
6. Desmarque o entregador próprio, salve e confira que a taxa fixa desaparece. Reative e confira novamente.
7. Entre na outra loja e confira que catálogo, imagens e configurações continuam separados.
