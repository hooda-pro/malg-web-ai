import type { AgentEvent } from "./agentEvents";
import type { IncomingSkill } from "./skills";

export async function consumeSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  handlers: {
    onContent?: (text: string) => void;
    onReasoning?: (text: string) => void;
    onAgentEvent?: (event: AgentEvent) => void;
    /** السيرفر قفل المحادثة (الموديل أنهاها بعد تحذير) */
    /** رصيد التوكنز خلص في نص الرد والسيرفر وقفه */
    onQuotaExhausted?: () => void;
    onSessionEnded?: (info: { reason?: string; by?: "abuse" | "user" }) => void;
    /** السيرفر ثبّت مهارة جديدة (install_skill) — بنحفظها في مكتبة المستخدم المحلية */
    onSkillSaved?: (skills: IncomingSkill[]) => void;
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
        if (json?.skill_saved) {
          const skills = (json.skill_saved as { skills?: IncomingSkill[] }).skills;
          if (Array.isArray(skills) && skills.length > 0) handlers.onSkillSaved?.(skills);
          continue;
        }
        if (json?.quota_exhausted) {
          handlers.onQuotaExhausted?.();
          continue;
        }
        if (json?.session_ended) {
          handlers.onSessionEnded?.(json.session_ended as { reason?: string; by?: "abuse" | "user" });
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
