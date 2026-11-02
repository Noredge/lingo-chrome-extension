# Lingo 1.1.0 验证记录

2026-11-02

- TypeScript 严格检查、生产构建通过。
- 核心测试 6/6；Chrome for Testing 浏览器检查 38/38，无未捕获页面错误。
- 验证拖动、缩放、结果生成后布局稳定、同页重新打开记住布局、键盘缩放、视口缩小时保持可见、恢复默认布局。
- 验证移动/缩放后替换原有选区、原生撤销、过期保护和 Gmail 特殊 DOM 回归。
- 验证设置页 31 种语言、保存默认值后新浮窗与 API 请求使用该值；权限引导反映实际授权。
- 原样 manifest 加载通过，初始仅有 OpenAI API 主机权限，没有嵌入 Key 或默认全站权限。
- 用户日常 Chrome 已重载 1.1.0；所有站点授权仍由用户在 Chrome 提示中确认。

## 边界

38 项自动化检查使用模拟 API、隔离配置文件、本地/被拦截的 Gmail 样例，不访问真实邮箱。设置截图无 Key，写作截图为模拟结果。既有真实 API/Gmail 1.0.0 测试见 LIVE-CHROME-GMAIL.md；对应包含个人账号的截图仅保存在原本机交付包，未同步仓库。尚未全面测试复杂编辑器、邮件图片/表格/签名、跨域框架和所有网站。

## 浏览器检查

- unpacked extension loads; settings renders without remote assets
- missing Key shows setup action and sends no request
- Key saved to session by default and cleared from visible input
- content scripts cannot read secret storage
- site-authorized selection launcher and streamed translation
- copy writes the complete result to clipboard
- rewrite receives original text instead of translation
- same-selection completed results reused without duplicate request
- custom instruction stays separate from source
- target language changes trigger translation
- 31 languages available; saved default reaches new overlay and API request
- drag and resize retain source selection; generated content does not move or resize manual layout
- manual layout retained when reopening on the same page
- keyboard resize and viewport shrink keep the window reachable
- reset restores automatic layout and default width
- permission onboarding reflects actual grants and offers explicit all-sites action
- textarea replacement changes only original selection and emits native input
- native undo restores textarea edit
- single-line input replaces just selected words
- stale source disables replacement while keeping copy
- Gmail-style contenteditable preserves surrounding text and formatting
- native undo restores rich-text replacement
- Gmail line-break boundaries and grammar-only DOM changes retain exact replacement range
- real rich-text changes still invalidate replacement
- 401 error and explicit retry recover
- quota failure is explained without leaking server payload
- incomplete output cannot be applied
- model HTML renders as plain text
- cancelled request cannot restore late results
- new selection is isolated from old in-flight request
- password fields are excluded
- context-menu fallback cannot bypass password exclusion
- read-only fields only offer copy
- overlay fits narrow viewport
- remember-to-local migrates the Key without duplicate storage
- popup renders and rejects unsupported extension pages
- Gmail Smart Compose hints are excluded and hint removal does not shift replacement
- no uncaught page errors
