from pathlib import Path
import json, zipfile, hashlib, re, sys, struct
root=Path(__file__).resolve().parents[1]
dist=root/'dist'; manifest=json.loads((dist/'manifest.json').read_text()); version=manifest['version']
development = '--development' in sys.argv
assert development or 'dev' not in manifest.get('version_name',''), '开发预览不可作为正式上架包；使用 --development 參數'
args=[x for x in sys.argv[1:] if x != '--development']
output=Path(args[0]) if args else root/'store'/'packages'
output.mkdir(parents=True,exist_ok=True);label=manifest.get('version_name',version) if development else version
archive=output/f"Lingo-{label}-{'development' if development else 'webstore'}.zip"
assert manifest['manifest_version']==3
assert manifest['host_permissions']==['https://api.openai.com/*']
assert (dist/'privacy.html').exists()
assert (dist/'LICENSE').read_bytes() == (root/'LICENSE').read_bytes()
assert (dist/'THIRD_PARTY_NOTICES.txt').exists()
assert json.loads((root/'package.json').read_text())['version'] == version
assets=root/'store'/'assets'
provenance=json.loads((assets/'BUILD-PROVENANCE.json').read_text())
assert provenance['extensionVersion']==version, '截图版本不一致，请运行 npm run store:assets'
for name,sha in provenance['sourceRuntime'].items():
 assert hashlib.sha256((dist/name).read_bytes()).hexdigest()==sha, '截图对应旧构建，请运行 npm run store:assets'
assert set(provenance['sourceRuntime'])=={str(p.relative_to(dist)) for p in dist.rglob('*') if p.is_file()}
for name,sha in provenance['images'].items():
 assert hashlib.sha256((assets/name).read_bytes()).hexdigest()==sha, f'截图变更后需重新生成来源记录: {name}'
screenshots=sorted(assets.glob('0*-1280x800.png'))
assert len(screenshots)==5
for screenshot in screenshots:
 data=screenshot.read_bytes(); assert data[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack('>II',data[16:24])==(1280,800)

files=sorted(p for p in dist.rglob('*') if p.is_file())
for p in files:
 assert p.suffix not in ['.map','.ts','.mjs'] and not p.name.startswith('.env')
 if p.suffix in ['.js','.html','.json','.css']:
  text=p.read_text()
  assert not re.search(r'sk-[A-Za-z0-9_-]{15,}',text),f'Possible credential in {p.name}'
  assert 'sk-test-fixture' not in text,f'Test fixture in {p.name}'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for p in files:z.write(p,p.relative_to(dist))
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None and 'manifest.json' in z.namelist()
 assert not any(n.startswith(('source/','tests/','store/','docs/','.git/')) for n in z.namelist())
sha=hashlib.sha256(archive.read_bytes()).hexdigest();(output/(archive.name+'.sha256')).write_text(sha+'  '+archive.name+'\n')
print(json.dumps({'zip':str(archive),'sha256':sha,'runtimeFiles':len(files),'manifestAtRoot':True,'fixtureOrCredentialDetected':False,'storeAssetsMatchBuild':True,'screenshots':len(screenshots)}))
