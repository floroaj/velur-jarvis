import { JarvisLayout } from "@/components/JarvisLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Brain, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type ExtraBlock = { title: string; content: string };

export default function BusinessContextPage() {
  const utils = trpc.useUtils();
  const ctx = trpc.jarvis.getContext.useQuery();
  const update = trpc.jarvis.updateContext.useMutation({
    onSuccess: () => {
      toast.success("Business context saved");
      utils.jarvis.getContext.invalidate();
    },
  });

  const [brandName, setBrandName] = useState("Velur");
  const [mission, setMission] = useState("");
  const [voiceTone, setVoiceTone] = useState("");
  const [productSummary, setProductSummary] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [extras, setExtras] = useState<ExtraBlock[]>([]);

  useEffect(() => {
    if (!ctx.data) return;
    setBrandName(ctx.data.brandName ?? "Velur");
    setMission(ctx.data.mission ?? "");
    setVoiceTone(ctx.data.voiceTone ?? "");
    setProductSummary(ctx.data.productSummary ?? "");
    setCustomInstructions(ctx.data.customInstructions ?? "");
    setExtras((ctx.data.extraBlocks as ExtraBlock[] | null) ?? []);
  }, [ctx.data?.id]);

  const save = () => {
    update.mutate({
      brandName,
      mission: mission || null,
      voiceTone: voiceTone || null,
      productSummary: productSummary || null,
      customInstructions: customInstructions || null,
      extraBlocks: extras.length > 0 ? extras : null,
    });
  };

  const inputCls = "bg-white/[0.04] border-white/[0.07] text-white/80 text-sm rounded-xl placeholder:text-white/20 focus:border-[#00d4ff]/30 focus:ring-0";

  return (
    <JarvisLayout>
      <div className="max-w-3xl mx-auto px-8 py-10 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Brain size={15} className="text-[#00d4ff]/60" />
              <h1 className="text-sm font-semibold text-white/80">Business Context</h1>
            </div>
            <p className="text-xs text-white/30 leading-relaxed max-w-md">
              This data is injected into Jarvis' system prompt on every conversation, giving him full context about Velur.
            </p>
          </div>
          <Button
            onClick={save}
            disabled={update.isPending}
            size="sm"
            className="bg-[#00d4ff]/15 hover:bg-[#00d4ff]/25 text-[#00d4ff] border border-[#00d4ff]/20 text-xs h-8 rounded-xl"
          >
            <Save size={12} className="mr-1.5" />
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </div>

        {/* Core fields */}
        <div className="rounded-2xl border border-white/[0.07] p-6 space-y-5">
          <SectionLabel>Brand Identity</SectionLabel>
          <Field label="Brand Name">
            <Input
              value={brandName}
              onChange={e => setBrandName(e.target.value)}
              className={inputCls}
              placeholder="Velur"
            />
          </Field>
          <Field label="Mission">
            <Textarea
              rows={3}
              value={mission}
              onChange={e => setMission(e.target.value)}
              className={`${inputCls} resize-none`}
              placeholder="Die führende Verlobungsring-Marke in Deutschland mit einzigartigen Designs…"
            />
          </Field>
          <Field label="Voice & Tone">
            <Textarea
              rows={2}
              value={voiceTone}
              onChange={e => setVoiceTone(e.target.value)}
              className={`${inputCls} resize-none`}
              placeholder="Premium, emotional, minimalistisch, auf Augenhöhe mit dem Kunden…"
            />
          </Field>
        </div>

        <div className="rounded-2xl border border-white/[0.07] p-6 space-y-5">
          <SectionLabel>Products & Instructions</SectionLabel>
          <Field label="Product / Catalog Summary">
            <Textarea
              rows={4}
              value={productSummary}
              onChange={e => setProductSummary(e.target.value)}
              className={`${inputCls} resize-none`}
              placeholder="Verlobungsringe in verschiedenen Metallen und Steinen, Preisrange €500–€5000…"
            />
          </Field>
          <Field label="Custom Instructions for Jarvis">
            <Textarea
              rows={5}
              value={customInstructions}
              onChange={e => setCustomInstructions(e.target.value)}
              className={`${inputCls} resize-none`}
              placeholder="Antworte immer auf Deutsch. Priorisiere ROAS und CAC bei Performance-Fragen. Wenn ich nach Kampagnen frage, zeige immer Triple Whale Daten…"
            />
          </Field>
        </div>

        {/* Extra memory blocks */}
        <div className="rounded-2xl border border-white/[0.07] p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <SectionLabel>Extra Memory Blocks</SectionLabel>
              <p className="text-[11px] text-white/25 mt-0.5">
                Add campaign briefs, launch plans, hero products, or any additional context.
              </p>
            </div>
            <button
              onClick={() => setExtras(prev => [...prev, { title: "New block", content: "" }])}
              className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/70 transition-colors"
            >
              <Plus size={12} />
              Add block
            </button>
          </div>

          {extras.length === 0 && (
            <div className="text-center py-4 text-xs text-white/15">No extra blocks yet</div>
          )}

          {extras.map((block, i) => (
            <div key={i} className="rounded-xl border border-white/[0.06] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  value={block.title}
                  onChange={e =>
                    setExtras(prev => prev.map((b, idx) => idx === i ? { ...b, title: e.target.value } : b))
                  }
                  className={`${inputCls} h-8 text-xs`}
                  placeholder="Block title"
                />
                <button
                  onClick={() => setExtras(prev => prev.filter((_, idx) => idx !== i))}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white/20 hover:text-red-400/70 hover:bg-red-400/[0.08] transition-colors shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <Textarea
                rows={4}
                value={block.content}
                onChange={e =>
                  setExtras(prev => prev.map((b, idx) => idx === i ? { ...b, content: e.target.value } : b))
                }
                className={`${inputCls} resize-none`}
                placeholder="Content of this memory block…"
              />
            </div>
          ))}
        </div>

        {/* Bottom save */}
        <div className="flex justify-end pb-4">
          <Button
            onClick={save}
            disabled={update.isPending}
            size="sm"
            className="bg-[#00d4ff]/15 hover:bg-[#00d4ff]/25 text-[#00d4ff] border border-[#00d4ff]/20 text-xs h-8 rounded-xl"
          >
            <Save size={12} className="mr-1.5" />
            {update.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>
    </JarvisLayout>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-white/35 tracking-widest uppercase">{children}</p>
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
