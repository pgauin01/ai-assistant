const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const rootDir = path.resolve(__dirname, '..')
const backendDir = path.join(rootDir, 'assistant-backend')
const resourcesDir = path.join(rootDir, 'resources')
const specPath = path.join(backendDir, 'WindowsAudioDeviceHost.spec')
const legacyOnedirDir = path.join(backendDir, 'dist', 'WindowsAudioDeviceHost')
const distExePath = path.join(backendDir, 'dist', 'WindowsAudioDeviceHost.exe')
const resourcesExePath = path.join(resourcesDir, 'WindowsAudioDeviceHost.exe')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    ...options
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function resolvePython() {
  const venvPython = path.join(backendDir, 'venv', 'Scripts', 'python.exe')
  if (fs.existsSync(venvPython)) {
    return venvPython
  }
  return 'python'
}

function ensureExists(filePath, name) {
  if (!fs.existsSync(filePath)) {
    console.error(`${name} not found: ${filePath}`)
    process.exit(1)
  }
}

ensureExists(backendDir, 'Backend directory')
ensureExists(specPath, 'PyInstaller spec')

const python = resolvePython()
console.log(`Using Python: ${python}`)
console.log('Building standalone backend exe with PyInstaller...')

if (fs.existsSync(legacyOnedirDir)) {
  fs.rmSync(legacyOnedirDir, { recursive: true, force: true })
}

run(python, ['-m', 'PyInstaller', '--noconfirm', '--clean', specPath], { cwd: backendDir })

ensureExists(distExePath, 'Built backend exe')
fs.mkdirSync(resourcesDir, { recursive: true })
fs.copyFileSync(distExePath, resourcesExePath)

console.log(`Copied backend exe to: ${resourcesExePath}`)
