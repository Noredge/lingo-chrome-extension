from pathlib import Path
import json, zipfile, hashlib, re, sys
root=Path(__file__).resolve().parents[1]
dist=root/'dist'; manifest=json.loads((dist/'manifest.json').read_text()); version=manifest['version']
output=Path(sys.argv[1]) if len(sys.argv)>1 else root/'store'/'packages'
output.mkdir(parents=True,exist_ok=True);archive=output/f'Lingo-{version}-webstore.zip'
assert manifest['manifest_version']==3
assert manifest['host_permissions']==['https://api.openai.com/*']
assert (dist/'privacy.html').exists()
files=sorted(p for p in dist.rglob('*') if p.is_file())
for p in files:
 assert p.suffix not in ['.map','.ts','.mjs'] and not p.name.startswith('.env')
 if p.suffix in ['.js','.html','.json','.css']:
  text=p.read_text()
  assert not re.search(r'sk-[A-Za-z0-9_-]{15,}',text),f'Possible credential in {p.name}'
  assert 'sk-test-fixture' not in text and '127.0.0.1' not in text,f'Test fixture in {p.name}'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for p in files:z.write(p,p.relative_to(dist))
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None and 'manifest.json' in z.namelist()
 assert not any(n.startswith(('source/','tests/','store/','docs/','.git/')) for n in z.namelist())
sha=hashlib.sha256(archive.read_bytes()).hexdigest();(output/(archive.name+'.sha256')).write_text(sha+'  '+archive.name+'\n')
print(json.dumps({'zip':str(archive),'sha256':sha,'runtimeFiles':len(files),'manifestAtRoot':True,'fixtureOrCredentialDetected':False}))
