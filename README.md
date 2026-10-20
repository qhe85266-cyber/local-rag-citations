# 据引 · Local RAG Citations

面向面试演示的「带引用的文档问答」。在浏览器里完成分块、检索、引用和拒答，**不需要 API Key**，也不连接大模型。

示例公司「青岚」是虚构的，只用来把检索范围、引用和「文档没写就不回答」讲清楚。

## 运行

```bash
npm install
npm run dev
```

浏览器打开 [http://localhost:5173](http://localhost:5173)。页面右上角应显示 **离线演示 · 无需 API Key**。

## 构建

```bash
npm install
npm run build
npm run preview
```

`npm run build` 会先做 TypeScript 检查，再产出 `dist/`。

## 演示模式

打开页面就是演示模式：

- 内置两份示例文档，检索范围永远只有当前这一份
- 顶部「演示路径」按面试顺序走完：退款引用 → 医疗救援边界 → 收购拒答 → 换文档后问月费
- 回答引擎停在「摘录」。大模型按钮是停用的，避免没有依据也能说得很顺
- 上传 `.txt` / `.md` 只留在本次页面会话里，刷新即消失。可试用 `examples/会议室说明.md`

检索合同可以用下面的命令再跑一遍（BM25 阈值、拒答和「备忘里不能出现 19 元」）：

```bash
npm run check
```

## 三分钟脚本

逐步台词、点击顺序和能力边界写在 [使用说明书.md](使用说明书.md)。

## 许可

[MIT](LICENSE)
