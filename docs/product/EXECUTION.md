# AI 执行协议

适用范围：本仓库商业化路线；用户本轮新指令优先。本文件不授予后台无限运行、远程发布、付费调用、购买服务或向第三方发送消息的权限。

## 每轮流程

1. 读取 README.md、docs/product/README.md、git status 与相关 diff，保护已有未提交改动。不要把真实 data/、.env、CLI 凭证、访问日志加入提交。
2. 运行 `python3 scripts/product_plan.py validate`。失败先修计划，不绕过依赖。
3. 运行 `python3 scripts/product_plan.py next`，只取一个最高优先级且依赖完成的任务。用户指定任务时先检查依赖。next 没有候选时报告阻塞项，不自动把任务标 done。
4. 阅读任务 references、目标代码和验收标准。将 status 改为 in_progress；实现与该任务相关的最小完整变更。不擅自替换框架或实现依赖未满足的计费系统。
5. 有行为变更时添加能捕获该问题的测试；使用合成凭证、独立临时存储和 mock 上游，不消耗真实模型额度。执行 verification 列表并人工核对 acceptance。
6. 在 evidence 中记录测试结果文档、实现文件与实际验证结果；只有所有验收条件满足才标 done。若权限、外部资料或用户决策缺失，标 blocked 并填写 blocked_reason，保留可继续工作的记录。
7. 更新 docs/product/READINESS.md 和 README 中相关已实现状态，重新 validate；总结改动、验证和限制。不要把校验通过当作已实现产品或安全审计通过。

## 状态与任务字段

状态：todo / in_progress / blocked / done。每项包含 id、priority(P0/P1/P2)、milestone、depends_on、references、deliverables、steps、acceptance、verification、rollback、evidence、blocked_reason。references 是必须存在的阅读材料，deliverables 可以是未来文件。

估算只用于排序，不据此牺牲验收。较大任务进入实施前可以拆成子任务，必须保留原验收、更新依赖并重新校验无环。

## 持续不变量

- 公司与个人账号、不同用户的凭证/缓存不混用。
- 不存在的数据用 null/未接入；不能构造满额、零费用或已付费状态。
- 商业许可证与上游账号权益完全分离。
- 本地记录不冒充全账号账单；显示估算价格与版本，不承诺精确费用。
- 分享永远字段白名单，默认不含个人账号、凭证、提示词与响应正文。
- 备份与回滚先于真实存储迁移；测试不改当前使用中的 Redis/文件。
- 发布、支付上线、外部上传、用户遥测都不是本规划自动执行的一部分。

## 首个任务示例

`SEC-001`：设计并实现本机管理员会话、Host/Origin/CSRF 边界以及模型调用目的地址规则。先写模拟远程/恶意 Origin 的失败测试，再实现；必须覆盖回环伪装、只读分享继续可用、合法本机操作、显式允许的本地模型。验收通过后才进入凭证迁移任务。安全设计可先拆成三个可审查子任务，但不能直接宣称“生产安全”。
