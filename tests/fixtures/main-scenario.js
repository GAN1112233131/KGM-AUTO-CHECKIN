import { registerHooks } from 'node:module'
const RealDate = Date
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : ['2026-10-10T17:20:00Z'])) }
  static now() { return new RealDate('2026-10-10T17:20:00Z').getTime() }
}
globalThis.testCalls = 0
globalThis.testClosed = 0
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('/utils/utils.js')) return { format: 'module', shortCircuit: true, source: `
      export const delay = async () => {};
      export const startService = () => ({});
      export const close_api = () => { globalThis.testClosed++; };
      export const waitForApi = async () => { if (process.env.TEST_SCENARIO === 'startup') throw new Error('not ready'); };
      export const send = async (path, method, headers) => {
        const s = process.env.TEST_SCENARIO;
        if (path.startsWith('/user/detail')) return s === 'mixed' && headers.cookie.includes('userid=111') ? {} : {data:{nickname:'Test'}};
        if (path.startsWith('/login/token')) return {status:1, data:{token:'fake-refreshed-token'}};
        if (path.startsWith('/youth/listen/song')) return s === 'claimed' ? {error_code:130012} : {status:1};
        if (path.startsWith('/youth/vip')) {
          globalThis.testCalls++;
          return s === 'claimed' ? {error_code:30002} : s === 'partial' && globalThis.testCalls === 2 ? {status:0,error_code:99} : {status:1};
        }
        return {status:1,data:{busi_vip:[{vip_end_time:'2026-12-01'}]}};
      };` }
    if (url.endsWith('/utils/githubSecrets.js')) return { format: 'module', shortCircuit: true, source: `
      export const hasSecretWriteToken = () => process.env.TEST_SCENARIO === 'secretfail';
      export const setRepoSecret = () => { throw new Error('fake-refreshed-token'); };` }
    if (url.endsWith('/utils/notify.js')) return { format: 'module', shortCircuit: true, source: `
      export const sendNotify = async (title, content) => { globalThis.testNotify = {title,content}; };` }
    return nextLoad(url, context)
  },
})
const { main } = await import('../../main.js')
try { await main() } catch (_) { process.exitCode = 1 }
console.log(JSON.stringify({calls: globalThis.testCalls, closed: globalThis.testClosed, notify: globalThis.testNotify}))
