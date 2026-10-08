import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { loadUserinfo } from '../utils/runtimeUserinfo.js'
import { beijingDay } from './schedule.js'

try {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('需要 Node.js 24 或更新版本')
  const day = beijingDay(new Date())
  const state = process.env.STATE_DIRECTORY || '/var/lib/kgm-checkin'
  const marker = `${state}/last-success`
  if (!process.argv.includes('--check') && existsSync(marker) && readFileSync(marker, 'utf8').trim() === day) {
    console.log('今日已成功，跳过重复执行')
  } else {
    loadUserinfo()
    const requireApi = createRequire(new URL('../api/package.json', import.meta.url))
    requireApi.resolve('express')
    if (process.argv.includes('--check')) {
      console.log('验证通过：Node 版本、登录信息格式及本地依赖；未调用签到接口')
    } else {
      const result = spawnSync(process.execPath, ['main.js'], { stdio: 'inherit', timeout: 25 * 60000 })
      if (result.error || result.status !== 0) throw new Error('签到子进程失败或超时')
      writeFileSync(`${marker}.tmp`, day + '\n', { mode: 0o600 })
      renameSync(`${marker}.tmp`, marker)
    }
  }
} catch (_) {
  console.error('VPS 签到或配置验证失败，请检查受限配置和脱敏日志')
  process.exitCode = 1
}
