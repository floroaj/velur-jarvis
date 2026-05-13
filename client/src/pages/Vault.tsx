import { JarvisLayout } from "@/components/JarvisLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Eye, EyeOff, KeyRound, Plus, Shield, Trash2, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type VaultEntry = {
  id: number;
  label: string;
  service: string;
  notes: string | null;
  preview: string;
  createdAt: Date;
  updatedAt: Date;
};

export default function VaultPage() {
  const utils = trpc.useUtils();
  const list = trpc.jarvis.vaultList.useQuery();
  const upsert = trpc.jarvis.vaultUpsert.useMutation({
    onSuccess: () => {
      toast.success("Credential stored");
      utils.jarvis.vaultList.invalidate();
      setOpen(false);
      setEditing(null);
    },
    onError: err => toast.error(err.message),
  });
  const reveal = trpc.jarvis.vaultReveal.useMutation();
  const del = trpc.jarvis.vaultDelete.useMutation({
    onSuccess: () => {
      toast.success("Credential deleted");
      utils.jarvis.vaultList.invalidate();
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VaultEntry | null>(null);
  const [label, setLabel] = useState("");
  const [service, setService] = useState("");
  const [secret, setSecret] = useState("");
  const [notes, setNotes] = useState("");
  const [revealedMap, setRevealedMap] = useState<Record<number, string>>({});

  const openCreate = () => {
    setEditing(null);
    setLabel(""); setService(""); setSecret(""); setNotes("");
    setOpen(true);
  };
  const openEdit = (e: VaultEntry) => {
    setEditing(e);
    setLabel(e.label); setService(e.service); setSecret(""); setNotes(e.notes ?? "");
    setOpen(true);
  };
  const save = () => {
    if (!secret && !editing) { toast.error("Secret value required"); return; }
    upsert.mutate({ id: editing?.id, label, service, secret: secret || "__keep__", notes: notes || null });
  };
  const toggleReveal = async (id: number) => {
    if (revealedMap[id]) {
      setRevealedMap(prev => { const n = { ...prev }; delete n[id]; return n; });
      return;
    }
    try {
      const result = await reveal.mutateAsync({ id });
      setRevealedMap(prev => ({ ...prev, [id]: result.secret }));
    } catch (err) { toast.error((err as Error).message); }
  };

  return (
    <JarvisLayout>
      <div className="max-w-3xl mx-auto px-8 py-10 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Shield size={15} className="text-[#00d4ff]/60" />
              <h1 className="text-sm font-semibold text-white/80">API Vault</h1>
            </div>
            <p className="text-xs text-white/30 leading-relaxed">
              AES-256-GCM encrypted. Reference in tasks via{" "}
              <code className="font-mono text-[#00d4ff]/60 bg-[#00d4ff]/[0.08] px-1.5 py-0.5 rounded text-[11px]">
                {"{{vault:LABEL}}"}
              </code>
            </p>
          </div>
          <Button
            onClick={openCreate}
            size="sm"
            className="bg-white/[0.07] hover:bg-white/[0.12] text-white/70 border border-white/[0.08] hover:border-white/[0.15] text-xs font-medium h-8"
          >
            <Plus size={13} className="mr-1.5" />
            Add Credential
          </Button>
        </div>

        {/* List */}
        <div className="rounded-2xl border border-white/[0.07] overflow-hidden divide-y divide-white/[0.05]">
          {!list.data?.length && (
            <div className="px-6 py-10 text-center text-xs text-white/20">
              No credentials stored yet
            </div>
          )}
          {list.data?.map(entry => {
            const revealed = revealedMap[entry.id];
            return (
              <div key={entry.id} className="px-5 py-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors">
                <div className="w-8 h-8 rounded-xl bg-[#00d4ff]/[0.08] flex items-center justify-center shrink-0">
                  <KeyRound size={13} className="text-[#00d4ff]/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-white/80">{entry.label}</span>
                    {entry.service && (
                      <span className="text-[10px] text-white/25 bg-white/[0.05] px-2 py-0.5 rounded-full">
                        {entry.service}
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[11px] text-white/35 mt-0.5 truncate">
                    {revealed ?? entry.preview}
                  </div>
                  {entry.notes && (
                    <div className="text-[11px] text-white/25 mt-0.5">{entry.notes}</div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleReveal(entry.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
                  >
                    {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <button
                    onClick={() => openEdit(entry as VaultEntry)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => del.mutate({ id: entry.id })}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white/20 hover:text-red-400/70 hover:bg-red-400/[0.08] transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#0a0a0f] border border-white/[0.08] rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-white/80">
              {editing ? "Edit Credential" : "New Credential"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Label">
              <Input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="TripleWhale_API"
                className="bg-white/[0.04] border-white/[0.08] text-white/80 text-sm h-9 rounded-xl"
              />
            </Field>
            <Field label="Service">
              <Input
                value={service}
                onChange={e => setService(e.target.value)}
                placeholder="triple-whale"
                className="bg-white/[0.04] border-white/[0.08] text-white/80 text-sm h-9 rounded-xl"
              />
            </Field>
            <Field label={editing ? "Secret (leave empty to keep current)" : "Secret value"}>
              <Input
                value={secret}
                onChange={e => setSecret(e.target.value)}
                type="password"
                autoComplete="off"
                className="bg-white/[0.04] border-white/[0.08] text-white/80 text-sm h-9 rounded-xl"
              />
            </Field>
            <Field label="Notes (optional)">
              <Textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Read-only analytics key"
                className="bg-white/[0.04] border-white/[0.08] text-white/80 text-sm rounded-xl resize-none"
              />
            </Field>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="text-white/40 hover:text-white/70 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={save}
              disabled={upsert.isPending}
              className="bg-[#00d4ff]/15 hover:bg-[#00d4ff]/25 text-[#00d4ff] border border-[#00d4ff]/20 text-xs h-8 rounded-xl"
            >
              {upsert.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </JarvisLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] text-white/35 font-medium">{label}</span>
      {children}
    </label>
  );
}
