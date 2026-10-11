---
'@tanstack/angular-pacer': minor
---

Rebuild Angular utility adapters with lazy construction, readonly selected
state, explicit methods, reactive options, and effect-owned cleanup. Replace the
Angular Store dependency with core Store integration and cover the adapters with
per-utility Angular behavior tests.

Support Angular 20 and up, including all Angular LTS versions, using stable public
signal, effect, and pending-task APIs.

Avoid processing an unchanged initial source value in debounced, throttled, and rate-limited reflected helpers, preserving stability and capacity for real changes.
