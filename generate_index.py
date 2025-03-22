def generate_html(file_list):
    html_template = f'''
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>文件索引 | {datetime.now().strftime("%Y-%m-%d %H:%M")}</title>
        <style>
            /* 深色主题基础样式 */
            :root {{
                --bg: #121212;
                --surface: #1E1E1E;
                --primary: #BB86FC;
                --secondary: #03DAC6;
                --text: #E0E0E0;
                --error: #CF6679;
                --divider: rgba(255,255,255,0.12);
            }}

            * {{
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }}

            body {{
                font-family: 'Segoe UI', system-ui, sans-serif;
                background: var(--bg);
                color: var(--text);
                line-height: 1.6;
                padding: 2rem;
                max-width: 1200px;
                margin: 0 auto;
                min-height: 100vh;
            }}

            /* 头部样式 */
            .header {{
                border-bottom: 2px solid var(--divider);
                padding-bottom: 1.5rem;
                margin-bottom: 2rem;
                display: flex;
                justify-content: space-between;
                align-items: flex-end;
            }}

            h1 {{
                color: var(--primary);
                font-size: 2rem;
                font-weight: 600;
            }}

            .last-updated {{
                color: var(--secondary);
                font-size: 0.9rem;
                opacity: 0.8;
            }}

            /* 文件列表容器 */
            .file-list {{
                background: var(--surface);
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.25);
                overflow: hidden;
            }}

            /* 文件条目 */
            .file-item {{
                display: flex;
                align-items: center;
                padding: 1rem;
                border-bottom: 1px solid var(--divider);
                transition: all 0.2s ease;
                text-decoration: none;
                color: inherit;
            }}

            .file-item:hover {{
                background: rgba(255,255,255,0.05);
                transform: translateX(4px);
            }}

            /* 文件名 */
            .file-name {{
                flex: 0 0 300px;
                font-weight: 500;
                color: var(--primary);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }}

            /* 文件路径 */
            .file-path {{
                flex: 1;
                color: rgba(224,224,224,0.7);
                font-family: 'Fira Code', monospace;
                font-size: 0.9rem;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }}

            /* 类型图标 */
            .file-type {{
                width: 24px;
                height: 24px;
                margin-right: 1rem;
                filter: invert(0.8);
            }}

            /* 响应式设计 */
            @media (max-width: 768px) {{
                body {{
                    padding: 1rem;
                }}

                .file-item {{
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 0.5rem;
                }}

                .file-name {{
                    flex: none;
                    width: 100%;
                }}
            }}

            /* 滚动条样式 */
            ::-webkit-scrollbar {{
                width: 8px;
                height: 8px;
            }}

            ::-webkit-scrollbar-track {{
                background: rgba(0,0,0,0.2);
            }}

            ::-webkit-scrollbar-thumb {{
                background: var(--primary);
                border-radius: 4px;
            }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🗂️ 项目文件索引</h1>
            <div class="last-updated">
                最后更新: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
            </div>
        </div>

        <div class="file-list">
            {'\n'.join([
                f'<a href="{file["path"]}" class="file-item">'
                f'<span class="file-name">{file["name"]}</span>'
                f'<span class="file-path">{file["path"]}</span>'
                f'</a>'
                for file in file_list
            ])}
        </div>
    </body>
    </html>
    '''
    with open('sindex.html', 'w', encoding='utf-8') as f:
        f.write(html_template)
