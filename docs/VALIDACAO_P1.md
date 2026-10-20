# Evidências e limites · P1 local · 20/10/2026

Implementação funcional local com duas lojas, seis produtos sintéticos, checkout convidado, atendimento, cotação com dois aceites, rastreio e estados financeiros exclusivamente simulados. Não há publicação remota nem aprovação integral dos gates de homologação.

## Verificações executadas

| Verificação                               | Resultado local                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| `npm ci` + migrations + seed repetidos    | Instalação congelada; dados anteriores preservados                               |
| `npm run check`                           | Sem erros, avisos ou hints de TypeScript/Astro                                   |
| `npm run lint`                            | Prettier em código, configuração e documentação própria                          |
| `npm test`                                | 28 testes em quatro arquivos; runtime workerd e D1 isolado                       |
| `npm run build`                           | Worker SSR e assets compilados pelo adapter oficial                              |
| `npm run test:e2e`                        | Oito cenários Chromium sobre o Worker compilado                                  |
| axe WCAG 2 A/AA e 2.1 AA                  | Sem violações detectadas nas telas examinadas; não equivale a certificação       |
| Layout 320 px e desktop                   | Sem rolagem horizontal nas telas examinadas; compra funcional no celular emulado |
| `npm run db:verify-restore`               | Export/import em D1 local separado; contagens e invariantes reconciliadas        |
| `npm audit --omit=dev --audit-level=high` | Nenhuma vulnerabilidade reportada no conjunto de produção nesta execução         |

Os testes antigos do dossiê não fazem parte dessas contagens. Não houve teste em D1 remoto, operação bancária nem avaliação com pessoas reais. O arquivo de CI existe, mas não foi executado no GitHub nesta sessão.

## Casos exercitados

Backend: totais manipulados ignorados, carrinho de outra loja rejeitado, quantidades inválidas, produto indisponível, loja fechada, região não atendida, snapshot após mudança de preço, chave idempotente incompatível e dez reenvios concorrentes. O teste exige um pedido, os itens esperados e um evento de criação.

Autorização: A→B e B→A no backend; leitura, alteração, produto e auditoria; cookie ausente, associação inativa, CSRF ausente, origem externa, logout, token revogado/expirado e tentativa de confirmar pagamento pelo comprador. Negativas de ownership são auditadas. Login tem teste de limite de tentativas.

Integridade: concorrência de transições permite uma única alteração; falhas forçadas na auditoria revertem criação, transição e conferência financeira. Eventos críticos são append-only. Propostas substituídas/expiradas são rejeitadas; recusa da proposta cancela sem fechar total.

Navegador: retirada completa, entrega fixa completa, cotação + aceite comprador + aceite lojista, declaração versus conferência de Pix simulada, fechamento/reabertura da loja, edição/restauração de preço e acesso negado no painel de outra loja. Uma resposta é perdida **depois do commit**; após refresh, reenviar recupera o mesmo token/pedido.

UX: telas da loja em 1440 e 320 px, checkout e rastreio da loja B, login e painel em 320 px. Navegação por teclado verifica link para pular conteúdo e adição de produto por Enter. São testes automatizados em Chromium; leitor de tela, dispositivo físico, outros motores e observação com cinco pessoas continuam pendentes.

## Situação dos gates P1

| Gate             | Situação                     | Evidência ou pendência                                                                     |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| G01 produto      | Validado localmente          | J1, J2 e J3 no navegador, lojas A/B                                                        |
| G02 autonomia    | Validado localmente          | Catálogo, disponibilidade, abertura, horários informativos e entrega editáveis             |
| G03 autorização  | Validado localmente          | Testes HTTP/domain e painel contra acesso entre lojas                                      |
| G04 valores      | Validado localmente          | Recalculo server-side, preço snapshot e frete cotado                                       |
| G05 idempotência | Validado localmente          | Dez chamadas concorrentes e resposta perdida + refresh                                     |
| G06 pagamento    | Validado para demonstração   | Apenas estados SIMULATED, sem recebedor/chave/QR reais                                     |
| G07 privacidade  | Validado no escopo sintético | Sem PII real ou trackers; DTO público reduzido                                             |
| G08 auditoria    | Validado localmente          | Rollback D1 e eventos atômicos em testes                                                   |
| G09 operação     | Pendente na homologação      | Restore local verificado; faltam deploy protegido, releases e medição remota               |
| G10 UX           | Parcial                      | Automação responsiva/contraste/teclado passou; faltam pessoas, leitor e dispositivo físico |

## Rastreabilidade do backlog

| Tickets       | Entrega                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------- |
| S0-01         | Spike local Astro/Workers/D1 e rollback; preview remoto protegido pendente                          |
| S0-02         | Projeto, lockfile, typecheck, formatação, testes, build e workflow CI; execução remota pendente     |
| S0-03         | Autenticação DEV segregada, membership, CSRF, expiração, rotação e logout; produção em P2           |
| S1-01 a S1-07 | Duas lojas, catálogo, carrinho por loja, checkout, persistência idempotente, auditoria e link opaco |
| S2-01 a S2-05 | Painel, entrega fixa/cotada, aceites, edição de catálogo/horários e pagamento simulado              |
| S3-01         | Segurança/concorrência local executada; repetir no staging D1 remoto                                |
| S3-02         | Testes automatizados de UX; avaliações com cinco pessoas não realizadas                             |
| S3-03         | Logs estruturados e limites locais; alertas e medição remota somente propostos                      |
| S3-04         | Contagens, ticket médio e item mais pedido derivados do banco, sem inferir receita recebida         |
| P2-01 a P2-06 | Não implementados/aprovados: Pix real, exceções comerciais, jurídico, backup externo e piloto       |

Reclamações, devoluções e contas recebedoras reais precisam de fluxos próprios no piloto. Esta entrega não implementa reembolso nem suporte comercial. Nenhuma credencial DEV pode ser habilitada em host público como atalho para homologação.

## Artefatos

As capturas em `docs/evidencias` mostram loja desktop, loja 320 px, checkout 320 px e detalhe de pedido no painel. Os relatórios/traces do Playwright ficam em `playwright-report`/`test-results` (ignorados pelo Git). As verificações de restore ficam em `.local/restore-checks`, com resultados agregados, export e banco separado. Não publique backups, cookies ou links de acompanhamento de dados reais.
