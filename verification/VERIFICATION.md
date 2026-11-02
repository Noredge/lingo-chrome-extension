# Lingo 1.2.0 验证记录

2026-11-02

- TypeScript 严格检查、生产构建通过。
- 核心和尺寸计算测试 10/10；Chrome for Testing 浏览器流程 41/41，无未捕获页面错误。
- 新增语言列表的添加/移除、默认项迁移、保存重开、浮窗与 API 请求目标一致性检查；最后一种语言不能移除。
- 新增四边/四角真实指针缩放检查，对边保持固定，320 × 300 最小尺寸与小视口适配通过。
- 延续选区替换、原生撤销、源文本过期保护和 Gmail 特殊 DOM 回归。
- 生产 manifest 加载通过，没有嵌入 Key 或默认全站授权。
- 用户日常 Chrome 已重载并显示 1.2.0；保留原扩展 ID 和本地配置。本轮八方向缩放及语言管理的功能验收来自隔离 Chrome 自动化，未重复真实 API/Gmail 修改测试。

## 验证边界

自动化浏览器检查使用模拟 API 和隔离配置文件，本地/被拦截的 Gmail 样例，不读取真实邮箱或真实 Key。设置截图无 Key，写作截图为模拟结果。既有真实 API/Gmail 记录见 LIVE-CHROME-GMAIL.md。复杂编辑器、邮件图片/表格/签名和所有网站尚未全面验收。

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
- settings add and remove languages; persisted shortlist and default reach overlay and API
- drag and resize retain source selection; generated content does not move or resize manual layout
- all four edges and corners resize with the opposite edge anchored
- readable 320x300 minimum enforced without visible resize decoration
- manual layout retained when reopening on the same page
- keyboard resize and viewport shrink keep the window reachable
- reset restores automatic layout and default width
- removing default chooses remaining language and final language cannot be removed
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
