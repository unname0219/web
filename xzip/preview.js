/**
 * preview.js - 文件预览模块
 * 支持：图片/视频/音频/PDF/文本/代码高亮
 */
const Preview = {
  url: null,
  el: null,
  _closeCb: null,

  init() {
    this.el = document.getElementById('preview-modal');
    if (!this.el) return;
    // ESC 关闭
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.close();
    });
  },

  async open(blob, filename, closeCb) {
    if (!this.el) this.init();
    this._closeCb = closeCb;
    const ext = filename.split('.').pop().toLowerCase();
    const type = this.detectType(ext, blob.type);

    // 清空旧内容
    const body = document.getElementById('preview-body');
    const img = document.getElementById('preview-img');
    const vid = document.getElementById('preview-video');
    const aud = document.getElementById('preview-audio');
    img.style.display = 'none'; img.src = '';
    vid.style.display = 'none'; vid.pause(); vid.src = '';
    aud.style.display = 'none'; aud.pause(); aud.src = '';
    body.querySelectorAll('.preview-doc, .preview-code-wrap').forEach(e => e.remove());

    // 释放旧 URL
    if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }

    // 设置文件名
    document.getElementById('preview-name').textContent = filename;

    if (type === 'image') {
      this.url = URL.createObjectURL(this.fixMime(blob, ext));
      img.src = this.url;
      img.style.display = 'block';
    } else if (type === 'video') {
      this.url = URL.createObjectURL(this.fixMime(blob, ext));
      vid.src = this.url;
      vid.style.display = 'block';
    } else if (type === 'audio') {
      this.url = URL.createObjectURL(this.fixMime(blob, ext));
      aud.src = this.url;
      aud.style.display = 'block';
    } else if (type === 'pdf') {
      // 用浏览器原生 PDF 查看器打开，需要正确的 MIME type
      const pdfBlob = new Blob([await blob.arrayBuffer()], { type: 'application/pdf' });
      this.url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = this.url;
      a.target = '_blank';
      a.click();
      // 不显示预览弹窗，直接关闭
      return;
    } else if (type === 'code') {
      const text = await blob.text();
      const lang = this.getHighlightLang(ext);
      const wrap = document.createElement('div');
      wrap.className = 'preview-code-wrap';
      wrap.style.cssText = 'width:100%;height:100%;overflow:auto;background:var(--surface);';
      // 用 table 保证行号和代码对齐，逐行高亮
      const table = document.createElement('table');
      table.style.cssText = 'border-collapse:collapse;font-size:13px;line-height:1.6;font-family:ui-monospace,monospace;';
      const lines = text.split('\n');
      const canHljs = window.hljs && lang;
      for (let i = 0; i < lines.length; i++) {
        const tr = document.createElement('tr');
        const tdNum = document.createElement('td');
        tdNum.style.cssText = 'padding:0 8px 0 16px;text-align:right;color:var(--text-secondary);opacity:0.5;user-select:none;vertical-align:top;border-right:1px solid var(--border);width:1%;white-space:nowrap;';
        tdNum.textContent = i + 1;
        const tdCode = document.createElement('td');
        tdCode.style.cssText = 'padding:0 16px 0 8px;vertical-align:top;white-space:pre;';
        if (canHljs) {
          try {
            tdCode.innerHTML = hljs.highlight(lines[i], { language: lang, ignoreIllegals: true }).value;
          } catch(e) {
            tdCode.textContent = lines[i];
          }
        } else {
          tdCode.textContent = lines[i];
        }
        tr.appendChild(tdNum);
        tr.appendChild(tdCode);
        table.appendChild(tr);
      }
      wrap.appendChild(table);
      body.appendChild(wrap);
    } else if (type === 'word') {
      const buf = await blob.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer: buf });
      const wrap = document.createElement('div');
      wrap.className = 'preview-doc';
      wrap.style.cssText = 'width:100%;height:100%;overflow:auto;padding:24px;background:var(--surface);font-size:15px;line-height:1.8;color:var(--text);';
      wrap.innerHTML = result.value || '<p style="color:var(--text-secondary)">无法解析此文档</p>';
      body.appendChild(wrap);
    } else if (type === 'excel') {
      const buf = await blob.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const html = XLSX.utils.sheet_to_html(ws, { header: '', footer: '' });
      const wrap = document.createElement('div');
      wrap.className = 'preview-doc';
      wrap.style.cssText = 'width:100%;height:100%;overflow:auto;padding:16px;background:var(--surface);';
      wrap.innerHTML = `<style>table{border-collapse:collapse;font-size:13px}td,th{border:1px solid var(--border);padding:4px 8px}th{background:var(--surface-hover);font-weight:600}</style>` + html;
      body.appendChild(wrap);
    } else {
      // 纯文本 / markdown
      const text = await blob.text();
      const wrap = document.createElement('div');
      wrap.className = 'preview-doc';
      wrap.style.cssText = 'width:100%;height:100%;overflow:auto;padding:16px;background:var(--surface);font-size:14px;line-height:1.7;white-space:pre-wrap;word-break:break-all;font-family:var(--font);color:var(--text);';
      wrap.textContent = text;
      body.appendChild(wrap);
    }

    this.el.classList.add('active');
  },

  close() {
    if (!this.el) return;
    this.el.classList.remove('active');
    // 清理全屏状态
    document.querySelector('.preview-container')?.classList.remove('fullscreen');
    // 清理媒体
    const vid = document.getElementById('preview-video');
    const aud = document.getElementById('preview-audio');
    if (vid) { vid.pause(); vid.src = ''; }
    if (aud) { aud.pause(); aud.src = ''; }
    // 释放 URL
    if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
    // 清理 DOM
    const body = document.getElementById('preview-body');
    body.querySelectorAll('.preview-doc, .preview-code-wrap').forEach(e => e.remove());
    if (typeof this._closeCb === 'function') { this._closeCb(); this._closeCb = null; }
  },

  toggleSize() {
    document.querySelector('.preview-container')?.classList.toggle('fullscreen');
  },

  getMime(ext) {
    const map = {
      jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif',
      webp:'image/webp', svg:'image/svg+xml', bmp:'image/bmp', ico:'image/x-icon',
      avif:'image/avif', heic:'image/heic',
      mp4:'video/mp4', webm:'video/webm', mov:'video/quicktime', mkv:'video/x-matroska',
      avi:'video/x-msvideo', flv:'video/x-flv', wmv:'video/x-ms-wmv', m4v:'video/mp4', ts:'video/mp2t',
      mp3:'audio/mpeg', wav:'audio/wav', ogg:'audio/ogg', flac:'audio/flac',
      m4a:'audio/mp4', aac:'audio/aac', opus:'audio/opus', wma:'audio/x-ms-wma'
    };
    return map[ext] || '';
  },

  fixMime(blob, ext) {
    if (blob.type && blob.type !== 'application/octet-stream') return blob;
    const mime = this.getMime(ext);
    if (!mime) return blob;
    return new Blob([blob], { type: mime });
  },

  detectType(ext, mime) {
    const img = ['jpg','jpeg','png','gif','webp','svg','bmp','ico','avif','heic'];
    const vid = ['mp4','webm','mov','mkv','avi','flv','wmv','m4v','ts'];
    const aud = ['mp3','wav','ogg','flac','m4a','aac','opus','wma'];
    const code = ['c','h','s','java','py','html','htm','css','js','ts','jsx','tsx','json','xml','yml','yaml','toml','ini','conf','rs','go','php','cpp','cc','cxx','sh','bat','cmd','sql','rb','swift','kt','dart','vue'];
    if (img.includes(ext)) return 'image';
    if (vid.includes(ext)) return 'video';
    if (aud.includes(ext)) return 'audio';
    if (ext === 'pdf') return 'pdf';
    if (['doc','docx'].includes(ext)) return 'word';
    if (['xls','xlsx','csv'].includes(ext)) return 'excel';
    if (code.includes(ext)) return 'code';
    return 'text';
  },

  getHighlightLang(ext) {
    const map = {
      c:'c', h:'c', s:'x86asm',
      java:'java', py:'python',
      html:'html', htm:'html', css:'css',
      js:'javascript', ts:'typescript', jsx:'javascript', tsx:'typescript',
      json:'json', xml:'xml',
      yml:'yaml', yaml:'yaml', toml:'ini', ini:'ini', conf:'ini',
      rs:'rust', go:'go', php:'php',
      cpp:'cpp', cc:'cpp', cxx:'cpp',
      sh:'bash', bat:'dos', cmd:'dos',
      sql:'sql', rb:'ruby', swift:'swift', kt:'kotlin', dart:'dart', vue:'xml'
    };
    return map[ext] || ext;
  }
};
