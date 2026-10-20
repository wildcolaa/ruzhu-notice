"""Build the TypeScript source with installed frontend dependencies."""
import os,shutil,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
node=shutil.which('node')
if not node:
 candidate=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
 if candidate.exists():node=str(candidate)
if not node:raise SystemExit('需要 Node.js 20+ 构建源码；已附 dist 可直接启动，无需 Node。')
env=dict(os.environ);env['PATH']=str(Path(node).parent)+os.pathsep+env.get('PATH','')
front=ROOT/'frontend'
for tool,args in [('typescript/bin/tsc',['--noEmit']),('vite/bin/vite.js',['build'])]:subprocess.run([node,str(front/'node_modules'/tool),*args],cwd=front,env=env,check=True)
