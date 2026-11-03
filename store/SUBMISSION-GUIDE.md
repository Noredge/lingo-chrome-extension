# 上架暂缓 · 开发预览 1.0.0-dev.8

当前仓库已改为私有；历史 v1.0.0 也标记为开发预发布。不要上传此前的 1.0.0 / 1.3.0 / 1.4.0 包。当前开发运行包的 Chrome version 是 0.9.7，version_name 是 1.0.0-dev.8。

待正式 1.0 前：

1. 用各自账户测试真实 OpenAI 和选用的其他相容服务，核对模型名、余额、质量与延迟；当前新增验证使用模拟 API。
2. 核对三语 UI 和 PDF/网页交互、隐私说明及权限用途。参考 verification/DEVELOPMENT-1.0-dev.7.md。
3. 再由用户确定正式发布。将 manifest/package 的数字版本设为 1.0.0，清除 dev 的 version_name；不可误用旧历史 tag 的开发制品。
4. 恢复公开可访问的隐私/支持页面。现在仓库私有，原 GitHub Pages 设置已不可用；不能把旧地址当作有效页面提交。
5. 更新商店文案三语本地化，重新生成正式版截图、截图构建来源记录和最终包。npm run package:store 会拒绝 dev 版本。
6. 开发者注册及付款由用户完成；设置 Unlisted，填写真实的 Single purpose / 数据处理 / 权限说明，单独提供审核测试安排。不得把真实 Key 写进源代码、公开文案或包。
7. 最终提交由用户授权后进行。本轮未注册、未付款、未提交。

开发构建：npm run build && npm run store:assets && npm run package:dev。
