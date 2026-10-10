# Pinned Session Bar

**English** · [中文](README.zh.md)

A **client plugin for the DeepSeek Harness (DSH) Web GUI**. It adds a dedicated **Pinned** bar directly above the sidebar's workspace / session list, collects every pinned session there, and lets you drag sessions between the bar and the workspace list.

## Features

- **One place for pinned sessions** — reads the Host-persisted pin set (`ctx.workspaces.list` → `pinnedSessionIds`) and lists every pinned session above the workspace list.
- **Cross-container drag and drop**
  - Drag a session row **from the workspace list onto the bar** → pins it (`ctx.workspaces.pinSession`) and places it first.
  - Drag a row **from the bar back onto the workspace list** → unpins it (`ctx.workspaces.unpinSession`).
  - While a drag hovers the bar, the bar shows an accent outline and a "release to pin" hint.
- **Reorder inside the bar** — drag rows up and down; the order is kept in browser storage (`localStorage: dsh.pinnedBar.order.v1`).
- **Fresh pins lead** — a newly pinned session the bar has never ordered jumps to the front, matching DSH's "a pin moves the session to the front" semantics; rows you already arranged keep their relative order.
- **Selected highlight** — the session you are currently viewing is highlighted (the same rule as the shipped list: `retainedBy.mainView > 0`, suppressed while a global panel is open) and carries `aria-current`.
- **Unpin button** — an `✕` appears on row hover; identical to dragging the row out.
- **Open** — click a row (or press Enter / Space) to open that session.
- **Collapsible** — click the bar heading to fold it; the state is kept in `localStorage: dsh.pinnedBar.collapsed.v1`.
- **Hides itself in the rail** — when the sidebar collapses to its 56px rail, a container query hides the bar.

The shipped session list is **left untouched**: pinned rows still appear at the top of their workspace groups. The bar is an additional, collected view — not a replacement.

## Install

### From GitHub (recommended)

```
plugin_manager install_bundle target="github:YubaiLoving/dsh-pinned-session-bar"
```

Or paste the same spec into the **Plugins** page of the Web GUI. DSH installs the package, enables the bundle, and the bar appears after the page reloads.

### Manual

1. Place the package under the profile's `node_modules`:

```
~/.dsh/profiles/<profile>/node_modules/dsh-pinned-session-bar/
```

2. Add a loader row to `cordis.patch.yml`, or declare the package in the profile's `dsh.profile.bundles`:

```yaml
- insert:
    - id: ui-pinned-bar
      name: 'dsh-pinned-session-bar'
```

3. Reload the page; restart DSH only if the row still does not appear.

## How it works

| Concern | Approach |
| --- | --- |
| Extension point | Registers into the `shell.overlay` slot (`list`, root scope) and renders into the sidebar DOM through `react-dom`'s `createPortal` |
| Mount position | A sibling node immediately **before** `[data-slot="sidebar.workspaces"]` — the top of the sidebar's region area, directly above the workspace list |
| Data | The shared Client services `ctx.workspaces` / `ctx.sessions`, not slot props |
| Drag protocol | Native HTML5 drag and drop — the same protocol the shipped browser uses for its own rows, which is what makes cross-container moves possible. A capture-phase `dragstart` on `document` identifies an outside row (`[data-row-key^="session:"]`), `dragover` keeps a drop legal anywhere, and `drop` turns "dropped back onto the list" into an unpin |
| Selected row | Same rule as ui-workspace: the session with `retainedBy.mainView > 0`; the panel share is read through the `usePanelInfo` standard prop (falls back to no highlight when absent) |
| Ordering | The Host owns pin membership; the bar owns only its presentation order (browser-local), exactly as the shipped browser keeps its own view state |
| Dependencies | Platform-seeded modules only: `react` and `react-dom`; icons are inline SVG |
| Robustness | `MutationObserver` + `requestAnimationFrame` re-asserts the mount point; the drag source lives in a ref so no React commit can race the gesture; the stylesheet is installed once and never torn down — a hot reload runs the outgoing fiber's disposers around the incoming fiber's startup, so tearing it down deletes the new instance's styles |

The bar mounts by DOM insertion because `sidebar.workspaces` is a `single` slot — replacing it would shadow the shipped browser — and the sidebar declares no `list` slot above it, so there is no additive seat to register into.

## Requirements

- DSH Web GUI with the browser surface (`@deepseek-ai/dsh-web-app`); developed and verified against **DSH 0.2.0-rc.2**.
- Two DOM contracts are used: `[data-slot="sidebar.workspaces"]` and `[data-row-key^="session:"]`.

## Known limitations

- Depends on the two DOM contracts above; if a future DSH changes the slot marker or the row key, the matching selector needs updating.
- The bar's order is browser-local and independent of the shipped list's "manual" ordering (that state belongs to ui-workspace's own view store).
- Dropping a row back onto the list only unpins it; the exact landing position still follows the shipped browser's ordering rules.
- Dragging is unavailable while the sidebar is collapsed to the rail, where the bar is hidden.

## Development

```bash
node test/smoke.mjs
```

The smoke test loads `lib/client.js` inside a stub of the browser module-loader frame (React, DOM, services) and exercises registration, ordering, the selected highlight, in-bar reordering, drop-to-pin, drop-to-unpin, collapse, open and keyboard paths. It cannot validate real layout or the live services, but it executes every path of the shipped bundle.

## License

[MIT](LICENSE)
