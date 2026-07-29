async function scrapeTextSearch({ query, order, contentType, gentech, page = 1 }, BrowserWindow, fileLog) {
  return new Promise((resolve) => {
    fileLog(`[Shutterstock Scraper] Starting search. Query: "${query}", Page: ${page}`);
    
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

    const formattedQuery = query.trim().replace(/\s+/g, '-');
    let url = `https://www.shutterstock.com/search/${encodeURIComponent(formattedQuery)}?page=${page}`;
    
    if (contentType && contentType !== 'all') {
      if (contentType === 'video') {
        url = `https://www.shutterstock.com/video/search/${encodeURIComponent(formattedQuery)}?page=${page}`;
      } else if (contentType === 'template') {
        url = `https://www.shutterstock.com/templates/search/${encodeURIComponent(formattedQuery)}?page=${page}`;
      } else {
        url += `&image_type=${contentType}`;
      }
    }
    
    fileLog(`[Shutterstock Scraper] Loading URL: ${url}`);
    scraperWindow.loadURL(url, { userAgent });

    const safetyTimeout = setTimeout(() => {
      if (scraperWindow && !scraperWindow.isDestroyed()) {
        scraperWindow.destroy();
        resolve({ success: false, error: 'Timeout waiting for Shutterstock to load.' });
      }
    }, 45000);

    scraperWindow.webContents.on('dom-ready', () => {
      const currentUrl = scraperWindow.webContents.getURL();
      if (currentUrl.includes('/ai/') || currentUrl.includes('/ai-image-generator')) {
        fileLog(`[Shutterstock Scraper] Redirected to AI landing page. Retrying with quoted query...`);
        if (!query.startsWith('"') && !query.endsWith('"')) {
          const pathParam = `"${query.trim()}"`.replace(/\s+/g, '-');
          let retryUrl = `https://www.shutterstock.com/search/${encodeURIComponent(pathParam)}?page=${page}`;
          if (contentType && contentType !== 'all') {
            if (contentType === 'video') {
              retryUrl = `https://www.shutterstock.com/video/search/${encodeURIComponent(pathParam)}?page=${page}`;
            } else if (contentType === 'template') {
              retryUrl = `https://www.shutterstock.com/templates/search/${encodeURIComponent(pathParam)}?page=${page}`;
            } else {
              retryUrl += `&image_type=${contentType}`;
            }
          }
          fileLog(`[Shutterstock Scraper] Reloading with quoted query URL: ${retryUrl}`);
          scraperWindow.loadURL(retryUrl, { userAgent });
          return;
        }
      }

      setTimeout(async () => {
        try {
          const debugInfo = await scraperWindow.webContents.executeJavaScript(`
            (async () => {
              const nextDataScript = document.getElementById('__NEXT_DATA__');
              if (nextDataScript) {
                try {
                  const nextData = JSON.parse(nextDataScript.textContent);
                  const buildId = nextData.buildId;
                  const shutterstockPage = Math.ceil(${page} / 2);
                  const startIdx = (${page} % 2 !== 0) ? 0 : 51;
                  
                  let assets = [];
                  let videos = [];
                  if (shutterstockPage === 1) {
                    assets = nextData.props.pageProps?.assets || [];
                    videos = nextData.props.pageProps?.videos || [];
                  } else {
                    const termParam = '${query}';
                    const pathParam = '${query}'.trim().replace(/\\s+/g, '-');
                    const fetchUrl = \`https://www.shutterstock.com/_next/data/\${buildId}/search/\${encodeURIComponent(pathParam)}.json?term=\${encodeURIComponent(termParam)}&page=\${shutterstockPage}\`;
                    
                    const res = await fetch(fetchUrl, {
                      headers: {
                        'accept': '*/*',
                        'accept-language': 'en-US,en;q=0.9',
                        'sec-fetch-dest': 'empty',
                        'sec-fetch-mode': 'cors',
                        'sec-fetch-site': 'same-origin',
                        'x-nextjs-data': '1'
                      }
                    });
                    const json = await res.json();
                    assets = json.pageProps?.assets || [];
                    videos = json.pageProps?.videos || [];
                  }

                  let finalImages = [];
                  if (videos && videos.length > 0) {
                    finalImages = videos.map(v => {
                      const rawSrc = v.thumbImageUrl || v.previewImageUrl || v.thumb_1 || v.source || '';
                      const cleanSrc = rawSrc ? rawSrc.replace('www.shutterstock.com', 'ak.picdn.net').split('?')[0] : '';
                      const vidUrl = v.previewVideoUrls?.webm || v.previewVideoUrls?.mp4 || v.preview_webm || v.preview || '';
                      const linkUrl = v.link ? 'https://www.shutterstock.com' + v.link : 'https://www.shutterstock.com/video/clip-' + v.id;
                      return {
                        src: cleanSrc,
                        alt: v.description || v.title || 'Shutterstock Video',
                        detailUrl: linkUrl,
                        videoUrl: vidUrl
                      };
                    });
                  } else {
                    finalImages = assets.filter(a => a.type === 'images').map(a => {
                      return {
                        src: (a.displays && a.displays['600W']) ? a.displays['600W'].src : a.src,
                        alt: a.alt || a.title || 'Shutterstock Image',
                        detailUrl: 'https://www.shutterstock.com' + (a.link || '')
                      };
                    });
                  }
                  
                  return {
                    currentUrl: document.location.href,
                    title: document.title,
                    filteredCount: finalImages.length,
                    images: finalImages.slice(startIdx, startIdx + 51)
                  };
                } catch (e) {
                   console.error("NEXT_DATA parse error", e);
                }
              }

              // Fallback to DOM scraping
              for (let i = 1; i <= 25; i++) {
                window.scrollTo(0, i * 800);
                await new Promise(r => setTimeout(r, 300));
              }
              
              const uniqueImages = new Map();
              
              document.querySelectorAll('img').forEach(img => {
                let src = img.src || img.getAttribute('data-src') || '';
                if (src && src.includes('shutterstock.com') && !src.includes('logo') && !src.includes('avatar') && !src.includes('contributor')) {
                  // Enhance resolution: replace 100nw or 260nw with 600w
                  src = src.replace(/100nw|260nw/g, '600w');
                  
                  const link = img.closest('a');
                  const detailUrl = link ? link.href : '';
                  uniqueImages.set(src, { src, alt: img.alt || 'Shutterstock Image', detailUrl });
                }
              });

              const finalImages = Array.from(uniqueImages.values());
              const startIdx = (${page} - 1) * 51;
              return {
                currentUrl: document.location.href,
                title: document.title,
                filteredCount: finalImages.length,
                images: finalImages.slice(startIdx, startIdx + 51)
              };
            })();
          `);
          console.log("Scraper Debug Info:", debugInfo.title, "Loaded URL:", debugInfo.currentUrl, "Count:", debugInfo.filteredCount);
          resolve({ success: true, images: debugInfo.images });
        } catch (err) {
          console.error("Scraper Error:", err);
          resolve({ success: false, error: err.message });
        } finally {
          clearTimeout(safetyTimeout);
          if (scraperWindow && !scraperWindow.isDestroyed()) {
            scraperWindow.destroy();
          }
        }
      }, 7000);
    });
  });
}

module.exports = { scrapeTextSearch };
