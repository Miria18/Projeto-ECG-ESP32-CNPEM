
'use strict';

// Leitura exclusiva de sinais reais do ESP32 pelo endpoint /d.
// O firmware precisa permitir CORS para acesso via Live Server.

const $ = id => document.getElementById(id);
const REAL_FS_DEFAULT = 250;
const VIEW_SECONDS = 6;
const RECORD_LIMIT = 75000;
const POLL_MS = 150;
const DISCONNECT_MS = 1800;
const ADC_VOLTS_PER_COUNT = 0.000125;

let espBase = '';
let points = [], captured = [], seq = -1;
let recording = false, online = false, adsOk = false, leadState = 3;
let sampleRate = 0, busy = false, lastSuccess = 0;
let currentController = null, requestGeneration = 0;
let beatTimes = [], rrIntervals = [], lastBeat = -Infinity;
let detectionSamples = [], lastToastTimeout;

const setText = (id, value) => {
  if ($(id)) $(id).textContent = value;
};

const validSignal = () =>
  online && adsOk && leadState === 0 && points.some(p => p.lo === 0);

function setState(id, isGood) {
  const el = $(id);
  if (!el) return;
  el.classList.toggle('state-good', !!isGood);
  el.classList.toggle('state-bad', !isGood);
}

function notify(message) {
  const el = $('toast');
  clearTimeout(lastToastTimeout);
  el.textContent = message;
  el.hidden = false;
  lastToastTimeout = setTimeout(() => {
    el.hidden = true;
  }, 6500);
}

function updateRecordUi() {
  setText('recordBtn', recording ? '■ Parar gravação' : '● Iniciar gravação');
  $('recordBtn').classList.toggle('is-recording', recording);
  $('recordBtn').disabled = !recording && !validSignal();
  $('recordIndicator').hidden = !recording;
  $('exportBtn').disabled = captured.length === 0;
}

function stopRecording(reason) {
  if (!recording) return;
  recording = false;
  updateRecordUi();
  notify(reason || `Gravação finalizada! ${captured.length.toLocaleString('pt-BR')} amostras armazenadas. Clique em Exportar CSV para salvar.`);
}

function resetMeasurements() {
  beatTimes = [];
  rrIntervals = [];
  lastBeat = -Infinity;
  detectionSamples = [];
}

function disconnect() {
  online = false;
  adsOk = false;
  leadState = 3;
  sampleRate = 0;
  points = [];
  resetMeasurements();
  stopRecording('Conexão perdida. A gravação foi interrompida; você pode exportar as amostras coletadas.');
  updateLabels();
  redraw();
}

function limitWindow() {
  const rate = Math.max(1, sampleRate || REAL_FS_DEFAULT);
  const max = Math.ceil(VIEW_SECONDS * rate);
  if (points.length > max) points.splice(0, points.length - max);
}

function recordPoint(p) {
  points.push(p);
  if (recording) {
    if (captured.length < RECORD_LIMIT) {
      captured.push({...p});
    } else {
      stopRecording('Limite de gravação atingido. Exporte o CSV para salvar as amostras.');
    }
  }
}

// Estimativa experimental de picos R, não validada clinicamente.
function processBeat(p) {
  if (!adsOk || p.lo !== 0 || !Number.isFinite(p.v)) return;

  const t = p.t;
  detectionSamples.push({t, v:p.v});

  while (detectionSamples.length > 3 && detectionSamples[0].t < t - 2.0) {
    detectionSamples.shift();
  }

  if (detectionSamples.length < Math.max(25, Math.round((sampleRate || REAL_FS_DEFAULT) * 0.7))) return;

  const recent = detectionSamples.slice(-Math.max(10, Math.round((sampleRate || REAL_FS_DEFAULT) * 1.2)));
  const values = recent.map(a => a.v);
  const sorted = [...values].sort((a,b) => a-b);
  const baseline = sorted[Math.floor(sorted.length * 0.5)];
  const deviation = sorted.map(v => Math.abs(v-baseline)).sort((a,b) => a-b);
  const noise = deviation[Math.floor(deviation.length * .5)] || .0001;
  const high = sorted[Math.floor(sorted.length * .98)];
  const low = sorted[Math.floor(sorted.length * .02)];
  const positive = high-baseline >= baseline-low;
  const magnitude = positive ? high-baseline : baseline-low;
  const threshold = Math.max(.02, noise*4, magnitude*.62);

  const a = detectionSamples[detectionSamples.length-3];
  const b = detectionSamples[detectionSamples.length-2];
  const c = detectionSamples[detectionSamples.length-1];

  if (!a || !b || !c) return;

  const apex = positive
    ? b.v > a.v && b.v >= c.v && b.v > baseline+threshold
    : b.v < a.v && b.v <= c.v && b.v < baseline-threshold;

  if (!apex || b.t-lastBeat < .33) return;

  if (Number.isFinite(lastBeat)) {
    const rr = (b.t-lastBeat)*1000;
    if (rr >= 330 && rr <= 2000) {
      rrIntervals.push({t:b.t, ms:rr});
    } else {
      rrIntervals = [];
    }
  }

  lastBeat = b.t;
  beatTimes.push(b.t);
  beatTimes = beatTimes.filter(bt => bt >= b.t-60);
  rrIntervals = rrIntervals.filter(r => r.t >= b.t-60);
}

function metrics() {
  const recent = rrIntervals
    .filter(r => r.t >= (points.at(-1)?.t ?? 0)-60)
    .map(r => r.ms);

  const lastBeatFresh = points.length && (points.at(-1).t-lastBeat) < 3;

  if (!validSignal() || !lastBeatFresh || recent.length < 2) return null;

  const recentRr = recent.slice(-8);
  const rr = recentRr.reduce((a,b) => a+b,0)/recentRr.length;
  const hr = Math.round(60000/rr);

  if (hr < 30 || hr > 200) return null;

  let hrv = null;

  if (recent.length >= 5) {
    const avg = recent.reduce((a,b) => a+b,0)/recent.length;
    const sdnn = Math.sqrt(recent.reduce((a,b) => a+(b-avg)**2,0)/recent.length);
    const diffs = recent.slice(1).map((v,i) => v-recent[i]);
    const rmssd = Math.sqrt(diffs.reduce((a,b) => a+b*b,0)/diffs.length);
    hrv = {sdnn, rmssd, avgHr:Math.round(60000/avg)};
  }

  return {hr, hrv};
}

function updateLabels() {
  const signalOK = validSignal();

  setText('connection', online ? '● ESP32 conectado' : '● Sem conexão');
  setState('connection', online);

  setText('wifi', online ? 'Wi-Fi: recebendo dados' : 'Wi-Fi: sem comunicação');
  setState('wifi', online);

  const quality = !online
    ? 'Sem conexão'
    : !adsOk
      ? 'Erro ADC'
      : leadState
        ? 'Eletrodo solto'
        : 'Sinal válido';

  setText('qualityTag', quality);
  setState('qualityTag', signalOK);

  setText('signalValue', !online
    ? 'Sem leitura'
    : !adsOk
      ? 'ADS1115 não detectado'
      : leadState
        ? 'Eletrodo desconectado'
        : 'Leituras recebidas');

  setState('signalValue', signalOK);

  setText('signalDetail', online
    ? `LO+: ${(leadState&1)?'alto':'baixo'} · LO−: ${(leadState&2)?'alto':'baixo'}`
    : 'Aguardando ESP32');

  setText('chartTag', signalOK ? 'Leitura real' : 'Sem sinal válido');
  setState('chartTag', signalOK);

  setText('sampleStatus', `Amostragem: ${online && sampleRate > 0 ? sampleRate.toFixed(1) : '—'} amostras/s`);

  const result = metrics();

  setText('hrTag', result ? 'Calculada' : 'Não calculada');
  setState('hrTag', !!result);
  setText('heartRate', result ? String(result.hr) : '—');
  setState('heartRate', !!result);
  setText('hrDetail', result
    ? 'Estimativa experimental a partir dos picos do sinal'
    : 'Aguardando picos cardíacos válidos');

  setText('rmssd', result?.hrv ? result.hrv.rmssd.toFixed(1)+' ms' : '—');
  setText('sdnn', result?.hrv ? result.hrv.sdnn.toFixed(1)+' ms' : '—');
  setText('averageHr', result?.hrv ? result.hrv.avgHr+' bpm' : '—');

  setText('rmssdNote', result?.hrv ? 'Estimativa experimental' : 'Não calculado');
  setText('sdnnNote', result?.hrv ? 'Estimativa experimental' : 'Não calculado');
  setText('averageHrNote', result?.hrv ? 'Estimativa experimental' : 'Não calculada');

  for (const id of ['rmssd','sdnn','averageHr']) {
    setState(id, !!result?.hrv);
  }

  updateRecordUi();
}

function redraw() {
  const canvas = $('ecgCanvas');
  if (!canvas) return;

  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;

  const ratio = Math.min(devicePixelRatio || 1,2);
  const w = bounds.width, h = bounds.height;

  canvas.width = Math.round(w*ratio);
  canvas.height = Math.round(h*ratio);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio,0,0,ratio,0,0);
  ctx.fillStyle = '#fff9f8';
  ctx.fillRect(0,0,w,h);

  // Grade visual de eletrocardiograma
  const small = 8;

  for (let x=0; x<=w; x+=small) {
    ctx.beginPath();
    ctx.strokeStyle = (Math.round(x/small)%5===0) ? '#edaaaa' : '#f8dddd';
    ctx.lineWidth = (Math.round(x/small)%5===0) ? 0.9 : 0.45;
    ctx.moveTo(Math.round(x)+.5,0);
    ctx.lineTo(Math.round(x)+.5,h);
    ctx.stroke();
  }

  for (let y=0; y<=h; y+=small) {
    ctx.beginPath();
    ctx.strokeStyle = (Math.round(y/small)%5===0) ? '#edaaaa' : '#f8dddd';
    ctx.lineWidth = (Math.round(y/small)%5===0) ? 0.9 : 0.45;
    ctx.moveTo(0,Math.round(y)+.5);
    ctx.lineTo(w,Math.round(y)+.5);
    ctx.stroke();
  }

  if (points.length < 2 || !validSignal()) return;

  const valid = points.filter(p => p.lo===0 && Number.isFinite(p.v));
  if (valid.length < 2) return;

  const vals = valid.map(p => p.v);
  const sorted = [...vals].sort((a,b) => a-b);
  const min = sorted[Math.floor(sorted.length*.01)];
  const max = sorted[Math.floor(sorted.length*.99)];
  const center = (min+max)/2;
  const range = Math.max(.08,(max-min)*1.15);

  const latest = points.at(-1).t;
  const start = latest-VIEW_SECONDS;

  ctx.strokeStyle = '#30343a';
  ctx.lineWidth = 1.45;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.beginPath();
  let active = false;

  for (const p of points) {
    if (p.lo!==0 || !Number.isFinite(p.v)) {
      active = false;
      continue;
    }

    const x = (p.t-start)/VIEW_SECONDS*w;
    if (x < 0 || x>w) continue;

    const y = Math.max(3,Math.min(h-3,h/2-(p.v-center)/range*h*.8));

    if (!active) {
      ctx.moveTo(x,y);
      active = true;
    } else {
      ctx.lineTo(x,y);
    }
  }

  ctx.stroke();
}

async function realTick() {
  if (!espBase || busy) return;

  busy = true;
  const generation = requestGeneration;
  const controller = new AbortController();
  currentController = controller;
  const timeout = setTimeout(() => controller.abort(),1300);

  try {
    const response = await fetch(`${espBase}/d?n=${seq}`, {
      cache:'no-store',
      signal:controller.signal
    });

    if (!response.ok) throw Error(`HTTP ${response.status}`);

    const data = await response.json();

    if (!Array.isArray(data.v) ||
        !Number.isFinite(data.s) ||
        !Number.isFinite(data.e) ||
        !Number.isFinite(Number(data.fs))) {
      throw Error('Resposta inválida');
    }

    if (generation !== requestGeneration) return;

    const wasOnline = online;
    online = true;
    lastSuccess = Date.now();
    adsOk = Boolean(data.ads);
    sampleRate = Number(data.fs) || 0;

    if (!wasOnline) resetMeasurements();

    if (seq>=0 && data.s>seq) {
      points = [];
      resetMeasurements();
      stopRecording('Perda de amostras detectada. Gravação interrompida; exporte as amostras já recebidas.');
    }

    if (seq>=0 && data.e<seq) {
      points = [];
      resetMeasurements();
    }

    if (!adsOk) resetMeasurements();

    const fs = sampleRate || REAL_FS_DEFAULT;

    for (let i=0; i<data.v.length; i++) {
      const packed = Number(data.v[i]);
      if (!Number.isFinite(packed)) continue;

      const lo = ((packed%4)+4)%4;
      const adc = (packed-lo)/4;

      if (leadState!==lo && lo!==0) resetMeasurements();

      leadState = lo;

      const p = {
        n:data.s+i,
        t:(data.s+i)/fs,
        adc,
        v:adc*ADC_VOLTS_PER_COUNT,
        lo
      };

      recordPoint(p);
      processBeat(p);
    }

    seq = data.e;
    limitWindow();
    updateLabels();
    redraw();

  } catch(error) {
    if (generation===requestGeneration &&
        online &&
        Date.now()-lastSuccess>DISCONNECT_MS) {
      disconnect();
    }
  } finally {
    clearTimeout(timeout);
    if (currentController===controller) currentController=null;
    busy=false;
  }
}

function connect() {
  const input = $('espHost').value.trim();

  if (!input) {
    notify('Digite o endereço IP do ESP32.');
    return;
  }

  let parsed;

  try {
    parsed = new URL(/^https?:\/\//i.test(input) ? input : `http://${input}`);
  } catch {
    notify('Endereço inválido. Exemplo: 192.168.4.1');
    return;
  }

  if (!['http:','https:'].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (parsed.pathname!=='/' && parsed.pathname!=='')) {
    notify('Use somente o endereço do ESP32, por exemplo: 192.168.4.1');
    return;
  }

  requestGeneration++;

  if (currentController) currentController.abort();

  espBase = parsed.origin;
  seq = -1;
  lastSuccess = 0;
  points = [];
  resetMeasurements();

  stopRecording('Conexão alterada. Gravação interrompida; exporte as amostras já recebidas.');

  online=false;
  adsOk=false;
  leadState=3;
  sampleRate=0;

  updateLabels();
  redraw();

  notify('Conectando ao ESP32… Se não conectar, confira o IP, a mesma rede Wi-Fi e a permissão CORS do firmware.');

  realTick();
}

function exportCsv() {
  if (!captured.length) {
    notify('Ainda não existem amostras gravadas para exportar.');
    return;
  }

  const lines = ['origem;indice;tempo_s;adc_bruto;tensao_saida_V;lo_mais;lo_menos'];

  captured.forEach(p => lines.push([
    'REAL',
    p.n,
    p.t.toFixed(4),
    p.adc,
    p.v.toFixed(6),
    p.lo&1,
    (p.lo>>1)&1
  ].join(';')));

  const blob = new Blob(['\ufeff'+lines.join('\r\n')], {
    type:'text/csv;charset=utf-8'
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  const date = new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth()+1).padStart(2,'0'),
    String(date.getDate()).padStart(2,'0')
  ].join('-');

  a.href = url;
  a.download = `ecg_amostras_reais_${stamp}.csv`;

  document.body.append(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url),1000);
  notify('Arquivo CSV exportado com sucesso.');
}

$('exportBtn').addEventListener('click',exportCsv);

$('recordBtn').addEventListener('click',() => {
  if (recording) {
    stopRecording();
    return;
  }

  if (!validSignal()) {
    notify('Não é possível gravar: aguardando sinal real e válido do ESP32.');
    return;
  }

  captured = [];
  recording = true;
  updateRecordUi();
  notify('Gravação iniciada.');
});

window.addEventListener('resize',redraw);

setInterval(realTick,POLL_MS);

setInterval(() => {
  if (online && Date.now()-lastSuccess>DISCONNECT_MS) disconnect();
},400);

updateLabels();
redraw();

if (location.protocol === 'http:' || location.protocol === 'https:') {
  $('espHost').value = location.hostname === '192.168.4.1'
    ? location.host
    : '192.168.4.1';

  connect();
}