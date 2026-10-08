import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'kgm-vps-test-'))
  for (const folder of ['scripts','utils','api/node_modules/express','state']) mkdirSync(join(dir,folder),{recursive:true})
  for (const file of ['scripts/run-vps.js','scripts/schedule.js','utils/runtimeUserinfo.js','utils/safeLog.js']) copyFileSync(new URL(`../${file}`,import.meta.url),join(dir,file))
  writeFileSync(join(dir,'package.json'),'{"type":"module"}')
  writeFileSync(join(dir,'api/package.json'),'{}')
  writeFileSync(join(dir,'api/node_modules/express/index.js'),'')
  writeFileSync(join(dir,'main.js'),"import { writeFileSync } from 'node:fs'; writeFileSync('called', 'yes'); process.exit(Number(process.env.FAKE_RESULT || 0))")
  const run = (args = [], extra = {}) => spawnSync(process.execPath,['scripts/run-vps.js',...args], {
    cwd:dir, encoding:'utf8',env:{...process.env,STATE_DIRECTORY:join(dir,'state'),USERINFO_FILE:'',USERINFO:'[{"userid":"111","token":"fake-token"}]',...extra},
  })
  return {dir,run}
}
test('VPS 验证模式不启动签到、成功标记阻止重复、失败不标记', () => {
  const {dir,run} = fixture()
  try {
    assert.equal(run(['--check']).status,0)
    assert.equal(existsSync(join(dir,'called')),false)
    assert.equal(existsSync(join(dir,'state/last-success')),false)
    assert.equal(run([],{FAKE_RESULT:'1'}).status,1)
    assert.equal(existsSync(join(dir,'state/last-success')),false)
    assert.equal(run().status,0)
    assert.equal(existsSync(join(dir,'state/last-success')),true)
    writeFileSync(join(dir,'called'),'unchanged')
    assert.equal(run().status,0)
    assert.equal(readFileSync(join(dir,'called'),'utf8'),'unchanged')
  } finally {rmSync(dir,{recursive:true,force:true})}
})
