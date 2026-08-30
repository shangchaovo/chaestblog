const input = document.getElementById("rssFeedUrl");
const button = document.getElementById("copyRssBtn");
const status = document.getElementById("rssCopyStatus");

async function copyFeedUrl() {
  if (!input || !button || !status) return;
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(input.value);
  } catch (error) {
    input.select();
    document.execCommand("copy");
    input.setSelectionRange(0, 0);
  }
  button.textContent = "已复制";
  status.textContent = "订阅地址已复制，现在粘贴到你的 RSS 阅读器即可。";
  window.setTimeout(() => {
    button.textContent = original;
  }, 1800);
}

button?.addEventListener("click", copyFeedUrl);
