# Hospedagem protegida no Cloudflare Workers

Esta configuração serve para demonstrar o protótipo a convidados. Mantém lojas, pedidos e pagamentos sintéticos. A autorização do convidado é feita pelo Cloudflare Access, antes do login demonstrativo do lojista.

## O erro 10181

O ID `00000000-0000-0000-0000-000000000001` é uma fixture do emulador local. Não identifica um banco da conta Cloudflare. O build pode terminar corretamente e a publicação falhar quando esse identificador é enviado à API.

Não substitua esse ID em `wrangler.jsonc`: esse arquivo continua sendo a configuração local. Os comandos `:staging` geram uma configuração separada em `.local/cloudflare/wrangler.json` e usam `DOOFI_D1_DATABASE_ID`, mantendo os bancos local e remoto separados. O Worker de homologação se chama `project-doofi` por padrão, correspondendo ao nome usado na integração do GitHub.

### Erro de build no Windows: `The URL must be of scheme file`

Atualize `scripts/staging.mjs` para a versão atual do repositório e repita `npm run build:staging`. O adaptador Astro interpreta `configPath` como URL; um caminho absoluto como `D:\myprojects\...` vira uma URL de protocolo `d:`. O script corrigido passa um caminho relativo com barras `/` ao adaptador e mantém os caminhos de arquivo nativos nos comandos do Wrangler. Essa correção não exige recriar o banco nem repetir migrações e seed.

## 1. Criar e preencher o banco remoto

No painel Cloudflare, abra **Storage & databases → D1**, crie o banco `doofi-demo` e copie seu **Database ID**.

Baixe ou atualize os arquivos do GitHub. No Prompt de Comando do Windows, execute um comando por vez:

```bat
cd /d "D:\myprojects\Project_Doofi-main"
npm ci
npm run cloudflare:login
set DOOFI_D1_DATABASE_ID=COLE_AQUI_O_DATABASE_ID_REAL
npm run db:migrate:staging
npm run db:seed:staging
```

O login abre o navegador para autorizar a conta. Ele usa a mesma pasta de configuração dos demais comandos do projeto. A variável definida com `set` vale somente naquele terminal; defina-a novamente se abrir outro terminal.

As migrações criam as tabelas e registram as atualizações aplicadas. O seed preenche duas lojas, seis produtos e duas contas de teste em um banco novo. Ele usa `INSERT OR IGNORE`, preservando registros existentes. Migrations e seed não importam pedidos, imagens ou alterações feitas no banco local.

Para conferir no Console do D1:

```sql
SELECT title, slug FROM stores;
SELECT COUNT(*) AS produtos FROM products;
```

Um banco novo deve apresentar Casa do Forno, Verde à Mesa e seis produtos. Não é necessário enviar o ZIP do projeto ao D1.

## 2. Corrigir o build e o deploy no painel

No Worker conectado ao GitHub, abra as configurações de **Builds**:

- **Build command:** `npm run build:staging`
- **Deploy command:** `npm run deploy:staging`
- **Root directory:** a raiz do repositório, onde fica `package.json`.
- Em **Build variables**, adicione `DOOFI_D1_DATABASE_ID` com o ID real do banco.

Essas variáveis de build são diferentes das variáveis de execução do Worker. Não use somente `npm run build` e `npx wrangler deploy` para essa hospedagem: eles pertencem ao fluxo local original.

O nome padrão é `project-doofi`. Se o Worker tiver outro nome, defina também `DOOFI_WORKER_NAME` nas variáveis de build.

Salve e faça um novo deploy. Essa primeira publicação permanece bloqueada enquanto o controle de acesso não estiver configurado. Um 403 nessa etapa é esperado, pois o aplicativo não aceita visitantes sem a autenticação completa.

Se preferir publicar pelo terminal já autenticado, com a variável D1 definida:

```bat
npm run build:staging
npm run deploy:staging
```

## 3. Restringir os convidados

Habilite o Zero Trust na conta. Depois abra **Workers & Pages → project-doofi → Access**:

1. Escolha **Protect this Worker behind Access**.
2. Proteja **All traffic**, incluindo as URLs de produção e de preview.
3. Configure uma política **Allow** com os e-mails individuais dos convidados. Não use uma regra que permita todos os visitantes.
4. Configure um método de login, como código enviado ao e-mail (One-time PIN).
5. Aplique a política.

Uma política no nível do Worker protege os domínios associados e os arquivos estáticos. As URLs de preview também ficam desativadas na configuração gerada. O código verifica adicionalmente o hostname e o token assinado da aplicação.

## 4. Informar o endereço e a aplicação de acesso

Nas configurações do Worker, em **Variables and Secrets**, adicione como variáveis de execução:

| Nome                    | Valor                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `DOOFI_DEMO_HOST`       | Host completo do Worker, como `project-doofi.sua-conta.workers.dev`, sem `https://` e sem caminho |
| `CF_ACCESS_TEAM_DOMAIN` | Domínio da equipe Zero Trust, como `sua-equipe.cloudflareaccess.com`, sem `https://`              |
| `CF_ACCESS_AUD`         | Application Audience (AUD) da aplicação Access que protege este Worker                            |

O domínio da equipe aparece nas configurações do Zero Trust. O AUD é o identificador da aplicação de acesso, disponível nos detalhes da aplicação em Access/Applications. Não é o Account ID, o Database ID ou um token de API.

Salve e publique a atualização das variáveis. `APP_MODE=staging-demo` já é definido pelo build de homologação. O deploy usa `keep_vars` para preservar variáveis de execução configuradas no painel.

O script também copia `DOOFI_DEMO_HOST`, `CF_ACCESS_TEAM_DOMAIN` e `CF_ACCESS_AUD` quando essas três variáveis são fornecidas em **Build variables**. Nesse caso, salve e execute um novo build/deploy para que os valores cheguem ao Worker. Uma alteração apenas salva na configuração de Build não modifica a publicação que já está em execução. A configuração diretamente em **Settings → Variables and Secrets** do Worker é aplicada com **Save and deploy**.

Até que os três campos estejam corretos, o sistema bloqueia o acesso. O backend verifica assinatura RS256, emissor, audiência, expiração e identidade do token `Cf-Access-Jwt-Assertion`. Um cabeçalho inventado ou o acesso por outro host não libera o aplicativo. Falhas ao consultar as chaves públicas também mantêm o bloqueio.

## 5. Validar e compartilhar

Abra uma janela anônima e acesse `https://SEU_HOST/`:

1. Confirme que o Cloudflare pede autenticação.
2. Entre com um e-mail autorizado e confira as opções **Sou cliente** e **Sou lojista**. Cliente abre a lista de lojas; lojista abre o login do painel.
3. Teste também um e-mail fora da lista: ele deve ser negado.
4. Faça um pedido fictício e acompanhe pelo painel de demonstração.
5. Teste os uploads no Worker para verificar os limites de CPU e armazenamento do plano escolhido; os testes locais não medem esses limites remotos.

As contas demonstrativas continuam sendo `forno@demo.doofi.test` e `verde@demo.doofi.test`, com a senha pública documentada no README. Cada pessoa autorizada pode experimentar essas contas ou usar **Criar minha loja**, no login, para criar uma empresa fictícia isolada e seguir o assistente de personalização. Esse cadastro continua restrito ao ambiente de demonstração protegido; não é autenticação comercial de produção. Aplique também `0007_onboarding_fila.sql` antes de publicar a atualização de interface.

Os convidados precisam autenticar no Access também ao abrir links de acompanhamento. O e-mail usado no controle de acesso é real; essa autorização externa permanece igual. Dentro do protótipo, cadastro/login da loja e checkout aceitam somente domínios reservados de teste, como `@exemplo.invalid` e `@demo.doofi.test`. Telefones usam DDD 00 e nomes de destinatários precisam de uma marca de teste. A revisão visual não adiciona migrações além das sete já existentes.

## Comandos locais preservados

```bat
npm run db:migrate
npm run db:seed
npm run dev
```

Esses comandos continuam usando o banco local. Não usam o banco de homologação.

## Evidências e limites desta preparação

Os testes automatizados exercitam o bloqueio de tokens ausentes, falsos, expirados, de outra aplicação e de outro emissor; host alternativo; configuração ausente; falha de chaves; origem e CSRF; cookie Secure; e preservação do modo local. O build de homologação e o dry-run de publicação foram verificados sem publicar na conta do usuário. Criar o banco, aplicar migrações remotas, configurar políticas e concluir o deploy exigem a sessão autorizada da sua conta.

Referência: [Cloudflare Access para Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).

Verificações desta alteração: 44 testes de backend e 11 cenários de navegador aprovados; check e lint sem erros; build local e build de homologação aprovados; dry-run da publicação aprovado. O Worker compilado de homologação retornou 403 sem autenticação para páginas, API e mídia. A preparação também recusa o Database ID fictício e impede publicar como homologação um build local. Nenhuma dessas verificações carregou dados ou publicou recursos na conta Cloudflare do usuário.
