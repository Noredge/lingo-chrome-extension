import {createPanel} from './panel';
declare global {interface Window {__lingoInstalled?:boolean}}
if(!window.__lingoInstalled){window.__lingoInstalled=true;createPanel();}
