## Gestor Financeiro — Plano de Construção

App web responsivo (PWA) de finanças pessoais, em português, no estilo escolhido **Sleek neo-bank** (fundo escuro, acento verde-esmeralda, cartões arredondados, tema claro/escuro). Sidebar no desktop e navegação inferior no celular.

Dado o tamanho do sistema, ele será construído em fases coerentes, sempre com base sólida e escalável. Todas as fases usam Lovable Cloud (Supabase) com RLS garantindo que cada usuário veja apenas seus dados.

---

### Design System
- Tokens em `src/styles.css`: acento `#10b981` (esmeralda), superfícies escuras/claras, verde=receita, vermelho=despesa, cantos 2xl, fonte Inter (via @fontsource).
- Tema claro/escuro com toggle persistente.
- Ícones Lucide, gráficos com Recharts.
- Layout: `AppSidebar` (desktop) + `BottomNav` (mobile) + header com seletor de mês.
- Manifest PWA + ícones (instalável).

### Backend (Lovable Cloud / Supabase)
Ativar Cloud e criar o schema completo com RLS (`auth.uid()`) e GRANTs em todas as tabelas:
- `profiles`, `settings` (moeda, formato de data, tema, cor, 1º dia da semana)
- `categories`, `accounts`, `banks`, `cards`, `payment_methods`, `people`, `tags`
- `transactions` (receitas/despesas, com tipo, conta, categoria, pessoa, forma, tags, observação, anexos), `transaction_tags`
- `transfers`, `installments` (parcelas), `recurring_rules` (contas fixas e receitas recorrentes)
- `investment_types`, `investments`, `dividends`
- `goals`, `goal_categories`
- `notifications`
- Funções/trigers: atualização automática de saldo das contas e limite dos cartões; função `has_role` (padrão seguro); geração de recorrências.

### Autenticação
- Cadastro, login, recuperação de senha (`/reset-password`), "permanecer conectado".
- Rota `/auth` pública; app protegido em `_authenticated/`.
- Alteração de senha nas Configurações.
- Após login → Dashboard.

---

## Fases de entrega

**Fase 1 — Fundação**
- Ativar Cloud, schema completo + RLS, design system, tema claro/escuro, PWA, layout (sidebar + bottom nav), autenticação completa e Dashboard com dados reais (KPIs, gráficos Receitas x Despesas, Gastos por categoria, últimos lançamentos, contas a vencer, metas).

**Fase 2 — Núcleo transacional**
- Receitas e Despesas (cadastrar, editar, excluir, duplicar, parcelar despesas, filtrar, pesquisar, tags, pessoa, observação).
- Transferências entre contas com atualização automática de saldo.
- Contas bancárias e Categorias (CRUD com cor/ícone/tipo).

**Fase 3 — Cartões e recorrências**
- Cartões de crédito: limite, datas (fechamento/vencimento), compras parceladas/recorrentes, faturas abertas/pagas, controle de limite.
- Contas fixas e receitas recorrentes com geração automática mensal.

**Fase 4 — Investimentos, Metas, Calendário, Relatórios**
- Investimentos (ações, FIIs, ETFs, tesouro, CDB, cripto etc.), dividendos, rentabilidade, patrimônio.
- Metas com barra de progresso.
- Calendário financeiro.
- Relatórios (mensal, anual, por categoria/conta/cartão, fluxo de caixa, evolução patrimonial) com exportação PDF/Excel.

**Fase 5 — Configurações, pesquisa e notificações**
- Módulo de Configurações completo (todas as listas administráveis: categorias, contas, bancos, cartões, formas de pagamento, pessoas, tags, tipos de investimento, categorias de metas). Nenhuma lista fixa no código.
- Personalização (tema, cor principal, moeda, formato de data, 1º dia da semana).
- Pesquisa global e Notificações/alertas.

**Depois da v1 (conforme combinado):** anexos de arquivos, 2FA, encerrar sessões, exportar/importar/restaurar backup.

---

## Detalhes técnicos
- Stack: TanStack Start + React + Tailwind v4 + shadcn; TanStack Query para dados; server functions (`createServerFn`) com `requireSupabaseAuth` para acesso ao banco.
- Rotas protegidas sob `src/routes/_authenticated/`; `/auth` e `/reset-password` públicas.
- Saldos e limites atualizados via triggers no banco (fonte da verdade), com invalidação de cache no frontend após mutações.
- Recorrências geradas por função no servidor.
- Regras: confirmação antes de excluir registros relacionados; filtros por período/categoria/conta/tags; ordenação por data/valor/descrição.

Começo pela Fase 1 assim que aprovar, e sigo pelas fases seguintes.