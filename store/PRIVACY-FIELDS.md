# Privacy practices · 后台填写材料

## Single purpose

Translate, proofread and rewrite text explicitly selected by the user, then let the user copy the result or replace that selection in supported editors.

## Permission justifications（可直接复制）

| 后台字段 | 英文说明 |
|---|---|
| storage | Store local preferences, consent state, a user-password-encrypted API key (only if opted in), and the currently unlocked API key in trusted-context-only session storage. No Chrome sync storage or text history is used. |
| activeTab | Temporarily access the current page after the user invokes the toolbar, shortcut or context-menu action, to read the selected text and show the translation popup. |
| scripting | Inject the bundled content script into the user-invoked page or explicitly authorized sites. The script displays the popup and performs user-requested selection replacement. No remotely hosted script is injected. |
| contextMenus | Provide the explicit “translate and edit with Lingo” action for selected text and editable fields. |
| clipboardWrite | Copy the generated text only when the user clicks Copy. The extension does not read clipboard contents. |
| https://api.openai.com/* | Send selected text and task instructions directly to the OpenAI Responses API using the user's own API key, and return translated/edited text. Requests require prior consent. |
| optional http://*/* and https://*/* | Enable the selection icon and popup on ordinary websites chosen by the user. Broad website access is optional and requested through Chrome's permission prompt. Users may instead authorize individual sites or use temporary activeTab invocation. No browsing history is recorded or automatically uploaded. |

## Remote code

选择 No / 不使用远程代码。
所有 JS/CSS 随 ZIP 打包。OpenAI 返回文本；返回内容只显示为纯文本，不执行。外部隐私/支持链接是普通网页链接，不是代码依赖。

## Data usage

披露应覆盖本机处理和向 OpenAI 传输，不能因为开发者无中转服务器就填写“不处理用户数据”。按当前后台字段核对以下映射：

- Authentication information：用户 API Key；本机解锁密码仅用于本地加解密、不持久保存、不发送。
- Website content：用户明确选取的网页/编辑器内容、输入的修改要求与生成结果。
- Personal communications：用户可能在邮件或消息编辑器中选取的文字；不读取邮箱后台、不上传未选中的邮件或附件。
- Web history / browsing activity：仅在本机使用当前 URL/域名以判断网站授权和暂停状态。没有访问轨迹、页面标题/时间数据库或浏览分析；不将 URL 自动附加至 API 请求。按 Chrome FAQ 对当前域名/URL 属于浏览活动的说明披露。

用户主动选取的内容也可能包含个人身份、财务或健康信息。扩展不专门提取这些类别；若后台问题按“可能处理的任何数据”而非功能设计的类别提问，应如实涵盖这些内容，勿承诺“永远不会处理敏感信息”。

三项 Limited Use 认证应与事实一致：不出售/转让给第三方用于无关目的；不用于与单一用途无关的目的；不用于信用评估/借贷资格判断。OpenAI 的处理是用户明确请求的翻译/写作功能所必需，并已在产品界面和隐私政策披露。

隐私政策 URL：https://noredge.github.io/lingo-chrome-extension/privacy.html
支持 URL：https://noredge.github.io/lingo-chrome-extension/

核对来源：
- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements
