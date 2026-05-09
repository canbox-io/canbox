# Change 工作流

> 自定义变更管理命令，基于 `docs/changes/` 目录结构，帮助 AI Agent 规范化地管理功能变更的全生命周期。

## 命令一览

| 命令 | 用途 | 产物 |
|------|------|------|
| `change-start` | 开始新变更（默认先讨论再生成文档） | `docs/changes/active/<name>.md` |
| `change-finish` | 完成变更（验证、补全、归档） | 移动到 `docs/changes/completed/<date>-<name>.md` |
| `change-query` | 查询变更状态 | 无，仅输出信息 |

---

## change-start

开始一个新变更。

### 语法

```
change-start <change-name> [-q]
```

| 参数 | 说明 |
|------|------|
| `<change-name>` | 变更标识，kebab-case 格式（如 `file-task-manager`） |
| `-q` | 跳过讨论阶段，直接生成文档 |

### 流程

**默认流程**（推荐，先讨论再动手）：

1. **理解阶段** — AI 阅读需求描述，搜索相关代码，复述理解并确认
2. **讨论阶段** — AI 提出设计取舍点，与用户来回讨论，直至收敛
3. **生成阶段** — 讨论确认后，生成变更文档

**快速流程**（`-q` 标志）：

直接根据用户描述生成文档，跳过理解和讨论阶段。

### 示例

```
change-start file-task-manager          # 先讨论，再生成
change-start add-dark-mode              # 先讨论，再生成
change-start fix-login-bug -q           # 跳过讨论，直接生成
```

### 生成产物

- 变更文档：`docs/changes/active/<change-name>.md`
- 索引更新：`docs/changes/active/index.md`

文档结构为：

```markdown
# <change-name>

## 概述
[做什么、为什么]

## 核心设计
[关键设计决策]

## 验收标准
- [ ] 标准1：可观测、可测试的结果
- [ ] 标准2：避免模糊描述
- [ ] 标准3：与现有功能无冲突

## 实施计划
- [ ] 步骤1
- [ ] 步骤2
```

> 注：「验收标准」是归档前必须确认的条件，建议 3-5 条，覆盖功能正确性、边界情况、回归检查。

---

## change-finish

完成并归档一个变更。

### 语法

```
change-finish [<change-name>] [<用户描述>]
```

| 参数 | 说明 |
|------|------|
| `<change-name>` | 变更标识。如果 active 下只有一个变更，可省略 |
| `<用户描述>` | 可选的自然语言描述，可能包含测试发现、设计调整、待解决问题等 |

### 意图识别

`change-finish` 会扫描用户描述中的关键词，识别真实意图：

| 关键词类型 | 示例 | AI 行为 |
|-----------|------|---------|
| 完成确认 | "完成了"、"可以了"、"没问题了" | 正常执行归档 |
| 问题报告 | "发现"、"bug"、"异常"、"有问题" | **停止归档**，先讨论问题 |
| 方案调整 | "改用"、"调整为"、"最后用了" | 记录到文档，继续归档 |

### 流程

1. **定位文档** — 读取 `docs/changes/active/<change-name>.md`
2. **验证实施** — 对照实施计划，搜索代码验证各步骤是否完成，报告结果
3. **验收标准确认** — 对照「验收标准」逐项确认，记录「未完整测试」标签
4. **回归测试提示** — 提醒检查常见回归点（非强制）
5. **补全文档** — 根据实际代码补充修改文件列表、实现细节等，等用户确认
6. **归档** — 确认后移动到 `docs/changes/completed/`，更新两个 index 文件

### 示例

```
change-finish file-task-manager         # 完成指定变更
change-finish                           # active 下只有一个时自动识别
change-finish fix-login-bug 经过测试发现页面会闪烁   # 带描述，自动识别意图
```

### 产物

- 归档文档：`docs/changes/completed/<YYYY-MM-DD>-<change-name>.md`（日期为完成日期）
- 删除：`docs/changes/active/<change-name>.md`
- 更新：`docs/changes/active/index.md`、`docs/changes/completed/index.md`

---

## change-query

查询变更状态。

### 语法

```
change-query [<change-name>]
```

| 参数 | 说明 |
|------|------|
| `<change-name>` | 可选。指定变更名称查看详情；省略则列出所有变更 |

### 示例

```
change-query                           # 列出所有变更及状态
change-query file-task-manager         # 查看特定变更详情
```

### 输出

- 指定变更：显示状态、概述、实施计划进度
- 全部变更：显示汇总表格（状态、名称、日期、优先级、描述）

---

## 目录结构

```
docs/changes/
├── index.md              # 变更系统说明
├── template.md           # 变更记录模板（参考用）
├── active/               # 进行中的变更
│   ├── index.md          # 进行中变更索引
│   └── <name>.md         # 变更文档（无日期前缀）
├── completed/            # 已完成的变更
│   ├── index.md          # 已完成变更索引
│   └── <date>-<name>.md  # 变更文档（完成时加日期前缀）
└── archive/              # 历史归档
```

## 使用注意事项

### 命令参数与自然语言描述的边界

`change-start` 后面的内容，命令参数（change-name、-q）和自然语言描述没有硬性分隔，AI 会根据上下文理解。常见用法：

```
change-start                              # 纯命令，AI 会问你要描述
change-start <change-name>                # 给了名称，AI 会问你要描述
change-start <change-name> -q             # 给了名称 + 跳过讨论，AI 会问你要描述
change-start <一段描述>                     # 不带名称，AI 从描述推断名称并确认
change-start <change-name> -q <描述>       # 全给齐了
```

- 如果只给了描述没给 change-name，AI 会推断一个 kebab-case 名称，**确认后才使用**
- `-q` 后面的文字不是 `-q` 的参数，而是整条消息中的自然语言描述，AI 会一并理解

## 设计原则

1. **先讨论再动手** — `change-start` 默认进入讨论模式，避免 AI 跳过讨论直接实现
2. **一个文件** — 每个变更只有一份文档，结构精简，不填空架子
3. **完成时加日期** — active 下文件名不含日期，归档到 completed 时才加，日期为完成日期
4. **验证后再归档** — `change-finish` 先验证实施状态，未完成会提醒用户
5. **验收标准前置** — 归档前必须确认验收标准，确保功能真正完成
