import "server-only";
import { NoopAi, type AiProvider } from "./provider";
import { AnthropicAi } from "./anthropic";

let cached: AiProvider | undefined;
/** Anthropic when ANTHROPIC_API_KEY is set; otherwise a no-op so every feature still works deterministically. */
export function getAiProvider(): AiProvider {
  return (cached ??= process.env.ANTHROPIC_API_KEY ? new AnthropicAi() : new NoopAi());
}
