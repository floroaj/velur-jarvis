import { JarvisLayout } from "@/components/JarvisLayout";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ChevronRight, MessageSquare, Trash2 } from "lucide-react";
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
      toast.success("Session deleted");
      setSelected(null);
      utils.jarvis.listConversations.invalidate();
    },
  });

  const fmt = (d: Date | string) =>
    new Date(d).toLocaleString("de-DE", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <JarvisLayout>
      <div className="flex h-full min-h-0">
        {/* Sidebar */}
        <aside className="w-72 shrink-0 border-r border-white/[0.06] flex flex-col">
          <div className="px-6 py-5 border-b border-white/[0.06]">
            <h1 className="text-xs font-semibold text-white/50 tracking-widest uppercase">
              Transcripts
            </h1>
            <p className="text-[11px] text-white/25 mt-1">
              {list.data?.length ?? 0} sessions
            </p>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {list.isLoading && (
              <div className="px-6 py-8 text-center text-white/20 text-xs">Loading…</div>
            )}
            {!list.isLoading && !list.data?.length && (
              <div className="px-6 py-8 text-center text-white/20 text-xs">
                No sessions yet
              </div>
            )}
            {list.data?.map(c => (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className={`w-full text-left px-5 py-3 flex items-start gap-3 transition-colors group ${
                  selected === c.id
                    ? "bg-white/[0.06]"
                    : "hover:bg-white/[0.03]"
                }`}
              >
                <MessageSquare
                  size={13}
                  className={`mt-0.5 shrink-0 transition-colors ${
                    selected === c.id ? "text-[#00d4ff]/70" : "text-white/20 group-hover:text-white/40"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-white/75 truncate leading-snug">{c.title || "Untitled"}</p>
                  <p className="text-[10px] text-white/25 mt-0.5">{fmt(c.updatedAt)}</p>
                </div>
                {selected === c.id && (
                  <ChevronRight size={11} className="shrink-0 text-[#00d4ff]/50 mt-1" />
                )}
              </button>
            ))}
          </div>
        </aside>

        {/* Detail panel */}
        <main className="flex-1 min-w-0 flex flex-col">
          {selected === null ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-3">
                <MessageSquare size={28} className="mx-auto text-white/[0.08]" />
                <p className="text-xs text-white/20">Select a session to view transcript</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-8 py-4 border-b border-white/[0.06] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-medium text-white/80">
                    {detail.data?.conversation.title || "Session"}
                  </h2>
                  {detail.data?.conversation.createdAt && (
                    <p className="text-[11px] text-white/25 mt-0.5">
                      {fmt(detail.data.conversation.createdAt)}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/25 hover:text-red-400/80 hover:bg-red-400/[0.08] h-8 w-8 p-0"
                  onClick={() => del.mutate({ id: selected })}
                >
                  <Trash2 size={13} />
                </Button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
                {detail.data?.messages.map(m => (
                  <div
                    key={m.id}
                    className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}
                  >
                    {/* Avatar dot */}
                    <div
                      className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold mt-0.5 ${
                        m.role === "user"
                          ? "bg-white/[0.08] text-white/50"
                          : m.role === "assistant"
                          ? "bg-[#00d4ff]/10 text-[#00d4ff]/80"
                          : "bg-white/[0.04] text-white/20"
                      }`}
                    >
                      {m.role === "user" ? "F" : m.role === "assistant" ? "J" : "S"}
                    </div>

                    {/* Bubble */}
                    <div
                      className={`max-w-[68%] flex flex-col gap-1 ${
                        m.role === "user" ? "items-end" : "items-start"
                      }`}
                    >
                      <div
                        className={`rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                          m.role === "user"
                            ? "bg-white/[0.07] text-white/75 rounded-tr-sm"
                            : m.role === "assistant"
                            ? "bg-[#00d4ff]/[0.07] text-white/80 rounded-tl-sm border border-[#00d4ff]/[0.12]"
                            : "bg-white/[0.03] text-white/30 text-xs italic"
                        }`}
                      >
                        {m.content}
                      </div>
                      <span className="text-[10px] text-white/15 px-1">
                        {fmt(m.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </JarvisLayout>
  );
}
