// Known surfaces where browser-level sidebar UI is available but page overlays are not.
export function isGoogleDocs(url: string): boolean {
  try { const u=new URL(url); return u.hostname==='docs.google.com' && /^\/document\//.test(u.pathname); }
  catch { return false; }
}
export function prefersSidebar(url: string): boolean {
  try {
    const u=new URL(url);
    return isGoogleDocs(url) || !/^https?:$/.test(u.protocol) || /\.pdf$/i.test(u.pathname) ||
      u.hostname==='chromewebstore.google.com' || (u.hostname==='chrome.google.com' && u.pathname.startsWith('/webstore'));
  } catch { return true; }
}
