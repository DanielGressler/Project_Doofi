# Orçamento básico e riscos econômicos (premissas, não proposta comercial)

## Gastos fixos externos no primeiro protótipo
| Linha | P1 local/homologação com dados fictícios | P2 piloto 2–5 lojas |
|---|---|---|
| Astro/TypeScript/SQLite tooling | R$ 0 de licença | R$ 0 de licença |
| Cloudflare Workers | Workers Free até cotas | **US$5/mês de base** se escolher Paid + excedentes; Free não é SLA |
| Cloudflare D1 | Free até cotas | Free ou incluído nos planos conforme uso; export/retention externos à parte |
| R2 / fotos | imagens estáticas sintéticas: R$0 adicional | Standard Free até 10GB-mês e cotas de operações; excedente variável |
| Domínio personalizado | `workers.dev`: sem aquisição de domínio | valor anual de domínio não estimado; cotar TLD/registrador |
| Pix direto | tela de simulação sem Pix | BR Code gerado no backend sem tarifa **da plataforma**; banco PJ/MEI pode tarifar recepção |
| API mapas/clima | não usar | não usar por padrão |
| E-mails, SMS, WhatsApp Business API | nenhum serviço pago | evitar obrigatório; eventual custo conforme fornecedor/volume |
| Backup/segurança/legal/suporte | documentação e rotina local | custos variáveis de armazenamento, processos, suporte e revisão jurídica |

> **Não tratar US$5 como custo completo de operação:** tempo de desenvolvedor, manutenção, incidentes, domínio, backups, suporte, taxas de banco/serviços e tributos não estão incluídos.

## Três cenários de demanda para medir, não precificação garantida
Hipóteses: 10 pedidos/dia por loja, 30 dias, **10 invocações de Worker por pedido** (checkout, refresh, painel etc.), **15 linhas escritas por pedido** (pedido, itens, auditoria/status), sem contar catálogos/acessos e consultas de outros visitantes.
| Lojas | Pedidos/mês | Invocações relacionadas a pedidos/mês | Linhas gravadas por pedidos/dia |
|---:|---:|---:|---:|
| 2 | 600 | 6.000 | 300 |
| 10 | 3.000 | 30.000 | 1.500 |
| 100 | 30.000 | 300.000 | 15.000 |

As hipóteses não incluem leitura do catálogo, bots, erros/retries, leitura de sessão, relatórios, imagens, outbox nem analytics. Worker's Free tem 100k requests/dia; D1 Free 100k rows written/dia e 500 MB por banco; não basta calcular volume de pedido para garantir elegibilidade. Monitorar uso real e ajustar.

## Custos de API opcionais, por decisão de produto
- Geocodificação/rota só se realmente precisar: Geoapify Free **3.000 créditos/dia**. Lembre-se: créditos variam por endpoint e detalhes; cache com cuidado com termos/licença e privacidade. Para P1/P2, não solicitar rota externa.
- Clima só para painel de planejamento comercial numa fase posterior; **Open-Meteo Free é não comercial**. A obrigação de contratá-lo não se justifica em fluxo de pedido.
- API Pix bancária automática não faz parte do P1/P2; os bancos têm políticas próprias de acesso, certificado e tarifas. Nenhum plano assume conciliação gratuita sem confirmação contratual.

## Controle econômico obrigatório
Criar orçamento mensal-alvo por 5 lojas, separar CAPEX (desenvolvimento) de OPEX (infra+suporte), observar consumo diário por loja e bloqueios de abuso; alertas a 70%/90% das cotas, upgrade sob decisão consciente e limite de cobrança quando aplicável.
