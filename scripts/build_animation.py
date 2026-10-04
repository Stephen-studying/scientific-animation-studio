#!/usr/bin/env python3
"""Validate an editable scene spec and create a self-contained animation HTML."""
import argparse
import html
import json
import math
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
TYPES = {'rect','circle','ellipse','line','path','text','polyline','polygon'}
ATTRIBUTES = {'x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','width','height',
              'd','points','fill','stroke','stroke-width','opacity','fill-opacity',
              'stroke-opacity','font-size','font-weight','text-anchor','stroke-linecap',
              'stroke-linejoin','stroke-dasharray','transform','fill-rule'}
NUMERIC_TRACKS = {'x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','width','height',
                  'opacity','fill-opacity','stroke-opacity','stroke-width','font-size'}
COLOR_RE = re.compile(r'^#[0-9a-fA-F]{6}$')


def number(value):
    return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate(spec):
    require(isinstance(spec,dict),'动画数据必须是对象')
    require(type(spec.get('version')) is int and spec['version']==1,'version 必须为 1')
    for key in ('width','height'):
        require(isinstance(spec.get(key),int) and not isinstance(spec[key],bool) and 240<=spec[key]<=4096,
                key+' 必须为 240–4096 的整数')
    require(number(spec.get('duration')) and 0<spec['duration']<=300,'duration 必须为 0–300 秒内的正数')
    require(isinstance(spec.get('title'),str) and spec['title'].strip(),'需要 title')
    require(COLOR_RE.fullmatch(spec.get('background','#ffffff')) is not None,'background 需要六位十六进制色值')
    evidence=spec.get('evidence')
    require(isinstance(evidence,dict) and isinstance(evidence.get('label'),str) and evidence['label'].strip(),
            '需要 evidence.label 说明示意范围')
    require(isinstance(evidence.get('assumptions',[]),list) and all(isinstance(v,str) for v in evidence.get('assumptions',[])),
            'assumptions 必须是字符串数组')
    require(isinstance(evidence.get('sources',[]),list),'sources 必须是数组')
    for source in evidence.get('sources',[]):
        require(isinstance(source,dict) and isinstance(source.get('title'),str) and isinstance(source.get('url'),str),
                '每个来源需要 title/url')
        require(source['url'].startswith(('https://','http://')),'来源链接仅允许 http/https')
    require(isinstance(spec.get('elements'),list) and spec['elements'],'需要非空 elements 数组')
    clips=spec.get('clips',[])
    require(isinstance(clips,list),'clips 必须为数组')
    clip_ids=set()
    for clip in clips:
        require(isinstance(clip,dict),'clip 必须为对象')
        ident=clip.get('id')
        require(isinstance(ident,str) and re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]*',ident) and ident not in clip_ids,'clip id 必须合法且唯一')
        clip_ids.add(ident)
        require(clip.get('type') in ('rect','path'),'裁切仅支持 rect/path')
        attrs=clip.get('attrs',{})
        allowed={'x','y','width','height','rx','ry'} if clip['type']=='rect' else {'d'}
        require(isinstance(attrs,dict) and attrs and not set(attrs)-allowed,'裁切属性不合法')
        if clip['type']=='path':
            require(isinstance(attrs.get('d'),str) and attrs['d'].strip(),'裁切 path 需要 d')
        else:
            require(all(number(v) for v in attrs.values()),'裁切矩形需要有限数值')
            require(attrs.get('width',0)>0 and attrs.get('height',0)>0,'裁切矩形需要正尺寸')
            require(attrs.get('rx',0)>=0 and attrs.get('ry',0)>=0,'裁切圆角不能为负')
    ids=set()
    for item in spec['elements']:
        require(isinstance(item,dict),'图形必须是对象')
        ident=item.get('id')
        require(isinstance(ident,str) and re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]*',ident) and ident not in ids,'id 必须唯一且只含英文数字_-')
        ids.add(ident)
        require(item.get('clip') is None or item['clip'] in clip_ids,'clip 引用了不存在的裁切区域')
        require(item.get('collisionGroup') is None or isinstance(item['collisionGroup'],str),'collisionGroup 必须为字符串')
        require(item.get('type') in TYPES,'不支持的 SVG 类型: '+str(item.get('type')))
        attrs=item.get('attrs',{})
        require(isinstance(attrs,dict) and not set(attrs)-ATTRIBUTES,'attrs 包含不支持的属性')
        for key,value in attrs.items():
            require(isinstance(value,(str,int,float)) and not isinstance(value,bool),'属性只能是字符串或数字')
            if isinstance(value,(int,float)):
                require(number(value),'属性不能包含非有限数字')
            if key in ('fill','stroke'):
                require(value=='none' or (isinstance(value,str) and COLOR_RE.fullmatch(value)),'fill/stroke 必须为 none 或六位色值')
        if item['type']=='text':
            require(isinstance(item.get('text'),str),'text 元素需要字符串 text')
        if item['type']=='path':
            require(isinstance(attrs.get('d'),str) and attrs['d'].strip(),'path 需要 d')
        require(isinstance(item.get('tracks',[]),list),'tracks 必须是数组')
        for track in item.get('tracks',[]):
            require(isinstance(track,dict),'track 必须是对象')
            attr=track.get('attribute')
            require(attr in NUMERIC_TRACKS | {'fill','stroke'},'不支持的动画属性')
            require(track.get('easing','linear') in ('linear','smooth','step'),'easing 不支持')
            frames=track.get('keyframes')
            require(isinstance(frames,list) and len(frames)>=2,'每条轨道至少两个关键帧')
            last=-1
            for frame in frames:
                require(isinstance(frame,list) and len(frame)==2,'关键帧需要 [时间,值]')
                t,v=frame
                require(number(t) and 0<=t and last<t<=spec['duration'],'关键帧时间必须非负、严格递增且在时长内')
                last=t
                if attr in NUMERIC_TRACKS:
                    require(number(v),'数值轨道必须使用有限数字')
                    if attr in ('opacity','fill-opacity','stroke-opacity'):
                        require(0<=v<=1,'透明度需要 0–1')
                    if attr in ('r','rx','ry','width','height','stroke-width','font-size'):
                        require(v>=0,'尺寸不能为负')
                else:
                    require(isinstance(v,str) and COLOR_RE.fullmatch(v),'颜色轨道需要六位十六进制色值')
        motion=item.get('motion')
        if motion is not None:
            require(isinstance(motion,dict) and isinstance(motion.get('path'),str) and motion['path'].strip(),'motion 需要 path')
            start,end=motion.get('start'),motion.get('end')
            require(number(start) and number(end) and 0<=start<end<=spec['duration'],'motion 的起止时间不合法')
            require(number(motion.get('cycles',1)) and motion.get('cycles',1)>0,'cycles 必须为正数')
            require(number(motion.get('phase',0)),'phase 必须为有限数字')
            require(number(motion.get('fade',0)) and 0<=motion.get('fade',0)<=0.5,'fade 必须在 0–0.5 之间')
            require(isinstance(motion.get('loop',False),bool) and isinstance(motion.get('rotate',False),bool),'loop/rotate 必须为布尔值')
    cues=spec.get('cues')
    require(isinstance(cues,list) and cues,'需要非空 cues 数组')
    previous=0
    for cue in cues:
        require(isinstance(cue,dict),'字幕必须是对象')
        start,end=cue.get('start'),cue.get('end')
        require(number(start) and number(end) and previous<=start<end<=spec['duration'],'字幕时间重叠或超出范围')
        require(isinstance(cue.get('text'),str) and len(cue['text'].split('\n'))<=2,'字幕需要文字且最多两行')
        previous=end
    return spec


def build(spec_path, output):
    spec=validate(json.loads(Path(spec_path).read_text(encoding='utf-8-sig')))
    output=Path(output).resolve()
    require(output.suffix.lower()=='.html','输出文件扩展名必须为 .html')
    require(not output.exists(),'输出已存在；请使用新文件名保留原版本')
    template=(ROOT/'assets/template.html').read_text(encoding='utf-8')
    player=(ROOT/'assets/player.js').read_text(encoding='utf-8')
    data=json.dumps(spec,ensure_ascii=False,separators=(',',':'),allow_nan=False).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
    substitutions={'__PLAYER__':player,'__SPEC__':data,'__TITLE__':html.escape(spec['title'])}
    body=re.sub(r'__PLAYER__|__SPEC__|__TITLE__',lambda match:substitutions[match[0]],template)
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(body,encoding='utf-8')
    return {'html':str(output),'duration':spec['duration'],'canvas':[spec['width'],spec['height']],
            'elements':len(spec['elements']),'bytes':output.stat().st_size,'offline':True}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--spec',required=True)
    p.add_argument('--output',required=True)
    args=p.parse_args()
    if hasattr(sys.stdout,'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8');sys.stderr.reconfigure(encoding='utf-8')
    try:
        print(json.dumps(build(args.spec,args.output),ensure_ascii=False,indent=2))
    except (ValueError,OSError,TypeError,KeyError) as exc:
        print(json.dumps({'error':str(exc)},ensure_ascii=False),file=sys.stderr)
        return 2
    return 0


if __name__=='__main__':
    raise SystemExit(main())
