// Icon generator for the extension
// This script generates base64 SVG icons for the manifest

const iconSVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" fill="#4f46e5" rx="24"/>
  <circle cx="64" cy="35" r="12" fill="#fff"/>
  <rect x="45" y="55" width="38" height="8" rx="4" fill="#fff"/>
  <rect x="45" y="68" width="28" height="8" rx="4" fill="#fff"/>
  <path d="M 35 85 Q 35 80 40 80 L 88 80 Q 93 80 93 85 L 93 105 Q 93 110 88 110 L 40 110 Q 35 110 35 105 Z" fill="none" stroke="#fff" stroke-width="2"/>
</svg>
`;

// Write to files as data URIs
const fs = require("fs");
const path = require("path");

const sizes = [16, 48, 128];
sizes.forEach((size) => {
  const scaledSVG = iconSVG.replace(/viewBox="0 0 128 128"/, `viewBox="0 0 128 128" width="${size}" height="${size}"`);
  const base64 = Buffer.from(scaledSVG).toString("base64");
  const dataURI = `data:image/svg+xml;base64,${base64}`;
  console.log(`icon-${size}.png: ${dataURI}`);
});
