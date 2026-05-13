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
import { Eye, EyeOff, KeyRound, Plus, ShieldCheck, Trash2 } from "lucide-react";
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
      toast.success("Credential erased");
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
    setLabel("");
    setService("");
    setSecret("");
    setNotes("");
    setOpen(true);
  };
  const openEdit = (e: VaultEntry) => {
    setEditing(e);
    setLabel(e.label);
    setService(e.service);
    setSecret("");
    setNotes(e.notes ?? "");
    setOpen(true);
  };

  const save = () => {
    if (!secret && !editing) {
      toast.error("Secret value required");
      return;
    }
    upsert.mutate({
      id: editing?.id,
      label,
      service,
      secret: secret || "__keep__", // sentinel
      notes: notes || null,
    });
  };

  const toggleReveal = async (id: number) => {
    if (revealedMap[id]) {
      setRevealedMap(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    try {
      const result = await reveal.mutateAsync({ id });
      setRevealedMap(prev => ({ ...prev, [id]: result.secret }));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <JarvisLayout>
      <div className="container max-w-5xl mx-auto py-10 space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[10px] tracking-[0.4em] uppercase text-primary/80 font-display">
              Secure Vault
            </div>
            <h1 className="font-display text-2xl glow-text-cyan flex items-center gap-3">
              <ShieldCheck className="h-5 w-5" /> Credentials
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              AES-256-GCM encrypted at rest. Reference inside tasks via{" "}
              <code className="font-mono text-primary">{"{{vault:LABEL}}"}</code>.
            </p>
          </div>
          <Button onClick={openCreate} className="font-display tracking-[0.3em]">
            <Plus className="h-4 w-4 mr-2" /> Add Credential
          </Button>
        </div>

        <div className="hud-panel hud-corner divide-y divide-primary/15">
          {list.data?.length === 0 && (
            <div className="p-6 text-xs text-muted-foreground italic">No credentials stored.</div>
          )}
          {list.data?.map(entry => {
            const revealed = revealedMap[entry.id];
            return (
              <div key={entry.id} className="p-4 flex items-center gap-4">
                <KeyRound className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-3">
                    <div className="font-display tracking-[0.2em] text-primary">{entry.label}</div>
                    <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                      {entry.service}
                    </div>
                  </div>
                  <div className="font-mono text-xs mt-1 break-all">
                    {revealed ?? entry.preview}
                  </div>
                  {entry.notes && (
                    <div className="text-[11px] text-muted-foreground mt-1">{entry.notes}</div>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => toggleReveal(entry.id)}>
                  {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openEdit(entry as VaultEntry)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => del.mutate({ id: entry.id })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="hud-panel">
          <DialogHeader>
            <DialogTitle className="font-display tracking-[0.25em] glow-text-cyan">
              {editing ? "Edit Credential" : "New Credential"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Label (referenced as {{vault:LABEL}})">
              <Input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="TripleWhale_API"
              />
            </Field>
            <Field label="Service">
              <Input
                value={service}
                onChange={e => setService(e.target.value)}
                placeholder="triple-whale"
              />
            </Field>
            <Field label={editing ? "Secret (leave empty to keep current)" : "Secret value"}>
              <Input
                value={secret}
                onChange={e => setSecret(e.target.value)}
                type="password"
                autoComplete="off"
              />
            </Field>
            <Field label="Notes (optional)">
              <Textarea
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Read-only key for analytics dashboards"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={upsert.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </JarvisLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-[10px] tracking-[0.4em] uppercase text-primary/70 font-display">
        {label}
      </span>
      {children}
    </label>
  );
}
