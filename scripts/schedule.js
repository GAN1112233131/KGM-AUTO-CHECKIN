import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const beijingDay = time => new Date(new Date(time).getTime() + 8 * 3600000).toISOString().slice(0, 10)

export function latestSlot(now, cron) {
  const [minute, hour] = cron.split(' ').map(Number)
  if (!Number.isInteger(minute) || !Number.isInteger(hour)) throw new Error('计划时间格式错误')
  const slot = new Date(now)
  slot.setUTCHours(hour, minute, 0, 0)
  if (slot > new Date(now)) slot.setUTCDate(slot.getUTCDate() - 1)
  return slot
}

export function completedToday(jobs, now) {
  return jobs.some(job => job.steps?.some(step =>
    step.name === '执行签到' && step.conclusion === 'success' &&
    step.started_at && step.completed_at &&
    beijingDay(step.started_at) === beijingDay(now) && beijingDay(step.completed_at) === beijingDay(now)))
}

export async function githubGet(path, env = process.env) {
  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/${path}`, {
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`GitHub 查询失败，HTTP ${response.status}`)
  return response.json()
}

export async function hasCompletedToday(now, env = process.env, get = githubGet) {
  // 包含前一天创建、当天才开始的排队运行。检查实际签到步骤，跳过验证和空运行。
  const since = new Date(new Date(`${beijingDay(now)}T00:00:00+08:00`).getTime() - 86400000).toISOString()
  for (let page = 1; page <= 10; page++) {
    const data = await get(`actions/workflows/${encodeURIComponent('签到.yml')}/runs?per_page=100&page=${page}&created=${encodeURIComponent('>=' + since)}`, env)
    for (const run of data.workflow_runs) {
      if (String(run.id) === env.GITHUB_RUN_ID || run.head_branch !== 'main' || run.status !== 'completed') continue
      const { jobs } = await get(`actions/runs/${run.id}/jobs?per_page=100`, env)
      if (completedToday(jobs, now)) return true
    }
    if (data.workflow_runs.length < 100) return false
  }
  throw new Error('运行记录过多，无法安全确认今日签到状态')
}

export async function preflight() {
  const now = new Date()
  const cron = process.env.SCHEDULE_CRON
  let summary = `北京时间日期：${beijingDay(now)}\n\n`
  if (cron) {
    try {
      const run = await githubGet(`actions/runs/${process.env.GITHUB_RUN_ID}`)
      const created = new Date(run.created_at)
      const delay = Math.max(0, Math.floor((created - latestSlot(created, cron)) / 60000))
      const queue = Math.max(0, Math.floor((now - created) / 1000))
      summary += `计划（UTC）：${cron}\n\n触发延迟：约 ${delay} 分钟；创建运行至检查：${queue} 秒。\n\n`
      if (delay > 60) console.log(`::warning::GitHub 计划触发延迟约 ${delay} 分钟`)
    } catch (_) {
      summary += '暂时无法读取触发延迟。\n\n'
    }
  }
  let skip = false
  try {
    skip = await hasCompletedToday(now)
  } catch (_) {
    // 保持原计划可运行；补偿计划查询失败时停止，避免重复领取。
    if (process.env.VALIDATE_ONLY === 'true' || (cron && cron !== '10 17 * * *')) throw new Error('无法确认今日签到状态，验证或补偿执行已停止')
    console.log('::warning::无法查询今日签到状态，继续原计划或手动签到')
  }
  summary += skip ? '今日签到步骤已成功，跳过重复执行。\n' : '尚未确认今日成功，继续执行签到。\n'
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
  appendFileSync(process.env.GITHUB_OUTPUT, `skip=${skip}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  preflight().catch(() => { console.error('签到前检查失败，请查看运行摘要'); process.exitCode = 1 })
}
