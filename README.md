# Lingo 1.0.0 · 划词翻译与写作

Chrome Manifest V3 扩展，正式版 1.0.0。选中文字，点击「文」，先看翻译，再按需校对、改写、复制或替换。

## 直接使用

交付包的 `extension/` 是已经构建好的扩展，无须安装 Node 或运行构建命令。

1. 解压完整包，并把整个文件夹保留在一个固定位置。
2. Chrome 地址栏输入 `chrome://extensions`，打开右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择交付包里的 **extension 文件夹**（其中直接包含 `manifest.json`）。不要选择 ZIP 或上一级文件夹。
4. 从工具栏拼图菜单打开 Lingo，点击「设置」，填写自己的 OpenAI API Key，阅读并确认数据处理说明后保存。默认模型是 `gpt-6-luna`，可改为支持 Responses API 和流式输出的模型。
5. 可点击「测试连接」。这会使用已保存的 Key 和模型翻译一句固定示例，产生少量 API 用量。连接通过后即可实际使用。
6. 首次安装会打开设置页。在「浮窗翻译语言」选择默认目标语言并保存；在「在哪里使用」点击「一键授权所有普通网页」并在 Chrome 中确认，或添加指定站点。刷新已打开的网页，选中文字，点击旁边的「文」。

也可以不授予常驻网站权限：选中文字后，从扩展菜单点击「翻译当前选区」，或用右键菜单、`Alt+Shift+L`（Mac 为 `Option+Shift+L`）临时调用。如果快捷键被其他功能占用，在 `chrome://extensions/shortcuts` 中修改。

## 浮窗位置、大小与语言

- 拖动标题栏移动浮窗，拖动四条边或四个角调整宽度和高度；不显示缩放标记，鼠标靠近边缘时改变指针。最小 320 × 300，最大宽度 900；屏幕较小时优先适配视口；结果较长时在浮窗内滚动。
- 点击标题栏 ↺ 恢复自动定位和默认大小。调整后的布局在当前页面内再次划词时沿用；刷新页面后恢复默认。
- 可以用 Tab 聚焦标题栏或缩放按钮，再用方向键调整；Shift + 方向键为较大步长。
- 设置页从 31 种语言中添加或移除浮窗常用语言，并从常用列表选择默认语言。初始只显示简体中文和 English；旧版默认语言自动保留。至少保留一种，移除默认语言后改用列表第一种。保存后，浮窗只列出选中的语言；浮窗内临时切换不修改默认值。
- 网站权限仍由用户确认。首次安装打开设置页并显示授权状态，不会静默获取全站权限。

## 使用规则

- 划词只显示小图标；打开窗口才请求翻译。点击写作按钮才发出对应请求。
- 支持校对、自然、专业、友好、简洁、精准与自定义修改要求。
- 写作操作始终以本次最初选中的原文为基础。原文语言默认保留；自定义指令可明确要求其他语言。
- 校对无变化时提示「未发现需要修改的问题」。精准模式要求模型保留原文事实和不确定性。
- 同一窗口、同一语言和操作的完成结果会复用，关闭窗口清除本次结果，不保存文字历史。
- 可以停止生成、重试请求、切换翻译语言。失败或不完整的结果不能替换原文。
- 普通网页只提供复制；受支持的可编辑区域还提供「替换选中文字」。原文或实质格式变化后，旧结果不能再替换；已识别的 Gmail 语法标记和提示层变化不会误判。
- 替换采用 Chrome 原生编辑命令，保留撤销栈。替换后，在编辑框中按 `⌘Z` / `Ctrl+Z` 撤销。
- 单次选区上限 16,000 个字符，自定义要求上限 1,000 个字符。过长内容需要缩短选区。
- 点击窗口外部或按 Esc 关闭。窗口出现和结果返回不自动抢焦点。

## 网站与编辑器兼容范围

| 场景 | 行为 |
|---|---|
| 普通 HTTP / HTTPS 网页正文 | 翻译、写作、复制 |
| 标准 textarea、文本 / 搜索 / 电话 / URL 输入框 | 支持选区替换与原生撤销 |
| 只读输入框 | 仅复制结果 |
| 简单 contenteditable | 支持符合安全检查的选区替换；周围格式保留 |
| Gmail 正文 | 基于标准 contenteditable 支持简单正文；已增加 Gmail 换行、语法标记和 Smart Compose 提示层适配；真实测试记录见 verification/LIVE-CHROME-GMAIL.md（该记录对应早期开发构建；正式版 1.0.0 回归另见 VERIFICATION.md） |
| ProseMirror、Lexical、Slate、Quill、Monaco、CodeMirror、Google Docs 等复杂编辑器 | 不直接替换；可获取选区时提供复制 |
| 带图片、表格或不可编辑嵌入块的富文本编辑区（已识别的 Gmail 提示层除外） | 为避免破坏结构，仅复制 |
| iframe | 已授权的普通网页框架可注入；跨域框架需要相应站点授权，临时工具栏调用主要处理顶层选区 |
| 密码框、Chrome 内部页面、扩展商店、内置 PDF 阅读器 | 不支持 |

某些网站使用自有文档模型、封闭 Shadow DOM 或画布，无法保证获取选区或替换。网站脚本可能重新处理修改结果，请检查最终文字。原生编辑命令可能规范化富文本 HTML 和空格，属于浏览器编辑行为。

## Key 与隐私

- 发布目录和源码都不内置真实 Key。由用户在扩展设置中自行填写。
- 默认「记住 Key，免解锁」：使用随机 AES-256-GCM 密钥自动加密，密文保存在受限 `chrome.storage.local`，不可导出的 CryptoKey 保存在扩展自己的 IndexedDB。保存一次，重启后直接使用；不会把明文 Key 写入持久存储，也不使用固定或源码内置密钥。
- 自动解密密钥也在本机浏览器中，因此不能防护完整浏览器配置被窃取或系统被控制；这不是操作系统钥匙串或硬件保护。
- 可选择「仅本次会话」：只存于 `chrome.storage.session`，浏览器会话结束、扩展重载/停用后需要重新填写。
- 可选择「加密保存，每次启动后解锁」：设置至少 12 字符的本机解锁密码，使用 AES-256-GCM 加密，PBKDF2-SHA-256 600,000 次派生。只持久化密文、盐值、IV 与算法参数，不保存密码或解密密钥。重启/重载后需要解锁。忘记密码无法恢复，只能删除加密副本并重新填写 Key。
- 旧版持久明文 Key 自动转入本次会话后删除持久字段，等待用户选择保存方式。已有密码加密 Key 升级后保留原模式；先解锁，再选择免解锁并保存即可，无需重填 Key。切换到其他保存方式前需先解锁，或填写新 Key，避免丢失原加密副本。密码模式下立即锁定清除会话 Key 并停止正在进行的请求；免解锁模式不显示锁定按钮。删除 Key 清除会话、密文与自动解密密钥。
- 首次或升级后必须阅读并确认数据处理说明；撤销确认并保存会阻止后续 API 请求。
- Chrome local/session 存储均限制为 `TRUSTED_CONTEXTS`。网页 Content Script 不可读取 Key；设置页不回显已保存的 Key。
- 所有请求固定发往 `https://api.openai.com/v1/responses`，由 Service Worker 发起。只发送选中文字、操作所需指令、目标语言和用户自定义要求。
- 不自动上传整页、整封邮件、页面 URL 或浏览历史；若用户主动选取整封邮件或含网址的文字，这些选区内容仍会发送。不做输入监听上传，不使用分析或遥测服务。
- 使用 `store:false`，不主动建立 Responses 会话历史。这不等于 OpenAI 服务端零保留，服务端数据政策以账户条款为准。
- 原文与结果仅用于当前悬浮窗口，不写入历史记录。模型输出以纯文本渲染，不执行 HTML 或脚本。
- 本机加密无法防护已控制浏览器/系统的恶意软件，也无法保证删除旧版备份中的历史残留。不要打包或共享真实 Key。
- 隐私政策：https://noredge.github.io/lingo-chrome-extension/privacy.html；扩展内附有离线副本。支持邮箱：hongbin.lei98@gmail.com。

## 常见问题

- **划词后没有图标：**确认已启用该站点、没有暂停；刷新页面。浏览器限制页面无法注入。选区超出上限也不会显示入口。
- **修改 Key 后仍显示缺少 Key：**保存后点击结果区「重试」，或关闭窗口重新划选。
- **401：**Key 无效、撤销或过期；在设置中更新。
- **404 / 模型无权访问：**检查模型名和项目权限。默认模型是否可用由你的 OpenAI 项目决定。
- **429：**请求频率或额度限制；检查余额和项目限制后再试。
- **超时 / 后台中断：**点击重试；不会自动重复收费请求。网络长时间无响应会停止，未完成结果不允许替换。
- **替换按钮变灰：**原文已变化或选区不再可靠，重新划选；旧结果仍可复制。
- **关闭或移除站点授权后：**后台会重新验证网页访问权，并阻止未获授权的新请求。刷新已有页面可清除此前已注入的界面。用扩展菜单的「暂停此站点」可立即暂停当前页。
- **需要卸载：**在 `chrome://extensions` 中移除 Lingo。删除扩展中的 Key 不会撤销 OpenAI 平台上的 Key。

## 从源码构建

需要 Node.js 20.19+ 或 22.12+（本次使用 Node 24）。在仓库根目录（或 ZIP 中的 `source/`）执行：

```sh
npm ci
npm run typecheck
npm test
npm run build
```

`dist/` 是构建结果；将它作为已解压扩展加载。修改后重新构建，在扩展管理页点击刷新，再刷新使用扩展的网页。

```sh
npx playwright install chromium
npm run test:browser
npm run test:security
npm run test:review
node tests/release-smoke.mjs
npm run store:assets
npm run package:store
```

浏览器测试使用隔离的临时配置文件和受控模拟的 API 响应。测试副本额外预授权本地测试站点和被拦截的 Gmail 测试地址；不会创建/使用真实 API Key，测试完成后删除临时配置文件。`release-smoke.mjs` 使用原样生产 manifest 确认可加载且没有预置 Key。截图与结果写入源码目录上一级的 `evidence/`。

## 代码结构

- `src/content.ts` / `overlay.css`：选区入口、悬浮界面、请求会话与状态。
- `src/selection.ts`：选区快照、过期检查、标准输入框与富文本编辑。
- `src/background.ts`：密钥存储、权限、动态注入、流式 API 和取消。
- `src/core.ts`：提示词、请求校验、SSE 解析与错误分类。
- `options.html` / `src/options.ts`：设置、网站授权和连接测试。
- `popup.html` / `src/popup.ts`：工具栏入口与当前站点开关。
- `tests/`：核心测试、Chrome 流程测试及本地编辑器样例。

实现参考：[Chrome 扩展存储](https://developer.chrome.com/docs/extensions/reference/api/storage)、[动态脚本注入](https://developer.chrome.com/docs/extensions/reference/api/scripting)、[后台生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)、[OpenAI 流式响应](https://developers.openai.com/api/docs/guides/streaming-responses)。

## Unlisted 商店发布

上架材料位于 `store/`，先阅读 `store/SUBMISSION-GUIDE.md`。`npm run package:store` 生成 manifest 位于根目录的运行时 ZIP。源码与隐私支持文档统一放在公开的 `Noredge/lingo-chrome-extension` 仓库。本项目不包含真实 API Key 或审核凭据。

## License

本项目采用 [MIT License](LICENSE)，Copyright (c) 2026 Noredge。允许使用、修改和分发，需保留版权及许可声明。Vite 生成的运行时辅助代码声明见 [THIRD_PARTY_NOTICES](public/THIRD_PARTY_NOTICES.txt)；开发依赖遵循各自许可证。
