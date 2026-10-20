# Checklist de preparação — antes de escrever qualquer tela

## Antes do primeiro commit de produto
- [ ] Projeto não armazenará Pix real nem criará pedido comercial durante P1.
- [ ] Stack Astro+Worker+D1 validada com transação e sessão em spike de laboratório.
- [ ] Repositório privado criado, segredos em gerenciador próprio, MFA no console Cloudflare/Git.
- [ ] Duas contas demo e duas lojas seed sintéticas, sem dados pessoais reais.
- [ ] Decidido padrão de `store_id` em todas as consultas, com testes IDOR.
- [ ] Definido schema mínimo e migrations do zero; SQL v0.9.4 só referência.
- [ ] Ticket de cadastro, catálogo, checkout, pedido e painel ligados a cenários `.feature`.
- [ ] Decidida estratégia de autenticação compatível com o runtime sem expor senhas em logs.
- [ ] Identificados custos de hospedagem, domínio futuro, backups, suporte e taxas Pix dos vendedores.

## Antes de publicar homologação
- [ ] Deploy com dados fictícios, sem indexação e acesso controlado.
- [ ] Rate limit e proteção de abuso; sem tenant B acessível por A.
- [ ] Testes automatizados e manuais da jornada completa no celular e desktop.
- [ ] Estado Pix demonstrativo inequivocamente rotulado; não usar chave de ninguém.
- [ ] Toda transição crítica gera evento de auditoria no banco.

## Antes de P2 com pedidos reais
- [ ] Credenciais reais e recuperação de conta seguras; reautenticação troca de chave.
- [ ] Termos de adesão, comprador, privacidade e reembolso revisados e preenchidos.
- [ ] Banco recebedor e QR Pix testados com consentimento explícito dos vendedores piloto.
- [ ] Treinamento de conferência manual de crédito e devolução pela transação original.
- [ ] Dados bancários nunca acessados pela plataforma (sem login/senha banco).
- [ ] Backups externos, restore teste, alerta de quota e plano de contingência.
- [ ] Verificação de acessibilidade, privacidade, suporte e custos operacionais.
- [ ] Registro GO/NO-GO assinado por responsáveis.
