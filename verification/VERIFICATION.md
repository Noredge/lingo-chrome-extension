> 历史开发快照验证。当前版本请见 DEVELOPMENT-1.0.md。

# Lingo 正式版 1.0.0 发布前验证

日期：2026-11-02。综合结论、修复项和边界见 REVIEW.md。

- TypeScript 严格检查与构建通过。
- 12 核心 + 45 浏览器 + 25 凭据生命周期 + 7 审查回归，共 89 项通过。
- 日常 Chrome 已重载并显示正式版 1.0.0，扩展 ID 保持不变，未改变用户 Key 的保存模式。
- 生产 manifest 原样加载通过；无预置 Key、无全站预授权。
- 四张正式版商店图已重新生成并目视检查；构建与图片哈希由打包器校验。
- MIT License、第三方声明、离线隐私政策随运行包分发。
- 本轮使用隔离 Chrome 和模拟 API，不读取或消耗用户真实 Key，不发送邮件。

详细结果：browser-results.json、security-results.json、review-results.json、release-smoke.json。早期真实 Chrome/Gmail 记录见 LIVE-CHROME-GMAIL.md。
