export interface ProviderPrompt {
  prompt: string;
}

export interface ProviderResponseChunk {
  delta: string;
}

export interface AiProvider {
  readonly name: string;
  complete(prompt: ProviderPrompt): AsyncGenerator<ProviderResponseChunk>;
}

export class AiProviderError extends Error {
  readonly providerName: string;
  readonly diagnostics: Record<string, unknown>;

  constructor(providerName: string, message: string, diagnostics: Record<string, unknown> = {}) {
    super(message);
    this.name = "AiProviderError";
    this.providerName = providerName;
    this.diagnostics = diagnostics;
  }
}
