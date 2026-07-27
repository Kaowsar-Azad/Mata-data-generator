function registerTopSellersIPC(ipcMain, BrowserWindow) {
  ipcMain.handle('scrape-top-sellers', async (event, payload) => {
    const mainModule = require('../../../electron/main.cjs') || {};
    const fileLog = mainModule.fileLog || console.log;

    const { platform, query, order, contentType, gentech, page } = typeof payload === 'object' ? payload : { query: payload, platform: 'adobe-stock', page: 1 };
    
    try {
      if (platform === 'adobe-stock') {
        const { scrapeTextSearch } = require('./scrapers/adobeStock.cjs');
        return await scrapeTextSearch({ query, order, contentType, gentech, page }, BrowserWindow, fileLog);
      } else if (platform === 'shutterstock') {
        const { scrapeTextSearch } = require('./scrapers/shutterstock.cjs');
        return await scrapeTextSearch({ query, order, contentType, gentech, page }, BrowserWindow, fileLog);
      } else if (platform === 'freepik') {
        const { scrapeTextSearch } = require('./scrapers/freepik.cjs');
        return await scrapeTextSearch({ query, order, contentType, gentech, page }, BrowserWindow, fileLog);
      } else if (platform === 'getty') {
        const { scrapeTextSearch } = require('./scrapers/gettyImages.cjs');
        return await scrapeTextSearch({ query, order, contentType, gentech, page }, BrowserWindow, fileLog);
      } else if (platform === 'dreamstime') {
        const { scrapeTextSearch } = require('./scrapers/dreamstime.cjs');
        return await scrapeTextSearch({ query, order, contentType, gentech, page }, BrowserWindow, fileLog);
      } else {
        return { success: false, error: 'Platform not supported yet.' };
      }
    } catch (err) {
      fileLog(`[Scraper Router] Error: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('scrape-adobe-stock-by-image', async (event, filePath) => {
    const path = require('path');
    const fs = require('fs');
    const os = require('os');
    const LOG_FILE = path.join(os.tmpdir(), 'imagemetadata_electron.log');
    
    const fileLog = (...args) => {
      try {
        const msg = `[${new Date().toISOString()}] ${args.map(a => a instanceof Error ? a.stack || a.message : (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ')}\n`;
        fs.appendFileSync(LOG_FILE, msg);
        console.log(...args);
      } catch (e) {
        console.error('Logging failed:', e);
      }
    };
    
    return new Promise((resolve) => {
      fileLog(`[Visual Search] Starting search for file: ${filePath}`);
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      
      let scraperWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        }
      });

      let completed = false;

      // Clean cleanup helper
      const cleanupAndResolve = (result) => {
        if (completed) return;
        completed = true;
        fileLog(`[Visual Search] Resolving task. Success: ${result.success}`);
        
        try {
          if (scraperWindow && !scraperWindow.isDestroyed()) {
            scraperWindow.destroy();
          }
        } catch (e) {
          fileLog(`[Visual Search] Window destroy error: ${e.message}`);
        }
        resolve(result);
      };

      // Handler for processing the search results after redirect
      const scrapeResultsPage = async () => {
        try {
          fileLog(`[Visual Search] Results page URL: ${scraperWindow.webContents.getURL()}`);
          fileLog(`[Visual Search] Scrolling down to load lazy assets...`);
          
          // Scroll down smoothly to trigger lazy load
          await scraperWindow.webContents.executeJavaScript(`
            (async () => {
              for (let i = 1; i <= 6; i++) {
                window.scrollTo(0, i * 600);
                await new Promise(r => setTimeout(r, 150));
              }
            })();
          `);

          fileLog(`[Visual Search] Scraping image metadata...`);
          const debugInfo = await scraperWindow.webContents.executeJavaScript(`
            (async () => {
              const uniqueImages = new Map();
              
              // 1. Get all picture sources
              document.querySelectorAll('picture source').forEach(source => {
                if (source.srcset && source.srcset.includes('ftcdn.net')) {
                  const src = source.srcset.split(' ')[0];
                  if (src && !src.endsWith('.svg')) {
                    const img = source.parentElement ? source.parentElement.querySelector('img') : null;
                    const link = source.closest('a');
                    const detailUrl = link ? link.href : '';
                    uniqueImages.set(src, { src, alt: img ? img.alt : 'Premium Stock Image', detailUrl });
                  }
                }
              });

              // 2. Fallback to normal imgs
              document.querySelectorAll('img').forEach(img => {
                const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
                if (src && src.includes('ftcdn.net') && !src.endsWith('.svg')) {
                  const link = img.closest('a');
                  const detailUrl = link ? link.href : '';
                  uniqueImages.set(src, { src, alt: img.alt || 'Premium Stock Image', detailUrl });
                }
              });

              const finalImages = Array.from(uniqueImages.values()).filter(img => {
                const lowerAlt = img.alt.toLowerCase();
                return !lowerAlt.includes('adobe stock') && !lowerAlt.includes('homepage');
              });
              
              return {
                title: document.title,
                images: finalImages.slice(0, 30)
              };
            })();
          `);

          fileLog(`[Visual Search] Scraped successfully! Images found: ${debugInfo.images.length}`);
          cleanupAndResolve({ success: true, images: debugInfo.images });
        } catch (err) {
          fileLog(`[Visual Search] Scrape execution failed: ${err.message}`);
          cleanupAndResolve({ success: false, error: err.message });
        }
      };

      // Watch redirects to visual search result page
      scraperWindow.webContents.on('did-redirect-navigation', (event, url) => {
        fileLog(`[Visual Search] Redirected to: ${url}`);
        if (url.includes('visual-search') || url.includes('/search/images')) {
          // Listen to the load of the results page
          scraperWindow.webContents.once('did-finish-load', () => {
            fileLog(`[Visual Search] Redirect target page loaded.`);
            scrapeResultsPage();
          });
        }
      });

      // Register listener BEFORE loadURL
      scraperWindow.webContents.once('did-finish-load', () => {
        fileLog(`[Visual Search] Initial page loaded. Triggering upload flow.`);
        
        // Use a loop check for element instead of fixed setTimeout
        let checkAttempts = 0;
        const clickAndInject = async () => {
          if (completed) return;
          try {
            fileLog(`[Visual Search] Attempting to click camera button (Attempt ${checkAttempts + 1})...`);
            
            const btnExists = await scraperWindow.webContents.executeJavaScript(`
              (function() {
                const btn = document.querySelector('button[data-t="find-similar-button"]');
                if (btn) {
                  btn.click();
                  return true;
                }
                return false;
              })();
            `);

            if (btnExists) {
              fileLog(`[Visual Search] Camera button clicked. Waiting for file input...`);
              
              // Wait for file input to appear
              let inputAttempts = 0;
              const injectFile = async () => {
                if (completed) return;
                try {
                  const inputExists = await scraperWindow.webContents.executeJavaScript(`
                    !!document.querySelector('input[type="file"]')
                  `);

                  if (inputExists) {
                    fileLog(`[Visual Search] File input rendered. Attaching debugger...`);
                    
                    try {
                      scraperWindow.webContents.debugger.attach('1.3');
                    } catch (dbgErr) {
                      fileLog(`[Visual Search] Debugger attach warning (might be already attached): ${dbgErr.message}`);
                    }

                    let injectSuccess = false;
                    let retryCount = 0;
                    
                    while (!injectSuccess && retryCount < 8) {
                      try {
                        fileLog(`[Visual Search] Fetching fresh DOM document (Try ${retryCount + 1})...`);
                        const { root } = await scraperWindow.webContents.debugger.sendCommand('DOM.getDocument');
                        
                        const { nodeId } = await scraperWindow.webContents.debugger.sendCommand('DOM.querySelector', {
                          nodeId: root.nodeId,
                          selector: 'input[type="file"]'
                        });

                        if (nodeId) {
                          fileLog(`[Visual Search] Injecting file path using CDP...`);
                          await scraperWindow.webContents.debugger.sendCommand('DOM.setFileInputFiles', {
                            files: [filePath],
                            nodeId: nodeId
                          });
                          injectSuccess = true;
                          fileLog(`[Visual Search] File injected successfully.`);
                        } else {
                          fileLog(`[Visual Search] QuerySelector did not return a nodeId.`);
                          retryCount++;
                          await new Promise(r => setTimeout(r, 200));
                        }
                      } catch (err) {
                        fileLog(`[Visual Search] CDP injection attempt ${retryCount + 1} failed: ${err.message}`);
                        retryCount++;
                        // Wait a bit before retrying to allow DOM to settle
                        await new Promise(r => setTimeout(r, 250));
                      }
                    }

                    try {
                      scraperWindow.webContents.debugger.detach();
                    } catch (e) {}

                    if (!injectSuccess) {
                      cleanupAndResolve({ success: false, error: 'Could not inject file path into Adobe Stock after 8 attempts.' });
                      return;
                    }
                  } else {
                    inputAttempts++;
                    if (inputAttempts < 15) {
                      setTimeout(injectFile, 200); // Poll every 200ms
                    } else {
                      cleanupAndResolve({ success: false, error: 'File input did not render on Adobe Stock.' });
                    }
                  }
                } catch (err) {
                  fileLog(`[Visual Search] Injection process failed: ${err.message}`);
                  cleanupAndResolve({ success: false, error: err.message });
                }
              };
              
              injectFile();
            } else {
              checkAttempts++;
              if (checkAttempts < 15) {
                setTimeout(clickAndInject, 200); // Try again in 200ms
              } else {
                cleanupAndResolve({ success: false, error: 'Camera button not found on page.' });
              }
            }
          } catch (err) {
            fileLog(`[Visual Search] Click trigger failed: ${err.message}`);
            cleanupAndResolve({ success: false, error: err.message });
          }
        };

        clickAndInject();
      });

      scraperWindow.loadURL('https://stock.adobe.com', { userAgent });

      // Safety timeout: 45 seconds total if something completely hangs
      setTimeout(() => {
        if (!completed) {
          fileLog(`[Visual Search] Global timeout reached!`);
          cleanupAndResolve({ success: false, error: 'Timeout waiting for visual search to complete.' });
        }
      }, 45000);
    });
  });

  ipcMain.handle('adobe-stock-details', async (event, url) => {
    return new Promise((resolve) => {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      let scraperWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        }
      });

      scraperWindow.loadURL(url, { userAgent });

      scraperWindow.webContents.on('dom-ready', () => {
        setTimeout(async () => {
          try {
            const data = await scraperWindow.webContents.executeJavaScript(`
              (async () => {
                const html = document.documentElement.outerHTML;
                let keywords = [];
                
                // 1. Extract directly from Apollo / Redux state in HTML
                const match = html.match(/"keywords":\\[(.*?)\\]/);
                if (match) {
                    try {
                        keywords = JSON.parse('[' + match[1] + ']');
                    } catch (e) {
                        keywords = match[1].split(',').map(s => s.replace(/"/g, '').trim());
                    }
                }

                // 2. Try extracting from meta tags
                if (keywords.length < 5) {
                   const meta = document.querySelector('meta[name="keywords"]');
                   if (meta && meta.content) {
                      keywords = meta.content.split(',').map(k => k.trim());
                   }
                }

                // Title
                const title = document.querySelector('h1')?.textContent.trim() || document.title.split('|')[0].trim();
                
                return { title, keywords: [...new Set(keywords)] };
              })();
            `);
            resolve({ success: true, data });
          } catch (err) {
            resolve({ success: false, error: err.message });
          } finally {
            if (scraperWindow && !scraperWindow.isDestroyed()) {
              scraperWindow.destroy();
            }
          }
        }, 3000); // Wait for page to render
      });

      setTimeout(() => {
        if (scraperWindow && !scraperWindow.isDestroyed()) {
          scraperWindow.destroy();
          resolve({ success: false, error: 'Timeout' });
        }
      }, 15000);
    });
  });
}

module.exports = { registerTopSellersIPC };
