#!/usr/bin/env python3
"""Create a reproducible portable skill ZIP; exclude caches and local runtimes."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

EXCLUDED={'.git','.runtime','__pycache__','node_modules','output','.pytest_cache'}

def package(root,output):
    root=Path(root).resolve();output=Path(output).resolve()
    if not (root/'SKILL.md').is_file():raise ValueError('需要包含 SKILL.md 的技能目录')
    if output==root or root in output.parents:raise ValueError('压缩包必须放在技能目录外')
    if output.exists():raise ValueError('压缩包已存在，请使用新名称')
    files=sorted(p for p in root.rglob('*') if p.is_file() and not set(p.relative_to(root).parts)&EXCLUDED
                 and p.suffix not in ('.pyc','.pyo') and not p.name.endswith('.tmp.mp4'))
    manifest=[]
    output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output,'x',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for file in files:
            if file.is_symlink():raise ValueError('不打包符号链接: '+str(file))
            data=file.read_bytes();relative=file.relative_to(root).as_posix()
            info=zipfile.ZipInfo(root.name+'/'+relative,date_time=(2026,1,1,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
            archive.writestr(info,data)
            manifest.append({'path':relative,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    with zipfile.ZipFile(output) as archive:
        if archive.testzip():raise ValueError('ZIP CRC 检查失败')
    report={'archive':output.name,'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'files':manifest}
    output.with_suffix('.manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',required=True);p.add_argument('--output',required=True)
    args=p.parse_args()
    try:
        r=package(args.root,args.output)
        print(json.dumps({k:v for k,v in r.items() if k!='files'},ensure_ascii=False))
    except (ValueError,OSError) as e:p.exit(2,str(e)+'\n')
