import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'

function readText(filePath) {
  return readFileSync(filePath, 'utf8').trim()
}

function resolveGitDir(rootDir) {
  const dotGitPath = path.join(rootDir, '.git')
  try {
    const gitPointer = readText(dotGitPath)
    const match = gitPointer.match(/^gitdir:\s*(.+)$/i)
    if (match) return path.resolve(rootDir, match[1])
  } catch {
    if (existsSync(dotGitPath)) return dotGitPath
  }
  return dotGitPath
}

function readGitMetadata(rootDir) {
  const gitDir = resolveGitDir(rootDir)
  try {
    const head = readText(path.join(gitDir, 'HEAD'))
    if (!head.startsWith('ref:')) {
      return {
        hash: head.slice(0, 10),
        branch: '',
      }
    }

    const ref = head.slice(5).trim()
    const refPath = path.join(gitDir, ref)
    const packedRefsPath = path.join(gitDir, 'packed-refs')
    const hash = existsSync(refPath)
      ? readText(refPath)
      : readText(packedRefsPath)
        .split('\n')
        .find(line => line.endsWith(` ${ref}`))
        ?.split(' ')[0]

    return {
      hash: (hash || 'DEV').slice(0, 7),
      branch: ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : '',
    }
  } catch {
    return {
      hash: 'DEV',
      branch: '',
    }
  }
}

function formatGmtMinus3(date) {
  const shifted = new Date(date.getTime() - 3 * 60 * 60 * 1000)
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  const hours = String(shifted.getUTCHours()).padStart(2, '0')
  const minutes = String(shifted.getUTCMinutes()).padStart(2, '0')
  const meridiem = shifted.getUTCHours() >= 12 ? 'PM' : 'AM'

  return `${year}-${month}-${day}T${hours}:${minutes} ${meridiem} ART`
}

const { hash: commitHash, branch: commitBranch } = readGitMetadata(process.cwd())
const buildTime = formatGmtMinus3(new Date())

export default defineConfig({
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __COMMIT_BRANCH__: JSON.stringify(commitBranch),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  server: {
    host: true,
    open: false
  },
  optimizeDeps: {
    entries: ['index.html']
  }
})
