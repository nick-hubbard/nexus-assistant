import type { AiProvider, ProviderPrompt, ProviderResponseChunk } from "./provider.js";

export class FakeAiProvider implements AiProvider {
  readonly name = "fake";

  async *complete({ prompt }: ProviderPrompt): AsyncGenerator<ProviderResponseChunk> {
    const response = `Fake provider response: ${prompt}`;

    for (const delta of ["Fake provider response: ", prompt]) {
      yield { delta };
    }

    return response;
  }
}
