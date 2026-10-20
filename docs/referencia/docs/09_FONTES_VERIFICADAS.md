# Fontes primárias consultadas para decisão de hospedagem (20/10/2026)
**Preços e limites podem mudar.** Links são referências para revalidação no dia do deploy, não garantias contratuais.

1. Cloudflare Astro on Workers: https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/ — scaffold, SSR/adaptador, assets e deploy.
2. Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/ — free e Workers Paid a partir US$5/mês, franquias e excedentes.
3. Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/ — 100k req/dia e 10ms CPU por execução no Free.
4. Cloudflare D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/ — linhas lidas/gravação por plano.
5. Cloudflare D1 limits: https://developers.cloudflare.com/d1/platform/limits/ — 500MB Free por DB e armazenamento total.
6. Cloudflare D1 database API: https://developers.cloudflare.com/d1/worker-api/d1-database/ — transações `batch()` e prepared SQL.
7. D1 Time Travel: https://developers.cloudflare.com/d1/reference/time-travel/ — Free 7 dias, Paid 30; não substitui backup independente.
8. Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/ — Standard 10 GB-mês e operações Free.
9. Cloudflare Turnstile Free: https://developers.cloudflare.com/turnstile/plans/ — proteção progressiva de bots.
10. Supabase pricing: https://supabase.com/pricing — alternativas Postgres Free e Pro.
11. Supabase pausing: https://supabase.com/docs/guides/platform/free-project-pausing — risco de pausa do Free.
12. Vercel Hobby restrictions: https://vercel.com/docs/plans/hobby — Hobby para uso pessoal não comercial.
13. Geoapify pricing: https://www.geoapify.com/pricing/ — 3 mil créditos/dia Free; apis geográficas opcionais.
14. Open-Meteo Terms: https://open-meteo.com/en/terms — API Free apenas não comercial.
15. Banco Central Pix cobrança: https://www.bcb.gov.br/estabilidadefinanceira/pix-cobranca — BR Code/cobrança e papel do PSP.
16. Regulamento/manual do Pix: https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf — regras de QR/EMV; confirmar revisão válida em P2.
17. ANPD cookies: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_cookies_e_protecao_de_dados_pessoais
18. LGPD texto legal: https://www.planalto.gov.br/ccivil_03/_ato2018-2022/2018/lei/l13709.htm

**Independência:** referência a serviços não significa contratação, teste bancário real, licença validada para cada finalidade ou domínio ativado.
