import { readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { registerSensitiveValues } from './safeLog.js'

function loadUserinfo() {
  let users
  try {
    const raw = process.env.USERINFO || (process.env.USERINFO_FILE && readFileSync(process.env.USERINFO_FILE, 'utf8'))
    users = JSON.parse(raw)
  } catch (_) {
    throw new Error('USERINFO 未配置或格式错误')
  }
  if (!Array.isArray(users) || users.length === 0 || users.some(user =>
    !user || !['string', 'number'].includes(typeof user.userid) || !String(user.userid).trim() ||
    typeof user.token !== 'string' || !user.token.trim())) {
    throw new Error('USERINFO 必须是包含 userid 和 token 的非空数组')
  }
  registerSensitiveValues(users.map(user => user.token))
  return users
}

function saveUserinfoFile(users) {
  const path = process.env.USERINFO_FILE
  if (!path) return
  const temporary = `${path}.${process.pid}.tmp`
  try {
    writeFileSync(temporary, JSON.stringify(users), { mode: 0o600, flag: 'wx' })
    renameSync(temporary, path)
  } finally {
    rmSync(temporary, { force: true })
  }
}

export { loadUserinfo, saveUserinfoFile }
