# 置顶会话栏

[English](README.md) · **中文**

一个 **DeepSeek Harness（DSH）Web GUI 客户端插件**：在侧栏**工作区/会话列表正上方**新增一条独立的「置顶」栏，把所有置顶 session 集中显示在那里，并支持在工作区列表与置顶栏之间互相拖动。

## 功能

- **集中展示置顶会话** —— 读取 Host 持久化的置顶集合（`ctx.workspaces.list` → `pinnedSessionIds`），把置顶 session 全部列在工作区列表上方。
- **跨容器拖动**
  - 把**工作区列表里的会话行拖到置顶栏**上 → 置顶（`ctx.workspaces.pinSession`），并排到栏首。
  - 把**置顶栏里的行拖回工作区列表** → 取消置顶（`ctx.workspaces.unpinSession`）。
  - 拖动悬停在栏上时，栏显示主色描边与「松开即可置顶」提示。
- **栏内拖动排序** —— 栏内上下拖动即可改变顺序，顺序保存在浏览器本地（`localStorage: dsh.pinnedBar.order.v1`）。
- **新置顶优先** —— 栏内没排过序的新置顶会话自动排到最前，与 DSH「置顶即置顶到首位」的语义一致；已经排好的行保持相对位置。
- **选中高亮** —— 当前正在查看的会话在栏里高亮（与内置列表同一判定：`retainedBy.mainView > 0`，全局面板活跃时不显示），并带 `aria-current`。
- **取消置顶按钮** —— 行悬停时出现 `✕`，效果与拖出相同。
- **打开会话** —— 点击行（或 Enter / 空格）打开该会话。
- **可折叠** —— 点击栏标题折叠/展开，状态记在 `localStorage: dsh.pinnedBar.collapsed.v1`。
- **窄栏自动隐藏** —— 侧栏收成 56px 轨道时，由容器查询自动隐藏该栏。

内置的会话列表**不受影响**：置顶行照旧显示在各自工作区分组的顶部。本栏是额外的集中视图，不替代它。

## 安装

### 从 GitHub 安装（推荐）

```
plugin_manager install_bundle target="github:YubaiLoving/dsh-pinned-session-bar"
```

也可以在 Web GUI 的**插件**页里粘贴同一个 spec。DSH 会安装该包、启用该组合包，页面重新加载后置顶栏即可出现。

### 手动安装

1. 把包放进 profile 的 `node_modules`：

```
~/.dsh/profiles/<profile>/node_modules/dsh-pinned-session-bar/
```

2. 在 `cordis.patch.yml` 里加一条 Loader 行，或者把该包写进 profile 的 `dsh.profile.bundles`：

```yaml
- insert:
    - id: ui-pinned-bar
      name: 'dsh-pinned-session-bar'
```

3. 刷新页面；若仍未出现再重启 DSH。

## 实现要点

| 关注点 | 做法 |
| --- | --- |
| 扩展点 | 注册进 `shell.overlay` 槽（`list`，root 作用域），用 `react-dom` 的 `createPortal` 渲染到侧栏 DOM |
| 挂载位置 | `[data-slot="sidebar.workspaces"]` **之前**的兄弟节点 —— 侧栏 region area 的顶部，即工作区列表正上方 |
| 数据来源 | 共享 Client 服务 `ctx.workspaces` / `ctx.sessions`，而不是槽位 props |
| 拖放协议 | 原生 HTML5 拖放 —— 内置浏览器拖拽自身行用的就是它，只有同一协议才能让会话在两个容器间移动。`document` 捕获阶段 `dragstart` 用 `[data-row-key^="session:"]` 识别外部行，`dragover` 让放置全程合法，`drop` 把「拖回列表」判定为取消置顶 |
| 选中行 | 与 ui-workspace 一致：`retainedBy.mainView > 0` 的会话；面板 share 通过 `usePanelInfo` 标准 prop 读取（缺失时退化为不高亮） |
| 排序归属 | Host 只管置顶集合，栏自己只管展示顺序（浏览器本地），与内置浏览器保存自身视图状态的方式一致 |
| 依赖 | 只用平台基座模块 `react` 与 `react-dom`；图标为内联 SVG |
| 稳定性 | `MutationObserver` + `requestAnimationFrame` 重新断言挂载点；拖放源存在 ref 里，避免 React 提交与手势竞态；样式只安装、不拆除 —— 热重载时旧 fiber 的 disposer 会跑在新 fiber 启动之间，拆除会误删新实例刚注入的样式 |

之所以用 DOM 插入挂载：`sidebar.workspaces` 是 `single` 槽，替换它会整体遮蔽内置浏览器；而侧栏在该槽上方没有声明 `list` 槽，因此没有可注册的增量席位。

## 环境要求

- 带浏览器界面的 DSH Web GUI（`@deepseek-ai/dsh-web-app`）；开发与验证基于 **DSH 0.2.0-rc.2**。
- 依赖两个 DOM 契约：`[data-slot="sidebar.workspaces"]` 与 `[data-row-key^="session:"]`。

## 已知限制

- 依赖上述两个 DOM 契约；若未来 DSH 改动槽位标记或行键，需要同步更新对应选择器。
- 栏的排序是浏览器本地的，与内置列表的「手动排序」互不影响（那份状态属于 ui-workspace 自己的视图存储）。
- 把行拖回列表只做「取消置顶」，落到列表中的具体位置仍由内置浏览器的排序规则决定。
- 侧栏收成轨道时该栏隐藏，此时不支持拖动。

## 开发

```bash
node test/smoke.mjs
```

冒烟测试在 stub 的浏览器模块加载框架（React / DOM / 服务）里执行 `lib/client.js`，覆盖注册、排序、选中高亮、栏内重排、拖入置顶、拖出取消置顶、折叠、打开与键盘路径。它无法验证真实布局与在线服务，但会执行到发布 bundle 的每一条代码路径。

## 许可证

[MIT](LICENSE)
