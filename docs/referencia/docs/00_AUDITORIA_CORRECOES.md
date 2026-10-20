# Reanálise crítica da documentação v0.9.4 → v0.9.5

| ID | Achado verificável no pacote 0.9.4 | Risco | Correção vinculante na v0.9.5 | Situação |
|---|---|---|---|---|
| AC-01 | `entrega/SPRINT_ZERO.md` colocava painel de lojista em P1, mas P0 exigia aceite e confirmação manual | fluxo incompleto | Painel mínimo passa a ser MUST do primeiro protótipo | Corrigido na especificação |
| AC-02 | Publicação de loja/identidade também figurava como P1 apesar de P0 depender dela | loja não consegue vender | Página pública e dados mínimos do vendedor passam ao núcleo | Corrigido |
| AC-03 | Risco de confundir 77 testes locais com prontidão de produção | lançamento inseguro | separar P1 fictício de P2 piloto real com gates | Corrigido |
| AC-04 | Escopo inicial inclui antifraude, histórico complexo, telemetria e recursos avançados antes do pedido completo | atraso, custo e regressões | núcleo enxuto + casos críticos sem automatizar devolução; analytics granular postergado | Corrigido |
| AC-05 | Exemplos de preço de hospedagem/quotas sujeitos a mudanças | planejamento financeiro falso | fontes oficiais datadas + estimativa por cenários e limites de custo | Revisável |
| AC-06 | API de clima e roteirização podem consumir créditos sem gerar valor na compra básica | custo desnecessário | desligados no P1/P2; endereços textuais e regiões manuais | Corrigido |
| AC-07 | `db/001_schema_draft.sql` e `002_logs_telemetria.sql` são extensa modelagem de referência, sem migrações D1 aprovadas | schema inflado/conflitos | exigir modelo mínimo/migrações novas e comparar tabelas antes de migrar | Pendente da codificação |
| AC-08 | Confirmação manual de Pix pode ser mal interpretada como banco validado | fraude, estatísticas incorretas | separar `cliente_declarou`, `lojista_conferiu`, `banco_conciliado` | Corrigido na regra |
| AC-09 | Br Code estático com `txid` não oferece expiração ou callback bancário automático | Pix atrasado/cancelado | criar caso de pagamento tardio e não reativar pedido; não prometer reconciliação | Corrigido na regra |
| AC-10 | Multiempresa no D1 não conta com RLS nativa | IDOR/vazamento entre lojistas | autorização server-side sempre, `store_id` da sessão e testes A↔B | Gate pendente |
| AC-11 | `referencia_v094` tem termos e política de reembolso como minutas | risco legal | revisão jurídica, dados da empresa e procedimento de suporte antes de P2 | Pendente |
| AC-12 | Retenção de cliques sem rotina executada | privacidade/custos | nenhum clique granular no P1; auditoria de domínio essencial e agregação posterior | Corrigido no escopo |
| AC-13 | Modelo de domínio permite modalidade de entrega 'a combinar' | criar pedido com total indefinido | protocolo cotação → aceite explícito do comprador → aceite lojista → liberação de QR | Corrigido na jornada |
| AC-14 | Materiais históricos referenciam diretórios e comandos da v0.9 antiga | risco de execução errada | v0.9.5 tem índice único; legado segregado sob referência | Corrigido |

**Escopo real da auditoria:** análise do ZIP v0.9.4 e fontes oficiais em 20/10/2026. Não é correção literal do projeto de código v0.8 nem aprovação de segurança de uma aplicação inexistente.
