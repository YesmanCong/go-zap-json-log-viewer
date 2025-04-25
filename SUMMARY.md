# Go JSON Log Viewer 插件开发总结

由于工具限制，我们无法直接生成完整的 VSCode 扩展。以下是完成扩展开发的步骤指南：

## 1. 项目结构

我们已经创建了以下文件结构的基础：

```
go-json-log-viewer/
├── package.json         # 扩展清单
├── README.md            # 使用说明
├── tsconfig.json        # TypeScript 配置
├── src/                 # 源代码
│   └── extension.ts     # TypeScript 源代码
└── dist/                # 编译后代码
```

## 2. 关键文件说明

### package.json

package.json 配置了扩展的元数据、命令和依赖项。

### tsconfig.json

TypeScript 配置，指定如何编译源代码。

### src/extension.ts

扩展的源代码，实现了根据日志级别高亮显示的功能：

- 定义了不同日志级别的颜色映射
- 创建了对应的文本装饰器
- 实现了解析 JSON 日志并应用高亮的逻辑
- 处理编辑器文档变化事件

## 3. 如何完成开发

1. 安装所需依赖：

   ```
   npm install @types/vscode@^1.60.0 typescript@^4.9.4 @types/node@^16.18.11 --save-dev
   ```

2. 编译项目：

   ```
   npx tsc -p ./
   ```

3. 打包扩展：

   ```
   npm install -g vsce
   vsce package
   ```

4. 安装扩展：
   - 在 VSCode 中选择"从 VSIX 安装..."
   - 选择生成的.vsix 文件

## 4. 功能说明

此扩展会：

- 自动检测并解析 JSON 格式的日志
- 根据 severity 字段识别日志级别
- 使用不同颜色高亮显示不同级别的日志
- 提供命令启用/禁用高亮功能

## 5. 使用方法

1. 打开包含 JSON 格式日志的文件
2. 日志将自动按照 severity 字段进行高亮显示
3. 使用命令面板可启用或禁用高亮功能

## 6. 后续优化建议

- 添加配置选项，允许用户自定义颜色
- 增加对非标准 JSON 日志格式的支持
- 添加过滤功能，只显示特定级别的日志
- 增加统计功能，显示各级别日志的数量
- 支持调试控制台的日志高亮
