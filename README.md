# abl_theme — ABL ERPNext 展示层主题

> ## ⛔ 边界铁律（2026-07-13 与 Richard 约定）
>
> **本 app 只放「展示层」规则：CSS / 纯视觉 JS（布局、换行、字号、配色、隐藏装饰元素）。**
>
> **严禁**放任何业务逻辑——命名、校验、默认值、字段联动、数据读写。
> 那些永远走 Server Script / Client Script（在站点数据库里，受 CHANGELOG-表单配置.md + ui-eval 管辖）。
>
> 动机：`app_include_css/js` 是全局注入通道，比 Client Script 更隐蔽；塞业务逻辑会让行为无法追溯。
> 每次改动必须 commit 写清"改了什么 + 为什么"，并同步 CHANGELOG-表单配置.md。

## 这是什么

装在 Frappe Cloud 私有 bench 上的极小自定义 app，唯一作用是给 desk 注入全局 CSS
（Frappe 标准机制 `hooks.py → app_include_css`，与 ERPNext 自身注入样式同一条官方通道）。

## 当前规则清单

| 规则 | 解决什么 | 日期 |
|---|---|---|
| `.desktop-icon .icon-title` 允许换行 + 限宽 + 去 overflow:hidden | App 切换器宫格双语标题（「中文 English」）过长互相重叠 → 自动折成两行：第一行中文、第二行英文 | 2026-07-13 |

## 部署链路

GitHub repo（本仓库）→ Frappe Cloud bench「Add App」→ Deploy → 站点 Install。
改样式 = 改 `abl_theme/public/css/abl_theme.css` → commit + push → Frappe Cloud 一键 Deploy。

## 验证

翻译/布局回归：`docs/supplychain/erpnext/scripts/ui-eval/verify_workspaces.mjs`（含宫格标签断言）。
