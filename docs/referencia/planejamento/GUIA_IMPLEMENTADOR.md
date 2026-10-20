# Guia de execução para desenvolvedor ou assistente de programação — iniciar quando autorizado

## Contexto obrigatório
Você vai **implementar o primeiro protótipo P1**, não colocar clientes reais em produção. O dossiê na raiz `docs/` e `planejamento/` é a **fonte prioritária**. A pasta `referencia_v094` é somente histórico. Não execute SQL legado em banco de produção nem use componentes HTML históricos como base obrigatória. Leia `README.md`, `docs/01_PROTOTIPO_FUNCIONAL.md`, `docs/02_JORNADAS_E_TELAS.md`, `docs/03_ARQUITETURA_HOSPEDAGEM.md` e `planejamento/GATES_QUALIDADE.md`.

## Ciclo obrigatório de desenvolvimento
1. Antes de escolher dependências, verifique versão e compatibilidade atuais do Astro, do adapter `@astrojs/cloudflare`, Workers, D1 e biblioteca de autenticação. Não presuma que sessões do framework são login.
2. Comece pelo ticket `S0-01` e apresente evidência de teste de `batch`, rollback e autorização multiempresa antes de codificar checkout.
3. Faça commit pequeno por ticket e inclua teste de aceitação do respectivo item em `BACKLOG_IMPLEMENTACAO.csv`.
4. Armazene dinheiro em inteiros de centavos; todos os totais são recalculados no servidor; `store_id` não vem de permissão declarada pelo navegador.
5. Não integre banco real, Pix verdadeiro, SMS pago, WhatsApp API, mapa ou clima durante P1. **Proibido receber pagamentos no protótipo interno.**
6. Se não houver como comprovar isolamento, login robusto ou transação atômica no runtime, documente a limitação e proponha ajuste de arquitetura; não simule segurança com botões desabilitados no frontend.
7. Em cada etapa entregar: arquivos criados, dependências e versões, instruções de instalação, testes executados e evidência local; marcar tarefas concluídas e pendências em backlog.

## Primeiro resultado desejado — ticket S0-01
Uma prova de conceito descartável com Astro SSR + Workers + D1 local, consulta/inserção de duas lojas fictícias com isolamento, e um teste de atomicidade pedido + evento (falha em evento reverte pedido). Registrar qualquer desvio da stack. **Não construir primeiro o painel completo nem APIs opcionais.**

## Critério para dizer que P1 está pronto
Todos os itens P1-MUST, cenários `.feature` relevantes e gates P1 passam de ponta a ponta; há uma demonstração interna em que um comprador fictício conclui pedido de uma loja e um lojista de testes o atende até o fim, sem vazar dados de outra loja. Não há dinheiro real nem dados reais.
