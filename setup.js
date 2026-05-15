#!/usr/bin/env node
const { execSync } = require('child_process')
const { existsSync, readFileSync } = require('fs')
const { resolve } = require('path')

const ROOT = __dirname
const SEP = '-'.repeat(50)

function step(label) {
  console.log(`\n  ${SEP}`)
  console.log(`  ${label}`)
  console.log(`  ${SEP}\n`)
}

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}\n`)
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts })
}

function checkNodeVersion() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major < 18) {
    console.error(`  Node.js >= 18 required, got ${process.version}`)
    process.exit(1)
  }
  console.log(`  Node.js ${process.version} — OK`)
}

function checkPlatform() {
  const platform = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[process.platform] || process.platform
  console.log(`  Platform: ${platform}`)
}

function linkGlobal() {
  if (process.platform === 'win32') {
    // On Windows, npm link can be finicky; suggest the user adds the path manually
    const distPath = resolve(ROOT, 'dist')
    console.log(`\n  To use 'homectl' globally, run:`)
    console.log(`    npm link`)
    console.log(`  Or add this directory to your PATH:`)
    console.log(`    ${distPath}`)
  } else {
    run('npm link')
  }
}

// --- Main ---
console.log(`\n  ${'='.repeat(50)}`)
console.log(`  homectl setup`)
console.log(`  ${'='.repeat(50)}\n`)

checkNodeVersion()
checkPlatform()

// 1. Install dependencies
step('1/3 — Installing dependencies')
run('npm install')

// 2. Build
step('2/3 — Building')
run('npm run build')

// 3. Link
step('3/3 — Installing globally')
linkGlobal()

console.log(`\n  ${'='.repeat(50)}`)
console.log(`  Setup complete!`)
console.log(`  ${'='.repeat(50)}`)
console.log(`\n  Quick start:`)
console.log(`    homectl init`)
console.log(`    homectl host ls`)
console.log(`    homectl --help\n`)
