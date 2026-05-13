import { ENV } from "./env";
import { storagePut } from "../storage";

export type TtsOptions = {
  text: string;
  voice?: string; // OpenAI-compatible voice id
  format?: "mp3" | "wav" | "opus" | "aac" | "flac";
};

export type TtsResult = {
  url: string;
  key: string;
};

/**
 * Generate speech audio from text via the built-in Forge proxy
 * (OpenAI-compatible /v1/audio/speech endpoint) and stash it in storage.
 */
export async function generateSpeech(options: TtsOptions): Promise<TtsResult> {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    throw new Error("Voice service is not configured");
  }
  const voice = options.voice ?? "onyx";
  const format = options.format ?? "mp3";

  const baseUrl = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`;
  const url = new URL("v1/audio/speech", baseUrl).toString();

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`,
    },
    body: JSON.stringify({
      model: "tts-1",
      voice,
      input: options.text,
      response_format: format,
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`TTS request failed (${resp.status}): ${detail}`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  const mime = format === "wav" ? "audio/wav" : format === "opus" ? "audio/ogg" : "audio/mpeg";
  const stored = await storagePut(`jarvis-tts/speech.${format}`, buffer, mime);
  return stored;
}
