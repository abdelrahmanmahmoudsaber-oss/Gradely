import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

// 1. Maskable Icon SVG (512x512, Full bleed background, safe zone centered)
// Used by Android launcher for the home screen icon. Edge-to-edge luxury background.
const createMaskableSvg = () => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="mBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="45%" stop-color="#0b1325" />
      <stop offset="100%" stop-color="#070b14" />
    </linearGradient>
    <radialGradient id="mGlow" cx="50%" cy="50%" r="48%">
      <stop offset="0%" stop-color="#0284c7" stop-opacity="0.45" />
      <stop offset="45%" stop-color="#6366f1" stop-opacity="0.22" />
      <stop offset="100%" stop-color="#070b14" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="mGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="40%" stop-color="#60a5fa" />
      <stop offset="80%" stop-color="#818cf8" />
      <stop offset="100%" stop-color="#a855f7" />
    </linearGradient>
    <linearGradient id="mHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.45" />
      <stop offset="50%" stop-color="#ffffff" stop-opacity="0" />
    </linearGradient>
    <linearGradient id="mCapGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="40%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>
    <linearGradient id="mCapUnder" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#b45309" />
      <stop offset="100%" stop-color="#78350f" />
    </linearGradient>
    <filter id="mDrop" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#000000" flood-opacity="0.9" />
    </filter>
  </defs>

  <!-- Full Bleed Edge-to-Edge Background for Android Adaptive Launcher -->
  <rect width="512" height="512" fill="url(#mBg)" />
  <circle cx="256" cy="256" r="230" fill="url(#mGlow)" />

  <!-- Centered Emblem inside the 80% Safe Zone (r=204.8px) -->
  <g transform="translate(256, 256) scale(3.4) translate(-50, -56)" filter="url(#mDrop)">
    <path d="M 52 28 C 36 28 24 40 24 56 C 24 72 36 84 52 84 C 68 84 76 73 76 62 L 52 62 L 52 50 L 88 50 C 89 74 74 94 52 94 C 28 94 12 76 12 56 C 12 34 29 18 52 18 C 63 18 73 22 80 29 L 71 38 C 66 32 59 28 52 28 Z" fill="url(#mGrad)" />
    <path d="M 52 18 C 63 18 73 22 80 29 L 71 38 C 66 32 59 28 52 28 C 36 28 24 40 24 56 C 24 58 24.2 60 24.5 62 C 24.2 60 24 58 24 56 C 24 34 29 18 52 18 Z" fill="url(#mHighlight)" />
    <g transform="translate(18, 10) rotate(-16) scale(0.92)">
      <polygon points="26,4 48,13 26,22 4,13" fill="url(#mCapGold)" stroke="#fef9c3" stroke-width="1.3" />
      <path d="M 12 16 L 12 24 C 12 28 40 28 40 24 L 40 16 Z" fill="url(#mCapUnder)" />
      <circle cx="26" cy="13" r="2.4" fill="#fef08a" />
      <path d="M 26 13 Q 10 18 8 26" stroke="#fde047" stroke-width="1.8" fill="none" stroke-linecap="round" />
      <circle cx="8" cy="27" r="2.2" fill="#f59e0b" />
    </g>
  </g>
</svg>`;

// 2. Splash / Pure Emblem SVG (512x512, Transparent background, no enclosing card/box)
// Used by Android WebAPK splash screen on top of background_color #070b14.
// Because it has NO enclosing box, Android shows only the glowing logo seamlessly!
const createSplashSvg = () => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="spGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.55" />
      <stop offset="45%" stop-color="#6366f1" stop-opacity="0.3" />
      <stop offset="75%" stop-color="#070b14" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="spGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="40%" stop-color="#60a5fa" />
      <stop offset="80%" stop-color="#818cf8" />
      <stop offset="100%" stop-color="#a855f7" />
    </linearGradient>
    <linearGradient id="spHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.5" />
      <stop offset="50%" stop-color="#ffffff" stop-opacity="0" />
    </linearGradient>
    <linearGradient id="spCapGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="40%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>
    <linearGradient id="spCapUnder" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#b45309" />
      <stop offset="100%" stop-color="#78350f" />
    </linearGradient>
    <filter id="spDrop" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="16" stdDeviation="22" flood-color="#000000" flood-opacity="0.8" />
    </filter>
  </defs>

  <!-- Glowing Aura directly behind emblem -->
  <circle cx="256" cy="256" r="210" fill="url(#spGlow)" />

  <!-- Pure Glowing Centered Emblem -->
  <g transform="translate(256, 256) scale(3.5) translate(-50, -56)" filter="url(#spDrop)">
    <path d="M 52 28 C 36 28 24 40 24 56 C 24 72 36 84 52 84 C 68 84 76 73 76 62 L 52 62 L 52 50 L 88 50 C 89 74 74 94 52 94 C 28 94 12 76 12 56 C 12 34 29 18 52 18 C 63 18 73 22 80 29 L 71 38 C 66 32 59 28 52 28 Z" fill="url(#spGrad)" />
    <path d="M 52 18 C 63 18 73 22 80 29 L 71 38 C 66 32 59 28 52 28 C 36 28 24 40 24 56 C 24 58 24.2 60 24.5 62 C 24.2 60 24 58 24 56 C 24 34 29 18 52 18 Z" fill="url(#spHighlight)" />
    <g transform="translate(18, 10) rotate(-16) scale(0.92)">
      <polygon points="26,4 48,13 26,22 4,13" fill="url(#spCapGold)" stroke="#fef9c3" stroke-width="1.3" />
      <path d="M 12 16 L 12 24 C 12 28 40 28 40 24 L 40 16 Z" fill="url(#spCapUnder)" />
      <circle cx="26" cy="13" r="2.4" fill="#fef08a" />
      <path d="M 26 13 Q 10 18 8 26" stroke="#fde047" stroke-width="1.8" fill="none" stroke-linecap="round" />
      <circle cx="8" cy="27" r="2.2" fill="#f59e0b" />
    </g>
  </g>
</svg>`;

// 3. Apple Touch Icon / Squircle Icon (180x180, elegant rounded base for iOS and favicon)
const createSquircleSvg = () => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="sqBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="45%" stop-color="#0b1325" />
      <stop offset="100%" stop-color="#070b14" />
    </linearGradient>
    <linearGradient id="sqBorder" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.8" />
      <stop offset="50%" stop-color="#818cf8" stop-opacity="0.4" />
      <stop offset="100%" stop-color="#0284c7" stop-opacity="0.7" />
    </linearGradient>
    <radialGradient id="sqGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#0284c7" stop-opacity="0.4" />
      <stop offset="50%" stop-color="#6366f1" stop-opacity="0.2" />
      <stop offset="100%" stop-color="#070b14" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="sqGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="40%" stop-color="#60a5fa" />
      <stop offset="80%" stop-color="#818cf8" />
      <stop offset="100%" stop-color="#a855f7" />
    </linearGradient>
    <linearGradient id="sqCapGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="40%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>
    <linearGradient id="sqCapUnder" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#b45309" />
      <stop offset="100%" stop-color="#78350f" />
    </linearGradient>
    <filter id="sqDrop" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="16" stdDeviation="22" flood-color="#000000" flood-opacity="0.9" />
    </filter>
  </defs>

  <rect x="8" y="8" width="496" height="496" rx="112" ry="112" fill="url(#sqBg)" stroke="url(#sqBorder)" stroke-width="4" />
  <circle cx="256" cy="256" r="210" fill="url(#sqGlow)" />

  <g transform="translate(256, 256) scale(3.5) translate(-50, -56)" filter="url(#sqDrop)">
    <path d="M 52 28 C 36 28 24 40 24 56 C 24 72 36 84 52 84 C 68 84 76 73 76 62 L 52 62 L 52 50 L 88 50 C 89 74 74 94 52 94 C 28 94 12 76 12 56 C 12 34 29 18 52 18 C 63 18 73 22 80 29 L 71 38 C 66 32 59 28 52 28 Z" fill="url(#sqGrad)" />
    <g transform="translate(18, 10) rotate(-16) scale(0.92)">
      <polygon points="26,4 48,13 26,22 4,13" fill="url(#sqCapGold)" stroke="#fef9c3" stroke-width="1.3" />
      <path d="M 12 16 L 12 24 C 12 28 40 28 40 24 L 40 16 Z" fill="url(#sqCapUnder)" />
      <circle cx="26" cy="13" r="2.4" fill="#fef08a" />
      <path d="M 26 13 Q 10 18 8 26" stroke="#fde047" stroke-width="1.8" fill="none" stroke-linecap="round" />
      <circle cx="8" cy="27" r="2.2" fill="#f59e0b" />
    </g>
  </g>
</svg>`;

// Generate HTML render wrappers to screenshot cleanly via Headless Edge
function renderSvgToPng(svgContent, outputPath, size) {
  const tempHtml = path.join(__dirname, `_temp_${size}.html`);
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${size}px;
      height: ${size}px;
      overflow: hidden;
      background: transparent;
    }
    svg {
      width: ${size}px;
      height: ${size}px;
      display: block;
    }
  </style>
</head>
<body>
  ${svgContent}
</body>
</html>`;

  fs.writeFileSync(tempHtml, html);
  const cmd = `"${EDGE_PATH}" --headless --disable-gpu --hide-scrollbars --window-size=${size},${size} --screenshot="${outputPath}" "file://${tempHtml.replace(/\\/g, '/')}"`;
  execSync(cmd);
  try { fs.unlinkSync(tempHtml); } catch(e) {}
  console.log(`Generated: ${outputPath} (${size}x${size})`);
}

const publicDir = path.join(__dirname, 'frontend', 'public');

const maskableSvg = createMaskableSvg();
const splashSvg = createSplashSvg();
const squircleSvg = createSquircleSvg();

// 1. favicon.svg: squircle with subtle border
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), squircleSvg);
console.log('Saved updated favicon.svg');

// 2. pwa-maskable-512x512.png: Full-bleed for Android home screen launcher adaptive icon
renderSvgToPng(maskableSvg, path.join(publicDir, 'pwa-maskable-512x512.png'), 512);

// 3. pwa-512x512.png & pwa-192x192.png: Pure glowing emblem on transparent for seamless Android splash screen!
renderSvgToPng(splashSvg, path.join(publicDir, 'pwa-512x512.png'), 512);
renderSvgToPng(splashSvg, path.join(publicDir, 'pwa-192x192.png'), 192);

// 4. apple-touch-icon.png: Full bleed / squircle for iOS
renderSvgToPng(maskableSvg, path.join(publicDir, 'apple-touch-icon.png'), 180);

// 5. gradely_logo.png
renderSvgToPng(squircleSvg, path.join(publicDir, 'gradely_logo.png'), 512);

console.log('All icons generated and aligned successfully!');
