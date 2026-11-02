# Reviewer test instructions

Lingo is a bring-your-own-key translation and writing extension. There is no Lingo account, developer-hosted API proxy, payment flow, or bundled API key. Full AI operations require a valid OpenAI API key, model access and API quota. Do not use the invalid fixture keys in source tests for live review.

1. Install the uploaded ZIP. Settings opens on first install. The runtime contains all JS/CSS and an offline privacy page.
2. Enter a valid OpenAI API key and a Responses-compatible model accessible to that project. Default model: gpt-6-luna; change it if the reviewing project lacks access.
3. Read and affirm the disclosure that selected text and instructions are sent to OpenAI. Leave encrypted persistence unchecked for session-only review, then Save settings.
4. Test connection. It translates only the fixed sentence “A little clearer, a little better.” This uses the reviewing OpenAI project's quota.
5. Add a specific test website, grant Chrome's permission prompt, and refresh that page. Alternatively select text and invoke Lingo through the toolbar/context menu without persistent host permission.
6. Select “The quiet moments are often the ones we remember best.” Click the 文 icon. Translation begins. Check Copy and target-language switching.
7. In a disposable textarea or simple contenteditable draft, use “Before. Can you send me it today? After.” Select only the middle sentence. Open Lingo, choose Proofread, and explicitly click Replace selected text on the writing result. Before/After must remain. Native Ctrl+Z / Cmd+Z restores the original. Do not send an email.
8. Drag the title bar; resize from the four sides/corners. Minimum is 320×300 (smaller viewports take precedence). Reset restores automatic layout. Changing the original text disables replacement from the stale snapshot.
9. In Settings, add/remove target languages and choose a default. Reopen the popup and verify only that shortlist appears.
10. Optional persistence test: choose Encrypt and save locally, enter and confirm a test password of at least 12 characters, save, then Lock. A wrong password cannot unlock. The correct password unlocks. Restart Chrome or reload the extension: the vault remains locked. Preferences still save while locked. Delete Key removes encrypted and session copies.
11. Before consent, or after consent is revoked and saved, model requests are blocked. The extension never logs credentials or executes model output.

Privacy: https://noredge.github.io/lingo-chrome-extension/privacy.html
Support: hongbin.lei98@gmail.com

Publisher note (do not paste as a reviewer credential): No real reviewer credential has been provisioned or included. If the review team needs publisher-provided test access, arrange a separate review-only API project/key through the dashboard's private Test instructions field; do not publish a key in the store listing, repo or extension ZIP. Do not use your everyday personal key. You may also provide a demonstration video, but it does not replace any live-access requirement the reviewer specifies.
