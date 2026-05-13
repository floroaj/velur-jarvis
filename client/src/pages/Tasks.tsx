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
import { CheckCircle2, ChevronDown, ChevronUp, History, Pencil, Play, Plus, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const METHOD_COLORS: Record<Method, string> = {
  GET: "text-emerald-400/70",
  POST: "text-[#00d4ff]/70",
  PUT: "text-amber-400/70",
  PATCH: "text-purple-400/70",
  DELETE: "text-red-400/70",
};

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
    setName(""); setDescription(""); setMethod("POST"); setUrl(""); setHeadersJson(""); setBody("");
    setOpen(true);
  };
  const openEdit = (id: number) => {
    const t = list.data?.find(x => x.id === id);
    if (!t) return;
    setEditingId(id);
    setName(t.name); setDescription(t.description ?? ""); setMethod(t.method as Method);
    setUrl(t.url); setHeadersJson(t.headers ? JSON.stringify(t.headers, null, 2) : ""); setBody(t.body ?? "");
    setOpen(true);
  };
  const save = () => {
    let parsedHeaders: Record<string, string> | null = null;
    if (headersJson.trim()) {
      try { parsedHeaders = JSON.parse(headersJson) as Record<string, string>; }
      catch { toast.error("Headers must be valid JSON"); return; }
    }
    upsert.mutate({ id: editingId ?? undefined, name, description: description || null, method, url, headers: parsedHeaders, body: body || null });
  };

  const inputCls = "bg-white/[0.04] border-white/[0.07] text-white/80 text-sm rounded-xl placeholder:text-white/20 focus:border-[#00d4ff]/30";

  return (
    <JarvisLayout>
      <div className="max-w-4xl mx-auto px-8 py-10 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-[#00d4ff]/60" />
              <h1 className="text-sm font-semibold text-white/80">Automation Tasks</h1>
            </div>
            <p className="text-xs text-white/30 leading-relaxed">
              Pre-configured HTTP actions. Reference vault secrets via{" "}
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
            New Task
          </Button>
        </div>

        {/* Task list */}
        <div className="space-y-3">
          {!list.data?.length && (
            <div className="rounded-2xl border border-white/[0.06] px-6 py-10 text-center text-xs text-white/20">
              No tasks configured yet
            </div>
          )}
          {list.data?.map(task => (
            <div key={task.id} className="rounded-2xl border border-white/[0.07] overflow-hidden">
              <div className="px-5 py-4 flex items-center gap-4">
                <div className="w-8 h-8 rounded-xl bg-[#00d4ff]/[0.07] flex items-center justify-center shrink-0">
                  <Zap size={13} className="text-[#00d4ff]/50" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-white/80">{task.name}</p>
                  <p className="text-[11px] text-white/25 mt-0.5 truncate">
                    <span className={`font-mono font-semibold ${METHOD_COLORS[task.method as Method] ?? "text-white/40"}`}>
                      {task.method}
                    </span>
                    {" "}
                    {task.url.length > 55 ? task.url.slice(0, 55) + "…" : task.url}
                  </p>
                  {task.description && (
                    <p className="text-[11px] text-white/20 mt-0.5">{task.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => run.mutate({ id: task.id, triggeredBy: "manual" })}
                    disabled={run.isPending}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#00d4ff]/50 hover:text-[#00d4ff] hover:bg-[#00d4ff]/[0.1] transition-colors disabled:opacity-40"
                    title="Run now"
                  >
                    <Play size={12} />
                  </button>
                  <button
                    onClick={() => setSelectedRunsId(selectedRunsId === task.id ? null : task.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
                    title="Run history"
                  >
                    {selectedRunsId === task.id ? <ChevronUp size={12} /> : <History size={12} />}
                  </button>
                  <button
                    onClick={() => openEdit(task.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => del.mutate({ id: task.id })}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white/20 hover:text-red-400/70 hover:bg-red-400/[0.08] transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Run history */}
              {selectedRunsId === task.id && (
                <div className="border-t border-white/[0.05] px-5 py-3 space-y-2">
                  <p className="text-[10px] text-white/25 tracking-widest uppercase mb-2">Recent runs</p>
                  {!runsQuery.data?.length && (
                    <p className="text-xs text-white/15 italic">No runs yet</p>
                  )}
                  {runsQuery.data?.map(r => (
                    <div key={r.id} className="flex items-start gap-3 text-[11px]">
                      <CheckCircle2
                        size={11}
                        className={`mt-0.5 shrink-0 ${r.status === "success" ? "text-emerald-400/70" : "text-red-400/70"}`}
                      />
                      <span className="text-white/30 shrink-0">
                        {new Date(r.createdAt).toLocaleString("de-DE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="text-white/20 shrink-0">HTTP {r.statusCode ?? "n/a"}</span>
                      <span className="text-white/25 truncate font-mono">{r.responseSnippet}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#0a0a0f] border border-white/[0.08] rounded-2xl max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-white/80">
              {editingId ? "Edit Task" : "New Task"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Name">
              <Input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="Send weekly report" />
            </Field>
            <Field label="Description (optional)">
              <Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} className={`${inputCls} resize-none`} />
            </Field>
            <div className="grid grid-cols-[110px_1fr] gap-3">
              <Field label="Method">
                <Select value={method} onValueChange={v => setMethod(v as Method)}>
                  <SelectTrigger className={`${inputCls} h-9`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f0f1a] border-white/[0.08]">
                    {(["GET", "POST", "PUT", "PATCH", "DELETE"] as Method[]).map(m => (
                      <SelectItem key={m} value={m} className="text-white/70 text-xs focus:bg-white/[0.06]">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="URL">
                <Input value={url} onChange={e => setUrl(e.target.value)} className={inputCls} placeholder="https://api.example.com/endpoint" />
              </Field>
            </div>
            <Field label='Headers (JSON) — use {{vault:LABEL}} for secrets'>
              <Textarea
                rows={3}
                value={headersJson}
                onChange={e => setHeadersJson(e.target.value)}
                className={`${inputCls} resize-none font-mono text-xs`}
                placeholder='{"Authorization": "Bearer {{vault:TripleWhale_API}}"}'
              />
            </Field>
            <Field label="Body (optional)">
              <Textarea
                rows={3}
                value={body}
                onChange={e => setBody(e.target.value)}
                className={`${inputCls} resize-none font-mono text-xs`}
                placeholder='{"shop": "velur.de"}'
              />
            </Field>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="text-white/40 hover:text-white/70 text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={save}
              disabled={upsert.isPending}
              className="bg-[#00d4ff]/15 hover:bg-[#00d4ff]/25 text-[#00d4ff] border border-[#00d4ff]/20 text-xs h-8 rounded-xl"
            >
              {upsert.isPending ? "Saving…" : "Save Task"}
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
