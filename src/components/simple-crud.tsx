import { useState, type ReactNode } from "react";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useList, useUpsert, useRemove, type TableName } from "@/lib/finance";
import { Plus, Pencil, Trash2, type LucideIcon } from "lucide-react";

export interface CrudField {
  name: string;
  label: string;
  type?: "text" | "number" | "color" | "date" | "select";
  options?: Array<{ value: string; label: string }>;
  optionsFrom?: TableName;
  optional?: boolean;
  default?: string | number;
}

type Row = Record<string, unknown>;

export function SimpleCrud({
  table,
  title,
  description,
  singular,
  icon,
  fields,
  renderItem,
  embedded,
}: {
  table: TableName;
  title: string;
  description?: string;
  singular: string;
  icon: LucideIcon;
  fields: CrudField[];
  renderItem?: (row: Row) => ReactNode;
  embedded?: boolean;
}) {
  const { data, isLoading } = useList<Row>(table);
  const upsert = useUpsert(table);
  const remove = useRemove(table);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Row>({});

  function startNew() {
    const init: Row = {};
    fields.forEach((f) => (init[f.name] = f.default ?? (f.type === "color" ? "#10b981" : "")));
    setForm(init);
    setOpen(true);
  }
  function startEdit(row: Row) {
    setForm({ ...row });
    setOpen(true);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Row = { id: form.id };
    fields.forEach((f) => {
      let v = form[f.name];
      if (f.type === "number") v = v === "" || v == null ? 0 : Number(v);
      if ((v === "" || v == null) && f.optional) v = null;
      payload[f.name] = v;
    });
    upsert.mutate(payload, { onSuccess: () => setOpen(false) });
  }

  const Wrapper = embedded ? EmbeddedWrapper : PageContainer;

  return (
    <Wrapper>
      {embedded ? (
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold">{title}</h2>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          <Button size="sm" onClick={startNew}><Plus className="size-4" /> Adicionar</Button>
        </div>
      ) : (
        <PageHeader title={title} description={description} actions={<Button onClick={startNew}><Plus className="size-4" /> Novo</Button>} />
      )}

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
        ) : (data ?? []).length === 0 ? (
          <EmptyState icon={icon} title={`Nenhum registro`} description={`Adicione seu primeiro ${singular.toLowerCase()}.`} action={<Button onClick={startNew}><Plus className="size-4" /> Adicionar</Button>} />
        ) : (
          <div className="divide-y divide-border">
            {(data ?? []).map((row) => (
              <div key={String(row.id)} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {"color" in row && (
                    <span className="size-4 rounded-full shrink-0" style={{ backgroundColor: String(row.color) }} />
                  )}
                  <div className="min-w-0">
                    {renderItem ? renderItem(row) : <p className="text-sm font-medium truncate">{String(row.name ?? "")}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => startEdit(row)}><Pencil className="size-4" /></Button>
                  <ConfirmDelete onConfirm={() => remove.mutate(String(row.id))}>
                    <Button variant="ghost" size="icon" className="size-8 text-destructive"><Trash2 className="size-4" /></Button>
                  </ConfirmDelete>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? `Editar ${singular.toLowerCase()}` : `Novo ${singular.toLowerCase()}`}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {fields.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{f.label}</Label>
                {f.type === "select" ? (
                  <CrudSelect field={f} value={String(form[f.name] ?? "")} onChange={(v) => setForm({ ...form, [f.name]: v })} />
                ) : f.type === "color" ? (
                  <div className="flex items-center gap-2">
                    <input type="color" value={String(form[f.name] ?? "#10b981")} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} className="size-10 rounded-lg border border-border bg-transparent" />
                    <Input value={String(form[f.name] ?? "")} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
                  </div>
                ) : (
                  <Input
                    type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                    step={f.type === "number" ? "any" : undefined}
                    required={!f.optional}
                    value={String(form[f.name] ?? "")}
                    onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                  />
                )}
              </div>
            ))}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Wrapper>
  );
}

function EmbeddedWrapper({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

function CrudSelect({ field, value, onChange }: { field: CrudField; value: string; onChange: (v: string) => void }) {
  const { data } = useList<{ id: string; name: string }>(field.optionsFrom ?? "categories");
  const options = field.options ?? (field.optionsFrom ? (data ?? []).map((d) => ({ value: d.id, label: d.name })) : []);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}