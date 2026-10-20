# Doofi · Protótipo P1

Loja digital multiempresa com catálogo, carrinho, checkout convidado, atendimento pelo lojista e acompanhamento por link. Duas lojas fictícias demonstram retirada, entrega própria com taxa fixa e cotação com aceite explícito.

**Somente dados sintéticos. Sem venda, entrega ou Pix reais.** A aplicação bloqueia acesso por host público e qualquer `APP_MODE` diferente de `local-demo`. Não foi feito deploy em Cloudflare nem publicação em produção.

## Executar

Requisitos: Node 24 (ou >=22.22), npm e Linux/macOS/Windows compatível com workerd. As versões exatas estão em `package-lock.json`.

```sh
cd /workspace/Project_Doofi
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Abra no navegador local a porta **4321**. A rota `/` abre a Casa do Forno; `/demo` contém o roteiro completo e os acessos das duas lojas. O painel está em `/painel/entrar`.

| Loja          | Catálogo              | E-mail de teste         |
| ------------- | --------------------- | ----------------------- |
| Casa do Forno | `/loja/casa-do-forno` | `forno@demo.doofi.test` |
| Verde à Mesa  | `/loja/verde-mesa`    | `verde@demo.doofi.test` |

Senha pública das duas contas: **`demo-doofi-P1!`**. É uma fixture de desenvolvimento, sem acesso a serviços externos. O checkout já sugere nome, contato e endereço inventados; marque a confirmação de dados fictícios para enviar.

O seed usa `INSERT OR IGNORE`: pode ser repetido sem apagar pedidos ou sobrescrever configurações da loja. O D1 local persiste em `.wrangler/state`; sessões, pedidos e dependências sobrevivem à parada do servidor, mas o processo precisa ser iniciado novamente.

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

## Documentação

- [Arquitetura e decisões](docs/ARQUITETURA_P1.md)
- [Validação, gates e pendências](docs/VALIDACAO_P1.md)
- [Operação e restauração](docs/OPERACAO.md)
- [Contratos de API](docs/API.md)
- [Dossiê original v0.9.5](docs/referencia/docs/01_PROTOTIPO_FUNCIONAL.md)

As capturas em `docs/evidencias` foram geradas pelos testes com dados fictícios. Os documentos v0.9.5 são referências de requisitos; o SQL e os testes da versão histórica v0.9.4 não foram usados como implementação ou evidência desta P1. Os anexos de diplomas não foram importados.

Homologação com controle de acesso, métricas e limites remotos, cinco avaliações com pessoas, autenticação de produção, jurídico e backup externo continuam pendentes. Consulte os gates antes de avançar para P2.
