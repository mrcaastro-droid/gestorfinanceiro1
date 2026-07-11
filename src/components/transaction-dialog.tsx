import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { insertRows, useList, type TransactionRow, type CategoryRow, type AccountRow, type CardRow } from "@/lib/finance";
import { todayISO } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, TrendingUp, TrendingDown, ArrowLeftRight } from "lucide-react";

const NONE = "__none__";

type MovType = "receita" | "despesa" | "transferencia";

export function TransactionDialog({
  open,
  onOpenChange,
  type,
  editing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  type: MovType;
  editing?: TransactionRow | null;
}) {
  const qc = useQueryClient();
  const { data: categories } = useList<CategoryRow>("categories");
  const { data: accounts } = useList<AccountRow>("accounts");
  const { data: cards } = useList<CardRow>("cards");
  const { data: methods } = useList<{ id: string; name: string }>("payment_methods");
  const { data: people } = useList<{ id: string; name: string }>("people");

  const [busy, setBusy] = useState(false);
  const [movType, setMovType] = useState<MovType>(type);
  const [catParent, setCatParent] = useState<string>(NONE);
  const [catChild, setCatChild] = useState<string>(NONE);
  const [form, setForm] = useState({
    amount: "",
    date: todayISO(),
    description: "",
    notes: "",
    category_id: NONE,
    account_id: NONE,
    transfer_account_id: NONE,
    card_id: NONE,
    payment_method_id: NONE,
    person_id: NONE,
    is_paid: true,
    installments: 1,
  });

  useEffect(() => {
    if (open) {
      if (editing) {
        setMovType(editing.type);
        const cat = editing.category_id ? (categories ?? []).find((c) => c.id === editing.category_id) : null;
        if (cat?.parent_id) {
          setCatParent(cat.parent_id);
          setCatChild(cat.id);
        } else {
          setCatParent(editing.category_id ?? NONE);
          setCatChild(NONE);
        }
        setForm({
          amount: String(editing.amount),
          date: editing.date,
          description: editing.description ?? "",
          notes: editing.notes ?? "",
          category_id: editing.category_id ?? NONE,
          account_id: editing.account_id ?? NONE,
          transfer_account_id: editing.transfer_account_id ?? NONE,
          card_id: editing.card_id ?? NONE,
          payment_method_id: editing.payment_method_id ?? NONE,
          person_id: editing.person_id ?? NONE,
          is_paid: editing.is_paid,
          installments: 1,
        });
      } else {
        setMovType(type);
        setCatParent(NONE);
        setCatChild(NONE);
        setForm((f) => ({ ...f, amount: "", description: "", notes: "", date: todayISO(), installments: 1, transfer_account_id: NONE }));
      }
    }
  }, [open, editing, type, categories]);

  const isTransfer = movType === "transferencia";
  const catsRaw = (categories ?? []).filter((c) =>
    isTransfer ? c.type === "transferencia" : c.type === movType || c.type === "ambos",
  );
  const parentCats = catsRaw.filter((c) => !c.parent_id).map((c) => ({ id: c.id, name: c.name }));
  const childCats = catsRaw.filter((c) => c.parent_id === catParent).map((c) => ({ id: c.id, name: c.name }));

  function selectParent(v: string) {
    setCatParent(v);
    setCatChild(NONE);
  }
  function selectType(v: MovType) {
    setMovType(v);
    setCatParent(NONE);
    setCatChild(NONE);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(form.amount.replace(",", "."));
    if (!amount || amount <= 0) return toast.error("Informe um valor válido.");
    if (isTransfer) {
      if (form.account_id === NONE) return toast.error("Selecione a conta de origem.");
      if (form.transfer_account_id === NONE) return toast.error("Selecione a conta de destino.");
      if (form.account_id === form.transfer_account_id) return toast.error("Escolha contas diferentes.");
    }
    setBusy(true);
    try {
      const base = {
        type: movType,
        description: form.description || null,
        notes: form.notes || null,
        category_id: catChild !== NONE ? catChild : catParent === NONE ? null : catParent,
        account_id: form.account_id === NONE ? null : form.account_id,
        transfer_account_id: isTransfer ? (form.transfer_account_id === NONE ? null : form.transfer_account_id) : null,
        card_id: isTransfer ? null : form.card_id === NONE ? null : form.card_id,
        payment_method_id: isTransfer ? null : form.payment_method_id === NONE ? null : form.payment_method_id,
        person_id: isTransfer ? null : form.person_id === NONE ? null : form.person_id,
        is_paid: form.is_paid,
      };

      if (editing) {
        const { error } = await supabase.from("transactions").update({ ...base, amount, date: form.date }).eq("id", editing.id);
        if (error) throw error;
      } else if (movType === "despesa" && form.installments > 1) {
        const group = crypto.randomUUID();
        const per = Math.round((amount / form.installments) * 100) / 100;
        const rows = Array.from({ length: form.installments }).map((_, i) => {
          const d = new Date(form.date + "T00:00:00");
          d.setMonth(d.getMonth() + i);
          return {
            ...base,
            amount: per,
            date: d.toISOString().slice(0, 10),
            is_paid: i === 0 ? form.is_paid : false,
            installment_group: group,
            installment_number: i + 1,
            installment_total: form.installments,
            description: `${form.description || "Despesa"} (${i + 1}/${form.installments})`,
          };
        });
        await insertRows("transactions", rows);
      } else {
        const { error } = await supabase.from("transactions").insert({ ...base, amount, date: form.date });
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(editing ? "Lançamento atualizado" : "Lançamento adicionado");
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const label = movType === "receita" ? "Receita" : movType === "despesa" ? "Despesa" : "Transferência";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar ${label.toLowerCase()}` : `Nova ${label.toLowerCase()}`}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {([
              { v: "receita", label: "Receita", icon: TrendingUp },
              { v: "despesa", label: "Despesa", icon: TrendingDown },
              { v: "transferencia", label: "Transferência", icon: ArrowLeftRight },
            ] as const).map((opt) => {
              const active = movType === opt.v;
              return (
                <button
                  type="button"
                  key={opt.v}
                  onClick={() => setMovType(opt.v)}
                  className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors ${
                    active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <opt.icon className="size-4" />
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$)">
              <Input inputMode="decimal" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" />
            </Field>
            <Field label="Data">
              <Input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
          </div>
          <Field label="Descrição">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={`Descrição da ${label.toLowerCase()}`} />
          </Field>
          {isTransfer ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Conta de origem">
                  <Picker value={form.account_id} onChange={(v) => setForm({ ...form, account_id: v })} items={accounts ?? []} placeholder="Selecione" />
                </Field>
                <Field label="Conta de destino">
                  <Picker value={form.transfer_account_id} onChange={(v) => setForm({ ...form, transfer_account_id: v })} items={accounts ?? []} placeholder="Selecione" />
                </Field>
              </div>
              <Field label="Categoria (reserva/investimento)">
                <Picker value={form.category_id} onChange={(v) => setForm({ ...form, category_id: v })} items={cats} placeholder="Selecione" />
              </Field>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Categoria">
                  <Picker value={form.category_id} onChange={(v) => setForm({ ...form, category_id: v })} items={cats} placeholder="Selecione" />
                </Field>
                <Field label="Conta">
                  <Picker value={form.account_id} onChange={(v) => setForm({ ...form, account_id: v })} items={accounts ?? []} placeholder="Selecione" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={movType === "receita" ? "Forma de recebimento" : "Forma de pagamento"}>
                  <Picker value={form.payment_method_id} onChange={(v) => setForm({ ...form, payment_method_id: v })} items={methods ?? []} placeholder="Selecione" />
                </Field>
                <Field label="Pessoa (opcional)">
                  <Picker value={form.person_id} onChange={(v) => setForm({ ...form, person_id: v })} items={people ?? []} placeholder="Selecione" />
                </Field>
              </div>
            </>
          )}
          {movType === "despesa" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cartão (opcional)">
                <Picker value={form.card_id} onChange={(v) => setForm({ ...form, card_id: v })} items={cards ?? []} placeholder="Selecione" />
              </Field>
              {!editing && (
                <Field label="Parcelas">
                  <Input type="number" min={1} max={60} value={form.installments} onChange={(e) => setForm({ ...form, installments: Math.max(1, Number(e.target.value)) })} />
                </Field>
              )}
            </div>
          )}
          <Field label="Observação">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Notas adicionais" />
          </Field>
          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-medium">{movType === "receita" ? "Recebido" : movType === "transferencia" ? "Efetivada" : "Pago"}</p>
              <p className="text-xs text-muted-foreground">Afeta o saldo da conta quando marcado</p>
            </div>
            <Switch checked={form.is_paid} onCheckedChange={(v) => setForm({ ...form, is_paid: v })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Picker({
  value,
  onChange,
  items,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  items: Array<{ id: string; name: string }>;
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Nenhum</SelectItem>
        {items.map((it) => (
          <SelectItem key={it.id} value={it.id}>
            {it.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}