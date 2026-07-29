async function scrapeTextSearch({ query, order, contentType, gentech, page = 1 }, BrowserWindow, fileLog) {
  const fetchPage = (targetPage) => {
    return new Promise((resolve) => {
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

      let url = `https://www.magnific.com/search?query=${encodeURIComponent(query)}&page=${targetPage}`;
      if (contentType && contentType !== 'all') {
        url += `&type=${contentType}`;
      }
      fileLog(`[Freepik Scraper] Loading URL: ${url}`);
      scraperWindow.loadURL(url, { userAgent });

      const safetyTimeout = setTimeout(() => {
        if (scraperWindow && !scraperWindow.isDestroyed()) {
          scraperWindow.destroy();
          resolve({ success: false, error: 'Timeout waiting for Freepik to load.' });
        }
      }, 45000);

      scraperWindow.webContents.on('dom-ready', () => {
        setTimeout(async () => {
          try {
            const debugInfo = await scraperWindow.webContents.executeJavaScript(`
              (async () => {
                for (let i = 1; i <= 25; i++) {
                  window.scrollTo(0, i * 500);
                  await new Promise(r => setTimeout(r, 200));
                }
                const uniqueImages = new Map();
                document.querySelectorAll('img').forEach(img => {
                  const src = img.src || img.getAttribute('data-src') || '';
                  if (src && (src.includes('freepik.com') || src.includes('magnific.com') || src.includes('cdnpk.net')) && !src.includes('avatar') && !src.includes('logo')) {
                    const link = img.closest('a');
                    let detailUrl = link ? link.href : '';
                    uniqueImages.set(src, { src, alt: img.alt || 'Freepik Image', detailUrl });
                  }
                });
                return { images: Array.from(uniqueImages.values()) };
              })();
            `);
            resolve({ success: true, images: debugInfo.images });
          } catch (err) {
            resolve({ success: false, error: err.message });
          } finally {
            clearTimeout(safetyTimeout);
            if (scraperWindow && !scraperWindow.isDestroyed()) scraperWindow.destroy();
          }
        }, 5000);
      });
    });
  };

  fileLog(`[Freepik Scraper] Starting search. Query: "${query}", Logical Page: ${page}`);
  
  // Magnific returns ~24 images per page. We fetch 3 pages to get ~72 images and slice to 51.
  const magPage1 = (page - 1) * 3 + 1;
  const magPage2 = (page - 1) * 3 + 2;
  const magPage3 = (page - 1) * 3 + 3;

  const [res1, res2, res3] = await Promise.all([
    fetchPage(magPage1),
    fetchPage(magPage2),
    fetchPage(magPage3)
  ]);

  let combinedImages = [];
  if (res1.success && res1.images) combinedImages = combinedImages.concat(res1.images);
  if (res2.success && res2.images) combinedImages = combinedImages.concat(res2.images);
  if (res3.success && res3.images) combinedImages = combinedImages.concat(res3.images);

  // Shuffle the images so they don't appear in the exact same order as the website
  for (let i = combinedImages.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [combinedImages[i], combinedImages[j]] = [combinedImages[j], combinedImages[i]];
  }

  if (combinedImages.length > 0) {
    return { success: true, images: combinedImages.slice(0, 51) };
  } else {
    return { success: false, error: res1.error || res2.error || res3.error || 'No images found' };
  }
}

module.exports = { scrapeTextSearch };
