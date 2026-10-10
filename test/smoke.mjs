/**
 * Offline smoke test for the Pinned Session Bar bundle.
 *
 * Loads lib/client.js inside a minimal stub of the browser module-loader frame,
 * runs the plugin apply(), renders the bar with stub React hooks, and exercises
 * ordering, the selected highlight, bar-internal drag reordering, dragging a
 * shipped row in (pin) and a bar row out (unpin), collapse, open and keyboard.
 *
 * This cannot validate real DOM layout or the live services, but it does execute
 * every path of the shipped bundle.
 *
 * Usage: node scripts/pinned-bar-smoke.mjs [path/to/lib/client.js]
 */
import fs from 'node:fs'
import vm from 'node:vm'

const clientPath = process.argv[2] ?? new URL('../lib/client.js', import.meta.url)
const code = fs.readFileSync(clientPath, 'utf8')

let failures = 0
function check(name, condition, detail) {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}${detail === undefined ? '' : ` -> ${detail}`}`)
  }
}
function assertEqual(name, actual, expected) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  check(name, a === b, `got ${a} want ${b}`)
}

// ---- stub React -----------------------------------------------------------------
let hookStore = []
let hookCursor = 0
let dirty = false

const ReactStub = {
  createElement: (type, props, ...children) => ({
    type,
    props: { ...(props ?? {}), children: children.length <= 1 ? children[0] : children },
  }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useState: (init) => {
    const index = hookCursor++
    if (!(index in hookStore)) hookStore[index] = typeof init === 'function' ? init() : init
    return [hookStore[index], (next) => {
      hookStore[index] = typeof next === 'function' ? next(hookStore[index]) : next
      dirty = true
    }]
  },
  // Effects run once per mount here: the plugin's effects are mount-only, and
  // re-running them would re-register the document listeners on every render.
  useEffect: (fn) => {
    const index = hookCursor++
    if (index in hookStore) return
    hookStore[index] = true
    fn()
  },
  useRef: (initial) => {
    const index = hookCursor++
    if (!(index in hookStore)) hookStore[index] = { current: initial }
    return hookStore[index]
  },
  useSyncExternalStore: (subscribe, getSnapshot) => {
    subscribe(() => {})
    return getSnapshot()
  },
}
const ReactDOMStub = { createPortal: (node, container) => ({ type: 'portal', props: { node, container } }) }

// ---- stub DOM -------------------------------------------------------------------
const slotAnchor = { parentElement: null, nextSibling: null }
const regionArea = { children: [] }
regionArea.insertBefore = (element, reference) => {
  element.parentElement = regionArea
  element.nextSibling = reference
  regionArea.children.unshift(element)
  return element
}
slotAnchor.parentElement = regionArea

/** Capture-phase and bubble listeners the plugin registers on the document. */
const documentListeners = {}
function fireDocument(type, event) {
  for (const listener of documentListeners[type] ?? []) listener(event)
}

/** A DOM node inside a shipping Session row, as a drag target. */
function fakeListRow(sessionId) {
  return {
    closest: (selector) => {
      if (selector === '[data-row-key^="session:"]') {
        return { getAttribute: (name) => (name === 'data-row-key' ? `session:${sessionId}` : null) }
      }
      return null
    },
  }
}

const created = []
const documentStub = {
  head: { appendChild() {} },
  body: {},
  addEventListener: (type, listener) => {
    documentListeners[type] = [...(documentListeners[type] ?? []), listener]
  },
  removeEventListener: (type, listener) => {
    documentListeners[type] = (documentListeners[type] ?? []).filter((entry) => entry !== listener)
  },
  getElementById: (id) => regionArea.children.find((child) => child.id === id) ?? null,
  querySelector: (selector) => (selector === '[data-slot="sidebar.workspaces"]' ? slotAnchor : null),
  createElement: (tag) => {
    const element = {
      tag,
      id: '',
      className: '',
      textContent: '',
      style: {},
      parentElement: null,
      nextSibling: null,
      appendChild() {},
      remove() {
        if (this.parentElement !== null) {
          this.parentElement.children = this.parentElement.children.filter((child) => child !== this)
          this.parentElement = null
        }
      },
      setAttribute() {},
      getAttribute() {
        return null
      },
    }
    created.push(element)
    return element
  },
}

const storage = new Map()
const windowStub = {
  localStorage: {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
  },
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
  setTimeout: (fn) => {
    fn()
    return 0
  },
  __ModuleLoader__: { load: (entry) => { loadedEntry = entry } },
}
let loadedEntry = null

// ---- stub services --------------------------------------------------------------
let workspaceState = { items: [], pinnedSessionIds: [], archivedSessionIds: [] }
const sessionState = {
  ids: ['s1', 's2', 's3'],
  byId: {
    s1: { displayTitle: 'Alpha' },
    s2: { displayTitle: 'Beta' },
    s3: { displayTitle: 'Gamma' },
  },
}
const pinned = []
const unpinned = []
const opened = []

const services = {
  workspaces: {
    list: { getSnapshot: () => workspaceState, subscribe: () => () => {} },
    pinSession: async (sessionId) => {
      pinned.push(sessionId)
      workspaceState = {
        ...workspaceState,
        pinnedSessionIds: [sessionId, ...workspaceState.pinnedSessionIds.filter((id) => id !== sessionId)],
      }
    },
    unpinSession: async (sessionId) => {
      unpinned.push(sessionId)
      workspaceState = {
        ...workspaceState,
        pinnedSessionIds: workspaceState.pinnedSessionIds.filter((id) => id !== sessionId),
      }
    },
  },
  sessions: { list: { getSnapshot: () => sessionState, subscribe: () => () => {} } },
  uiWorkspace: { openSession: (sessionId) => { opened.push(sessionId) } },
}

// ---- load the bundle ------------------------------------------------------------
const context = {
  window: windowStub,
  document: documentStub,
  console,
  setTimeout,
  clearTimeout,
  JSON,
  Promise,
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  requestAnimationFrame: windowStub.requestAnimationFrame,
}
context.globalThis = context
vm.createContext(context)
vm.runInContext(code, context, { filename: 'client.js' })

console.log('bundle registration')
check('__ModuleLoader__.load called', loadedEntry !== null)
assertEqual('entry id', loadedEntry?.id, 'dsh-pinned-session-bar')
check('factory is a function', typeof loadedEntry?.factory === 'function')

const moduleExports = loadedEntry.factory((name) => {
  if (name === 'react') return ReactStub
  if (name === 'react-dom') return ReactDOMStub
  throw new Error(`unexpected require(${name})`)
})

console.log('plugin exports')
assertEqual('inject services', moduleExports.inject, ['slots', 'locale', 'workspaces', 'sessions', 'uiWorkspace'])
check('apply is a function', typeof moduleExports.apply === 'function')

// ---- apply with a stub context --------------------------------------------------
const registrations = []
const effects = []
const dictionaries = []
const t = (key) => key
const ctx = {
  effect: (callback, label) => {
    effects.push(label)
    const dispose = callback()
    return typeof dispose === 'function' ? dispose : () => {}
  },
  locale: {
    register: (ns, dicts) => {
      dictionaries.push([ns, dicts])
      return () => {}
    },
    bind: () => t,
  },
  slots: {
    inject: (key, callback) => {
      callback()
      return () => {}
    },
    register: (meta, component) => {
      registrations.push({ meta, component })
      return () => {}
    },
  },
  ...services,
}

console.log('apply()')
moduleExports.apply(ctx)
check('stylesheet injected', created.some((element) => element.tag === 'style'))
assertEqual('locale dictionaries registered', dictionaries.map(([ns]) => ns), ['pinnedBar'])
assertEqual('one slot registration', registrations.length, 1)
assertEqual('registration slot', registrations[0]?.meta.name, 'shell.overlay')
assertEqual('registration id', registrations[0]?.meta.id, 'pinned-session-bar')
check('registration label is localized', registrations[0]?.meta.label() === 'label')

// ---- render helpers -------------------------------------------------------------
const barElement = registrations[0].component()
const Bar = barElement.type
const barProps = barElement.props
check('component factory yields the bar', typeof Bar === 'function')

function render(overrides) {
  const props = overrides === undefined ? barProps : { ...barProps, ...overrides }
  hookCursor = 0
  dirty = false
  let tree = Bar(props)
  if (dirty) {
    hookCursor = 0
    dirty = false
    tree = Bar(props)
  }
  return tree
}
function rootOf(tree) {
  return tree.props.node
}
function childrenByClass(tree, className) {
  return rootOf(tree).props.children.filter((child) => child !== null && child !== undefined && child.props?.className !== undefined && String(child.props.className).split(' ').includes(className))
}
function findRows(tree) {
  const lists = childrenByClass(tree, 'dsh-pb-list')
  return lists.length === 0 ? [] : lists[0].props.children
}
function rowTitle(row) {
  return row.props.children[1].props.children
}
function rowClass(row) {
  return String(row.props.className)
}
function unpinButtonOf(row) {
  return row.props.children[2]
}
function headButtonOf(tree) {
  return rootOf(tree).props.children.find((child) => child?.props?.className === 'dsh-pb-head')
}

// ---- ordering -------------------------------------------------------------------
console.log('render with an empty local order (Host order leads)')
workspaceState = { ...workspaceState, pinnedSessionIds: ['s2', 's1'] }
hookStore = []
let tree = render()
check('bar portalled into the sidebar region', tree.type === 'portal')
check('document drag listeners registered on mount', (documentListeners.dragstart ?? []).length === 1 && (documentListeners.drop ?? []).length === 1)
let rows = findRows(tree)
assertEqual('rows follow the Host order', rows.map(rowTitle), ['Beta', 'Alpha'])

console.log('render with a browser-local order')
storage.set('dsh.pinnedBar.order.v1', JSON.stringify(['s1', 's2']))
hookStore = []
tree = render()
assertEqual('local order wins', findRows(tree).map(rowTitle), ['Alpha', 'Beta'])

console.log('a fresh pin leads the arranged rows')
storage.set('dsh.pinnedBar.order.v1', JSON.stringify(['s1']))
hookStore = []
tree = render()
assertEqual('unarranged pin first', findRows(tree).map(rowTitle), ['Beta', 'Alpha'])

console.log('selected highlight')
sessionState.byId.s2.retainedBy = { mainView: 1 }
storage.set('dsh.pinnedBar.order.v1', JSON.stringify(['s1', 's2']))
hookStore = []
tree = render()
rows = findRows(tree)
check('retained row carries the selected class', rowClass(rows[1]).includes('dsh-pb-selected'))
check('other rows do not', !rowClass(rows[0]).includes('dsh-pb-selected'))
check('selected row exposes aria-current', rows[1].props['aria-current'] === 'true')
tree = render({ panelActive: true })
rows = findRows(tree)
check('a global panel suppresses the highlight', !rowClass(rows[1]).includes('dsh-pb-selected'))
sessionState.byId.s2.retainedBy = { mainView: 0 }

console.log('bar-internal drag reorders')
storage.set('dsh.pinnedBar.order.v1', JSON.stringify(['s1', 's2']))
workspaceState = { ...workspaceState, pinnedSessionIds: ['s1', 's2'] }
hookStore = []
tree = render()
rows = findRows(tree)
const transfer = () => ({ setData() {}, effectAllowed: '', dropEffect: '' })
rows[0].props.onDragStart({ dataTransfer: transfer() })
check('drag start marks the source row', rowClass(findRows(render())[0]).includes('dsh-pb-dragging'))
rows[1].props.onDragOver({
  preventDefault() {},
  stopPropagation() {},
  dataTransfer: transfer(),
  currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 30 }) },
  clientY: 25,
})
tree = render()
rows = findRows(tree)
check('drop marker rendered below the hovered row', rowClass(rows[1]).includes('dsh-pb-drop-after'))
rows[1].props.onDrop({ preventDefault() {}, stopPropagation() {} })
assertEqual('order persisted after the drag', JSON.parse(storage.get('dsh.pinnedBar.order.v1')), ['s2', 's1'])

console.log('a shipped row dropped on the bar pins')
fireDocument('dragstart', { target: fakeListRow('s3') })
tree = render()
rows = findRows(tree)
rows[0].props.onDragOver({
  preventDefault() {},
  stopPropagation() {},
  dataTransfer: transfer(),
  currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 30 }) },
  clientY: 0,
})
rows[0].props.onDrop({ preventDefault() {}, stopPropagation() {} })
await new Promise((resolve) => setTimeout(resolve, 0))
assertEqual('pin called for the dropped row', pinned, ['s3'])

console.log('a bar row dropped on the workspace list unpins')
storage.set('dsh.pinnedBar.order.v1', JSON.stringify(['s2', 's1']))
workspaceState = { ...workspaceState, pinnedSessionIds: ['s1', 's2'] }
hookStore = []
tree = render()
rows = findRows(tree)
rows[0].props.onDragStart({ dataTransfer: transfer() })
fireDocument('drop', { target: fakeListRow('s1'), preventDefault() {} })
await new Promise((resolve) => setTimeout(resolve, 0))
assertEqual('unpin called for the dragged-out row', unpinned, ['s2'])

console.log('unpin button and collapse')
storage.set('dsh.pinnedBar.collapsed.v1', '0')
storage.set('dsh.pinnedBar.order.v1', JSON.stringify(['s2', 's1']))
workspaceState = { ...workspaceState, pinnedSessionIds: ['s1', 's2'] }
hookStore = []
tree = render()
rows = findRows(tree)
unpinButtonOf(rows[1]).props.onClick({ stopPropagation() {} })
await new Promise((resolve) => setTimeout(resolve, 0))
assertEqual('unpin button calls the service', unpinned, ['s2', 's1'])
assertEqual('unpin drops the row from the local order', JSON.parse(storage.get('dsh.pinnedBar.order.v1')), ['s2'])
headButtonOf(tree).props.onClick()
tree = render()
assertEqual('collapsed hides the list', childrenByClass(tree, 'dsh-pb-list').length, 0)
assertEqual('collapsed state persisted', storage.get('dsh.pinnedBar.collapsed.v1'), '1')

console.log('open paths')
storage.set('dsh.pinnedBar.collapsed.v1', '0')
storage.set('dsh.pinnedBar.order.v1', JSON.stringify(['s2']))
hookStore = []
tree = render()
rows = findRows(tree)
rows[0].props.onClick()
assertEqual('row click opens the session', opened, ['s2'])
let prevented = false
rows[0].props.onKeyDown({ key: 'Enter', preventDefault: () => { prevented = true } })
check('Enter is handled and prevented', prevented)
assertEqual('Enter opens the session', opened, ['s2', 's2'])

console.log('empty state')
workspaceState = { ...workspaceState, pinnedSessionIds: [] }
hookStore = []
tree = render()
assertEqual('no rows', findRows(tree).length, 0)
assertEqual('empty notice rendered', childrenByClass(tree, 'dsh-pb-empty').length, 1)

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
