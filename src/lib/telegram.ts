type Row = Record<string, any>;

export function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN ausente");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: Number(chatId), text, parse_mode: "Markdown" }),
  });
  if (!res.ok) {
    console.error(`Telegram send failed [${res.status}]`);
    return null;
  }
  const data = await res.json();
  return data?.result?.message_id ?? null;
}

export async function deleteTelegramMessage(chatId: string, messageId: number): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: Number(chatId), message_id: messageId }),
  });
}

export async function editTelegramMessage(chatId: string, messageId: number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: Number(chatId), message_id: messageId, text, parse_mode: "Markdown" }),
  });
}

export const HELP =
  "🤖 *Gestor Financeiro*\n\nMe diga o que você gastou ou recebeu que eu registro pra você:\n\n" +
  "• _gastei 50 no mercado_\n• _paguei 120 de luz_\n• _recebi 3000 de salário_\n• _almoço 35 no cartão_\n\n" +
  "Você também pode perguntar:\n• _quanto gastei esse mês?_\n• _qual meu saldo?_";

export async function parseMessage(body: string, categories: Array<{ id: string; name: string }>) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY ausente");

  // Se nao tem categorias, retorna help
  if (!categories || categories.length === 0) {
    return { intent: "help" };
  }

  const catList = categories.map((c) => c.name).join(", ");
  const prompt =
    "Voce e um assistente financeiro brasileiro que interpreta mensagens. " +
    "Responda SEMPRE em JSON valido (sem markdown, sem acentos, puro JSON). Interprete valores em reais (R$). Hoje e " + todayISO() + ". " +
    `Categorias disponiveis do usuario: ${catList}. ` +
    "Campos do JSON: intent ('add' para registrar receita/despesa, 'query' para consultar totais, 'help' caso nao entenda), " +
    "type ('receita' ou 'despesa'), amount (numero), description (string curta), " +
    "category (escolha o nome MAIS parecido da lista de categorias, ou null), " +
    "is_paid (true se ja foi pago/recebido, senao false). " +
    "Ex.: 'gastei 50 no mercado' -> {intent:'add',type:'despesa',amount:50,description:'Mercado',category:'Alimentacao',is_paid:true}.";

  const model = "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: `${prompt}\n\nMensagem do usuario: ${body}` }],
      }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    console.error(`Gemini API error ${res.status}:`, t);
    throw new Error(`Gemini API ${res.status}`);
  }

  const json = await res.json();
  const content = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

  try {
    return JSON.parse(content);
  } catch (e) {
    console.error("JSON parse error:", content);
    return { intent: "help" };
  }
}
