import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const output = 'dist-demo'
const files = (await readdir(output, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name !== 'sw.js')
  .map((entry) => path.relative(output, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
  .sort()
const worker = await readFile('scripts/service-worker.js', 'utf8')
const hash = createHash('sha256').update(worker)
for (const file of files) {
  hash.update(file).update(await readFile(path.join(output, file)))
}
const version = hash.digest('hex').slice(0, 16)
await writeFile(path.join(output, 'sw.js'),
  `const BUILD_VERSION = ${JSON.stringify(version)};\nconst BUILD_FILES = ${JSON.stringify(files)};\n${worker}`)
