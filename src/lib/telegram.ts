type Row = Record<string, any>;

export function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export async function sendTelegramMessage(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN ausente");
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: Number(chatId), text, parse_mode: "Markdown" }),
  });
}

export const HELP =
  "🤖 *Gestor Financeiro*\n\nMe diga o que você gastou ou recebeu que eu registro pra você:\n\n" +
  "• _gastei 50 no mercado_\n• _paguei 120 de luz_\n• _recebi 3000 de salário_\n• _almoço 35 no cartão_\n\n" +
  "Você também pode perguntar:\n• _quanto gastei esse mês?_\n• _qual meu saldo?_";

export async function parseMessage(body: string, categories: Array<{ id: string; name: string }>) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY ausente");
  const catList = categories.map((c) => c.name).join(", ") || "(nenhuma)";
  const prompt =
    "Você é um assistente financeiro brasileiro que interpreta mensagens. " +
    "Responda SEMPRE em JSON válido (sem markdown, sem acentos, puro JSON). Interprete valores em reais (R$). Hoje é " + todayISO() + ". " +
    `Categorias disponíveis do usuário: ${catList}. ` +
    "Campos do JSON: intent ('add' para registrar receita/despesa, 'query' para consultar totais, 'help' caso não entenda), " +
    "type ('receita' ou 'despesa'), amount (número), description (string curta), " +
    "category (escolha o nome MAIS parecido da lista de categorias, ou null), " +
    "is_paid (true se já foi pago/recebido, senão false). " +
    "Ex.: 'gastei 50 no mercado' -> {intent:'add',type:'despesa',amount:50,description:'Mercado',category:'Alimentação',is_paid:true}.";

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: `${prompt}\n\nMensagem do usuário: ${body}` }],
      }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini API ${res.status}: ${t}`);
  }
  const json = await res.json();
  const content = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  try {
    return JSON.parse(content);
  } catch {
    return { intent: "help" };
  }
}
