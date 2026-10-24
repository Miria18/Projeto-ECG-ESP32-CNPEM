"use strict";
// Modo demonstração: dados estritamente sintéticos. Modo real: /d na mesma origem do ESP32.
// A página abre em demo pelo Live Server e em real quando hospedada em 192.168.4.1.
const $ = id => document.getElementById(id);
const DEMO_FS = 100, REAL_FS_DEFAULT = 250, VIEW_SECONDS = 6, RECORD_LIMIT = 75000;
let mode = location.hostname === '192.168.4.1' ? 'real' : 'demo';
let paused = false, recording = false, captured = [], points = [], seq = -1;
let online = false, adsOk = false, leadState = 3, sampleRate = 0, busy = false;
let lastSuccess = 0, nextDemo = 0, recordSource = mode;
const setText = (id, value) => { if ($(id)) $(id).textContent = value; };
const gaussian = (x, center, width, amplitude) => amplitude * Math.exp(-.5 * ((x-center)/width)**2);
function demoWave(t) {
  const phase = ((t % .83) + .83) % .83;
  return .025*Math.sin(2*Math.PI*.16*t) + gaussian(phase,.13,.035,.12)
    -gaussian(phase,.32,.012,.10)+gaussian(phase,.35,.012,.96)
    -gaussian(phase,.39,.014,.23)+gaussian(phase,.57,.065,.28);
}
function limitWindow() {
  const rate = mode === 'demo' ? DEMO_FS : Math.max(1, sampleRate || REAL_FS_DEFAULT);
  const max = Math.ceil(VIEW_SECONDS * rate);
  if(points.length > max) points.splice(0, points.length - max);
}
function recordPoint(p) {
  points.push(p);
  if (recording) {
    if (captured.length < RECORD_LIMIT) captured.push({...p});
    else { recording=false;setText('recordBtn','Iniciar gravação');alert('Limite de gravação atingido. Exporte o CSV.'); }
  }
}
function draw(canvasId, dataset) {
  const canvas=$(canvasId); if(!canvas)return;
  const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;
  const ratio=Math.min(window.devicePixelRatio||1,2),w=r.width,h=r.height;
  canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
  const ctx=canvas.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);
  ctx.fillStyle='#f8fbfa';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#e4eeeb';ctx.lineWidth=1;
  for(let x=0;x<w;x+=30){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
  for(let y=0;y<h;y+=30){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  if(dataset.length < 2)return;
  const vals=dataset.map(p=>p.v), min=Math.min(...vals),max=Math.max(...vals),
        center=(max+min)/2,range=Math.max(mode==='demo'?.7:.08,max-min);
  ctx.strokeStyle='#239a98';ctx.lineWidth=1.7;ctx.lineJoin='round';ctx.lineCap='round';
  ctx.beginPath();let active=false;
  dataset.forEach((p,i)=>{
    const valid=mode==='demo'||(p.lo===0&&adsOk);
    if(!valid){active=false;return;}
    const x=i/(dataset.length-1)*w, y=h/2-(p.v-center)/range*h*.78;
    if(!active){ctx.moveTo(x,y);active=true;}else ctx.lineTo(x,y);
  });ctx.stroke();
}
function redraw(){ if(paused)return;draw('ecgCanvas',points);draw('historyCanvas',points.filter((_,i)=>i%3===0)); }
function updateLabels() {
  $('modeSelect').value=mode;
  if(mode==='demo'){
    setText('modeHelp','Simulação educativa — os sinais e números NÃO foram medidos.');
    setText('connection','● Demonstração');$('connection').classList.remove('bad');
    setText('wifi','Wi-Fi: não necessário');setText('battery','Bateria: não medida');
    setText('qualityTag','Simulado');setText('signalValue','Sinal simulado');
    setText('signalDetail','Curva sintética P-QRS-T');setText('chartTag','Simulação');
    setText('hrTag','Simulada');setText('heartRate','72');
    setText('hrDetail','Apenas para demonstração');
    setText('averageHr','72 bpm (sim.)');setText('rmssd','—');setText('sdnn','—');
    setText('sampleStatus','Animação: 100 pontos/s (simulados)');
    setText('chartDescription','Modo demonstração: curva sintética, não registrada por um sensor.');
    setText('noticeText','DEMONSTRAÇÃO: nenhum dado é real. Não utilizar para diagnóstico. Para eletrodos no corpo: somente bateria e protocolo aprovado.');
  }else{
    setText('modeHelp','Dados reais apenas se a página estiver conectada ao endpoint /d do ESP32.');
    setText('connection',online?'● ESP32 conectado':'● ESP32 desconectado');
    $('connection').classList.toggle('bad',!online);
    setText('wifi',online?'Wi-Fi: recebendo dados':'Wi-Fi: sem comunicação');
    setText('battery','Bateria: não medida');
    setText('qualityTag',!online?'Sem conexão':!adsOk?'Erro ADC':leadState?'Eletrodo solto':'Eletrodos OK*');
    setText('signalValue',!online?'Sem leitura':!adsOk?'ADS1115 não detectado':leadState?'Eletrodo desconectado':'Leituras recebidas');
    setText('signalDetail',online?`LO+: ${(leadState&1)?'alto':'baixo'} · LO−: ${(leadState&2)?'alto':'baixo'}`:'Aguardando ESP32');
    setText('chartTag',online&&adsOk&&!leadState?'Leitura real':'Sem sinal válido');
    setText('hrTag','Não calculada');setText('heartRate','—');
    setText('hrDetail','Detector de picos R ainda não implementado');
    setText('rmssd','—');setText('sdnn','—');setText('averageHr','—');
    setText('sampleStatus',`Amostragem medida: ${online?sampleRate.toFixed(1):'—'} amostras/s`);
    setText('chartDescription','Modo real: tensão na saída do AD8232 (V), escala automática; sem filtros clínicos.');
    setText('noticeText','Medição experimental sem uso diagnóstico. Com eletrodos no corpo, somente bateria; jamais USB/rede elétrica.');
  }
}
function demoTick(){
  if(mode!=='demo')return;
  for(let i=0;i<5;i++){
    const t=nextDemo++/DEMO_FS;recordPoint({n:nextDemo-1,t,v:demoWave(t),lo:0,adc:null});
  }
  limitWindow();redraw();
}
async function realTick(){
  if(mode!=='real'||busy)return;busy=true;
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),1800);
  try{
    const response=await fetch(`/d?n=${seq}`,{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw Error(`HTTP ${response.status}`);
    const data=await response.json();
    if(!Array.isArray(data.v)||!Number.isFinite(data.s)||!Number.isFinite(data.e)||!Number.isFinite(Number(data.fs)))throw Error('Resposta inválida');
    if(mode!=='real')return;
    online=true;lastSuccess=Date.now();adsOk=Boolean(data.ads);sampleRate=Number(data.fs)||0;
    if(seq>=0&&data.s>seq){points=[];if(recording){recording=false;setText('recordBtn','Iniciar gravação');alert('Perda de amostras; gravação interrompida.');}}
    for(let i=0;i<data.v.length;i++){
      const packed=Number(data.v[i]);if(!Number.isFinite(packed))continue;
      const lo=((packed%4)+4)%4, adc=(packed-lo)/4;
      leadState=lo;
      recordPoint({n:data.s+i,t:(data.s+i)/REAL_FS_DEFAULT,adc,v:adc*.000125,lo});
    }
    seq=data.e;limitWindow();updateLabels();redraw();
  }catch(error){
    if(mode==='real'&&Date.now()-lastSuccess>1200){online=false;points=[];updateLabels();redraw();}
  }finally{clearTimeout(timeout);busy=false;}
}
function changeMode(value){
  if(recording){recording=false;setText('recordBtn','Iniciar gravação');}
  captured=[];recordSource=value;points=[];seq=-1;online=false;adsOk=false;
  leadState=3;sampleRate=0;paused=false;nextDemo=0;
  setText('pauseBtn','Pausar gráfico');mode=value;updateLabels();redraw();
  if(mode==='demo'){for(let i=0;i<DEMO_FS*VIEW_SECONDS;i++){const t=nextDemo++/DEMO_FS;points.push({n:nextDemo-1,t,v:demoWave(t),lo:0,adc:null});}redraw();}
  if(mode==='real')realTick();
}
function exportCsv(){
  const data=captured.length?captured:points;
  if(!data.length){alert('Não há dados para exportar.');return;}
  const demo=recordSource==='demo'&&captured.length>0||(!captured.length&&mode==='demo');
  const header=demo?'origem;indice;tempo_s;sinal_simulado_unidade_arbitraria':'origem;indice;tempo_s;adc_bruto;tensao_saida_V;lo_mais;lo_menos';
  const lines=[header];
  data.forEach(p=>lines.push(demo?['SIMULADO',p.n,p.t.toFixed(3),p.v.toFixed(6)].join(';'):['REAL',p.n,p.t.toFixed(3),p.adc,p.v.toFixed(6),p.lo&1,(p.lo>>1)&1].join(';')));
  const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=demo?'ecg_DEMONSTRACAO.csv':'ecg_AMOSTRAS_REAIS.csv';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('modeSelect').addEventListener('change',event=>changeMode(event.target.value));
$('downloadBtn').addEventListener('click',exportCsv);
$('exportBtn').addEventListener('click',exportCsv);
$('pauseBtn').addEventListener('click',()=>{paused=!paused;setText('pauseBtn',paused?'Retomar gráfico':'Pausar gráfico');if(!paused)redraw();});
$('recordBtn').addEventListener('click',()=>{
  if(mode==='real'&&!online){alert('ESP32 desconectado; sem gravação real.');return;}
  recording=!recording;
  if(recording){captured=[];recordSource=mode;}
  setText('recordBtn',recording?'Parar gravação':'Iniciar gravação');
});
window.addEventListener('resize',redraw);
changeMode(mode);setInterval(demoTick,50);setInterval(realTick,150);
