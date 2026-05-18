# Open Nexus

Open Nexus is a local-first assistant system made of a central brain service and one or more touchscreen device clients.

## Language

**Device UI**:
The touchscreen-facing Nexus client that runs fullscreen on a local device and talks to the **Brain Server** over the local network.
_Avoid_: frontend, display app, client app

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
- In the primary **Local Deployment**, the **Device UI** and **Brain Server** may run on separate machines.
- A **Kiosk Deployment** runs the **Device UI** without requiring manual browser startup after boot.
- A **Device Wake Phrase** is detected by a local **Device Runtime** and consumed by the **Device UI**, not the **Brain Server**.
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
