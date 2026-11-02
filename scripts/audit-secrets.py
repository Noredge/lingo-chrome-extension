"""Redacted credential scan of all reachable Git blobs and publishable working files."""
from pathlib import Path
import subprocess,re,json
root=Path(__file__).resolve().parents[1]
allow={b'sk-test-fixture-not-a-real-secret'}
patterns=[rb'sk-[A-Za-z0-9_-]{15,}',rb'gh[pousr]_[A-Za-z0-9]{25,}',rb'github_pat_[A-Za-z0-9_]{30,}',rb'AKIA[0-9A-Z]{16}',rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',rb'AIza[0-9A-Za-z_-]{30,}']
issues=[];count=0

def scan(label,data):
 global count
 count+=1
 for pattern in patterns:
  for m in re.finditer(pattern,data):
   # Ignore the deliberately invalid fixture Key only; never print any matched credential.
   if m.group() not in allow:issues.append({'file':label,'kind':'credential-like token'})

objects=subprocess.check_output(['git','rev-list','--objects','--all'],cwd=root).splitlines()
for row in objects:
 sha,_,name=row.partition(b' ')
 if subprocess.check_output(['git','cat-file','-t',sha],cwd=root).strip()!=b'blob':continue
 label='history:'+name.decode(errors='replace')
 if any(part in name.decode(errors='replace').split('/') for part in ['.env','.env.local','.test-profile','node_modules']):issues.append({'file':label,'kind':'excluded file in history'})
 scan(label,subprocess.check_output(['git','cat-file','blob',sha],cwd=root))
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=root).decode().split('\0')
for f in filter(None,files):
 p=root/f
 if not p.is_file():continue
 if p.name.startswith('.env') or any(x in p.parts for x in ['.test-profile','node_modules']):issues.append({'file':f,'kind':'excluded file in publish set'})
 scan(f,p.read_bytes())
summary={'objectsAndFilesScanned':count,'reachableCommits':int(subprocess.check_output(['git','rev-list','--count','--all'],cwd=root)),'credentialCandidates':len(issues),'allowedInvalidFixtureKey':True}
print(json.dumps(summary));
if issues:
 print(json.dumps(issues));raise SystemExit(1)
