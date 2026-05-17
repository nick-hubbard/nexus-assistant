# Use Markdown Brain Files and SQLite Interaction Logs

Open Nexus v1 will keep durable assistant identity, memory, and instructions in human-readable Markdown **Brain Files**, while storing request, response, error, and runtime observability data as SQLite **Interaction Logs**. This preserves local-first editability for assistant behavior without turning the database into hidden brain state, and gives the **Brain Server** queryable logs through a simple Docker-friendly `/data` volume.

**Considered Options**

- Store all persistence in a database: easier to query, but makes assistant identity and memory less transparent to users.
- Store all persistence in Markdown or append-only files: easy to inspect, but awkward for request/response/error querying.
- Split Markdown **Brain Files** from SQLite **Interaction Logs**: keeps assistant behavior human-readable while preserving structured observability.
