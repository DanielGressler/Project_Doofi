# Decisão de arquitetura e opções de hospedagem — 20/10/2026

## Decisão D-001 — opção preferida: Astro SSR seletivo + Cloudflare Workers + D1
**Aplicação única** (loja pública, API e painel) em TypeScript. Entidades e regras de negócio em módulos de domínio independentes de Cloudflare. SSR sob demanda nas telas privadas e páginas de loja; páginas legais/assets em static/prerender. Worker responde HTTP, valida sessão/autorização e usa binding D1. Fotos enviadas pelos lojistas futuramente em R2 (Standard) com tamanho/quantidade limitados; imagens sintéticas no P1. Deploy de homologação em `*.workers.dev`, produção com domínio e DNS próprio quando necessário.

**Motivo:** menos componentes operacionais, sem VPS, boa distribuição de assets, custo pequeno para piloto, sem manter banco Postgres separado. **Contras:** D1 não tem RLS nativa; limites de CPU/queries/storage; possível dependência de fornecedor. A autorização multiempresa deve estar explicitamente implementada em toda leitura/gravação, e testada. Não tratar D1/Workers como SLA garantido.

**Prova de compatibilidade prévia:** demonstrar com projeto descartável (quando desenvolvimento começar) que Astro + adapter oficial + autenticação escolhida + transação de pedido/audit + D1 funcionam no runtime atual. Astro Sessions integra KV automaticamente em alguns cenários, **mas não equivale a autenticação nem precisa ser ativado no protótipo**; preferir sessões próprias projetadas com segurança e persistência escolhida. A equipe fixa dependências em lockfile.

## Opções comparadas
| Opção | Custos públicos indicativos | Fortes | Limites/risco | Decisão |
|---|---|---|---|---|
| Cloudflare Workers Free + D1 Free | US$0 dentro das franquias | unifica SSR, estáticos e banco leve; deploy direto | CPU 10ms por invocação; até 100 mil requests/dia; D1 500MB/banco, sem RLS; continuidade e backup externo | **1ª escolha DEV/P1** |
| Cloudflare Workers Paid + D1 | a partir de US$5/mês + excedentes, domínio e backup | mais folga, cobrança por consumo com franquia | gerenciar limites e custos, sem garantia de 100% uptime | **candidato P2** |
| Workers + Supabase Postgres (Free) | US$0 planos Free, conforme franquias | SQL/PostgreSQL e opção de RLS gerenciada | Supabase pausa projetos gratuitos pouco ativos; tráfego/latência entre provedores; integração Auth aumenta superfície | alternativa se equipe priorizar Postgres |
| Workers + Supabase Pro | Workers a partir US$5 + Supabase a partir US$25/mês + excedentes | banco gerenciado e backups do plano Pro; RLS se configurada corretamente | custo inicial ~US$30; configuração e dados em serviços separados | alternativa paga se necessidades reais justificarem |
| VPS gerenciada pelo time | preço depende de máquina/provedor + backup + domínio | controle de runtime e banco | sistema operacional, updates, TLS, firewall, disponibilidade e backups ficam sob responsabilidade do time | evitar no P1 |
| Vercel Hobby | US$0, **uso não comercial/pessoal** | excelente DX para experimentos pessoais | termos Hobby não adequados para operar SaaS comercial | NÃO usar como base do P2 comercial |

### Limites relevantes e decisões preventivas
- Workers Free: até **100.000 requests/dia** e **10ms CPU por invocação**, sujeitos a condições atuais. Workers Paid: base **US$5/mês**, além de uso excedente. Assets estáticos podem ter tratamento diferente de requests computados.
- D1 Free: **5 milhões rows read/dia; 100 mil rows written/dia; 500MB por banco e 5GB por conta**. Contagens são de linhas, não número de chamadas. Time Travel Free 7 dias, Paid 30 dias. Não substituir export externo/teste de restauração.
- D1 `batch()` executa múltiplos statements como transação, com rollback em caso de erro — validar o padrão de gravação de pedido+itens+auditoria; idempotência única no banco.
- R2 Standard tem franquia de **10 GB-mês, 1 milhão ops Classe A, 10 milhões Classe B/mês**. Opcional e quota por loja; assets locais no P1.
- Worker observar CPU/requests/D1 rows read/write/database storage. Defender-se contra *denial of wallet* com limites, cache e controle de consultas.

## Hospedagem por ambiente e custos esperados
| Ambiente | URL e dados | Proposta de investimento | Controles |
|---|---|---|---|
| Local P1 | `localhost` e D1 local com seed sintética | sem custo de API | sem dados reais; resets/reprodução |
| Homologação P1 | subdomínio `workers.dev` não público indexável / acesso restrito; D1 de homologação separado | possível US$0 enquanto couber nas franquias | autenticação para equipe, segredo segregado, jamais chave Pix real |
| Piloto P2 | domínio próprio, Worker e D1 exclusivos, conta do operador | planejar US$5+/mês para Workers Paid se necessário; custos totais dependem de medição | backups externos, alertas, privacidade, suporte, termos, atualização segura |
| Crescimento | a decidir por métricas | sem preço fixo garantido | considerar R2, PostgreSQL, particionamento e fila se justificar |

## Deploy e operações: preparação, não código
1. Organização e acesso por pessoa, MFA nos consoles, CI com testes/preview protegido.
2. DEV/STAGING/PROD com bindings e bancos separados; impedir usar DB de produção por engano.
3. Migrations versionadas criadas da **modelagem mínima v0.9.5**; não rodar SQL histórico `referencia_v094/db/*.sql` em produção sem revisão.
4. Deploy versionado, logs técnicos minimizados e rollback de Worker testado. Mudanças de banco exigem migrações reversíveis/compatíveis.
5. Exportação de banco independente do Time Travel, cifrada; testar restauração em banco separado e reconciliar pedidos do intervalo.
6. Cache somente páginas públicas; `no-store` para checkout, status individual, painel, tokens e pedidos.

## Serviços externos — adiados, sem bloquear protótipo
- **Localização**: formulário endereço, CEP e bairro, área/valor definidos por lojista. Geocodificação opcional: Geoapify Free 3.000 créditos/dia; não indispensável, respeitar licença/atribuição/privacidade.
- **Clima**: não influencia a geração/aceite do pedido inicial. Retirar do primeiro protótipo. A API gratuita do Open-Meteo **não permite uso comercial**; verificar contrato quando fizer sentido implementar.
- **Pagamento**: BR Code gerado sem API bancária. Automação de confirmação só com integração consentida/credenciada com banco do vendedor, depois de tração.

## Fontes oficiais para validação contínua
https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/
https://developers.cloudflare.com/workers/platform/pricing/
https://developers.cloudflare.com/workers/platform/limits/
https://developers.cloudflare.com/d1/platform/limits/
https://developers.cloudflare.com/d1/platform/pricing/
https://developers.cloudflare.com/d1/worker-api/d1-database/
https://developers.cloudflare.com/d1/reference/time-travel/
https://developers.cloudflare.com/r2/pricing/
https://supabase.com/pricing
https://supabase.com/docs/guides/platform/free-project-pausing
https://vercel.com/docs/plans/hobby
https://www.geoapify.com/pricing/
https://open-meteo.com/en/terms
