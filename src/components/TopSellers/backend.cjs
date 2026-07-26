function registerTopSellersIPC(ipcMain, BrowserWindow) {
  ipcMain.handle('scrape-adobe-stock', async (event, query) => {
    return new Promise((resolve) => {
      let scraperWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        }
      });

      const url = `https://stock.adobe.com/search?k=${encodeURIComponent(query)}&order=nb_downloads`;
      scraperWindow.loadURL(url);

      scraperWindow.webContents.on('did-finish-load', async () => {
        try {
          const images = await scraperWindow.webContents.executeJavaScript(`
            (() => {
              const imgs = Array.from(document.querySelectorAll('img'));
              return imgs.map(img => ({
                src: img.src,
                alt: img.alt || ''
              })).filter(img => img.src && (img.src.includes('ftcdn.net') || img.src.includes('as2.ftcdn.net')));
            })();
          `);
          resolve({ success: true, images: images.slice(0, 30) });
        } catch (err) {
          resolve({ success: false, error: err.message });
        } finally {
          if (scraperWindow && !scraperWindow.isDestroyed()) {
            scraperWindow.destroy();
          }
        }
      });

      // Safety timeout
      setTimeout(() => {
        if (scraperWindow && !scraperWindow.isDestroyed()) {
          scraperWindow.destroy();
          resolve({ success: false, error: 'Timeout waiting for Adobe Stock to load.' });
        }
      }, 20000);
    });
  });
}

module.exports = { registerTopSellersIPC };
