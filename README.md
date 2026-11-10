# Lingo

轻量 Chrome 翻译与写作扩展。划词翻译、校对改写、红绿划线建议，使用你自己的 Responses API 服务。

[安装 Lingo](https://chromewebstore.google.com/detail/imofdjefcigddmfpoifioiejgkfnomip) · [下载运行包](https://github.com/Noredge/lingo-chrome-extension/releases/latest) · [隐私政策](https://noredge.github.io/lingo-chrome-extension/privacy.html)

## 安装与使用

1. 从 Chrome Web Store 安装，需要 Chrome 120+。首次引导中填写 Base URL、API Key 和模型，保存并测试连接，再按需授予网页访问权限。
2. 网页选中文字后点击「文」，即可翻译、校对或改写。在支持的输入框和简单富文本中，可确认后替换选中文字。
3. 在设置中开启自动检查后，输入停顿即可看到红色语法／拼写提示和可选的绿色表达建议。悬停查看，选择接受或忽略；支持撤销。检查按钮默认仅在有建议时显示，也可在设置中隐藏；手动检查可使用输入框右键菜单。
4. PDF 选中文字后右键「用 Lingo 翻译」。Google Docs 等复杂编辑器可从扩展菜单打开侧边栏，粘贴原文、处理后复制结果。

支持个人词典、自定义改写预设、结果／对比，以及基于结果的「继续调整」。切换「单词与短语」可查看释义、搭配和例句。

浮窗可拖动、缩放，原文可编辑。界面支持简体中文、繁體中文和 English；翻译目标语言独立设置。

## API 与隐私

默认连接 OpenAI，也支持自定义 Base URL 的 Responses API 服务。可保存多套连接配置，一次使用一套；仅支持 `/responses`。需要自备 API Key，用量由所选服务商另行计费。

自动检查默认关闭。手动操作发送所选文字、粘贴的原文或明确选择检查的当前编辑区全文；开启自动检查后，会发送当前编辑区全文，包括其中的邮件草稿。请求直接发往所选服务，不上传整页、附件或浏览历史。

原文和结果不保存为历史。Key 默认在本机加密保存，也可选择密码加密或仅会话保存。没有内置 Key、广告、分析脚本或开发者中转；服务商的数据保留以其政策为准。详情见[隐私政策](https://noredge.github.io/lingo-chrome-extension/privacy.html)。

## 开发

```sh
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run build
```

在 `chrome://extensions` 开启开发者模式，加载 `dist/`。也可从 [Releases](https://github.com/Noredge/lingo-chrome-extension/releases/latest) 下载运行包，解压后加载；更新后重载扩展并刷新网页。

浏览器回归命令见 `package.json` 中的 `test:*`，使用隔离配置与模拟 API。重新生成截图与运行包：`npm run store:assets && npm run package:store`。

MIT License · Noredge
