import * as vscode from 'vscode';

// 定义日志严重级别对应的颜色
const severityColors = {
    'DEBUG': '#6A737D', // 灰色
    'INFO': '#0366D6',  // 蓝色
    'WARN': '#FFAB00',  // 黄色
    'WARNING': '#FFAB00', // 黄色（兼容 WARNING 拼写）
    'ERROR': '#D73A49', // 红色
    'FATAL': '#CB2431'  // 深红色
};

// 存储当前是否启用插件
let isEnabled = true;

// 创建一个输出通道，用于处理和显示格式化的日志
let logOutputChannel: vscode.OutputChannel;

// WebView面板
let webviewPanel: vscode.WebviewPanel | null = null;
let logBuffer: string[] = [];

// 定义接口以支持调试事件的类型
interface DebugOutputEvent {
    event: string;
    body?: {
        output?: string;
        category?: string;
    };
}

function activate(context: vscode.ExtensionContext) {
    console.log("Go JSON Log Viewer 已激活");
    vscode.window.showInformationMessage('Go JSON Log Viewer 已激活');
    
    // 初始化输出通道
    logOutputChannel = vscode.window.createOutputChannel('Go JSON Log');
    
    // 创建装饰器类型
    const decorationTypes: Record<string, vscode.TextEditorDecorationType> = {};
    for (const [severity, color] of Object.entries(severityColors)) {
        decorationTypes[severity] = vscode.window.createTextEditorDecorationType({
            color,
            fontWeight: severity === 'ERROR' || severity === 'FATAL' ? 'bold' : 'normal'
        });
    }
    
    // 注册启用命令
    let enableCommand = vscode.commands.registerCommand('go-json-log-viewer.enable', () => {
        isEnabled = true;
        vscode.window.showInformationMessage('已启用Go JSON日志高亮');
    });

    // 注册禁用命令
    let disableCommand = vscode.commands.registerCommand('go-json-log-viewer.disable', () => {
        isEnabled = false;
        vscode.window.showInformationMessage('已禁用Go JSON日志高亮');
    });
    
    // 注册打开彩色日志视图命令
    let openLogViewerCommand = vscode.commands.registerCommand('go-json-log-viewer.openViewer', () => {
        createOrShowWebView(context.extensionUri);
    });
    
    // 更新装饰
    function updateDecorations(editor: vscode.TextEditor) {
        if (!editor || !isEnabled) return;
        
        const decorationsArray: Record<string, vscode.Range[]> = {};
        for (const severity in severityColors) {
            decorationsArray[severity] = [];
        }
        
        const text = editor.document.getText();
        const lines = text.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('{') && line.endsWith('}')) {
                try {
                    const logObject = JSON.parse(line);
                    if (logObject.severity) {
                        const severity = logObject.severity.toUpperCase();
                        if (decorationTypes[severity]) {
                            const range = new vscode.Range(
                                new vscode.Position(i, 0),
                                new vscode.Position(i, lines[i].length)
                            );
                            decorationsArray[severity].push(range);
                        }
                    }
                } catch (e) { /* 解析JSON出错，跳过 */ }
            }
        }
        
        // 应用装饰
        for (const severity in decorationTypes) {
            editor.setDecorations(decorationTypes[severity], decorationsArray[severity]);
        }
    }
    
    // 创建或显示WebView面板
    function createOrShowWebView(extensionUri: vscode.Uri) {
        const columnToShowIn = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : vscode.ViewColumn.One;

        if (webviewPanel) {
            webviewPanel.reveal(columnToShowIn || vscode.ViewColumn.One);
            return;
        }

        webviewPanel = vscode.window.createWebviewPanel(
            "goJsonLogViewer",
            "Go JSON Log彩色视图",
            columnToShowIn || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        webviewPanel.webview.html = getWebviewContent();

        webviewPanel.onDidDispose(
            () => {
                webviewPanel = null;
            },
            null,
            context.subscriptions
        );

        // 如果有缓存的日志，立即显示
        if (logBuffer.length > 0) {
            updateWebView();
        }
    }

    // 获取WebView内容
    function getWebviewContent() {
        return `<!DOCTYPE html>
        <html lang="zh">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Go JSON Log彩色视图</title>
            <style>
                body {
                    font-family: 'Courier New', Courier, monospace;
                    padding: 10px;
                    font-size: 14px;
                    line-height: 1.5;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                }
                .log-container {
                    width: 100%;
                    overflow-y: auto;
                    max-height: 100vh;
                }
                .log-entry {
                    margin-bottom: 4px;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 4px;
                }
                .severity {
                    font-weight: bold;
                    display: inline-block;
                    min-width: 60px;
                }
                .DEBUG { color: #6A737D; }
                .INFO { color: #0366D6; }
                .WARN, .WARNING { color: #FFAB00; }
                .ERROR { color: #D73A49; font-weight: bold; }
                .FATAL { color: #CB2431; font-weight: bold; }
                .timestamp {
                    color: #555;
                    margin-right: 8px;
                }
                .caller {
                    color: #6F42C1;
                }
                .message {
                    margin-left: 8px;
                }
                .extra {
                    margin-left: 20px;
                    color: #666;
                    font-size: 12px;
                }
                .clear-btn {
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    padding: 5px 10px;
                    background: #eee;
                    border: 1px solid #ccc;
                    border-radius: 3px;
                    cursor: pointer;
                }
                .clear-btn:hover {
                    background: #ddd;
                }
            </style>
        </head>
        <body>
            <button class="clear-btn" onclick="clearLogs()">清除日志</button>
            <div id="logContainer" class="log-container"></div>
            <script>
                const vscode = acquireVsCodeApi();
                const logContainer = document.getElementById('logContainer');

                // 接收消息
                window.addEventListener('message', event => {
                    const message = event.data;

                    if (message.type === 'addLog') {
                        const logEntry = document.createElement('div');
                        logEntry.className = 'log-entry';
                        logEntry.innerHTML = message.html;
                        logContainer.appendChild(logEntry);
                        logContainer.scrollTop = logContainer.scrollHeight;
                    } else if (message.type === 'clear') {
                        logContainer.innerHTML = '';
                    }
                });

                function clearLogs() {
                    vscode.postMessage({
                        command: 'clearLogs'
                    });
                    logContainer.innerHTML = '';
                }
            </script>
        </body>
        </html>`;
    }

    // 更新WebView内容
    function updateWebView() {
        if (webviewPanel && logBuffer.length > 0) {
            logBuffer.forEach((logHtml) => {
                webviewPanel!.webview.postMessage({
                    type: "addLog",
                    html: logHtml,
                });
            });
            logBuffer = [];
        }
    }

    // 添加日志到WebView
    function addLogToWebView(logHtml: string) {
        if (webviewPanel) {
            webviewPanel.webview.postMessage({
                type: "addLog",
                html: logHtml,
            });
        } else {
            logBuffer.push(logHtml);
        }
    }
    
    // 处理调试输出
    function processDebugOutput(output: string, category?: string) {
        if (!isEnabled) return;
        
        console.log("处理调试输出:", output);
        
        // 尝试从输出中解析JSON日志行
        const lines = output.split('\n');
        
        for (const line of lines) {
            try {
                // 检查是否可能是JSON格式
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith('{') && trimmedLine.endsWith('}')) {
                    const logObject = JSON.parse(trimmedLine);
                    
                    // 检查是否包含severity字段
                    if (logObject.severity) {
                        // 格式化并显示日志
                        const severity = logObject.severity.toUpperCase();
                        const time = logObject.eventTime || new Date().toISOString();
                        const message = logObject.message || '';
                        const caller = logObject.caller || '';
                        
                        // 创建带格式的日志消息
                        let formattedMessage = `[${time}] [${severity}]`;
                        
                        if (caller) {
                            formattedMessage += ` [${caller}]`;
                        }
                        
                        formattedMessage += `: ${message}`;
                        
                        // 添加其他字段（排除已处理的字段）
                        const processedFields = ['severity', 'eventTime', 'message', 'caller'];
                        const extraFields: string[] = [];
                        
                        for (const key in logObject) {
                            if (!processedFields.includes(key)) {
                                extraFields.push(`${key}=${JSON.stringify(logObject[key])}`);
                            }
                        }
                        
                        let extraInfo = "";
                        if (extraFields.length > 0) {
                            extraInfo = extraFields.join(", ");
                            formattedMessage += ` | ${extraInfo}`;
                        }
                        
                        // 添加到输出通道
                        logOutputChannel.appendLine(formattedMessage);
                        
                        // 为WebView准备HTML
                        let logHtml = `
                          <span class="timestamp">[${time}]</span>
                          <span class="severity ${severity}">[${severity}]</span>
                          <span class="caller">[${caller}]:</span>
                          <span class="message">${message}</span>
                        `;

                        if (extraInfo) {
                            logHtml += `<div class="extra">${extraInfo}</div>`;
                        }

                        // 添加到WebView
                        addLogToWebView(logHtml);
                        
                        // 显示输出通道
                        logOutputChannel.show(true);
                    }
                } else {
                    // 尝试在非JSON文本中查找并解析日志格式 [timestamp] [level] [caller]: message
                    const logPattern = /\[([^\]]+)\]\s*\[([^\]]+)\]\s*(?:\[([^\]]+)\])?:\s*(.*)/;
                    const matches = trimmedLine.match(logPattern);

                    if (matches && matches.length >= 3) {
                        const time = matches[1];
                        const severity = matches[2].toUpperCase();
                        const caller = matches[3] || "";
                        const message = matches[4] || "";
                        const extra = matches[5] || "";

                        // 添加到输出通道
                        logOutputChannel.appendLine(trimmedLine);

                        // 为WebView准备HTML
                        let logHtml = `
                          <span class="timestamp">[${time}]</span>
                          <span class="severity ${severity}">[${severity}]</span>
                          <span class="caller">[${caller}]:</span>
                          <span class="message">${message}</span>
                        `;

                        if (extra) {
                            logHtml += `<div class="extra">${extra}</div>`;
                        }

                        // 添加到WebView
                        addLogToWebView(logHtml);
                    } else {
                        // 非结构化日志，直接输出
                        logOutputChannel.appendLine(trimmedLine);
                    }
                }
            } catch (error) {
                // JSON解析错误，直接输出
                logOutputChannel.appendLine(line);
                continue;
            }
        }
        
        // 更新WebView
        updateWebView();
    }
    
    // 监听调试会话开始事件
    vscode.debug.onDidStartDebugSession((session) => {
        if (!isEnabled) return;
        console.log("调试会话已启动:", session.name);
        logOutputChannel.appendLine(`调试会话已启动: ${session.name}`);
        
        // 自动打开彩色日志查看器
        createOrShowWebView(context.extensionUri);
        
        logOutputChannel.show(true);
    });
    
    // 监听调试控制台输出
    vscode.debug.registerDebugAdapterTrackerFactory("*", {
        createDebugAdapterTracker(session) {
            return {
                onDidSendMessage(message: any) {
                    if (message.type === "event" && message.event === "output") {
                        processDebugOutput(message.body.output, message.body.category);
                    }
                },
            };
        },
    });
    
    // 监听调试输出事件
    vscode.debug.onDidReceiveDebugSessionCustomEvent((e: DebugOutputEvent) => {
        if (!isEnabled) return;
        
        console.log("收到调试事件:", e.event);
        
        // 处理调试输出事件
        if (e.event === 'output' && e.body && e.body.output) {
            processDebugOutput(e.body.output, e.body.category);
        }
    });
    
    // 监听所有输出事件（更全面捕获）
    vscode.debug.onDidReceiveDebugSessionCustomEvent((e: any) => {
        if (!isEnabled) return;
        
        console.log("收到调试自定义事件:", e.event);
        // 处理所有可能的调试事件
        if (e.body && typeof e.body.output === 'string') {
            processDebugOutput(e.body.output, e.body.category);
        }
    });
    
    // 注册事件处理器
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            updateDecorations(editor);
        }
    });
    
    vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document) {
            updateDecorations(editor);
        }
    });
    
    // 立即应用到当前编辑器
    if (vscode.window.activeTextEditor) {
        updateDecorations(vscode.window.activeTextEditor);
    }
    
    context.subscriptions.push(
        enableCommand,
        disableCommand,
        openLogViewerCommand,
        logOutputChannel
    );
}

function deactivate() {
    // 关闭输出通道
    if (logOutputChannel) {
        logOutputChannel.dispose();
    }
    
    // 关闭WebView面板
    if (webviewPanel) {
        webviewPanel.dispose();
    }
}

// 使用CommonJS风格导出
module.exports = { activate, deactivate }; 