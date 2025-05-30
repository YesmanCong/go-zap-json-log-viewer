# Go JSON Log Viewer

一个 VSCode 扩展，用于高亮显示 Go 语言 JSON 格式日志，根据 severity 字段区分日志级别。

## 功能特点

- 根据 JSON 日志中的 severity 字段识别日志级别
- 使用不同颜色高亮显示不同级别的日志
- 支持编辑器中的日志文件高亮显示

## 支持的日志级别和颜色

- `DEBUG`: 灰色
- `INFO`: 蓝色
- `WARN`/`WARNING`: 黄色
- `ERROR`: 红色（加粗）
- `FATAL`: 深红色（加粗）

## 示例日志格式

插件支持解析以下格式的 JSON 日志：

```json
{"severity":"WARN","eventTime":"2025-04-24T18:25:24.278+0800","caller":"","message":"unknown keys received","keys":[]}
{"severity":"INFO","eventTime":"2025-04-24T18:25:24.278+0800","caller":"","message":"initialized with active version","version":""}
```

## 安装方法

### 从 VSIX 文件安装

1. 下载最新的 `go-json-log-viewer-x.x.x.vsix` 文件
2. 在 VSCode 中，选择 "扩展" 视图（或按 Ctrl+Shift+X / Cmd+Shift+X）
3. 点击视图顶部的 "..." 菜单，选择 "从 VSIX 安装..."
4. 浏览并选择下载的 `.vsix` 文件

### 从源代码安装

1. 克隆该仓库

   ```
   git clone https://github.com/YesmanCong/go-zap-json-log-viewer.git
   ```

2. 安装依赖并编译

   ```
   npm install
   npm run compile
   ```

3. 打包为 VSIX 文件

   ```
   npm install -g vsce
   vsce package
   ```

4. 安装 VSIX 文件
   ```
   code --install-extension go-json-log-viewer-0.0.2.vsix
   ```

## 使用方法

1. 打开包含 JSON 格式日志的文件
2. 日志将自动按照 severity 字段进行高亮显示
3. 使用命令面板可启用或禁用高亮功能：
   - 启用高亮：打开命令面板（Ctrl+Shift+P / Cmd+Shift+P），输入 "启用 Go JSON 日志高亮"
   - 禁用高亮：打开命令面板（Ctrl+Shift+P / Cmd+Shift+P），输入 "禁用 Go JSON 日志高亮"

## 自定义颜色配置

您可以根据个人喜好自定义不同日志级别的颜色。有两种方式可以修改颜色配置：

### 通过设置界面

1. 打开 VSCode 设置（文件 > 首选项 > 设置，或按 Ctrl+, / Cmd+,）
2. 搜索 "goJsonLogViewer.colors"
3. 修改对应级别的颜色值

### 通过 settings.json 文件

在 settings.json 文件中添加以下配置（可根据需要修改颜色值）：

```json
{
  "goJsonLogViewer.colors.debug": "#6A737D",
  "goJsonLogViewer.colors.info": "#0366D6",
  "goJsonLogViewer.colors.warn": "#FFAB00",
  "goJsonLogViewer.colors.error": "#D73A49",
  "goJsonLogViewer.colors.fatal": "#CB2431"
}
```

修改颜色配置后，颜色变更将立即应用于打开的编辑器和日志查看器。

## 提示

- 如果您的日志格式与示例不同，可能需要修改插件的源代码以适应您的日志格式
- 插件将尝试解析每一行以查找 JSON 格式的日志，包含非 JSON 格式的行将被忽略

## 问题反馈

如果您遇到任何问题或有改进建议，请在 GitHub 仓库中提交 Issue。

# go-zap-json-log-viewer

https://github.com/YesmanCong/go-zap-json-log-viewer