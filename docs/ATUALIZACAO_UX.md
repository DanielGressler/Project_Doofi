# Interface do protótipo

## Cliente

1. Abra `/`, escolha **Sou cliente**, veja as lojas cadastradas em `/lojas` e entre na loja. Escolha a categoria. Produtos individuais e combos têm seções separadas, ambas respeitando o filtro.
2. Adicione os itens. O resumo fixo mostra quantidade e subtotal, sem ocupar uma coluna do cardápio.
3. Clique em **Continuar pedido** para abrir a página exclusiva do carrinho. Confira os itens e ajuste quantidades.
4. Clique em **Avançar para dados e entrega**. Preencha nome marcado como Teste/Exemplo/Demo/Fictício, telefone com DDD 00 e e-mail reservado (ex.: `cliente@exemplo.invalid`). O backend também bloqueia dados que não seguem esses formatos. Para entrega, informe também endereço, bairro e CEP.
5. Escolha a modalidade e o pagamento simulado, confirme os dados fictícios e envie. Os itens ficam recolhidos em **Ver itens do carrinho**, caso queira consultar novamente.
6. Guarde o link de acompanhamento. O cliente continua sem conta, senha ou verificação adicional. Pedidos com frete a combinar exigem o aceite da proposta.

Cada loja conserva seu próprio carrinho. Os dados de envio continuam vinculados ao pedido e à empresa por chave estrangeira; não viram um perfil compartilhado de cliente.

## Lojista

1. Na entrada `/`, escolha **Sou lojista**. Use as contas de demonstração existentes ou **Criar minha loja**, com e-mail reservado, telefone DDD 00 e senha inventada. O guia animado começa no cadastro.
2. Uma nova loja abre o roteiro com personagem e diálogos: **Identidade → Entrega → Visual → Revisão → Rodapé → Produtos → Combos → Atendimento**. Os campos já trazem exemplos editáveis. A personalização é salva antes de seguir aos capítulos do catálogo. O guia termina no botão **Concluir tutorial**, ou pode ser dispensado em **Pular tutorial**, e a loja passa a aparecer na lista pública de teste. Pular na personalização mantém os campos e arquivos no formulário; Salvar configurações aplica as edições. No cadastro, a caixa Pular tutorial abre diretamente o catálogo, com a loja inicialmente fechada. **Guia da loja**, no rodapé, permite retomar. Não exige criar produtos para concluir. Sair antes de salvar descarta edições do formulário; capítulos do catálogo ficam na URL durante essa página. Ao entrar novamente em uma loja ainda não configurada, o roteiro reaparece.
3. A nova loja começa fechada e com catálogo vazio. Na revisão da personalização, escolha se deseja abri-la. Cadastre os produtos em seguida. O menu **Ver loja pública** abre o endereço próprio.
4. No catálogo, **Novo produto** e **Novo combo** abrem pop-ups. **Fechar** ou Escape fecha o pop-up sem criar um anúncio. O rascunho permanece enquanto essa página estiver aberta.
5. Os anúncios salvos aparecem em cartões recolhidos. O cartão fechado mostra somente nome e botão **+**. Clique em **+** para expandir, editar e salvar; use **−** para minimizar; após salvar, a lista volta ao estado compacto. Combos ficam em seção separada e reúnem dois produtos individuais da mesma loja.
6. Em **Minha loja**, use os campos habituais ou **Personalizar com o assistente**. Cores, fontes e layout acompanham as páginas da loja, do carrinho, dos dados e do acompanhamento. Há três banners ilustrados prontos (padaria, fresco e doces), com prévia. O banner próprio tem prioridade; remova-o para voltar ao preset. Banner e fotos próprias continuam sendo normalizados no backend. O visual inclui o rodapé do cliente, com atalhos para loja, carrinho e envio.

## Pedidos

- O primeiro pedido aguardando decisão abre em destaque, com fundo escurecido, itens, local e custos. Novas chegadas ficam atrás dele. O atendimento em foco não é trocado por uma chegada.
- O pop-up destaca produtos no topo e total em negrito sobre fundo colorido. **Recusar pedido** fica à esquerda e **Aceitar pedido** à direita; ambos usam a versão atual do pedido. Recusar exige um motivo. Duas decisões simultâneas não sobrescrevem uma à outra.
- Na entrega a combinar, o pop-up pede uma proposta de frete. O comprador aprova essa proposta e o pedido retorna à fila para aceite final.
- **Pausar fila** ou Escape permite consultar a lista sem aceitar ou recusar automaticamente. Use **Atender fila** para retomar. Abrir a tela de pedidos novamente reativa o atendimento.
- Os cartões da lista e do atendimento têm bordas pretas. Os detalhes completos e as etapas de preparo continuam disponíveis.
- **Pausar atualização automática** interrompe as consultas periódicas; Atualizar continua disponível. Há o mesmo controle no acompanhamento do cliente. O pop-up aguarda quando um campo externo está em edição.
- **Ativar som de novos pedidos** libera um aviso curto após um clique. Pode ser desativado. O bloqueio de áudio pelo navegador mantém os avisos visuais funcionando. Não há push com a página fechada.
- A consulta automática ocorre a cada 20 segundos, com a aba visível e sem requisições sobrepostas. Em falhas, o intervalo aumenta. Não é uma notificação instantânea. A fila carrega até 50 pedidos por lote e busca os detalhes somente daquele em foco.

## Atualização local e Cloudflare

A migração `0007_onboarding_fila.sql` adiciona o estado do assistente e um índice de pedidos pendentes. Preserva lojas e credenciais anteriores. Aplique antes de publicar o código novo se ainda não aplicou. Esta revisão de entrada, guia, dados sintéticos e cartões usa o mesmo esquema, sem migração nova nem necessidade de repetir o seed.

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

Foram aprovados **179 testes de código/integração e 32 cenários de navegador** (incluindo regressão dirigida após ajustes de reflow, inicialização e paginação). `astro check` terminou sem erros, avisos ou sugestões. Formatação, builds local/homologação e pacote Cloudflare `--dry-run` também passaram.

A verificação atual inclui os formatos sintéticos no frontend/backend, bloqueio de dados comuns, SQL injection em e-mail permitido, lista pública sem responsáveis, conclusão do guia com escopo/versão e regressão de isolamento, cookies e pedidos. O navegador cobre entrada com duas opções, cadastro e guia em 320 px, cartões +/−, uploads, presets, posições de aceitar/recusar, som opcional, empilhamento de chegadas e conflitos entre decisões. Animações respeitam a preferência de movimento reduzido.

Os scripts são mantidos em arquivos externos para funcionar com a política de segurança que bloqueia JavaScript inline. O botão Pausar animações interrompe o movimento do personagem, além da preferência do sistema por movimento reduzido. O guia não usa o motor Ren’Py: a apresentação de personagem, cenas e diálogos é implementada na interface web existente.

A exportação/restauração local preservou os dados e não encontrou pedidos sem dados de envio, registros de envio órfãos, totais inválidos ou pedidos sem auditoria. Nenhuma migração ou publicação remota foi executada nesta revisão.

Novas telas: [entrada de experiências](evidencias/entrada-experiencias.png) e [guia de personalização](evidencias/guia-personalizacao-mobile.png).

Prévia no celular: [carrinho](evidencias/carrinho-mobile.png), [fila de pedidos](evidencias/fila-pedidos-mobile.png) e [dados para envio](evidencias/checkout-mobile.png).

A [revisão IUX](REVISAO_IUX.md) documenta critérios e alternativas. O [reset completo](RESET_PROTOTIPO.md) restaura as duas lojas e os seis produtos, com backup e invalidação do estado antigo do navegador. Não é executado por deploy ou migração.
