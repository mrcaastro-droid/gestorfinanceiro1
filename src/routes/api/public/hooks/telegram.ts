import { createFileRoute } from "@tanstack/react-router";
import { sendTelegramMessage, deleteTelegramMessage, parseMessage, HELP, brl, todayISO } from "@/lib/telegram";

type Row = Record<string, any>;

// ─── Sessão conversacional ──────────────────────────────────────────
interface SessionState {
  step: "category" | "subcategory" | "account" | "payment_method";
  type: "receita" | "despesa";
  amount: number;
  description: string | null;
  is_paid: boolean;
  categoryId: string | null;
  categoryName: string | null;
  accountId: string | null;
  accountName: string | null;
  categories: Array<{ id: string; name: string }>;
  subcategories: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; name: string }>;
  paymentMethods: Array<{ id: string; name: string }>;
  startedAt: number;
  lastBotMessageId: number | null;
}

const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos
const sessions = new Map<string, SessionState>();

function getSession(chatId: string): SessionState | null {
  const s = sessions.get(chatId);
  if (!s) return null;
  if (Date.now() - s.startedAt > SESSION_TIMEOUT_MS) {
    sessions.delete(chatId);
    return null;
  }
  return s;
}

function clearSession(chatId: string) {
  sessions.delete(chatId);
}

// ─── Parse simples sem IA ───────────────────────────────────────────
function simpleParse(text: string): Row {
  const t = text.toLowerCase().trim();

  if (/(quanto|saldo|total|resumo)/.test(t) && /(gastei|gasto|despesa|mes|semana)/.test(t)) {
    return { intent: "query" };
  }
  if (/^(saldo|resumo|total)$/i.test(t)) {
    return { intent: "query" };
  }

  const match = t.match(/(gastei|paguei|pago|comprei)\s+R?\$?\s*(\d+(?:[.,]\d+)?)\s*(?:de\s+|no\s+|na\s+|para\s+)?(.+)?/i);
  if (match) {
    const amount = parseFloat(match[2].replace(",", "."));
    return {
      intent: "add",
      type: "despesa",
      amount,
      description: match[3]?.trim() || "Despesa",
      category: null,
      is_paid: true,
    };
  }

  const matchReceita = t.match(/(recebi|ganhei|recebido)\s+R?\$?\s*(\d+(?:[.,]\d+)?)\s*(?:de\s+|do\s+|da\s+)?(.+)?/i);
  if (matchReceita) {
    const amount = parseFloat(matchReceita[2].replace(",", "."));
    return {
      intent: "add",
      type: "receita",
      amount,
      description: matchReceita[3]?.trim() || "Receita",
      category: null,
      is_paid: true,
    };
  }

  return { intent: "help" };
}

// ─── Helpers do fluxo ───────────────────────────────────────────────

function buildCategoryList(cats: Array<{ id: string; name: string }>, type: string): Array<{ id: string; name: string }> {
  return cats.filter((c) => {
    if (c.parent_id) return false; // só categorias raiz
    if (type === "receita") return c.type === "receita" || c.type === "ambos";
    if (type === "despesa") return c.type === "despesa" || c.type === "ambos";
    return true;
  });
}

function buildSubcategoryList(cats: Array<{ id: string; name: string; parent_id: string | null }>, parentId: string): Array<{ id: string; name: string }> {
  return cats.filter((c) => c.parent_id === parentId);
}

function formatNumberedList(items: Array<{ name: string }>, emoji?: string): string {
  return items
    .map((item, i) => `${emoji ?? ""} ${i + 1} - ${item.name}`)
    .join("\n");
}

function parseSelection(text: string, items: Array<{ name: string }>): number | null {
  const num = parseInt(text.trim(), 10);
  if (num >= 1 && num <= items.length) return num - 1;

  const lower = text.toLowerCase().trim();
  const idx = items.findIndex((item) => item.name.toLowerCase() === lower);
  return idx >= 0 ? idx : null;
}

async function askForAccount(chatId: string, session: SessionState) {
  session.step = "account";
  if (session.accounts.length > 0) {
    const list = formatNumberedList(session.accounts, "🏦");
    await sendAndClean(chatId, session,
      `🏦 *Qual conta?*\n\n${list}\n\n_Envie o numero ou nome, ou *pular* para gravar sem conta._`
    );
    return true;
  }
  return false;
}

async function askForPaymentMethod(chatId: string, session: SessionState, paymentMethods: Array<{ id: string; name: string }>) {
  session.step = "payment_method";
  if (paymentMethods.length > 0) {
    session.paymentMethods = paymentMethods;
    const list = formatNumberedList(paymentMethods, "💳");
    await sendAndClean(chatId, session,
      `💳 *Forma de pagamento:*\n\n${list}\n\n_Envie o numero ou nome._`
    );
    return true;
  }
  return false;
}

async function sendAndClean(chatId: string, session: SessionState, text: string): Promise<void> {
  // Deletar mensagem anterior do bot
  if (session.lastBotMessageId) {
    await deleteTelegramMessage(chatId, session.lastBotMessageId);
    session.lastBotMessageId = null;
  }
  // Enviar nova mensagem e salvar o ID
  const msgId = await sendTelegramMessage(chatId, text);
  if (msgId) {
    session.lastBotMessageId = msgId;
  }
}

// ─── Rotas ──────────────────────────────────────────────────────────

export const Route = createFileRoute("/api/public/hooks/telegram")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json() as Row;
        const message = body?.message;
        if (!message || !message.text || !message.from) {
          return new Response("OK", { status: 200 });
        }

        const chatId = String(message.chat.id);
        const text = String(message.text ?? "").trim();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const sb = supabaseAdmin as Row;

        // ── /start ──────────────────────────────────────────────
        if (text === "/start") {
          clearSession(chatId);
          const { data: existing } = await (sb.from("telegram_accounts") as Row)
            .select("id, user_id, verified")
            .eq("chat_id", chatId)
            .eq("verified", true)
            .maybeSingle();

          if (existing) {
            await sendTelegramMessage(chatId, "👋 *Bem-vindo de volta ao Gestor Financeiro!*\n\n" + HELP);
          } else {
            await sendTelegramMessage(chatId, "👋 *Bem-vindo ao Gestor Financeiro!*\n\nPara começar, vincule sua conta:\n1. Acesse as Configuracoes > Telegram no aplicativo\n2. Gere um codigo\n3. Envie o codigo aqui\n\n" + HELP);
          }
          return new Response("OK", { status: 200 });
        }

        // ── Comandos auxiliares ─────────────────────────────────
        if (/^(ajuda|help|oi|ola|menu)$/i.test(text)) {
          clearSession(chatId);
          await sendTelegramMessage(chatId, HELP);
          return new Response("OK", { status: 200 });
        }

        // ── Cancelar fluxo ─────────────────────────────────────
        if (/^(cancelar|cancel|voltar|sair)$/i.test(text)) {
          if (getSession(chatId)) {
            const session = getSession(chatId);
            if (session) {
              await sendAndClean(chatId, session, "❌ Fluxo cancelado.");
            }
            clearSession(chatId);
          }
          return new Response("OK", { status: 200 });
        }

        // ── Vinculação por código ───────────────────────────────
        if (/^[A-Z0-9]{6}$/i.test(text)) {
          const { data: account } = await (sb.from("telegram_accounts") as Row)
            .select("id, user_id")
            .eq("link_code", text.toUpperCase())
            .eq("verified", false)
            .maybeSingle();

          if (account) {
            await (sb.from("telegram_accounts") as Row)
              .update({ verified: true, chat_id: chatId, link_code: null })
              .eq("id", account.id);
            await sendTelegramMessage(chatId, "✅ *Conta vinculada com sucesso!*\n\nAgora voce pode registrar gastos e receitas por mensagem.\n\n" + HELP);
          } else {
            await sendTelegramMessage(chatId, "❌ Codigo invalido ou ja utilizado.\n\nGere um novo codigo nas Configuracoes > Telegram do aplicativo.");
          }
          return new Response("OK", { status: 200 });
        }

        // ── Verificar vinculação ────────────────────────────────
        const { data: linkedAccount } = await (sb.from("telegram_accounts") as Row)
          .select("id, user_id")
          .eq("chat_id", chatId)
          .eq("verified", true)
          .maybeSingle();

        if (!linkedAccount) {
          await sendTelegramMessage(chatId, "❌ Conta nao vinculada.\n\nEnvie /start para ver como vincular.");
          return new Response("OK", { status: 200 });
        }

        const USER_ID = linkedAccount.user_id;

        // ── Carregar dados do usuario ───────────────────────────
        const { data: cats } = await (sb.from("categories") as Row)
          .select("id, name, parent_id, type")
          .eq("user_id", USER_ID);
        const allCategories = (cats ?? []) as Array<{ id: string; name: string; parent_id: string | null; type: string }>;

        const { data: pms } = await (sb.from("payment_methods") as Row)
          .select("id, name")
          .eq("user_id", USER_ID);
        const paymentMethods = (pms ?? []) as Array<{ id: string; name: string }>;

        const { data: accs } = await (sb.from("accounts") as Row)
          .select("id, name")
          .eq("user_id", USER_ID)
          .eq("archived", false);
        const accounts = (accs ?? []) as Array<{ id: string; name: string }>;

        // ── Fluxo conversacional ativo ──────────────────────────
        const session = getSession(chatId);

        if (session) {
          // ── Passo: Categoria ──────────────────────────────────
          if (session.step === "category") {
            const idx = parseSelection(text, session.categories);
            if (idx === null) {
              await sendAndClean(chatId, session,
                `❌ Opcao invalida. Escolha um numero de 1 a ${session.categories.length} ou digite o nome.\n\nEnvie *cancelar* para sair.`
              );
              return new Response("OK", { status: 200 });
            }
            const selected = session.categories[idx];
            session.categoryId = selected.id;
            session.categoryName = selected.name;

            // Buscar subcategorias
            const subs = buildSubcategoryList(allCategories, selected.id);
            if (subs.length > 0) {
              session.step = "subcategory";
              session.subcategories = subs;
              const list = formatNumberedList(subs, "📁");
              await sendAndClean(chatId, session,
                `📂 *Subcategoria de ${selected.name}:*\n\n${list}\n\n_Envie o numero ou nome, ou *pular* para gravar sem subcategoria._`
              );
              return new Response("OK", { status: 200 });
            }

            // Sem subcategorias → ir para conta
            const hasAccount = await askForAccount(chatId, session);
            if (!hasAccount) {
              // Sem contas cadastradas → salvar direto
              await finalizeTransaction(chatId, sb, USER_ID, session);
              sessions.delete(chatId);
            }
            return new Response("OK", { status: 200 });
          }

          // ── Passo: Subcategoria ───────────────────────────────
          if (session.step === "subcategory") {
            if (/^(pular|skip|proxim[ao])$/i.test(text)) {
              session.categoryId = session.categoryId; // mantem
              const hasAccount = await askForAccount(chatId, session);
              if (!hasAccount) {
                await finalizeTransaction(chatId, sb, USER_ID, session);
                sessions.delete(chatId);
              }
              return new Response("OK", { status: 200 });
            }

            const idx = parseSelection(text, session.subcategories);
            if (idx === null) {
              await sendAndClean(chatId, session,
                `❌ Opcao invalida. Escolha um numero de 1 a ${session.subcategories.length} ou digite o nome.\n\nEnvie *pular* para sem subcategoria ou *cancelar* para sair.`
              );
              return new Response("OK", { status: 200 });
            }
            const selected = session.subcategories[idx];
            session.categoryId = selected.id;
            session.categoryName = selected.name;

            // Ir para conta
            const hasAccount = await askForAccount(chatId, session);
            if (!hasAccount) {
              await finalizeTransaction(chatId, sb, USER_ID, session);
              sessions.delete(chatId);
            }
            return new Response("OK", { status: 200 });
          }

          // ── Passo: Conta ─────────────────────────────────────
          if (session.step === "account") {
            if (/^(pular|skip|proxim[ao])$/i.test(text)) {
              session.accountId = null;
              session.accountName = null;
              const hasPayment = await askForPaymentMethod(chatId, session, paymentMethods);
              if (!hasPayment) {
                await finalizeTransaction(chatId, sb, USER_ID, session);
                sessions.delete(chatId);
              }
              return new Response("OK", { status: 200 });
            }

            const idx = parseSelection(text, session.accounts);
            if (idx === null) {
              await sendAndClean(chatId, session,
                `❌ Opcao invalida. Escolha um numero de 1 a ${session.accounts.length} ou digite o nome.\n\nEnvie *pular* para sem conta ou *cancelar* para sair.`
              );
              return new Response("OK", { status: 200 });
            }
            const selected = session.accounts[idx];
            session.accountId = selected.id;
            session.accountName = selected.name;

            // Ir para pagamento
            const hasPayment = await askForPaymentMethod(chatId, session, paymentMethods);
            if (!hasPayment) {
              await finalizeTransaction(chatId, sb, USER_ID, session);
              sessions.delete(chatId);
            }
            return new Response("OK", { status: 200 });
          }

          // ── Passo: Forma de pagamento ─────────────────────────
          if (session.step === "payment_method") {
            const idx = parseSelection(text, session.paymentMethods);
            if (idx === null) {
              await sendAndClean(chatId, session,
                `❌ Opcao invalida. Escolha um numero de 1 a ${session.paymentMethods.length} ou digite o nome.\n\nEnvie *cancelar* para sair.`
              );
              return new Response("OK", { status: 200 });
            }
            const selected = session.paymentMethods[idx];

            // Salvar transação com todos os dados
            const { error } = await (sb.from("transactions") as Row).insert({
              user_id: USER_ID,
              type: session.type,
              amount: session.amount,
              date: todayISO(),
              description: session.description,
              category_id: session.categoryId,
              account_id: session.accountId,
              payment_method_id: selected.id,
              is_paid: session.is_paid,
            });

            if (error) {
              console.error("insert transaction error", error);
              const errMsg = String(error?.message ?? error?.details ?? error?.hint ?? "").toLowerCase();
              if (errMsg.includes("mes_bloqueado") || errMsg.includes("bloqueado")) {
                await sendAndClean(chatId, session, "🔒 O mes esta bloqueado para alteracoes. Abra o app e destrave o mes para registrar lancamentos.");
              } else {
                await sendAndClean(chatId, session, "😕 Nao consegui salvar o lancamento. Tente novamente.");
              }
              sessions.delete(chatId);
              return new Response("OK", { status: 200 });
            }

            const emoji = session.type === "receita" ? "🟢" : "🔴";
            const label = session.type === "receita" ? "Receita" : "Despesa";
            const catTxt = session.categoryName ? `\n📂 ${session.categoryName}` : "";
            const accTxt = session.accountName ? `\n🏦 ${session.accountName}` : "";
            await sendAndClean(chatId, session,
              `${emoji} *${label} registrada!*\n\n💵 ${brl(session.amount)}\n📝 ${session.description ?? "Sem descricao"}${catTxt}${accTxt}\n💳 ${selected.name}`
            );
            sessions.delete(chatId);
            return new Response("OK", { status: 200 });
          }
        }

        // ── Parse da mensagem ───────────────────────────────────
        let parsed: Row;
        try {
          parsed = await parseMessage(text, allCategories);
        } catch (e) {
          console.error("parseMessage error", e);
          parsed = simpleParse(text);
        }

        console.log("parsed result:", JSON.stringify(parsed));

        // ── Consulta de saldo ───────────────────────────────────
        if (parsed.intent === "query") {
          const now = new Date();
          const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
          const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
          const { data: txs } = await (sb.from("transactions") as Row)
            .select("type, amount")
            .eq("user_id", USER_ID)
            .gte("date", start)
            .lte("date", end);
          let receitas = 0, despesas = 0, transferido = 0;
          for (const t of (txs ?? []) as Row[]) {
            if (t.type === "receita") receitas += Number(t.amount);
            else if (t.type === "transferencia") transferido += Number(t.amount);
            else despesas += Number(t.amount);
          }
          const transfLine = transferido > 0 ? `\n🔄 Transferido/Reservado: ${brl(transferido)}` : "";
          await sendTelegramMessage(chatId,
            `📊 *Resumo do mes*\n\n🟢 Receitas: ${brl(receitas)}\n🔴 Despesas: ${brl(despesas)}${transfLine}\n💰 Saldo: ${brl(receitas - despesas)}`
          );
          return new Response("OK", { status: 200 });
        }

        // ── Nova despesa/receita → iniciar fluxo conversacional ─
        if (parsed.intent === "add" && Number(parsed.amount) > 0) {
          const txType = parsed.type === "receita" ? "receita" : "despesa";
          const rootCats = buildCategoryList(allCategories, txType);

          if (rootCats.length === 0) {
            // Sem categorias cadastradas → salvar sem categoria
            const { error } = await (sb.from("transactions") as Row).insert({
              user_id: USER_ID,
              type: txType,
              amount: Number(parsed.amount),
              date: todayISO(),
              description: parsed.description ?? null,
              category_id: null,
              account_id: null,
              payment_method_id: null,
              is_paid: parsed.is_paid !== false,
            });
            if (error) {
              console.error("insert transaction error", error);
              await sendTelegramMessage(chatId, "😕 Nao consegui salvar o lancamento. Tente novamente.");
              return new Response("OK", { status: 200 });
            }
            const emoji = txType === "receita" ? "🟢" : "🔴";
            const label = txType === "receita" ? "Receita" : "Despesa";
            await sendTelegramMessage(chatId,
              `${emoji} *${label} registrada!*\n\n💵 ${brl(Number(parsed.amount))}\n📝 ${parsed.description ?? "Sem descricao"}\n\n💡 _Cadastre categorias no app para classificar seus lancamentos._`
            );
            return new Response("OK", { status: 200 });
          }

          // Criar sessão e iniciar fluxo
          const sessionState: SessionState = {
            step: "category",
            type: txType,
            amount: Number(parsed.amount),
            description: parsed.description ?? null,
            is_paid: parsed.is_paid !== false,
            categoryId: null,
            categoryName: null,
            accountId: null,
            accountName: null,
            categories: rootCats,
            subcategories: [],
            accounts: accounts,
            paymentMethods: paymentMethods,
            startedAt: Date.now(),
            lastBotMessageId: null,
          };
          sessions.set(chatId, sessionState);

          const emoji = txType === "receita" ? "🟢" : "🔴";
          const list = formatNumberedList(rootCats, "📂");
          await sendAndClean(chatId, sessionState,
            `${emoji} *${brl(Number(parsed.amount))}* - ${parsed.description ?? "Sem descricao"}\n\n📂 *Qual categoria?*\n\n${list}\n\n_Envie o numero ou nome da categoria._`
          );
          return new Response("OK", { status: 200 });
        }

        await sendTelegramMessage(chatId, HELP);
        return new Response("OK", { status: 200 });
      },
    },
  },
});

// ─── Finalizar transação (salvar no banco) ──────────────────────────

async function finalizeTransaction(
  chatId: string,
  sb: Row,
  userId: string,
  session: SessionState,
) {
  const { error } = await (sb.from("transactions") as Row).insert({
    user_id: userId,
    type: session.type,
    amount: session.amount,
    date: todayISO(),
    description: session.description,
    category_id: session.categoryId,
    account_id: session.accountId,
    payment_method_id: null,
    is_paid: session.is_paid,
  });

  if (error) {
    console.error("insert transaction error", error);
    const errMsg = String(error?.message ?? error?.details ?? error?.hint ?? "").toLowerCase();
    if (errMsg.includes("mes_bloqueado") || errMsg.includes("bloqueado")) {
      await sendAndClean(chatId, session, "🔒 O mes esta bloqueado para alteracoes. Abra o app e destrave o mes para registrar lancamentos.");
    } else {
      await sendAndClean(chatId, session, "😕 Nao consegui salvar o lancamento. Tente novamente.");
    }
    sessions.delete(chatId);
    return;
  }

  const emoji = session.type === "receita" ? "🟢" : "🔴";
  const label = session.type === "receita" ? "Receita" : "Despesa";
  const catTxt = session.categoryName ? `\n📂 ${session.categoryName}` : "";
  const accTxt = session.accountName ? `\n🏦 ${session.accountName}` : "";
  await sendAndClean(chatId, session,
    `${emoji} *${label} registrada!*\n\n💵 ${brl(session.amount)}\n📝 ${session.description ?? "Sem descricao"}${catTxt}${accTxt}\n\n💡 _Cadastre formas de pagamento no app para informar o pagamento._`
  );
  sessions.delete(chatId);
}
