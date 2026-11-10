/* Image helpers — browser only (FileReader, Image, canvas). */
window.LeafImage = (() => {
  function fileToDataURL(file) {
    return new Promise((res, rej) => {
      const rd = new FileReader();
      rd.onload = () => res(rd.result);
      rd.onerror = rej;
      rd.readAsDataURL(file);
    });
  }
  function loadImage(dataUrl) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = dataUrl;
    });
  }
  function makeThumb(dataUrl, maxSide = 256) {
    return loadImage(dataUrl).then(img => {
      const s = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * s));
      c.height = Math.max(1, Math.round(img.height * s));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.7);
    }).catch(() => dataUrl);
  }
  return { fileToDataURL, loadImage, makeThumb };
})();
