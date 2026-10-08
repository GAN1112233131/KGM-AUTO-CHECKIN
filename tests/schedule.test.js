import test from 'node:test'
import assert from 'node:assert/strict'
import { beijingDay, latestSlot, completedToday, hasCompletedToday, preflight } from '../scripts/schedule.js'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const now = new Date('2026-10-07T21:57:27Z')
const step = {name:'执行签到',conclusion:'success',started_at:'2026-10-07T21:57:33Z',completed_at:'2026-10-07T22:01:13Z'}
test('北京时间跨日与 10 月 8 日真实延迟', () => {
  assert.equal(beijingDay(now), '2026-10-08')
  assert.equal(latestSlot(now, '10 17 * * *').toISOString(), '2026-10-07T17:10:00.000Z')
  assert.equal(Math.floor((now-latestSlot(now,'10 17 * * *'))/60000), 287)
})
test('只认同一天真实成功的签到步骤，验证/跳过/失败不算', () => {
  assert.equal(completedToday([{steps:[step]}], now), true)
  for (const changed of [{name:'无凭证验证'},{conclusion:'skipped'},{conclusion:'failure'},{completed_at:'2026-10-08T16:00:00Z'}]) {
    assert.equal(completedToday([{steps:[{...step,...changed}]}], now), false)
  }
})
test('原计划尚未完成，补偿计划可以执行', async () => {
  const get = async () => ({workflow_runs:[{id:1,status:'in_progress',head_branch:'main'}]})
  assert.equal(await hasCompletedToday(now, {}, get), false)
})
test('忽略当前运行、测试分支和验证空运行，识别当天成功', async () => {
  const get = async path => path.includes('/jobs') ? {jobs:[{steps:[step]}]} : {workflow_runs:[
    {id:1,status:'completed',head_branch:'main'}, {id:2,status:'completed',head_branch:'test'}, {id:3,status:'completed',head_branch:'main'},
  ]}
  assert.equal(await hasCompletedToday(now,{GITHUB_RUN_ID:'1'}, get), true)
})
test('列表翻页且 API 失败不伪装为今日成功', async () => {
  const get = async path => path.includes('page=1&') ? {workflow_runs:Array.from({length:100},(_,id)=>({id,status:'in_progress'}))} : {workflow_runs:[]}
  assert.equal(await hasCompletedToday(now,{},get), false)
  await assert.rejects(hasCompletedToday(now,{},async()=>{throw new Error('HTTP 403')}))
})
test('API 故障不阻断原计划，但阻止不确定的补偿和验证', async () => {
  const dir = mkdtempSync(join(tmpdir(),'kgm-schedule-test-'))
  const originalFetch = globalThis.fetch
  const keys = ['SCHEDULE_CRON','VALIDATE_ONLY','GITHUB_OUTPUT','GITHUB_STEP_SUMMARY']
  const saved = keys.map(key => process.env[key])
  globalThis.fetch = async () => ({ok:false,status:503})
  try {
    process.env.GITHUB_OUTPUT = join(dir,'output')
    process.env.GITHUB_STEP_SUMMARY = join(dir,'summary')
    process.env.SCHEDULE_CRON = '10 17 * * *'
    process.env.VALIDATE_ONLY = 'false'
    await preflight()
    assert.match(readFileSync(process.env.GITHUB_OUTPUT,'utf8'),/skip=false/)
    process.env.SCHEDULE_CRON = '37 19 * * *'
    await assert.rejects(preflight(), /已停止/)
    process.env.SCHEDULE_CRON = ''
    process.env.VALIDATE_ONLY = 'true'
    await assert.rejects(preflight(), /已停止/)
  } finally {
    globalThis.fetch = originalFetch
    keys.forEach((key,i) => saved[i] === undefined ? delete process.env[key] : process.env[key] = saved[i])
    rmSync(dir,{recursive:true,force:true})
  }
})
