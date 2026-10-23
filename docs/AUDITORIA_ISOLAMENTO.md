# Auditoria de isolamento de empresas e clientes

Data: 23/10/2026. Base: `7b9296f`. Revisão de API, sessões, permissões, dados enviados às telas, vínculos no D1, imagens e armazenamento do navegador. Os testes usam bancos locais e dados fictícios. A conta Cloudflare e o banco remoto não foram acessados.

## Problemas encontrados e resolvidos

| Prioridade | Problema                                                                                                              | Correção                                                                                                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alta       | Transferir o vínculo de um empresário de A para B fazia um cookie antigo assumir B.                                   | A migração 0005 revoga sessões na mesma transação que transfere, remove, desativa ou altera o papel do vínculo. Inclui substituição por `INSERT OR REPLACE`.                                               |
| Alta       | Transferência entre a verificação da senha e a criação da sessão podia autenticar no escopo alterado.                 | O `INSERT` da sessão revalida usuário, credenciais, loja, papel e vínculo dentro do batch. Conflito retorna 409 `AUTH_CHANGED`, sem nova sessão ou evento de login.                                        |
| Média      | Reativar usuário/loja podia tornar um cookie anterior novamente utilizável; mudar senha/papel não invalidava sessões. | Triggers revogam somente as sessões afetadas. Sessões de outras empresas continuam válidas.                                                                                                                |
| Média      | O catálogo serializava linhas completas, incluindo campos internos, e exporia futuras colunas privadas.               | Projeções explícitas de loja e produto na API e nos dados embutidos no HTML. `store_id`, versões internas e novas colunas não entram automaticamente no contrato público.                                  |
| Média      | A API validava a empresa/tipo da imagem, mas o banco aceitava gravações diretas inconsistentes.                       | Triggers conferem fotos e banners em inserções/alterações. Empresa de produtos, pedidos e mídias não pode ser transferida; tipo de mídia é imutável. Atualizações de combos também validam tipos.          |
| Média      | O link do último pedido ficava no `localStorage`, compartilhado entre abas e persistente após fechar o navegador.     | Associação temporária em `sessionStorage`, removida ao carregar o acompanhamento. Dados do envio são descartados após sucesso. Registros antigos são removidos ao visitar checkout/acompanhamento da loja. |
| Baixa      | Redirecionamentos e bloqueios antecipados não recebiam os mesmos cabeçalhos de privacidade.                           | `no-store`, `no-referrer` e demais cabeçalhos também nas respostas antecipadas. A rota de imagens define `no-store` explicitamente.                                                                        |

Os três testes iniciais falharam antes das correções: cookie após transferência, referência direta a imagem de outra empresa e serialização de coluna privada adicionada ao banco.

## Fronteiras verificadas

| Operação                                             | Resultado esperado nos testes                                                                                                                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pedidos, auditoria, catálogo, resumo e configurações | Empresa vem da sessão. Parâmetros, cabeçalhos e payloads com IDs de outra loja não mudam o escopo. Verificado de A para B e de B para A.                                                  |
| Alteração de pedido, cotação e pagamento             | IDs de outra empresa retornam 404 e não alteram estado, versão ou pagamento.                                                                                                              |
| Funcionário                                          | Gerencia catálogo, mas não configura loja nem envia banner fingindo papel de proprietário.                                                                                                |
| Cliente convidado                                    | Token do pedido não autentica no painel. Sem cookie administrativo válido, painel retorna 401.                                                                                            |
| Acompanhamento                                       | Token/nonce de um pedido não autoriza ações em outro. ID/protocolo não substitui o token. Revogação é respeitada.                                                                         |
| Dados do comprador                                   | Nome, contato, endereço, CEP e observação ficam no painel autorizado; não entram no acompanhamento público, inclusive no HTML.                                                            |
| Imagens                                              | Rascunho fica disponível para a própria empresa. Outra empresa e cliente recebem 404. Imagens publicadas são conteúdo de vitrine. Loja inativa não publica suas imagens.                  |
| Navegador                                            | Carrinhos de A e B usam chaves distintas. Contextos de clientes diferentes não compartilham carrinhos/dados de envio.                                                                     |
| Persistência                                         | Chaves estrangeiras compostas mantêm a empresa de itens, pedidos, pagamentos, cotações e componentes. Gravações cruzadas são recusadas; `foreign_key_check` não encontra inconsistências. |
| CSRF e origem                                        | CSRF de outra sessão, origem externa e origem ausente não autorizam mutações administrativas.                                                                                             |

O controle de vínculo depende de `UNIQUE(user_id)`, já existente: cada usuário administrativo pertence a uma única loja. Múltiplas lojas por usuário exigirão persistir a loja escolhida na sessão e revisar esse contrato. Remover apenas a restrição única quebraria essa garantia.

## Integrações e dependências

A auditoria condicional saiu do catálogo para `core.ts`. Autenticação e pedidos usam a mesma operação atômica sem depender de regras de catálogo para registrar eventos. Scripts públicos usam `PublicProduct`, separado do modelo completo persistido.

Cloudflare Access controla convidados da demonstração; a sessão administrativa controla empresa e papel. O link de pedido concede acesso somente àquele pedido e não concede permissões administrativas. Nenhuma integração externa nova foi adicionada.

## Validação

Cenários em [isolation.test.ts](../tests/isolation.test.ts) e [isolation.spec.ts](../e2e/isolation.spec.ts): transferência durante login, substituição de vínculo, reativação, campos forjados, migração sobre banco anterior e clientes em contextos separados.

- 95 testes de código, incluindo 25 novos cenários de isolamento.
- 13 cenários de navegador, incluindo dois novos cenários de privacidade/isolamento.
- `astro check`, formatação, builds local e de homologação e deploy `--dry-run`.
- Migração local e exportação/restauração do banco local.

## Aplicação da atualização

Atualize os arquivos locais a partir do GitHub e aplique as migrações pendentes. No CMD do Windows, para a demonstração remota:

```bat
cd /d "D:\myprojects\Project_Doofi-main"
npm ci
set DOOFI_D1_DATABASE_ID=fab28cb0-aeef-4215-a9d2-08c791cf7fa0
npm run db:migrate:staging
```

A migração **0005 encerra as sessões administrativas existentes uma vez**, pois o escopo histórico dos cookies anteriores não pode ser comprovado. Os empresários precisarão entrar novamente. Pedidos, dados de atendimento, catálogos, imagens e links de acompanhamento são preservados. Publique também a versão atual pelo fluxo já configurado de build/deploy.

Revogação e integridade de imagens novas dependem da migração aplicada. No ambiente local, use `npm run db:migrate`. Não repita o seed para fazer essa atualização.

## Limites do protótipo

- Clientes são convidados por link, sem cadastro ou identidade própria. Quem recebe um link válido pode acompanhar e executar as ações de comprador previstas naquele pedido. A sessão de empresário não amplia o alcance desse token.
- As contas/senhas de demonstração são públicas e compartilhadas entre convidados. Os testes comprovam isolamento entre contas/lojas; não criam privacidade individual entre pessoas usando a mesma conta. Produção exige identidades exclusivas e autenticação adequada.
- `sessionStorage` reduz persistência e compartilhamento entre abas, mas não autentica pessoas em computador compartilhado. A URL também pode continuar no histórico do navegador.
- Revogação impede novas requisições e sessões fora do escopo; não retira dados já entregues nem cancela retroativamente uma requisição já autorizada.
- O banco tem isolamento lógico por empresa, com consultas e restrições de integridade. Não foram provisionados bancos separados por loja ou infraestrutura de produção nesta revisão.
