import * as vscode from 'vscode';

// 默认日志严重级别对应的颜色
const defaultSeverityColors = {
    'DEBUG': '#6A737D', // 灰色
    'INFO': '#0366D6',  // 蓝色
    'WARN': '#FFAB00',  // 黄色
    'WARNING': '#FFAB00', // 黄色（兼容 WARNING 拼写）
    'ERROR': '#D73A49', // 红色
    'FATAL': '#CB2431'  // 深红色
};

// 存储当前严重级别颜色
let severityColors = { ...defaultSeverityColors };

// 从配置中获取颜色设置
function updateColorsFromConfig() {
    const config = vscode.workspace.getConfiguration('goJsonLogViewer');
    
    severityColors = {
        'DEBUG': config.get('colors.debug', defaultSeverityColors.DEBUG),
        'INFO': config.get('colors.info', defaultSeverityColors.INFO),
        'WARN': config.get('colors.warn', defaultSeverityColors.WARN),
        'WARNING': config.get('colors.warn', defaultSeverityColors.WARN), // 使用相同的warn配置
        'ERROR': config.get('colors.error', defaultSeverityColors.ERROR),
        'FATAL': config.get('colors.fatal', defaultSeverityColors.FATAL)
    };
}

// 存储当前是否启用插件
let isEnabled = true;

// 创建一个输出通道，用于处理和显示格式化的日志
let logOutputChannel: vscode.OutputChannel;

// WebView面板
let webviewPanel: vscode.WebviewPanel | null = null;
let logBuffer: string[] = [];

// 存储文本编辑器装饰器类型
let decorationTypes: Record<string, vscode.TextEditorDecorationType> = {};

// 定义接口以支持调试事件的类型
interface DebugOutputEvent {
    event: string;
    body?: {
        output?: string;
        category?: string;
    };
}

// 插件被激活时调用
export function activate(context: vscode.ExtensionContext) {
    console.log('Go JSON Log Viewer activated');

    // 初始化输出通道
    logOutputChannel = vscode.window.createOutputChannel('JSON Log Output');
    
    // 从配置中加载颜色设置
    updateColorsFromConfig();
    
    // 监听配置变更
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('goJsonLogViewer')) {
                updateColorsFromConfig();
                // 如果有活跃的webview，则刷新以应用新颜色
                if (webviewPanel) {
                    updateWebViewStyles();
                    updateWebView();
                }
                // 重新应用装饰器
                applyDecorationsToVisibleEditors();
            }
        })
    );

    // 注册启用命令
    const enableCommand = vscode.commands.registerCommand('go-json-log-viewer.enable', () => {
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
        // 用户手动打开彩色日志视图时，应该获取焦点（preserveFocus设置为false）
        createOrShowWebView(context.extensionUri, false);
    });
    
    // 创建装饰器类型
    for (const [severity, color] of Object.entries(severityColors)) {
        decorationTypes[severity] = vscode.window.createTextEditorDecorationType({
            color,
            fontWeight: severity === 'ERROR' || severity === 'FATAL' ? 'bold' : 'normal'
        });
    }
    
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
    function createOrShowWebView(extensionUri: vscode.Uri, preserveFocus: boolean = true) {
        const columnToShowIn = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : vscode.ViewColumn.One;

        if (webviewPanel) {
            webviewPanel.reveal(columnToShowIn || vscode.ViewColumn.One, preserveFocus);
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
        
        // 创建后立即应用动态样式
        updateWebViewStyles();

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
        
        // 如果需要保持原焦点，则主动将焦点还给之前的活跃编辑器
        if (preserveFocus && vscode.window.activeTextEditor) {
            setTimeout(() => {
                vscode.window.showTextDocument(
                    vscode.window.activeTextEditor!.document,
                    vscode.window.activeTextEditor!.viewColumn
                );
            }, 100);
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
                .top-bar {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    background: #f5f5f5;
                    border-bottom: 1px solid #ddd;
                    padding: 8px;
                    display: flex;
                    align-items: center;
                    z-index: 100;
                }
                .search-container {
                    display: flex;
                    align-items: center;
                    flex: 1;
                    margin-right: 10px;
                }
                .search-input {
                    flex: 1;
                    padding: 5px 10px;
                    border: 1px solid #ccc;
                    border-radius: 3px;
                    font-size: 14px;
                    margin-right: 5px;
                }
                .search-btn, .clear-search-btn, .toggle-all-btn, .clear-btn {
                    padding: 5px 10px;
                    background: #eee;
                    border: 1px solid #ccc;
                    border-radius: 3px;
                    cursor: pointer;
                    margin-left: 5px;
                }
                .search-btn:hover, .clear-search-btn:hover, .toggle-all-btn:hover, .clear-btn:hover {
                    background: #ddd;
                }
                .log-container {
                    width: 100%;
                    overflow-y: auto;
                    max-height: 100vh;
                    margin-top: 50px; /* 为顶部栏留出空间 */
                }
                .log-entry {
                    display: flex;
                    margin-bottom: 6px;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 6px;
                    position: relative;
                }
                .log-entry.hidden {
                    display: none;
                }
                .log-entry.highlight {
                    background-color: #fffde7;
                }
                .toggle-btn {
                    cursor: pointer;
                    width: 16px;
                    text-align: center;
                    font-weight: bold;
                    user-select: none;
                    color: #666;
                    margin-right: 5px;
                    align-self: flex-start;
                }
                .toggle-btn:hover {
                    color: #000;
                }
                .log-metadata {
                    flex: 0 0 auto;
                    width: 30%;
                    min-width: 200px;
                    max-width: 350px;
                    padding-right: 10px;
                    border-right: 1px solid #eee;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }
                .meta-item {
                    white-space: nowrap;
                    text-overflow: ellipsis;
                    overflow: hidden;
                    margin-bottom: 2px;
                }
                .log-content {
                    flex: 1;
                    padding-left: 15px;
                    overflow-wrap: break-word;
                }
                .severity {
                    font-weight: bold;
                    display: inline-block;
                    min-width: 60px;
                }
                .timestamp {
                    color: #555;
                    margin-right: 8px;
                }
                .caller {
                    color: #6F42C1;
                }
                .message {
                    font-weight: normal;
                }
                .extra {
                    margin-top: 4px;
                    color: #666;
                    font-size: 12px;
                }
                .collapsed .log-content {
                    display: none;
                }
                .collapsed .log-metadata {
                    border-right: none;
                }
                .matched-text {
                    background-color: #fff59d;
                    font-weight: bold;
                }
                .search-stats {
                    margin-left: 10px;
                    color: #666;
                    font-size: 12px;
                }
                /* 动态样式将由updateWebViewStyles函数注入 */
                #dynamicStyles {
                    /* 动态CSS将在这里注入 */
                }
            </style>
            <style id="dynamicStyles"></style>
        </head>
        <body>
            <div class="top-bar">
                <div class="search-container">
                    <input type="text" class="search-input" id="searchInput" placeholder="输入关键字搜索..." />
                    <button class="search-btn" onclick="searchLogs()">搜索</button>
                    <button class="clear-search-btn" onclick="clearSearch()">清除搜索</button>
                    <span class="search-stats" id="searchStats"></span>
                </div>
                <button class="toggle-all-btn" onclick="toggleAllLogs()">展开/折叠全部</button>
                <button class="clear-btn" onclick="clearLogs()">清除日志</button>
            </div>
            <div id="logContainer" class="log-container"></div>
            <script>
                const vscode = acquireVsCodeApi();
                const logContainer = document.getElementById('logContainer');
                const dynamicStyles = document.getElementById('dynamicStyles');
                const searchInput = document.getElementById('searchInput');
                const searchStats = document.getElementById('searchStats');
                
                // 默认所有日志都是折叠状态
                let allCollapsed = true;
                let currentSearchTerm = '';

                // 接收消息
                window.addEventListener('message', event => {
                    const message = event.data;

                    if (message.type === 'addLog') {
                        const logEntry = document.createElement('div');
                        logEntry.className = 'log-entry collapsed'; // 默认是折叠状态
                        logEntry.innerHTML = message.html;
                        logContainer.appendChild(logEntry);
                        logContainer.scrollTop = logContainer.scrollHeight;
                        
                        // 如果有搜索关键字，应用搜索过滤
                        if (currentSearchTerm) {
                            applySearch(logEntry, currentSearchTerm);
                        }
                    } else if (message.type === 'clear') {
                        logContainer.innerHTML = '';
                        clearSearch();
                    } else if (message.type === 'updateStyles') {
                        // 更新动态样式
                        dynamicStyles.textContent = message.css;
                    }
                });

                function clearLogs() {
                    vscode.postMessage({
                        command: 'clearLogs'
                    });
                    logContainer.innerHTML = '';
                    clearSearch();
                }
                
                // 切换单个日志的折叠状态
                function toggleLogEntry(element) {
                    const logEntry = element.closest('.log-entry');
                    if (logEntry.classList.contains('collapsed')) {
                        logEntry.classList.remove('collapsed');
                    } else {
                        logEntry.classList.add('collapsed');
                    }
                }
                
                // 切换所有日志的折叠状态
                function toggleAllLogs() {
                    const logEntries = document.querySelectorAll('.log-entry:not(.hidden)');
                    allCollapsed = !allCollapsed;
                    
                    logEntries.forEach(entry => {
                        if (allCollapsed) {
                            entry.classList.add('collapsed');
                        } else {
                            entry.classList.remove('collapsed');
                        }
                    });
                }
                
                // 对日志内容进行搜索
                function searchLogs() {
                    const searchTerm = searchInput.value.trim().toLowerCase();
                    currentSearchTerm = searchTerm;
                    
                    if (!searchTerm) {
                        clearSearch();
                        return;
                    }
                    
                    const allLogs = document.querySelectorAll('.log-entry');
                    let matchCount = 0;
                    
                    allLogs.forEach(log => {
                        applySearch(log, searchTerm);
                        if (!log.classList.contains('hidden')) {
                            matchCount++;
                        }
                    });
                    
                    // 更新搜索统计信息
                    searchStats.textContent = "找到 " + matchCount + " 条匹配日志";
                    
                    // 如果有匹配，自动展开所有匹配的日志
                    if (matchCount > 0) {
                        allCollapsed = false;
                        document.querySelectorAll('.log-entry:not(.hidden)').forEach(entry => {
                            entry.classList.remove('collapsed');
                        });
                    }
                }
                
                // 对单个日志条目应用搜索过滤
                function applySearch(logEntry, searchTerm) {
                    // 移除之前的高亮
                    const oldHighlights = logEntry.querySelectorAll('.matched-text');
                    oldHighlights.forEach(el => {
                        const parent = el.parentNode;
                        parent.replaceChild(document.createTextNode(el.textContent), el);
                    });
                    
                    const logText = logEntry.textContent.toLowerCase();
                    const hasMatch = logText.includes(searchTerm);
                    
                    // 显示或隐藏日志
                    if (hasMatch) {
                        logEntry.classList.remove('hidden');
                        
                        // 高亮匹配文本
                        highlightMatches(logEntry, searchTerm);
                    } else {
                        logEntry.classList.add('hidden');
                    }
                }
                
                // 高亮匹配的文本
                function highlightMatches(element, searchTerm) {
                    if (element.nodeType === 3) { // 文本节点
                        const text = element.nodeValue;
                        const lcText = text.toLowerCase();
                        let index = lcText.indexOf(searchTerm);
                        
                        if (index >= 0) {
                            const matchLength = searchTerm.length;
                            const beforeMatch = document.createTextNode(text.substring(0, index));
                            const matched = document.createElement('span');
                            matched.className = 'matched-text';
                            matched.textContent = text.substring(index, index + matchLength);
                            const afterMatch = document.createTextNode(text.substring(index + matchLength));
                            const parent = element.parentNode;
                            
                            parent.insertBefore(beforeMatch, element);
                            parent.insertBefore(matched, element);
                            parent.insertBefore(afterMatch, element);
                            parent.removeChild(element);
                            
                            // 递归处理剩余部分
                            highlightMatches(afterMatch, searchTerm);
                        }
                    } else if (element.nodeType === 1) { // 元素节点
                        // 只处理非脚本和样式元素
                        if (element.tagName !== 'SCRIPT' && element.tagName !== 'STYLE') {
                            Array.from(element.childNodes).forEach(child => {
                                highlightMatches(child, searchTerm);
                            });
                        }
                    }
                }
                
                // 清除搜索结果，显示所有日志
                function clearSearch() {
                    searchInput.value = '';
                    currentSearchTerm = '';
                    searchStats.textContent = '';
                    
                    // 显示所有日志，移除高亮
                    const allLogs = document.querySelectorAll('.log-entry');
                    allLogs.forEach(log => {
                        log.classList.remove('hidden');
                        
                        // 移除高亮
                        const highlights = log.querySelectorAll('.matched-text');
                        highlights.forEach(el => {
                            const parent = el.parentNode;
                            parent.replaceChild(document.createTextNode(el.textContent), el);
                        });
                    });
                }
                
                // 添加回车键搜索功能
                searchInput.addEventListener('keyup', function(event) {
                    if (event.key === 'Enter') {
                        searchLogs();
                    }
                });
                
                // 事件委托，处理折叠按钮的点击事件
                logContainer.addEventListener('click', function(event) {
                    if (event.target.classList.contains('toggle-btn')) {
                        toggleLogEntry(event.target);
                    }
                });
            </script>
        </body>
        </html>`;
    }

    // 更新WebView样式
    function updateWebViewStyles() {
        if (webviewPanel) {
            let css = '';
            for (const [severity, color] of Object.entries(severityColors)) {
                css += `.${severity} { color: ${color}; `;
                if (severity === 'ERROR' || severity === 'FATAL') {
                    css += 'font-weight: bold; ';
                }
                css += '}\n';
            }
            
            webviewPanel.webview.postMessage({
                type: "updateStyles",
                css: css
            });
        }
    }

    // 更新WebView内容
    function updateWebView() {
        if (webviewPanel) {
            // 首先更新样式
            updateWebViewStyles();
            
            // 然后更新日志内容
            if (logBuffer.length > 0) {
                logBuffer.forEach((logHtml) => {
                    webviewPanel!.webview.postMessage({
                        type: "addLog",
                        html: logHtml,
                    });
                });
                logBuffer = [];
            }
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
                          <div class="toggle-btn" title="展开/折叠日志">▶</div>
                          <div class="log-metadata">
                            <span class="meta-item timestamp">[${time}]</span>
                            <span class="meta-item severity ${severity}">[${severity}]</span>
                            <span class="meta-item caller">[${caller}]</span>
                          </div>
                          <div class="log-content">
                            <span class="message">${message}</span>
                            ${extraInfo ? `<div class="extra">${extraInfo}</div>` : ''}
                          </div>
                        `;

                        // 添加到WebView
                        addLogToWebView(logHtml);
                        
                        // 显示输出通道但不切换焦点
                        logOutputChannel.show(false);
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
                          <div class="toggle-btn" title="展开/折叠日志">▶</div>
                          <div class="log-metadata">
                            <span class="meta-item timestamp">[${time}]</span>
                            <span class="meta-item severity ${severity}">[${severity}]</span>
                            <span class="meta-item caller">[${caller}]</span>
                          </div>
                          <div class="log-content">
                            <span class="message">${message}</span>
                            ${extra ? `<div class="extra">${extra}</div>` : ''}
                          </div>
                        `;

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
        
        // 自动打开彩色日志查看器，但保持原焦点
        createOrShowWebView(context.extensionUri, true);
        
        // 显示输出通道但不切换焦点
        logOutputChannel.show(false);
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
    
    /**
     * 对所有可见编辑器重新应用日志装饰器
     */
    function applyDecorationsToVisibleEditors() {
        vscode.window.visibleTextEditors.forEach(editor => {
            if (isEnabled && editor.document.languageId === 'json-log') {
                updateDecorations(editor);
            }
        });
    }
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