# ConsCell —— 开发者手册

面向贡献者的一切：目录结构、架构、两个 Lisp 引擎、worker 协议、测试、
artifacts 与发布流程。面向用户的内容请先读
[README.zh-CN.md](README.zh-CN.md)（English: [Developer-Manual.md](Developer-Manual.md)）。
按 sprint 记录的开发历史在 `Sprints/SprintN/`（目标 → 实现 → 测试日志 →
下个 sprint 提案）；本手册是这些内容的稳定横截面。

## 仓库结构

```
app/                      IDE 本体（Vite + React + TypeScript）
  src/                    主线程代码
    lisp/                 runtime 客户端：引擎阶梯、worker 协议、
                          marker 解析（runtime.ts、types.ts）
    store/                zustand stores（workspace、project、cells、ui）
    components/ide/       Toolbar、StatusBar、ExplorerPanel、
                          SettingsDrawer、Cell、SessionPanel、
                          CommandPalette 等
    project/              项目加载、zip 导入/导出、示例
    plot/                 ;;PLOT64 payload → gnuplot 解析（含函数曲线的
                          表达式求值器）→ SVG 渲染
    session/              cells、transcript、历史/lineage
  public/
    wecl/ + wecl-worker.js      ECL 引擎（WECL image + 手写 worker）
    sbcl/*.gz + sbcl-worker.js  SBCL 引擎（wasm32-wasip1 artifacts +
                                手写的浏览器宿主 worker）
    sample-projects/cl-plot.zip
    sw.js                 service worker：首次加载后可离线，缓存以应用
                          版本命名
  scripts/                Node harness（整个测试套件）、浏览器 smoke、
                          artifact 抓取、smoke 摘要
Sprints/                  sprint 记录（Sprint 1 …… 至今）
CHANGELOG.md · RELEASE.md 已发布内容，以及如何发布
.github/workflows/ci.yml  lint · build · 全部 harness（PR 与 dev）
```

工具链：Node 22、pnpm 10、TypeScript strict、ESLint（零警告）。
没有后端 —— 一切都在浏览器里运行。

## 一页架构

```
主线程                          worker 线程（每个引擎一个）
────────                        ─────────────────────────────
UI（React stores）              经典 Web Worker，运行 Lisp image
  │  runtime.ts（LispRuntime）    • ECL：wecl-worker.js + WECL（Emscripten）
  │    eval/loadProject 等 →      • SBCL：sbcl-worker.js —— 手写的
  │      postMessage 或             WASI shim + sbcl_host 契约，
  │      SharedArrayBuffer 邮箱     由我们控制的 WASI stdin 驱动 REPL
  │  ◄── 带 ;; marker 的 stdout/stderr 行、done/joberror 等
```

两个引擎说**同一套线上协议**（`WorkerInMessage` / `WorkerOutMessage`，
`src/lisp/types.ts`），因此主线程与引擎无关。一个 job 的输出按行解析
marker（`runtime.ts` 的 `parseEclOutput`）：

| marker | 流 | 含义 |
|---|---|---|
| `;;=> value` | stdout | 每行一个返回值（无值时为 `; no values`） |
| `;;ERROR:` / `;;ERRTYPE:` / `;;DETAIL:` | stderr | 错误、其 `type-of`、condition 槽位 |
| `;;WARNING:`（定位形式：`path\|offset\|text`） | stderr | 警告 |
| `;;PACKAGE:` | stdout | 下一个 job 读取时的 reader package |
| `;;FILE:/;;PKG:/;;SYM:/;;NOTE:/;;HINT:/;;DEF:` | stdout | 项目加载进度 |
| `;;PLOT64 <base64>` | stdout | gnuplot 捕获 → 浏览器内 SVG |
| `;;READ-WAIT` / `;;DEBUG:/;;RESTART:/;;DEBUG-WAIT` | stderr | stdin 请求 / 调试器暂停 |
| `;;MODULES-CHANGED` | stdout | 将 /modules 持久化到 IndexedDB |

marker **由活在每个 worker 里的 Lisp helper（`cc` package）输出** ——
分别位于 `wecl-worker.js` 的 `CC_HELPER_SRC` 与 `sbcl-worker.js` 中的
SBCL 移植版。两者都是纯 CL 源码字符串；修改 marker 语义时两处必须同步。

### 引擎阶梯

`LispRuntime.init()` 按 preference 启动引擎（`src/lisp/engine-pref.ts`）：
默认值（`auto`）**SBCL 优先** —— SBCL 无法启动时
（artifacts 缺失、页面非 crossOriginIsolated）由 ECL 接管 —— 之后是
JSCL（CDN，CL 子集）→ 内置 mock；`ecl` 表示仅 ECL、不 fallback。状态
呈现为 `ready-sbcl` / `ready-ecl` / `ready-jscl` / `ready-mock`。smoke
注意：通用 scenario 显式固定 `ecl`；`sbcl` scenario 自设 preference。

### ECL worker（`public/wecl-worker.js`）

加载自托管的 WECL image（`/wecl/`），捕获 stdout/stderr，bootstrap
`cc` helper，双向 `postMessage`。其中值得注意的技巧：fast setjmp
trampoline 补丁（Sprint 7）、对 `ext:shell` 的 gnuplot 拦截、dummy-ASDF
处理。请求走普通 `postMessage`；求值经 Asyncify 异步化并串行执行。

### SBCL worker（`public/sbcl-worker.js`）

为 SBCL wasm port（github.com/yfyang86/sbcl，`wasm-dev` 分支 —— 见其
`SBCL-Handoff.md`）从零编写的浏览器宿主：

- **WASI preview1 shim**，架在内存文件系统之上（args、environ、时钟、
  fd、preopen、readdir、poll；文件写按 fd 缓冲、close 时提交）。标准
  fd 报告为 **character device** —— SBCL 的 `unix-simple-poll` 因此短
  路、阻塞发生在 `fd_read` 里（filetype 0 会让它陷入 wasi-libc 的
  select 自旋）。
- **`sbcl_host` imports**：同步的 `instantiate`（编译 runtime 读入内存
  的 Lisp module、扩容共享 funcref table、对着 runtime 的
  memory/table 链接、全局唯一共享的 `lisp_unwind` WebAssembly.Tag）、
  `set_timer`、`run_process`（返回 −1）、`process_id`。i64/u64 import
  参数以 **BigInt** 到达 —— 务必先转换。
- **线程模型**：boot 之后 worker 线程永远在 `_start` 内部；页面通过
  SharedArrayBuffer 提交 job（一个 form 环形缓冲、一个 stdin 环形缓
  冲、一个单槽 JSON mailbox、一个中断标志位），由 WASI imports 内部
  消费；阻塞即 `Atomics.wait`。解码前先把字节从 SAB 拷出 —— 浏览器
  的 TextDecoder 拒绝 shared view。每个喂入的 form 以 `;;CC-DONE`
  marker 结尾（即 job 完成），并带一个尾部空行（否则 SBCL 的 reader
  会把已缓冲的 form 悬置）。
- **启动要求**：SharedArrayBuffer ⇒ 页面必须 crossOriginIsolated（COOP
  `same-origin` + COEP `credentialless`；`vite.config.ts` 已为 dev 与
  preview 配好 —— 静态托管站点也需要，否则引擎给出明确 bootfail 信息
  并退回 ECL）。Node 需要
  `--experimental-wasm-exnref`（harness 会自我重启并附加该参数）。
- **项目加载**：若存在则最先加载 `ext-compat.lisp` —— 面向 ECL 的
  system 在读取期就需要 `EXT:SHELL`/`EXT:CD`；dummy ASDF package 加一
  个 `*module-provider-functions*` 条目，让 `(require :asdf)` 与
  `(asdf:load-system …)` 正常工作；gnuplot 捕获会在每个文件加载后重新
  替换 `EXT:SHELL`（loader 文件可能自行重载 `ext-compat.lisp` 把它换
  回去）。该 port 构建不支持 `(directory …)` 枚举 —— 文件清单需显式
  传递。

## 测试

所有 harness 都是 `app/scripts/` 下的纯 Node 脚本 —— 无测试框架、确
定性、各自以 0/1 退出。`pnpm test` 串起全部；CI 跑 lint → build → 每
个 harness。

- 纯 TS（10 个）：transcript、search、outline、editor-state、
  session-history（含 Ctrl+R 的合并列表）、fold、lineage、plot（gnuplot
  子集解析、表达式求值、SVG 构建）、smoke-summary、sbcl-artifacts
  （用合成数据测 gzip 加载器）。
- 真实 ECL image（6 个）：`boot-harness.mjs`（在 `vm` 沙箱里启动真实
  worker + wasm；`--exercise` 端到端加载 cl-plot 示例，含 SVG 渲染与多
  序列绘图），package、settings、debugger、stdin、perf 复用同一模式。
- 真实 SBCL image（1 个）：`sbcl-test.mjs` 在真实 `worker_threads` 线程里启动
  `sbcl-worker.js`（SAB/Atomics 行为与浏览器一致），覆盖求值、错误、
  package、项目加载、stdin、timer、调试器暂停、无限递归、中断确认、
  模块持久化、cl-plot 示例与多序列绘图。artifacts 缺失时跳过（exit 0）。
- 浏览器：`smoke:browser`（Playwright/Chromium，`--only name`、
  `--list`、`--json report`）—— 11 个 scenario：debugger、stdin、
  definitions、transcript、persistence、replace、landing（含文档站）、
  history、sbcl、engine、offline（service worker）。`dist/` 过旧时拒绝
  运行（除非 `--allow-stale`）。CI 的 `smoke` job 在带 `smoke` 标签的
  PR 与每次推送到 `dev` 时运行。

改动 worker 或 helper 时，至少运行：

```sh
cd app
pnpm test:boot -- --exercise      # ECL，真实 image + 示例
pnpm test:sbcl                    # SBCL，真实 image
pnpm smoke:browser -- --only sbcl # 涉及 UI/引擎可见行为时
```

## SBCL artifact 流水线

artifacts 从 sbcl 仓库构建（`wasm-dev` 分支，
`./build-wasm-darwin-arm64.sh`，约 35 分钟；新 clone 里
`version.lisp-expr` 必须非空）。`scripts/fetch-sbcl.mjs [--gzip]` 把
`sbcl.wasm` / `sbcl.core` / `sbcl-core.wasm` 拷入被 gitignore 的
`public/sbcl/`；**只有 `.gz` 副本纳入 git**（合计约 19 MB，
`.gitignore` 中的 `!app/public/sbcl/*.gz`）—— runtime、core 与 core
module 必须出自同一次构建（port 的 sprint 之间 ABI 会变）。worker 优先
抓取 `.gz` 并用 DecompressionStream 解压。同步 artifacts 后，提交前运行
`pnpm test:sbcl`。

## 约定

- 工作以 **sprint** 落地：`sprintN` 分支 → PR 进 `dev` → CI 绿 → 合
  并；`Sprints/SprintN/` 记录全过程（01 目标/计划 …… 04 下期提案）。
  chore 类改动可直接提交 `dev`。
- 每个行为变更在首次被触及时配上 harness 或 smoke 断言 —— 曾有多
  个只在浏览器出现的 bug 恰恰因为某条路径从未被测过（见
  Sprints/Sprint25）。
- 不经 harness 可见理由不引入新依赖；不做后端。
- 遵循现有风格：TS strict；worker 为手写纯 JS（`/* eslint-disable */`、
  偏 ES5 写法）；marker 协议优先。

## 发布流程

完整清单见 [RELEASE.md](RELEASE.md)；简述：

1. 在 `dev` 上 `pnpm check` 全绿（lint + build + 全部 harness），并对
   新构建的 `pnpm build` 跑全量 `pnpm smoke:browser`。
2. 版本号只存在于 `app/package.json`：`vite.config.ts` 由它定义
   `__APP_VERSION__`，供 boot 界面、About 与 service worker 注册
   （`./sw.js?v=<version>`，它同时命名缓存 —— 新版本激活时丢弃旧缓存）
   使用。
3. PR `dev` → `main`，CI 绿后合并；在合并提交上打 `v<version>` tag；
   GitHub release 的说明取自 `CHANGELOG.md` 对应条目。
4. 部署 `app/dist/`，务必带上 `Cross-Origin-Opener-Policy: same-origin`
   与 `Cross-Origin-Embedder-Policy: credentialless`（SBCL 引擎需要；
   ECL 无此要求）；`sw.js` 放在站点根目录且不要长期缓存；每个 SPA 路由
   都返回 `index.html`。

## 已知的未尽事项

- 向 Lisp 投递 Ctrl-C 在 sbcl port 侧尚未实现（`wasm-arch.c`）——
  `interrupt()` 以重启 SBCL image 代替；待某次 port 构建支持后移除重
  启逻辑。
- 无 COOP/COEP 的静态托管上的 SBCL：退回 ECL（boot log 有明确信息）。
- 早期 git 历史里仍有未压缩的 SBCL artifacts（约 124 MB）；history
  重写已提案但未决（Sprints/Sprint26/04-next-sprint.md，条目 BK）。
