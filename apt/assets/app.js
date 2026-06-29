/* 公寓費用分攤 — 前端互動 */
(function () {
  'use strict';

  /* ---- 複製按鈕 ---- */
  document.querySelectorAll('.btn-copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var val = btn.getAttribute('data-copy') || '';
      navigator.clipboard.writeText(val).then(function () {
        var old = btn.textContent;
        btn.textContent = '已複製 ✓';
        setTimeout(function () { btn.textContent = old; }, 1500);
      });
    });
  });

  /* ---- 彈窗開關 ---- */
  function bindModal(openId, modalId, closeId) {
    var open = document.getElementById(openId);
    var modal = document.getElementById(modalId);
    var close = document.getElementById(closeId);
    if (open && modal) open.addEventListener('click', function () { modal.hidden = false; });
    if (close && modal) close.addEventListener('click', function () { modal.hidden = true; });
    if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) modal.hidden = true; });
  }
  bindModal('open-pw', 'pw-modal', 'close-pw');
  bindModal('open-settle', 'settle-modal', 'close-settle');

  /* ---- 帳單附件檢視 ---- */
  var fileModal = document.getElementById('file-modal');
  var fileFrame = document.getElementById('file-modal-frame');
  var fileImg = document.getElementById('file-modal-img');
  var fileOpen = document.getElementById('file-modal-open');
  var fileClose = document.getElementById('close-file');

  function closeFileModal() {
    if (!fileModal) return;
    fileModal.hidden = true;
    fileFrame.hidden = true;
    fileFrame.src = '';
    fileImg.hidden = true;
    fileImg.src = '';
  }

  document.querySelectorAll('.fc-file').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      // 卡片本身是 <details><summary>，要阻止點圖示時連動展開/收合
      e.preventDefault();
      e.stopPropagation();

      var src = btn.getAttribute('data-src');
      var kind = btn.getAttribute('data-kind');
      if (kind === 'pdf') {
        fileImg.hidden = true; fileImg.src = '';
        fileFrame.src = src; fileFrame.hidden = false;
      } else {
        fileFrame.hidden = true; fileFrame.src = '';
        fileImg.src = src; fileImg.hidden = false;
      }
      fileOpen.href = src;
      fileModal.hidden = false;
    });
  });
  if (fileClose) fileClose.addEventListener('click', closeFileModal);
  if (fileModal) fileModal.addEventListener('click', function (e) { if (e.target === fileModal) closeFileModal(); });

  /* ---- 房客：期間選擇器 ---- */
  var periodSel = document.getElementById('period-sel');
  if (periodSel) {
    periodSel.addEventListener('change', function () {
      var base = periodSel.getAttribute('data-base') || 'index.php';
      window.location.href = base + '?s=' + encodeURIComponent(periodSel.value);
    });
  }

  /* ---- admin：即時試算（與後端 PHP 同一套公式）---- */
  var form = document.getElementById('bill-form');
  if (!form) return;

  var elCat = document.getElementById('f-cat');
  var elFixed = document.getElementById('f-fixed');
  var elPs = document.getElementById('f-ps');
  var elPe = document.getElementById('f-pe');
  var elTotal = document.getElementById('f-total');
  var elBase = document.getElementById('f-base');
  var preview = document.getElementById('preview');
  var periodFields = document.querySelectorAll('.period-field');

  function inclusiveDays(a, b) {
    var ms = 86400000;
    return Math.round((b - a) / ms) + 1;
  }

  function round(x) { // 四捨五入（半數進位），對齊 PHP round()
    return Math.round(x);
  }

  function calc() {
    var total = parseFloat(elTotal.value) || 0;
    var base = elBase.value !== '' ? parseFloat(elBase.value) : total;
    var fixed = elFixed.checked;

    // 固定費期間欄位隱藏
    periodFields.forEach(function (f) { f.style.display = fixed ? 'none' : ''; });

    if (fixed) {
      var perF = round(base / 3);
      preview.innerHTML = '固定費：分攤基礎 NT$' + base.toLocaleString() +
        ' ÷ 3 = <b>每人 NT$' + perF + '</b>　·　Aries 負擔 NT$' + (round(total) - 2 * perF);
      return;
    }

    if (!elPs.value || !elPe.value || !total) {
      preview.textContent = '輸入金額與期間後，這裡會即時試算每人應分。';
      return;
    }

    var ps = new Date(elPs.value), pe = new Date(elPe.value), split = new Date(window.SPLIT_START || '2026-05-01');
    if (pe < ps) { preview.textContent = '迄日不可早於起日。'; return; }

    var totalDays = inclusiveDays(ps, pe);
    var daysAfter;
    if (pe < split) daysAfter = 0;
    else if (ps >= split) daysAfter = totalDays;
    else daysAfter = inclusiveDays(split, pe);
    var daysBefore = totalDays - daysAfter;

    if (daysAfter === 0) {
      preview.innerHTML = '全期在分攤起始日（' + (window.SPLIT_START || '2026-05-01') +
        '）之前 → <b>Aries 全額自付</b>，房客不分攤。';
      return;
    }
    var back = base * daysAfter / totalDays;
    var per = round(back / 3);
    var landlord = round(total) - 2 * per;
    preview.innerHTML =
      '總 ' + totalDays + ' 天（前段 ' + daysBefore + ' 天 Aries 自付、後段 ' + daysAfter + ' 天均分）<br>' +
      '後段金額 = ' + base + ' × (' + daysAfter + ' ÷ ' + totalDays + ') = NT$' + round(back).toLocaleString() + '<br>' +
      '每人 = ' + round(back).toLocaleString() + ' ÷ 3 = <b>NT$' + per + '</b>　·　Aries 負擔 NT$' + landlord.toLocaleString();
  }

  // 選「網路」自動勾固定費
  elCat.addEventListener('change', function () {
    if (elCat.value === '網路') elFixed.checked = true;
    calc();
  });
  [elFixed, elPs, elPe, elTotal, elBase].forEach(function (el) {
    el.addEventListener('input', calc);
    el.addEventListener('change', calc);
  });
  calc();
})();
