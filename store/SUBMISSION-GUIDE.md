# Unlisted 上架操作单 · Lingo 1.4.0

## 已准备

- 仅扩展运行文件的 Lingo-1.4.0-webstore.zip，manifest.json 位于根目录。
- 中英文商店文案：STORE-LISTING.md。
- 权限、单一用途与数据披露：PRIVACY-FIELDS.md。
- 审核测试步骤：REVIEWER-INSTRUCTIONS.md（未包含真实 Key）。
- 四张 1280×800 截图、128×128 图标、440×280 宣传图：assets/。
- 公开隐私政策：https://noredge.github.io/lingo-chrome-extension/privacy.html
- 公开支持页：https://noredge.github.io/lingo-chrome-extension/
- 发布者 Noredge；公开支持邮箱 hongbin.lei98@gmail.com。

## 你来完成的后台步骤

1. 在 https://chrome.google.com/webstore/devconsole 注册开发者账号、接受协议并支付注册费，开启 Google 账号两步验证。联系邮箱可后改，但更换开发者登录账号通常需要转移扩展。
2. 填写发布者信息并验证公开联系邮箱；按后台提示完成适用的身份/经营者信息。这里只提供发布材料，不代替后台审核要求。
3. 新建项目，上传 **Lingo-1.4.0-webstore.zip**。不要上传含 source/store/verification 的完整交付 ZIP。
4. Store listing：粘贴文案，上传 assets 中的图标与四张截图，填写支持和隐私网址。
5. Privacy practices：使用 PRIVACY-FIELDS.md，核对当前表单字眼，确保声明和代码实际一致。
6. Distribution：选择 **Unlisted**。Unlisted 不出现在搜索中，但任何拿到链接的人都可安装，它不是私密访问控制。首版保持免费安装，自备 OpenAI Key/API 额度已在文案说明。
7. Test instructions：填写审核步骤，明确 BYOK 前提。如审核需要你提供凭据，另行准备专用测试访问，不能把真实 Key 放进 ZIP/公开文案。此交付没有创建或共享真实审核 Key。
8. 最终检查后 Submit for review。建议选择“审核通过后手动发布”，以便先检查上线信息。审核通过后按后台给出的期限发布。
9. 安装商店版本时，它与现有本地加载版本通常具有不同扩展 ID，Key 与设置不会自动跨 ID 迁移。手动配置新版本，确认后停用旧本地版本，避免双重浮窗。

## 本机版本升级提示

1.4.0 新安装默认“记住 Key，免解锁”，本机自动加密；仅本次会话和密码加密为可选项。已有密码加密 Key 保留原模式，先解锁，再选择免解锁并保存即可。自动解密密钥也在本机，不能宣称等同于系统钥匙串。旧版明文记录仍迁入会话并删除原持久字段，等待用户选择保存方式。

## 后续更新

改源码 → npm run typecheck → npm test → npm run build → npm run test:browser → npm run test:security → node tests/release-smoke.mjs → npm run package:store。更新 manifest/package 版本号，上传新 ZIP，重新提交审核。截图仅在 UI 有变化时重新生成。

公开支持邮箱可更新，改动后同步商店联系邮箱（按后台提示重新验证）、公开政策页和扩展内离线政策。源码和隐私支持文档统一在公开仓库 Noredge/lingo-chrome-extension 中维护。
