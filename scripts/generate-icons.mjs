import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { Resvg } = require('@resvg/resvg-js');

// 1. Sleek, Modern, Eye-friendly Gradely Brand Icon SVG
// Combines dark luxurious squircle, glowing electric-cyan/royal-violet "G", and golden academic cap.
function createGradelySvg({ maskable = false } = {}) {
  const bgShape = maskable
    ? `<rect width="512" height="512" fill="url(#bgGrad)" />`
    : `<rect x="6" y="6" width="500" height="500" rx="115" ry="115" fill="url(#bgGrad)" stroke="url(#borderGrad)" stroke-width="4.5" />`;

  const scale = maskable ? 0.72 : 0.86;
  const translateX = maskable ? 71 : 36;
  const translateY = maskable ? 71 : 36;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Background Gradient: Deep Obsidian to Royal Navy -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0e172a" />
      <stop offset="50%" stop-color="#0a1120" />
      <stop offset="100%" stop-color="#050811" />
    </linearGradient>

    <!-- Subtle Premium Squircle Border Glow -->
    <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.75" />
      <stop offset="50%" stop-color="#818cf8" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#0284c7" stop-opacity="0.6" />
    </linearGradient>

    <!-- Ambient Center Radial Glow -->
    <radialGradient id="ambientGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#0284c7" stop-opacity="0.32" />
      <stop offset="60%" stop-color="#6366f1" stop-opacity="0.14" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>

    <!-- Emblem Letter "G" Vibrant Gradient -->
    <linearGradient id="gGrad" x1="15%" y1="10%" x2="90%" y2="90%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="40%" stop-color="#60a5fa" />
      <stop offset="85%" stop-color="#818cf8" />
      <stop offset="100%" stop-color="#a855f7" />
    </linearGradient>

    <!-- "G" Specular Highlight -->
    <linearGradient id="gHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.4" />
      <stop offset="40%" stop-color="#ffffff" stop-opacity="0" />
    </linearGradient>

    <!-- Graduation Cap Gold Gradients -->
    <linearGradient id="capGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fde047" />
      <stop offset="40%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>

    <linearGradient id="capUnder" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#b45309" />
      <stop offset="100%" stop-color="#78350f" />
    </linearGradient>

    <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.65" />
    </filter>

    <filter id="capShadow" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#000000" flood-opacity="0.55" />
    </filter>
  </defs>

  <!-- Background Base -->
  ${bgShape}

  <!-- Ambient Glow Behind Emblem -->
  <circle cx="256" cy="265" r="190" fill="url(#ambientGlow)" />

  <!-- Main Scaled Group -->
  <g transform="translate(${translateX}, ${translateY}) scale(${scale})" filter="url(#dropShadow)">
    
    <!-- Bold Modern "G" Geometry (Canvas: 500x500 relative) -->
    <path d="
      M 265 140 
      C 185 140, 125 200, 125 280 
      C 125 360, 185 420, 265 420 
      C 345 420, 385 365, 385 310 
      L 265 310 
      L 265 250 
      L 445 250 
      C 450 370, 375 470, 265 470 
      C 145 470, 65 380, 65 280 
      C 65 170, 150 90, 265 90 
      C 320 90, 370 110, 405 145 
      L 360 190 
      C 335 160, 300 140, 265 140 
      Z
    " fill="url(#gGrad)" />

    <!-- Subtle Inner Highlight Path on the "G" -->
    <path d="
      M 265 140 
      C 185 140, 125 200, 125 280 
      C 125 360, 185 420, 265 420 
      C 345 420, 385 365, 385 310 
      L 265 310 
      L 265 250 
      L 445 250 
      C 450 370, 375 470, 265 470 
      C 145 470, 65 380, 65 280 
      C 65 170, 150 90, 265 90 
      C 320 90, 370 110, 405 145 
      L 360 190 
      C 335 160, 300 140, 265 140 
      Z
    " fill="url(#gHighlight)" opacity="0.45" />

    <!-- Academic Graduation Cap Tilted on Upper-Left of the "G" -->
    <g transform="translate(75, 48) rotate(-14)" filter="url(#capShadow)">
      <!-- Cap Skull Cap Underbody -->
      <path d="M 60 78 L 60 118 C 60 138, 200 138, 200 118 L 200 78 Z" fill="url(#capUnder)" />
      
      <!-- Cap Diamond Mortarboard Top -->
      <polygon points="130,20 240,65 130,110 20,65" fill="url(#capGold)" stroke="#fef08a" stroke-width="3" />
      
      <!-- Top Center Button -->
      <ellipse cx="130" cy="65" rx="10" ry="7" fill="#fef3c7" />

      <!-- Golden Tassel String -->
      <path d="M 130 65 Q 50 88 40 128" stroke="#fde047" stroke-width="4.5" fill="none" stroke-linecap="round" />
      
      <!-- Hanging Tassel Fringe -->
      <circle cx="40" cy="132" r="7.5" fill="#f59e0b" stroke="#fef08a" stroke-width="2" />
      <polygon points="36,136 44,136 47,156 33,156" fill="url(#capGold)" />
    </g>

    <!-- Subtle Academic Star Accent -->
    <g transform="translate(415, 105) scale(0.65)" opacity="0.9">
      <path d="M 25 0 L 31 16 L 47 18 L 35 29 L 38 45 L 25 36 L 12 45 L 15 29 L 3 18 L 19 16 Z" fill="#38bdf8" />
    </g>
  </g>
</svg>`;
}

async function generateAllIcons() {
  console.log('[1/4] Generating SVG icons...');
  const publicDir = path.resolve('frontend/public');

  const standardSvg = createGradelySvg({ maskable: false });
  const maskableSvg = createGradelySvg({ maskable: true });

  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), standardSvg);
  console.log('✓ Wrote frontend/public/favicon.svg');

  console.log('[2/4] Rendering PNG raster icons via Resvg...');

  // 192x192
  const resvg192 = new Resvg(standardSvg, { fitTo: { mode: 'width', value: 192 } });
  const png192 = resvg192.render().asPng();
  fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), png192);
  console.log('✓ Wrote frontend/public/pwa-192x192.png (192x192)');

  // 512x512 standard
  const resvg512 = new Resvg(standardSvg, { fitTo: { mode: 'width', value: 512 } });
  const png512 = resvg512.render().asPng();
  fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), png512);
  fs.writeFileSync(path.join(publicDir, 'gradely_logo.png'), png512);
  console.log('✓ Wrote frontend/public/pwa-512x512.png and gradely_logo.png (512x512)');

  // 512x512 maskable (safe zone for Android squircle / circle cutouts)
  const resvgMaskable = new Resvg(maskableSvg, { fitTo: { mode: 'width', value: 512 } });
  const pngMaskable = resvgMaskable.render().asPng();
  fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), pngMaskable);
  console.log('✓ Wrote frontend/public/pwa-maskable-512x512.png (512x512)');

  // 180x180 apple touch icon
  const resvgApple = new Resvg(standardSvg, { fitTo: { mode: 'width', value: 180 } });
  const pngApple = resvgApple.render().asPng();
  fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), pngApple);
  console.log('✓ Wrote frontend/public/apple-touch-icon.png (180x180)');

  console.log('🎉 [SUCCESS] All PWA icons generated with high definition!');
}

generateAllIcons();
