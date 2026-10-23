# Interface do protótipo

## Cliente

1. Abra a loja e escolha a categoria. Produtos individuais e combos têm seções separadas, ambas respeitando o filtro.
2. Adicione os itens. O resumo fixo mostra quantidade e subtotal, sem ocupar uma coluna do cardápio.
3. Clique em **Continuar pedido** para abrir a página exclusiva do carrinho. Confira os itens e ajuste quantidades.
4. Clique em **Avançar para dados e entrega**. Preencha nome, telefone e e-mail fictícios. Para entrega, informe também endereço, bairro e CEP.
5. Escolha a modalidade e o pagamento simulado, confirme os dados fictícios e envie. Os itens ficam recolhidos em **Ver itens do carrinho**, caso queira consultar novamente.
6. Guarde o link de acompanhamento. O cliente continua sem conta, senha ou verificação adicional. Pedidos com frete a combinar exigem o aceite da proposta.

Cada loja conserva seu próprio carrinho. Os dados de envio continuam vinculados ao pedido e à empresa por chave estrangeira; não viram um perfil compartilhado de cliente.

## Lojista

1. Em **Área do lojista**, use as contas de demonstração existentes ou **Criar minha loja**, com e-mail e senha fictícios.
2. Uma nova loja abre o roteiro **Identidade → Entrega → Visual → Concluir**. Os campos já trazem exemplos editáveis. O assistente salva tudo ao concluir; sair antes de salvar descarta as edições do formulário. Ao entrar novamente em uma loja ainda não configurada, o roteiro reaparece.
3. A nova loja começa fechada e com catálogo vazio. Na última etapa, escolha se deseja abri-la. Cadastre os produtos em seguida. O menu **Ver loja pública** abre o endereço próprio.
4. No catálogo, **Novo produto** e **Novo combo** abrem pop-ups. **Fechar** ou Escape fecha o pop-up sem criar um anúncio. O rascunho permanece enquanto essa página estiver aberta.
5. Os anúncios salvos aparecem em cartões recolhidos. Clique no cartão para expandir, editar e salvar; após salvar, a lista volta ao estado compacto. Combos ficam em seção separada e reúnem dois produtos individuais da mesma loja.
6. Em **Minha loja**, use os campos habituais ou **Personalizar com o assistente**. Cores, fontes e layout acompanham as páginas da loja, do carrinho, dos dados e do acompanhamento. Banner e fotos próprias continuam sendo normalizados no backend.

## Pedidos

- O primeiro pedido aguardando decisão abre em destaque, com fundo escurecido, itens, local e custos. Novas chegadas ficam atrás dele. O atendimento em foco não é trocado por uma chegada.
- **Aceitar pedido** e **Recusar pedido** usam a versão atual do pedido. Recusar exige um motivo. Duas decisões simultâneas não sobrescrevem uma à outra.
- Na entrega a combinar, o pop-up pede uma proposta de frete. O comprador aprova essa proposta e o pedido retorna à fila para aceite final.
- **Pausar fila** ou Escape permite consultar a lista sem aceitar ou recusar automaticamente. Use **Atender fila** para retomar. Abrir a tela de pedidos novamente reativa o atendimento.
- Os cartões da lista e do atendimento têm bordas pretas. Os detalhes completos e as etapas de preparo continuam disponíveis.
- A consulta automática ocorre a cada 20 segundos, com a aba visível e sem requisições sobrepostas. Em falhas, o intervalo aumenta. Não é uma notificação instantânea. A fila carrega até 50 pedidos por lote e busca os detalhes somente daquele em foco.

## Atualização local e Cloudflare

A migração `0007_onboarding_fila.sql` adiciona o estado do assistente e um índice de pedidos pendentes. Preserva lojas e credenciais anteriores. Aplique antes de publicar o código novo. Não precisa repetir o seed.

No Prompt de Comando do Windows, na pasta atualizada:

```bat
cd /d "D:\myprojects\Project_Doofi-main"
npm ci
npm run db:migrate
npm run dev
```

Para o D1 remoto já utilizado pelo projeto:

```bat
set DOOFI_D1_DATABASE_ID=fab28cb0-aeef-4215-a9d2-08c791cf7fa0
npm run cloudflare:login
npm run db:migrate:staging
```

Depois execute o build/deploy pelo fluxo Cloudflare já configurado, mantendo host, equipe e audiência do Access. Não desative a proteção para testar. O `--dry-run` valida o pacote, sem publicar nem aplicar migrações remotas.

Rodapés contextuais atendem cliente e lojista. **Meu acesso**, no painel, identifica a conta e a loja autenticadas. Em telas pequenas e carrinhos longos há rolagem vertical para preservar legibilidade, acesso por teclado e todos os controles.

## Verificação desta entrega

Foram aprovados 116 testes de código/integração e 18 cenários de navegador, incluindo 320 px, teclado, contraste, isolamento A/B, carrinho separado, cadastro guiado, upload e recuperação de envio. A fila foi validada com chegada durante atendimento, retorno de cotação sem roubar o foco, pausa sem mudar o pedido e conflito entre duas decisões. `astro check` terminou sem erros, avisos ou sugestões. Formatação, builds local/homologação e pacote Cloudflare `--dry-run` também foram verificados.

A exportação/restauração local preservou os dados e não encontrou pedidos sem dados de envio, registros de envio órfãos, totais inválidos ou pedidos sem auditoria. Nenhuma migração ou publicação remota foi executada nesta revisão.

Prévia no celular: [carrinho](evidencias/carrinho-mobile.png), [fila de pedidos](evidencias/fila-pedidos-mobile.png) e [dados para envio](evidencias/checkout-mobile.png).
