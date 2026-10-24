# Auditoria do fluxo de cliente e sessão empresarial

Revisão de 24/10/2026. Testes no código e no ambiente local D1/Workers, usando somente dados fictícios. Não foram executados ataques na implantação remota.

## Falhas reproduzidas e correções

| Achado                                   | Evidência antes da correção                                                                                                                                                      | Correção                                                                                                                                                                                                |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cookie empresarial com alcance excessivo | O navegador recebia `doofi_session` com `Path=/`, enviando-o também às páginas e APIs do cliente. Não foi demonstrado roubo do valor do cookie.                                  | Novo cookie limitado a `/painel`, host-only, HttpOnly, SameSite=Strict e Secure em HTTPS. A API usada pelo painel passou para o mesmo namespace.                                                        |
| Escolha ambígua de sessão                | O parser escolhia o primeiro cookie com o mesmo nome. Cookies de caminhos diferentes podiam produzir resultados dependentes da ordem.                                            | Cookies duplicados são recusados. Cookie novo inválido não provoca fallback para outra sessão legada.                                                                                                   |
| Edição após envio incerto                | Depois de uma falha de rede, os campos continuavam editáveis, mas o reenvio utilizava os dados anteriores. A tela também podia mostrar um carrinho diferente do corpo reenviado. | Dados, itens e valores de referência originais ficam visíveis e bloqueados durante recuperação. Descartar o envio é uma ação explícita e não cancela pedidos no servidor.                               |
| Retenção de rascunhos                    | Dados de envio permaneciam no sessionStorage sem prazo próprio e aguardavam a página de acompanhamento para serem removidos.                                                     | Rascunho com prazo de uma hora, escopo de loja e validação da estrutura. Remoção dos contatos assim que o servidor confirma o pedido; somente a referência de acompanhamento permanece temporariamente. |
| Serialização por exclusão                | A resposta empresarial excluía alguns hashes de um objeto completo do banco. Novas colunas poderiam aparecer automaticamente na API.                                             | Projeções explícitas de loja, produto e pedido. Consultas de acompanhamento e ações do comprador carregam somente os campos de negócio necessários, sem os dados de envio.                              |

Os dois primeiros testes de navegador adicionados reproduziram o alcance `Path=/` e a edição silenciosa do checkout antes das correções. A versão corrigida passou nos mesmos cenários.

## Cookies e compatibilidade

- HTTPS: `__Secure-doofi_panel`, `Path=/painel`, `Secure`, `HttpOnly`, `SameSite=Strict`, sem atributo `Domain`. Validade de sessão de até oito horas, conferida no banco a cada acesso.
- Ambiente local HTTP: `doofi_panel`, também limitado a `/painel`, com HttpOnly e SameSite=Strict.
- Sessão legada válida é migrada para o novo cookie e o cookie antigo é removido. A migração não muda a empresa nem estende a validade da sessão. Cookies legados inválidos são descartados.
- Login continua em `/painel/entrar`. As páginas e os acessos demonstrativos não mudam.
- Chamadas do lojista usam `/painel/api/v1/login`, `/painel/api/v1/session`, `/painel/api/v1/catalogo`, `/painel/api/v1/pedidos`, etc. As rotas antigas de API continuam aceitando credenciais explicitamente enviadas por clientes HTTP, mas o navegador não envia o novo cookie fora de `/painel`.
- Cookies do Cloudflare Access permanecem independentes. Não foi usado `credentials: omit`, pois isso impediria a autenticação do convidado no próprio Cloudflare. O navegador foi testado com um cookie Access simulado para conferir sua preservação.
- O prefixo `__Secure-` é utilizado porque `__Host-` exigiria `Path=/`. O escopo de caminho reduz envio desnecessário; não cria uma barreira entre scripts da mesma origem. Autorização, CSRF, escaping e CSP continuam necessários.

## Ataques exercitados

| Cenário                                                                                  | Resultado observado                                                                                                                     |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| SQL injection em login: tautologias, UNION, comentários e comandos encadeados            | Não autenticou nem criou sessão.                                                                                                        |
| SQL injection em filtros de produtos, IDs de pedidos e cookies                           | Não ampliou consultas nem alterou tabelas; retornou vazio, 404 ou 401 conforme o recurso.                                               |
| SQL e HTML em nome, telefone, e-mail, endereço e observações fictícias                   | Valores tratados como texto; tabelas e vínculos preservados.                                                                            |
| XSS persistente nos dados enviados                                                       | HTML exibido como texto no painel; nenhum elemento injetado ou script executado. O acompanhamento não expôs esses dados.                |
| CSRF sem cabeçalho, com origem externa ou `Origin: null`                                 | Mutação bloqueada com 403.                                                                                                              |
| IDOR e troca de empresa via parâmetros, IDs e corpo                                      | Dados de outra empresa indisponíveis; sem alteração do proprietário do pedido.                                                          |
| Mass assignment e prototype pollution                                                    | Campos de conta, permissões, preços, identificadores e chaves de protótipo não mudaram autorização ou valores calculados pelo servidor. |
| Cookie duplicado, inválido, de outra sessão ou token de acompanhamento usado como sessão | Sessão inválida recusada; link de comprador não concedeu acesso empresarial.                                                            |
| Colunas internas novas no banco                                                          | Não apareceram nas projeções públicas ou empresariais da API.                                                                           |
| Rascunho expirado, malformado, de outra loja ou alterado                                 | Não restaurou dados pessoais nem mudou o escopo do envio.                                                                               |
| Resposta perdida ou navegação falha após confirmação                                     | Recuperação preservou o pedido original; confirmação eliminou o corpo com contatos antes de abrir o acompanhamento.                     |

SQL usa parâmetros vinculados. As partes dinâmicas dos filtros geram somente placeholders `?`; os valores recebidos não são concatenados ao SQL. Não foi identificada SQL injection explorável nos cenários exercitados. Isso não constitui garantia de ausência de vulnerabilidades fora do escopo testado.

## Dependências

A auditoria encontrou avisos transitivos em `undici` 7.29.1 e, incluindo dependências de desenvolvimento, em `zod` 4.6.5. Foram aplicados overrides específicos e atualizados os hashes do lockfile:

- `undici@^7.0.0 → 7.30.1`: GHSA-4qv8-2p9j-2685, GHSA-f72v-6w45-q472 e GHSA-xjj6-f33q-929c.
- `zod@4.6.5 → 4.6.7`: GHSA-mrhx-c7xc-m3w5, na ferramenta de testes Cloudflare.

Esses avisos dizem respeito a componentes transitivos e ferramentas; não foi demonstrada sua exploração pelo formulário do cliente. Os overrides preservam os demais ramos de versões, incluindo o undici 8 utilizado pelo Astro.

Após os overrides, `npm audit` completo (produção e desenvolvimento) não reportou vulnerabilidades conhecidas. Isso descreve a base de avisos consultada nesta revisão; não é uma certificação do código.

## Dados de cliente e limites

O cliente continua sem conta, senha, OTP ou verificação nova. Nome, telefone e e-mail são dados de envio vinculados ao pedido e à empresa por chave estrangeira. E-mails repetidos não unificam pessoas nem empresas. O acompanhamento mantém os controles por link já existentes e não revela nome, contato ou endereço do comprador.

O carrinho conserva somente IDs e quantidades por loja em localStorage. Dados de envio ficam temporariamente no sessionStorage da aba, com expiração verificada ao restaurar e com temporizador enquanto a página permanece aberta. A suspensão do navegador pode adiar a execução de temporizadores; ao retomar o checkout, um rascunho expirado é descartado antes de preencher os campos. Rascunhos do formato antigo, sem prazo, também são descartados.

Compartilhar uma mesma aba/perfil ou repassar um link de acompanhamento não permite identificar pessoas diferentes sem autenticação. O projeto continua uma demonstração protegida pelo Cloudflare Access, com contas de lojista fictícias. A política real do Access, cookies emitidos pela borda e limites remotos não foram inspecionados nesta revisão.

Esta revisão não adiciona migração de banco. A entrega de UX da mesma branch ainda exige as migrações até `0007` antes da publicação. Após atualizar os arquivos, execute `npm ci` para instalar as dependências do lockfile. Atualize páginas de painel que tenham ficado abertas durante a troca de versão.

## Validação da entrega

- 141 testes de código/integração aprovados, incluindo a reprodução de entradas de enum que antes retornavam 500 e agora retornam 422.
- 25 cenários de navegador aprovados, incluindo os sete novos casos de segurança e as jornadas anteriores de pedidos, personalização e isolamento.
- `astro check`: nenhum erro, aviso ou sugestão; formatação aprovada.
- `npm audit` completo: zero vulnerabilidades conhecidas na base consultada.
- Builds local e de homologação, pacote Cloudflare `--dry-run` e exportação/restauração local aprovados com as dependências corrigidas.
- Restauração: 154 pedidos e 154 registros de envio preservados; nenhum vínculo de cliente ausente, registro órfão, total inválido ou pedido sem auditoria.

Os cenários de navegador usam identidades de rede sintéticas independentes por teste local para não consumir o mesmo bucket de localhost em testes sem relação entre si. Os limites reais da aplicação continuam habilitados e possuem testes próprios. Não há exceção de rate limiting no código de produção.
