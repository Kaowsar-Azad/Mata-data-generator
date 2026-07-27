async function scrapeTextSearch({ query, order, contentType, gentech, page = 1 }, BrowserWindow, fileLog) {
  return new Promise((resolve) => {
    fileLog(`[Search Scraper] Starting search. Query: "${query}", Page: ${page}, Order: "${order || 'default'}", ContentType: "${contentType || 'default'}", GenTech: "${gentech || 'default'}"`);
    
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    let scraperWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      }
    });

    // Construct Adobe Stock URL with filters
    let url = `https://stock.adobe.com/search?k=${encodeURIComponent(query)}&search_page=${page}`;
    
    if (order && order !== 'default') {
      url += `&order=${order}`;
    } else {
      url += `&order=nb_downloads`; // Default to most downloaded
    }

    if (contentType && contentType !== 'all') {
      // Handle vector type specifically
      const resolvedType = contentType === 'vector' ? 'zip_vector' : contentType;
      url += `&filters[content_type:${resolvedType}]=1`;
    }

    if (gentech && gentech !== 'all') {
      url += `&filters[gentech]=${gentech}`;
    }

    fileLog(`[Search Scraper] Loading URL: ${url}`);
    scraperWindow.loadURL(url, { userAgent });

    scraperWindow.webContents.on('dom-ready', () => {
      setTimeout(async () => {
        try {
          const debugInfo = await scraperWindow.webContents.executeJavaScript(`
            (async () => {
              // Scroll down smoothly to trigger all lazy loaded images
              for (let i = 1; i <= 20; i++) {
                window.scrollTo(0, i * 600);
                await new Promise(r => setTimeout(r, 300));
              }
              
              const uniqueImages = new Map();
              
              // 1. Get all picture sources (most reliable for Adobe Stock)
              document.querySelectorAll('picture source').forEach(source => {
                if (source.srcset && source.srcset.includes('ftcdn.net')) {
                  const src = source.srcset.split(' ')[0];
                  if (src && !src.endsWith('.svg')) {
                    const img = source.parentElement ? source.parentElement.querySelector('img') : null;
                    // Find parent link to get detail page URL
                    const link = source.closest('a');
                    const detailUrl = link ? link.href : '';
                    uniqueImages.set(src, { src, alt: img ? img.alt : 'Premium Stock Image', detailUrl });
                  }
                }
              });

              // 2. Fallback to normal imgs if we don't have enough
              document.querySelectorAll('img').forEach(img => {
                const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
                if (src && src.includes('ftcdn.net') && !src.endsWith('.svg')) {
                  const link = img.closest('a');
                  const detailUrl = link ? link.href : '';
                  uniqueImages.set(src, { src, alt: img.alt || 'Premium Stock Image', detailUrl });
                }
              });

              const finalImages = Array.from(uniqueImages.values()).filter(img => {
                // Filter out Adobe logos or UI elements
                const lowerAlt = img.alt.toLowerCase();
                return !lowerAlt.includes('adobe stock') && !lowerAlt.includes('homepage');
              });
              
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
      }, 7000); // Increased wait time to 7 seconds for deeper scroll
    });

    // Safety timeout
    setTimeout(() => {
      if (scraperWindow && !scraperWindow.isDestroyed()) {
        scraperWindow.destroy();
        resolve({ success: false, error: 'Timeout waiting for Adobe Stock to load.' });
      }
    }, 20000);
  });
}

module.exports = { scrapeTextSearch };
