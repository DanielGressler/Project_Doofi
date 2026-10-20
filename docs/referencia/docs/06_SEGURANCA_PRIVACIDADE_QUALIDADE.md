# Segurança, privacidade e qualidade por marcos

## Segurança prioritária de P1 (mesmo com dados sintéticos)
- **Autorização tenant-by-tenant:** cada leitura/escrita de loja passa por contexto autenticado, membership e `store_id` autorizado no servidor. D1 não fornece RLS nativa. Testes A→B e B→A, IDs alterados, slug trocado e eventos associados à loja errada. O comprador convidado não autoriza operações administrativas.
- **Não confiar em navegador:** produtos, preço, frete, soma, permissão, disponibilidade e status validados no backend. Zero interpolação SQL, prepared statements em todo dado externo, limites de payload e quantidade.
- **Sessões seguras:** usar solução de autenticação revisada para Workers; sessão em cookie HttpOnly+Secure+SameSite, rotação/revogação, proteção CSRF nos POST/PUT/PATCH/DELETE autenticados e senhas com KDF forte se o produto guardar senhas. Credencial DEV somente no localhost/homologação protegida.
- **Idempotência e concorrência:** chave única para checkout, transação pedido+itens+auditoria, ações de painel com versão/condição de estado. Não marcar pago por callback de cliente. `quote` não pode ser cobrada enquanto não tiver dois aceites quando aplicáveis.
- **PII e LGPD:** nome/contato/endereço mínimos; sem CPF obrigatório por padrão; sessão, logs e analytics com política separada; sem cookies de métricas opcionais antes do opt-in; canal de direitos de titulares e políticas revisadas antes de P2.
- **Proteção abuso:** rate limit para checkout, login, consulta token e alterações financeiras; mitigação bot progressiva com Turnstile (plano gratuito possível, conforme termos e 20 widgets) se necessário; não impor desafio a todos sem medir conversão.
- **Auditoria:** `actor`, loja, ação, motivo, timestamp e ID de correlação; não armazenar senha, token, endereço completo nem números de documentos em log técnico; registros críticos atômicos com transação de negócio.

## Gates inegociáveis para P2 real
1. Evidência de testes de autorização multiempresa (incluindo IDOR e enumeração); vulnerabilidades críticas/altas resolvidas.
2. Login e recuperação de conta operacionais, alteração de chave Pix com reautenticação e notificação, MFA para operador da plataforma quando disponível.
3. QR Pix real testado com banco dos vendedores sem capturar credenciais, pré-cobrança impossibilitada quando total indefinido, e comprador instruído a verificar destinatário.
4. Backups criptografados **externos** com restauração ensaiada; metas RPO/RTO só prometidas depois de medidas; alerta de falha.
5. Erros do checkout monitorados; tentativas de checkout duplicado, pagamento tardio e reembolso registrado; runbook de incidentes.
6. Termos comprador/lojista, privacidade, cancelamentos/reembolsos, identificação do fornecedor, canais de contato e base de tratamento revisados juridicamente. Não prometer isenção absoluta da plataforma.
7. Acessibilidade e UX crítica testadas manualmente no celular; comunicação de indisponibilidade e fallback (contato loja) sem revelar PII.
8. Controle de custo e quota por cliente/loja, job de expurgo apenas quando aprovado, export e exclusão sob regras legais.

## Metas demonstráveis (não SLA prometido)
| Tema | Protótipo P1 | Piloto P2 |
|---|---|---|
| Funcionalidade | 100% jornadas J1–J3 e negativas básicas | 100% compra/Pix/exceções por teste E2E |
| Integridade | zero duplicidade em 10 requisições de mesmo intento | testes de carga com concorrência e DB real |
| Isolamento | zero vazamentos entre 2 lojas fictícias | revisão externa ou testes manuais de segurança adicionais |
| Desempenho | navegação boa em celular 320px, catálogo responsivo, medir LCP | meta LCP p75 ≤2,5s com amostra, a validar |
| Acessibilidade | foco, texto, labels, teclado, contraste e erro claro | revisão WCAG 2.2 AA em fluxos críticos |
| Recuperação | export/restore em homologação se já houver persistência | export independente testado + metas operacionais mensuradas |
| Privacidade | nenhum dado de cliente verdadeiro | inventário de tratamento, DPA e revisão legal |

**Normas como referência, não certificação:** ISO/IEC 25010:2023 (9 características), OWASP ASVS/API Top 10, WCAG 2.2 AA, LGPD e CDC. Nenhuma aprovação de P1 significa aprovação automática de P2.
