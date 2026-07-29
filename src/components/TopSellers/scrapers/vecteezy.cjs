async function scrapeTextSearch({ query, order, contentType, gentech, page = 1 }, BrowserWindow, fileLog) {
  return new Promise((resolve) => {
    fileLog(`[Vecteezy Scraper] Starting search. Query: "${query}", Page: ${page}`);
    
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    let scraperWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        disableBlinkFeatures: 'AutomationControlled',
        sandbox: true
      }
    });

    const formattedQuery = encodeURIComponent(query.trim().replace(/\s+/g, '-'));
    let url = `https://www.vecteezy.com/free-vector/${formattedQuery}?page=${page}`;
    
    if (contentType === 'photo') {
      url = `https://www.vecteezy.com/free-photos/${formattedQuery}?page=${page}`;
    } else if (contentType === 'video') {
      url = `https://www.vecteezy.com/free-videos/${formattedQuery}?page=${page}`;
    }
    
    fileLog(`[Vecteezy Scraper] Loading URL: ${url}`);
    scraperWindow.loadURL(url, { userAgent });

    const safetyTimeout = setTimeout(() => {
      if (scraperWindow && !scraperWindow.isDestroyed()) {
        scraperWindow.destroy();
        resolve({ success: false, error: 'Timeout waiting for Vecteezy to load.' });
      }
    }, 45000);

    scraperWindow.webContents.on('dom-ready', () => {
      setTimeout(async () => {
        try {
          const debugInfo = await scraperWindow.webContents.executeJavaScript(`
            (async () => {
              // Scroll down to load lazy images
              for (let i = 1; i <= 20; i++) {
                window.scrollTo(0, i * 600);
                await new Promise(r => setTimeout(r, 200));
              }
              
              const uniqueImages = new Map();
              
              document.querySelectorAll('img').forEach(img => {
                const src = img.getAttribute('data-src') || img.src || img.srcset || '';
                if (src && (src.includes('vecteezy_') || src.includes('ezimg') || src.includes('system/resources/thumbnails'))) {
                  const link = img.closest('a');
                  const detailUrl = link ? link.href : '';
                  const alt = img.alt || 'Vecteezy Image';
                  // ensure it's not a category thumbnail
                  if (!src.includes('term-bg')) {
                    const listItem = img.closest('li');
                    const videoUrl = listItem ? (listItem.getAttribute('data-video-url') || '') : '';
                    uniqueImages.set(src, { src, alt, detailUrl, videoUrl });
                  }
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
          
          fileLog(`[Vecteezy Scraper] Debug Info: Title="${debugInfo.title}", Count=${debugInfo.filteredCount}`);
          
          if (debugInfo.filteredCount === 0 && debugInfo.title.includes('denied')) {
             resolve({ success: false, error: 'Vecteezy blocked the request. Try again later.' });
          } else {
             resolve({ success: true, images: debugInfo.images });
          }
        } catch (err) {
          fileLog(`[Vecteezy Scraper] Error: ${err.message}`);
          resolve({ success: false, error: err.message });
        } finally {
          clearTimeout(safetyTimeout);
          if (scraperWindow && !scraperWindow.isDestroyed()) {
            scraperWindow.destroy();
          }
        }
      }, 5000);
    });
  });
}

module.exports = { scrapeTextSearch };
