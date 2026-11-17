(() => {
  function png(payload) {
    const qr = qrcodegen.QrCode.encodeText(payload, qrcodegen.QrCode.Ecc.MEDIUM);
    const border = 4, scale = 6;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = (qr.size + border * 2) * scale;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000000';
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (qr.getModule(x, y)) context.fillRect((x + border) * scale, (y + border) * scale, scale, scale);
      }
    }
    const url = canvas.toDataURL('image/png');
    if (!url.startsWith('data:image/png;base64,')) throw new Error('PNG generation failed');
    return url;
  }
  window.THVP_LMS_QR = Object.freeze({png});
})();
