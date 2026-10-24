# Restaurar todos os dados de demonstração

O reset solicitado retorna aos dados de `db/seed.sql`: Casa do Forno, Verde à Mesa, dois acessos conhecidos e seis produtos. Preços, cores, fontes, layout, entrega e disponibilidade voltam aos padrões. São removidos pedidos, dados de envio, cotações, pagamentos simulados, combos adicionais, imagens, auditoria anterior, lojas/usuários criados, sessões e intenções de checkout.

Esta operação é de manutenção, separada de migrações e deploys. O comando gera backup antes de alterar dados e não é executado automaticamente ao publicar. O esquema, índices e proteções de isolamento/auditoria permanecem instalados. É necessário já ter aplicado as migrações até 0007.

## Executar no computador

Depois de atualizar os arquivos, feche as abas de teste e use o CMD do Windows na pasta do projeto.

Para restaurar somente o banco local:

```bat
cd /d "D:\myprojects\Project_Doofi-main"
npm run db:reset
```

Para restaurar o D1 remoto da demonstração, usando a autenticação Cloudflare já configurada:

```bat
cd /d "D:\myprojects\Project_Doofi-main"
set DOOFI_D1_DATABASE_ID=fab28cb0-aeef-4215-a9d2-08c791cf7fa0
npm run db:reset:staging
```

Se o login Cloudflare tiver expirado, execute `npm run cloudflare:login` e repita o comando. Não envie tokens nem senhas para o chat. O Database ID identifica o banco e não é senha.

O comando remoto exige configuração de `staging-demo`, banco `doofi-demo` e o ID informado, e interrompe se a exportação falhar. Para gerar somente o plano SQL, sem ler ou alterar o banco, acrescente `-- --plan` a qualquer comando de reset.

## Quando as alterações não aparecem ou o reset falha

O Cloudflare publica a branch configurada em **Settings → Builds → Production branch**, atualmente `main`. Um commit em outra branch ou uma proposta de alteração aberta não atualiza essa publicação. Confira o commit em **Deployments** depois da integração na `main`; um novo build da versão antiga continuará exibindo a versão antiga.

Atualize também a cópia do projeto no computador antes de usar os comandos de manutenção. `npm run db:reset` limpa somente o emulador local; o site hospedado usa `npm run db:reset:staging`. Publicar o código não executa o reset.

Se aparecer `You are not authenticated` ou uma solicitação de `CLOUDFLARE_API_TOKEN`, execute `npm run cloudflare:login` no mesmo computador em que fará o reset. A autenticação do seu computador não autentica esta sessão de desenvolvimento nem é concedida pelo Database ID. O script mostra as mensagens de erro do Wrangler, inclusive as retornadas na saída JSON, e interrompe em caso de falha. Não envie tokens ao chat.

Em uma cópia atualizada, execute a sequência completa no CMD, um comando por vez. Só prossiga se o anterior terminar sem erro:

```bat
cd /d "D:\myprojects\Project_Doofi-main"
npm ci
npm run cloudflare:login
set DOOFI_D1_DATABASE_ID=fab28cb0-aeef-4215-a9d2-08c791cf7fa0
npm run db:migrate:staging
npm run db:reset:staging
```

As migrações preparam o esquema até 0007 antes da limpeza. Ao terminar, o reset precisa informar explicitamente `Reset remoto concluído`; a geração de um plano SQL ou a mensagem `Reset local concluído` não confirma alteração do site hospedado.

## Backup e verificação

Cada execução cria `.local/demo-resets/DATA-HORA/` com:

- `backup.sql`: exportação anterior à limpeza;
- `restore.sql`: exportação preparada para restauração com tabelas antes dos dados;
- `reset.sql`: lote de manutenção aplicado;
- `verification.json`: contagens anteriores/posteriores e verificação de chaves estrangeiras.

Os backups podem conter informações dos testes e chaves internas; ficam fora do Git. O script verifica 2 lojas, 2 usuários, 2 vínculos, 6 produtos e nenhuma linha nas tabelas operacionais. Se a conferência divergir, informa a pasta de backup e não declara sucesso. Uma falha na execução local do lote reverte as alterações, incluindo a proteção de auditoria, comportamento coberto pelos testes D1.

Para voltar ao backup, use o `restore.sql` em um banco D1 vazio, seguindo a [documentação de importação/exportação do D1](https://developers.cloudflare.com/d1/best-practices/import-export-data/). Não importe sobre a base preenchida: os mesmos identificadores conflitam. O comando `npm run db:verify-restore` testa o processo em outro banco local sem sobrescrever o original.

## Cookies, carrinhos e abas antigas

Alterações de loja/produto são dados D1; cookies guardam a sessão do lojista. O reset apaga as sessões e troca a geração dos dados e a chave de acompanhamento. Pedidos antigos deixam de existir.

Com esta versão do código publicada, a próxima visita remove carrinhos e rascunhos Doofi das armazenagens local e da aba. Uma aba que observa a troca de geração recarrega para não continuar com o carrinho antigo em memória. Cookies de sessão inválidos são expirados ao acessar o painel. Chaves alheias ao Doofi e o cookie `CF_Authorization` do Cloudflare Access são preservados.

É preciso publicar o código novo para obter essa limpeza automática do navegador; o comando de banco, isoladamente, já invalida as sessões no servidor. Nenhum servidor consegue remover um cookie de um navegador desligado antes de ele voltar a acessar o site.

## Acessos após o reset

- `forno@demo.doofi.test` e `verde@demo.doofi.test`.
- Senha pública de teste: `demo-doofi-P1!`.
- Cliente continua sem conta. Use nomes de teste, DDD 00 e e-mail como `cliente@exemplo.invalid`.

O reset local desta entrega é executado após os testes de navegador, para deixar a base local limpa. O D1 remoto permanece dependente do comando acima, pois esta sessão não possui credenciais Cloudflare.
