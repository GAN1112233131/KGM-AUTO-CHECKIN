import { sendNotify } from '../utils/notify.js'

const result = await sendNotify('酷狗签到运行异常',
  `签到任务未正常完成（${process.env.RUN_CONCLUSION || 'failure'}）。\n${process.env.RUN_URL || '请查看 systemd journal 脱敏日志'}\n请检查失败步骤，避免手动重复领取。`)
if (!result.configured) console.log('::warning::未配置推送渠道；请查看 GitHub 异常 Issue 或 systemd journal')
else if (!result.success) {
  console.error('所有推送渠道发送失败')
  process.exitCode = 1
}
