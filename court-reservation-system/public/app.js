(async () => {
  const user = await requireLogin();
  if (!user) return;
  if (user.role === 'owner') {
    window.location.href = 'owner.html';
    return;
  }
  renderNav(user, 'index.html');

  const datePicker = document.getElementById('date-picker');
  const gridContainer = document.getElementById('grid-container');
  const modal = document.getElementById('confirm-modal');
  const confirmText = document.getElementById('confirm-text');
  const confirmOk = document.getElementById('confirm-ok');
  const confirmCancel = document.getElementById('confirm-cancel');

  const today = new Date().toISOString().slice(0, 10);
  datePicker.value = today;
  datePicker.min = today;

  let pendingSlot = null;

  function openConfirm(court, slot) {
    pendingSlot = { court_id: court.court_id, booking_date: datePicker.value, start_time: slot.start, end_time: slot.end };
    confirmText.textContent = `${court.court_name}　${datePicker.value}　${slot.start} - ${slot.end}`;
    modal.classList.remove('hidden');
  }

  function closeConfirm() {
    modal.classList.add('hidden');
    pendingSlot = null;
  }

  confirmCancel.addEventListener('click', closeConfirm);

  confirmOk.addEventListener('click', async () => {
    if (!pendingSlot) return;
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingSlot),
    });
    const data = await res.json();
    closeConfirm();
    if (res.ok) {
      loadGrid();
    } else {
      alert(data.error || '預約失敗');
    }
  });

  async function cancelBooking(bookingId) {
    if (!confirm('確定要取消此預約嗎？')) return;
    const res = await fetch(`/api/bookings/${bookingId}`, { method: 'DELETE' });
    if (res.ok) loadGrid();
    else alert('取消失敗');
  }

  async function loadGrid() {
    const res = await fetch(`/api/slots?date=${datePicker.value}`);
    const slots = await res.json();

    gridContainer.innerHTML = slots
      .map(
        (court) => `
        <div class="court-block">
          <h3>${court.court_name} <span class="location">${court.location || ''}</span></h3>
          <div class="slot-row">
            ${court.hours
              .map((slot) => {
                const cls =
                  slot.status === 'available' ? 'slot available' : slot.status === 'mine' ? 'slot mine' : 'slot booked';
                const label = slot.start;
                if (slot.status === 'available') {
                  return `<button class="${cls}" data-court="${court.court_id}" data-start="${slot.start}" data-end="${slot.end}">${label}</button>`;
                }
                if (slot.status === 'mine') {
                  return `<button class="${cls}" data-cancel="${slot.booking_id}">${label}</button>`;
                }
                return `<button class="${cls}" disabled>${label}</button>`;
              })
              .join('')}
          </div>
        </div>
      `
      )
      .join('');
  }

  gridContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.cancel) {
      cancelBooking(btn.dataset.cancel);
      return;
    }
    if (btn.dataset.court) {
      const courtId = Number(btn.dataset.court);
      const slots = Array.from(document.querySelectorAll(`.court-block`));
      const courtName = btn.closest('.court-block').querySelector('h3').textContent.trim();
      openConfirm(
        { court_id: courtId, court_name: courtName },
        { start: btn.dataset.start, end: btn.dataset.end }
      );
    }
  });

  datePicker.addEventListener('change', loadGrid);

  loadGrid();
})();
