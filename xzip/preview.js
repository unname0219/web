/**
 * preview.js - 文件预览模块
 * 支持：图片/视频/音频/PDF/文本/代码高亮
 * 返回手势：预览打开时按系统返回键 = 关闭预览（需再按一次才退出网页）
 */
const Preview = {
  url: null,
  el: null,
  _closeCb: null,
  _historyPushed: false,
  // 渲染令牌：每次 open/teardown 自增，过期渲染任务直接中止
  _renderToken: 0,

  init() {
    this.el = document.getElementById('preview-modal');
    if (!this.el) return;
    // ESC 关闭
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.isOpen()) this.close();
    });
    // 系统返回键由 index.html 中的中央 popstate 统一分发：
    // Preview 开着时调用 handleBack()，只关闭预览不动守卫。
  },

  /* 系统返回触发：只做清理（预览条目已被浏览器弹出） */
  handleBack() {
    this._historyPushed = false;
    this._teardown();
  },

  isOpen() {
    return !!(this.el && this.el.classList.contains('active'));
  },

  isMobile() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  },

  /* 显示环形进度并等一帧，确保遮罩先绘制出来，再执行重活 */
  progress(text, indeterminate = true) {
    RingProgress.show(text, indeterminate);
    return new Promise(r => setTimeout(r, 30));
  },

  async open(blob, filename, closeCb) {
    if (!this.el) this.init();
    this._closeCb = closeCb;
    const token = ++this._renderToken;
    const ext = filename.split('.').pop().toLowerCase();
    const type = this.detectType(ext, blob.type);

    // 复用历史条目：上一个预览还开着时，不重复 push
    let hadHistory = this._historyPushed;

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
      RingProgress.hide();
    } else if (type === 'video') {
      this.url = URL.createObjectURL(this.fixMime(blob, ext));
      vid.src = this.url;
      vid.style.display = 'block';
      RingProgress.hide();
    } else if (type === 'audio') {
      this.url = URL.createObjectURL(this.fixMime(blob, ext));
      aud.src = this.url;
      aud.style.display = 'block';
      RingProgress.hide();
    } else if (type === 'pdf') {
      // iPad 新系统 UA 伪装成 Mac（不含 iPad 字样），按触摸点补充识别
      const iPad = navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform || '');
      if (!this.isMobile() && !iPad) {
        // 桌面浏览器（Edge/Firefox/Chrome/Safari）都内置 PDF 查看器：
        // 直接 iframe 内嵌 blob，渲染快、滚动/缩放/搜索与浏览器原生一致
        this.el.classList.add('active');
        if (!hadHistory) {
          try { history.pushState({ __preview: true }, ''); this._historyPushed = true; hadHistory = true; } catch(e) {}
        }
        await this.progress('正在打开 PDF...');
        if (token !== this._renderToken) return;
        this.url = URL.createObjectURL(this.fixMime(blob, ext));
        const frame = document.createElement('iframe');
        frame.className = 'preview-doc'; // 复用预览内容的统一清理逻辑
        frame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:#525659;';
        frame.src = this.url;
        body.appendChild(frame);
      } else {
        // 手机端：统一用 pdf.js 渲染为页面
        const wrap = document.createElement('div');
        wrap.className = 'preview-doc';
        wrap.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:auto;background:#525659;padding:12px;display:flex;flex-direction:column;align-items:center;gap:12px;';
        body.appendChild(wrap);
        // 立即弹出预览层
        this.el.classList.add('active');
        if (!hadHistory) {
          try { history.pushState({ __preview: true }, ''); this._historyPushed = true; hadHistory = true; } catch(e) {}
        }
        // 全部页面渲染完成前用环形遮罩盖住：用户无法滚动，
        // 新页插入不会再造成"跳来跳去"，也清楚知道在加载
        RingProgress.show('正在加载 PDF...');

        let pdfDoc;
        try {
          pdfDoc = await this.openPdfJsDoc(blob);
          if (token !== this._renderToken) return;
        } catch (e) {
          // 所有渲染尝试都失败：明确提示 + 手动下载按钮，绝不静默/自动下载
          RingProgress.hide();
          this.showPdfFatal(wrap, e, blob, filename);
          return;
        }

        RingProgress.show('正在渲染第 1/' + pdfDoc.numPages + ' 页...', false);
        const availW = wrap.clientWidth - 24;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let p = 1; p <= pdfDoc.numPages; p++) {
          if (token !== this._renderToken) return;
          RingProgress.setText(`正在渲染第 ${p}/${pdfDoc.numPages} 页...`);
          RingProgress.set((p - 1) / pdfDoc.numPages * 100);
          const page = await pdfDoc.getPage(p);
          const baseVp = page.getViewport({ scale: 1 });
          // 官方写法：渲染倍率直接含 dpr，CSS 用 width:100% 缩回，不用 transform
          const cssScale = Math.min(Math.max(availW / baseVp.width, 0.4), 3);
          const viewport = page.getViewport({ scale: cssScale * dpr });
          const canvas = document.createElement('canvas');
          canvas.style.cssText = 'width:100%;max-width:' + Math.floor(viewport.width / dpr) + 'px;height:auto;box-shadow:0 2px 8px rgba(0,0,0,0.3);background:#fff;';
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext('2d');
          wrap.appendChild(canvas);
          await page.render({ canvasContext: ctx, viewport }).promise;
        }
        RingProgress.hide();
      }
    } else if (type === 'code') {
      await this.progress('正在读取文件...');
      const text = await blob.text();
      if (token !== this._renderToken) return;
      const lang = this.getHighlightLang(ext);
      const wrap = document.createElement('div');
      wrap.className = 'preview-code-wrap';
      wrap.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:auto;background:var(--surface);';
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
      await this.progress('正在解析文档...');
      const buf = await blob.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer: buf });
      if (token !== this._renderToken) return;
      const wrap = document.createElement('div');
      wrap.className = 'preview-doc';
      wrap.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:auto;padding:24px;background:var(--surface);font-size:15px;line-height:1.8;color:var(--text);';
      wrap.innerHTML = result.value || '<p style="color:var(--text-secondary)">无法解析此文档</p>';
      body.appendChild(wrap);
    } else if (type === 'excel') {
      await this.progress('正在解析表格...');
      const buf = await blob.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      if (token !== this._renderToken) return;
      const ws = wb.Sheets[wb.SheetNames[0]];
      const html = XLSX.utils.sheet_to_html(ws, { header: '', footer: '' });
      const wrap = document.createElement('div');
      wrap.className = 'preview-doc';
      wrap.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:auto;padding:16px;background:var(--surface);';
      wrap.innerHTML = `<style>table{border-collapse:collapse;font-size:13px}td,th{border:1px solid var(--border);padding:4px 8px}th{background:var(--surface-hover);font-weight:600}</style>` + html;
      body.appendChild(wrap);
    } else {
      // 纯文本 / markdown
      await this.progress('正在读取文件...');
      const text = await blob.text();
      if (token !== this._renderToken) return;
      const wrap = document.createElement('div');
      wrap.className = 'preview-doc';
      wrap.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:auto;padding:16px;background:var(--surface);font-size:14px;line-height:1.7;white-space:pre-wrap;word-break:break-all;font-family:var(--font);color:var(--text);';
      wrap.textContent = text;
      body.appendChild(wrap);
    }

    this.el.classList.add('active');

    // 推入一条历史，拦截系统返回键
    if (!hadHistory) {
      try {
        history.pushState({ __preview: true }, '');
        this._historyPushed = true;
      } catch(e) {}
    }

    // 内容已就绪：统一隐藏环形进度条（PDF 等已自行隐藏的，重复调用无害）
    RingProgress.hide();
  },

  close() {
    if (!this.el) return;
    this._teardown();
    // 我们 push 的历史条目还在栈里：用 back() 移除。
    // 弹出时中央 popstate 会看到守卫仍 armed，需要静默一次。
    if (this._historyPushed) {
      this._historyPushed = false;
      if (window.ExitGuard && ExitGuard.armed) ExitGuard.suppress = true;
      try { history.back(); } catch(e) {}
    }
  },

  /* 只做 DOM/资源清理，不动历史（幂等） */
  _teardown() {
    // 使进行中的渲染任务立刻失效，并隐藏可能还在的环形进度条
    this._renderToken++;
    RingProgress.hide();
    if (this.el) this.el.classList.remove('active');
    document.querySelector('.preview-container')?.classList.remove('fullscreen');
    const vid = document.getElementById('preview-video');
    const aud = document.getElementById('preview-audio');
    if (vid) { vid.pause(); vid.src = ''; }
    if (aud) { aud.pause(); aud.src = ''; }
    if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
    const body = document.getElementById('preview-body');
    body?.querySelectorAll('.preview-doc, .preview-code-wrap').forEach(e => e.remove());
    if (typeof this._closeCb === 'function') { this._closeCb(); this._closeCb = null; }
  },

  /* ---- PDF 兼容层 ---- */

  // 读取 ArrayBuffer：优先 blob.arrayBuffer()，老浏览器用 FileReader 兜底
  readAB(blob) {
    if (typeof blob.arrayBuffer === 'function') {
      return blob.arrayBuffer().catch(() => new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(fr.error || new Error('读取失败'));
        fr.readAsArrayBuffer(blob);
      }));
    }
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error || new Error('读取失败'));
      fr.readAsArrayBuffer(blob);
    });
  },

  async openPdfJsDoc(blob) {
    if (!window.pdfjsLib) {
      throw new Error('PDF 组件未加载（请检查网络后刷新）');
    }
    // Worker 用绝对路径，避免部分手机浏览器相对路径解析失败
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        new URL('lib/pdf.worker.min.js?v=202610073', location.href).href;
    } catch (e) {
      try { pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js?v=202610073'; } catch {}
    }

    const buf = await this.readAB(blob);
    const data = new Uint8Array(buf);
    // 第一次：标准 Worker
    try {
      RingProgress.setText('正在加载 PDF...');
      return await pdfjsLib.getDocument({
        data,
        isEvalSupported: false
      }).promise;
    } catch (e1) {
      console.warn('pdf.js Worker 模式失败，尝试主线程模式:', e1);
      RingProgress.setText('正在切换兼容模式...');
      // 等一帧，让提示渲染
      await new Promise(r => setTimeout(r, 60));
      // 第二次：禁用 Worker（fake worker，主线程运行），适配国产/精简浏览器
      return pdfjsLib.getDocument({
        data,
        isEvalSupported: false,
        disableWorker: true,
        disableRange: true,
        disableAutoFetch: true
      }).promise;
    }
  },

  // PDF 彻底无法渲染：错误说明 + 手动下载按钮（用户手势触发，不自动下载）
  showPdfFatal(wrap, err, blob, filename) {
    wrap.innerHTML = '';
    const box = document.createElement('div');
    box.style.cssText = 'max-width:420px;background:#3a3d42;border-radius:12px;padding:20px;color:#fff;font-size:14px;line-height:1.7;text-align:center;word-break:break-word;';
    const msg = (err && err.message) ? err.message : String(err);
    box.innerHTML =
      '<div style="font-size:15px;font-weight:600;margin-bottom:8px;">当前浏览器无法渲染此 PDF</div>' +
      '<div style="opacity:0.75;margin-bottom:16px;font-size:13px;">' + this.escapeHtmlText(msg) + '</div>';
    const btn = document.createElement('button');
    btn.textContent = '⬇ 手动下载该文件';
    btn.style.cssText = 'border:none;background:#4f8ef7;color:#fff;font-size:14px;font-weight:600;padding:10px 20px;border-radius:10px;cursor:pointer;';
    btn.onclick = () => {
      const name = filename.split('/').pop();
      if (window.app && app.requestDownload) app.requestDownload(blob, name);
    };
    box.appendChild(btn);
    wrap.appendChild(box);
  },

  escapeHtmlText(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
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
      m4a:'audio/mp4', aac:'audio/aac', opus:'audio/opus', wma:'audio/x-ms-wma',
      pdf:'application/pdf'
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
