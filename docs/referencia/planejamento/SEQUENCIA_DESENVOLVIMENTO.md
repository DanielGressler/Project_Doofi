# Sequência recomendada em fatias verticais (sem código criado)

## Sprint 0 — prova de viabilidade (P1, interno)
- Confirmar Astro SSR/Workers/D1 num projeto descartável e o funcionamento de binding D1/transação auditável.
- Fixar a estratégia de sessão/autenticação e permissão multiempresa; registrar decisão e trade-offs.
- Criar repositório e CI; padrão de pastas com domínio, rotas, infra e migrações sem carregar sistema legado inteiro.
**Saída:** ambiente local e preview protegido; 2 lojas seed fictícias, comando de teste reproduzível.

## Sprint 1 — vitrine e pedido end-to-end
- Loja pública, catálogo simples, carrinho por loja, checkout convidado, total recalculado servidor e snapshot imutável.
- Pedidos com idempotência e evento crítico no banco; token de acompanhamento do comprador.
**Saída:** pedido com retirada funciona do navegador até D1 e aparece em painel mínimo.

## Sprint 2 — operação do vendedor e entrega
- Login lojista, painel de fila, aceite/recusa e preparo/conclusão; configuração horário, taxas, contato.
- Entrega própria taxa fixa e fluxo de cotação + aceite do comprador + novo aceite do vendedor quando necessário.
**Saída:** 2 lojas demonstram operação independente, inclusive casos de divergência.

## Sprint 3 — segurança e prontidão de demonstração
- Testes negativos cross-tenant, CSRF, replay e concorrência; logs essenciais e métricas agregadas básicas.
- Acessibilidade móvel, tratamento de erros, proteção de preview, orçamento/cotas e coleta de feedback com 5 usuários fictícios/convidados em ambiente protegido.
**Saída:** protótipo P1 demonstrável com dados 100% sintéticos. **Ainda não lançar.**

## Trilha P2 — piloto com pagamentos reais (não fazer durante P1)
- Implementar QR Pix real, comprovante sem confiança, confirmação manual, reembolso como ocorrência e autorização forte.
- Fazer homologação bancária, backups externos/restore, políticas e termos revisados, suporte/monitoramento e checklist legal; iniciar somente depois do aceite de todos os gates de P2.

## Priorização de custos
Para cada tarefa: (a) depende do fluxo de compra? (b) traz risco financeiro/legal se faltar? (c) pode ser dispensada até 2–5 lojas operarem? Se for apenas diferencial de marketing sem exigência de cliente, adiar. Mapas, previsão do tempo e BI de anúncios ficam fora da trilha inicial.
