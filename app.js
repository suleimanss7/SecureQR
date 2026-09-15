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
}

// ─────────────────────────────────────────
// CHARACTER COUNTER
// ─────────────────────────────────────────
function updateCounter() {
  const textarea = document.getElementById('gen-message');
  const counter  = document.getElementById('char-counter');
  const len = textarea.value.length;
  counter.textContent = len + ' / 300';
  counter.className = '';
  if (len >= 300) counter.classList.add('at-limit');
  else if (len >= 240) counter.classList.add('near-limit');
}

// ─────────────────────────────────────────
// PASSWORD VISIBILITY TOGGLE
// ─────────────────────────────────────────
function toggleVisibility(id, btn) {
  const input = document.getElementById(id);
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁';
  }
}

// ─────────────────────────────────────────
// PASSWORD STRENGTH INDICATOR
// ─────────────────────────────────────────
function checkStrength(password) {
  const bar   = document.getElementById('strength-bar');
  const label = document.getElementById('strength-label');
  if (!password) {
    bar.style.width = '0%';
    label.textContent = '';
    return;
  }
  let score = 0;
  if (password.length >= 8)  score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const levels = [
    { pct: '20%', color: '#e74c3c', text: 'Very weak',  col: '#e74c3c' },
    { pct: '40%', color: '#e67e22', text: 'Weak',       col: '#e67e22' },
    { pct: '60%', color: '#f1c40f', text: 'Fair',       col: '#b7950b' },
    { pct: '80%', color: '#2ecc71', text: 'Strong',     col: '#1e8449' },
    { pct: '100%',color: '#27ae60', text: 'Very strong',col: '#1a5c33' },
  ];
  const lvl = levels[Math.min(score, 4)];
  bar.style.width      = lvl.pct;
  bar.style.background = lvl.color;
  label.textContent    = lvl.text;
  label.style.color    = lvl.col;
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function showStatus(id, html, type = '') {
  const el = document.getElementById(id);
  el.innerHTML = '';
  const div = document.createElement('div');
  div.className = type;
  div.innerHTML = html;
  el.appendChild(div);
}

// ─────────────────────────────────────────
// KEY DERIVATION (PBKDF2)
// ─────────────────────────────────────────
async function deriveKey(password, salt) {
  const encoder     = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ─────────────────────────────────────────
// ENCRYPT
// ─────────────────────────────────────────
async function encryptMessage(message, password) {
  const encoder   = new TextEncoder();
  const salt      = crypto.getRandomValues(new Uint8Array(16));
  const iv        = crypto.getRandomValues(new Uint8Array(12));
  const key       = await deriveKey(password, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(message)
  );
  const combined = new Uint8Array(
    salt.byteLength + iv.byteLength + encrypted.byteLength
  );
  combined.set(salt, 0);
  combined.set(iv,   salt.byteLength);
  combined.set(new Uint8Array(encrypted), salt.byteLength + iv.byteLength);
  return bufferToBase64(combined.buffer);
}

// ─────────────────────────────────────────
// DECRYPT
// ─────────────────────────────────────────
async function decryptMessage(encryptedBase64, password) {
  const data      = new Uint8Array(base64ToBuffer(encryptedBase64));
  const salt      = data.slice(0, 16);
  const iv        = data.slice(16, 28);
  const encrypted = data.slice(28);
  const key       = await deriveKey(password, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  return new TextDecoder().decode(decrypted);
}

// ─────────────────────────────────────────
// GENERATE QR
// ─────────────────────────────────────────
async function generateQR() {
  const message  = document.getElementById('gen-message').value.trim();
  const password = document.getElementById('gen-password').value.trim();
  const output   = document.getElementById('qr-output');
  const status   = document.getElementById('gen-status');
  const dlBtn    = document.getElementById('download-btn');

  // Reset
  output.innerHTML  = '';
  status.innerHTML  = '';
  dlBtn.style.display = 'none';

  // Validate
  if (!message) {
    status.innerHTML =
      '<div class="msg-error">⚠ Please enter a message or URL.</div>';
    return;
  }
  if (!password) {
    status.innerHTML =
      '<div class="msg-error">⚠ Please enter a password.</div>';
    return;
  }
  if (password.length < 6) {
    status.innerHTML =
      '<div class="msg-error">⚠ Password must be at least 6 characters.</div>';
    return;
  }

  status.innerHTML =
    '<p class="status-encrypting">🔒 Encrypting your message...</p>';

  try {
    const encrypted = await encryptMessage(message, password);
    status.innerHTML = '';

    new QRCode(output, {
      text:         encrypted,
      width:        260,
      height:       260,
      colorDark:    '#1a3a1a',
      colorLight:   '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });

    dlBtn.style.display = 'block';
  } catch (err) {
    status.innerHTML =
      '<div class="msg-error">❌ Encryption failed. Try a shorter message.</div>';
    console.error(err);
  }
}

// ─────────────────────────────────────────
// DOWNLOAD QR
// ─────────────────────────────────────────
function downloadQR() {
  const canvas = document.querySelector('#qr-output canvas');
  const img    = document.querySelector('#qr-output img');
  let dataUrl;
  if (canvas) dataUrl = canvas.toDataURL('image/png');
  else if (img) dataUrl = img.src;
  else return;

  const link    = document.createElement('a');
  link.href     = dataUrl;
  link.download = 'SecureQR_' + Date.now() + '.png';
  link.click();
}

// ─────────────────────────────────────────
// READ / SCAN QR IMAGE
// ─────────────────────────────────────────
let scannedData = null;

function readQR(event) {
  const file    = event.target.files[0];
  const output  = document.getElementById('decoded-output');
  const label   = document.getElementById('upload-label');
  if (!file) return;

  label.textContent = '📎 ' + file.name;
  scannedData = null;
  output.innerHTML = '';

  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      const canvas  = document.createElement('canvas');
      canvas.width  = img.width;
      canvas.height = img.height;
      const ctx     = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code      = jsQR(imageData.data, canvas.width, canvas.height);

      if (code) {
        scannedData = code.data;
        output.innerHTML =
          '<div class="msg-scan-ok">✅ QR code scanned successfully. ' +
          'Enter the password below to decrypt.</div>';
      } else {
        output.innerHTML =
          '<div class="msg-error">❌ Could not read QR code. ' +
          'Try a larger or clearer image.</div>';
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ─────────────────────────────────────────
// DECODE QR
// ─────────────────────────────────────────
async function decodeQR() {
  const password = document.getElementById('val-password').value.trim();
  const output   = document.getElementById('decoded-output');

  if (!scannedData) {
    output.innerHTML =
      '<div class="msg-error">⚠ Please upload a QR code image first.</div>';
    return;
  }
  if (!password) {
    output.innerHTML =
      '<div class="msg-error">⚠ Please enter the decryption password.</div>';
    return;
  }

  output.innerHTML =
    '<p class="status-encrypting">🔓 Decrypting...</p>';

  try {
    const decrypted = await decryptMessage(scannedData, password);
    output.innerHTML = `
      <div class="msg-success">
        <strong>✅ Decrypted Message:</strong>
        ${escapeHtml(decrypted)}
        <br/>
        <button class="btn-copy" onclick="copyText('${escapeForAttr(decrypted)}', this)">
          📋 Copy to Clipboard
        </button>
      </div>`;
  } catch (err) {
    output.innerHTML =
      '<div class="msg-error">❌ Wrong password or corrupted QR code. ' +
      'Decryption failed.</div>';
  }
}

// ─────────────────────────────────────────
// COPY TO CLIPBOARD
// ─────────────────────────────────────────
function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '✅ Copied!';
    setTimeout(() => btn.textContent = '📋 Copy to Clipboard', 2000);
  });
}

// ─────────────────────────────────────────
// HELPERS: ESCAPE HTML
// ─────────────────────────────────────────
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeForAttr(str) {
  return str.replace(/'/g, "\\'").replace(/\n/g, ' ');
}