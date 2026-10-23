# Dados de envio do cliente

O lojista continua usando o painel e o login existentes. O cliente informa os dados do pedido após fechar o carrinho: nome, telefone e e-mail, além de endereço, bairro e CEP quando escolhe entrega. Os valores podem ser genéricos e fictícios. Esses dados permanecem sem verificação de identidade.

## Como testar

1. Abra uma loja, adicione produtos e clique em **Continuar pedido**.
2. Informe nome, telefone e e-mail fictícios. Para entrega, preencha também os campos de endereço já existentes.
3. Confirme o uso de dados fictícios e envie o pedido. O fluxo continua para o acompanhamento existente.
4. Entre no painel da própria loja e abra o pedido: telefone e e-mail aparecem separados, junto ao nome e ao endereço.

O formulário do cliente não solicita conta, senha ou código de confirmação. A proteção externa da demonstração e os acessos dos lojistas seguem a configuração atual.

## Relação entre os dados

| Campo/restrição                            | Finalidade                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| `customer_details.id`                      | Chave única do conjunto de dados de envio.                                       |
| `customer_details.store_id → stores.id`    | Empresa responsável pelo registro.                                               |
| `orders.customer_id → customer_details.id` | Chave estrangeira que vincula pedido e dados de envio.                           |
| Índice único `orders_customer`             | Um conjunto de dados de envio pertence a um pedido.                              |
| Triggers de escopo                         | Recusam vínculo entre empresas diferentes e mudança de proprietário do registro. |

Cada novo pedido recebe um registro próprio. Nome, telefone ou e-mail iguais não unem empresas nem criam uma identidade compartilhada. Reenvios do mesmo pedido recuperam o registro já criado, preservando a idempotência.

Os dados de envio são gravados na mesma transação do pedido, itens, pagamento simulado e auditoria. Uma falha reverte todas essas gravações. Eles não criam linhas em `users`, `sessions` ou `store_memberships`, mesmo se o e-mail informado coincidir com o de um lojista.

O painel consulta telefone/e-mail com o escopo da sessão empresarial. O acompanhamento público continua omitindo nome, telefone, e-mail, endereço e chave do registro do cliente. Não existe busca pública de clientes por e-mail, telefone ou identificador.

As cópias de nome/contato/endereço já presentes em `orders` continuam como snapshot histórico compatível com os pedidos anteriores. Os campos separados de telefone e e-mail ficam em `customer_details`.

## Atualizar o banco

Aplique a migração **0006** antes de publicar o novo código. Ela preserva pedidos, links de acompanhamento e sessões empresariais. A versão anterior da aplicação continua podendo gravar durante a transição: uma trigger associa os dados legados ao pedido dentro da mesma transação.

No CMD do Windows, depois de atualizar os arquivos do projeto:

```bat
cd /d "D:\myprojects\Project_Doofi-main"
set DOOFI_D1_DATABASE_ID=fab28cb0-aeef-4215-a9d2-08c791cf7fa0
npm run db:migrate:staging
```

O comando usa a autenticação Cloudflare já configurada no computador. O deploy segue o fluxo existente de `build:staging` e `deploy:staging`. Para o banco local, execute `npm run db:migrate` antes de iniciar o servidor. Não repita o seed para atualizar os pedidos.

Pedidos antigos recebem um registro `legacy-<id-do-pedido>`. O contato original é copiado para e-mail quando contém `@`, e para telefone nos demais casos; o outro campo fica ausente. Esses valores históricos não são verificados. O painel informa quando um campo novo não foi preenchido no pedido antigo. O formato antigo de checkout permanece aceito para recuperar pedidos já existentes, enquanto novos pedidos exigem os três campos de envio.

## Validação e restauração

Foram validados 112 testes de código e 14 cenários de navegador, além de `astro check`, formatação, builds local/homologação e publicação `--dry-run`. Os testes cobrem chaves estrangeiras, isolamento A/B, contatos repetidos, ausência de conta do cliente, rollback e migração de pedidos antigos.

`npm run db:verify-restore` verifica também os vínculos de dados de envio: nenhum pedido sem registro correspondente e nenhum registro sem pedido. A exportação original fica em `backup.sql`; o arquivo `restore.sql` posiciona as definições de tabelas antes dos dados, preservando valores literais e triggers. Isso permite restaurar a nova chave estrangeira no D1. Os testes e a restauração desta revisão usam somente o ambiente local.
