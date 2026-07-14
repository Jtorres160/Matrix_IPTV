# Engineering Principles

These principles define how Matrix IPTV is built.

They exist to prevent architectural drift and maintain a clean codebase as features are added.

---

# Core Philosophy

The application follows one primary rule:

> Components display. Services process. Stores organize state.

Every part of the application should have a clear responsibility.

---

# Principle 1 — No God Components

Large components that control everything are forbidden.

A component should not:

- parse data
- manage databases
- control routing
- handle networking
- contain business rules
- render unrelated UI

If a component grows too large, responsibilities should be extracted.

---

# Principle 2 — Separation of Responsibilities

Responsibilities are divided by layer.

## Components

Responsible for:

- rendering UI
- user interaction
- visual states


## Views

Responsible for:

- composing components
- page-level organization


## Stores

Responsible for:

- application state
- state updates
- shared data


## Services

Responsible for:

- business logic
- processing
- transformations


## Parsers

Responsible for:

- converting external data into application data


---

# Principle 3 — UI Does Not Process Data

React components should never contain:

- M3U parsing
- XML parsing
- database operations
- complex transformations

Bad:
