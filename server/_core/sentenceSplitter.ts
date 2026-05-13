/**
 * Sentence boundary detection for streaming TTS.
 * Accumulates tokens and yields complete sentences while handling
 * common abbreviations (z.B., Dr., Mr., etc.) to avoid false splits.
 */

// Common abbreviations that should NOT trigger a sentence split
const ABBREVIATIONS = new Set([
  // German
  "z.b", "z.b.", "d.h", "d.h.", "u.a", "u.a.", "usw", "usw.", "bzw", "bzw.",
  "ca", "ca.", "ggf", "ggf.", "inkl", "inkl.", "exkl", "exkl.", "evtl", "evtl.",
  "ggü", "ggü.", "mfg", "mfg.", "nr", "nr.", "str", "str.", "tel", "tel.",
  "vs", "vs.", "vgl", "vgl.", "o.ä", "o.ä.", "s.o", "s.o.", "s.u", "s.u.",
  "m.e", "m.e.", "u.u", "u.u.", "i.d.r", "i.d.r.",
  // English
  "dr", "dr.", "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "prof", "prof.",
  "sr", "sr.", "jr", "jr.", "st", "st.", "ave", "ave.", "blvd", "blvd.",
  "etc", "etc.", "vs", "vs.", "approx", "approx.", "dept", "dept.",
  "est", "est.", "fig", "fig.", "govt", "govt.", "inc", "inc.", "ltd", "ltd.",
  "max", "max.", "min", "min.", "no", "no.", "vol", "vol.",
  // Numbers / ordinals
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
]);

// Sentence-ending punctuation followed by whitespace or end of string
const SENTENCE_END_RE = /([.!?…]+)\s+/g;

export class SentenceAccumulator {
  private buffer = "";
  private sentences: string[] = [];

  /** Feed a new token chunk. Returns any newly completed sentences. */
  push(token: string): string[] {
    this.buffer += token;
    return this.flush(false);
  }

  /** Flush remaining buffer as a final sentence (call at stream end). */
  finalize(): string[] {
    const remaining = this.buffer.trim();
    this.buffer = "";
    if (remaining.length > 0) return [remaining];
    return [];
  }

  private flush(force: boolean): string[] {
    const results: string[] = [];
    let match: RegExpExecArray | null;
    SENTENCE_END_RE.lastIndex = 0;

    while ((match = SENTENCE_END_RE.exec(this.buffer)) !== null) {
      const endIdx = match.index + match[0].length;
      const candidate = this.buffer.slice(0, endIdx).trim();

      // Check if the word before the period is an abbreviation
      const wordBeforeMatch = candidate.split(/\s+/).pop()?.toLowerCase().replace(/[!?…]+$/, "") ?? "";
      if (ABBREVIATIONS.has(wordBeforeMatch)) {
        // Not a real sentence end — continue accumulating
        continue;
      }

      // Minimum sentence length guard (avoid splitting on e.g. "OK." alone)
      if (candidate.length < 4 && !force) continue;

      results.push(candidate);
      this.buffer = this.buffer.slice(endIdx);
      SENTENCE_END_RE.lastIndex = 0; // Reset after modifying buffer
    }

    return results;
  }
}
