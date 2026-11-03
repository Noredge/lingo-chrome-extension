# 商店文案草稿 · 1.0.0-dev.8

尚未上架。当前仓库私有；原 GitHub Pages 网址不能作为已验证的公开政策链接。正式 1.0 前恢复公开政策页面、补齐最终截图并重新检查商店字段。计划 Unlisted，由用户完成开发者注册、付款及最终提交。

发布者：Noredge · 支持：hongbin.lei98@gmail.com。免费安装，API 用量由用户所选服务商单独计费。无内置额度，不承诺“免费 AI”。

## 简体中文

名称：Lingo · 划词翻译与写作

简短说明：划词翻译、校对与改写，支持 PDF 侧边栏与三语界面。自备兼容 API Key，用量另计。

详细说明：

Lingo 把翻译和按需写作放进一个可移动、可缩放的浮窗。选中文字，先看翻译，再校对、改写或输入自己的要求；在支持的输入框中只替换最初选中的部分，保留原生撤销。

Chrome 内置阅读器中的 PDF 可选中文字后右键“用 Lingo 翻译”，在旁边的原生侧边栏查看并复制结果。支持文字型网页 PDF 和本机 PDF；扫描图片需要先 OCR。不会上传整个 PDF，不修改 PDF 文件。

界面支持简体中文、繁體中文与 English，默认跟随 Chrome，也可手动切换。界面语言与翻译目标语言独立；从 31 种目标语言中挑选浮窗常用列表。浮窗可拖动标题栏移动，从四边/四角缩放，最小 320×300。

使用自己的 OpenAI 或其他 Responses API 相容服务：填写 Base URL、API Key、模型，再测试连接。所有服务共用标准接口；无需开发者账户，不包含 API 额度。服务商可能按其政策收费。

只有你确认说明并打开翻译/写作操作时，选中文字和必要指令才发往设置中显示的服务地址。Key 与完整地址绑定；换服务须填写相应 Key。不自动上传整页、整封邮件或浏览历史，无开发者代理、广告、分析或文字历史。服务端保留由服务商政策决定。

Key 默认本机自动 AES-256-GCM 加密并免解锁，也可选 session-only 或密码加密。自动解密密钥也在浏览器配置中，不能防护完整配置被窃取，不等同于系统钥匙串。密码模式在浏览器重启/扩展重载后解锁一次。

复杂编辑器仅保留复制；浏览器内部页与扩展商店不支持网页浮窗。模型可能出错，请核对后使用。

支持：hongbin.lei98@gmail.com，请勿发送 Key、密码或私人文档。Lingo 是独立工具，并非 OpenAI、DeepSeek 或 Google 官方产品。

## 繁體中文

名稱：Lingo · 劃詞翻譯與寫作

簡短說明：劃詞翻譯、校對與改寫，支援 PDF 側邊欄與三語介面。自備相容 API Key，用量另計。

介面可跟隨瀏覽器，或選擇簡體中文、繁體中文、English；翻譯目標語言獨立設定。一般網頁選取文字後使用可移動、八方向縮放的浮窗；Chrome PDF 選取文字後右鍵「用 Lingo 翻譯」，在側邊欄查看結果。圖片型 PDF 需先 OCR。

填入自己的 Base URL、API Key 與模型，透過統一 Responses API 協定連接 OpenAI 或其他相容服務。Key 與完整服務網址綁定；資料接收方會明確顯示。服務費用與資料保留依所選服務商政策，擴充功能不提供額度。預設免解鎖的本機加密，也可選密碼加密或僅本次工作階段。自動解密金鑰亦在瀏覽器設定檔中，無法防範完整設定檔失竊。

只傳送明確選取的文字與指令，不自動上傳完整頁面、郵件、PDF 或瀏覽歷程，不設開發者代理、分析或廣告。請核對 AI 結果。支援信箱：hongbin.lei98@gmail.com，請勿寄送憑證或私人文件。

## English

Name: Lingo — Translate & Write

Short description: Translate and edit selections, including PDFs in a sidebar. Three UI languages. Bring your own compatible API key.

Lingo translates selected text and offers proofreading, tone presets and custom rewriting in a movable, resizable panel. Copy results or explicitly replace the original selection in supported inputs and simple editors, with native undo.

In Chrome’s built-in PDF viewer, select text, right-click “Translate with Lingo”, and see the result in the sidebar. Text-based web and local PDFs are supported; scanned images need OCR first. No entire-document upload or PDF modification.

Choose English, Simplified Chinese or Traditional Chinese for the interface, or follow Chrome. Translation targets are independent, with a shortlist selected from 31 languages.

Connect your own OpenAI or compatible service using Base URL, API Key, model and Test connection. One shared Responses API protocol is used. Provider usage is billed separately; no API credits are included. Credentials bind to the full service address, and the destination is visible. Changing addresses requires a Key for the new service.

After consent, only deliberate translation or writing actions send selected text and instructions to your chosen provider. No automatic full-page, whole-email, whole-PDF or browsing-history upload; no developer relay, analytics, ads or text history. Provider retention depends on its policies.

Keys are remembered with automatic local AES-256-GCM encryption by default. The decryption key is in the same browser profile, so this is not protection against whole-profile theft or an OS keychain. Password encryption and session-only storage are also available.

Complex editors may support copying only. Browser internal pages and extension stores restrict floating panels. Review generated text before use. Support: hongbin.lei98@gmail.com. Never send Keys, passwords or private documents. Independent software, not an official OpenAI or Google product.

多配置 / Multiple profiles: 保存名称、Base URL、Key、模型；选择后点击一次保存并使用即可切换。测试不会启用配置，失败不自动切换。自定义服务必须支持 Responses API。PDF 与浮窗共用完整面板，PDF 保留原生阅读器与右键入口。 / Save named profiles; save and use one explicitly in settings. Testing does not activate it, and failures never trigger fallback. Custom services must implement Responses API. PDF uses the shared panel and Chrome’s native viewer/context menu.

侧边栏原文支持手动编辑/粘贴；点击翻译才提交，输入时清除旧结果。保存条仅有改动时显示；保存配置即使用，无需另点启用。 / Edit or paste sidebar source and click Translate; typing clears old results without sending. The save bar appears only for unsaved changes, and saving also selects the service for use.
