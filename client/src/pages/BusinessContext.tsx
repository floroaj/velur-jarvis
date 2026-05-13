import { JarvisLayout } from "@/components/JarvisLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type ExtraBlock = { title: string; content: string };

export default function BusinessContextPage() {
  const utils = trpc.useUtils();
  const ctx = trpc.jarvis.getContext.useQuery();
  const update = trpc.jarvis.updateContext.useMutation({
    onSuccess: () => {
      toast.success("Business core updated");
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

  return (
    <JarvisLayout>
      <div className="container max-w-4xl mx-auto py-10 space-y-6">
        <div>
          <div className="text-[10px] tracking-[0.4em] uppercase text-primary/80 font-display">
            Business Core
          </div>
          <h1 className="font-display text-2xl glow-text-cyan">Brand Memory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            This data is injected directly into Jarvis' system prompt on every conversation.
          </p>
        </div>

        <div className="hud-panel hud-corner p-5 space-y-4">
          <Field label="Brand Name">
            <Input value={brandName} onChange={e => setBrandName(e.target.value)} />
          </Field>
          <Field label="Mission">
            <Textarea rows={3} value={mission} onChange={e => setMission(e.target.value)} />
          </Field>
          <Field label="Voice & Tone">
            <Textarea rows={3} value={voiceTone} onChange={e => setVoiceTone(e.target.value)} />
          </Field>
          <Field label="Products / Catalog Summary">
            <Textarea
              rows={4}
              value={productSummary}
              onChange={e => setProductSummary(e.target.value)}
            />
          </Field>
          <Field label="Custom Instructions for Jarvis">
            <Textarea
              rows={6}
              value={customInstructions}
              onChange={e => setCustomInstructions(e.target.value)}
            />
          </Field>
        </div>

        <div className="hud-panel hud-corner p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] tracking-[0.4em] uppercase text-primary/80 font-display">
                Extra Memory Blocks
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Drop in additional knowledge such as launch plans, hero products, or campaign briefs.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setExtras(prev => [...prev, { title: "New block", content: "" }])}
            >
              <Plus className="h-4 w-4 mr-2" /> Block
            </Button>
          </div>

          {extras.map((block, i) => (
            <div key={i} className="border border-primary/20 rounded-md p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={block.title}
                  onChange={e =>
                    setExtras(prev =>
                      prev.map((b, idx) => (idx === i ? { ...b, title: e.target.value } : b)),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setExtras(prev => prev.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Textarea
                rows={4}
                value={block.content}
                onChange={e =>
                  setExtras(prev =>
                    prev.map((b, idx) => (idx === i ? { ...b, content: e.target.value } : b)),
                  )
                }
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={update.isPending} className="font-display tracking-[0.3em]">
            <Save className="h-4 w-4 mr-2" /> Commit Memory
          </Button>
        </div>
      </div>
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
