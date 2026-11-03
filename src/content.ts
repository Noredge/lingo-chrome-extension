import {createPanel} from './panel';
import {isGoogleDocs} from './surfaces';
declare global {interface Window {__lingoInstalled?:boolean}}
if(!isGoogleDocs(location.href)&&!window.__lingoInstalled){window.__lingoInstalled=true;createPanel();}
