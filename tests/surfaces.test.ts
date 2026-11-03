import test from 'node:test';
import assert from 'node:assert/strict';
import {isGoogleDocs,prefersSidebar} from '../src/surfaces';
test('Docs, PDF and restricted pages prefer the sidebar; ordinary sites keep overlays',()=>{
 for(const url of ['https://docs.google.com/document/d/test/edit?tab=t.0','https://example.com/file.PDF?download=1','file:///tmp/test.pdf','chrome://extensions/','chrome-extension://pdf/viewer.html','https://chromewebstore.google.com/detail/test'])assert(prefersSidebar(url),url);
 for(const url of ['https://example.com/article','https://mail.google.com/mail/u/0/','https://docs.google.com.evil.test/document/d/test','https://example.com/article?name=test.pdf'])assert(!prefersSidebar(url),url);
 assert(!isGoogleDocs('https://docs.google.com.evil.test/document/d/test'));
});
