import test from 'node:test'
import assert from 'node:assert/strict'
import { sendNotify } from '../utils/notify.js'
import { sanitizeForLog, registerSensitiveValues } from '../utils/safeLog.js'

test('无渠道配置显式返回未配置', async () => {
  assert.deepEqual(await sendNotify('test','test'),{configured:0,success:0,fail:0})
})
test('推送业务失败可被检测，网络请求有超时', async () => {
  process.env.DINGTALK_BOT_KEY = 'fake-notification-key'
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    assert.ok(options.signal instanceof AbortSignal)
    return {ok:true,json:async()=>({errcode:310000,errmsg:'invalid fake-notification-key'})}
  }
  try { assert.deepEqual(await sendNotify('test','test'),{configured:1,success:0,fail:1}) }
  finally { globalThis.fetch = originalFetch; delete process.env.DINGTALK_BOT_KEY }
})
test('已知凭证在异常字符串与嵌套对象中被隐藏', () => {
  registerSensitiveValues(['fake-account-token'])
  assert.equal(sanitizeForLog('request failed: fake-account-token'), 'request failed: [REDACTED]')
  assert.deepEqual(sanitizeForLog({token:'fake-account-token'}),{token:'[REDACTED]'})
})
