const vscode = require('vscode');
const Diff = require('diff');
const diff2html = require('diff2html');
const path = require('path');
const { contentTimelineStyles } = require('./webViewStyles');

class ContentTimelineManager {
    constructor() {
        this.contentTimeline = [];
        this.webviewPanel = null;
        this.currentEvent = null;
        this.idCounter = 0;
        this.eventHtmlMap = {}; // Map to track event ID and its corresponding HTML element
        this.previousSaveContent = {}; // To store the previous version of the file content
    }

    processEvent(event) {
        this.currentEvent = {
            id: this.idCounter++,
            time: event.time,
            type: event.type,
            data: event
        };

        if (event.type === 'save') {
            this.handleSaveEvent(this.currentEvent);
        } else if (event.type === 'execution') {
            this.handleExecutionEvent(this.currentEvent);
        } else if (event.type === 'selection') {
            this.handleSelectionEvent(this.currentEvent);
        }

        this.updateWebPanel();
    }

    handleSelectionEvent(event) {
        const fileName = this.getFilename(event.data.document);
        let htmlLines = '';

        const startLine = event.data.range[0];
        const endLine = event.data.range[1];
        const startChar = event.data.charRange[0];
        const endChar = event.data.charRange[1];
        const documentText = event.data.allText.split('\n');

        htmlLines = documentText.slice(startLine - 1, endLine).map((line, index) => {
            const lineNumber = startLine + index;
    
            if (lineNumber === startLine && lineNumber === endLine) {
                // The selection is only on one line
                const highlightedLine = line.substring(0, startChar) +
                    `<strong>${line.substring(startChar, endChar)}</strong>` +
                    line.substring(endChar);
                return `<span class="clickable-line" data-line-number="${lineNumber - 1}" data-filename="${fileName}">${lineNumber}: ${highlightedLine}</span>`;
            } else if (lineNumber === startLine) {
                // The selection starts on this line
                const highlightedLine = line.substring(0, startChar) +
                    `<strong>${line.substring(startChar)}</strong>`;
                return `<span class="clickable-line" data-line-number="${lineNumber - 1}" data-filename="${fileName}">${lineNumber}: ${highlightedLine}</span>`;
            } else if (lineNumber === endLine) {
                // The selection ends on this line
                const highlightedLine = `<strong>${line.substring(0, endChar)}</strong>` +
                    line.substring(endChar);
                return `<span class="clickable-line" data-line-number="${lineNumber - 1}" data-filename="${fileName}">${lineNumber}: ${highlightedLine}</span>`;
            } else {
                // Entire line is part of the selection
                return `<span class="clickable-line" data-line-number="${lineNumber - 1}" data-filename="${fileName}">${lineNumber}: <strong>${line}</strong></span>`;
            }
        }).join('<br>');

        event.data.notes = `Click: ${new Date(event.time * 1000).toLocaleDateString()} ${new Date(event.time * 1000).toLocaleTimeString()}`;
        event.data.diffHtml = htmlLines;

        this.contentTimeline.push(event);
        this.eventHtmlMap[event.id] = this.generateEventHTML(event);
    }

    handleSaveEvent(event) {
        const documentPath = event.data.document;
        const newContent = event.data.code_text;
        const fileName = this.getFilename(documentPath);
    
        let diffHtml = '';
        if (this.previousSaveContent[documentPath]) {
            const diff = Diff.createTwoFilesPatch(
                'Previous Version',
                'Current Version',
                this.previousSaveContent[documentPath],
                newContent,
                '',
                ''
            );
    
            diffHtml = this.generateDiffHTML(diff, fileName);
        }
    
        this.previousSaveContent[documentPath] = newContent;
    
        event.data.diffHtml = diffHtml;
        event.data.notes = `Save at ${new Date(event.time * 1000).toLocaleDateString()} ${new Date(event.time * 1000).toLocaleTimeString()}`;
    
        this.contentTimeline.push(event);
        this.eventHtmlMap[event.id] = this.generateEventHTML(event);
    }    
    
    handleExecutionEvent(event) {
        const buildEvent = {
            id: this.idCounter++,
            time: event.time,
            type: 'build',
            data: {
                document: event.data.document,
                notes: `Build at ${new Date(event.time * 1000).toLocaleDateString()} ${new Date(event.time * 1000).toLocaleTimeString()}`
            }
        };

        this.contentTimeline.push(buildEvent);
        this.eventHtmlMap[buildEvent.id] = this.generateBuildHTML(buildEvent);
    }

    generateDiffHTML(diff, fileName) {
        const diffHtml = diff2html.html(diff, {
            outputFormat: 'side-by-side',
            drawFileList: false,
            colorScheme: 'auto'
        });
        // console.log(diffHtml);

        let lastLineNumber = null;
        const modifiedHtml = diffHtml
            .replace(/<td class="d2h-code-side-linenumber(?: [\w-]+)*">\s*(\d+)\s*<\/td>/g, (match, lineNumber) => {
                lastLineNumber = lineNumber; // Store the current line number for later
                return `<td class="d2h-code-side-linenumber">
                            <span class="clickable-line" data-line-number="${lineNumber - 1}" data-filename="${fileName}">${lineNumber}</span>
                        </td>`;
            });

        const finalHtml = modifiedHtml.replace(/<span class="d2h-code-line-ctn">(.+?)<\/span>/g, (match, content) => {
            // Apply the line number to the corresponding code content
            if (lastLineNumber) {
                return `<span class="clickable-line d2h-code-line-ctn" data-line-number="${lastLineNumber}" data-filename="${fileName}" data-line-content="${content.trim()}">${content}</span>`;
            } else {
                return match; // If no valid line number, return the original match
            }
        });
            
        // Handle empty placeholder lines for deleted content
        finalHtml.replace(/<td class="d2h-code-side-linenumber d2h-code-side-emptyplaceholder(?: [\w-]+)*"><\/td>/g, () => {
                return `<td class="d2h-code-side-linenumber d2h-code-side-emptyplaceholder">
                            <span class="clickable-line" data-line-number="${lastLineNumber}" data-filename="${fileName}"></span>
                        </td>`;
            });

        return `<div class="diff-container">${finalHtml}</div>`;
    }    

    generateEventHTML(event) {
        const fileName = this.getFilename(event.data.document);

        return `
            <div class="event" id="event-${event.id}">
                <span data-file="${fileName}">
                    <strong>${fileName}</strong>
                </span>    
                <br>
                <div class="event-content">
                    ${event.data.diffHtml || ''}
                </div>
                ${event.data.notes}

            </div>
        `;
    }

    generateBuildHTML(event) {
        return `
            <hr>
            <div id="event-${event.id}">
                <strong>${event.data.notes}</strong>
            </div>
            <hr>
        `;
    }

    updateWebPanel() {
        if (!this.webviewPanel) {
            this.webviewPanel = vscode.window.createWebviewPanel(
                'contentTimeline',
                'Content Timeline',
                vscode.ViewColumn.Beside,
                { enableScripts: true }
            );
        }

        this.webviewPanel.webview.html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Content Timeline</title>
                <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/diff2html/bundles/css/diff2html.min.css" />
                <script type="text/javascript" src="https://cdn.jsdelivr.net/npm/diff2html/bundles/js/diff2html.min.js"></script>
                <style>
                    ${contentTimelineStyles}
                </style>
            </head>
            <body>
                <h1>Content Timeline</h1>
                <div id="content">
                    ${Object.values(this.eventHtmlMap).join('')}
                </div>
            </body>
            <script>
                const vscode = acquireVsCodeApi();

                window.addEventListener('click', function(event) {
                    const target = event.target;

                    // Find the closest clickable-line SPAN or DIV (for both line content and line numbers)
                    const lineElement = target.closest('.clickable-line');
                    if (lineElement) {
                        // Print out the HTML tag of the clicked element for debugging
                        console.log("Clicked element:", lineElement.outerHTML);

                        // Continue with the existing logic (optional)
                        const lineNumber = lineElement.getAttribute('data-line-number');
                        const fileName = lineElement.getAttribute('data-filename');

                        console.log('Line Number:', lineNumber);
                        console.log('File Name:', fileName);

                        vscode.postMessage({
                            command: 'navigateToLine',
                            line: lineNumber,
                            fileName: fileName
                        });
                    }
                });
            </script>
            </html>
        `;

        this.webviewPanel.webview.onDidReceiveMessage((message) => {
            if (message.command === 'navigateToLine') {
                this.navigateToLine(message.fileName, message.line);
            }
        });
    }

    async navigateToLine(fileName, lineNumber) {
        let fileUri;
        if(path.isAbsolute(fileName)){
            fileUri = vscode.Uri.file(fileName);
        } else {
            // resolve the filename relative to the workspace
            const workspaceFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
            if(workspaceFolder){
                const resolvedPath = path.join(workspaceFolder.uri.fsPath, fileName);
                fileUri = vscode.Uri.file(resolvedPath);
            } else {
                vscode.window.showErrorMessage('No workspace folder is open. Unable to resolve relative file path.');
                return;
            }
        }
    
        try {
            // Check if the file is already opened in any visible editor
            const openedEditor = vscode.window.visibleTextEditors.find(editor => {
                const editorFilePath = editor.document.uri.fsPath;
                return editorFilePath === fileUri.fsPath;
            });

            if (openedEditor) {
                // The file is already opened, navigate to the correct line
                const document = openedEditor.document;
                const lineCount = document.lineCount;

                // Validate the line number and find the nearest valid line if necessary
                const validLine = Math.min(Math.max(0, lineNumber), lineCount - 1);

                // Create a range for the target line
                const range = new vscode.Range(validLine, 0, validLine, 0);

                // Reveal the target line in the editor
                openedEditor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                openedEditor.selection = new vscode.Selection(range.start, range.end);
            } else {
                // The file is not opened, open it in a new tab on the main editor (ViewColumn.One)
                const document = await vscode.workspace.openTextDocument(fileUri);
                const editor = await vscode.window.showTextDocument(document, {
                    viewColumn: vscode.ViewColumn.One, // Open in the left/main editor tab
                    preserveFocus: false // Focus on the new tab
                });
                const lineCount = document.lineCount;

                // Validate the line number and find the nearest valid line if necessary
                const validLine = Math.min(Math.max(0, lineNumber), lineCount - 1);

                // Create a range for the target line
                const range = new vscode.Range(validLine, 0, validLine, 0);

                // Reveal the target line in the editor
                editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                editor.selection = new vscode.Selection(range.start, range.end);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Unable to open or navigate to file: ${fileName}. Error: ${error.message}`);
        }
    }
    
    getFilename(documentPath) {
        return path.basename(documentPath);
    }
}

module.exports = ContentTimelineManager;