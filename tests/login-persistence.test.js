import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

test('自动保存失败时登录任务返回非零，日志不含登录凭证', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { saveUserinfo } from './utils/userinfo.js'
    saveUserinfo([{userid: '123', token: 'synthetic-login-token'}])
  `], {
    cwd: new URL('../', import.meta.url),
    env: {...process.env, PAT: 'synthetic-pat', GH_TOKEN: '', GITHUB_REPOSITORY: '', ALLOW_PRINT_USERINFO: '否'},
    encoding: 'utf8',
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /USERINFO 未更新/)
  assert.doesNotMatch(result.stdout + result.stderr, /synthetic-login-token/)
})
