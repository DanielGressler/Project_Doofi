# Decisões abertas e riscos tratados por etapa

| ID | Decisão | Padrão provisório para iniciar P1 | Validação antes de P2 |
|---|---|---|---|
| D01 | Banco escolhido | D1 com interface de repositório | analisar isolamento/performance/restore real; trocar por Postgres se necessário |
| D02 | Método de login lojista | proof-of-concept de sessão segura no runtime; contas demo | provedor/armazenamento e recuperação seguros; reautenticação mudança Pix |
| D03 | Primeiro nicho/cidade | 2 lojas fictícias com retirada/entrega simples | entrevistar 5 lojas e validar campos/operação/preço real |
| D04 | Produtos variados/combos | produtos simples com preço fixo | pesquisar se primeiro nicho exige tamanhos/combos antes de piloto |
| D05 | Notificações | refresh/polling do painel; consulta por link | definir necessidade de alertas; não depender de WhatsApp API paga |
| D06 | Regiões de entrega | lista manual de bairro/CEP coberto e taxa fixa, sem mapa | validar precisão e clareza com vendedores |
| D07 | Processamento Pix | simulado em P1, QR estático direto em P2 | homologar recebedor, manual e processo de divergências |
| D08 | Cobrança SaaS | contrato/mensalidade fora da jornada comprador | definir planos, impostos, faturamento e suporte |
| D09 | Precificação/hospedagem | Free no desenvolvimento, Workers Paid como hipótese de piloto | medir requisições/CPU/D1 e custos de backup/domínio |
| D10 | Eventos e VRM | auditoria crítica sem cliques P1 | definir métrica VRM e base legal para analytics granular |
| D11 | Fotos dos lojistas | assets sintéticos P1 | R2 + resize + permissões + limite armazenamento por loja |
| D12 | Minutas legais | anexos históricos não assinados | revisão jurídica e conteúdo transparente de fornecedor, CDC, LGPD |

## Riscos críticos (gates)
- IDOR multiempresa sem RLS: **NO-GO P2** até testar todas rotas/IDs e sessão.
- Pedido com total incerto gerando Pix: **NO-GO P2**; validar frete e duplo aceite.
- Confirmação de pagamento por print: **NO-GO P2**; somente vendedor depois de conferir crédito, e rotular fonte de evidência.
- Falha de backup / indisponibilidade longa: **NO-GO P2** sem restauração ensaiada e contingência de pedidos.
- Aceitar pedidos sem informar vendedor e política: **NO-GO P2** até minutas aprovadas e dados preenchidos.
- Cobrança e limites do serviço externo sem alertas: não aprovar aumento de escala.
