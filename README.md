# Lingo · 1.0.0-dev.1

自用 Chrome 划词翻译与写作扩展，正在准备正式 1.0。当前为开发预览，仓库已恢复私有，未提交 Chrome Web Store。之前的 v1.0.0 / v1.3.0 / v1.4.0 均为历史开发快照，GitHub Releases 标记为 prerelease。

Manifest 数字版本为 `0.9.0`，显示版本为 `1.0.0-dev.1`。尚未在商店发布，因此可以在正式发布前重新整理版本序列；将来正式版使用数字版本 `1.0.0`。不要把历史开发包当成当前上架包。

## 使用

在 `chrome://extensions` 开启开发者模式，加载 `extension/` 或构建出的 `dist/`。Chrome 120+。更新已加载的版本时保留加载目录，点击扩展的重载按钮，再刷新网页。

设置中填写 Base URL、API Key 和模型，确认数据传送说明后保存，再点“测试连接”。默认免密码记住 Key；密码加密与仅本次会话仍可选。开发者不会提供、读取或接收你的 Key。

- **网页**：授权网站 → 选中文字 → 文 → 自动翻译。校对、改写和自定义指令始终使用原文；复制或在支持的输入框/Gmail 简单编辑器中明确点击替换。浮窗可拖动、八方向缩放，最小 320×300。
- **PDF**：Chrome 内置阅读器正常打开网页 PDF 或本机 PDF → 选中文字 → 右键“用 Lingo 翻译” → 原生侧边栏显示结果。无需上传整个 PDF，也无需注入 PDF 阅读器。扫描图片型 PDF 没有可选文字，需要先 OCR。侧边栏提供翻译、校对、自然和简洁改写及复制，不修改 PDF 文件。普通可读网页的右键选区也使用侧边栏；可编辑框仍走原有浮窗和安全替换。
- **界面语言**：默认跟随 Chrome，支持简体中文、繁體中文、English，也可手动选择并保存。浏览器非中文语言回退英文。界面语言独立于翻译目标语言；目标语言仍可从 31 种语言中选择浮窗短列表。源文和 API 结果不参与界面翻译。

## 通用 API

所有服务共用一个实现：`POST {Base URL}/chat/completions`。请求仅含 `model`、`messages`、`stream:true`，认证为 `Authorization: Bearer ...`。使用 system/user messages，无工具调用，无整页内容、来源 URL 或历史对话。不再使用 Responses API。

| 服务 | Base URL 示例 | 模型 |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | 默认保留 `gpt-6-luna`，也可填可用的 Chat Completions 模型 |
| DeepSeek | `https://api.deepseek.com` | 填服务商当前提供给你账户的模型名 |
| 其他相容服务 | 服务商给出的根地址，包含所需 `/v1` 等路径 | 可包含 `/`、`:` 等模型命名字符 |
| 本机服务 | `http://localhost:1234/v1` | 本机服务的模型名 |

自动去掉多余的尾斜线；若粘贴了完整 `/chat/completions`，会归一到根地址。外部服务只接受 HTTPS，本机回环地址允许 HTTP；不接受 URL 内的账户密码、查询参数或片段。不会自动添加 `/v1`，也不会逐家适配专用参数或重试切换协议。

SSE 支持拆分 Unicode、CRLF、`choices[].delta.content`、结束原因与 `[DONE]`；兼容返回 `application/json` 的完整 Chat Completions 响应，忽略 reasoning/usage 元数据。空结果、拒绝、截断、格式错误、网络错误、429、401 等都有三语提示。部分结果不能替换原文。服务差异如仅支持专用认证或自定义请求体，仍需要服务商提供标准相容接口。

设置、侧边栏和浮窗显示数据接收地址。**Key 绑定完整归一化 Base URL（含端口、路径），更换地址须填写新服务 Key，重新同意数据处理。** AES-GCM 附加认证数据也绑定服务地址；缓存会话密钥不会跨服务使用。重定向被拒绝，避免把 Key 或文字转发到其他地址。Chrome 的 API 主机授权在保存时请求；API 单独授权不会自动成为网页划词授权。测试使用已保存的地址与模型，修改后必须先保存。

## 保存与隐私

默认“记住 Key，免解锁”：随机 AES-256-GCM 加密，非导出 CryptoKey 保存在扩展 IndexedDB，密文在 `TRUSTED_CONTEXTS` 本机存储。没有源码内置 Key，没有明文持久 Key。解密能力仍在同一浏览器配置中，不能防御完整配置被窃取或系统被控制，不等同于系统钥匙串。

可选密码模式使用 PBKDF2-SHA256 600,000 次 + AES-GCM；已有密码密钥不会自动降级。可选 session 模式不持久保存 Key。旧 OpenAI 凭据只向默认 OpenAI 地址迁移，不向其他服务复用。内容脚本不能读取 local/session 凭据，保存/锁定/删除操作中止旧请求。

只发送明确选中的文字和必要指令，没有分析、广告、开发者代理或文字历史。PDF 选区通过窗口隔离的会话收件箱一次性传递，收到即删除，不写入 local；过期收件内容不处理，来源标签/窗口关闭时删除。侧边栏关闭、清除或来源切换时丢弃显示内容。

服务端保留与费用由你选择的服务商决定，Lingo 不承诺零保留。详情见 `public/privacy.html`，包含简中、繁中、英文。仓库恢复私有后 GitHub Pages 不再可用，上架前需恢复公开可访问的政策地址。

## 开发与验证

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run test:browser
npm run test:security
npm run test:review
npm run test:features
node tests/release-smoke.mjs
npm run store:assets
npm run package:dev
python3 scripts/audit-secrets.py
```

需要 Playwright Chromium（首次可 `npx playwright install chromium`）。测试只用隔离浏览器、无效 fixture Key 与拦截的 API 响应，不读取个人 Chrome 配置。`tests/pdf-native.mjs` 是需要人工/原生 UI 操作的 PDF 验收程序，以 Ctrl+C 退出并清理；不会混入发布运行代码。证据见 `verification/DEVELOPMENT-1.0.md`。旧验证报告仅代表对应历史构建。

`npm run package:store` 对开发版本拒绝打包，防止误上架；`package:dev` 生成可解压加载的开发运行 ZIP。商店素材仍为草稿。截图带版本与构建哈希，代码改变后必须重新生成。

## 官方协议参考

- [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
- [OpenAI GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)
- [DeepSeek 标准相容 API](https://api-docs.deepseek.com/)
- [Chrome Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)

MIT License · Copyright (c) 2026 Noredge。支持：hongbin.lei98@gmail.com；请勿发送 Key 或私人文档。
