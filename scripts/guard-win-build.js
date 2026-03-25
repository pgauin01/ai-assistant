const { spawnSync } = require('child_process')

if (process.platform !== 'win32') {
  console.log('Windows process guard skipped (non-Windows platform).')
  process.exit(0)
}

const targets = ['NVIDIA Container.exe']

function run(command, args) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    shell: false
  })
}

function isRunning(imageName) {
  const result = run('tasklist', ['/FI', `IMAGENAME eq ${imageName}`])
  if (result.error) {
    throw result.error
  }

  const output = `${result.stdout || ''}\n${result.stderr || ''}`.toLowerCase()
  return output.includes(imageName.toLowerCase())
}

function killIfRunning(imageName) {
  if (!isRunning(imageName)) {
    console.log(`[guard] ${imageName} is not running.`)
    return
  }

  console.log(`[guard] Stopping ${imageName}...`)
  const killResult = run('taskkill', ['/IM', imageName, '/F', '/T'])
  if (killResult.error) {
    throw killResult.error
  }

  // taskkill returns non-zero when the process vanishes between checks.
  if (killResult.status !== 0) {
    const combined = `${killResult.stdout || ''}\n${killResult.stderr || ''}`.toLowerCase()
    const noMatch =
      combined.includes('not found') ||
      combined.includes('no running instance') ||
      combined.includes('cannot find the process')

    if (!noMatch) {
      throw new Error(
        `[guard] Failed to stop ${imageName}.\n${killResult.stdout || ''}\n${killResult.stderr || ''}`
      )
    }
  }

  console.log(`[guard] ${imageName} stopped.`)
}

try {
  for (const target of targets) {
    killIfRunning(target)
  }
  console.log('[guard] Windows prebuild process check complete.')
} catch (error) {
  console.error('[guard] Prebuild guard failed:', error)
  process.exit(1)
}
