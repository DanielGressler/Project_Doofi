# Doofi · Protótipo P1.1

Loja digital multiempresa com catálogo, carrinho, checkout convidado, atendimento pelo lojista e acompanhamento por link. Duas lojas fictícias demonstram retirada, entrega própria com taxa fixa e cotação com aceite explícito.

**Somente dados sintéticos. Sem venda, entrega ou Pix reais.** O modo local continua limitado ao loopback. A homologação externa exige banco D1 real, HTTPS, host autorizado e autenticação Cloudflare Access validada por assinatura JWT. Veja o [guia de hospedagem protegida](docs/HOSPEDAGEM_CLOUDFLARE.md). A preparação foi validada localmente; a configuração da sua conta e a publicação remota são etapas separadas.

Veja o [guia de atualização, Windows e novas funções](docs/ATUALIZACAO_CATALOGO.md). Inclui categorias, combos, indisponibilidade, fotos, banner, fontes, paletas e entregador próprio.

A [auditoria de concorrência e desempenho](docs/AUDITORIA_CONCORRENCIA.md) registra as falhas reproduzidas, as correções e os limites das medições. A atualização requer aplicar a migração `0004_concorrencia_indices.sql` com `npm run db:migrate` no ambiente local ou `npm run db:migrate:staging` na homologação.

A [auditoria de isolamento](docs/AUDITORIA_ISOLAMENTO.md) cobre empresas, clientes, permissões, imagens e dados públicos. A migração `0005_isolamento.sql` encerra as sessões administrativas anteriores e revoga sessões quando o acesso muda. Os empresários precisam entrar novamente; pedidos e catálogos são preservados.

O checkout solicita nome, telefone e e-mail fictícios, além do endereço para entrega. Os [dados de envio do cliente](docs/DADOS_ENVIO_CLIENTE.md) são vinculados ao pedido por chave estrangeira, sem criar conta ou exigir senha/código do cliente. As migrações até `0007_onboarding_fila.sql` devem ser aplicadas antes do deploy; o login das lojas permanece igual.

A interface agora separa **cardápio → carrinho → dados e entrega → acompanhamento**. O catálogo usa cartões recolhidos e pop-ups para novos produtos/combos; a fila de pedidos destaca uma decisão de cada vez. Novas lojas fictícias têm cadastro simples e um guia animado com diálogos para personalização, rodapé, produtos e combos. Os cartões mostram apenas nome e botão **+** quando fechados; o pop-up de pedidos destaca produtos, total e decisões nas extremidades inferiores. Consulte o [guia da interface e atualização](docs/ATUALIZACAO_UX.md). O tutorial pode ser pulado e retomado; animações e atualizações têm pausa. A [revisão de IUX](docs/REVISAO_IUX.md) compara as escolhas com referências ISO/WCAG.

A [auditoria de segurança do cliente](docs/AUDITORIA_SEGURANCA_CLIENTE.md) cobre cookies restritos ao painel, rascunhos com expiração e recuperação sem mistura de dados, além de SQL injection, XSS, CSRF e isolamento empresarial. O cliente continua sem login. Execute `npm ci` ao atualizar esta versão: o lockfile inclui correções transitivas de segurança.

A [revisão das notificações, paleta e guia](docs/NOTIFICACOES_E_GUIA.md) unifica as cores da loja e do painel, destaca os cartões do catálogo e troca a caixa de pular tutorial por um X. O guia aponta para campos reais, um por vez. O aviso de compra usa apenas o cartão central, sem protocolo, e recebe atualizações automáticas preservando a prioridade do pedido em foco.

## Executar

Requisitos: Node 24 (ou >=22.22), npm e Linux/macOS/Windows compatível com workerd. As versões exatas estão em `package-lock.json`.

```sh
cd caminho/para/Project_Doofi-main
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Abra no navegador local a porta **4321**. A rota `/` mostra **Sou cliente** e **Sou lojista**. O cliente segue para `/lojas`, com as lojas ativas que concluíram a configuração. O lojista segue para `/painel/entrar`. O endereço antigo `/demo` redireciona para essa entrada.

| Loja          | Catálogo              | E-mail de teste         |
| ------------- | --------------------- | ----------------------- |
| Casa do Forno | `/loja/casa-do-forno` | `forno@demo.doofi.test` |
| Verde à Mesa  | `/loja/verde-mesa`    | `verde@demo.doofi.test` |

Senha pública das duas contas: **`demo-doofi-P1!`**. É uma fixture de desenvolvimento, sem acesso a serviços externos. O checkout já sugere nome, contato e endereço inventados; marque a confirmação de dados fictícios para enviar. Nome deve conter Teste, Exemplo, Demo ou Fictício; telefone usa DDD 00; e-mail usa domínio reservado, como `cliente@exemplo.invalid`. E-mails de provedores reais são bloqueados no formulário e no backend, sem enviar mensagens.

O seed usa `INSERT OR IGNORE`: pode ser repetido sem apagar pedidos ou sobrescrever configurações da loja. Para o reset completo explicitamente solicitado, use `npm run db:reset` (local) ou `npm run db:reset:staging` (D1 remoto), com backup automático; veja [as instruções de reset](docs/RESET_PROTOTIPO.md). O D1 local persiste em `.wrangler/state`; sessões, pedidos e dependências sobrevivem à parada do servidor, mas o processo precisa ser iniciado novamente.

## Demonstrar

1. Na loja A, adicione pão e café; escolha retirada e envie o pedido.
2. Guarde a página de acompanhamento. Em outra aba, entre no painel A.
3. Aceite, prepare, marque pronto para retirar e conclua. Atualize o acompanhamento para ver as mudanças.
4. Repita com taxa fixa; o servidor calcula produtos + frete.
5. Repita com frete a combinar. No painel, proponha taxa e prazo; no link do comprador, aceite; no painel, confirme o pedido.
6. Após o aceite do lojista, use “Simular já paguei”. No painel, use a conferência simulada. Declaração e conferência são estados diferentes; nenhum é conciliação bancária.
7. Saia do painel A e entre no B. Cada conta vê apenas seus produtos, pedidos, configurações e auditoria.

O catálogo e a disponibilidade são editáveis em `/painel/catalogo`; abertura manual, horários informativos, contato e regras de entrega em `/painel/loja`. Os pedidos preservam os preços existentes no momento do checkout.

## Validar

```sh
npm run check
npm run lint
npm test
npm run build
npm run test:e2e
npm run db:verify-restore
```

Os testes de backend executam em **workerd + D1 local**, com banco descartável separado. Os testes de navegador iniciam o Worker compilado na porta 4321, usam o banco local de desenvolvimento e **acrescentam pedidos fictícios**. A suíte restaura o preço do café e a abertura da loja após o cenário de edição. Não rode testes de UI enquanto estiver editando esses mesmos dados manualmente.

Para testes E2E, o Playwright usa `/usr/bin/chromium` quando disponível, `CHROMIUM_PATH` quando informado, ou o Chromium do Playwright. Caso necessário:

```sh
npx playwright install chromium
```

O ambiente atual já tem Chromium instalado. O workflow de CI instala o navegador e bibliotecas de sistema. Não é preciso conta Cloudflare, chave Pix nem API externa para desenvolver/testar localmente.

Para inspecionar o build compilado:

```sh
npm run build
npm run preview -- --port 4321
```

Pare o servidor anterior antes de usar a mesma porta. Execute `check`/`build` com o servidor de desenvolvimento parado: o adapter pode regenerar o cache do Vite. O wrapper `scripts/run.mjs` mantém a configuração de ferramentas em `.local/config` e desliga telemetria opcional.

Com o preview local iniciado, execute em outro terminal `npm run test:load`. O comando faz 100 leituras do catálogo em cada nível de concorrência (1, 10, 30 e 50), valida as respostas e grava tempos p50/p95 em `.local/load-tests/latest.json`. Aceita uma porta alternativa, por exemplo `npm run test:load -- http://localhost:4323`. O teste aceita somente endereços HTTP locais e não cria pedidos. As medidas não estimam a capacidade do Cloudflare remoto.

## Documentação

- [Arquitetura e decisões](docs/ARQUITETURA_P1.md)
- [Validação, gates e pendências](docs/VALIDACAO_P1.md)
- [Operação e restauração](docs/OPERACAO.md)
- [Contratos de API](docs/API.md)
- [Auditoria de concorrência e desempenho](docs/AUDITORIA_CONCORRENCIA.md)
- [Auditoria de isolamento](docs/AUDITORIA_ISOLAMENTO.md)
- [Dados de envio do cliente](docs/DADOS_ENVIO_CLIENTE.md)
- [Dossiê original v0.9.5](docs/referencia/docs/01_PROTOTIPO_FUNCIONAL.md)

As capturas em `docs/evidencias` foram geradas pelos testes com dados fictícios. Os documentos v0.9.5 são referências de requisitos; o SQL e os testes da versão histórica v0.9.4 não foram usados como implementação ou evidência desta P1. Os anexos de diplomas não foram importados.

Homologação com controle de acesso, métricas e limites remotos, cinco avaliações com pessoas, autenticação de produção, jurídico e backup externo continuam pendentes. Consulte os gates antes de avançar para P2.
