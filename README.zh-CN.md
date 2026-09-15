# ConsCell

**一个完全运行在浏览器里的 notebook 风格 Common Lisp IDE。**
真正的 Common Lisp，编译为 WebAssembly —— 无服务器、免安装、数据不出本机。

```lisp
(mapcar (lambda (n) (* n n)) '(1 2 3 4))   ; ⇒ (1 4 9 16)
```

（本文档为中文版；English version: [README.md](README.md)）

## 你能得到什么

- **两个真实的 Lisp 引擎**，可在 Settings 中切换：
  - **SBCL**，编译为 `wasm32-wasip1` —— 默认引擎（公有领域，部分为
    MIT/BSD 式授权；也是我们自己的 WebAssembly 工作的基础）。
  - **ECL**（Embeddable Common Lisp，ANSI CL）编译为 WebAssembly ——
    当 SBCL 无法启动时（artifacts 缺失，或托管站点缺少 isolation
    headers）自动接管作为 fallback，也可随时手动选择。两种引擎下编辑
    器、cell 与项目工具完全一致。
- **Notebook 会话**：求值一个 form 或整个 buffer（`Ctrl+Enter`），每次
  运行生成一个结果 cell —— 返回值、打印输出、警告、带 condition 细节
  的错误、耗时，以及渲染为 SVG 的 gnuplot 图形。
- **真正的编辑器**：CodeMirror，Lisp 语法高亮、括号匹配、按 buffer 的
  undo、脏标记、自动保存、buffer 标签页、定义大纲（`Ctrl+Shift+O`）与
  工作区搜索（`Ctrl+Shift+F`）。
- **项目管理**：打开本地文件夹（或导入 ZIP / 一组文件），编辑保存，然
  后 **Load Project into Runtime** —— ASDF system 按 `:components` 顺序
  加载，每个文件逐个 top-level form 加载，一个坏 form 不会中断整个加
  载。试试内置示例：*Open sample project: cl-plot*。
- **交互式调试**：出错时 image 可以暂停并给出当前可用的 restart
  （retry、store-value、define-function、abort，项目加载时还有
  skip-form）。标准输入同样可用：`(read-line)` 会暂停 cell 等你输入一
  行。
- **运行时内的包管理**：把项目作为模块安装 / 列出 / 加载 / 卸载
  （`(package-install "name")`），通过 IndexedDB 在页面刷新后保留。
- **一切皆本地**：项目、编辑器状态与模块都保存在你的浏览器里，求值发
  生在 Web Worker 中。无遥测、无后端、无需账号。

## 运行

最快的方式是使用已部署的托管版本。若要从源码本地运行：

```sh
cd app
pnpm install
pnpm dev            # http://localhost:3000
```

环境要求：Node 22+ 与 pnpm 10。ECL 的 wasm image 随仓库分发。
**SBCL** 引擎额外需要其 artifacts（约 19 MB，以 `.gz` 形式纳入 git）——
完整 checkout 时已位于 `app/public/sbcl/`。

## 选择引擎

Settings → **Lisp implementation**：`auto`（默认 —— SBCL 优先；SBCL
无法启动时依次退到 ECL、JSCL 与 mock）、`sbcl` 或 `ecl`。切换在下一
次 runtime 重启（工具栏 ↻）后生效。

|  | SBCL（默认） | ECL（fallback） |
|---|---|---|
| 标准 | SBCL 2.4.8，wasm32-wasip1 | ANSI CL，WECL/wasm |
| 授权 | 公有领域 + MIT/BSD 式部分（见上游 `COPYING`） | LGPL-2.1+（原样分发的 fallback） |
| 启动时间 | 约 4–5 秒（19 MB 的 .gz artifacts） | 约 1 秒 |
| 项目、cell、包、调试器、stdin | ✓ | ✓ |
| gnuplot 绘图（cl-plot） | ✓ 捕获并渲染为 SVG | ✓ 捕获并渲染为 SVG |
| 中断（Ctrl+.） | 重启 image（该 port 尚无法把 Ctrl-C 送入 Lisp） | 重启 image |
| 托管要求 | 页面需 crossOriginIsolated（COOP/COEP headers —— vite dev/preview 已发送） | 无 |
| 已知差异 | — | — |

SBCL 的其他已知限制：不支持 `(directory …)` 枚举；30 位 fixnum。

若 SBCL 无法启动（artifacts 缺失，或托管站点缺少 isolation headers），
IDE 会在 boot log 中说明原因并退回 ECL。

## 一分钟上手

1. 打开 IDE，状态栏显示 `SBCL · WASM`。
2. 输入 `(defun hello () (format t "hi ~a" :world))`，按 `Ctrl+Enter`。
3. 换行输入 `(hello)` —— cell 里出现打印输出和返回值。
4. `Ctrl+K` → *Open sample project: cl-plot* → *Load Project into
   Runtime*：七个文件按 system 顺序加载，示例的 gnuplot 图形被捕获并
   直接在会话中渲染为 SVG。
5. `(/ 1 0)` —— 一个完整的 condition cell：类型、消息、操作数。开启
   *pause on error* 后，你会看到实时 restart 列表而不是单纯报错。

常用快捷键：`Ctrl+Enter` 求值 · `Ctrl+Shift+Enter` 求值整个 buffer ·
`Ctrl+.` 中断 · `Ctrl+K` 命令面板 · `Ctrl+B` 项目面板 · `Ctrl+R` 输入
历史 · `Ctrl+Shift+F` 搜索 · `Ctrl+Shift+O` 大纲 · `Ctrl+S` 保存。

## Alpha 阶段的限制

- 每个标签页一个 Lisp image；image 单线程（无 `sb-thread`）。
- Lisp 内无网络（WASI/Emscripten 没有 socket）、无子进程 ——
  `(ext:shell)` 之类的调用会被拦截或以干净的错误报告。
- JSCL fallback（CDN）是 CL 子集，不是完整 Common Lisp。
- 会话持久化保存 cell、buffer 与模块 —— 不保存整个 heap：页面刷新后
  定义需要重新加载（点一下 Load Project 即可）。

## 授权说明

- **ConsCell 自身代码** —— MIT，见 [LICENSE](LICENSE)。覆盖 IDE、
  worker 以及本仓库中的 WebAssembly 移植工作。
- **SBCL**（默认引擎）—— 主体为公有领域，部分文件为 MIT 式与 BSD 式
  授权；以 SBCL 源码树中的 `COPYING` 为准。此处使用的 `wasm32-wasip1`
  port 是我们对该源码的重新实现
  （[yfyang86/sbcl](https://github.com/yfyang86/sbcl)）；
  `app/public/sbcl/` 下的 `.gz` 构件由它构建。
- **ECL / WECL** —— LGPL-2.1+（Daniel Kochmański 的 Embeddable Common
  Lisp WebAssembly 构建）。ConsCell 原样分发 WECL 二进制作为 fallback
  引擎，保留其授权声明，且不与之链接：IDE 通过 worker 消息协议与其
  通信。源码可从 ECL 项目获得；ConsCell 不以它为核心依赖。
- **cl-plot**（内置示例）—— MIT，© Martin Kersner（其 LICENSE 文件在
  示例 zip 内）。

---

状态：**alpha**（v1.0.0-alpha）。参与开发请参阅
[Developer-Manual.zh-CN.md](Developer-Manual.zh-CN.md)。
