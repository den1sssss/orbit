#!/usr/bin/env node
// Build Orbit and publish dist/ to the gh-pages branch of a GitHub repo.
//
//   npm run deploy                      # uses the repo in ORBIT_REPO or "<your-gh-user>/orbit"
//   ORBIT_REPO=me/orbit npm run deploy
//
// Only the built app is published. Your data never leaves your devices.
import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts })
const read = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim()

const repo = process.env.ORBIT_REPO || `${read('gh api user --jq .login')}/orbit`

console.log(`\n▸ Building Orbit…`)
run('npm run build')
if (!existsSync('dist/index.html')) throw new Error('Build output missing')

// Publish from a throwaway git repo so the project's own git state is untouched.
const tmp = mkdtempSync(join(tmpdir(), 'orbit-pages-'))
try {
  cpSync('dist', tmp, { recursive: true })
  writeFileSync(join(tmp, '.nojekyll'), '') // serve files starting with "_" as-is
  run('git init -q -b gh-pages', { cwd: tmp })
  run('git add -A', { cwd: tmp })
  run(`git -c user.name="Orbit deploy" -c user.email="deploy@orbit.local" commit -q -m "Deploy ${new Date().toISOString()}"`, { cwd: tmp })
  console.log(`▸ Publishing to ${repo} (gh-pages)…`)
  run('gh auth setup-git >/dev/null 2>&1 || true', { cwd: tmp })
  run(`git push -q -f https://github.com/${repo}.git gh-pages`, { cwd: tmp })
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

const [owner, name] = repo.split('/')
console.log(`\n✓ Deployed. Open on your iPhone in Safari: https://${owner}.github.io/${name}/`)
console.log('  (GitHub can take a minute to update. The installed app picks up the new version on next launch.)\n')
