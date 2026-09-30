import type { AgentEvent } from "./agentEvents";

export async function consumeSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  handlers: {
    onContent?: (text: string) => void;
    onReasoning?: (text: string) => void;
    onAgentEvent?: (event: AgentEvent) => void;
    /** السيرفر قفل المحادثة (الموديل أنهاها بعد تحذير) */
    onSessionEnded?: (info: { reason?: string }) => void;
  }
) {
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith(":") || !line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const json = JSON.parse(data);
        if (json?.agent_event) {
          handlers.onAgentEvent?.(json.agent_event as AgentEvent);
          continue;
        }
        if (json?.session_ended) {
          handlers.onSessionEnded?.(json.session_ended as { reason?: string });
          continue;
        }
        const delta = json?.choices?.[0]?.delta;
        if (delta?.reasoning_content) handlers.onReasoning?.(delta.reasoning_content);
        if (delta?.content) handlers.onContent?.(delta.content);
      } catch {
        // سطر مش JSON صالح — تجاهله واستمر
      }
    }
  }
}
