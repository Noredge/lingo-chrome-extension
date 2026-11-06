# Lingo

轻量 Chrome 翻译与写作扩展。划词翻译、校对、语气改写与自定义修改，使用你自己的 Responses API 服务。

**1.0.0 已在 Chrome Web Store 正式上架。** [安装 Lingo](https://chromewebstore.google.com/detail/imofdjefcigddmfpoifioiejgkfnomip)

## 安装与使用

1. 从 [Chrome Web Store](https://chromewebstore.google.com/detail/imofdjefcigddmfpoifioiejgkfnomip) 安装 Lingo。需要 Chrome 120+。
2. 首次引导中选择界面语言，填写 Base URL、API Key 和模型，保存并测试连接；网页访问权限可按需授权。
3. 普通网页选中文字后点击「文」，查看翻译或继续改写。在支持的输入框中可确认后替换选区。
4. PDF 选中文字后右键“用 Lingo 翻译”。Google Docs 和其它不支持浮窗的页面，可从插件菜单打开侧边栏粘贴原文，处理后复制结果。

浮窗支持拖动和八方向缩放。侧边栏原文框默认展开，可直接编辑。界面支持简体中文、繁體中文和 English；翻译目标语言独立设置，可从 31 种语言中选择常用列表。

## API 与隐私

默认连接 OpenAI，也支持自定义 Base URL 的 Responses API 服务。保存多套具名配置，一次使用一套，失败不会自动切换；仅支持 `/responses`，不支持 Chat Completions。API 用量由服务商另行计费。

只发送主动提交的原文及必要指令，不上传整个网页或 PDF，不保存文字历史。Key 默认在本机加密保存、免密码解锁，也可选择密码加密或仅本次会话。没有内置 Key、广告、分析脚本或开发者中转服务。详情见 [隐私政策](https://noredge.github.io/lingo-chrome-extension/privacy.html)。

## 开发

手动安装：从 [Releases](https://github.com/Noredge/lingo-chrome-extension/releases/latest) 下载运行包并解压，在 `chrome://extensions` 开启开发者模式并加载解压后的文件夹；也可直接加载本仓库的 `extension/`。

```sh
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run build
```

加载 `dist/` 测试。浏览器回归：`npm run test:browser`、`test:security`、`test:review`、`test:features`、`test:onboarding`，以及 `node tests/release-smoke.mjs`。测试使用隔离配置与模拟 API。

重新生成截图与上架包：`npm run store:assets && npm run package:store`。提交材料位于 [`store/`](store/)。

MIT License · Noredge
