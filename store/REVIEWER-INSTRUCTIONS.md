# Reviewer instructions — draft, not submitted

Current build: 1.0.0-dev.5, manifest 0.9.4. Full AI operations require the reviewer’s valid compatible API account, Key, available Responses API model and quota. No live credential is included. Never use fixture keys for live access.

1. Install the extension; choose English / 简体中文 / 繁體中文 or browser-follow in settings. Translation target language remains independent.
2. Set Base URL (OpenAI example: https://api.openai.com/v1), the correct provider Key and model. Review the exact destination and data disclosure. Confirm Chrome’s API origin permission and save. Default storage is automatic local encryption with no password; session and password modes are optional.
3. Test connection. Only a fixed sample is sent and the provider may charge for it. Changing the Base URL requires a new service Key and consent; the old Key is not forwarded. Unsaved endpoint/model edits cannot be tested.
4. Allow a test webpage and refresh, select text and click 文. Verify translation, target switching, proofreading, custom writing, copy, moving and all eight resize directions.
5. In a disposable textarea/simple rich-text editor, select only “Can you send me it today?” within “Before. Can you send me it today? After.” Proofread and explicitly replace the selection; surrounding text stays, and native Undo restores it. Do not send email.
6. Open a text-based PDF in Chrome’s built-in viewer, select a sentence, right-click “Translate with Lingo”. The native sidebar opens with the result. Repeat for a local PDF. Sidebar supports copy and all six writing presets and custom editing, not modifying the PDF. Scanned PDFs require OCR.
7. Verify English, Simplified Chinese and Traditional Chinese buttons/errors/disclosures. Generated content must not be translated by interface switching.
8. Try invalid credentials, network failure and an incompatible model. Error messages must not expose server content or credentials; partial output cannot be applied.
9. Verify optional password mode, incorrect-password rejection, locking and browser restart; device remember mode should work after restart without unlock. Deleting a profile removes its configuration, ciphertext and session data; the device decryption key is removed when no profiles need it. Existing encrypted credentials retain their storage mode.
10. Before consent or after revoking it and saving, API calls are blocked. Revoke API host permission and verify requests stop.

The current source repo is private. Public privacy/support URL and formal store submission are pending. An offline three-language privacy policy is included. Support: hongbin.lei98@gmail.com. Any publisher-supplied review-only credential must be arranged privately before submission, never bundled or published.

多配置 / Multiple profiles: 保存名称、Base URL、Key、模型；选择后点击一次保存并使用即可切换。测试不会启用配置，失败不自动切换。自定义服务必须支持 Responses API。PDF 与浮窗共用完整面板，PDF 保留原生阅读器与右键入口。 / Save named profiles; save and use one explicitly in settings. Testing does not activate it, and failures never trigger fallback. Custom services must implement Responses API. PDF uses the shared panel and Chrome’s native viewer/context menu.

侧边栏原文支持手动编辑/粘贴；点击翻译才提交，输入时清除旧结果。保存条仅有改动时显示；保存配置即使用，无需另点启用。 / Edit or paste sidebar source and click Translate; typing clears old results without sending. The save bar appears only for unsaved changes, and saving also selects the service for use.

First installation opens a dismissible three-step setup dialog: interface language, API connection, then optional website access. The API step can save and test a fixed example. Both API setup and website access can be deferred; Finish opens the regular settings page. The close button or Escape exits to settings; Continue setup resumes the previous step. Unsaved fields remain in the current settings page. Existing configured users skip the guide on upgrade.
