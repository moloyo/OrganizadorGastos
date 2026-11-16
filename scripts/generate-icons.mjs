import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = dirname(fileURLToPath(import.meta.url))
const outputDir = join(root, '..', 'public', 'icons')

function svg({ rounded, padding }) {
  const bg = rounded
    ? '<rect width="512" height="512" rx="112" fill="#2F6A4F"/>'
    : '<rect width="512" height="512" fill="#2F6A4F"/>'
  const scale = padding ? 0.76 : 1
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    ${bg}
    <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
      <rect x="112" y="150" width="288" height="212" rx="28" fill="#FAF6EF" opacity="0.14"/>
      <circle cx="256" cy="256" r="108" fill="#FAF6EF"/>
      <g stroke="#23503C" stroke-width="16" stroke-linecap="round" fill="none">
        <path d="M300 212c-16-20-60-16-60 12s60 28 60 56-44 32-60 12"/>
        <path d="M256 188v136"/>
      </g>
    </g>
  </svg>`)
}

const targets = [
  { name: 'icon-512.png', size: 512, rounded: true, padding: false },
  { name: 'icon-192.png', size: 192, rounded: true, padding: false },
  { name: 'maskable-512.png', size: 512, rounded: false, padding: true },
  { name: 'apple-touch-icon.png', size: 180, rounded: false, padding: true },
]

await mkdir(outputDir, { recursive: true })

for (const target of targets) {
  const input = svg({ rounded: target.rounded, padding: target.padding })
  await sharp(input).resize(target.size, target.size).png().toFile(join(outputDir, target.name))
  console.log(`✓ public/icons/${target.name}`)
}
