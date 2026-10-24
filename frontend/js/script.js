'use strict';
// DEMONSTRAÇÃO: nenhum valor exibido nesta versão é obtido do ESP32.
// O firmware fornecido hospeda /d em http://192.168.4.1/d e já tem sua própria página.
const FS = 100; // frequência de pontos para animação ilustrativa (não é a taxa do firmware)
const WINDOW_SECONDS = 6;
const BUFFER_SIZE = FS * WINDOW_SECONDS;
const samples = Array.from({ length: BUFFER_SIZE }, (_, i) => ecgWave(i / FS));
let sampleNumber = BUFFER_SIZE;
let animationPaused = false;
const byId = (id) => document.getElementById(id);

// Curva sintética didática P-QRS-T repetida (não representa um ECG registrado).
function gaussian(x, center, width, amplitude) {
  const t = (x - center) / width;
  return amplitude * Math.exp(-0.5 * t * t);
}
function ecgWave(t) {
  const phase = ((t % 0.83) + 0.83) % 0.83;
  const baseline = 0.025 * Math.sin(2 * Math.PI * 0.16 * t);
  return baseline + gaussian(phase, .13, .035, .12) - gaussian(phase, .32, .012, .10)
    + gaussian(phase, .35, .012, .96) - gaussian(phase, .39, .014, .23)
    + gaussian(phase, .57, .065, .28);
}

function drawCanvas(id, data) {
  const canvas = byId(id);
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(bounds.width * scale);
  canvas.height = Math.round(bounds.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const w = bounds.width, h = bounds.height;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#eaf0ef'; ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y <= h; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.beginPath();
  ctx.strokeStyle = '#239a98'; ctx.lineWidth = 1.7; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  data.forEach((v, i) => {
    const x = i / Math.max(1, data.length - 1) * w;
    const y = h * 0.70 - v * h * 0.46;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
}
function render() {
  drawCanvas('ecgCanvas', samples);
  drawCanvas('historyCanvas', samples.filter((_, i) => i % 2 === 0));
}
setInterval(() => {
  if (animationPaused) return;
  for (let i = 0; i < 5; i++) { samples.push(ecgWave(sampleNumber++ / FS)); samples.shift(); }
  render();
}, 50);
window.addEventListener('resize', render);
render();

function exportCSV() {
  const rows = ['tempo_relativo_s;sinal_simulado_unidade_arbitraria'];
  for (let i = 0; i < samples.length; i++) {
    const t = (i / FS - WINDOW_SECONDS).toFixed(3).replace('.', ',');
    const v = samples[i].toFixed(5).replace('.', ',');
    rows.push(`${t};${v}`);
  }
  const blob = new Blob(['\uFEFF', rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ecg_DEMONSTRACAO_dados_simulados.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
byId('downloadBtn').addEventListener('click', exportCSV);
byId('exportBtn').addEventListener('click', exportCSV);
