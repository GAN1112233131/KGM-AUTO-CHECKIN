import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('..', import.meta.url))
const users = [{userid:'111',token:'fake-original-token'}]
function run(scenario, extra = {}) {
  const result = spawnSync(process.execPath, ['tests/fixtures/main-scenario.js'], {
    cwd, encoding: 'utf8', env: {...process.env, USERINFO_FILE:'', USERINFO: JSON.stringify(users), TEST_SCENARIO:scenario, TZ:'Asia/Shanghai', ...extra},
  })
  assert.equal(result.error, undefined)
  const data = JSON.parse(result.stdout.trim().split('\n').at(-1))
  assert.ok(!result.stdout.includes('fake-original-token'))
  assert.ok(!result.stdout.includes('fake-refreshed-token'))
  return {result, data}
}

test('8 次成功领取、服务清理以及北京时间不重复加时差', () => {
  const {result, data} = run('success')
  assert.equal(result.status, 0)
  assert.equal(data.calls, 8)
  assert.equal(data.closed, 1)
  assert.equal(data.notify.title, '酷狗签到成功 2026-10-11')
  assert.match(data.notify.content, /成功: 1.*失败: 0/)
})
test('今日已领取与次数已用光是成功状态', () => {
  const {result, data} = run('claimed')
  assert.equal(result.status, 0)
  assert.match(data.notify.content, /成功: 1.*失败: 0/)
})
test('领取部分失败仍发送异常通知并返回非零', () => {
  const {result, data} = run('partial')
  assert.equal(result.status, 1)
  assert.equal(data.calls, 2)
  assert.match(data.notify.title, /异常/)
})
test('单账号过期不阻断其余账号', () => {
  const {result, data} = run('mixed', {USERINFO:JSON.stringify([...users, {userid:'222',token:'fake-other-token'}])})
  assert.equal(result.status, 1)
  assert.equal(data.calls, 8)
  assert.match(data.notify.content, /成功: 1.*失败: 1/)
})
test('本地 API 启动失败清理进程并返回非零', () => {
  const {result, data} = run('startup')
  assert.equal(result.status, 1)
  assert.equal(data.calls, 0)
  assert.equal(data.closed, 1)
})
test('Secret 写入失败发送异常通知并返回非零', () => {
  const {result, data} = run('secretfail')
  assert.equal(result.status, 1)
  assert.match(data.notify.title, /异常/)
})
test('VPS 周日刷新令牌原子保存，权限受限', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kgm-test-'))
  try {
    const file = join(dir, 'userinfo.json')
    writeFileSync(file, JSON.stringify(users), {mode:0o600})
    const {result} = run('success', {USERINFO:'',USERINFO_FILE:file})
    assert.equal(result.status, 0)
    assert.equal(JSON.parse(readFileSync(file, 'utf8'))[0].token, 'fake-refreshed-token')
    if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600)
  } finally { rmSync(dir, {recursive:true,force:true}) }
})
test('空数组、非法 JSON 和不完整账号在启动前失败且不打印凭证', () => {
  for (const userinfo of ['[]', '{"token":"fake-secret-value"', '[{"userid":"111"}]']) {
    const result = spawnSync(process.execPath, ['main.js'], {cwd,encoding:'utf8',env:{...process.env,USERINFO_FILE:'',USERINFO:userinfo}})
    assert.equal(result.status, 1)
    assert.ok(!result.stderr.includes('fake-secret-value'))
    assert.match(result.stderr, /签到失败/)
  }
})
