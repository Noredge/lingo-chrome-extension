# Lingo 1.1.0 · 更新提交清单

状态：发布流程已启动，实时进度见 [PUBLISH-STATUS.md](PUBLISH-STATUS.md)。现有商店条目为 [Lingo](https://chromewebstore.google.com/detail/imofdjefcigddmfpoifioiejgkfnomip)，ID `imofdjefcigddmfpoifioiejgkfnomip`。2026-11-09 检查公开页仍显示 1.0.0；不要新建重复条目。

1. 候选版真实网站验收已完成；核对 RELEASE-CHECKS.md 与运行包校验值后，在既有条目中上传 `store/packages/Lingo-1.1.0-webstore.zip`。manifest 位于 ZIP 根目录。只上传运行包，不上传完整材料包。
2. 同步部署 `docs/privacy.html` 到公开政策网站。再次确认 [隐私政策](https://noredge.github.io/lingo-chrome-extension/privacy.html) 无需登录、显示 1.1.0，并包含自动检查当前编辑区全文、个人通信、词典和继续调整说明。2026-11-09 已部署并验证 HTTP 200、版本 1.1.0，且与本地政策逐字节一致。
3. 用 STORE-LISTING.md 更新三语描述，按 PRIVACY-FIELDS.md 核对后台数据披露、单一用途与权限用途。免费安装与 API 单独计费均需保留。
4. 上传 assets 的 128×128 图标和 5 张 1280×800 截图；440×280 宣传图可选。截图来自候选构建，API 输出为注明的固定示例。来源文件及 SHA-256 见 BUILD-PROVENANCE.json。
5. 填入 REVIEWER-INSTRUCTIONS.md；审核所需有效 API 访问由发布者在私密渠道安排。材料和 ZIP 均不包含真实凭据。后台具体要求以当时表单为准。
6. 预览语言、图片、隐私披露和版本，保留现有分发配置；由发布者明确提交审核。上传、提交、审核通过、公开发布、商店安装验收分别记录，不能互相替代。
7. 公开后检查商店版本和可安装性，再更新 README/CHANGELOG 的候选状态。GitHub 发布与 Chrome Web Store 是两个独立步骤。

重建：`npm run typecheck && npm test && npm run build && npm run store:assets && npm run package:store`。功能改动另需相关浏览器回归。正式打包拒绝 dev/rc 标识及与构建不一致的截图。

官方参考：[更新既有条目](https://developer.chrome.com/docs/webstore/update)、[商店图片规格](https://developer.chrome.com/docs/webstore/images)。
