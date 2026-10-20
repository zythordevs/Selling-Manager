// Generates the glass-style feedback card and the "Order Completed" banner.
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const cfg = require('./config');

function star(ctx, cx, cy, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function fit(ctx, str, maxW) {
  if (ctx.measureText(str).width <= maxW) return str;
  while (str.length > 1 && ctx.measureText(str + '…').width > maxW) str = str.slice(0, -1);
  return str + '…';
}

function wrap(ctx, str, maxW, maxLines) {
  const words = str.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = fit(ctx, lines[maxLines - 1] + '…', maxW);
  }
  return lines;
}

function background(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#040d2e');
  g.addColorStop(1, '#1f4fff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (const [x, y, r, a] of [[0, H, 190, 0.35], [W, 0, 170, 0.3], [W - 60, H - 20, 120, 0.25], [90, 30, 90, 0.2]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(90,150,255,${a})`;
    ctx.fill();
  }
}

async function feedbackImage({ username, avatarUrl, product, price, rating, reason }) {
  const W = 900, H = 420;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  background(ctx, W, H);

  ctx.beginPath();
  ctx.roundRect(50, 50, 800, 300, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,185,255,0.75)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // avatar
  ctx.save();
  ctx.beginPath(); ctx.arc(140, 140, 48, 0, Math.PI * 2); ctx.clip();
  try {
    const res = await fetch(avatarUrl);
    ctx.drawImage(await loadImage(Buffer.from(await res.arrayBuffer())), 92, 92, 96, 96);
  } catch { ctx.fillStyle = '#2b5bff'; ctx.fillRect(92, 92, 96, 96); }
  ctx.restore();
  ctx.beginPath(); ctx.arc(140, 140, 48, 0, Math.PI * 2);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 38px sans-serif';
  ctx.fillText(fit(ctx, `@${username}`, 560), 215, 128);
  ctx.font = '22px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(fit(ctx, `Product: ${product}`, 580), 215, 165);

  for (let i = 0; i < 5; i++) star(ctx, 230 + i * 32, 193, 13, i < rating ? '#ffd84a' : 'rgba(255,255,255,0.25)');
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const priceTxt = price ? price.replace('₹', 'Rs. ') : null; // default fonts often lack the rupee glyph
  ctx.fillText(priceTxt ? `Price: ${priceTxt}   •   ${rating}/5` : `${rating}/5`, 230 + 5 * 32 + 6, 200);

  ctx.beginPath(); ctx.roundRect(80, 235, 740, 90, 18);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'italic 24px sans-serif'; ctx.textAlign = 'center';
  const lines = wrap(ctx, `"${reason || 'No comment'}"`, 690, 2);
  const startY = 280 - ((lines.length - 1) * 15);
  lines.forEach((l, idx) => ctx.fillText(l, 450, startY + idx * 32));

  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(`${cfg.brand} - Trusted Store`, 450, 392);
  return canvas.toBuffer('image/png');
}

function bannerImage(label = 'ORDER COMPLETED') {
  const W = 1000, H = 300;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  background(ctx, W, H);
  ctx.beginPath(); ctx.roundRect(16, 16, W - 32, H - 32, 26);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 6; ctx.stroke();
  for (const [x, y] of [[48, 48], [W - 48, 48], [48, H - 48], [W - 48, H - 48]]) star(ctx, x, y, 14, '#fff');
  ctx.textAlign = 'center';
  ctx.font = 'bold 92px sans-serif';
  ctx.strokeStyle = 'rgba(10,30,120,0.9)'; ctx.lineWidth = 10; ctx.strokeText(label, W / 2, 180);
  ctx.fillStyle = '#cfe0ff'; ctx.fillText(label, W / 2, 180);
  ctx.font = '22px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(cfg.brand, W / 2, 245);
  return canvas.toBuffer('image/png');
}

module.exports = { feedbackImage, bannerImage };
