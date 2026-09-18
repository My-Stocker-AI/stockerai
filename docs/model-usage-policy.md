## Model Usage Policy

Select the least expensive model that can reliably complete the task without sacrificing correctness.

### Model Selection
- **Opus**
  Use for system design, architecture, complex debugging, ambiguous problems, multi-file reasoning, or when intent is unclear.

- **Sonnet**
  Use for implementation, refactors, tests, and well-scoped execution tasks once a plan is clear.

- **Haiku**
  Use for simple utilities, summaries, formatting, quick checks, lightweight transformations, or single-file edits.

### Automatic Switching Rules
- Default main session to **Sonnet** for balanced cost and capability.
- Spawn **Opus** sub-agents when analysis, planning, or architecture is required.
- Use **Sonnet** for implementation, refactors, and well-scoped tasks.
- Spawn **Haiku** sub-agents when the task is low-risk and simple.
- Switch back to **Opus** sub-agent if unexpected complexity emerges.

### Context & Cost Discipline
- Minimize context when using Sonnet or Haiku.
- Operate file-by-file unless explicitly instructed otherwise.
- Avoid scanning entire repositories unless necessary.

### Cost Awareness
- Default to the cheapest model that can do the job correctly.
- Never reduce correctness or safety purely to save cost.
