# Use Device Surface Plugins for Device UI presentation

The Device UI needs customizable presentation without letting custom surfaces own Brain Server communication, Device Runtime events, or provider access. We will model the rendered touchscreen experience as a Device Surface supplied by a Device Surface Plugin, with Nexus-specific state and actions passed through a Surface Host Contract. The target model stores each device's Active Device Surface and Surface Settings in the Brain Server, while the first implementation may ship a repo-provided surface before Brain-managed switching and acquisition exist.

**Considered Options**

- Hard-code alternate layouts in the Device UI, which is simpler initially but makes customization a core-app concern.
- Let plugins directly use Brain Server clients, which is flexible but weakens system boundaries and makes plugins harder to isolate.
- Store the active surface only on the physical device, which helps offline boot but makes central device management and dynamic switching harder.

