// Content script that captures the visible DOM by rendering it into a canvas
// using an SVG foreignObject technique. This is a best-effort capture and may
// not perfectly render cross-origin images or videos without CORS allowances.

async function captureDomAsDataUrl() {
  const width = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  const height = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

  const cloned = document.documentElement.cloneNode(true);

  // Inline scroll positions to reduce differences
  const scrollX = window.scrollX || window.pageXOffset || 0;
  const scrollY = window.scrollY || window.pageYOffset || 0;
  cloned.querySelector('body')?.setAttribute('style', `transform: translate(-${scrollX}px, -${scrollY}px);`);

  // Serialize the cloned DOM into XML
  const serialized = new XMLSerializer().serializeToString(cloned);
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <foreignObject width="100%" height="100%">
      ${serialized}
    </foreignObject>
  </svg>`;

  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';
    const load = new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(new Error('Image load failed'));
    });
    img.src = url;
    await load;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'CAPTURE_DOM_CANVAS') return;
  (async () => {
    try {
      const dataUrl = await captureDomAsDataUrl();
      sendResponse({ ok: true, dataUrl });
    } catch (err) {
      sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
    }
  })();
  return true; // async
});

