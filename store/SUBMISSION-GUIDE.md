# Lingo 1.0.0 · Public 提交清单

运行包：`store/packages/Lingo-1.0.0-webstore.zip`，manifest 位于 ZIP 根目录。只上传运行包，不上传源码或完整材料 ZIP。

1. 用户完成开发者注册及付款。
2. 上传运行包，分发选择 **Public**。
3. 使用 STORE-LISTING.md 填写三语文案；按 PRIVACY-FIELDS.md 如实填写数据处理、单一用途和权限说明。
4. 上传 assets 中的 128×128 图标、5 张 1280×800 截图；440×280 宣传图可选。截图由最终 1.0.0 构建生成，固定示例响应已明确标注。
5. 填写公开隐私政策网址：https://noredge.github.io/lingo-chrome-extension/privacy.html 。网站源文件为 `docs/privacy.html`；提交前确认网址无需登录即可访问。
6. 提供 REVIEWER-INSTRUCTIONS.md 中的测试说明；审核使用的有效 API 访问需私下安排，不把真实 Key 放入包或公开材料。
7. 用户检查商店页面后提交审核。GitHub Release 不代表 Chrome Web Store 已提交或获批。

重新生成：`npm run build && npm run store:assets && npm run package:store`。
