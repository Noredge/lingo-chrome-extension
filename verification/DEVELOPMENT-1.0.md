# 1.0.0-dev.1 验证记录

日期：2026-11-02。Chrome manifest version 0.9.0，version_name 1.0.0-dev.1；正式 1.0 推迟。GitHub 仓库已确认 PRIVATE；原 v1.0.0 改为 prerelease，历史开发发布保留，不改写历史。

## 当前功能

- 简体中文、繁體中文、英文，默认跟随 Chrome；按钮、动态错误、权限和数据说明均本地化。界面设置独立于 31 种翻译目标语言列表。源文和输出明确排除在界面翻译之外。
- PDF/普通可读网页选区右键 → 原生 sidePanel；不注入内置 PDF 阅读器，不上传整个文件。可编辑框保留原有浮窗和精准替换。
- 所有提供方使用同一 Chat Completions 实现，Base URL / Key / 模型 / 测试连接。支持 SSE 与 JSON 返回、无 sk- 前缀凭据和含斜杠的模型名，拒绝重定向和非本机明文 HTTP。
- AES-GCM 的附加认证数据、持久凭据和会话缓存都绑定完整 Base URL。切换地址必须填写新服务 Key。旧凭据仅兼容默认 OpenAI 地址。设置页修改地址会清空同意状态，未保存的地址/模型不能测试连接。
- API-only 主机授权不显示为网页划词授权。各任务请求仍验证当前网站/API 权限，设置或凭据变更中止旧请求。
- 旧默认免解锁、可选密码加密、精确替换、原生撤销、浮窗八方向调整全部保留。

## 自动检查

113 项通过：20 核心/协议/密码单元测试，45 网页与编辑器流程，25 凭据生命周期，7 既有审查回归，16 新功能浏览器检查。另通过 TypeScript 类型检查、构建、未修改正式 manifest 的加载 smoke、截图与运行哈希校验、开发包检查；正式商店打包对 dev 版本的负向测试按预期拒绝。npm audit 未报告已知依赖漏洞。

浏览器 tests/features.mjs 重点验证：
- 浏览器英文自动选择与三语手动切换、独立目标语言、后台错误本地化。
- OpenAI 与通用自定义域名都使用同一请求 schema，不写服务商专用适配。
- 不换 Key 时更换地址失败且保留原记录；完整路径绑定；清空会话后正确解密；篡改服务地址无法使用凭据；重定向不触达其他地址。
- SSE 截断不报完成，reasoning 不混入结果，JSON fallback 工作；HTML 模型输出按纯文本显示。
- 侧边栏一次性领取选区、语言切换不改变源文/结果、清除内容；API 授权不会冒充网站划词授权。

所有自动 API 调用均被拦截，只有无效 fixture Key；没有读取用户 Key 或调用真实服务计费。Gmail 验证为受控的 Gmail 风格编辑器，未重新操作用户真实邮箱。旧 LIVE-CHROME-GMAIL.md 属于更早构建，不作为此次 API 改版的真实服务验收。

## 原生 Chrome PDF 操作

使用 Google Chrome for Testing 的独立临时配置，加载扩展；生成无私人信息的 PDF。通过原生 UI 实际执行：
1. 打开本地 HTTP 地址的 sample.pdf，Chrome 内置 PDF 阅读器呈现文本。
2. 拖选 “The quiet moments are worth remembering.”，打开原生右键菜单，确认存在 “Translate with Lingo”。
3. 点击该菜单，Chrome 原生侧边栏出现，显示数据目的地、选中源文、目标语言、复制按钮与模拟结果“那些安静的时刻值得铭记。”。
4. 同一浏览器再打开 file:// 本机 PDF，重复选区/原生菜单，侧边栏再次显示结果。

原生窗口可访问性树确认 URL 为 Chrome 内置 PDF 阅读器，侧边栏 URL 为当前扩展 sidepanel.html；模拟 API 计数从 1 增至 2。测试没有授予 file:// 文件读取权限，扩展只接收用户通过菜单传来的选区。原生截图在任务中可见；保存的 pdf-native-result.json 记录测试范围。完成后关闭隔离浏览器并清理临时配置。

## 发布边界

当前仍为开发版，不宣称已完成真实 OpenAI / DeepSeek 账户质量或延迟验收；服务商标准兼容性由 mock 协议和官方接口文档核对，实际可用模型取决于各账户。扫描型 PDF 不含文本时需要 OCR；不修改 PDF 文件。自定义专用鉴权和专用请求体不属于标准协议支持范围。

公开隐私政策网址需正式发布前恢复并验证；此次私有化后 GitHub Pages API 返回 404。离线政策已包含三语和新服务目的地/侧边栏会话存储说明。本轮未注册、付款、提交商店或发布正式 1.0。

## 参考

- https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
- https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://api-docs.deepseek.com/
- https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- https://developer.chrome.com/docs/extensions/reference/api/contextMenus

## 日常 Chrome 更新

保持用户已安装的 unpacked 路径不变，更新运行文件后在 Chrome 扩展页重载。原生 UI 显示 `1.0.0-dev.1`，扩展 ID 保持 `ekppnickhpacjacgeeidmnciemdkaeak`。没有读取或修改用户的存储 Key；已有网页需刷新以替换旧内容脚本。扩展管理页在本轮重载之前已有一个旧页面 `Extension context invalidated` 记录，未清理用户诊断记录。
