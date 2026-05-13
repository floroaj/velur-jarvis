import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const resolveApiUrl = () =>
  ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
    ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
    : "https://forge.manus.im/v1/chat/completions";

const assertApiKey = () => {
  if (!ENV.forgeApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

// ── Model & thinking budget ─────────────────────────────────────────────────────────────────────────
// IMPORTANT: The Manus Forge gateway (forge.manus.im) routes ALL model requests to gemini-2.5-flash
// regardless of the model name specified. Tested: claude-sonnet-4-5, claude-opus-4-5, gemini-2.5-pro,
// gemini-2.0-flash, gpt-4o — all return model: "gemini-2.5-flash" in the response.
// To use a real Claude model, a direct Anthropic API key (ANTHROPIC_API_KEY) would be needed.
// JARVIS_MODEL: override via env var. Default = gemini-2.5-flash (only model available via forge).
// JARVIS_THINKING_BUDGET: thinking budget_tokens. Default = 4096.
const JARVIS_MODEL = () => process.env.JARVIS_MODEL ?? "gemini-2.5-flash";
const JARVIS_THINKING_BUDGET = () => parseInt(process.env.JARVIS_THINKING_BUDGET ?? "4096", 10);

function buildPayload(
  messages: Message[],
  tools: Tool[] | undefined,
  toolChoice: ToolChoice | undefined,
  responseFormat: ResponseFormat | undefined,
  response_format: ResponseFormat | undefined,
  outputSchema: OutputSchema | undefined,
  output_schema: OutputSchema | undefined,
  stream: boolean,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: JARVIS_MODEL(),
    messages: messages.map(normalizeMessage),
    max_tokens: 32768,
    thinking: { budget_tokens: JARVIS_THINKING_BUDGET() },
  };
  if (stream) payload.stream = true;
  if (tools && tools.length > 0) payload.tools = tools;
  const normalizedToolChoice = normalizeToolChoice(toolChoice, tools);
  if (normalizedToolChoice) payload.tool_choice = normalizedToolChoice;
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat, response_format, outputSchema, output_schema,
  });
  if (normalizedResponseFormat) payload.response_format = normalizedResponseFormat;
  return payload;
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();
  const { messages, tools, toolChoice, tool_choice, outputSchema, output_schema, responseFormat, response_format } = params;
  const payload = buildPayload(messages, tools, toolChoice || tool_choice, responseFormat, response_format, outputSchema, output_schema, false);

  const response = await fetch(resolveApiUrl(), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ENV.forgeApiKey}` },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`);
  }

  return (await response.json()) as InvokeResult;
}

/**
 * Streaming LLM call. Yields token chunks as they arrive from the forge SSE stream.
 * Handles OpenAI-compatible SSE format: `data: {...}\n\n` lines.
 * Tool calls are accumulated and returned as a final synthetic chunk with finish_reason="tool_calls".
 */
export async function* invokeLLMStream(
  params: InvokeParams,
): AsyncGenerator<{ token?: string; toolCalls?: ToolCall[]; finishReason?: string }> {
  assertApiKey();
  const { messages, tools, toolChoice, tool_choice, outputSchema, output_schema, responseFormat, response_format } = params;
  const payload = buildPayload(messages, tools, toolChoice || tool_choice, responseFormat, response_format, outputSchema, output_schema, true);

  const response = await fetch(resolveApiUrl(), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ENV.forgeApiKey}` },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM stream failed: ${response.status} ${response.statusText} – ${errorText}`);
  }

  if (!response.body) throw new Error("LLM stream: no response body");

  // Accumulate partial tool call arguments across chunks
  const toolCallAccumulator: Map<number, { id: string; name: string; args: string }> = new Map();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // Keep incomplete last line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (!trimmed.startsWith("data: ")) continue;

        let chunk: {
          choices?: Array<{
            delta?: {
              content?: string;
              tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>;
            };
            finish_reason?: string | null;
          }>;
        };
        try {
          chunk = JSON.parse(trimmed.slice(6));
        } catch {
          continue; // Skip malformed chunks
        }

        const choice = chunk.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta;
        const finishReason = choice.finish_reason;

        // Accumulate tool call deltas
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const existing = toolCallAccumulator.get(tc.index) ?? { id: "", name: "", args: "" };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name += tc.function.name;
            if (tc.function?.arguments) existing.args += tc.function.arguments;
            toolCallAccumulator.set(tc.index, existing);
          }
        }

        // Yield text token
        if (delta?.content) {
          yield { token: delta.content };
        }

        // On finish, yield tool calls if any
        if (finishReason === "tool_calls" || (finishReason === "stop" && toolCallAccumulator.size > 0)) {
          const toolCalls: ToolCall[] = Array.from(toolCallAccumulator.entries())
            .sort(([a], [b]) => a - b)
            .map(([, tc]) => ({
              id: tc.id || `call_${Math.random().toString(36).slice(2)}`,
              type: "function" as const,
              function: { name: tc.name, arguments: tc.args },
            }));
          yield { toolCalls, finishReason };
          toolCallAccumulator.clear();
        } else if (finishReason === "stop") {
          yield { finishReason };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
