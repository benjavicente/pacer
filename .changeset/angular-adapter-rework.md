---
'@tanstack/angular-pacer': minor
---

Rebuild Angular utility adapters with lazy construction, readonly selected
state, explicit methods, reactive options, and owner-bound instance cleanup. Replace the
Angular Store dependency with core Store integration and cover the adapters with
per-utility Angular behavior tests.

Support Angular 20 and up, including all Angular LTS versions, using stable public
signal, effect, and pending-task APIs.

Avoid processing an unchanged initial source value in debounced, throttled, and rate-limited reflected helpers, preserving stability and capacity for real changes.

Expose editable helpers as Angular writable signals with paced `set` and `update`, a live `asReadonly()` view, and type-safe function-valued data. Updaters use the committed value when processed.

Dispose lazily created instances on owner destruction, including work started before the first effect, without constructing unused instances during cleanup.

Keep core scheduling outside NgZone while running the provided processing function inside NgZone, so plain component field updates render in zone-based applications.

Allow `providePacerOptions` to accept a defaults factory evaluated in its injection context.
