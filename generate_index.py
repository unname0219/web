import os
from datetime import datetime

def scan_directory(root_dir):
    file_list = []
    for root, dirs, files in os.walk(root_dir):
        # 忽略 .git 和自身生成的 sindex.html（避免递归）
        if '.git' in root or 'sindex.html' in files:
            files.remove('sindex.html')
        for file in files:
            full_path = os.path.join(root, file)
            relative_path = os.path.relpath(full_path, root_dir)
            file_list.append({
                "name": file,
                "path": relative_path.replace('\\', '/')  # 统一路径格式
            })
    return file_list

def generate_html(file_list):
    html_template = f'''
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <title>Auto Index | {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</title>
        <!-- 这里粘贴之前提供的 CSS 样式 -->
        <style>
            /* 之前提供的完整 CSS 代码 */
        </style>
    </head>
    <body>
        <div class="header">
            <h1>📁 Auto Index (自动更新)</h1>
            <small>最后更新: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</small>
        </div>
        <div class="file-list" id="fileList">
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

if __name__ == "__main__":
    file_list = scan_directory('.')  # 扫描当前目录
    generate_html(file_list)
