# Use a Local Runtime Bridge for the OpenAI Codex Subscription Provider

Open Nexus v1 needs OpenAI/Codex subscription authentication rather than a required OpenAI Platform API key. We will implement the first provider as an `openai-codex` **Subscription Provider** behind the **Brain Server**, using a local authenticated runtime bridge where possible instead of implementing OAuth/token handling directly in Open Nexus. This keeps the MVP focused on the assistant architecture while still supporting subscription-backed usage, and leaves direct auth implementation as a later, deliberate decision.

**Considered Options**

- Use an OpenAI Platform API key: simpler and CI-friendly, but does not satisfy the v1 subscription-auth requirement.
- Implement OpenAI/Codex OAuth directly: more control, but too much auth risk and protocol churn for the first milestone.
- Use a local authenticated runtime bridge: satisfies the v1 requirement while containing the risk behind a provider adapter.
