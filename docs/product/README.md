# 商业化实施入口

决策日期：2026-11-04。用户确认：个人开发者与小团队，本地部署优先。

当前阶段：**个人工作台原型，尚未达到公开售卖标准**。规划描述的是未来目标，不是现有功能承诺。未开通支付、许可证服务或云端数据上传。

阅读顺序：
1. [商业化与本地部署改进总盘点](../COMMERCIALIZATION-LOCAL-DEPLOYMENT-REVIEW.md)：按产品、角色、技术、安全、数据、部署与运营维度评估差距，并给出阶段优先级。
2. [产品与商业方案](PRODUCT.md)：卖给谁、解决什么问题、卖什么。
3. [现状与发布门槛](READINESS.md)：代码证据、风险、哪些问题阻止收费发布。
4. [架构与数据契约](ARCHITECTURE.md)：本地采集器、数据语义、存储、权限。
5. [AI 执行协议](EXECUTION.md)：执行任务、记录证据、更新状态。
6. [机器任务清单](backlog.json)：依赖、范围、验收、验证命令、回退方式。

```bash
python3 scripts/product_plan.py validate   # 校验任务结构、引用、依赖及完成证据
python3 scripts/product_plan.py next       # 输出下一项依赖已满足的任务 JSON
python3 scripts/product_plan.py show SEC-001
```

工具只检查和读取计划，不执行清单中的命令，不自动部署或消费模型额度。

给下一轮 AI 的指令：
> 阅读 docs/product/README.md 与 EXECUTION.md，运行 product_plan.py validate 和 next；按 next 返回的单个任务实施。先检查 git diff，保留已有修改；仅在验收证据充分时更新任务状态。不要把未来规划写成已上线功能。不要使用真实密钥测试、上传用户数据或擅自部署。
