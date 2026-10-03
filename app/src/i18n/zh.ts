/* Chinese (simplified) dictionary. English strings are the keys — an entry
 * missing here simply renders English. Terms follow README.zh-CN.md and
 * Developer-Manual.zh-CN.md: engine names (SBCL/ECL/JSCL/WASM), buffer,
 * package, cell, restart, transcript 等按项目文档的既定译法；无合适中文的
 * 术语保留英文。 */
export const ZH: Record<string, string> = {
  /* -------- nav / marketing shell -------- */
  'Features': '功能',
  'Examples': '示例',
  'Docs': '文档',
  'Launch IDE': '启动 IDE',
  'Close menu': '关闭菜单',
  'Open menu': '打开菜单',
  'Product': '产品',
  'Learn': '学习',
  'Project': '项目',
  'Common Lisp': 'Common Lisp',
  'HyperSpec': 'HyperSpec',
  'Changelog': '更新日志',
  'License — MIT': '许可证 — MIT',
  'The browser is the Lisp machine.': '浏览器即 Lisp 机器。',
  '© 2025 MartingaleCell — runs 100% client-side. No code ever leaves your machine.':
    '© 2025 MartingaleCell — 100% 在客户端运行，代码永不离开你的机器。',

  /* -------- hero -------- */
  'SBCL & ECL · WebAssembly · zero install': 'SBCL 与 ECL · WebAssembly · 零安装',
  'Common Lisp,': 'Common Lisp，',
  'running on nothing': '不依赖任何服务器，',
  'but your': '只运行在你的',
  'browser.': '浏览器里。',
  'MartingaleCell runs SBCL (and ECL as a fallback) compiled to WebAssembly and wraps it in a notebook-style IDE — syntax-highlighted editor, persistent result cells, a real condition system with restarts. No servers. No setup. Your code never leaves the tab.':
    'MartingaleCell 将编译为 WebAssembly 的 SBCL（ECL 作为后备）包装成一个笔记本式 IDE —— 语法高亮编辑器、持久化的结果 cell、带 restart 的真实 condition 系统。没有服务器，无需安装，你的代码永远不会离开这个标签页。',
  'Launch the IDE': '启动 IDE',
  'Browse examples': '浏览示例',
  '( loads in ~4s · works offline · MIT licensed )': '（约 4 秒加载 · 可离线使用 · MIT 许可）',
  'scroll': '向下滚动',
  'WHY MARTINGALECELL': '为什么选择 MARTINGALECELL',
  'A Lisp machine with a browser address': '一台有网址的 Lisp 机器',
  'Everything you\'d expect from a serious Common Lisp environment — reimagined as a single web page.':
    '你对严肃 Common Lisp 环境的全部期待 —— 重新呈现为一个网页。',
  'Real SBCL and ECL, compiled to WASM': '真实的 SBCL 与 ECL，编译为 WASM',
  'Not a toy interpreter. SBCL by default, ECL as the fallback — full ANSI Common Lisp with a compiler and condition system, running in a Web Worker.':
    '不是玩具解释器。默认 SBCL、后备 ECL —— 完整的 ANSI Common Lisp，自带编译器和 condition 系统，运行在 Web Worker 中。',
  'Notebook-grade session': '笔记本级的会话',
  'Every evaluation lands in a persistent cell: echo, printed output, multiple values, warnings. Copy, re-run, or paste any cell back into the editor.':
    '每次求值都落入一个持久的 cell：回显、打印输出、多值、警告。复制、重跑，或把任意 cell 粘贴回编辑器。',
  'True conditions & restarts': '真正的 condition 与 restart',
  'Errors aren\'t dead ends. The debugger lists live restarts — abort, retry, use-value — and clicking one resumes your program, exactly like CL demands.':
    '错误不是死胡同。调试器列出可用的 restart —— abort、retry、use-value —— 点击即从该点恢复程序，完全符合 CL 的要求。',
  'An editor that speaks S-expr': '一门懂 S 表达式的编辑器',
  'Rainbow parens, depth-aware indent, arglist hints, symbol autocomplete, and structural selection. Parentheses stop being scary.':
    '彩虹括号、按深度缩进、参数列表提示、符号自动补全、结构化选取。括号从此不再可怕。',
  'Projects, not just snippets': '项目管理，而不只是代码片段',
  'Open a real folder (or import a ZIP), edit files with dirty tracking and true saves, then load the whole tree into the runtime — ASDF systems included — and call your code. Loaded symbols flow into autocomplete.':
    '打开真实的文件夹（或导入 ZIP），带脏标记编辑、真正保存文件，然后把整棵目录树载入运行时 —— 包括 ASDF 系统 —— 直接调用你的代码。已载入的符号会进入自动补全。',
  '100% client-side': '100% 客户端',
  'No backend, no telemetry. Buffers and history persist in IndexedDB; share links carry code in the URL. Works on a plane.':
    '没有后端，没有遥测。buffer 与历史持久化在 IndexedDB；分享链接把代码放在 URL 里。飞机上也能用。',
  'Logs that respect you': '尊重你的日志',
  'A filterable console with levels, sources, timestamps, and a live WASM heap meter. Boot sequences, compiler notes, eval traces — all inspectable.':
    '可过滤的控制台：级别、来源、时间戳，还有实时 WASM 堆表。启动序列、编译器附注、求值轨迹 —— 全部可查。',
  'Your next REPL session is one click away.': '你的下一次 REPL 会话只需一次点击。',
  'Open the IDE, press': '打开 IDE，按下',
  ', and you\'re programming Common Lisp.': '，即可开始编写 Common Lisp。',
  'Launch MartingaleCell': '启动 MartingaleCell',
  'no account · no install · no kidding': '无需账号 · 无需安装 · 不是玩笑',
  'Editor — scratch.lisp': '编辑器 — scratch.lisp',
  'Session — CL-USER': '会话 — CL-USER',
  'Session — debugger': '会话 — 调试器',
  '[0] ABORT — return to top level': '[0] ABORT — 返回顶层',
  '[1] RETRY — re-evaluate the form': '[1] RETRY — 重新求值该表达式',
  '[2] USE-VALUE — supply a value to use': '[2] USE-VALUE — 提供一个替代值',
  'HOW IT WORKS': '工作方式',
  'Write': '编写',
  'A real editor — highlighting, completion, structural editing.': '真正的编辑器 —— 高亮、补全、结构化编辑。',
  'Evaluate': '求值',
  'One keystroke sends the form at point to the Lisp engine — values, output, and timing come back as a cell.':
    '一个按键把光标处的表达式送往 Lisp 引擎 —— 值、输出和耗时作为一个 cell 返回。',
  'Inspect': '检视',
  'Conditions surface as interactive restarts. The log records everything. Nothing is swallowed.':
    'condition 以可交互的 restart 呈现。日志记录一切，不会吞掉任何信息。',
  'ecl/wasm ready': 'ecl/wasm 就绪',
  'This is a live preview — the real thing runs SBCL or ECL': '这是静态预览 —— 真实页面运行 SBCL 或 ECL',
  'COVERAGE': '覆盖度',
  'Serious about the standard': '认真对待标准',
  'Track ANSI Common Lisp support feature by feature.': '逐项跟踪 ANSI Common Lisp 的支持情况。',
  'See the full matrix': '查看完整对照表',

  /* -------- examples gallery -------- */
  'Gallery': '示例集',
  'Twelve programs. Zero setup.': '十二个程序，零配置。',
  'Every example runs in the browser Lisp engine (SBCL or ECL) — ANSI Common Lisp compiled to WebAssembly. Pick one, and it opens in the IDE with the session ready — just press':
    '每个示例都运行在浏览器里的 Lisp 引擎（SBCL 或 ECL）上 —— 编译为 WebAssembly 的 ANSI Common Lisp。任选一个，它会在 IDE 中打开并准备好会话 —— 按下',
  'No examples match that filter.': '没有符合该筛选条件的示例。',
  'Reset filters': '重置筛选',
  'Have a snippet of your own?': '有自己的代码片段？',
  'Open a blank buffer and start consing.': '打开空白 buffer，开始 cons 吧。',
  'Open empty IDE': '打开空白 IDE',
  'MartingaleCell is built for keyboards — best experienced on desktop.': 'MartingaleCell 为键盘而生 —— 桌面端体验最佳。',
  'Dismiss': '知道了',

  /* -------- toolbar / engine pill -------- */
  'evaluating': '求值中',
  'starting runtime…': '正在启动运行时…',
  'Mock': '模拟引擎',
  'runtime crashed — restart': '运行时已崩溃 — 请重启',
  'Reader package': '读取器 package',
  'No examples available': '暂无示例',
  'Click to rename': '点击重命名',
  'unsaved changes': '未保存的修改',
  'Toggle project explorer (Ctrl B)': '切换项目浏览器 (Ctrl B)',
  'Evaluate form at point': '求值光标处的表达式',
  'Interrupt evaluation (Ctrl .)': '中断求值 (Ctrl .)',
  'Restart Lisp image': '重启 Lisp 镜像',
  'Share (copies URL)': '分享（复制 URL）',
  'Settings': '设置',
  'Command palette (Ctrl K)': '命令面板 (Ctrl K)',
  'Evaluating…': '求值中…',
  'All': '全部',
  'Interrupt': '中断',
  'Back to home': '返回首页',
  'About': '关于',
  'Back to site': '返回网站',

  /* -------- settings drawer -------- */
  'Editor': '编辑器',
  'Font size': '字体大小',
  'Tab width': 'Tab 宽度',
  'Rainbow parens': '彩虹括号',
  'Ligatures': '连字（ligature）',
  'Line wrap': '自动换行',
  'Evaluation': '求值',
  'Default mode': '默认模式',
  'Auto-eval on save': '保存时自动求值',
  'Pause in debugger on error': '出错时暂停在调试器',
  'Print length': '打印长度（*print-length*）',
  'Transcript value limit': '转录值截断长度',
  'compile: each form goes through the bytecodes compiler first. Print length sets':
    'compile：每个表达式先经过字节码编译器。打印长度设定',
  'in the image (nil = unlimited). The transcript value limit clips long values in exported transcripts (whole = as printed).':
    '镜像中的打印上限（nil 表示不限）。转录值截断长度会在导出转录时截断过长的值（whole 表示按原样保留）。',
  'Runtime': '运行时',
  'Lisp implementation': 'Lisp 实现',
  'SBCL/wasm boots on the next restart (ECL if its artifacts are missing)':
    '下次重启时以 SBCL/wasm 启动（若其构件缺失则用 ECL）',
  'ECL boots on the next restart — no fallback to another engine':
    '下次重启时以 ECL 启动 —— 不会回退到其他引擎',
  'Automatic: SBCL, then ECL, then JSCL, then the demo interpreter':
    '自动：SBCL，然后 ECL，再 JSCL，最后演示解释器',
  'Restart now': '立即重启',
  'auto: SBCL, then ECL, then JSCL, then the demo · ecl: ECL only · sbcl: SBCL/wasm, ECL if it cannot boot. Takes effect on Restart Lisp image.':
    'auto：SBCL → ECL → JSCL → 演示引擎 · ecl：仅 ECL · sbcl：SBCL/wasm，启动失败则用 ECL。在重启 Lisp 镜像后生效。',
  'SBCL memory': 'SBCL 内存',
  'SBCL memory uncapped — applies on the next SBCL boot': 'SBCL 内存未设上限 —— 下次 SBCL 启动时生效',
  'A total linear-memory ceiling for the SBCL engine (off by default). The image is ~230 MB at rest; cap it to keep embedded preview panes from being OOM-killed. Hitting the cap crashes the image with a clear message (raise it or switch to ECL).':
    'SBCL 引擎的线性内存总上限（默认关闭）。镜像静置时约占 230 MB；设置上限可避免嵌入式预览窗格被 OOM 杀掉。触顶时镜像会崩溃并给出明确提示（调高上限或改用 ECL）。',
  'Log verbosity': '日志详细度',
  'quiet: boot lines at DEBUG · normal: INFO · verbose: also engine stderr noise. Heap size is fixed by the WECL build (memory grows on demand).':
    'quiet：启动行记为 DEBUG · normal：INFO · verbose：还记录引擎 stderr 噪声。堆大小由 WECL 构建固定（内存按需增长）。',
  'Workspace': '工作区',
  'Autosave': '自动保存',
  'Export workspace (.json)': '导出工作区 (.json)',
  'Workspace exported': '工作区已导出',
  'Reset workspace': '重置工作区',

  /* -------- cells / debugger / input -------- */
  'collapse': '折叠',
  'expand': '展开',
  'Jump to source': '跳转到源码',
  'Dismiss warning': '忽略警告',
  'the program is reading a line — type it and press Enter': '程序正在读取一行 —— 输入后按 Enter',
  'Send this line': '发送这一行',
  'send ↵': '发送 ↵',
  'End of file (Ctrl+D)': '文件结束 (Ctrl+D)',
  'image paused · pick a restart': '镜像已暂停 · 选择一个 restart',
  'Takes a value — you will be asked for a form': '接受一个值 —— 稍后会要求你输入一个表达式',
  'value…': '值…',
  '; no restarts offered — decline to report the error': '; 没有可用的 restart —— 选择上报该错误',
  'use ↵': '使用 ↵',
  'Leave the debugger; the condition is reported as an error': '离开调试器；该 condition 将作为错误上报',
  'report as error': '作为错误上报',
  'keys 0–': '按 0–',
  'pick a restart': '选择 restart',
  'stuck?': '卡住了？',
  'interrupts': '次中断',
  'Taking long? Interrupt with': '耗时较长？可用',
  'imported': '已导入',
  'Appended from a transcript — not evaluated in this session': '从转录追加 —— 未在本会话中求值',
  'Copy cell': '复制 cell',
  'Cell copied': '已复制 cell',
  'Reload project': '重新载入项目',
  'Re-run': '重新运行',
  'Paste into editor': '粘贴到编辑器',
  'Open as buffer': '作为 buffer 打开',
  'Collapse': '折叠',
  'Delete': '删除',
  'queued': '排队中',
  're-run': '重新运行',
  '; Evaluation aborted': '; 求值已中止',
  '; no values': '; 无返回值',
  'engine round-trip': '引擎往返',
  'restarts used:': '使用的 restart：',
  'copy': '复制',
  '; type a form — Enter evaluates, ⇧Enter newline, ↑ history, Ctrl+Space complete':
    '; 输入表达式 —— Enter 求值，⇧Enter 换行，↑ 历史，Ctrl+Space 补全',

  /* -------- session panel -------- */
  'history': '历史',
  'type to search — ↑↓ or Ctrl R move, Enter recalls, Esc closes':
    '输入以搜索 —— ↑↓ 或 Ctrl R 移动，Enter 唤回，Esc 关闭',
  'Search session history': '搜索会话历史',
  'no match': '无匹配',
  'no history yet': '还没有历史',
  'Evaluate something.': '先求值点什么吧。',
  'evaluate form': '求值表达式',
  'evaluate all': '全部求值',
  'Session': '会话',
  'cell': '个 cell',
  'cells': '个 cell',
  'warning': '条警告',
  'warnings': '条警告',
  'history trimmed to last 1,000 cells': '历史已裁剪为最近 1,000 个 cell',
  'Copy all as transcript': '全部复制为转录',
  'Export session as Markdown (⇧click: .lisp transcript)': '导出会话为 Markdown（⇧点击：.lisp 转录）',
  'Scroll to bottom': '滚动到底部',
  'Clear session (Ctrl⇧L)': '清空会话 (Ctrl⇧L)',
  'JSCL fallback': 'JSCL 后备',
  'demo runtime': '演示运行时',
  'ECL could not be loaded. This rung has no debugger, no standard input, no packages and only a subset of ANSI Common Lisp. Restart the runtime once the network is back to get the real image.':
    'ECL 无法加载。这一档没有调试器、没有标准输入、没有包系统，只有 ANSI Common Lisp 的一个子集。网络恢复后重启运行时即可获得真实镜像。',
  'New result — jump to latest': '新结果 —— 跳转到最新',

  /* -------- confirm modals -------- */
  'This clears all definitions. Session cells are kept.': '这会清除所有定义。会话 cell 会保留。',
  'WebAssembly cannot be preempted — the runtime worker will be restarted. The current evaluation resolves as aborted; definitions are lost.':
    'WebAssembly 无法被抢占 —— 运行时 worker 将被重启。当前求值会以中止收场；定义会丢失。',
  'All buffers, cells and settings will be wiped and restored to defaults. Export first if you care about the contents.':
    '所有 buffer、cell 和设置都会被清空并恢复默认。在意内容的话请先导出。',
  'Workspace reset': '工作区重置',
  'Restart Lisp image?': '重启 Lisp 镜像？',
  'Interrupt evaluation?': '中断求值？',
  'Clear session cells?': '清空会话 cell？',
  'Replace the session with the transcript?': '用转录替换当前会话？',
  'Reset workspace?': '重置工作区？',
  'more': '更多',
  'Cancel': '取消',
  'Interrupt & restart worker': '中断并重启 worker',
  'Clear session': '清空会话',
  'Replace session': '替换会话',
  'Reset everything': '全部重置',

  /* -------- share modal -------- */
  'Share this buffer': '分享这个 buffer',
  'Contains your buffer, compressed. No server involved.': '包含压缩后的 buffer 内容。不经过任何服务器。',
  'Share link copied': '分享链接已复制',
  'Copy': '复制',
  'anyone opening the link gets the exact same editor state': '任何人打开该链接都会得到完全相同的编辑器状态',

  /* -------- editor panel / tabs -------- */
  'Unsaved changes in': '未保存的修改：',
  'This project file has unsaved changes. Save it before closing?': '该项目文件有未保存的修改。关闭前要保存吗？',
  'Close without saving': '不保存并关闭',
  'Save & close': '保存并关闭',
  'Keyboard shortcuts': '键盘快捷键',
  'Run history': '运行历史',
  'Re-run the latest run again': '再次运行最近一次运行',
  'Close': '关闭',
  'Go to this cell': '转到该 cell',
  'when': '时间',
  'status': '状态',
  'changed': '已更改',
  'input': '输入',
  'same as': '同',
  'values': '值',
  'error': '错误',
  'Evaluate top-level form at point': '求值光标处的顶层表达式',
  'Evaluate all top-level forms': '求值所有顶层表达式',
  'Interrupt evaluation': '中断求值',
  'Command palette': '命令面板',
  'Toggle project explorer': '切换项目浏览器',
  'New buffer': '新建 buffer',
  'Save buffers (project files + flush)': '保存 buffer（项目文件 + 刷新）',
  'Clear session cells': '清空会话 cell',
  'This reference': '本引用',
  'Autocomplete / symbol doc': '自动补全 / 符号文档',
  'Select enclosing s-expression': '选中包含的 S 表达式',
  'Move between top-level forms': '在顶层表达式间移动',
  'Choose restart (in a debugger cell)': '选择 restart（在调试器 cell 中）',

  /* -------- search panel -------- */
  'open buffers': '打开的 buffer',
  ' + project files': ' + 项目文件',
  'no matches': '无匹配',
  'Search workspace…': '搜索工作区…',
  'Search workspace': '搜索工作区',
  'Close search (Esc)': '关闭搜索 (Esc)',
  'Match case': '区分大小写',
  'Whole symbol': '完整符号',
  'Regular expression': '正则表达式',
  'Code only — skip strings and comments': '仅代码 —— 跳过字符串和注释',
  'Replace…': '替换…',
  'searching…': '搜索中…',
  'replacement': '替换内容',
  'Replacement': '替换',
  'confirm?': '确认？',
  'all': '全部',
  'buffer': 'buffer',
  'unavailable': '不可用',
  '(empty)': '（空）',

  /* -------- explorer panel -------- */
  'No project open. A project is just a folder of Lisp files.': '未打开项目。项目不过是一文件夹的 Lisp 文件。',
  'Open Folder…': '打开文件夹…',
  'Import ZIP…': '导入 ZIP…',
  'Upload Folder…': '上传文件夹…',
  'Reopen last project': '重新打开最近的项目',
  'Open sample project: cl-plot (MIT)': '打开示例项目：cl-plot (MIT)',
  'Explorer': '浏览器',
  'Load Project into Runtime (recursive, then call it)': '将项目载入运行时（递归载入后即可调用）',
  'Open a project first': '请先打开一个项目',
  'Search workspace (Ctrl⇧F)': '搜索工作区 (Ctrl⇧F)',
  'Outline of definitions (Ctrl⇧O)': '定义大纲 (Ctrl⇧O)',
  'New file': '新建文件',
  'New folder': '新建文件夹',
  'Project actions': '项目操作',
  '(empty project)': '（空项目）',
  'on disk': '磁盘上',
  'virtual': '虚拟',
  'Download the project as a ZIP (this is how virtual projects are saved)': '将项目下载为 ZIP（虚拟项目就这样保存）',
  'Export ZIP': '导出 ZIP',
  'Open': '打开',
  'New file here': '在此新建文件',
  'New folder here': '在此新建文件夹',
  'Rename': '重命名',
  'Duplicate': '创建副本',
  'Load Project into Runtime': '将项目载入运行时',
  'this browser has no File System Access API': '此浏览器不支持 File System Access API',
  'Close project': '关闭项目',
  'evaluated': '已求值',

  /* -------- outline panel -------- */
  'Outline': '大纲',
  'filter…': '过滤…',
  'Filter outline': '过滤大纲',
  'Close outline (Ctrl⇧O)': '关闭大纲 (Ctrl⇧O)',
  'no definitions': '暂无定义',
  'no buffer': '无 buffer',
  'definition': '个定义',
  'definitions': '个定义',
  '✓ = evaluated / loaded': '✓ = 已求值 / 已载入',
  'session box': '会话输入框',
  'other buffers (evaluated)': '其他 buffer（已求值）',

  /* -------- log panel -------- */
  'slow': '缓慢',
  'filter': '过滤',
  'Autoscroll': '自动滚动',
  'Timestamps': '时间戳',
  'Copy log': '复制日志',
  'Log copied': '已复制日志',
  'Export .log': '导出 .log',
  'Clear log': '清空日志',
  'no rows match the filter': '没有符合过滤条件的行',
  'quiet so far…': '目前很安静…',

  /* -------- status bar -------- */
  'depth': '深度',
  'Evaluator mode (click to toggle eval/compile)': '求值模式（点击切换 eval/compile）',
  'Parens balanced': '括号已配平',
  'unclosed open paren(s)': '有未闭合的左括号',
  'unmatched close paren(s)': '有多余的右括号',
  'offline': '离线',
  'worker:': 'worker：',
  'busy': '忙碌',
  'idle': '空闲',
  'saving…': '保存中…',
  'saved ✓': '已保存 ✓',
  'Copied selection': '已复制选区',

  /* -------- command palette -------- */
  'New buffer (Ctrl N)': '新建 buffer (Ctrl N)',
  'No buffers open': '没有打开的 buffer',
  'Type a command…': '输入命令…',
  'No matching commands': '没有匹配的命令',
  'Transcript copied': '转录已复制',
  'navigate': '导航',
  'run': '运行',
  'close': '关闭',

  /* -------- boot screen -------- */
  'Runtime failed to boot': '运行时启动失败',
  'Compiling the environment…': '正在编译运行环境…',
  'boot failed — see options below': '启动失败 —— 见下方选项',
  'The WASM runtime could not start in this browser (missing WebAssembly support, blocked fetch, or a crash during boot).':
    'WASM 运行时无法在此浏览器中启动（缺少 WebAssembly 支持、请求被拦截，或启动过程中崩溃）。',
  'Retry': '重试',
  'Continue with demo runtime': '继续使用演示运行时',
  'runs 100% client-side — no code ever leaves your machine': '100% 在客户端运行 —— 代码永不离开你的机器',

  /* -------- editor context menu -------- */
  'Evaluate region': '求值选区',
  'Macroexpand-1': '宏展开一层（macroexpand-1）',
  'Select enclosing form': '选中包含的表达式',
  'Go to definition': '转到定义',
  'Find references': '查找引用',
  'Paste': '粘贴',
/* -------- docs: sidebar -------- */
  'Getting started': '快速上手',
  'Feature support matrix': '特性支持对照表',
  'The session & cells': '会话与 cell',
  'Editor & buffers': '编辑器与 buffer',
  'Debugger & restarts': '调试器与 restart',
  'Modules': '模块',
  'Persistence & privacy': '持久化与隐私',
  'FAQ': '常见问题',
  'Documentation': '文档',
  'Documentation sections': '文档章节',
  'New here?': '初次使用？',
  'Skip the reading — open the workspace and evaluate something.': '不用读文档 —— 直接打开工作区，求值点什么。',

  /* -------- docs: getting started -------- */
  'From zero to REPL in a few seconds.': '几秒钟，从零到 REPL。',
  'There is nothing to install. Open the IDE; the SBCL WebAssembly artifacts (about 19 MB, gzip-compressed) download once, inflate in a Web Worker and boot a full ANSI Common Lisp. ECL, cross-compiled to wasm32 by the WECL project, takes over when SBCL cannot boot or when you choose it in Settings → Lisp implementation.':
    '无需安装任何东西。打开 IDE；SBCL 的 WebAssembly 构件（约 19 MB，gzip 压缩）只下载一次，在 Web Worker 中解压并启动一个完整的 ANSI Common Lisp。当 SBCL 无法启动，或你在“设置 → Lisp 实现”中选择 ECL 时，由 WECL 项目交叉编译为 wasm32 的 ECL 接管。',
  'Boot': '启动',
  'Watch the boot log — the .gz artifacts download and inflate, the runtime instantiates, the image comes up. A service worker keeps the compressed artifacts, so return visits skip the download and work offline.':
    '留意启动日志 —— .gz 构件下载并解压，运行时实例化，镜像启动。service worker 会保留压缩构件，因此再次访问可跳过下载并离线使用。',
  'The scratch buffer loads a Fibonacci demo. Rainbow parens show your nesting depth at the caret.':
    'scratch buffer 预载了一个 Fibonacci 示例。彩虹括号显示光标处的嵌套深度。',
  'Ctrl+Enter evaluates the top-level form at point into a session cell.':
    'Ctrl+Enter 把光标处的顶层表达式求值到一个会话 cell 中。',
  'Iterate': '迭代',
  'Re-run cells, resume errors via restarts, and read the log to see what the compiler is thinking.':
    '重跑 cell、通过 restart 从错误中恢复、读日志看编译器在想什么。',

  /* -------- docs: engines -------- */
  'Two engines, one session.': '两个引擎，一个会话。',
  'MartingaleCell boots SBCL by default and falls back to ECL when SBCL cannot come up. Both are real ANSI Common Lisp implementations compiled to WebAssembly and run in a Web Worker; JSCL and a small demo interpreter sit further down the ladder for pages where neither wasm image loads.':
    'MartingaleCell 默认启动 SBCL，SBCL 无法启动时回退到 ECL。两者都是编译为 WebAssembly、运行在 Web Worker 中的真实 ANSI Common Lisp 实现；在两个 wasm 镜像都无法加载的页面上，JSCL 和一个小型演示解释器排在更后面的梯队。',
  'SBCL — the default': 'SBCL —— 默认引擎',
  'Steel Bank Common Lisp 2.4.8 compiled to wasm32-wasip1. About 19 MB of gzip-compressed artifacts, downloaded once and kept by the service worker, inflated to ~125 MB in the worker; a REPL in 4–6 s on a laptop.':
    'Steel Bank Common Lisp 2.4.8，编译为 wasm32-wasip1。约 19 MB 的 gzip 压缩构件，只下载一次并由 service worker 保留，在 worker 中解压至约 125 MB；笔记本上 4–6 秒进入 REPL。',
  'ECL — the fallback': 'ECL —— 后备引擎',
  'Embeddable Common Lisp, cross-compiled to WebAssembly by the WECL project. About 9.5 MB, up in about a second. Boots automatically when SBCL cannot (artifacts missing, no isolation headers).':
    'Embeddable Common Lisp，由 WECL 项目交叉编译为 WebAssembly。约 9.5 MB，约一秒即可启动。当 SBCL 无法启动时（构件缺失、缺少隔离头）自动接管。',
  'Switching': '切换',
  'Settings → Lisp implementation: auto (SBCL, then ECL), ecl, or sbcl. The choice is kept per browser; Restart Lisp image brings the other engine up with its download in the status bar.':
    '设置 → Lisp 实现：auto（SBCL 优先，然后 ECL）、ecl 或 sbcl。选择按浏览器保留；“重启 Lisp 镜像”会拉起另一个引擎，下载进度显示在状态栏。',
  'Same session either way': '无论哪个引擎，会话不变',
  'Cells, projects, packages, the debugger, standard input and gnuplot capture work on both. The session protocol is the same; only the image behind it changes.':
    'cell、项目、包、调试器、标准输入与 gnuplot 捕获在两者上都可用。会话协议相同；变的只是背后的镜像。',
  'SBCL (default)': 'SBCL（默认）',
  'ECL (fallback)': 'ECL（后备）',
  'Standard': '标准',
  'ANSI CL via WECL': '经 WECL 的 ANSI CL',
  '~4–6 s (19 MB .gz, 125 MB inflated)': '约 4–6 秒（19 MB .gz，解压后 125 MB）',
  '~1 s (9.5 MB)': '约 1 秒（9.5 MB）',
  'Compiler': '编译器',
  'native SBCL compiler in the image': '镜像内的原生 SBCL 编译器',
  'bytecode compiler per form': '逐表达式的字节码编译器',
  'Threads': '线程',
  'no sb-thread in the wasm image': 'wasm 镜像中没有 sb-thread',
  'none': '无',
  'Subprocesses': '子进程',
  'ext:shell intercepted (gnuplot → SVG) or a clean error': 'ext:shell 被拦截（gnuplot → SVG）或干净的报错',
  'same': '相同',
  'Licence': '许可证',
  'public domain + MIT/BSD-style parts': '公有领域 + MIT/BSD 风格部分',
  'LGPL-2.1+, shipped unmodified': 'LGPL-2.1+，原样分发',

  /* -------- docs: feature matrix -------- */
  'ANSI Common Lisp, feature by feature.': 'ANSI Common Lisp，逐特性对照。',
  'What the WebAssembly builds support today — SBCL by default, ECL as the fallback; the rows hold for both unless noted. Updated per release; target: full ANSI conformance.':
    '当前 WebAssembly 构建所支持的特性 —— 默认 SBCL、后备 ECL；除非特别说明，各行对两者均成立。随版本更新；目标：完整的 ANSI 兼容。',
  'Full': '完整',
  'Partial': '部分',
  'Planned': '计划中',
  'Reader & printer': '读取器与打印器',
  'All standard readmacros; ': '全部标准读取宏；',
  'Evaluation & compilation': '求值与编译',
  ' per form; ': '逐表达式',
  ' (bytecodes) per form when the ': '（字节码）逐表达式（当',
  ' setting is on; no native ': '设置开启时）；wasm 镜像中没有原生',
  '-file in the wasm image': '文件编译',
  'CLOS': 'CLOS',
  'Full class system, method combinations, ': '完整的类系统、方法组合、',
  'Condition system': 'Condition 系统',
  '/case, ': '/case、',
  '; the cell pauses on an unhandled error with the live restarts (yours, RETRY, ABORT, STORE-VALUE, DEFINE-FUNCTION) — also during project loads':
    '；未处理的错误会让 cell 暂停并列出可用的 restart（自定义的、RETRY、ABORT、STORE-VALUE、DEFINE-FUNCTION）——项目加载期间也一样',
  'Numbers': '数值',
  'Bignums, ratios, complex; floats are IEEE doubles': '大整数、有理数、复数；浮点数为 IEEE 双精度',
  'Sequences, arrays, hash tables': '序列、数组、哈希表',
  'Including displaced & adjustable arrays': '包括 displaced 与 adjustable 数组',
  'LOOP / FORMAT / pretty printer': 'LOOP / FORMAT / 漂亮打印器',
  ' via gray streams into the OUT block': '经 gray 流输出到 OUT 区块',
  'Packages & symbols': '包与符号',
  '; in-package persists across cells and drives the package pill; project symbols feed completion; go-to-definition knows every form the loader loaded and every form you evaluated':
    '；in-package 跨 cell 生效并驱动 package 药丸；项目符号进入补全；转到定义知道加载器载入的每一个表达式和你求值过的每一个表达式',
  'MOP': 'MOP',
  ' etc.; ': ' 等；',
  ' edge cases pending': '的边角情况待完善',
  'Gray streams': 'Gray 流',
  'Core protocol; ': '核心协议；',
  ' is a Gray stream that pauses the cell for a line (read-line, read, y-or-n-p)': '是一个 Gray 流，会暂停 cell 等待一行输入（read-line、read、y-or-n-p）',
  'Pathnames & files': '路径名与文件',
  'In-memory FS persisted to IndexedDB; no host filesystem access': '内存文件系统持久化到 IndexedDB；不访问宿主文件系统',
  'gnuplot plots (cl-plot)': 'gnuplot 绘图（cl-plot）',
  'ext:shell capture rendered as SVG: data series, multi-file plots, function expressions with gnuplot’s operators, user-defined functions and variables, integer arithmetic; no ternaries, strings or 3-D':
    'ext:shell 捕获渲染为 SVG：数据序列、多文件绘图、带 gnuplot 运算符的函数表达式、用户自定义函数与变量、整数运算；不支持三元运算、字符串与三维',
  'FFI / foreign calls': 'FFI / 外部调用',
  'Not meaningful under WASM; WASI experiments planned': '在 WASM 下无意义；计划做 WASI 实验',
  'Threads (bordeaux-threads)': '线程（bordeaux-threads）',
  'No sb-thread in the SBCL wasm image and none in ECL/wasm; the COOP/COEP isolation headers are already served for the SBCL worker':
    'SBCL wasm 镜像中没有 sb-thread，ECL/wasm 也没有；SBCL worker 所需的 COOP/COEP 隔离头已经就绪',

  /* -------- docs: session & cells -------- */
  'Cells that remember everything.': '记住一切的 cell。',
  'Every evaluation lands in a session cell: the form you sent, what it printed, what it returned, and anything it complained about — one scannable unit, kept forever.':
    '每次求值都落入一个会话 cell：你发送的表达式、它打印了什么、返回了什么、抱怨了什么 —— 一个可一目了然的单元，永久保留。',
  'Input echo': '输入回显',
  'The evaluated form, exactly as sent to the runtime — steel gutter accent marks it as input.':
    '被求值的表达式，与发送给运行时的完全一致 —— 钢青色边线标记它是输入。',
  'OUT block': 'OUT 区块',
  'Everything written to *standard-output* while the form ran, streamed line by line.':
    '表达式运行期间写到 *standard-output* 的一切，逐行流出。',
  'Values block': '值区块',
  'The return values, printed readably after a ;;=> marker. Multiple values stack.':
    '返回值，以可读形式打印在 ;;=> 标记后。多值会堆叠显示。',
  'Meta footer': '元信息脚注',
  'Wall time, value count, and the package the form ran in. Hover for copy / re-run.':
    '耗时、值数量、表达式所在的包。悬停可复制 / 重跑。',
  'Warning sub-block': '警告子区块',
  'Signaled warnings render inline, amber-accented — never lost in a separate console.':
    '发出的警告内联渲染、琥珀色点缀 —— 绝不会丢在单独的控制台里。',
  'Persistence': '持久化',
  'Cells live in IndexedDB and survive reloads — close the tab mid-session, come back tomorrow.':
    'cell 存放在 IndexedDB 中，重载后仍在 —— 中途关掉标签页，明天回来接着用。',
  'Virtualization': '虚拟化',
  'Sessions past 100 cells virtualize; history is trimmed to the last 1,000 cells with a banner chip.':
    '超过 100 个 cell 的会话会虚拟化；历史裁剪为最近 1,000 个 cell，并有横幅提示。',
  'Copy & paste': '复制与粘贴',
  'Copy all yields a plain-text transcript with ;;=> markers — paste it into a gist or a bug report as-is.':
    '“全部复制”得到带 ;;=> 标记的纯文本转录 —— 原样粘进 gist 或 bug 报告即可。',
  'Export': '导出',
  'The download button (or the palette) saves the session as a Markdown notebook — code, output, values, warnings, errors and plots inline as SVG — or as a .lisp transcript with results as comments that evaluates as is. Import (palette) appends the cells of a Markdown or .lisp transcript back into the session, marked as imported and re-runnable. A settings slider can clip long values in exports. Open as buffer turns a cell into a linked buffer: re-running the cell evaluates the buffer\'s current text.':
    '下载按钮（或命令面板）可以把会话保存为 Markdown 笔记本 —— 代码、输出、值、警告、错误以及内联 SVG 图 —— 或保存为 .lisp 转录（结果作为注释，可直接求值）。导入（命令面板）把 Markdown 或 .lisp 转录的 cell 追加回会话，标记为已导入、可重跑。设置里有滑杆可截断导出中的过长值。“作为 buffer 打开”把 cell 变成 linked buffer：重跑 cell 即求值该 buffer 的当前内容。',
  'Re-running a cell (the ↻ button, or evaluating its linked buffer) adds a run to its history. The cell shows run k/N; click it to see the runs side by side — input, status, values — with each value marked when it differs from the run before, and a changed input shown as a line diff against it. The Markdown export keeps the runs (run k/N of cell m in the heading) and an import re-links them.':
    '重跑一个 cell（↻ 按钮，或求值它的 linked buffer）会向其历史添加一次运行。cell 显示第 k/N 次；点击可并排查看各次运行 —— 输入、状态、值 —— 与上一次不同的值会被标记，变化的输入显示为行级 diff。Markdown 导出保留这些运行（标题中标注 cell m 的第 k/N 次），导入时会重新关联。',
  'Truncation': '截断',
  'Long values truncate at 60 chars / 20 lines; an expand chip reveals the full printed form.':
    '过长的值在 60 字符 / 20 行处截断；“展开”可查看完整打印形式。',
  'redefining FIB — previously defined in cell #3': '重定义 FIB —— 此前定义于 cell #3',
  'computing the 25th Fibonacci number…': '正在计算第 25 个 Fibonacci 数…',
  '1 value': '1 个值',

  /* -------- docs: editor -------- */
  'An editor that keeps its place.': '一个记得自己位置的编辑器。',
  'CodeMirror with a Common Lisp tokenizer, rainbow parens, completion and signature help — and one editor state per buffer, so undo, selection and scroll belong to the buffer, not to the tab bar.':
    'CodeMirror 加 Common Lisp 词法器、彩虹括号、补全与签名帮助 —— 每个 buffer 一份独立的编辑器状态，撤销、选区和滚动位置属于 buffer，而不是标签栏。',
  'Buffers & tabs': 'buffer 与标签页',
  'Each tab is a buffer: scratch buffers you create (Ctrl+N), project files you open from the explorer, and cells you open as buffers. Buffers persist in IndexedDB, so a reload brings every tab back, dirty or not.':
    '每个标签页就是一个 buffer：你新建的 scratch buffer（Ctrl+N）、从浏览器打开的项目文件、以及作为 buffer 打开的 cell。buffer 持久化在 IndexedDB，重载后每个标签页都会回来，无论有没有未保存修改。',
  'Undo that stays put': '不会乱跑的撤销',
  'Every buffer keeps its own editor state — document, selection, undo history, scroll position, folds. Switching tabs is never an undo step, and an edit that reached a buffer while it was not shown (a replace, a loaded transcript) becomes one undo step of that buffer.':
    '每个 buffer 保留自己的编辑器状态 —— 文档、选区、撤销历史、滚动位置、折叠。切换标签页绝不是一次撤销；buffer 不在显示时发生的编辑（替换、载入转录）会成为该 buffer 的一次撤销步骤。',
  'Survives a reload': '重载后依旧',
  'The per-buffer editor states are saved alongside the buffers. After a reload, Ctrl+Z still undoes the last edit you made before it, the scroll position is where you left it, a folded defun is still folded (Ctrl+Shift+[ folds the outermost form on the line; the palette folds every top-level form or a #| |# comment), and ↑ in the session box recalls what you evaluated there.':
    '每 buffer 的编辑器状态随 buffer 一同保存。重载后，Ctrl+Z 仍能撤销重载前的最后一次编辑，滚动位置停在原地，折叠的 defun 仍然折叠（Ctrl+Shift+[ 折叠该行最外层表达式；命令面板可折叠全部顶层表达式或 #| |# 注释），会话输入框里按 ↑ 仍能唤回你在那里求值过的内容。',
  'Cells as buffers': 'cell 即 buffer',
  'Open as buffer turns a session cell into cell-N.lisp, linked both ways: the tab is badged [N], the cell shows ↗ cell-N.lisp, and re-running the cell evaluates the buffer\'s current text — definitions index to the buffer.':
    '“作为 buffer 打开”把会话 cell 变成 cell-N.lisp，双向链接：标签页带 [N] 徽标，cell 显示 ↗ cell-N.lisp，重跑 cell 即求值 buffer 的当前内容 —— 定义索引指向该 buffer。',
  'Search & replace': '搜索与替换',
  'Ctrl+Shift+F searches open buffers and project files; Shift+F12 finds references of the symbol at point. Replace rewrites the buffer in the editor as one undoable edit, other open buffers in place, and opens project files as dirty buffers.':
    'Ctrl+Shift+F 搜索打开的 buffer 与项目文件；Shift+F12 查找光标处符号的引用。替换会把编辑器中的 buffer 改写为一次可撤销的编辑，其他打开的 buffer 原地更新，未打开的项目文件则作为带脏标记的 buffer 打开。',
  'Ctrl+Shift+O lists what the buffer, the project and the session box define, ticked when the image has evaluated or loaded it. F12 goes to a definition: the most recent evaluation wins, then the project index, then a text scan.':
    'Ctrl+Shift+O 列出 buffer、项目和会话输入框定义的内容，镜像已求值或已载入的会打勾。F12 转到定义：最近的求值优先，其次是项目索引，最后是文本扫描。',

  /* -------- docs: debugger -------- */
  'Errors you can talk back to.': '可以与之对话的错误。',
  'When a condition is signaled, MartingaleCell renders the restart list inline. Choosing a restart resumes evaluation — no re-run required. This is the full ANSI condition system, not a try/catch shim.':
    '当有 condition 被发出时，MartingaleCell 会内联渲染 restart 列表。选择一个 restart 即恢复求值 —— 无需重跑。这是完整的 ANSI condition 系统，不是 try/catch 的仿制品。',
  'Condition report': 'condition 报告',
  'The signaled condition, printed in full — type, format arguments, and the form that raised it.':
    '被发出的 condition 完整打印 —— 类型、format 参数、以及引发它的表达式。',
  'Restart rows': 'restart 行',
  'Every live restart — yours from restart-case, plus RETRY and ABORT — clickable. Keys 0–9 pick one while the cell is paused; restarts that take a value ask for a form.':
    '每一个可用的 restart —— 你在 restart-case 里定义的，加上 RETRY 与 ABORT —— 都可点击。cell 暂停期间按 0–9 选择；需要值的 restart 会要求输入一个表达式。',
  'Frames expander': '帧展开器',
  'The backtrace, collapsed by default. Expand to walk the stack frame by frame.':
    '回溯默认折叠。展开可逐帧查看调用栈。',
  'Resolution line': '解决方式行',
  'After you pick a restart, the cell records how the condition was resolved and evaluation resumes.':
    '选择 restart 后，cell 会记录 condition 是如何解决的，随后求值继续。',
  'Return to the top-level REPL': '返回顶层 REPL',
  'Supply a value to use instead': '提供一个替代值',
  'Return 0 instead': '改为返回 0',
  'Pretend the division succeeded': '当作除法成功了',
  'signaled in': '发出于',
  'with arguments': '参数为',
  'resolved via': '经',
  'evaluation resumed': '求值已恢复',
  'Establish your own restarts with': '用',
  '— paste this into the IDE and divide by zero:': '—— 把它粘进 IDE 并除以零，即可建立你自己的 restart：',

  /* -------- docs: projects -------- */
  'Projects, not just snippets.': '项目管理，而不只是代码片段。',
  'Point MartingaleCell at a real folder of Common Lisp and treat the browser like a local IDE: browse, edit, save, then load the entire tree into the runtime and call it.':
    '把 MartingaleCell 指向一个真实的 Common Lisp 文件夹，像本地 IDE 一样使用浏览器：浏览、编辑、保存，然后把整棵目录树载入运行时并调用。',
  'A project is a folder': '项目就是一个文件夹',
  'Open any local folder with the File System Access API (Chrome/Edge) — MartingaleCell remembers the handle and offers to reopen it next visit. Firefox/Safari get a virtual project instead: import a ZIP or upload a folder, edit in memory, and Export ZIP to save.':
    '通过 File System Access API（Chrome/Edge）打开任意本地文件夹 —— MartingaleCell 会记住句柄并在下次访问时提议重新打开。Firefox/Safari 则使用虚拟项目：导入 ZIP 或上传文件夹，在内存中编辑，用“导出 ZIP”保存。',
  'Open & save files': '打开与保存文件',
  'Click a file in the explorer and it opens as an editor tab with a dirty dot. Ctrl+S writes it back — createWritable() on real folders, the virtual FS otherwise. New files are created on disk immediately.':
    '在浏览器里点击文件，它就作为编辑器标签页打开并带脏标记圆点。Ctrl+S 写回 —— 真实文件夹走 createWritable()，否则写入虚拟文件系统。新文件会立即在磁盘上创建。',
  'Load the whole project': '载入整个项目',
  '"Load Project into Runtime" ships every .lisp/.lsp/.cl/.asd file to the worker and loads them recursively. If an .asd exists, its system is loaded via asdf:load-source-op — ECL\'s C-compile path can\'t exist in WASM, so sources load uncompiled. Without an .asd, files load manually: package definitions first, then alphabetical; every file is guarded, so one bad file never aborts the batch.':
    '“将项目载入运行时”把每个 .lisp/.lsp/.cl/.asd 文件送到 worker 并递归加载。若存在 .asd，其系统经 asdf:load-source-op 加载 —— ECL 的 C 编译路径在 WASM 中无法存在，因此源码以未编译方式加载。没有 .asd 时手动加载：先包定义，再按字母序；每个文件都有保护，一个坏文件不会中断整批。',
  'Search & go to definition': '搜索与转到定义',
  'Ctrl+Shift+F searches open buffers and every Lisp file of the project — match case, whole symbol, regex, and a code-only mode that skips strings and comments. Results are grouped by file; a click opens the file at the line. A Replace box rewrites the hits: the buffer in the editor through one undoable edit, other open buffers in place, and project files that are not open get opened as dirty buffers — nothing reaches disk until Ctrl+S or the "Save N files" action on the summary. Undo history is kept per buffer: switching buffers is never an undo step.':
    'Ctrl+Shift+F 搜索打开的 buffer 与项目里的每个 Lisp 文件 —— 支持区分大小写、完整符号、正则，以及跳过字符串与注释的“仅代码”模式。结果按文件分组；点击即在该行打开文件。替换框可改写命中项：编辑器中的 buffer 走一次可撤销编辑，其他打开的 buffer 原地更新，未打开的项目文件作为带脏标记的 buffer 打开 —— 在 Ctrl+S 或摘要上的“保存 N 个文件”之前，什么都不会写盘。撤销历史按 buffer 保留：切换 buffer 绝不是一次撤销。',
  'Try it: cl-plot (MIT)': '试试看：cl-plot（MIT）',
  'The bundled sample opens Martin Kersner\'s cl-plot as a virtual project. Load it, and CL-PLOT\'s symbols flow straight into autocomplete — (make-instance \'cl-plot:figure) just works.':
    '内置示例把 Martin Kersner 的 cl-plot 作为虚拟项目打开。载入它，CL-PLOT 的符号会直接进入自动补全 —— (make-instance ‘cl-plot:figure) 开箱即用。',
  'gnuplot, emulated:': 'gnuplot，模拟版：',
  'cl-plot builds a gnuplot script and shells out to the': 'cl-plot 会生成 gnuplot 脚本并调用外部',
  'binary — impossible inside WebAssembly. MartingaleCell intercepts that hand-off in the worker, ships the script and its data files to the page, and renders a gnuplot-subset as dark-themed':
    '二进制程序 —— 这在 WebAssembly 里不可能。MartingaleCell 在 worker 中拦截这次交接，把脚本及其数据文件送到页面，并以深色主题渲染一个 gnuplot 子集，得到',
  'SVG right inside the session cell': '就在会话 cell 里的 SVG',
  'that triggered it. Every plot carries Download SVG / Download PNG buttons (PNG is rasterized via canvas at 2×), and': '。每张图都有 Download SVG / Download PNG 按钮（PNG 经 canvas 以 2 倍分辨率栅格化），而且',
  'auto-downloads the PNG — no binary required. Other subprocesses still surface as a clean': '会自动下载 PNG —— 无需二进制程序。其他子进程仍会以干净的',
  'never a hung debugger.': '形式出现，绝不会挂死在调试器里。',

  /* -------- docs: modules -------- */
  'Reusable modules, not one-off cells.': '可复用的模块，不是一次性的 cell。',
  'Grow snippets into libraries: a package, an asdf system that declares its parts, and an init.lisp entry file that loads it all — the same layout the bundled cl-plot sample ships with.':
    '把片段养成库：一个包、一个声明各部件的 asdf 系统、一个把它们全部加载的 init.lisp 入口文件 —— 与内置 cl-plot 示例相同的布局。',
  'A module is a package': '模块即包',
  'Wrap your code in defpackage + in-package and export exactly the symbols that make up your API. Everything else stays internal — callers see my-module:entry points, not your helpers.':
    '把代码包在 defpackage + in-package 里，精确导出构成 API 的符号。其余保持内部 —— 调用者看到的是 my-module: 入口，而不是你的辅助函数。',
  'An .asd declares the parts': '.asd 声明各部件',
  'An asdf:defsystem lists your source files as :components. With :serial t each file sees the definitions of the ones before it, so load order is declared once instead of reproduced by hand.':
    'asdf:defsystem 把源文件列为 :components。加上 :serial t 后，每个文件都能看到它之前文件的定义，加载顺序声明一次即可，无需手工重排。',
  'init.lisp is the entry point': 'init.lisp 是入口',
  'When a project is loaded, .asd components come first and remaining files — entry files like init.lisp — are loaded last, alphabetically. That makes init.lisp the perfect place to register the system and load it: exactly how the bundled cl-plot sample is wired.':
    '项目载入时，.asd 的组件先来，其余文件 —— init.lisp 这类入口文件 —— 按字母序最后加载。这让 init.lisp 成为注册并加载系统的绝佳位置：内置 cl-plot 示例正是这样接线的。',
  'Loaded = autocomplete-ready': '载入即可补全',
  'After "Load Project into Runtime", every external symbol of your package flows into autocomplete. Type my-module: and your exported API is suggested, inspected, and callable from any session cell.':
    '“将项目载入运行时”之后，包的每个外部符号都进入自动补全。输入 my-module: 即可建议、查看并从任意会话 cell 调用你导出的 API。',
  'Package management, in Lisp': '用 Lisp 管理包',
  'Once a project is loaded, promote it to a reusable module — files are copied to': '项目载入后，可把它提升为可复用模块 —— 文件会复制到',
  '(name taken from the': '（名字取自',
  'defsystem) and loaded from there:': '的 defsystem），并从这里加载：',
  'The module tree is snapshotted to IndexedDB after every install/uninstall and restored on the next boot, so': '模块树在每次安装/卸载后快照到 IndexedDB 并在下次启动时恢复，因此',
  'survives a reload. Definitions are not auto-loaded into the fresh image — evaluate': '能在重载后幸存。定义不会自动载入新镜像 —— 求值',
  'to load them from the restored files, and note that uninstalling removes files while already-loaded definitions honestly stay until the runtime restarts (Common Lisp has no unload).':
    '即可从恢复的文件加载它们；另请注意，卸载会删除文件，但已载入的定义会诚实保留到运行时重启（Common Lisp 没有 unload）。',
  'Lay out the folder': '布置目录',
  'One file per concern, plus my-module.asd and init.lisp at the root. Without an .asd the loader still works — package definitions first, then the rest alphabetically — but an explicit system is what makes the module reusable and order-safe.':
    '一个关注点一个文件，根目录放 my-module.asd 与 init.lisp。没有 .asd 加载器也能工作 —— 先包定义，其余按字母序 —— 但显式的系统定义才能让模块可复用、顺序安全。',
  'Declare the system in the .asd': '在 .asd 中声明系统',
  'defpackage with your :export list, then asdf:defsystem with :serial t and the component files in dependency order. The loader parses this file and loads the components exactly as declared.':
    '先写带 :export 列表的 defpackage，再写带 :serial t 与按依赖顺序排列的组件文件的 asdf:defsystem。加载器会解析此文件，并严格按声明加载组件。',
  'Write init.lisp as the doorway': '把 init.lisp 写成门厅',
  'init.lisp runs after every component: push the project directory onto asdf:*central-registry*, asdf:load-system your system, and optionally exercise the API. This is the same shape as the bundled cl-plot sample.':
    'init.lisp 在所有组件之后运行：把项目目录压入 asdf:*central-registry*，asdf:load-system 你的系统，还可以顺便调用一下 API。这与内置 cl-plot 示例的结构相同。',
  'Load and use it anywhere': '加载后随处可用',
  'Hit "Load Project into Runtime". The load cell reports each file; exported symbols land in autocomplete and stay available for the rest of the session — across every cell and buffer.':
    '点击“将项目载入运行时”。载入 cell 会逐个报告文件；导出符号进入自动补全，并在会话剩余时间里一直可用 —— 跨越每个 cell 和 buffer。',
  'Sources load uncompiled:': '源码以未编译方式加载：',
  'the runtime loads modules via': '运行时经',
  '— ECL’s C-compile path can’t exist inside WebAssembly, so': '加载模块 —— ECL 的 C 编译路径在 WebAssembly 中无法存在，因此',
  'subtleties that only show up at': '只在',
  'won’t bite, but neither will compile-time macros run ahead of time. Every file is guarded: one bad file logs a': '时才显现的细微问题不会咬人，但编译期宏也不会提前运行。每个文件都有保护：一个坏文件只会记一条',
  'in the load cell and the rest of the module still loads.': '到载入 cell，模块的其余部分照常加载。',

  /* -------- docs: shortcuts -------- */
  'Keep your hands on the home row.': '双手不离主键位。',
  'Every primary action has a binding. Ctrl is ⌘ Cmd on macOS — the IDE shows the right one for your platform.':
    '每个主要操作都有绑定。macOS 上 Ctrl 即 ⌘ Cmd —— IDE 会按你的平台显示正确的那个。',
  'Filter shortcuts…': '过滤快捷键…',
  'No shortcuts match': '没有匹配的快捷键',
  'Save buffers (project files are written to disk / virtual FS)': '保存 buffer（项目文件写入磁盘 / 虚拟文件系统）',
  'Search the workspace (open buffers + project files); Enter jumps to the first hit': '搜索工作区（打开的 buffer + 项目文件）；Enter 跳到第一个命中',
  'Outline of definitions: buffer (✓ = evaluated), project, session box — click to jump': '定义大纲：buffer（✓ = 已求值）、项目、会话输入框 —— 点击跳转',
  'Choose a restart while a cell is paused in the debugger': 'cell 暂停在调试器时选择一个 restart',
  'End of file for a cell waiting on standard input': '向等待标准输入的 cell 发送文件结束',
  'In the session box: search the input history (↑↓ move, Enter recalls); ↑ / ↓ alone walk it': '在会话输入框中：搜索输入历史（↑↓ 移动，Enter 唤回）；单按 ↑ / ↓ 逐条浏览',
  'Complete symbol at point': '补全光标处的符号',
  'Select enclosing s-expression (repeat to grow)': '选中包含的 S 表达式（重复按可扩大）',
  'Go to definition of the symbol at point (Ctrl+click too)': '转到光标处符号的定义（也可 Ctrl+点击）',
  'Find references of the symbol at point (workspace search, whole symbol, code only)': '查找光标处符号的引用（工作区搜索、完整符号、仅代码）',
  'Fold / unfold the outermost form opening on the caret line (Ctrl+Alt+[ / ] for all forms); folds persist per buffer': '折叠/展开光标行上最外层的表达式（Ctrl+Alt+[ / ] 作用于全部表达式）；折叠按 buffer 持久化',
  'Shortcuts reference': '快捷键参考',
  'Dismiss palette, modals, and transient UI': '关闭命令面板、模态框与临时界面',

  /* -------- docs: persistence -------- */
  'Your code never leaves the tab.': '你的代码永不离开这个标签页。',
  'MartingaleCell runs 100% client-side. The Lisp engine — SBCL or ECL — executes in a Web Worker inside your browser; evaluation, compilation, and persistence are all local.':
    'MartingaleCell 100% 在客户端运行。Lisp 引擎 —— SBCL 或 ECL —— 在你浏览器内的 Web Worker 中执行；求值、编译与持久化全部本地完成。',
  'Local first': '本地优先',
  'Buffers, cells, settings and project files live in IndexedDB. A service worker keeps the app and the engine artifacts of the version you loaded, so the IDE opens offline.':
    'buffer、cell、设置与项目文件都在 IndexedDB 里。service worker 会保留你所加载版本的应用与引擎构件，因此 IDE 可以离线打开。',
  'Share via URL': '经 URL 分享',
  'Share links compress your buffers into the hash. There is no server to receive anything.':
    '分享链接把你的 buffer 压缩进 hash。没有服务器接收任何东西。',
  'No telemetry': '无遥测',
  'No analytics, no beacons. The network panel stays quiet after the first load.':
    '没有分析、没有信标。首次加载之后，网络面板保持安静。',

  'Available restarts': '可用的 restart',
  'Backtrace — 7 frames': '回溯 — 7 帧',
  'The status bar names the running engine; the boot log shows which one came up and why.': '状态栏标明当前引擎；启动日志显示是哪一个启动了、以及为什么。',
  'of the ANSI specification covered': 'ANSI 规范覆盖率',
  'Full condition system, CLOS, and the LOOP/FORMAT trio — in a browser tab.': '完整的 condition 系统、CLOS、以及 LOOP/FORMAT 三件套 —— 都在一个浏览器标签页里。',

  'Run': '运行',
  'Area': '领域',
  'Status': '状态',
  'Notes': '说明',
  'in the IDE for the exact build — SBCL 2.4.8 or the ECL fallback.': '即可看到确切版本 —— SBCL 2.4.8 或 ECL 后备。',

  /* -------- docs: FAQ -------- */
  'Frequently asked.': '常见问题。',
  'Is this real Common Lisp?': '这是真正的 Common Lisp 吗？',
  'Yes — two full ANSI Common Lisp implementations compiled to WebAssembly and self-hosted in a Web Worker: SBCL (the default, wasm32-wasip1) and ECL (cross-compiled by the WECL project, the fallback). If neither wasm image loads, MartingaleCell falls back to JSCL, then to a small demo evaluator — every engine speaks the same session protocol.':
    '是 —— 两个完整的 ANSI Common Lisp 实现，编译为 WebAssembly 并自托管在 Web Worker 中：SBCL（默认，wasm32-wasip1）与 ECL（由 WECL 项目交叉编译，后备）。若两个 wasm 镜像都加载失败，MartingaleCell 会回退到 JSCL，再回退到一个小型演示求值器 —— 每个引擎都说同样的会话协议。',
  'How big is the download?': '下载量有多大？',
  'SBCL: about 19 MB of gzip-compressed artifacts, inflated to ~125 MB in memory, a REPL in 4–6 s. ECL: about 9.5 MB, up in about a second. Return visits are quicker because the browser keeps the compressed files in its HTTP cache.':
    'SBCL：约 19 MB 的 gzip 压缩构件，内存中解压至约 125 MB，4–6 秒进入 REPL。ECL：约 9.5 MB，约一秒启动。再次访问更快，因为浏览器会把压缩文件留在 HTTP 缓存里。',
  'Can I load Quicklisp libraries?': '能加载 Quicklisp 库吗？',
  'Pure-Lisp systems marked :wasm-compatible can be pasted or fetched; FFI-dependent systems are unsupported (see the support matrix above).':
    '标记为 :wasm-compatible 的纯 Lisp 系统可以粘贴或抓取；依赖 FFI 的系统不支持（见上方支持对照表）。',
  'Where is my code stored?': '我的代码存在哪里？',
  'IndexedDB in your browser profile. Clearing site data deletes it; export your workspace from Settings first.':
    '你浏览器配置里的 IndexedDB。清除站点数据会删除它；请先在设置中导出工作区。',
  'Does it work offline?': '能离线使用吗？',
  'Yes, after the first load. A service worker keeps the app shell and, once an engine has booted, that engine’s artifacts, so the IDE opens and boots without a network from the very next visit; a new version downloads its artifacts once and replaces the old cache.':
    '可以，首次加载之后。service worker 会保留应用外壳；一旦某个引擎启动过，还会保留该引擎的构件，因此从下一次访问起 IDE 可以完全离线打开并启动；新版本会一次性下载自己的构件并替换旧缓存。',
  'Which browsers?': '支持哪些浏览器？',
  'Latest Chrome, Firefox, Edge, Safari 17+. WASM GC/threads features are progressive enhancements.':
    '最新的 Chrome、Firefox、Edge、Safari 17+。WASM GC/线程特性属于渐进增强。',
  'Can I use it on mobile?': '能在移动端用吗？',
  'It runs, but the interface is keyboard-first; the tabbed fallback layout works best on tablets.':
    '能跑，但界面是键盘优先的；平板上的标签页回退布局体验最好。',
}
