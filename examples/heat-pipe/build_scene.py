"""Regenerate the editable example; geometry uses concentric capsule boundaries."""
import json
import math
from pathlib import Path

target=Path(__file__).with_name('animation.json')
previous=json.loads(target.read_text(encoding='utf-8-sig'))
elements=[]
ink='#243f46'; muted='#6a7e81'; hot='#c97748'; cold='#428eaa'; gold='#b09b6b'

def shape(id,type,attrs,**extra):
    item=dict(id=id,type=type,attrs=attrs,**extra);elements.append(item);return item

def rect(id,x,y,w,h,fill,rx=0,**extra):
    return shape(id,'rect',dict(x=x,y=y,width=w,height=h,rx=rx,fill=fill),**extra)

def text(id,content,x,y,size=20,fill=ink,anchor='start',weight=400,**extra):
    return shape(id,'text',{'x':x,'y':y,'font-size':size,'fill':fill,'text-anchor':anchor,'font-weight':weight},text=content,**extra)

def line(id,d,color,width=1,**extra):
    return shape(id,'path',{'d':d,'fill':'none','stroke':color,'stroke-width':width,'stroke-linecap':'round','stroke-linejoin':'round'},**extra)

def opacity(frames):
    return [{'attribute':'opacity','easing':'smooth','keyframes':frames}]

text('eyebrow','热管理  /  两相传热',48,34,15,muted)
text('title','热管如何搬运热量',48,86,38,ink,weight=650)
text('subtitle','在封闭管内，用相变传热，用毛细作用回流。',50,132,21,muted)
text('edition','HEAT PIPE',1230,48,18,muted,'end',500)
text('cutaway-note','纵向剖面 · 示意',1230,79,16,muted,'end')
line('header-rule','M48 145H1232','#d9e2e1')

# Four steps are persistent; only the current explanatory step is highlighted.
for i,(label,start,end,color) in enumerate([('吸热汽化',0,2,hot),('蒸汽输运',2,5,hot),('冷凝放热',5,8,cold),('毛细回流',8,12,cold)]):
    x=48+i*304
    rect(f'step-{i}-base',x,172,272,62,'#f0f3f1',10)
    frames=[[0,1 if start==0 else 0]]
    if start:frames.extend([[start-0.12,0],[start,1]])
    if end<12:frames.extend([[end-0.12,1],[end,0],[12,0]])
    else:frames.append([12,1])
    rect(f'step-{i}-active',x,172,272,62,'#f5e8dc' if i<2 else '#e0edf0',10,tracks=opacity(frames))
    text(f'step-{i}-number',f'0{i+1}',x+19,211,18,color,weight=600)
    text(f'step-{i}-label',label,x+61,211,22,ink,weight=500)
    # The short progress line also makes the active step visible without relying on color alone.
    rect(f'step-{i}-progress',x+18,228,236,2,color,1,tracks=opacity(frames))

text('evaporator-label','蒸发段',334,275,19,hot,'middle',500)
text('adiabatic-label','绝热段',640,275,19,muted,'middle',500)
text('condenser-label','冷凝段',946,275,19,cold,'middle',500)

# Every shell/core/liner shares centers (258,379), (1022,379).
# Reducing each radius by the inset keeps the two endcaps strictly concentric.
shell=rect('shell',168,289,944,180,'#d5dddc',90)
shell['attrs'].update({'stroke':'#99adad','stroke-width':1.5})
rect('shell-highlight',171,292,938,174,'#f7faf8',87)
rect('shell-inner',177,298,926,162,'#b8c8c6',81)
rect('wick',184,305,912,148,'#ded0ad',74)
rect('core',198,319,884,120,'#fbfcfa',60)

# A continuous, clipped thermal wash; the strips approximate a subtle gradient
# without external image assets or filters that soften the structural edges.
def mix(a,b,t):
    return '#'+''.join(f'{round(int(a[j:j+2],16)*(1-t)+int(b[j:j+2],16)*t):02x}' for j in (1,3,5))
for i in range(40):
    f=i/39
    rect(f'hot-tint-{i}',198+i*8,319,8.1,120,mix('#f8e1cf','#fbfcfa',f),clip='core')
    rect(f'cold-tint-{i}',1082-(i+1)*8,319,8.1,120,mix('#d9ecf0','#fbfcfa',f),clip='core')

# Porous texture follows the actual liner, including its curved ends.
for row in range(2):
    for i,x in enumerate(range(262,1020,12)):
        for side,y in [('top',309+row*6),('bottom',443+row*6)]:
            shape(f'pore-{side}-{row}-{i}','circle',{'cx':x+(row*5),'cy':y,'r':0.85,'fill':gold,'opacity':0.6},clip='liner')
for side,cx,offset in [('left',258,90),('right',1022,-90)]:
    for i in range(1,24):
        angle=math.radians(offset+i*180/24)
        for row,radius in enumerate([64,70]):
            shape(f'pore-{side}-{i}-{row}','circle',{'cx':round(cx+radius*math.cos(angle),2),'cy':round(379+radius*math.sin(angle),2),'r':0.85,'fill':gold,'opacity':0.6},clip='liner')

# Thin inner boundary reinforces the clean cutaway edge, without heavy outlines.
edge=rect('core-edge',198,319,884,120,'none',60)
edge['attrs'].update({'stroke':'#c5b895','stroke-width':0.8})
text('vapor-label','蒸汽通道',640,349,18,muted,'middle')

text('heat-in-label','吸热',91,356,21,hot,'middle',500)
text('heat-out-label','放热',1190,356,21,cold,'middle',500)
line('heat-in-arrow','M54 382H147 M139 375L147 382L139 389',hot,2.5)
line('heat-out-arrow','M1133 382H1224 M1216 375L1224 382L1216 389',cold,2.5,
     tracks=opacity([[0,0.35],[5,0.35],[5.6,1],[12,1]]))

# Moving marks themselves express direction: no static arrow crosses their lane.
for lane,y in enumerate([378,402]):
    for i in range(6):
        shape(f'vapor-{lane}-{i}','path',{'d':'M-1 -3L5 0L-1 3 M-8 0H5','fill':'none','stroke':hot,'stroke-width':2.2,'stroke-linecap':'round','stroke-linejoin':'round'},
              clip='core',collisionGroup='fluid',motion={'path':f'M300 {y}L980 {y}','start':1.4,'end':12,'cycles':2.2,'phase':i/6+lane/12,'loop':True,'fade':0.09})

for i in range(7):
    shape(f'liquid-{i}','ellipse',{'cx':0,'cy':0,'rx':5,'ry':2.3,'fill':cold},
          clip='liner',collisionGroup='fluid',motion={'path':'M1014 446L266 446','start':7.5,'end':12,'cycles':1.1,'phase':i/7,'loop':True,'fade':0.05})

for i in range(3):
    shape(f'evaporate-{i}','circle',{'cx':0,'cy':0,'r':3,'fill':hot},clip='core',collisionGroup='fluid',
          motion={'path':'M254 430C226 411 240 385 278 377','start':0,'end':12,'cycles':4,'phase':i/3,'loop':True,'fade':0.14})
    shape(f'condense-{i}','circle',{'cx':0,'cy':0,'r':3,'fill':cold},clip='core',collisionGroup='fluid',
          motion={'path':'M1004 379C1051 385 1052 412 1021 432','start':5,'end':12,'cycles':3,'phase':i/3,'loop':True,'fade':0.14})

# Annotations occupy a separate band; leaders stop at a precise boundary.
line('shell-leader','M229 468V490H292','#8da3a3',1.2)
text('shell-label','密封管壁',305,497,18,muted)
line('wick-leader','M640 455V495','#9c8a60',1.2)
shape('wick-dot','circle',{'cx':640,'cy':455,'r':2,'fill':'#9c8a60'})
text('wick-label','毛细芯 · 凝液回流',640,527,20,'#87744d','middle',500)
line('return-direction','M708 549H572 M579 544L572 549L579 554',cold,1.8)
text('legend-vapor','蒸汽',961,514,16,muted)
shape('legend-warm','circle',{'cx':945,'cy':508,'r':3.5,'fill':hot})
text('legend-liquid','凝液',1060,514,16,muted)
shape('legend-cool','ellipse',{'cx':1043,'cy':508,'rx':4.5,'ry':2.5,'fill':cold})

previous.update(background='#fafbf8',elements=elements,clips=[
    {'id':'core','type':'rect','attrs':{'x':198,'y':319,'width':884,'height':120,'rx':60}},
    {'id':'liner','type':'rect','attrs':{'x':184,'y':305,'width':912,'height':148,'rx':74}}
])
previous['evidence']['label']='原理示意 · 非数值仿真 · 动画分阶段讲解，实际过程可同时发生'
target.write_text(json.dumps(previous,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Created {len(elements)} elements: {target}')
