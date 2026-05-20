# Open Nexus

Open Nexus is a local-first assistant system made of a central brain service and one or more touchscreen device clients.

## Language

**Device UI**:
The touchscreen-facing Nexus client that runs fullscreen on a local device and talks to the **Brain Server** over the local network.
_Avoid_: frontend, display app, client app

**Device Surface**:
The rendered touchscreen experience inside the **Device UI** that presents device state, prompts, responses, and standby visuals.
_Avoid_: theme, skin, frontend

**Device Surface Plugin**:
An installable **Device Surface** implementation that changes the **Device UI** presentation without owning runtime communication.
_Avoid_: Device UI plugin, Brain Server plugin, page template

**Skill**:
An installable assistant capability that the **Brain Server** can use during a **Prompt Exchange** to answer a request or perform an external action.
_Avoid_: Device Surface Plugin, hard-coded integration, app feature

**Home Assistant Skill**:
A **Skill** that lets the **Brain Server** communicate with Home Assistant to inspect or control home devices.
_Avoid_: Home Assistant plugin, Device UI plugin, surface integration

**Skill Host**:
The Brain-owned runtime boundary that discovers, loads, configures, and invokes installed **Skills**.
_Avoid_: plugin loader, Device Runtime, package manager

**Skill Registry**:
A configured source that maps installable **Skill** names to downloadable skill packages.
_Avoid_: app store, npm registry, hard-coded skill list

**Skill Manifest**:
A file inside a **Skill** package that declares its identity, entrypoint, capability metadata, configuration schema, and safety defaults.
_Avoid_: package.json, hidden convention, source-code registration

**Skill Configuration**:
Brain-owned local settings and secrets that make an installed **Skill** usable in one **Local Deployment**.
_Avoid_: Skill Manifest, package settings, Device UI preferences

**Assistant Orchestrator**:
The Brain-owned decision point that routes a **Prompt Exchange** between ordinary AI responses and installed **Skill** invocations.
_Avoid_: hard-coded skill router, Device UI logic, provider-only prompt handling

**Skill Safety Policy**:
Per-skill configuration that can require confirmation or disable selected actions before a **Skill** executes them.
_Avoid_: global prompt warning, hard-coded safety rule

**Skill Action Result**:
The structured outcome returned by a **Skill** after it attempts a typed action, optionally including the user-facing response text.
_Avoid_: raw API response, provider answer, device event

**Surface Host Contract**:
The boundary of state, actions, and capabilities that the **Device UI** exposes to a **Device Surface Plugin**.
_Avoid_: internal client access, plugin SDK, backend API

**Surface Settings**:
Per-device configuration for a **Device Surface Plugin** that the **Brain Server** stores and the **Device UI** passes through the **Surface Host Contract**.
_Avoid_: app config, global theme options, local preferences

**Active Device Surface**:
The **Device Surface** selected by the **Brain Server** for one **Device UI** to render.
_Avoid_: boot theme, temporary display mode, selected plugin

**Device Surface Acquisition**:
The process where a **Device UI** obtains a missing **Device Surface Plugin** authorized by the **Brain Server**.
_Avoid_: browser download, manual install, theme sync

**Brain Server**:
The local Nexus service that owns assistant orchestration, AI provider access, and device communication.
_Avoid_: backend, API, server

**Local Deployment**:
A Nexus installation where the **Brain Server** runs on a user-controlled machine on the local network.
_Avoid_: cloud deployment, hosted deployment

**Kiosk Deployment**:
A **Device UI** installation that automatically starts fullscreen when the device boots.
_Avoid_: manual browser launch, desktop app

**AI Provider**:
An external or local model service used by the **Brain Server** to generate assistant responses.
_Avoid_: LLM backend, model vendor

**Subscription Provider**:
An **AI Provider** authenticated through a user subscription login instead of a platform API key.
_Avoid_: free provider, no-key API

**Prompt Exchange**:
A user-initiated assistant request and the response events produced for it.
_Avoid_: chat call, message request

**Device Wake Phrase**:
A spoken phrase detected locally by the **Device UI** that makes the prompt composer available.
_Avoid_: hotphrase, Brain wake word, server wake command

**Voice Control**:
The full spoken interaction path where a **Device Wake Phrase** leads to speech capture, transcription, a **Prompt Exchange**, and a spoken or displayed response.
_Avoid_: wake phrase, text prompt, development shortcut

**Spoken Response**:
Audio playback of a **Prompt Exchange** response on the device that initiated or owns the spoken interaction.
_Avoid_: Brain Server speech, provider audio response, global announcement

**Device Runtime**:
A local companion process on the device that owns hardware-facing device capabilities for the **Device UI**.
_Avoid_: browser app, Brain Server plugin, provider service

**Development Wake Shortcut**:
A development-only keyboard shortcut that exercises **Device Wake Phrase** behavior without kiosk hardware.
_Avoid_: production hotkey, command-line wake flag, test-only bypass

**Brain File**:
A human-readable Markdown file that defines durable assistant identity, memory, or configuration.
_Avoid_: database config, hidden state

**Interaction Log**:
A structured record of requests, responses, errors, and runtime events produced by the **Brain Server**.
_Avoid_: memory, identity, config

**System Issue**:
A setup, configuration, connectivity, provider, or fatal runtime failure that affects Nexus operation.
_Avoid_: bad answer, assistant limitation, user-facing refusal

**Issue Reporter**:
A Brain-owned integration that delivers **System Issues** to an external notification destination.
_Avoid_: Discord client, alert hook

**UI Primitive**:
A reusable ShadCN-based component that is not specific to one Nexus app.
_Avoid_: shared widget, base component

**App UI Component**:
A UI component owned by a specific Nexus app but exported from the shared UI package for reuse.
_Avoid_: one-off component, local component

**Route Composition**:
Next.js app-level page, layout, and route wiring that assembles UI without defining reusable components.
_Avoid_: shared component

**Protected Branch**:
A branch that should not receive direct local commits or remote pushes.
_Avoid_: locked branch

**Merge Gate**:
The complete validation suite that must pass before code can enter a protected shared branch.
_Avoid_: smoke check, fast check

## Relationships

- A **Device UI** talks to exactly one **Brain Server** at a time.
- A **Brain Server** can serve one or more **Device UIs**.
- A **Device UI** renders exactly one active **Device Surface** at a time.
- A **Device Surface Plugin** provides a **Device Surface** and does not talk directly to the **Brain Server**.
- A **Device Surface Plugin** may fetch its own presentation data but can only use Nexus state and actions through the **Surface Host Contract**.
- A **Device Surface** must preserve the **Prompt Exchange** interaction loop by providing a way to enter prompts and display results.
- A **Skill** is installed into Nexus and loaded by the **Brain Server** without requiring changes to the core app codebase.
- A **Skill Registry** lets the Nexus CLI resolve names such as `home-assistant-skill` without hard-coding those names into the Brain Server.
- A **Skill Host** loads installed **Skills** from their **Skill Manifests**.
- A **Skill Manifest** must declare enough capability metadata for the **Assistant Orchestrator** to consider the Skill without executing Skill code.
- **Skill Configuration** is stored separately from the installed **Skill** package.
- A **Skill** can participate in a **Prompt Exchange** only through Brain-owned orchestration.
- The **Assistant Orchestrator** discovers what installed **Skills** can do from Skill-provided metadata rather than hard-coded skill-specific routing.
- **Skills** describe capabilities and execute typed actions; the **Brain Server** owns AI reasoning for selecting and parameterizing those actions.
- A **Skill Safety Policy** is enforced by the **Brain Server** before a **Skill** action executes.
- The **Home Assistant Skill** should execute actions without confirmation by default unless its **Skill Safety Policy** says otherwise.
- The first **Home Assistant Skill** should discover entities, read entity state, call common Home Assistant services, and resolve natural language using areas, friendly names, and entity IDs.
- A **Skill** returns a **Skill Action Result** to the **Brain Server**; the result can include response text for the **Prompt Exchange**.
- The first **Skill Host** can run **Skills** inside the **Brain Server** process while preserving a boundary that can later move Skills to a separate runtime.
- A **Home Assistant Skill** is a **Skill**, not a **Device Surface Plugin**.
- A **Device Surface Plugin** can define **Surface Settings** with defaults.
- The **Brain Server** stores **Surface Settings** per **Device UI** and active **Device Surface**.
- The **Brain Server** stores an **Active Device Surface** per **Device UI** so each device can change surfaces without a device power cycle.
- The first **Device Surface Plugin** can be repo-provided before Brain-managed surface switching exists.
- The **Brain Server** is the source of truth for which **Device Surface Plugins** are available and how a **Device UI** may acquire them.
- A **Device UI** performs **Device Surface Acquisition** when its **Active Device Surface** is missing locally.
- A **Device UI** automatically renders the current **Active Device Surface** when the **Brain Server** changes it.
- A **Device UI** falls back to a built-in **Device Surface** and reports a **System Issue** only when **Device Surface Acquisition** or surface loading fails.
- In the primary **Local Deployment**, the **Device UI** and **Brain Server** may run on separate machines.
- A **Kiosk Deployment** runs the **Device UI** without requiring manual browser startup after boot.
- A **Device Wake Phrase** is detected by a local **Device Runtime** and consumed by the **Device UI**, not the **Brain Server**.
- **Voice Control** is required for the Home Assistant experience but can follow the first text-based **Skill** invocation slice.
- A **Spoken Response** is produced from response text on the device side; the **Brain Server** does not perform device audio playback.
- A **Spoken Response** belongs to the **Device UI** or **Device Runtime** handling that **Prompt Exchange**, not to every connected device.
- A voice-started **Prompt Exchange** should always produce a **Spoken Response** when device audio is available.
- A text-started **Prompt Exchange** should produce a **Spoken Response** only when the **Device UI** is explicitly configured to do so for testing or accessibility.
- Device-level **Spoken Response** behavior supports three modes: voice-started exchanges only, all exchanges, or no exchanges.
- The **Device UI** decides whether a **Prompt Exchange** should produce a **Spoken Response** and asks the local **Device Runtime** to perform production audio playback.
- A new **Spoken Response** cancels any current **Spoken Response** on the same device.
- The **Device Runtime** sends local WebSocket events to the **Device UI** for device wake phrase detection.
- A device wake phrase detection event is named `device-wake-phrase.detected` and carries detection time plus phrase text.
- Local development must let a browser-served **Device UI** exercise wake phrase behavior with a **Development Wake Shortcut** enabled by environment configuration.
- The **Development Wake Shortcut** is Option+T.
- After wake phrase activation, the **Device UI** returns to standby after five idle seconds or five seconds after a **Prompt Exchange** completes or fails.
- Only the **Brain Server** calls **AI Providers** at runtime.
- The first **AI Provider** must be a **Subscription Provider** backed by OpenAI/Codex subscription authentication.
- A **Prompt Exchange** starts over HTTP and can continue over WebSocket events.
- **Brain Files** store durable assistant behavior and memory in Markdown where possible.
- **Interaction Logs** are structured persistence owned by the **Brain Server**.
- **System Issues** are reported to Discord and recorded in **Interaction Logs**.
- **Issue Reporters** are owned by the **Brain Server**.
- **UI Primitives** and **App UI Components** both live in the shared UI package.
- **App UI Components** are grouped by owning app inside the shared UI package.
- **Route Composition** belongs in the app that owns the route.
- `main` and `develop` are **Protected Branches**.
- A **Merge Gate** runs the full test suite, linting, and type validation before protected branch entry.

## Example dialogue

> **Dev:** "Should the **Device UI** call OpenAI directly?"
> **Domain expert:** "No. The **Device UI** only talks to the **Brain Server**; provider access belongs behind the **Brain Server**."

> **Dev:** "Can a **Device Surface Plugin** submit prompts to the **Brain Server** itself?"
> **Domain expert:** "No. The **Device UI** owns runtime communication and passes state and actions into the active **Device Surface**."

> **Dev:** "Can a **Device Surface Plugin** fetch weather or photo data for its own display?"
> **Domain expert:** "Yes, if it stays within its own presentation needs and uses the **Surface Host Contract** for Nexus-specific state and actions."

> **Dev:** "Should Home Assistant control be a **Device Surface Plugin**?"
> **Domain expert:** "No. Home Assistant control is a **Skill** loaded by the **Brain Server** during a **Prompt Exchange**; it should not depend on the active **Device Surface**."

> **Dev:** "Does the first **Home Assistant Skill** slice need full **Voice Control**?"
> **Domain expert:** "No. The first slice can use the existing text **Prompt Exchange**, but **Voice Control** is a near-term requirement for the intended experience."

> **Dev:** "Does installing a **Skill** mean editing the Brain Server source code?"
> **Domain expert:** "No. A **Skill** is discovered and invoked through the **Skill Host**, even if the first host runs skills in the Brain Server process."

> **Dev:** "Does `nexus install home-assistant-skill` mean the Brain Server already knows about Home Assistant?"
> **Domain expert:** "No. The Nexus CLI resolves the name through a **Skill Registry**, installs the package, and the **Skill Host** discovers it from its manifest."

> **Dev:** "How does the **Assistant Orchestrator** know what an installed **Skill** can do?"
> **Domain expert:** "It reads the **Skill Manifest** and uses declared capability metadata before invoking Skill code."

> **Dev:** "Does installing a **Skill** also configure credentials for it?"
> **Domain expert:** "No. Installation puts the package on disk; **Skill Configuration** stores local settings and secrets for one deployment."

> **Dev:** "Can a **Skill** bring its own model call to understand a request?"
> **Domain expert:** "Not in v1. A **Skill** describes capabilities and executes typed actions; the **Brain Server** uses the AI Provider for intent and parameter selection."

> **Dev:** "Should turning off lights through the **Home Assistant Skill** require confirmation?"
> **Domain expert:** "No. The **Home Assistant Skill** should execute without confirmation by default; confirmations are only added through **Skill Safety Policy** configuration."

> **Dev:** "Does Home Assistant have to provide the final assistant sentence?"
> **Domain expert:** "No. The **Home Assistant Skill** returns a **Skill Action Result** with optional response text; the **Brain Server** uses that in the **Prompt Exchange**."

> **Dev:** "Should the first **Home Assistant Skill** edit automations or Home Assistant configuration?"
> **Domain expert:** "No. The first scope is entity discovery, state reads, common service calls, and natural-language entity resolution."

> **Dev:** "Can a visual-only **Device Surface** skip prompt input and assistant results?"
> **Domain expert:** "No. Every **Device Surface** must preserve the **Prompt Exchange** interaction loop, even if its standby view is mostly visual."

> **Dev:** "Should Nest Hub-style options be hard-coded into the **Device UI**?"
> **Domain expert:** "No. They are **Surface Settings** defined by that **Device Surface Plugin** and stored by the **Brain Server** per device."

> **Dev:** "Does the first **Device Surface Plugin** require runtime surface switching?"
> **Domain expert:** "No. Runtime switching can follow after the repo-provided first plugin and **Surface Host Contract** exist."

> **Dev:** "Should each device ask which **Device Surface** to use every time it starts?"
> **Domain expert:** "No. The **Brain Server** stores that device's **Active Device Surface**, and the **Device UI** renders that choice automatically."

> **Dev:** "What if the **Active Device Surface** is not installed on a device?"
> **Domain expert:** "The **Device UI** performs **Device Surface Acquisition** using Brain-authorized plugin metadata before falling back."

> **Dev:** "Is a prompt just a POST request?"
> **Domain expert:** "No. The **Prompt Exchange** starts with an HTTP request, but live status and response updates can arrive over WebSocket."

> **Dev:** "Can the first OpenAI path require an API key?"
> **Domain expert:** "No. The first provider must support subscription login so the MVP can run without OpenAI API tokens."

> **Dev:** "Does the Raspberry Pi need to run the **Brain Server** too?"
> **Domain expert:** "No. The primary **Local Deployment** can run the **Device UI** on the Pi and the **Brain Server** on another local machine."

> **Dev:** "Should assistant memory live in database tables?"
> **Domain expert:** "Prefer **Brain Files** for durable assistant identity and memory; use structured storage for **Interaction Logs** and other data that needs querying."

> **Dev:** "Is Raspberry Pi setup only a README task?"
> **Domain expert:** "No. A **Kiosk Deployment** should have repo-owned install and service assets."

> **Dev:** "Can a component built for the **Device UI** be reused elsewhere?"
> **Domain expert:** "Yes. It should live as an **App UI Component** under the Device UI grouping in the shared UI package."

> **Dev:** "Does every bit of Next.js UI code need to move into the shared UI package?"
> **Domain expert:** "No. **Route Composition** stays in the Next.js app; reusable components belong in the shared UI package."

> **Dev:** "Can a git hook guarantee nobody pushes to `main`?"
> **Domain expert:** "No. Local hooks prevent accidental local commits; GitHub branch protection or rulesets enforce shared repository policy."

> **Dev:** "Should Discord receive an alert when the assistant gives a weak answer?"
> **Domain expert:** "No. Discord receives **System Issues** such as setup, provider, configuration, connectivity, or fatal runtime failures."

> **Dev:** "Should the **Device UI** call Discord directly?"
> **Domain expert:** "No. The **Device UI** reports client-side **System Issues** to the **Brain Server**, and the **Brain Server** delivers them through an **Issue Reporter**."

> **Dev:** "Should merge checks optimize for speed or confidence?"
> **Domain expert:** "Confidence. The **Merge Gate** should reject changes that break any part of the available test suite, even if the run takes longer."

## Flagged ambiguities

- "Device UI" was clarified to mean the fullscreen touchscreen client, not AI orchestration, provider credentials, or skill execution.
- "Device UI plugin" was clarified as **Device Surface Plugin**, meaning a replaceable rendered surface inside the **Device UI**, not a replacement client or Brain extension.
- "Home Assistant plugin" was clarified as **Home Assistant Skill**, meaning an installable Brain-owned assistant capability rather than a presentation plugin.
- "Plugin isolation" was clarified to allow self-contained presentation behavior while requiring Nexus-specific state and actions to pass through the **Surface Host Contract**.
- "Selected surface" was clarified as a per-device **Active Device Surface**, stored by the **Brain Server** rather than chosen manually on each device startup.
- "AI provider flexibility" was clarified to mean provider calls are implemented behind the **Brain Server**, not exposed directly to UI apps.
- "OpenAI provider" was clarified to mean OpenAI/Codex subscription authentication for v1, not an OpenAI Platform API key requirement.
- "Prompt flow" was clarified as an HTTP plus WebSocket **Prompt Exchange**, not HTTP-only messaging.
- "Local" was clarified to mean user-controlled local network deployment, not necessarily same-device deployment.
- "Data" was clarified into human-readable **Brain Files** for assistant behavior and structured **Interaction Logs** for observability.
- "Automatically launched on a device" was clarified as **Kiosk Deployment** with repo-owned boot/startup assets.
- "All UI components in the UI package" was clarified to include both generic **UI Primitives** and app-owned **App UI Components** grouped by app.
- Next.js page/layout wiring was clarified as **Route Composition**, not a reusable UI component.
- Branch safety was clarified as local hooks for accidental commits plus GitHub branch protection or rulesets for shared enforcement.
- "Issues with the brain or UI" was clarified as operational **System Issues**, not ordinary assistant answer quality.
- Discord was clarified as the first **Issue Reporter** destination, not a hard-coded UI dependency.
- PR validation was clarified as a full-suite **Merge Gate**, optimized for confidence over speed.
