# 当前状态：开发预览 1.0.0-dev.2

最新验证见 verification/DEVELOPMENT-1.0-dev.2.md；本版使用 Responses API 多套具名服务配置。完整地址通过 AES-GCM 附加认证数据与 Key 绑定；测试和启用分离，失败不自动切换。

# 发布前凭据检查

2026-11-02。检查范围包含所有可达 Git 历史 blob 与当前待发布文件。使用 scripts/audit-secrets.py 扫描 OpenAI/GitHub/AWS/Google API 凭据模式及私钥标记，同时检查环境文件、浏览器配置、node_modules 是否混入提交。

结果：未发现真实凭据候选。唯一白名单为明确无效的测试字符串 sk-test-fixture-not-a-real-secret；它只用于隔离测试，不在扩展运行时 ZIP 中。用户的真实 Key 未通过工具读取、打印、截图或写入仓库。

运行时包另有独立检查：无 sk- 凭据字符串、无本地测试源地址、无源码/测试文件、无 source map 或环境文件。密码模式使用用户密码派生的 AES-256-GCM，不保存密码或派生密钥。默认免解锁模式使用随机 AES-256-GCM 密钥，持久保存密文与扩展 IndexedDB 中不可导出的 CryptoKey；自动解密能力也在本机，因此不保证抵御完整配置文件窃取。两种持久模式都不写入明文 API Key，明文仅在后台内存或受限会话存储中可用。

这属于自动化模式扫描和文件审查，不是第三方安全认证。公开前再次运行 python3 scripts/audit-secrets.py；扫描报告只输出计数和可疑文件名，不输出匹配内容。
