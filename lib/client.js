/**
 * Pinned Session Bar — browser half.
 *
 * The sidebar renders its workspace/session browsing region into the single
 * `sidebar.workspaces` seat, which this plugin must not replace (that would
 * shadow the shipped browser). The seat's parent is the sidebar's own scroll-free
 * region area, so the bar mounts as a sibling immediately BEFORE that seat: it
 * rides the region's visibility (collapse, rail, hiding) for free and stays put
 * while the session list beneath it scrolls.
 *
 * Data comes from the shared Client services rather than slot props:
 * `ctx.workspaces.list` carries the Host-persisted pinned set (most recently
 * pinned first) and `ctx.sessions.list` carries the row summaries plus the
 * retained main-view Session used for the selected row.
 *
 * Dragging is native HTML5 drag and drop on purpose: the shipped browser drags
 * its own rows that way, so only the same protocol lets a Session move between
 * the workspace list and this bar. Drops inside the bar reorder the bar (browser
 * local order); a shipped row dropped here pins; a bar row dropped back onto the
 * workspace list unpins.
 */
window.__ModuleLoader__.load({
	id: "dsh-pinned-session-bar",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const ReactDOM = require("react-dom");
		const h = React.createElement;

		/** Dictionary namespace owned by this plugin. */
		const NS = "pinnedBar";
		/** The shipped browser seat whose parent is the sidebar region area. */
		const SLOT_SELECTOR = '[data-slot="sidebar.workspaces"]';
		/** Every shipping Session row carries this key; it is how an outside drag is identified. */
		const SESSION_ROW_SELECTOR = '[data-row-key^="session:"]';
		const SESSION_ROW_PREFIX = "session:";
		const HOST_ID = "dsh-pinned-session-bar-host";
		const STYLE_ID = "dsh-pinned-session-bar-style";
		/** Browser-local bar order; the Host owns membership, never the presentation order. */
		const ORDER_KEY = "dsh.pinnedBar.order.v1";
		const COLLAPSED_KEY = "dsh.pinnedBar.collapsed.v1";
		/** Sessions shorter than this region width are the collapsed rail. */
		const RAIL_MAX_WIDTH = 150;
		/** Stamped on the mount node so the running build is identifiable from DevTools. */
		const BUILD_TAG = "v4-styles-fixed";

		const zh = {
			label: "置顶会话栏",
			title: "置顶",
			empty: "暂无置顶会话",
			unpin: "取消置顶",
			pinFailed: "置顶失败，请稍后重试",
			unpinFailed: "取消置顶失败，请稍后重试",
			dropHere: "松开即可置顶",
			collapse: "收起置顶栏",
			expand: "展开置顶栏",
		};
		const en = {
			label: "Pinned session bar",
			title: "Pinned",
			empty: "No pinned sessions",
			unpin: "Unpin session",
			pinFailed: "Pin failed. Try again later.",
			unpinFailed: "Unpin failed. Try again later.",
			dropHere: "Release to pin",
			collapse: "Collapse pinned bar",
			expand: "Expand pinned bar",
		};

		const css = [
			`#${HOST_ID}{flex:none;container-type:inline-size;padding:0 2px 0 0;}`,
			".dsh-pb-root{display:flex;flex-direction:column;gap:1px;padding:5px 0 8px;border-radius:var(--dsw-radius-md,8px);}",
			".dsh-pb-root.dsh-pb-dropzone{box-shadow:inset 0 0 0 1px var(--dsw-alias-state-business-primary,#4d6bfe);}",
			".dsh-pb-head{display:flex;align-items:center;gap:6px;width:100%;padding:2px 6px 5px 8px;border:0;background:0 0;color:var(--dsw-alias-label-tertiary,#8b8b8b);font:inherit;font-size:12px;line-height:16px;text-align:left;cursor:pointer;}",
			".dsh-pb-head:hover{color:var(--dsw-alias-label-secondary,#b0b0b0);}",
			".dsh-pb-head:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4d6bfe));outline-offset:-2px;border-radius:var(--dsw-radius-sm,6px);}",
			".dsh-pb-caret{flex:none;opacity:.75;}",
			".dsh-pb-heading{flex:none;letter-spacing:.02em;}",
			".dsh-pb-count{flex:none;opacity:.8;font-variant-numeric:tabular-nums;}",
			".dsh-pb-hint{margin-left:auto;color:var(--dsw-alias-state-business-primary,#4d6bfe);font-size:11px;line-height:16px;}",
			".dsh-pb-list{display:flex;flex-direction:column;gap:1px;}",
			".dsh-pb-row{box-sizing:border-box;display:flex;align-items:center;gap:6px;height:30px;padding:0 4px 0 6px;border-radius:var(--dsw-radius-md,8px);color:var(--dsw-alias-label-primary,#eaeaea);cursor:grab;user-select:none;}",
			".dsh-pb-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));}",
			".dsh-pb-row.dsh-pb-selected{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));}",
			".dsh-pb-row.dsh-pb-selected .dsh-pb-pin{color:var(--dsw-alias-state-business-primary,#4d6bfe);}",
			".dsh-pb-row:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4d6bfe));outline-offset:-2px;}",
			".dsh-pb-pin{flex:none;color:var(--dsw-alias-label-tertiary,#8b8b8b);}",
			".dsh-pb-row:hover .dsh-pb-pin{color:var(--dsw-alias-label-secondary,#b0b0b0);}",
			".dsh-pb-title{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:13px;line-height:20px;}",
			".dsh-pb-unpin{flex:none;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:var(--dsw-radius-sm,6px);background:0 0;color:var(--dsw-alias-label-tertiary,#8b8b8b);cursor:pointer;opacity:0;}",
			".dsh-pb-row:hover .dsh-pb-unpin,.dsh-pb-row:focus-within .dsh-pb-unpin{opacity:1;}",
			".dsh-pb-unpin:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.2));color:var(--dsw-alias-label-primary,#eaeaea);}",
			".dsh-pb-unpin:focus-visible{opacity:1;outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4d6bfe));outline-offset:-2px;}",
			".dsh-pb-dragging{opacity:.45;cursor:grabbing;}",
			".dsh-pb-drop-before{box-shadow:inset 0 2px 0 0 var(--dsw-alias-state-business-primary,#4d6bfe);}",
			".dsh-pb-drop-after{box-shadow:inset 0 -2px 0 0 var(--dsw-alias-state-business-primary,#4d6bfe);}",
			".dsh-pb-empty{padding:1px 8px 5px;color:var(--dsw-alias-label-tertiary,#8b8b8b);font-size:12px;line-height:16px;}",
			".dsh-pb-error{padding:1px 8px 5px;color:var(--dsw-alias-state-error-primary,#e5534b);font-size:12px;line-height:16px;}",
			`@container (max-width:${String(RAIL_MAX_WIDTH)}px){.dsh-pb-root{display:none;}}`,
		].join("");

		/** Join the truthy class names of one row. */
		function cls(...values) {
			return values.filter((value) => typeof value === "string" && value.length > 0).join(" ");
		}

		/** Inject (or refresh) the bar stylesheet once per document. */
		function ensureStyle() {
			const existing = document.getElementById(STYLE_ID);
			if (existing !== null) {
				if (existing.textContent !== css) existing.textContent = css;
				return;
			}
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.setAttribute("data-plugin", "dsh-pinned-session-bar");
			style.setAttribute("data-plugin-css", "dsh-pinned-session-bar/pinned-bar.css");
			style.textContent = css;
			document.head.appendChild(style);
		}

		/** Read the browser-local bar order; an unreadable store degrades to the Host order. */
		function readOrder() {
			try {
				const raw = window.localStorage.getItem(ORDER_KEY);
				if (raw === null) return [];
				const parsed = JSON.parse(raw);
				return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
			} catch {
				return [];
			}
		}

		/** Persist the bar order; storage refusal must never break the bar. */
		function writeOrder(ids) {
			try {
				window.localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
			} catch {
				/* the bar stays usable for this session */
			}
		}

		function readCollapsed() {
			try {
				return window.localStorage.getItem(COLLAPSED_KEY) === "1";
			} catch {
				return false;
			}
		}

		function writeCollapsed(collapsed) {
			try {
				window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
			} catch {
				/* the bar stays usable for this session */
			}
		}

		/**
		 * Fold the Host's pinned set into the bar's own order.
		 *
		 * The Host order is "most recently pinned first", and a pin always fronts
		 * its set — so a Session the bar has never ordered (a fresh pin, or one
		 * dragged in from the workspace list) leads, while everything the user
		 * already arranged keeps its relative place.
		 */
		function mergeOrder(pinnedIds, localOrder) {
			const pinned = new Set(pinnedIds);
			const kept = localOrder.filter((id) => pinned.has(id));
			const placed = new Set(kept);
			const fresh = pinnedIds.filter((id) => !placed.has(id));
			return [...fresh, ...kept];
		}

		/** The row's identity projection: its display title, or the id when unsaved. */
		function titleOf(snapshot, sessionId) {
			const summary = snapshot.byId[sessionId];
			if (summary === undefined) return sessionId;
			const display = summary.displayTitle;
			return typeof display === "string" && display.length > 0 ? display : sessionId;
		}

		/**
		 * The row the shipped browser highlights: the Session still retained by the
		 * main view. Global panels take the highlighting away, which the panel share
		 * reports separately.
		 */
		function currentSessionId(snapshot) {
			for (const id of snapshot.ids) {
				const summary = snapshot.byId[id];
				if (summary !== undefined && (summary.retainedBy?.mainView ?? 0) > 0) return id;
			}
			return null;
		}

		/** The Session id behind a shipping row, read from the row's own DOM key. */
		function sessionIdFromNode(node) {
			if (node === null || node === undefined || typeof node.closest !== "function") return null;
			const row = node.closest(SESSION_ROW_SELECTOR);
			if (row === null) return null;
			const key = row.getAttribute("data-row-key");
			if (typeof key !== "string" || !key.startsWith(SESSION_ROW_PREFIX)) return null;
			const id = key.slice(SESSION_ROW_PREFIX.length);
			return id.length > 0 ? id : null;
		}

		/**
		 * Locate (or create) the bar's mount container, keeping it directly before
		 * the shipped browsing seat inside the sidebar's region area.
		 */
		function mountHost() {
			const anchor = document.querySelector(SLOT_SELECTOR);
			const parent = anchor === null ? null : anchor.parentElement;
			if (anchor === null || parent === null) return null;
			let host = document.getElementById(HOST_ID);
			if (host === null) {
				host = document.createElement("div");
				host.id = HOST_ID;
			}
			if (host.parentElement !== parent || host.nextSibling !== anchor) {
				parent.insertBefore(host, anchor);
			}
			host.setAttribute("data-dsh-pinned-bar", BUILD_TAG);
			return host;
		}

		/** A small filled pin, matching the shipped row marker. */
		function PinIcon() {
			return h("svg", {
				className: "dsh-pb-pin",
				width: 12,
				height: 12,
				viewBox: "0 0 24 24",
				"aria-hidden": "true",
				focusable: "false",
			}, h("path", {
				fill: "currentColor",
				d: "M16 9V4h1V2H7v2h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z",
			}));
		}

		/** The unpin affordance's glyph. */
		function CloseIcon() {
			return h("svg", {
				width: 12,
				height: 12,
				viewBox: "0 0 24 24",
				"aria-hidden": "true",
				focusable: "false",
			}, h("path", {
				fill: "currentColor",
				d: "M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z",
			}));
		}

		/**
		 * The bar: one head row plus the pinned rows, portalled into the sidebar's
		 * region area, wired for both its own reordering and the workspace list's
		 * native drags.
		 */
		function PinnedBar(props) {
			const { t, workspaces, sessions, uiWorkspace, panelActive } = props;
			const [host, setHost] = React.useState(null);
			const [order, setOrder] = React.useState(readOrder);
			const [collapsed, setCollapsed] = React.useState(readCollapsed);
			/** The bar row being dragged, if the drag started here. */
			const [dragId, setDragId] = React.useState(null);
			/** Insertion slot while a drag hovers the rows, or null. */
			const [dropAt, setDropAt] = React.useState(null);
			/** True while any accepted drag hovers the bar, so it can advertise itself. */
			const [dropzone, setDropzone] = React.useState(false);
			const [error, setError] = React.useState(null);
			/**
			 * The live drag source. A ref, not state: the document listeners and the
			 * row handlers must agree on it within the same event, before React has
			 * committed anything.
			 */
			const sourceRef = React.useRef(null);

			// The seat is re-rendered (and on a plugin reload, replaced) by its own
			// owner, so re-assert the mount point whenever the sidebar's DOM moves.
			React.useEffect(() => {
				setHost(mountHost());
				let frame = 0;
				const observer = new MutationObserver(() => {
					if (frame !== 0) return;
					frame = window.requestAnimationFrame(() => {
						frame = 0;
						setHost((current) => {
							const next = mountHost();
							return next !== null && next !== current ? next : current;
						});
					});
				});
				observer.observe(document.body, { childList: true, subtree: true });
				return () => {
					observer.disconnect();
					if (frame !== 0) window.cancelAnimationFrame(frame);
				};
			}, []);

			// Membership, titles and the selected Session live in two services; the
			// signature keeps React from re-rendering on unrelated churn.
			const signature = React.useSyncExternalStore(
				React.useCallback((notify) => {
					const offWorkspaces = workspaces.list.subscribe(notify);
					const offSessions = sessions.list.subscribe(notify);
					return () => {
						offWorkspaces();
						offSessions();
					};
				}, [workspaces, sessions]),
				React.useCallback(() => {
					const workspaceState = workspaces.list.getSnapshot();
					const sessionState = sessions.list.getSnapshot();
					return JSON.stringify([
						workspaceState.pinnedSessionIds.map((id) => [id, titleOf(sessionState, id)]),
						panelActive ? null : currentSessionId(sessionState),
					]);
				}, [workspaces, sessions, panelActive]),
			);

			const workspaceState = workspaces.list.getSnapshot();
			const sessionState = sessions.list.getSnapshot();
			const pinnedIds = workspaceState.pinnedSessionIds;
			const currentId = panelActive ? null : currentSessionId(sessionState);
			const visible = React.useMemo(() => mergeOrder(pinnedIds, order), [signature, order]);

			const reportFailure = (message) => {
				setError(message);
				window.setTimeout(() => {
					setError((current) => (current === null ? current : null));
				}, 4000);
			};

			const unpin = (sessionId) => {
				const next = order.filter((id) => id !== sessionId);
				setOrder(next);
				writeOrder(next);
				Promise.resolve(workspaces.unpinSession(sessionId)).catch(() => {
					reportFailure(t("unpinFailed"));
				});
			};

			const pin = (sessionId) => {
				// Dropping the id from the local order lets the merge front it, which is
				// exactly what a fresh pin means on the Host side too.
				const next = order.filter((id) => id !== sessionId);
				setOrder(next);
				writeOrder(next);
				Promise.resolve(workspaces.pinSession(sessionId)).catch(() => {
					reportFailure(t("pinFailed"));
				});
			};

			/** Commit a bar-internal reorder onto `targetIndex` of the rendered list. */
			const commitReorder = (sessionId, targetIndex) => {
				if (targetIndex === null) return;
				const from = visible.indexOf(sessionId);
				if (from < 0) return;
				const next = visible.slice();
				next.splice(from, 1);
				next.splice(targetIndex > from ? targetIndex - 1 : targetIndex, 0, sessionId);
				setOrder(next);
				writeOrder(next);
			};

			// The document-level half of the drag: it learns about drags started in the
			// shipped list, keeps a drop legal anywhere while one of ours is in flight,
			// and turns "dropped back onto the workspace list" into an unpin.
			const handlers = React.useRef(null);
			handlers.current = { pin, unpin, commitReorder };
			React.useEffect(() => {
				const endDrag = () => {
					sourceRef.current = null;
					setDragId(null);
					setDropAt(null);
					setDropzone(false);
				};
				const onDragStart = (event) => {
					const id = sessionIdFromNode(event.target);
					if (id === null) return;
					sourceRef.current = { kind: "external", id };
				};
				const onDragOver = (event) => {
					if (sourceRef.current === null) return;
					event.preventDefault();
					if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
				};
				const onDrop = (event) => {
					const source = sourceRef.current;
					endDrag();
					if (source === null || source.kind !== "bar") return;
					const target = event.target;
					if (target === null || target === undefined || typeof target.closest !== "function") return;
					// Handled inside the bar already.
					if (target.closest(`#${HOST_ID}`) !== null) return;
					const overList = target.closest(SESSION_ROW_SELECTOR) !== null || target.closest(SLOT_SELECTOR) !== null;
					if (!overList) return;
					event.preventDefault();
					handlers.current.unpin(source.id);
				};
				document.addEventListener("dragstart", onDragStart, true);
				document.addEventListener("dragend", endDrag, true);
				document.addEventListener("dragover", onDragOver);
				document.addEventListener("drop", onDrop);
				return () => {
					document.removeEventListener("dragstart", onDragStart, true);
					document.removeEventListener("dragend", endDrag, true);
					document.removeEventListener("dragover", onDragOver);
					document.removeEventListener("drop", onDrop);
				};
			}, []);

			// Observable state for DevTools: the build in the page and what the bar
			// currently believes, without which a stale bundle is hard to spot.
			React.useEffect(() => {
				if (host === null) return;
				host.setAttribute("data-dsh-pinned-count", String(visible.length));
				host.setAttribute("data-dsh-pinned-drag", sourceRef.current === null ? "" : sourceRef.current.id);
			}, [host, visible.length, dragId, dropAt, dropzone]);

			const toggleCollapsed = () => {
				setCollapsed((current) => {
					writeCollapsed(!current);
					return !current;
				});
			};

			/** Shared tail of every drop taken by the bar. */
			const takeDrop = (event, onBarRow) => {
				const source = sourceRef.current;
				if (source === null) return;
				event.preventDefault();
				event.stopPropagation();
				if (source.kind === "bar") handlers.current.commitReorder(source.id, onBarRow);
				else handlers.current.pin(source.id);
				sourceRef.current = null;
				setDragId(null);
				setDropAt(null);
				setDropzone(false);
			};

			const rows = visible.map((id, index) => {
				const title = titleOf(sessionState, id);
				return h("div", {
					key: id,
					role: "button",
					tabIndex: 0,
					draggable: true,
					title,
					"aria-label": title,
					"aria-current": currentId === id ? "true" : undefined,
					className: cls(
						"dsh-pb-row",
						currentId === id && "dsh-pb-selected",
						dragId === id && "dsh-pb-dragging",
						dropAt === index && "dsh-pb-drop-before",
						dropAt === visible.length && index === visible.length - 1 && "dsh-pb-drop-after",
					),
					onKeyDown: (event) => {
						if (event.key !== "Enter" && event.key !== " ") return;
						event.preventDefault();
						uiWorkspace.openSession(id);
					},
					onClick: () => {
						uiWorkspace.openSession(id);
					},
					onDragStart: (event) => {
						sourceRef.current = { kind: "bar", id };
						setDragId(id);
						setDropzone(true);
						try {
							event.dataTransfer.setData("text/plain", id);
							event.dataTransfer.effectAllowed = "move";
						} catch {
							/* older carriers expose a restricted dataTransfer */
						}
					},
					onDragEnd: () => {
						sourceRef.current = null;
						setDragId(null);
						setDropAt(null);
						setDropzone(false);
					},
					onDragOver: (event) => {
						const source = sourceRef.current;
						if (source === null) return;
						if (source.kind === "bar" && source.id === id) return;
						event.preventDefault();
						event.stopPropagation();
						if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
						setDropzone(true);
						const rect = event.currentTarget.getBoundingClientRect();
						const after = event.clientY > rect.top + rect.height / 2;
						setDropAt(after ? index + 1 : index);
					},
					onDrop: (event) => {
						const target = dropAt === null ? index : dropAt;
						takeDrop(event, target);
					},
				},
					h(PinIcon, { key: "pin" }),
					h("span", { key: "title", className: "dsh-pb-title" }, title),
					h("button", {
						key: "unpin",
						type: "button",
						className: "dsh-pb-unpin",
						title: t("unpin"),
						"aria-label": t("unpin"),
						onClick: (event) => {
							event.stopPropagation();
							unpin(id);
						},
					}, h(CloseIcon, null)),
				);
			});

			if (host === null) return null;

			const root = h("div", {
				className: cls("dsh-pb-root", dropzone && "dsh-pb-dropzone"),
				onDragOver: (event) => {
					if (sourceRef.current === null) return;
					event.preventDefault();
					event.stopPropagation();
					if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
					setDropzone(true);
					setDropAt(visible.length);
				},
				onDragLeave: (event) => {
					if (event.currentTarget.contains(event.relatedTarget)) return;
					setDropzone(false);
					setDropAt(null);
				},
				onDrop: (event) => {
					takeDrop(event, visible.length);
				},
			},
				h("button", {
					type: "button",
					className: "dsh-pb-head",
					"aria-expanded": !collapsed,
					title: t(collapsed ? "expand" : "collapse"),
					onClick: toggleCollapsed,
				},
					h("svg", {
						className: "dsh-pb-caret",
						width: 10,
						height: 10,
						viewBox: "0 0 24 24",
						"aria-hidden": "true",
						focusable: "false",
					}, h("path", {
						fill: "currentColor",
						d: collapsed
							? "M9.3 5.9 7.9 7.3 12.6 12 7.9 16.7 9.3 18.1 15.4 12z"
							: "M5.9 9.3 7.3 7.9 12 12.6 16.7 7.9 18.1 9.3 12 15.4z",
					})),
					h("span", { className: "dsh-pb-heading" }, t("title")),
					h("span", { className: "dsh-pb-count" }, String(visible.length)),
					dropzone && h("span", { className: "dsh-pb-hint" }, t("dropHere")),
				),
				!collapsed && visible.length === 0 && h("div", { className: "dsh-pb-empty" }, t("empty")),
				!collapsed && h("div", { className: "dsh-pb-list" }, rows),
				error !== null && h("div", { className: "dsh-pb-error" }, error),
			);

			return ReactDOM.createPortal(root, host);
		}

		/**
		 * The panel share is a framework standard prop; when the host provides it,
		 * read it in a component of its own so `PinnedBar` itself never calls a hook
		 * conditionally. Without it the bar simply never suppresses the highlight.
		 */
		function PinnedBarWithPanel(props) {
			const panelActive = props.usePanelInfo((info) => info.activePanelId !== null);
			return h(PinnedBar, { ...props, panelActive });
		}

		/** Services required by the pinned session bar. */
		const inject = ["slots", "locale", "workspaces", "sessions", "uiWorkspace"];

		/**
		 * Register the bar into the shell overlay as a portal host.
		 * @param ctx - Client root context.
		 */
		function apply(ctx) {
			// The stylesheet is installed, never torn down. A hot reload runs the
			// outgoing fiber's disposers around the incoming fiber's startup, so a
			// disposer here deletes what the new instance just installed — which is
			// exactly how the bar lost its styles after repeated reloads.
			ensureStyle();

			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "pinned-bar: dictionaries");

			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "pinned-session-bar",
				order: 11,
				label: () => t("label"),
				locale: NS,
			}, (slotProps) => {
				const shared = {
					...slotProps,
					t,
					workspaces: ctx.workspaces,
					sessions: ctx.sessions,
					uiWorkspace: ctx.uiWorkspace,
				};
				return typeof slotProps?.usePanelInfo === "function"
					? h(PinnedBarWithPanel, shared)
					: h(PinnedBar, { ...shared, panelActive: false });
			}));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
