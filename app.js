// ─────────────────────────────────────────
// PWA SERVICE WORKER
// ─────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(() => {
      document.getElementById('pwa-badge').style.display = 'flex';
    })
    .catch(() => {});
}

// ─────────────────────────────────────────
// TAB SWITCHING
// ─────────────────────────────────────────
function showTab(tab, event) {
  document.querySelectorAll('.section')
    .forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab')
    .forEach(t => t.classList.remove('active'));
  document.getElementById(tab).classList.add('active');
  event.target.classList.add('active');
  stopCamera();
}

function showScanTab(tab, btn) {
  document.querySelectorAll('.scan-tab')
    .forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('scan-upload').style.display =
    tab === 'upload' ? 'block' : 'none';
  document.getElementById('scan-camera').style.display =
    tab === 'camera' ? 'block' : 'none';
  if (tab !== 'camera') stopCamera();
}

// ─────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────
function updateCounter() {
  const len = document.getElementById('gen-message').value.length;
  const el  = document.getElementById('char-counter');
  el.textContent = len + ' / 300';
  el.className = len >= 300 ? 'full' : len >= 240 ? 'near' : '';
}

function toggleVis(id, btn) {
  const el = document.getElementById(id);
  el.type  = el.type === 'password' ? 'text' : 'password';
  btn.textContent = el.type === 'password' ? '👁' : '🙈';
}

function toggleDuress() {
  const on = document.getElementById('duress-toggle').checked;
  document.getElementById('duress-fields').style.display =
    on ? 'block' : 'none';
}

function toggleCustom() {
  const on = document.getElementById('custom-toggle').checked;
  document.getElementById('custom-fields').style.display =
    on ? 'block' : 'none';
}

function checkStrength(pw) {
  const bar   = document.getElementById('strength-bar');
  const label = document.getElementById('strength-label');
  if (!pw) { bar.style.width = '0'; label.textContent = ''; return; }
  let s = 0;
  if (pw.length >= 8)  s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const levels = [
    ['20%','#e74c3c','Very weak','#c0392b'],
    ['40%','#e67e22','Weak','#d35400'],
    ['60%','#f1c40f','Fair','#9a7d0a'],
    ['80%','#2ecc71','Strong','#1e8449'],
    ['100%','#27ae60','Very strong','#1a5c33'],
  ];
  const [w,c,t,lc] = levels[Math.min(s,4)];
  bar.style.width      = w;
  bar.style.background = c;
  label.textContent    = t;
  label.style.color    = lc;
}

// ─────────────────────────────────────────
// CRYPTO HELPERS
// ─────────────────────────────────────────
const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromB64(b64) {
  const s = atob(b64);
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b.buffer;
}

async function deriveKey(password, salt) {
  const km = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations:100000, hash:'SHA-256' },
    km,
    { name:'AES-GCM', length:256 },
    false,
    ['encrypt','decrypt']
  );
}

async function aesEncrypt(message, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(password, salt);
  const ct   = await crypto.subtle.encrypt(
    { name:'AES-GCM', iv }, key, enc.encode(message)
  );
  const out = new Uint8Array(28 + ct.byteLength);
  out.set(salt, 0);
  out.set(iv, 16);
  out.set(new Uint8Array(ct), 28);
  return toB64(out.buffer);
}

async function aesDecrypt(b64, password) {
  const data = new Uint8Array(fromB64(b64));
  const salt = data.slice(0, 16);
  const iv   = data.slice(16, 28);
  const ct   = data.slice(28);
  const key  = await deriveKey(password, salt);
  const pt   = await crypto.subtle.decrypt(
    { name:'AES-GCM', iv }, key, ct
  );
  return dec.decode(pt);
}

// ─────────────────────────────────────────
// GENERATE QR
// ─────────────────────────────────────────
async function generateQR() {
  const message  = document.getElementById('gen-message').value.trim();
  const password = document.getElementById('gen-password').value.trim();
  const status   = document.getElementById('gen-status');
  const output   = document.getElementById('qr-output');
  const exports  = document.getElementById('export-buttons');

  output.innerHTML = '';
  status.innerHTML = '';
  exports.style.display = 'none';

  if (!message) {
    status.innerHTML =
      '<div class="msg-err">⚠ Please enter a message.</div>';
    return;
  }
  if (!password) {
    status.innerHTML =
      '<div class="msg-err">⚠ Please enter a password.</div>';
    return;
  }
  if (password.length < 6) {
    status.innerHTML =
      '<div class="msg-err">⚠ Password must be at least 6 characters.</div>';
    return;
  }

  // Duress check
  const duressOn = document.getElementById('duress-toggle').checked;
  if (duressOn) {
    const dp = document.getElementById('decoy-password').value.trim();
    const dm = document.getElementById('decoy-message').value.trim();
    if (!dp || !dm) {
      status.innerHTML =
        '<div class="msg-err">⚠ Enter a decoy message and decoy password.</div>';
      return;
    }
    if (dp === password) {
      status.innerHTML =
        '<div class="msg-err">⚠ Decoy password must differ from real password.</div>';
      return;
    }
  }

  status.innerHTML =
    '<p class="status-busy">🔒 Encrypting...</p>';

  try {
    let payload;

    if (duressOn) {
      const dp = document.getElementById('decoy-password').value.trim();
      const dm = document.getElementById('decoy-message').value.trim();
      const realEnc  = await aesEncrypt(message, password);
      const decoyEnc = await aesEncrypt(dm, dp);
      // Format: SQR2:REAL_B64|DECOY_B64
      payload = 'SQR2:' + realEnc + '|' + decoyEnc;
    } else {
      const encrypted = await aesEncrypt(message, password);
      payload = 'SQR1:' + encrypted;
    }

    status.innerHTML = '';

    // Get customisation options
    const colorDark  = document.getElementById('color-dark')?.value  || '#1a3a1a';
    const colorLight = document.getElementById('color-light')?.value || '#ffffff';
    const errLevel   = document.getElementById('error-level')?.value || 'H';
    const logo       = document.getElementById('center-logo')?.value || 'lock';

    const levelMap = {
      L: QRCode.CorrectLevel.L,
      M: QRCode.CorrectLevel.M,
      Q: QRCode.CorrectLevel.Q,
      H: QRCode.CorrectLevel.H,
    };

    new QRCode(output, {
      text:         payload,
      width:        260,
      height:       260,
      colorDark,
      colorLight,
      correctLevel: levelMap[errLevel] || QRCode.CorrectLevel.H,
    });

    // Add center logo overlay
    if (logo !== 'none') {
      setTimeout(() => addCenterLogo(logo, colorDark), 200);
    }

    exports.style.display = 'grid';
  } catch (err) {
    status.innerHTML =
      '<div class="msg-err">❌ Encryption failed. Try a shorter message.</div>';
    console.error(err);
  }
}

// ─────────────────────────────────────────
// CENTER LOGO
// ─────────────────────────────────────────
function addCenterLogo(type, bgColor) {
  const canvas = document.querySelector('#qr-output canvas');
  if (!canvas) return;
  const ctx  = canvas.getContext('2d');
  const size = canvas.width;
  const cx   = size / 2;
  const cy   = size / 2;
  const r    = size * 0.1;
  const icons = { lock:'🔐', shield:'🛡️', star:'⭐' };

  // White circle background
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Border circle
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.strokeStyle = bgColor;
  ctx.lineWidth   = 2;
  ctx.stroke();

  // Emoji
  ctx.font      = (r * 1.4) + 'px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icons[type] || '🔐', cx, cy);
}

// ─────────────────────────────────────────
// DOWNLOAD PNG
// ─────────────────────────────────────────
function downloadPNG() {
  const canvas = document.querySelector('#qr-output canvas');
  const img    = document.querySelector('#qr-output img');
  if (!canvas && !img) return;
  const link      = document.createElement('a');
  link.href       = canvas ? canvas.toDataURL('image/png') : img.src;
  link.download   = 'SecureQR_' + Date.now() + '.png';
  link.click();
}

// ─────────────────────────────────────────
// DOWNLOAD SVG
// ─────────────────────────────────────────
function downloadSVG() {
  const canvas = document.querySelector('#qr-output canvas');
  if (!canvas) return;

  const w    = canvas.width;
  const h    = canvas.height;
  const ctx  = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, w, h).data;
  const size = 4; // SVG units per pixel

  let rects = '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i+1], b = data[i+2];
      const dark = (r + g + b) / 3 < 128;
      if (dark) {
        const hex = '#' + [r,g,b].map(v =>
          v.toString(16).padStart(2,'0')).join('');
        rects += `<rect x="${x*size}" y="${y*size}"
          width="${size}" height="${size}" fill="${hex}"/>`;
      }
    }
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
  width="${w*size}" height="${h*size}"
  viewBox="0 0 ${w*size} ${h*size}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${rects}
</svg>`;

  const blob = new Blob([svg], { type:'image/svg+xml' });
  const link = document.createElement('a');
  link.href  = URL.createObjectURL(blob);
  link.download = 'SecureQR_' + Date.now() + '.svg';
  link.click();
  URL.revokeObjectURL(link.href);
}

// ─────────────────────────────────────────
// FILE UPLOAD SCAN
// ─────────────────────────────────────────
let scannedData = null;

function readQR(event) {
  const file   = event.target.files[0];
  const output = document.getElementById('decoded-output');
  const label  = document.getElementById('upload-label');
  if (!file) return;
  label.textContent = '📎 ' + file.name;
  scannedData = null;
  output.innerHTML = '';

  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const c   = document.createElement('canvas');
      c.width   = img.width;
      c.height  = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      const id  = c.getContext('2d').getImageData(0, 0, c.width, c.height);
      const qr  = jsQR(id.data, c.width, c.height);
      if (qr) {
        scannedData = qr.data;
        output.innerHTML =
          '<div class="msg-scan-ok">✅ QR scanned. Enter password to decrypt.</div>';
      } else {
        output.innerHTML =
          '<div class="msg-err">❌ Could not read QR code. Try a clearer image.</div>';
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ─────────────────────────────────────────
// CAMERA SCAN
// ─────────────────────────────────────────
let cameraStream  = null;
let cameraTimer   = null;
let cameraRunning = false;

async function toggleCamera() {
  if (cameraRunning) { stopCamera(); return; }
  const btn   = document.getElementById('cam-btn');
  const video = document.getElementById('camera-video');
  const out   = document.getElementById('decoded-output');
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    video.srcObject = cameraStream;
    cameraRunning   = true;
    btn.textContent = '⏹ Stop Camera';
    out.innerHTML   = '<div class="msg-scan-ok">📷 Point camera at a SecureQR code...</div>';
    cameraTimer = setInterval(scanFrame, 300);
  } catch (err) {
    out.innerHTML =
      '<div class="msg-err">❌ Camera access denied. Please allow camera permissions.</div>';
  }
}

function scanFrame() {
  const video  = document.getElementById('camera-video');
  const canvas = document.getElementById('camera-canvas');
  if (!video.videoWidth) return;
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);
  const id  = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const qr  = jsQR(id.data, canvas.width, canvas.height);
  if (qr) {
    scannedData = qr.data;
    document.getElementById('decoded-output').innerHTML =
      '<div class="msg-scan-ok">✅ QR detected! Enter password to decrypt.</div>';
    stopCamera();
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  clearInterval(cameraTimer);
  cameraRunning = false;
  const btn = document.getElementById('cam-btn');
  if (btn) btn.textContent = '▶ Start Camera';
}

// ─────────────────────────────────────────
// DECODE QR
// ─────────────────────────────────────────
async function decodeQR() {
  const password = document.getElementById('val-password').value.trim();
  const output   = document.getElementById('decoded-output');

  if (!scannedData) {
    output.innerHTML =
      '<div class="msg-err">⚠ Please scan or upload a QR code first.</div>';
    return;
  }
  if (!password) {
    output.innerHTML =
      '<div class="msg-err">⚠ Please enter the decryption password.</div>';
    return;
  }

  output.innerHTML = '<p class="status-busy">🔓 Decrypting...</p>';

  try {
    let result;

    if (scannedData.startsWith('SQR2:')) {
      // Duress format: try real then decoy
      const parts = scannedData.slice(5).split('|');
      let decrypted = null;
      for (const part of parts) {
        try {
          decrypted = await aesDecrypt(part, password);
          break;
        } catch (_) {}
      }
      if (decrypted === null) throw new Error('Wrong password');
      result = decrypted;

    } else if (scannedData.startsWith('SQR1:')) {
      // Standard format
      result = await aesDecrypt(scannedData.slice(5), password);

    } else {
      // Legacy format (no prefix)
      result = await aesDecrypt(scannedData, password);
    }

    output.innerHTML = `
      <div class="msg-ok">
        <strong>✅ Decrypted Message:</strong>
        ${escHtml(result)}
        <br/>
        <button class="btn-copy"
          onclick="copyText(${JSON.stringify(result)}, this)">
          📋 Copy to Clipboard
        </button>
      </div>`;
  } catch {
    output.innerHTML =
      '<div class="msg-err">❌ Wrong password or corrupted QR code.</div>';
  }
}

// ─────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────
function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '✅ Copied!';
    setTimeout(() => btn.textContent = '📋 Copy to Clipboard', 2000);
  });
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;')
          .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
