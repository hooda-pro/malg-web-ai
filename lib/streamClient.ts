export async function consumeSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  handlers: { onContent?: (text: string) => void; onReasoning?: (text: string) => void }
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
        const delta = json?.choices?.[0]?.delta;
        if (delta?.reasoning_content) handlers.onReasoning?.(delta.reasoning_content);
        if (delta?.content) handlers.onContent?.(delta.content);
      } catch {
        // سطر مش JSON صالح — تجاهله واستمر
      }
    }
  }
}
