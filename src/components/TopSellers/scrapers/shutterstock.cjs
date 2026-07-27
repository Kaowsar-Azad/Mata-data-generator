async function scrapeTextSearch({ query, order, contentType, gentech, page = 1 }, BrowserWindow, fileLog) {
  return new Promise((resolve) => {
    fileLog(`[Shutterstock Scraper] Starting search. Query: "${query}", Page: ${page}`);
    
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    let scraperWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      }
    });

    let url = `https://www.shutterstock.com/search/${encodeURIComponent(query)}?page=${page}`;
    
    fileLog(`[Shutterstock Scraper] Loading URL: ${url}`);
    scraperWindow.loadURL(url, { userAgent });

    scraperWindow.webContents.on('dom-ready', () => {
      setTimeout(async () => {
        try {
          const debugInfo = await scraperWindow.webContents.executeJavaScript(`
            (async () => {
              // Scroll down to load images
              for (let i = 1; i <= 15; i++) {
                window.scrollTo(0, i * 800);
                await new Promise(r => setTimeout(r, 400));
              }
              
              const uniqueImages = new Map();
              
              document.querySelectorAll('img').forEach(img => {
                let src = img.src || img.getAttribute('data-src') || '';
                if (src && src.includes('shutterstock.com/image')) {
                  // Enhance resolution: replace 100nw or 260nw with 600w
                  src = src.replace(/100nw|260nw/g, '600w');
                  
                  const link = img.closest('a');
                  const detailUrl = link ? link.href : '';
                  uniqueImages.set(src, { src, alt: img.alt || 'Shutterstock Image', detailUrl });
                }
              });

              const finalImages = Array.from(uniqueImages.values());
              return {
                title: document.title,
                filteredCount: finalImages.length,
                images: finalImages.slice(0, 51)
              };
            })();
          `);
          console.log("Scraper Debug Info:", debugInfo.title, debugInfo.filteredCount);
          resolve({ success: true, images: debugInfo.images });
        } catch (err) {
          console.error("Scraper Error:", err);
          resolve({ success: false, error: err.message });
        } finally {
          if (scraperWindow && !scraperWindow.isDestroyed()) {
            scraperWindow.destroy();
          }
        }
      }, 7000);
    });

    setTimeout(() => {
      if (scraperWindow && !scraperWindow.isDestroyed()) {
        scraperWindow.destroy();
        resolve({ success: false, error: 'Timeout waiting for Shutterstock to load.' });
      }
    }, 20000);
  });
}

module.exports = { scrapeTextSearch };
