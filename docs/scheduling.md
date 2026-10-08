# 调度可靠性与 VPS 验证

## 2026-10-08 诊断

原计划 `10 17 * * *` 为 UTC 17:10，即北京时间次日 01:10。

| 北京日期 | 创建运行 | 触发延迟 | 结果 |
| --- | --- | --- | --- |
| 10-07 | 05:36:06 | 4 小时 26 分 06 秒 | 成功 |
| 10-08 | 05:57:27 | 4 小时 47 分 27 秒 | 听歌及 8 次 VIP 领取成功 |

10-08 的运行于 05:57:29 获得运行器、05:57:33 开始签到、06:01:13 完成签到。
延迟发生在创建运行之前，运行器等待约 2 秒；不是安装依赖、API 启动或脚本的 30 秒间隔造成的。已有数据支持 GitHub schedule 触发延迟，无法仅凭这些记录确定 GitHub 内部负载、限流或具体故障。与 Hyperdown 现象相似，但没有它的逐次运行记录，不能证明同一内部原因。

[GitHub 官方说明](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)承认高负载时 schedule 可能延迟或丢弃事件。17:10 已避开整点；换分钟只能尝试降低概率，不能保证准点。

## GitHub 方案

- 保留原计划 01:10，新增 03:37 补偿。两者共用 concurrency，正在执行的签到不会被新运行取消。
- 使用 Actions 只读 API，按北京时间检查真实 `执行签到` 步骤成功。验证运行、跳过和失败步骤不算成功。历史中即使后续步骤失败，已成功的签到仍算成功。
- 原计划或手动执行在查询 API 不可用时继续签到，以优先保持现有能力；补偿执行在无法确认状态时停止并触发异常提醒。API 故障时原计划有重复调用的可能，酷狗已有的“今日已领取/次数已用光”处理保留。
- 摘要记录触发延迟与创建运行至前置检查的等待。超过 60 分钟显示警告。计算基于创建运行前最近一个 cron 时刻；延迟超过一天时无法从 payload 还原原始计划日期，此值只是下界。
- `签到失败提醒` 独立监听完成结果，覆盖启动、安装、签到异常、取消和超时。失败记录写入一个由机器人创建的 Issue，并分配仓库所有者；已有异常 Issue 追加记录。用户解决后手动关闭 Issue。
- 可用通知渠道继续推送。没有渠道时明确提示，Issue 仍可供查看；GitHub 的邮件/应用通知能否到达取决于个人通知设置。
- 手动 `validate_only=true` 只执行无凭证测试。真实手动执行也进行每日防重复检查。
- `仓库保活` 保留。新增一次验证提交不能永久避免公开仓库 60 天无活动后停用计划任务，仍需保活正常执行。

**限制：**原计划、补偿计划、失败提醒都依赖 GitHub。整个计划事件未产生运行时，`workflow_run` 不会触发，无法提醒“任务根本没启动”。调度长期准确性需要观察后续自然触发，不能用一次手动验证证明。

## Ubuntu/systemd 可行性

适合长期开机、时钟同步正常的 DMIT Ubuntu VPS。直接在 VPS 运行代码可绕过 GitHub schedule 和 hosted runner 排队；从 VPS 发起 workflow_dispatch 仍会经过 Actions 队列，不能提供同等准点性。

提供的 timer 明确使用 Asia/Shanghai，01:10 执行，01:40 和 02:10 再尝试；成功后本地状态会跳过重复执行。`AccuracySec=1s`、`RandomizedDelaySec=0` 降低本机调度偏差，`Persistent=true` 可在重启后补跑一次，不会逐日回放历史任务。[systemd 官方文档源码](https://github.com/systemd/systemd/blob/main/man/systemd.timer.xml)

systemd 不能保证断电、宕机、网络故障或 API 故障时准点完成。`OnFailure` 推送由本机独立服务执行；如果 VPS 整机停止，该服务也无法发送，需要额外的外部心跳监控。

### 准备（保留 GitHub Actions）

需要 Ubuntu 管理权限和位于 `/usr/local/bin` 或 `/usr/bin` 的 Node.js 24+。先检查 `node --version`、`timedatectl status`、`systemctl --version`。不要改动 VPS 已有代理、防火墙或其他服务。

```sh
sudo useradd --system --user-group --home-dir /var/lib/kgm-checkin --shell /usr/sbin/nologin kgm-checkin
sudo install -d -o root -g root -m 0755 /opt/kgm-checkin
sudo git clone https://github.com/GAN1112233131/KGM-AUTO-CHECKIN.git /opt/kgm-checkin
cd /opt/kgm-checkin
# 检查并固定已验证的提交，不要在每日任务里自动拉取代码。
sudo npm --prefix api ci --omit=dev
sudo install -d -o root -g kgm-checkin -m 0750 /etc/kgm-checkin
sudo install -d -o kgm-checkin -g kgm-checkin -m 0700 /var/lib/kgm-checkin
sudo install -o root -g kgm-checkin -m 0640 deploy/checkin.env.example /etc/kgm-checkin/checkin.env
sudo install -o kgm-checkin -g kgm-checkin -m 0600 /dev/null /var/lib/kgm-checkin/userinfo.json
```

已有用户或非空目录时先检查并复用，不重复创建。由用户通过本地安全编辑器填写 `userinfo.json`（结构与 `USERINFO` Secret 一致）及选定的通知渠道；GitHub Secret 不能读取回原值。不要在命令行参数、工单、仓库、终端输出或聊天中粘贴凭证。

```sh
sudoedit /var/lib/kgm-checkin/userinfo.json
sudoedit /etc/kgm-checkin/checkin.env
# 不启动 API、不访问酷狗、不领取 VIP 的配置验证：
sudo -u kgm-checkin env USERINFO_FILE=/var/lib/kgm-checkin/userinfo.json node scripts/run-vps.js --check
node --test tests/*.test.js
sudo install -o root -g root -m 0644 deploy/systemd/*.service deploy/systemd/*.timer /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/kgm-checkin*.service /etc/systemd/system/kgm-checkin.timer
systemd-analyze calendar '*-*-* 01:10:00 Asia/Shanghai'
sudo systemctl daemon-reload
```

**此时不创建 `/etc/kgm-checkin/enable-live`，不启动真实签到 timer。** 可验证单元语法和下一次计划时刻，但这不能证明真实凭证、VPS 到酷狗的网络、API 端口、发送通知和真实调度已经可用。

### 实际验证与切换顺序

1. 先完成以上无副作用验证，并确认 3000 端口未被其他服务占用。新增服务只绑定 127.0.0.1；如果已有服务占用端口，先规划调整，不能直接停止它。
2. 选择当天 GitHub 已经完成签到之后的窗口，临时创建 `enable-live`，单次启动 `kgm-checkin.service`，验证真实 API 与“今日已领取”处理；结束后删除开关。此步骤仍会调用账号 API，周日还可能刷新 token，需同步凭证。
3. 在 VPS 真正领取一次之前保持 GitHub 主方案。仅当 VPS 一次真实领取成功、刷新文件保存成功、测试提醒到达、timer 自然触发与时钟同步验证完毕后，再安排切换。
4. **不要让两个平台同时长期运行真实签到。** 本地状态和 GitHub 去重不共享，周日刷新也可能覆盖另一平台的令牌。切换日先停 GitHub 的 schedule（保留 workflow_dispatch），再启用 VPS timer；回滚时先停 VPS timer、删除开关，安全更新 GitHub USERINFO 后恢复原计划。

激活命令仅用于完成实际验证并决定切换之后：

```sh
sudo install -o root -g root -m 0644 /dev/null /etc/kgm-checkin/enable-live
sudo systemctl enable --now kgm-checkin.timer
systemctl list-timers kgm-checkin.timer
# 仅查看脱敏日志，不查看 Environment 或凭证文件：
sudo journalctl -u kgm-checkin.service --since today
```

回滚：`sudo systemctl disable --now kgm-checkin.timer`，删除 `enable-live`；如果正在执行，先等待完成或按需停止 `kgm-checkin.service`。保留代码与受限登录信息，恢复 GitHub 原计划和最新凭证后检查下一次执行。

## 验证范围

测试覆盖成功领取 8 次、当天已领取、部分失败、单账号异常隔离、API 未就绪、Secret 保存失败、VPS 令牌原子写入与文件权限、非法配置不输出凭证、UTC/北京时间跨日、防重复记录、分页和推送失败检测。
这些测试使用虚构凭证与模拟接口，不触发实际领取；VPS 上的网络、真实 timer 和外部通知必须在有连接权限后单独验证。
