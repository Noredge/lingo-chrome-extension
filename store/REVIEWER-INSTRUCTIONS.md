# Reviewer instructions — draft, not submitted

Current build: 1.0.0-dev.1, manifest 0.9.0. Full AI operations require the reviewer’s valid compatible API account, Key, available Chat Completions model and quota. No live credential is included. Never use fixture keys for live access.

1. Install the extension; choose English / 简体中文 / 繁體中文 or browser-follow in settings. Translation target language remains independent.
2. Set Base URL (OpenAI example: https://api.openai.com/v1; DeepSeek example: https://api.deepseek.com), the correct provider Key and model. Review the exact destination and data disclosure. Confirm Chrome’s API origin permission and save. Default storage is automatic local encryption with no password; session and password modes are optional.
3. Test connection. Only a fixed sample is sent and the provider may charge for it. Changing the Base URL requires a new service Key and consent; the old Key is not forwarded. Unsaved endpoint/model edits cannot be tested.
4. Allow a test webpage and refresh, select text and click 文. Verify translation, target switching, proofreading, custom writing, copy, moving and all eight resize directions.
5. In a disposable textarea/simple rich-text editor, select only “Can you send me it today?” within “Before. Can you send me it today? After.” Proofread and explicitly replace the selection; surrounding text stays, and native Undo restores it. Do not send email.
6. Open a text-based PDF in Chrome’s built-in viewer, select a sentence, right-click “Translate with Lingo”. The native sidebar opens with the result. Repeat for a local PDF. Sidebar supports copy and limited writing presets, not modifying the PDF. Scanned PDFs require OCR.
7. Verify English, Simplified Chinese and Traditional Chinese buttons/errors/disclosures. Generated content must not be translated by interface switching.
8. Try invalid credentials, network failure and an incompatible model. Error messages must not expose server content or credentials; partial output cannot be applied.
9. Verify optional password mode, incorrect-password rejection, locking and browser restart; device remember mode should work after restart without unlock. Deleting the Key removes ciphertext, session data and the device decryption key. Existing encrypted credentials retain their storage mode.
10. Before consent or after revoking it and saving, API calls are blocked. Revoke API host permission and verify requests stop.

The current source repo is private. Public privacy/support URL and formal store submission are pending. An offline three-language privacy policy is included. Support: hongbin.lei98@gmail.com. Any publisher-supplied review-only credential must be arranged privately before submission, never bundled or published.
