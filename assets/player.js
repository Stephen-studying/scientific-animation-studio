(() => {
  'use strict';
  const spec = JSON.parse(document.getElementById('animation-data').textContent);
  const ns = 'http://www.w3.org/2000/svg';
  const stage = document.getElementById('stage');
  stage.setAttribute('viewBox', `0 0 ${spec.width} ${spec.height}`);
  stage.setAttribute('width', spec.width);
  stage.setAttribute('height', spec.height);
  stage.setAttribute('aria-label', spec.title);
  document.getElementById('pageTitle').textContent = spec.title;
  document.getElementById('description').textContent = spec.description || '';
  const create = (type, attrs = {}) => {
    const node = document.createElementNS(ns, type);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  };
  stage.appendChild(create('rect', {width:spec.width, height:spec.height, fill:spec.background || '#ffffff'}));
  const defs=create('defs');stage.appendChild(defs);
  for(const clip of spec.clips || []) {
    const node=create('clipPath',{id:'clip-'+clip.id,clipPathUnits:'userSpaceOnUse'});
    node.appendChild(create(clip.type,clip.attrs));defs.appendChild(node);
  }
  const nodes = [];
  for (const item of spec.elements) {
    const wrapper = create('g', {'data-id':item.id});
    const node = create(item.type, item.attrs || {});
    if (item.type === 'text') {
      const lines = (item.text || '').split('\n');
      lines.forEach((line, i) => {
        const span = create('tspan', {x:item.attrs?.x || 0, dy:i === 0 ? 0 : (item.lineHeight || 1.35) + 'em'});
        span.textContent = line;
        node.appendChild(span);
      });
    }
    wrapper.appendChild(node);
    if(item.clip) {
      const clipped=create('g',{'clip-path':`url(#clip-${item.clip})`});
      clipped.appendChild(wrapper);stage.appendChild(clipped);
    } else stage.appendChild(wrapper);
    let path = null;
    if (item.motion) {
      path = create('path', {d:item.motion.path, fill:'none', stroke:'none'});
      stage.appendChild(path);
    }
    nodes.push({item, wrapper, node, path});
  }
  // Captions reserve the lower band of the canvas; all export paths include them.
  const uiScale=Math.min(spec.width/1280,spec.height/720);
  const bandY = spec.height - 132*uiScale;
  const captionBand = create('rect', {x:48*uiScale, y:bandY, width:spec.width-96*uiScale, height:90*uiScale, rx:12*uiScale, fill:'#edf3f4'});
  stage.appendChild(captionBand);
  const caption = create('text', {x:spec.width/2, y:bandY+51*uiScale, fill:'#25444b', 'font-size':24*uiScale, 'font-weight':500, 'text-anchor':'middle'});
  stage.appendChild(caption);
  const boundary = create('text', {x:spec.width/2, y:spec.height-18*uiScale, fill:'#617789', 'font-size':15*uiScale, 'text-anchor':'middle'});
  boundary.textContent = spec.evidence.label;
  stage.appendChild(boundary);
  const sourcePanel = document.getElementById('evidence');
  const addText = text => { const p=document.createElement('p'); p.textContent=text; sourcePanel.appendChild(p); };
  addText(spec.evidence.label);
  for (const assumption of spec.evidence.assumptions || []) addText('示意说明：' + assumption);
  for (const source of spec.evidence.sources || []) {
    const p = document.createElement('p');
    const a = document.createElement('a');
    a.textContent = source.title;
    a.href = source.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    p.appendChild(a);
    if (source.locator) p.appendChild(document.createTextNode(' · ' + source.locator));
    sourcePanel.appendChild(p);
  }
  const timeline = document.getElementById('timeline');
  const playButton = document.getElementById('play');
  timeline.max = spec.duration;
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const ease = (x, name) => name === 'smooth' ? x*x*(3-2*x) : name === 'step' ? 0 : x;
  const color = v => [1,3,5].map(i => parseInt(v.slice(i,i+2), 16));
  const blend = (a, b, p) => {
    if (typeof a === 'number') return a+(b-a)*p;
    const ca=color(a), cb=color(b);
    return '#' + ca.map((v,i) => Math.round(v+(cb[i]-v)*p).toString(16).padStart(2,'0')).join('');
  };
  const trackValue = (track, t) => {
    const frames=track.keyframes;
    if (t <= frames[0][0]) return frames[0][1];
    for (let i=1;i<frames.length;i++) {
      if (t < frames[i][0]) {
        const p=ease((t-frames[i-1][0])/(frames[i][0]-frames[i-1][0]), track.easing);
        return blend(frames[i-1][1], frames[i][1], p);
      }
    }
    return frames.at(-1)[1];
  };
  let current=0, playing=false, speed=1, previous=null, request=null;
  const renderAt = value => {
    if (!Number.isFinite(Number(value))) throw new Error('时间必须为有限数字');
    current=clamp(Number(value),0,spec.duration);
    for (const {item,node,wrapper,path} of nodes) {
      for (const track of item.tracks || []) {
        const value=String(trackValue(track,current));
        node.setAttribute(track.attribute,value);
        if (item.type==='text' && track.attribute==='x') node.querySelectorAll('tspan').forEach(span=>span.setAttribute('x',value));
      }
      if (item.motion) {
        const m=item.motion;
        const span=m.end-m.start;
        const raw=clamp((current-m.start)/span,0,1)*(m.cycles || 1)+(m.phase || 0);
        const progress=m.loop ? ((raw % 1)+1)%1 : clamp(raw,0,1);
        const length=path.getTotalLength();
        const point=path.getPointAtLength(length*progress);
        let angle=0;
        if (m.rotate) {
          const ahead=path.getPointAtLength(Math.min(length,length*progress+0.5));
          const behind=path.getPointAtLength(Math.max(0,length*progress-0.5));
          angle=Math.atan2(ahead.y-behind.y,ahead.x-behind.x)*180/Math.PI;
        }
        wrapper.setAttribute('transform',`translate(${point.x} ${point.y}) rotate(${angle})`);
        const fade=m.fade || 0;
        const edge=fade ? Math.min(1,progress/fade,(1-progress)/fade) : 1;
        const entry=fade ? clamp((current-m.start)/0.4,0,1) : 1;
        wrapper.setAttribute('opacity',current>=m.start && current<m.end ? String(Math.max(0,edge*entry)):'0');
      }
    }
    const cue=spec.cues.find(c=>current>=c.start && current<c.end) || (current===spec.duration ? spec.cues.at(-1) : null);
    const mobileCaption=document.getElementById('mobileCaption');
    if(mobileCaption.textContent!==(cue?.text || '')) mobileCaption.textContent=cue?.text || '';
    caption.replaceChildren();
    const captionLines=(cue?.text || '').split('\n');
    caption.setAttribute('y',bandY+(captionLines.length>1 ? 34:51)*uiScale);
    captionLines.forEach((line,i)=>{
      const span=create('tspan',{x:spec.width/2,dy:i===0 ? 0 : '1.35em'});
      span.textContent=line; caption.appendChild(span);
    });
    timeline.value=current;
    document.getElementById('timeLabel').textContent=`${current.toFixed(1)} / ${spec.duration.toFixed(1)} 秒`;
    stage.dataset.time=String(current);
    return current;
  };
  const pause = () => {
    playing=false; previous=null;
    if (request!==null) cancelAnimationFrame(request);
    request=null;
    playButton.textContent='播放'; playButton.setAttribute('aria-label','播放动画');
  };
  const tick = timestamp => {
    if (!playing) return;
    if (previous!==null) renderAt(current+(timestamp-previous)/1000*speed);
    previous=timestamp;
    if (current>=spec.duration) pause();
    else request=requestAnimationFrame(tick);
  };
  const play = () => {
    if (playing) return;
    if (current>=spec.duration) renderAt(0);
    playing=true; previous=null;
    playButton.textContent='暂停'; playButton.setAttribute('aria-label','暂停动画');
    request=requestAnimationFrame(tick);
  };
  playButton.addEventListener('click',()=>playing ? pause() : play());
  document.getElementById('reset').addEventListener('click',()=>{pause();renderAt(0);});
  document.getElementById('zoom').addEventListener('click',event=>{
    const box=stage.parentElement;
    const enlarged=box.classList.toggle('zoomed');
    stage.style.width=enlarged ? Math.max(box.clientWidth*2,720)+'px' : '';
    stage.style.height='auto';
    event.currentTarget.textContent=enlarged ? '还原画面' : '放大画面';
    event.currentTarget.setAttribute('aria-pressed',String(enlarged));
  });
  timeline.addEventListener('input',()=>{pause();renderAt(Number(timeline.value));});
  document.getElementById('speed').addEventListener('change',e=>{speed=Number(e.target.value);});
  document.addEventListener('keydown', e=>{
    if (['INPUT','SELECT','TEXTAREA','BUTTON'].includes(e.target.tagName)) return;
    if (e.code==='Space') {e.preventDefault();playing ? pause() : play();}
    if (e.code==='ArrowLeft' || e.code==='ArrowRight') {e.preventDefault();pause();renderAt(current+(e.code==='ArrowLeft' ? -0.5:0.5));}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden) pause();});
  window.ScientificAnimation = Object.freeze({
    renderAt, play, pause, spec,
    state:()=>({current,playing,speed,duration:spec.duration}),
    exportMode:()=>{
      pause();document.body.classList.add('export-mode');
      stage.parentElement.classList.remove('zoomed');
      stage.style.width=spec.width+'px';stage.style.height=spec.height+'px';
    },
    inspect:()=>{
      const problems=[];
      const bounds=node=>{
        const b=node.getBBox(),m=stage.getScreenCTM().inverse().multiply(node.getScreenCTM());
        const p=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m));
        const x=Math.min(...p.map(v=>v.x)),y=Math.min(...p.map(v=>v.y));
        return {x,y,width:Math.max(...p.map(v=>v.x))-x,height:Math.max(...p.map(v=>v.y))-y};
      };
      const visible=nodes.filter(({wrapper,node})=>Number(wrapper.getAttribute('opacity') ?? 1)*Number(node.getAttribute('opacity') ?? 1)>0.1);
      const labels=visible.filter(n=>n.item.type==='text');
      const boxes=new Map(visible.map(n=>[n.item.id,bounds(n.node)]));
      const overlaps=(a,b,gap=3)=>a.x+a.width+gap>b.x && b.x+b.width+gap>a.x && a.y+a.height+gap>b.y && b.y+b.height+gap>a.y;
      for (const {item} of labels) {
        const b=boxes.get(item.id);
        if (b.x<0 || b.y<0 || b.x+b.width>spec.width || b.y+b.height>bandY) problems.push({id:item.id,issue:'text_outside_content_area',box:b});
      }
      for(let i=0;i<labels.length;i++) for(let j=i+1;j<labels.length;j++) {
        if(overlaps(boxes.get(labels[i].item.id),boxes.get(labels[j].item.id))) problems.push({id:labels[i].item.id,other:labels[j].item.id,issue:'label_overlap'});
      }
      for(const moving of visible.filter(n=>n.item.motion || (n.item.type!=='text' && (n.item.tracks || []).some(t=>['x','y','cx','cy','x1','x2','y1','y2','r','width','height'].includes(t.attribute))))) for(const label of labels) {
        if(moving===label) continue;
        if(overlaps(boxes.get(moving.item.id),boxes.get(label.item.id))) problems.push({id:moving.item.id,other:label.item.id,issue:'motion_label_overlap'});
      }
      const guarded=visible.filter(n=>n.item.collisionGroup);
      for(let i=0;i<guarded.length;i++) for(let j=i+1;j<guarded.length;j++) {
        const a=guarded[i],b=guarded[j];
        if(a.item.collisionGroup===b.item.collisionGroup && overlaps(boxes.get(a.item.id),boxes.get(b.item.id),1)) problems.push({id:a.item.id,other:b.item.id,issue:'guarded_overlap'});
      }
      const b=caption.getBBox();
      if (b.x<48*uiScale || b.x+b.width>spec.width-48*uiScale || b.y<bandY || b.y+b.height>bandY+90*uiScale) problems.push({id:'caption',issue:'caption_overflow'});
      const boundaryBox=boundary.getBBox();
      if(boundaryBox.x<0 || boundaryBox.x+boundaryBox.width>spec.width || boundaryBox.y+boundaryBox.height>spec.height) problems.push({id:'evidence',issue:'evidence_overflow'});
      return {problems,canvas:{width:spec.width,height:spec.height},contentBottom:bandY};
    }
  });
  renderAt(0);
})();
