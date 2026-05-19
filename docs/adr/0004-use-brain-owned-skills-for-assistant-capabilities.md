# Use Brain-Owned Skills for Assistant Capabilities

Open Nexus needs installable assistant capabilities that can inspect local context, perform external actions, and participate in a **Prompt Exchange** without depending on the active **Device Surface**. We will model these capabilities as **Skills** owned by the **Brain Server**, discovered and invoked through a **Skill Host**, and considered by the **Assistant Orchestrator** using metadata from each **Skill Manifest**. This keeps AI reasoning, capability selection, action parameterization, configuration, and safety enforcement centralized in the Brain Server rather than spreading assistant behavior across Device UI presentation code or Device Surface Plugins.

The first Skill Host may run Skills in the Brain Server process for a smaller v1 implementation. The host boundary must still treat Skills as installed packages with explicit manifests, separate **Skill Configuration**, typed actions, and structured **Skill Action Results** so that a later implementation can move execution into an isolated process or external runtime without changing the Prompt Exchange contract.

**Considered Options**

- Build Home Assistant and similar integrations as Device Surface Plugins, which would couple assistant capabilities to presentation and make them unavailable when a different Device Surface is active.
- Let each Skill own its own AI reasoning, which is flexible but duplicates provider access, weakens safety policy enforcement, and makes Prompt Exchange behavior harder to explain.
- Start with an in-process Skill Host behind an explicit boundary, which keeps the first implementation small while preserving a path to isolated Skill runtimes.
