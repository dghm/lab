/* DGHM 賀卡平台 · 共用重播
 *
 * 適用於任何「一張 .card 內含一顆 .replay-btn」的賀卡。
 * 點擊重播按鈕時，暫時清掉卡片內的動畫再還原，讓進場動畫重新播放。
 * 卡片端只需：引入本檔、在 .card 內放一顆 .replay-btn、
 * 並在自己的 CSS 定義 .card.is-replaying 之外的視覺（見 shared/base.css）。
 */
(function () {
  var card = document.querySelector('.card');
  var btn = document.querySelector('.replay-btn');
  if (!card || !btn) return;

  btn.addEventListener('click', function () {
    card.classList.add('is-replaying');
    void card.offsetWidth; // 強制 reflow，確保移除 class 後動畫重新起算
    card.classList.remove('is-replaying');
  });
})();
