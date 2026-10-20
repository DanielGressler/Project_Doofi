# Validação da atualização P1.1

Data: 20/10/2026. Verificações executadas nesta sessão, em Linux com Node 24, workerd/D1 local e Chromium. O Windows não foi executado nativamente; o wrapper agora resolve e executa diretamente os pontos de entrada JavaScript dos pacotes, eliminando a causa dos erros de shell relatados.

| Verificação                                      | Resultado                                                |
| ------------------------------------------------ | -------------------------------------------------------- |
| Migração de uma cópia do schema e seed originais | Produtos, preços e disponibilidade preservados           |
| Migrações e seed em D1 local                     | Aplicados sem erro                                       |
| `npm run check`                                  | 0 erros, 0 avisos, 0 hints                               |
| `npm run lint`                                   | Aprovado                                                 |
| `npm test`                                       | 37 testes aprovados em 5 arquivos                        |
| `npm run build`                                  | Aprovado                                                 |
| Playwright/Chromium                              | 11 cenários aprovados, incluindo a personalização global |
| `npm audit --omit=dev --audit-level=high`        | Nenhuma vulnerabilidade reportada                        |

Os três novos cenários de navegador verificam: criação e compra de combo com preço próprio, filtro de categoria e bloqueio por componente indisponível; upload/remoção de foto com prioridade sobre a ilustração e leitura efetiva do JPEG normalizado servido; alteração de fonte/paleta/banner e exibição da taxa fixa somente com entregador próprio.

Os testes de backend cobrem: composição e preço do combo preservados no pedido; componentes repetidos, aninhados ou de outra loja; conflito de versão sem sobrescrever componentes; indisponibilidade herdada; rejeição de taxa fixa no servidor; personalização isolada por loja; upload autenticado; validação do formato e do vínculo/tipo da imagem; conversão de JPG e PNG para os tamanhos finais; leitura da imagem persistida no D1 pelo endpoint de mídia.

Continuam incluídos os 28 testes originais e os oito cenários originais de navegador: retirada, entrega fixa, cotação, estados de pagamento simulados, isolamento, catálogo, acessibilidade automatizada/responsividade e reenvio após resposta perdida. As verificações de acessibilidade são limitadas às telas e regras automatizadas da suíte.

O projeto continua uma demonstração local. Não houve deploy, teste com dinheiro, teste em D1 remoto ou medição de CPU/armazenamento em infraestrutura de produção.

## Ampliação da personalização global

O cenário de personalização foi ampliado para salvar e conferir três combinações de layout, fontes e paleta em desktop (1440 px) e celular (320 px). Verifica as fontes efetivamente calculadas em cabeçalho, banner, título da loja, produtos, filtros, carrinho e rodapé; as cores do banner e filtro ativo; o formato dos cartões; e ausência de rolagem horizontal. Executa axe WCAG 2 A/AA e 2.1 AA nas seis combinações de tela. Confere também campos e títulos do checkout, o tema do acompanhamento do pedido, o isolamento entre lojas e a preservação do tema do painel administrativo.

O backend valida o novo layout contra opções predefinidas e devolve a aparência pública da loja no acompanhamento, sem dados adicionais do comprador. A migração 0003 mantém o layout Acolhedor como padrão nas lojas existentes.
