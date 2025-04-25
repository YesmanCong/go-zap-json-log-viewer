const fs = require("fs");

const packageJson = {
  name: "go-json-log-viewer",
  displayName: "Go JSON Log Viewer",
  description: "高亮显示Go语言JSON格式日志，根据severity字段区分日志级别",
  version: "0.0.1",
  publisher: "vscode-user",
  engines: {
    vscode: "^1.60.0",
  },
  categories: ["Other"],
  activationEvents: ["onStartupFinished"],
  main: "./dist/extension.js",
  contributes: {
    commands: [
      {
        command: "go-json-log-viewer.enable",
        title: "启用Go JSON日志高亮",
      },
      {
        command: "go-json-log-viewer.disable",
        title: "禁用Go JSON日志高亮",
      },
    ],
  },
  scripts: {
    compile: "webpack",
    watch: "webpack --watch",
    package: "webpack --mode production",
    test: 'echo "Error: no test specified" && exit 1',
  },
  keywords: ["go", "log", "json", "highlight"],
  author: "VSCode User",
  license: "MIT",
  devDependencies: {
    "@types/vscode": "^1.60.0",
    "ts-loader": "^9.5.2",
    typescript: "^5.8.3",
    webpack: "^5.99.6",
    "webpack-cli": "^6.0.1",
  },
};

fs.writeFileSync("package.json", JSON.stringify(packageJson, null, 2), "utf8");
console.log("package.json has been updated!");
