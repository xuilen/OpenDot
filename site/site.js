const views = document.querySelectorAll('.view');
const preview = document.querySelector('#preview');
const fullImage = document.querySelector('#full-image');

views.forEach((view) => {
  view.addEventListener('click', (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    views.forEach((item) => {
      item.classList.toggle('selected', item === view);
      if (item === view) item.setAttribute('aria-current', 'true');
      else item.removeAttribute('aria-current');
    });
    preview.src = view.href;
    preview.alt = view.dataset.alt;
    fullImage.href = view.href;
  });
});

const copy = document.querySelector('#copy');
if (navigator.clipboard?.writeText) {
  copy.hidden = false;
  let timer;
  copy.addEventListener('click', async () => {
    const status = document.querySelector('#copy-status');
    try {
      await navigator.clipboard.writeText(document.querySelector('#commands').textContent);
      copy.textContent = '已复制 ✓';
      status.textContent = '安装命令已复制';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector('#commands'));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      copy.textContent = '请手动复制';
      status.textContent = '已选中命令，请使用系统复制操作';
    }
    clearTimeout(timer);
    timer = setTimeout(() => { copy.textContent = '复制命令'; status.textContent = ''; }, 3500);
  });
}
