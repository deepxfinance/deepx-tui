# AGENTS.md

This document defines how AI agents should work in this repository.

Agents must follow these conventions when reading, modifying, or generating code.

---

# 1. Project Structure

Repository layout:

deepx-tui/
├ README.md
├ AGENTS.md
├ package.json
├ biome.json
├ tsconfig.json
├ bin/                # executable entrypoints
├ docs/
│ ├ design/           # architecture and system design
│ ├ implementation/   # technical implementation notes
│ └ user/             # end-user documentation
├ src/                # Ink TUI application code
├ tests/              # automated tests
├ scripts/            # automation helpers
├ examples/           # runnable or copy-paste examples
└ postmortem/         # incident reports and retrospectives

Agents must preserve this structure.

---

# 2. Development Workflow

Agents must follow this workflow when implementing features.

1. Read relevant documents in:

docs/design  
docs/implementation

2. Implement code inside:

src/

3. Add or update tests inside:

tests/

4. Update documentation when behavior or workflows change.

---

# 3. Coding Rules

Agents must follow these rules:

- Keep the CLI startup path simple and readable
- Prefer small composable functions over large render modules
- Avoid adding frameworks beyond Bun, React, and Ink unless justified
- Preserve the `deepx` command as the main user-facing entrypoint

When modifying code:

- Prefer editing existing modules over creating parallel abstractions
- Keep terminal output deterministic where possible
- Use ASCII unless a file already requires non-ASCII characters

---

# 4. Testing Requirements

All new features must include tests.

Tests must be placed in:

tests/

Test guidelines:

- Prefer unit tests around CLI formatting and pure logic
- Keep tests deterministic
- Avoid network access and external services
- Run `bun test` before finishing

---

# 5. Documentation Rules

Documentation must be updated when:

- architecture changes
- CLI commands or flags change
- setup workflows change

Docs location rules:

Architecture -> docs/design  
Implementation detail -> docs/implementation  
User documentation -> docs/user

---

# 6. Examples

When introducing new workflows, add examples in:

examples/

Examples should be copy-paste friendly.

---

# 7. Scripts

Automation scripts go into:

scripts/

Scripts should be idempotent and safe to rerun.

---

# 8. Postmortems

When bugs or incidents occur, create a report in:

postmortem/

Use a concise format covering:

- what happened
- root cause
- fix
- prevention

---

# 9. Safety Rules

Agents must NOT:

- rewrite the repository layout without reason
- add heavyweight dependencies casually
- break the `deepx` entry command

When unsure, agents should request clarification.

---

# 10. Delivery

Agent-generated changes must:

- pass `bun test`
- pass `biome check .`
- keep README and setup docs aligned with actual commands
