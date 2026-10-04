"""Build self-contained abstract models for two different mechanism families."""
import json
from pathlib import Path

ROOT=Path(__file__).parent
INK='#243f46';MUTED='#6a7e81';BLUE='#428eaa';WARM='#c97748'

def text(id,s,x,y,size=22,color=INK,anchor='middle'):
    return {'id':id,'type':'text','text':s,'attrs':{'x':x,'y':y,'font-size':size,'fill':color,'text-anchor':anchor}}

def circle(id,x,y,r,color,**extra):
    return {'id':id,'type':'circle','attrs':{'cx':x,'cy':y,'r':r,'fill':color},**extra}

def line(id,d,color=BLUE,width=2):
    return {'id':id,'type':'path','attrs':{'d':d,'fill':'none','stroke':color,'stroke-width':width,'stroke-linecap':'round','stroke-linejoin':'round'}}

def track(attribute,frames,easing='smooth'):
    return {'attribute':attribute,'keyframes':frames,'easing':easing}

def base(title,subtitle,duration):
    return {'version':1,'title':title,'description':subtitle,'width':1280,'height':720,'duration':duration,'background':'#fafbf8',
            'evidence':{'label':'抽象教学模型 · 示意规则在分镜中定义 · 非数值仿真','sources':[],
                        'assumptions':['仅演示分镜定义的关系，应用到真实系统时须以资料替换对象、条件和路径。']},
            'elements':[text('title',title,50,82,38,anchor='start'),text('subtitle',subtitle,50,132,21,MUTED,'start'),line('rule','M48 155H1232','#d9e2e1',1)]}

def save(folder,spec,notes):
    d=ROOT/folder;d.mkdir(exist_ok=True)
    (d/'animation.json').write_text(json.dumps(spec,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (d/'storyboard.md').write_text(notes,encoding='utf-8')

s=base('状态如何发生转换','抽象规则：接收触发信号后进入处理中；完成后进入结束态。',10)
e=s['elements']
for i,(x,label,sub) in enumerate([(270,'等待','尚未接收到触发'),(640,'处理','执行当前任务'),(1010,'完成','到达结束状态')]):
    node=circle(f'state-{i}',x,350,74,'#e8efec')
    active=[[0,1 if i==0 else 0],[1,1 if i==0 else 0],[4.9,1 if i==1 else 0],[5.1,1 if i==1 else 0],[9,1 if i==2 else 0],[10,1 if i==2 else 0]]
    overlay=circle(f'active-{i}',x,350,69,'#d6e7e9',tracks=[track('opacity',active)])
    e.extend([node,overlay,text(f'state-label-{i}',label,x,335,26),text(f'state-note-{i}',sub,x,481,18,MUTED)])
    e.append(text(f'state-number-{i}',f'0{i+1}',x,238,18,MUTED))
e.extend([line('link-1','M365 430H534 M525 423L534 430L525 437'),line('link-2','M735 430H904 M895 423L904 430L895 437'),
          text('trigger-label','触发',449,314,18,MUTED),text('done-label','完成',819,314,18,MUTED)])
e.extend([circle('token-one',0,0,10,WARM,motion={'path':'M270 380L640 380','start':1,'end':5,'cycles':1,'loop':False}),
          circle('token-two',0,0,10,WARM,motion={'path':'M640 380L1010 380','start':5,'end':9,'cycles':1,'loop':False}),
          circle('token-initial',270,380,10,WARM,tracks=[track('opacity',[[0,1],[0.99,1],[1,0],[10,0]],'step')]),
          circle('token-final',1010,380,10,WARM,tracks=[track('opacity',[[0,0],[8.99,0],[9,1],[10,1]],'step')])])
s['cues']=[{'start':0,'end':1,'text':'等待态保持稳定，直到触发条件满足。'},
           {'start':1,'end':5,'text':'触发信号到达，状态从“等待”转换到“处理”。'},
           {'start':5,'end':9,'text':'任务完成后，状态继续转换到“完成”。'},
           {'start':9,'end':10,'text':'到达结束态；同一个状态标记不会复制成多个对象。'}]
save('state-transfer',s,'# 抽象状态转换\n\n10 秒。规则完全在本例中定义：等待 --触发--> 处理 --完成--> 结束。移动标记表示当前状态的变化，不表示物理输运的粒子。条件与状态标签位于运动区外。\n\n0–1 秒等待；1–5 秒第一转换；5–9 秒第二转换；9–10 秒结束停留。本例不代表任何特定协议、算法的实际状态机，使用时需替换为源材料支持的状态和条件。\n')

s=base('两个对象如何结合与分离','抽象 A + B ⇌ AB：保留对象身份，展示结合态与可逆过程。',10)
e=s['elements']
alabel=text('a-label','A',283,413,23,WARM);alabel['tracks']=[track('x',[[0,283],[1,283],[4,900],[6,900],[9,283],[10,283]])]
blabel=text('b-label','B',416,413,23,BLUE);blabel['tracks']=[track('x',[[0,416],[1,416],[4,960],[6,960],[9,416],[10,416]])]
e.extend([text('free-label','分离态',350,235,24),text('bound-label','结合态 AB',930,235,24),alabel,blabel,
          text('identity-note','暖色 A / 冷色 B 在整个过程保持身份一致',640,570,18,MUTED)])
e.extend([line('forward','M550 500H718 M709 493L718 500L709 507',MUTED,1.8),
          line('reverse','M718 527H550 M559 520L550 527L559 534',MUTED,1.8),
          text('equilibrium-label','结合 / 解离',634,470,18,MUTED)])
a=circle('object-a',283,350,25,WARM,collisionGroup='objects',tracks=[track('cx',[[0,283],[1,283],[4,900],[6,900],[9,283],[10,283]])])
b=circle('object-b',416,350,25,BLUE,collisionGroup='objects',tracks=[track('cx',[[0,416],[1,416],[4,960],[6,960],[9,416],[10,416]])])
e.extend([a,b,{'id':'bond','type':'rect','attrs':{'x':915,'y':345,'width':30,'height':10,'rx':5,'fill':'#94a9a6'},
             'tracks':[track('opacity',[[0,0],[3.99,0],[4.1,1],[5.9,1],[6.01,0],[10,0]])]}])
s['cues']=[{'start':0,'end':1,'text':'初始分离态：A 与 B 是两个可辨认的对象。'},
           {'start':1,'end':4,'text':'示意结合过程：两个对象接近，但身份和数量保持不变。'},
           {'start':4,'end':6,'text':'停留在 AB 结合态；短连接表示本例定义的结合关系。'},
           {'start':6,'end':9,'text':'解离时连接消失，A 与 B 重新分开。'},
           {'start':9,'end':10,'text':'回到分离态，完成一次可逆过程的示意。'}]
save('reversible-binding',s,'# 抽象可逆结合\n\n10 秒。定义一个抽象关系 A+B ⇌ AB：对象数量和身份保持不变；结合态在 4–6 秒停留，6 秒后解离，9 秒回到分离态。颜色不是浓度、能量或真实分子尺寸，连接不是任意真实化学键的声明。\n\n本例用位置轨道而非循环粒子路径演示状态变化，验证不同于输运动画的表达。应用到具体化学/生物系统时，必须补充真实实体、作用位点、反应条件、来源和中间态；本例不能作为机理依据。\n')
print('Created state-transfer and reversible-binding examples.')
