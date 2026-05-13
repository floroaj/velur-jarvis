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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { History, Play, Plus, Trash2, Wrench } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export default function TasksPage() {
  const utils = trpc.useUtils();
  const list = trpc.jarvis.tasksList.useQuery();
  const upsert = trpc.jarvis.taskUpsert.useMutation({
    onSuccess: () => {
      toast.success("Task saved");
      utils.jarvis.tasksList.invalidate();
      setOpen(false);
    },
    onError: err => toast.error(err.message),
  });
  const del = trpc.jarvis.taskDelete.useMutation({
    onSuccess: () => {
      toast.success("Task deleted");
      utils.jarvis.tasksList.invalidate();
    },
  });
  const run = trpc.jarvis.taskRun.useMutation({
    onSuccess: data => {
      if (data.status === "success") toast.success(`Run succeeded (HTTP ${data.statusCode})`);
      else toast.error(`Run failed (${data.statusCode || "no response"})`);
      if (selectedRunsId) utils.jarvis.taskRuns.invalidate({ taskId: selectedRunsId });
    },
  });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState<Method>("POST");
  const [url, setUrl] = useState("");
  const [headersJson, setHeadersJson] = useState("");
  const [body, setBody] = useState("");

  const [selectedRunsId, setSelectedRunsId] = useState<number | null>(null);
  const runsQuery = trpc.jarvis.taskRuns.useQuery(
    { taskId: selectedRunsId ?? 0 },
    { enabled: selectedRunsId !== null },
  );

  const openCreate = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setMethod("POST");
    setUrl("");
    setHeadersJson("");
    setBody("");
    setOpen(true);
  };

  const openEdit = (id: number) => {
    const t = list.data?.find(x => x.id === id);
    if (!t) return;
    setEditingId(id);
    setName(t.name);
    setDescription(t.description ?? "");
    setMethod(t.method as Method);
    setUrl(t.url);
    setHeadersJson(t.headers ? JSON.stringify(t.headers, null, 2) : "");
    setBody(t.body ?? "");
    setOpen(true);
  };

  const save = () => {
    let parsedHeaders: Record<string, string> | null = null;
    if (headersJson.trim()) {
      try {
        const parsed = JSON.parse(headersJson) as Record<string, string>;
        parsedHeaders = parsed;
      } catch {
        toast.error("Headers must be valid JSON");
        return;
      }
    }
    upsert.mutate({
      id: editingId ?? undefined,
      name,
      description: description || null,
      method,
      url,
      headers: parsedHeaders,
      body: body || null,
    });
  };

  return (
    <JarvisLayout>
      <div className="container max-w-6xl mx-auto py-10 space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[10px] tracking-[0.4em] uppercase text-primary/80 font-display">
              Automation
            </div>
            <h1 className="font-display text-2xl glow-text-cyan flex items-center gap-3">
              <Wrench className="h-5 w-5" /> Tasks
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Pre-configured HTTP actions. Reference vault secrets with{" "}
              <code className="font-mono text-primary">{"{{vault:LABEL}}"}</code>.
            </p>
          </div>
          <Button onClick={openCreate} className="font-display tracking-[0.3em]">
            <Plus className="h-4 w-4 mr-2" /> New Task
          </Button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {list.data?.map(task => (
            <div key={task.id} className="hud-panel hud-corner p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-display tracking-[0.2em] text-primary">{task.name}</div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mt-1">
                    {task.method} · {task.url.length > 48 ? task.url.slice(0, 48) + "…" : task.url}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    onClick={() => run.mutate({ id: task.id, triggeredBy: "manual" })}
                    disabled={run.isPending}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedRunsId(task.id)}
                  >
                    <History className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(task.id)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => del.mutate({ id: task.id })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {task.description && (
                <div className="text-xs text-muted-foreground">{task.description}</div>
              )}
            </div>
          ))}
        </div>

        {selectedRunsId !== null && (
          <div className="hud-panel hud-corner p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] tracking-[0.4em] uppercase text-primary/80 font-display">
                Recent runs
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedRunsId(null)}>
                Close
              </Button>
            </div>
            <div className="space-y-2">
              {runsQuery.data?.length === 0 && (
                <div className="text-xs text-muted-foreground italic">No runs yet.</div>
              )}
              {runsQuery.data?.map(r => (
                <div key={r.id} className="flex gap-3 items-start text-xs font-mono">
                  <span
                    className={
                      r.status === "success" ? "text-primary" : "text-destructive"
                    }
                  >
                    {r.status.toUpperCase()}
                  </span>
                  <span className="text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>
                  <span className="text-muted-foreground">HTTP {r.statusCode ?? "n/a"}</span>
                  <span className="truncate flex-1">{r.responseSnippet}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="hud-panel max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display tracking-[0.25em] glow-text-cyan">
              {editingId ? "Edit Task" : "New Task"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Name">
              <Input value={name} onChange={e => setName(e.target.value)} />
            </Field>
            <Field label="Description">
              <Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} />
            </Field>
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <Field label="Method">
                <Select value={method} onValueChange={v => setMethod(v as Method)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["GET", "POST", "PUT", "PATCH", "DELETE"] as Method[]).map(m => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="URL">
                <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
              </Field>
            </div>
            <Field label="Headers (JSON)">
              <Textarea
                rows={4}
                value={headersJson}
                onChange={e => setHeadersJson(e.target.value)}
                placeholder='{"Authorization": "Bearer {{vault:TripleWhale_API}}"}'
              />
            </Field>
            <Field label="Body">
              <Textarea
                rows={4}
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder='{"shop": "velur.de"}'
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
