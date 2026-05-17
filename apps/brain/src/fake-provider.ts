export interface ProviderPrompt {
  prompt: string;
}

export interface ProviderResponseChunk {
  delta: string;
}

export class FakeAiProvider {
  async *complete({ prompt }: ProviderPrompt): AsyncGenerator<ProviderResponseChunk> {
    const response = `Fake provider response: ${prompt}`;

    for (const delta of ["Fake provider response: ", prompt]) {
      yield { delta };
    }

    return response;
  }
}
