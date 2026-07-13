import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpsert, useList, type CategoryRow, type AccountRow } from "@/lib/finance";
import { todayISO } from "@/lib/format";
import { toast } from "sonner";
import { Loader2, TrendingUp, TrendingDown } from "lucide-react";

const NONE = "__none__";

type MovType = "receita" | "despesa";

export interface RecurringRow {
  id: string;
  type: MovType;
  name: string;
  amount: number;
  category_id: string | null;
  account_id: string | null;
  frequency: string;
  day_of_month: number;
  next_run: string;
  active: boolean;
}

const FREQ_OPTIONS = [
  { value: "semanal", label: "Semanal" },
  { value: "mensal", label: "Mensal" },
  { value: "bimestral", label: "Bimestral" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
];

export function RecurringDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing?: RecurringRow | null;
}) {
  const upsert = useUpsert("recurring_rules");
  const { data: categories } = useList<CategoryRow>("categories");
  const { data: accounts } = useList<AccountRow>("accounts");

  const [movType, setMovType] = useState<MovType>("despesa");
  const [catParent, setCatParent] = useState(NONE);
  const [catChild, setCatChild] = useState(NONE);
  const [form, setForm] = useState({
    name: "",
    amount: "",
    account_id: NONE,
    frequency: "mensal",
    day_of_month: 1,
    next_run: todayISO(),
    active: true,
  });

  useEffect(() => {
    if (!open) return;
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
        name: editing.name,
        amount: String(editing.amount),
        account_id: editing.account_id ?? NONE,
        frequency: editing.frequency,
        day_of_month: editing.day_of_month,
        next_run: editing.next_run,
        active: editing.active,
      });
    } else {
      setMovType("despesa");
      setCatParent(NONE);
      setCatChild(NONE);
      setForm({ name: "", amount: "", account_id: NONE, frequency: "mensal", day_of_month: 1, next_run: todayISO(), active: true });
    }
  }, [open, editing, categories]);

  const catsRaw = (categories ?? []).filter((c) => c.type === movType || c.type === "ambos");
  const parentCats = catsRaw.filter((c) => !c.parent_id);
  const childCats = catsRaw.filter((c) => c.parent_id === catParent);

  function selectType(v: MovType) {
    setMovType(v);
    setCatParent(NONE);
    setCatChild(NONE);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(form.amount.replace(",", "."));
    if (!form.name.trim()) return toast.error("Informe um nome.");
    if (!amount || amount <= 0) return toast.error("Informe um valor válido.");
    const payload = {
      id: editing?.id,
      type: movType,
      name: form.name.trim(),
      amount,
      category_id: catChild !== NONE ? catChild : catParent === NONE ? null : catParent,
      account_id: form.account_id === NONE ? null : form.account_id,
      frequency: form.frequency,
      day_of_month: Number(form.day_of_month) || 1,
      next_run: form.next_run,
      active: form.active,
    };
    upsert.mutate(payload, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar recorrência" : "Nova recorrência"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {([
              { v: "receita", label: "Receita", icon: TrendingUp },
              { v: "despesa", label: "Despesa", icon: TrendingDown },
            ] as const).map((opt) => {
              const active = movType === opt.v;
              return (
                <button
                  type="button"
                  key={opt.v}
                  onClick={() => selectType(opt.v)}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-2 py-2.5 text-sm font-medium transition-colors ${
                    active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <opt.icon className="size-4" />
                  {opt.label}
                </button>
              );
            })}
          </div>
          <Field label="Nome">
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Aluguel, Salário..." />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$)">
              <Input inputMode="decimal" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" />
            </Field>
            <Field label="A partir de">
              <Input type="date" required value={form.next_run} onChange={(e) => setForm({ ...form, next_run: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoria">
              <Picker value={catParent} onChange={(v) => { setCatParent(v); setCatChild(NONE); }} items={parentCats} placeholder="Selecione" />
            </Field>
            <Field label="Conta">
              <Picker value={form.account_id} onChange={(v) => setForm({ ...form, account_id: v })} items={accounts ?? []} placeholder="Selecione" />
            </Field>
          </div>
          {childCats.length > 0 && (
            <Field label="Subcategoria">
              <Picker value={catChild} onChange={setCatChild} items={childCats} placeholder="Selecione (opcional)" />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Frequência">
              <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FREQ_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Dia do vencimento">
              <Input type="number" min={1} max={31} value={form.day_of_month} onChange={(e) => setForm({ ...form, day_of_month: Math.max(1, Math.min(31, Number(e.target.value))) })} />
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-medium">Ativa</p>
              <p className="text-xs text-muted-foreground">Gera lançamentos automaticamente</p>
            </div>
            <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending && <Loader2 className="size-4 animate-spin" />} Salvar
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
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Nenhum</SelectItem>
        {items.map((it) => <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}