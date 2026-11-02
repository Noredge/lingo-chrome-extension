# Lingo 1.4.0 发布前验证

日期：2026-11-02

- TypeScript 严格检查、12 项核心测试和生产构建通过。
- 42 项浏览器流程通过：默认免解锁保存、local/session 对内容脚本的访问隔离、语言管理、八方向缩放、局部替换、撤销、Gmail DOM 兼容、密码加密转换与错误处理。
- 25 项凭据生命周期检查通过：实际关闭并重启隔离 Chrome，默认免解锁 Key 仍可使用；密码模式保持锁定；不可导出 AES-256 CryptoKey 正确持久化；持久字段不含明文 Key；密文篡改拒绝；模式转换与删除清理密文和自动密钥；失败转换保留原有凭据。
- 日常 Chrome 已重载并显示 1.4.0，原扩展 ID 保持不变；未读取用户 Key 或改变其存储模式。
- 生产 manifest 原样加载通过，无预置 Key、无全站预授权。上架 ZIP 根目录包含 manifest，包含 MIT License 和 Vite 运行时许可声明。
- 下拉框采用内缩箭头，保留原生 select 键盘语义和强制色彩模式回退。浮窗和设置页截图已检查。
- 商店四张截图来自真实扩展 UI 与演示页面，响应为固定样例；未使用私人邮件或真实 API Key。

## 验证边界

自动化使用隔离 Chrome for Testing 和无效示例 Key，本轮无真实 OpenAI API 调用。此前真实 Chrome/Gmail 记录见 LIVE-CHROME-GMAIL.md；本轮的重启验证是隔离浏览器验证。默认模式的自动解密能力也在浏览器配置中，不等同于系统钥匙串或抵御完整配置窃取的保证。未执行第三方安全审计，不保证商店审核结果。

详细结果：browser-results.json、security-results.json、release-smoke.json。
