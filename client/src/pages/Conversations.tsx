import { JarvisLayout } from "@/components/JarvisLayout";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { MessageSquare, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Conversations() {
  const utils = trpc.useUtils();
  const list = trpc.jarvis.listConversations.useQuery();
  const [selected, setSelected] = useState<number | null>(null);
  const detail = trpc.jarvis.getConversation.useQuery(
    { id: selected ?? 0 },
    { enabled: selected !== null },
  );
  const del = trpc.jarvis.deleteConversation.useMutation({
    onSuccess: () => {
      toast.success("Transcript erased");
      setSelected(null);
      utils.jarvis.listConversations.invalidate();
    },
  });

  return (
    <JarvisLayout>
      <div className="container max-w-6xl mx-auto py-10 grid md:grid-cols-[280px_1fr] gap-6">
        <aside className="hud-panel hud-corner p-4 max-h-[70vh] overflow-y-auto">
          <div className="text-[10px] tracking-[0.4em] uppercase text-primary/80 font-display mb-3">
            Transcripts
          </div>
          {list.data?.length === 0 && (
            <div className="text-xs text-muted-foreground italic">No sessions yet.</div>
          )}
          <div className="space-y-2">
            {list.data?.map(c => (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className={`w-full text-left p-3 rounded-md border transition-colors ${
                  selected === c.id
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-primary/15 hover:border-primary/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5 text-primary" />
                  <span className="font-mono text-xs truncate">{c.title}</span>
                </div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mt-1">
                  {new Date(c.updatedAt).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="hud-panel hud-corner p-5 min-h-[70vh]">
          {selected === null && (
            <div className="text-xs text-muted-foreground italic">
              Select a transcript to inspect.
            </div>
          )}
          {selected !== null && (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-[10px] tracking-[0.4em] uppercase text-primary/80 font-display">
                    Transcript
                  </div>
                  <h2 className="font-display text-lg glow-text-cyan mt-1">
                    {detail.data?.conversation.title}
                  </h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => del.mutate({ id: selected })}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Erase
                </Button>
              </div>
              <div className="space-y-4">
                {detail.data?.messages.map(m => (
                  <div
                    key={m.id}
                    className={`border-l-2 pl-3 ${
                      m.role === "user"
                        ? "border-accent"
                        : m.role === "assistant"
                          ? "border-primary"
                          : "border-muted-foreground"
                    }`}
                  >
                    <div
                      className={`text-[9px] tracking-[0.4em] uppercase mb-1 ${
                        m.role === "user"
                          ? "text-accent"
                          : m.role === "assistant"
                            ? "text-primary"
                            : "text-muted-foreground"
                      }`}
                    >
                      {m.role === "user" ? "Florian" : m.role === "assistant" ? "Jarvis" : "System"}
                      <span className="ml-3 text-muted-foreground normal-case tracking-normal">
                        {new Date(m.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="font-mono text-[13px] whitespace-pre-wrap">{m.content}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </JarvisLayout>
  );
}
