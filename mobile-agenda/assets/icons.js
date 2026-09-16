/* ==========================================================================
   明日日程 · 内联图标库
   24px 线性图标：stroke=1.8 / currentColor / 无填充（dots 除外）
   用法：el.innerHTML = ICONS.calendar  或  container.insertAdjacentHTML('beforeend', ICONS.mic)
   尺寸默认 24px，由 CSS 覆写（如 .icon-btn svg { width:20px; height:20px }）
   ========================================================================== */
(function () {
  'use strict';

  var ATTRS = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"' +
    ' fill="none" stroke="currentColor" stroke-width="1.8"' +
    ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

  function svg(inner) {
    return '<svg ' + ATTRS + '>' + inner + '</svg>';
  }

  window.ICONS = {
    /* 日历 */
    calendar: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),

    /* 周视图 */
    week: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M9.17 10v10.5M14.83 10v10.5"/>'),

    /* 麦克风 */
    mic: svg('<rect x="9" y="3" width="6" height="11.5" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6"/>'),

    /* 设置 / 筛选 */
    sliders: svg('<path d="M4 6.5h3M12.2 6.5H20M4 12h8M17.2 12H20M4 17.5h1.8M10.9 17.5H20"/>' +
      '<circle cx="9.5" cy="6.5" r="2.2"/><circle cx="14.5" cy="12" r="2.2"/><circle cx="8" cy="17.5" r="2.2"/>'),

    /* 更多（竖排三点） */
    dots: svg('<circle cx="12" cy="5.4" r="1.5" fill="currentColor" stroke="none"/>' +
      '<circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>' +
      '<circle cx="12" cy="18.6" r="1.5" fill="currentColor" stroke="none"/>'),

    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    chevronL: svg('<path d="M14.5 5l-7 7 7 7"/>'),
    chevronR: svg('<path d="M9.5 5l7 7-7 7"/>'),

    clock: svg('<circle cx="12" cy="12" r="8.25"/><path d="M12 7.5V12l3.2 1.9"/>'),

    /* 地点 */
    pin: svg('<path d="M12 21c-4.33-3.85-6.5-7.1-6.5-9.9a6.5 6.5 0 1 1 13 0C18.5 13.9 16.33 17.15 12 21z"/>' +
      '<circle cx="12" cy="10.8" r="2.3"/>'),

    /* 备注 / 文档 */
    note: svg('<path d="M14 3.5H7.6A1.6 1.6 0 0 0 6 5.1v13.8a1.6 1.6 0 0 0 1.6 1.6h8.8a1.6 1.6 0 0 0 1.6-1.6V8.5l-4-5z"/>' +
      '<path d="M14 3.5V8.5h4M9.5 13h5M9.5 16.5h3.5"/>'),

    /* 图片 / 自定义背景 */
    image: svg('<rect x="3.5" y="5" width="17" height="14.5" rx="2.5"/><circle cx="8.7" cy="9.7" r="1.6"/>' +
      '<path d="M4.5 16.8l4.2-4.2a1.5 1.5 0 0 1 2.1 0l4.9 4.9M13.5 14.6l1.8-1.8a1.5 1.5 0 0 1 2.1 0l3 3"/>'),

    /* 上传 / 导入 */
    upload: svg('<path d="M4 14.5v3.7A1.8 1.8 0 0 0 5.8 20h12.4a1.8 1.8 0 0 0 1.8-1.8v-3.7M12 15.5V4.5M8.2 8.3L12 4.5l3.8 3.8"/>'),

    /* 日间主题 */
    sun: svg('<circle cx="12" cy="12" r="3.6"/>' +
      '<path d="M12 2.8v2.3M12 18.9v2.3M2.8 12h2.3M18.9 12h2.3M5.5 5.5l1.6 1.6M16.9 16.9l1.6 1.6M18.5 5.5l-1.6 1.6M7.1 16.9l-1.6 1.6"/>'),

    /* 夜间主题 */
    moon: svg('<path d="M19.8 13.2A7.9 7.9 0 1 1 10.8 4.2a6.3 6.3 0 0 0 9 9z"/>'),

    trash: svg('<path d="M4.5 6.5h15M9.2 6.5V5.2a1.7 1.7 0 0 1 1.7-1.7h2.2a1.7 1.7 0 0 1 1.7 1.7v1.3' +
      'M6.3 6.5l.7 12.1a1.8 1.8 0 0 0 1.8 1.7h6.4a1.8 1.8 0 0 0 1.8-1.7l.7-12.1M10 10.5v5.5M14 10.5v5.5"/>'),

    check: svg('<path d="M5 12.5l4.6 4.6L19 7.3"/>'),

    /* 同步 / 重新解析 */
    refresh: svg('<path d="M19.6 13.4a7.75 7.75 0 1 1-3.15-7.75L21.6 10"/><path d="M21.6 4.4v5.6h-5.6"/>'),

    /* 课本 / 课程表导入 */
    book: svg('<path d="M4.5 19.2a2.3 2.3 0 0 1 2.3-2.3h12.7"/><path d="M6.8 2.5h12.7v19H6.8a2.3 2.3 0 0 1-2.3-2.3V4.8a2.3 2.3 0 0 1 2.3-2.3z"/>'),

    /* 提醒 / 精确闹钟 */
    alarm: svg('<circle cx="12" cy="13.2" r="7.2"/><path d="M12 9.7v3.5l2.5 1.5M4.8 3.6L2.9 5.4M19.2 3.6l1.9 1.8"/>'),

    /* ---- 附加：空状态 ---- */
    inbox: svg('<path d="M4 13.5l2.3-7a1.6 1.6 0 0 1 1.5-1h8.4a1.6 1.6 0 0 1 1.5 1l2.3 7"/>' +
      '<path d="M4 13.5h4.6a1 1 0 0 1 .9.6l.7 1.4a1 1 0 0 0 .9.6h3.8a1 1 0 0 0 .9-.6l.7-1.4a1 1 0 0 1 .9-.6H20"/>' +
      '<path d="M4 13.5v4A1.8 1.8 0 0 0 5.8 19.3h12.4a1.8 1.8 0 0 0 1.8-1.8v-4"/>'),

    /* ---- 附加：错误 / 提示 ---- */
    alert: svg('<circle cx="12" cy="12" r="8.25"/><path d="M12 7.8v5M12 16.1v.2"/>')
  };
})();
