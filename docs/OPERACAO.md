# Operação local e preparação de homologação

Para publicação externa, use o [guia de hospedagem protegida](HOSPEDAGEM_CLOUDFLARE.md). Os comandos locais abaixo continuam separados do D1 remoto.

## Retomada em uma tarefa

Use o checkout existente `/workspace/Project_Doofi`. Cada tarefa já tem isolamento próprio; não crie worktree para configurar este projeto sem pedido explícito. Leia o README e as mudanças locais antes de instalar ou editar.

Dependências ficam em `node_modules`, build em `dist`, banco em `.wrangler/state`, configurações/logs auxiliares em `.local`. Processos não sobrevivem necessariamente à restauração do ambiente. Inicie novamente `npm run dev` ou `npm run preview -- --port 4321` conforme o objetivo. Nunca inicie ambos na mesma porta. Não forneça links de preview loopback na UI de onboarding.

## Instalação reprodutível

```sh
set -eu
cd /workspace/Project_Doofi
npm ci --cache /workspace/.cache/npm --no-audit
npm run db:migrate
npm run db:seed
npm run check
npm test
npm run build
```

O seed não redefine preços ou apaga pedidos. Instalar novamente não requer tokens, login no console Cloudflare nem acesso remoto ao D1. O ID D1 em `wrangler.jsonc` é um identificador fictício para o emulador; não é um recurso provisionado.

## Conferência de inicialização

Após iniciar o servidor na porta 4321, faça uma requisição interna a `/api/v1/health`: deve retornar HTTP 200 com `ok:true`, `mode:synthetic-only`, `database:D1 local`. A loja `/loja/casa-do-forno` deve renderizar o catálogo do banco.

Faça o roteiro do README ou execute `npm run test:e2e` após `npm run build`. Um PID ou uma porta aberta, isoladamente, não comprovam funcionamento. A suíte E2E usa o build compilado para evitar colisões de cache do Vite entre `astro check`, build e servidor de desenvolvimento.

## Exportar e verificar restore

Com o servidor e escritores parados:

```sh
npm run db:verify-restore
```

O comando exporta o banco local para `.local/restore-checks/<instante>/backup.sql`, importa em outro banco/estado local e compara contagens de pedidos, itens, produtos e auditoria. Também exige ausência de pedido sem evento de criação e de total inconsistente. `verification.json` registra os resultados. Cada execução usa um diretório novo; o banco original não é alterado. Não usar esse comando como procedimento de produção.

Os arquivos de backup contêm dados da demonstração, sessões e material criptográfico local. São ignorados pelo Git; não publique backups ou traces. O teste prova restauração e consistência básica no emulador, sem equivaler a réplica Cloudflare remota ou validação exaustiva de todas as linhas.

## Limites e observabilidade

- Checkout: até 20 produtos distintos, 10 unidades por produto e subtotal até R$ 10.000.
- Catálogo: limite de 50 produtos por loja na demonstração.
- Payload JSON: até 16 KiB. Controles de estado e autorização sempre no servidor.
- Limites D1 por janela/minuto: login 10, checkout 120, emissão de intento 120, consulta de pedido 240 e mutações administrativas 100 por loja/IP. Em desenvolvimento, conexões sem `CF-Connecting-IP` compartilham o bucket local.
- Painel lista os 100 pedidos mais recentes; os indicadores agregam os pedidos da loja. Não há medição de clique ou inferência de receita recebida.
- Cada criação registra duração e linhas lidas/escritas retornadas pelo D1. Erros recebem correlação sem dados do pedido. Valores do emulador não estimam CPU/latência/cotas do serviço remoto.

Antes de publicar homologação: medir CPU, requests, rows read/write e storage reais; definir alertas de 70% e 90% das cotas do plano e responsáveis; restringir acesso, separar bancos e revisar retenção/expurgo de sessões, intentos e buckets. Os alertas estão propostos, **não provisionados**.

## Falha ou indisponibilidade

1. Interrompa novos testes, preserve `.wrangler/state` e capture somente código/ID de correlação do erro.
2. Verifique versão do Node, instalação congelada e migrations. Não remova o banco para ocultar a falha.
3. Reproduza em teste isolado. A suíte de rollback deve falhar se pedido e auditoria perderem atomicidade.
4. Restaure uma cópia em diretório separado, reconcilie e documente o resultado antes de substituir dados.

A CI foi adicionada, mas não executada no GitHub nesta sessão. Não há deploy remoto, release publicada, serviço pago ou segredo Cloudflare solicitado nesta entrega.
