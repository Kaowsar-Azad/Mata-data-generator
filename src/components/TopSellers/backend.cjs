function registerTopSellersIPC(ipcMain, BrowserWindow) {
  ipcMain.handle("scrape-top-sellers", async (event, payload) => {
    const mainModule = require("../../../electron/main.cjs") || {};
    const fileLog = mainModule.fileLog || console.log;

    const { platform, query, order, contentType, gentech, page } =
      typeof payload === "object"
        ? payload
        : { query: payload, platform: "adobe-stock", page: 1 };

    try {
      if (platform === "adobe-stock") {
        const { scrapeTextSearch } = require("./scrapers/adobeStock.cjs");
        return await scrapeTextSearch(
          { query, order, contentType, gentech, page },
          BrowserWindow,
          fileLog,
        );
      } else if (platform === "shutterstock") {
        const { scrapeTextSearch } = require("./scrapers/shutterstock.cjs");
        return await scrapeTextSearch(
          { query, order, contentType, gentech, page },
          BrowserWindow,
          fileLog,
        );
      } else if (platform === "freepik") {
        const { scrapeTextSearch } = require("./scrapers/freepik.cjs");
        return await scrapeTextSearch(
          { query, order, contentType, gentech, page },
          BrowserWindow,
          fileLog,
        );
      } else if (platform === "vecteezy") {
        const { scrapeTextSearch } = require("./scrapers/vecteezy.cjs");
        return await scrapeTextSearch(
          { query, order, contentType, gentech, page },
          BrowserWindow,
          fileLog,
        );
      } else {
        return { success: false, error: "Platform not supported yet." };
      }
    } catch (err) {
      fileLog(`[Scraper Router] Error: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("scrape-adobe-stock-by-image", async (event, filePath, contentType) => {
    if (contentType === "video") contentType = "all";
    const path = require("path");
    const fs = require("fs");
    const os = require("os");
    const LOG_FILE = path.join(os.tmpdir(), "imagemetadata_electron.log");

    const fileLog = (...args) => {
      try {
        const msg = `[${new Date().toISOString()}] ${args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === "object" ? JSON.stringify(a) : a)).join(" ")}\n`;
        fs.appendFileSync(LOG_FILE, msg);
        console.log(...args);
      } catch (e) {
        console.error("Logging failed:", e);
      }
    };

    return new Promise((resolve) => {
      fileLog(`[Visual Search] Starting search for file: ${filePath}`);
      const userAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

      let scraperWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      let completed = false;
      let safetyTimeout;

      // Clean cleanup helper
      const cleanupAndResolve = (result) => {
        if (completed) return;
        completed = true;
        if (safetyTimeout) clearTimeout(safetyTimeout);
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
          fileLog(
            `[Visual Search] Results page URL: ${scraperWindow.webContents.getURL()}`,
          );
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

          fileLog(
            `[Visual Search] Scraped successfully! Images found: ${debugInfo.images.length}`,
          );
          cleanupAndResolve({ success: true, images: debugInfo.images });
        } catch (err) {
          fileLog(`[Visual Search] Scrape execution failed: ${err.message}`);
          cleanupAndResolve({ success: false, error: err.message });
        }
      };

      let filterApplied = false;
      scraperWindow.webContents.on("did-finish-load", () => {
        if (completed) return;
        const currentUrl = scraperWindow.webContents.getURL();
        fileLog(`[Visual Search] Page finished loading: ${currentUrl}`);
        
        if (currentUrl.includes("visual-search") || currentUrl.includes("/search")) {
          if (contentType && contentType !== "all" && !filterApplied) {
            const resolvedType = contentType === "vector" ? "zip_vector" : contentType;
            if (!currentUrl.includes(`content_type:${resolvedType}`)) {
              filterApplied = true;
              const targetUrl = currentUrl + `&filters[content_type:${resolvedType}]=1`;
              fileLog(`[Visual Search] Appending filter and reloading: ${targetUrl}`);
              scraperWindow.loadURL(targetUrl, { userAgent });
              return;
            }
          }
          
          scrapeResultsPage();
        }
      });

      // Register listener BEFORE loadURL
      scraperWindow.webContents.once("did-finish-load", () => {
        fileLog(`[Visual Search] Initial page loaded. Triggering upload flow.`);

        // Use a loop check for element instead of fixed setTimeout
        let checkAttempts = 0;
        const clickAndInject = async () => {
          if (completed) return;
          try {
            fileLog(
              `[Visual Search] Attempting to click camera button (Attempt ${checkAttempts + 1})...`,
            );

            const btnExists = await scraperWindow.webContents
              .executeJavaScript(`
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
              fileLog(
                `[Visual Search] Camera button clicked. Waiting for file input...`,
              );

              // Wait for file input to appear
              let inputAttempts = 0;
              const injectFile = async () => {
                if (completed) return;
                try {
                  const inputExists = await scraperWindow.webContents
                    .executeJavaScript(`
                    !!document.querySelector('input[type="file"]')
                  `);

                  if (inputExists) {
                    fileLog(
                      `[Visual Search] File input rendered. Attaching debugger...`,
                    );

                    try {
                      scraperWindow.webContents.debugger.attach("1.3");
                    } catch (dbgErr) {
                      fileLog(
                        `[Visual Search] Debugger attach warning (might be already attached): ${dbgErr.message}`,
                      );
                    }

                    let injectSuccess = false;
                    let retryCount = 0;

                    while (!injectSuccess && retryCount < 8) {
                      try {
                        fileLog(
                          `[Visual Search] Fetching fresh DOM document (Try ${retryCount + 1})...`,
                        );
                        const { root } =
                          await scraperWindow.webContents.debugger.sendCommand(
                            "DOM.getDocument",
                          );

                        const { nodeId } =
                          await scraperWindow.webContents.debugger.sendCommand(
                            "DOM.querySelector",
                            {
                              nodeId: root.nodeId,
                              selector: 'input[type="file"]',
                            },
                          );

                        if (nodeId) {
                          fileLog(
                            `[Visual Search] Injecting file path using CDP...`,
                          );
                          await scraperWindow.webContents.debugger.sendCommand(
                            "DOM.setFileInputFiles",
                            {
                              files: [filePath],
                              nodeId: nodeId,
                            },
                          );
                          injectSuccess = true;
                          fileLog(
                            `[Visual Search] File injected successfully.`,
                          );
                        } else {
                          fileLog(
                            `[Visual Search] QuerySelector did not return a nodeId.`,
                          );
                          retryCount++;
                          await new Promise((r) => setTimeout(r, 200));
                        }
                      } catch (err) {
                        fileLog(
                          `[Visual Search] CDP injection attempt ${retryCount + 1} failed: ${err.message}`,
                        );
                        retryCount++;
                        // Wait a bit before retrying to allow DOM to settle
                        await new Promise((r) => setTimeout(r, 250));
                      }
                    }

                    try {
                      scraperWindow.webContents.debugger.detach();
                    } catch (e) {}

                    if (!injectSuccess) {
                      cleanupAndResolve({
                        success: false,
                        error:
                          "Could not inject file path into Adobe Stock after 8 attempts.",
                      });
                      return;
                    }
                  } else {
                    inputAttempts++;
                    if (inputAttempts < 15) {
                      setTimeout(injectFile, 200); // Poll every 200ms
                    } else {
                      cleanupAndResolve({
                        success: false,
                        error: "File input did not render on Adobe Stock.",
                      });
                    }
                  }
                } catch (err) {
                  fileLog(
                    `[Visual Search] Injection process failed: ${err.message}`,
                  );
                  cleanupAndResolve({ success: false, error: err.message });
                }
              };

              injectFile();
            } else {
              checkAttempts++;
              if (checkAttempts < 15) {
                setTimeout(clickAndInject, 200); // Try again in 200ms
              } else {
                cleanupAndResolve({
                  success: false,
                  error: "Camera button not found on page.",
                });
              }
            }
          } catch (err) {
            fileLog(`[Visual Search] Click trigger failed: ${err.message}`);
            cleanupAndResolve({ success: false, error: err.message });
          }
        };

        clickAndInject();
      });

      scraperWindow.loadURL("https://stock.adobe.com", { userAgent });

      // Safety timeout: 45 seconds total if something completely hangs
      safetyTimeout = setTimeout(() => {
        if (!completed) {
          fileLog(`[Visual Search] Global timeout reached!`);
          cleanupAndResolve({
            success: false,
            error: "Timeout waiting for visual search to complete.",
          });
        }
      }, 45000);
    });
  });

  ipcMain.handle("adobe-stock-details", async (event, url) => {
    return new Promise((resolve) => {
      const userAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
      let scraperWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      const safetyTimeout = setTimeout(() => {
        if (scraperWindow && !scraperWindow.isDestroyed()) {
          scraperWindow.destroy();
          resolve({ success: false, error: "Timeout" });
        }
      }, 15000);

      scraperWindow.loadURL(url, { userAgent });

      scraperWindow.webContents.on("dom-ready", () => {
        setTimeout(async () => {
          try {
            const data = await scraperWindow.webContents.executeJavaScript(`
              (async () => {
                const html = document.documentElement.outerHTML;
                let keywords = [];
                
                // 1. Extract directly from Apollo / Redux state in HTML (Adobe Stock and Shutterstock)
                const match = html.match(/"keywords":\\[(.*?)\\]/);
                if (match) {
                    try {
                        keywords = JSON.parse('[' + match[1] + ']');
                    } catch (e) {
                        keywords = match[1].split(',').map(s => s.replace(/"/g, '').trim());
                    }
                }

                // Clean and normalize keywords
                keywords = keywords.map(k => k.replace(/\\s+/g, ' ').trim()).filter(Boolean);

                // Filter out Adobe Firefly / Stock navigation promotional keywords and UI noise
                const headerPromos = new Set([
                  "image generation",
                  "change background",
                  "expand",
                  "change color",
                  "change mood",
                  "type to edit",
                  "bulk edit",
                  "generative fill",
                  "text to image",
                  "find similar",
                  "see more",
                  "download",
                  "share",
                  "license",
                  "free trial",
                  "my collections",
                  "collections",
                  "pricing",
                  "plans",
                  "subscription",
                  "login",
                  "logout",
                  "signin",
                  "signout",
                  "signup",
                  "register",
                  "categories",
                  "explore",
                  "trending",
                  "popular",
                  "recent",
                  "new",
                  "english",
                  "page",
                  "next",
                  "previous",
                  "original"
                ]);
                keywords = keywords.filter(k => !headerPromos.has(k.toLowerCase()));

                // 2. Try extracting from meta tags
                if (keywords.length < 5) {
                   const meta = document.querySelector('meta[name="keywords"]');
                   if (meta && meta.content) {
                      keywords = meta.content.split(',').map(k => k.replace(/\\s+/g, ' ').trim()).filter(Boolean);
                      keywords = keywords.filter(k => !headerPromos.has(k.toLowerCase()));
                   }
                }

                // 3. Extract from tag/search links (Vecteezy, Freepik/Magnific)
                if (keywords.length < 5) {
                  const tagLinks = [];
                  document.querySelectorAll('a').forEach(a => {
                    // Exclude header, nav, footer, and sidebar elements
                    if (a.closest('header') || a.closest('nav') || a.closest('footer') || a.closest('.header') || a.closest('.footer') || a.closest('[role="navigation"]')) {
                      return;
                    }
                    const href = a.href || '';
                    if (
                      href.includes('#referrer=detail') ||
                      href.includes('/search') || 
                      href.includes('/tags/') || 
                      href.includes('/tag/') || 
                      (href.includes('/videos/') && !href.endsWith('/videos') && !href.endsWith('/videos/')) ||
                      (href.includes('/images/') && !href.endsWith('/images') && !href.endsWith('/images/')) ||
                      href.includes('/free-vector') || 
                      href.includes('/vector-art') || 
                      href.includes('/free-video') || 
                      href.includes('/premium-video')
                    ) {
                      const text = a.textContent.replace(/\\s+/g, ' ').trim();
                      if (
                        text && 
                        text.length < 30 && 
                        !headerPromos.has(text.toLowerCase()) &&
                        !text.toLowerCase().includes('log') && 
                        !text.toLowerCase().includes('sign') && 
                        !text.toLowerCase().includes('pricing') && 
                        !text.toLowerCase().includes('magnific') &&
                        !text.toLowerCase().includes('vecteezy') &&
                        !text.toLowerCase().includes('vector') &&
                        !text.toLowerCase().includes('english') &&
                        !text.toLowerCase().includes('pусский') &&
                        !text.toLowerCase().includes('日本語') &&
                        !text.toLowerCase().includes('한국어')
                      ) {
                        tagLinks.push(text);
                      }
                    }
                  });
                  keywords = tagLinks;
                }

                // Clean keywords (remove empty items, keep unique)
                keywords = [...new Set(keywords.map(k => k.toLowerCase()).filter(Boolean))];

                // Title
                const h1 = document.querySelector('h1')?.textContent.replace(/\\s+/g, ' ').trim() || '';
                const docTitle = document.title.split('|')[0].replace(/\\s+/g, ' ').trim();
                const title = h1 || docTitle;
                
                return { title, keywords };
              })();
            `);
            resolve({ success: true, data });
          } catch (err) {
            resolve({ success: false, error: err.message });
          } finally {
            clearTimeout(safetyTimeout);
            if (scraperWindow && !scraperWindow.isDestroyed()) {
              scraperWindow.destroy();
            }
          }
        }, 3000); // Wait for page to render
      });
    });
  });

  ipcMain.handle("scrape-vecteezy-by-image", async (event, filePath, contentType) => {
    if (contentType === "video") contentType = "all";
    const path = require("path");
    const fs = require("fs");
    const os = require("os");
    const LOG_FILE = path.join(os.tmpdir(), "imagemetadata_electron.log");

    const fileLog = (...args) => {
      try {
        const msg = `[${new Date().toISOString()}] ${args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === "object" ? JSON.stringify(a) : a)).join(" ")}\n`;
        fs.appendFileSync(LOG_FILE, msg);
        console.log(...args);
      } catch (e) {}
    };

    return new Promise((resolve) => {
      fileLog(`[Visual Search] Starting search for file: ${filePath}`);
      const userAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

      let scraperWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      let completed = false;
      let safetyTimeout;

      const cleanupAndResolve = (result) => {
        if (completed) return;
        completed = true;
        if (safetyTimeout) clearTimeout(safetyTimeout);
        fileLog(`[Visual Search] Resolving task. Success: ${result.success}`);
        try {
          if (scraperWindow && !scraperWindow.isDestroyed()) {
            scraperWindow.destroy();
          }
        } catch (e) {}
        resolve(result);
      };

      const scrapeResultsPage = async () => {
        try {
          fileLog(`[Visual Search] Scraping image metadata from Vecteezy...`);

          await scraperWindow.webContents.executeJavaScript(`
            (async () => {
              for (let i = 1; i <= 6; i++) {
                window.scrollTo(0, i * 600);
                await new Promise(r => setTimeout(r, 150));
              }
            })();
          `);

          const debugInfo = await scraperWindow.webContents.executeJavaScript(`
            (async () => {
              const uniqueImages = new Map();
              document.querySelectorAll('img').forEach(img => {
                const src = img.getAttribute('data-src') || img.src || img.srcset || '';
                if (src && (src.includes('vecteezy_') || src.includes('ezimg') || src.includes('system/resources/thumbnails'))) {
                  const alt = img.alt || 'Vecteezy Image';
                  const link = img.closest('a');
                  const detailUrl = link ? link.href : '';
                  if (!src.includes('term-bg')) {
                    const listItem = img.closest('li');
                    const videoUrl = listItem ? (listItem.getAttribute('data-video-url') || '') : '';
                    uniqueImages.set(src, { src, alt, detailUrl, videoUrl });
                  }
                }
              });

              return {
                title: document.title,
                images: Array.from(uniqueImages.values()).slice(0, 30)
              };
            })();
          `);

          fileLog(
            `[Visual Search] Scraped successfully! Images found: ${debugInfo.images.length}`,
          );
          cleanupAndResolve({ success: true, images: debugInfo.images });
        } catch (err) {
          fileLog(`[Visual Search] Scrape execution failed: ${err.message}`);
          cleanupAndResolve({ success: false, error: err.message });
        }
      };

      let filterApplied = false;
      const handleNavigation = (event, url) => {
        if (url.includes("/similar") || url.includes("/search")) {
          if (contentType && contentType !== "all" && !filterApplied) {
            const resolvedType = contentType === "vector" ? "vector" : contentType === "video" ? "video" : "photo";
            if (!url.includes(`type=${resolvedType}`)) {
              filterApplied = true;
              let targetUrl = url;
              if (targetUrl.includes("type=")) {
                targetUrl = targetUrl.replace(/type=[^&]*/, `type=${resolvedType}`);
              } else {
                targetUrl = targetUrl + (targetUrl.includes("?") ? "&" : "?") + `type=${resolvedType}`;
              }
              fileLog(`[Visual Search] Appending Vecteezy filter and reloading: ${targetUrl}`);
              scraperWindow.loadURL(targetUrl, { userAgent });
              return;
            }
          }

          fileLog(`[Visual Search] Vecteezy redirected to results: ${url}`);
          // Remove listeners to prevent multiple calls if both fire or if multiple in-page navigations occur
          scraperWindow.webContents.removeListener("did-navigate", handleNavigation);
          scraperWindow.webContents.removeListener("did-navigate-in-page", handleNavigation);
          
          setTimeout(() => {
            scrapeResultsPage();
          }, 3000); // Wait 3 seconds for results to load
        }
      };

      scraperWindow.webContents.on("did-navigate", handleNavigation);
      scraperWindow.webContents.on("did-navigate-in-page", handleNavigation);

      scraperWindow.loadURL("https://www.vecteezy.com", { userAgent });

      scraperWindow.webContents.once("did-finish-load", () => {
        fileLog(
          `[Visual Search] Vecteezy Initial page loaded. Triggering upload flow.`,
        );

        let checkAttempts = 0;
        const clickAndInject = async () => {
          if (completed) return;
          try {
            fileLog(
              `[Visual Search] Attempting to click camera button (Attempt ${checkAttempts + 1})...`,
            );

            const btnExists = await scraperWindow.webContents
              .executeJavaScript(`
              (function() {
                const btn = document.querySelector('.search-by-image') || document.querySelector('#sbi_button');
                if (btn) {
                  btn.click();
                  return true;
                }
                return false;
              })();
            `);

            if (btnExists) {
              fileLog(
                `[Visual Search] Camera button clicked. Waiting for file input...`,
              );

              let inputAttempts = 0;
              const injectFile = async () => {
                if (completed) return;
                try {
                  const inputExists = await scraperWindow.webContents
                    .executeJavaScript(`
                    !!document.querySelector('input.dz-hidden-input') || !!document.querySelector('input[type="file"]')
                  `);

                  if (inputExists) {
                    fileLog(
                      `[Visual Search] File input rendered. Attaching debugger...`,
                    );
                    try {
                      scraperWindow.webContents.debugger.attach("1.3");
                    } catch (dbgErr) {}

                    let injectSuccess = false;
                    let retryCount = 0;

                    while (!injectSuccess && retryCount < 8) {
                      try {
                        const { root } =
                          await scraperWindow.webContents.debugger.sendCommand(
                            "DOM.getDocument",
                            { depth: -1 },
                          );
                        const { nodeId } =
                          await scraperWindow.webContents.debugger.sendCommand(
                            "DOM.querySelector",
                            {
                              nodeId: root.nodeId,
                              selector:
                                'input.dz-hidden-input, input[type="file"]',
                            },
                          );

                        if (nodeId) {
                          await scraperWindow.webContents.debugger.sendCommand(
                            "DOM.setFileInputFiles",
                            {
                              files: [filePath],
                              nodeId: nodeId,
                            },
                          );
                          injectSuccess = true;

                          await scraperWindow.webContents.executeJavaScript(`
                            (function() {
                              const input = document.querySelector('input.dz-hidden-input') || document.querySelector('input[type="file"]');
                              if (input) {
                                input.dispatchEvent(new Event('change', { bubbles: true }));
                              }
                            })();
                          `);
                        } else {
                          retryCount++;
                          await new Promise((r) => setTimeout(r, 200));
                        }
                      } catch (err) {
                        retryCount++;
                        await new Promise((r) => setTimeout(r, 250));
                      }
                    }

                    try {
                      scraperWindow.webContents.debugger.detach();
                    } catch (e) {}

                    if (!injectSuccess) {
                      cleanupAndResolve({
                        success: false,
                        error: "Could not inject file path into Vecteezy.",
                      });
                    }
                  } else {
                    inputAttempts++;
                    if (inputAttempts < 15) setTimeout(injectFile, 200);
                    else
                      cleanupAndResolve({
                        success: false,
                        error: "File input did not render on Vecteezy.",
                      });
                  }
                } catch (err) {
                  cleanupAndResolve({ success: false, error: err.message });
                }
              };

              injectFile();
            } else {
              checkAttempts++;
              if (checkAttempts < 15) setTimeout(clickAndInject, 500);
              else
                cleanupAndResolve({
                  success: false,
                  error: "Camera button not found on Vecteezy.",
                });
            }
          } catch (err) {
            cleanupAndResolve({ success: false, error: err.message });
          }
        };

        clickAndInject();
      });

      safetyTimeout = setTimeout(() => {
        if (!completed) {
          fileLog(`[Visual Search] Global timeout reached!`);
          cleanupAndResolve({
            success: false,
            error: "Timeout waiting for visual search to complete.",
          });
        }
      }, 120000); // Increased timeout to 120 seconds for slow uploads
    });
  });

  ipcMain.handle("scrape-shutterstock-by-image", async (event, filePath, contentType) => {
    if (contentType === "video") contentType = "all";
    const path = require("path");
    const fs = require("fs");
    const os = require("os");
    const LOG_FILE = path.join(os.tmpdir(), "imagemetadata_electron.log");

    const fileLog = (...args) => {
      try {
        const msg = `[${new Date().toISOString()}] ${args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === "object" ? JSON.stringify(a) : a)).join(" ")}\n`;
        fs.appendFileSync(LOG_FILE, msg);
        console.log(...args);
      } catch (e) {}
    };

    return new Promise(async (resolve) => {
      fileLog(`[Visual Search] Starting search for file: ${filePath}`);
      const userAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

      let scraperWindow = new BrowserWindow({
        show: false,
        width: 1280,
        height: 800,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      let completed = false;
      let safetyTimeout;

      const cleanupAndResolve = (result) => {
        if (completed) return;
        completed = true;
        if (safetyTimeout) clearTimeout(safetyTimeout);
        fileLog(`[Visual Search] Resolving task. Success: ${result.success}`);
        try {
          if (scraperWindow && !scraperWindow.isDestroyed()) {
            scraperWindow.destroy();
          }
        } catch (e) {}
        resolve(result);
      };

      const scrapeResultsPage = async () => {
        if (completed) return;
        try {
          fileLog(
            `[Visual Search] Scraping image metadata from Shutterstock...`,
          );

          await scraperWindow.webContents.executeJavaScript(`
            (async () => {
              for (let i = 1; i <= 6; i++) {
                window.scrollTo(0, i * 600);
                await new Promise(r => setTimeout(r, 150));
              }
            })();
          `);

          const debugInfo = await scraperWindow.webContents.executeJavaScript(`
            (async () => {
              const uniqueImages = new Map();
              document.querySelectorAll('img').forEach(img => {
                // Check if the image is actually visible in the DOM layout
                if (img.offsetParent === null) return;

                // Exclude the search-by-image pill thumbnail
                const isPill = Array.from(img.classList || []).some(cls => cls.includes('pillThumbnail'));
                if (isPill) return;

                let src = img.getAttribute('data-src') || img.src || '';
                if ((!src || src.startsWith('data:')) && img.srcset) {
                  src = img.srcset.split(',')[0].trim().split(' ')[0];
                }
                if (src && !src.startsWith('data:') && (src.includes('shutterstock.com/image') || src.includes('260nw') || src.includes('600w') || src.includes('picdn.net'))) {
                  const finalSrc = src.replace(/100nw|260nw/g, '600w');
                  const alt = img.alt || 'Shutterstock Image';

                  // Find the link to the image detail page in the card structure
                  let link = img.closest('a');
                  if (!link) {
                    let current = img.parentElement;
                    for (let depth = 0; depth < 3 && current; depth++) {
                      link = current.querySelector('a');
                      if (link) break;
                      current = current.parentElement;
                    }
                  }
                  const detailUrl = link ? link.href : '';

                  if (!uniqueImages.has(finalSrc)) {
                    uniqueImages.set(finalSrc, { src: finalSrc, alt, detailUrl });
                  }
                }
              });

              return {
                title: document.title,
                images: Array.from(uniqueImages.values()).slice(0, 30)
              };
            })();
          `);

          fileLog(
            `[Visual Search] Scraped successfully! Images found: ${debugInfo.images.length}`,
          );
          cleanupAndResolve({ success: true, images: debugInfo.images });
        } catch (err) {
          fileLog(`[Visual Search] Scrape execution failed: ${err.message}`);
          cleanupAndResolve({ success: false, error: err.message });
        }
      };

      let filterApplied = false;
      let resultUrl = null;

      const handleNavigation = (event, url) => {
        // Catch any navigation that goes to search results
        if (
          url.includes("/similar") ||
          url.includes("/search/ris/") ||
          (url.includes("/search/") && !url.includes("/nature") && !url.includes("/en/search"))
        ) {
          if (contentType && contentType !== "all" && !filterApplied) {
            const resolvedType = contentType;
            if (!url.includes(`image_type=${resolvedType}`)) {
              filterApplied = true;
              let targetUrl = url;
              if (targetUrl.includes("image_type=")) {
                targetUrl = targetUrl.replace(/image_type=[^&]*/, `image_type=${resolvedType}`);
              } else {
                targetUrl = targetUrl + (targetUrl.includes("?") ? "&" : "?") + `image_type=${resolvedType}`;
              }
              fileLog(`[Visual Search] Appending Shutterstock filter and reloading: ${targetUrl}`);
              scraperWindow.loadURL(targetUrl, { userAgent });
              return;
            }
          }

          fileLog(`[Visual Search] Shutterstock redirected to results (${event && event.type === 'did-navigate-in-page' ? 'in-page' : 'standard'}): ${url}`);
          resultUrl = url;
          
          if (event && event.type === 'did-navigate-in-page') {
            setTimeout(() => {
              scrapeResultsPage();
            }, 4000); // Wait 4 seconds for React results grid to populate
          } else {
            // Wait for page to fully load, then scrape
            scraperWindow.webContents.once('did-finish-load', () => {
              setTimeout(() => {
                scrapeResultsPage();
              }, 2000); // Extra 2 seconds after load for lazy images
            });
          }
        }
      };

      scraperWindow.webContents.on("did-navigate", (event, url) => handleNavigation({ type: 'did-navigate' }, url));
      scraperWindow.webContents.on("did-navigate-in-page", (event, url) => handleNavigation({ type: 'did-navigate-in-page' }, url));

      // Two-phase approach:
      // Phase 1: Use uguu.se to get a public URL for the image
      // Phase 2: Use that URL with Shutterstock's native URL search (/search/ris/)
      //          which returns image-specific results, not generic defaults.
      try {
        fileLog(`[Visual Search] Phase 1 - Loading Shutterstock to inject file via CDP...`);
        scraperWindow.loadURL("https://www.shutterstock.com/en/search/nature", { userAgent });
        
        scraperWindow.webContents.once('did-finish-load', async () => {
          try {
            scraperWindow.webContents.debugger.attach('1.3');

            // Step 1: Click camera button
            const clicked = await scraperWindow.webContents.executeJavaScript(`
              (function() {
                  const btn = document.querySelector('[data-automation="Search by image"]') || document.querySelector('button[aria-label="Search by image"]');
                  if (btn) { btn.click(); return true; }
                  return false;
              })();
            `);
            
            if (!clicked) throw new Error("Could not find camera button.");
            
            await new Promise(r => setTimeout(r, 2000));
            
            // Step 2 & 3: Get file input node ID and inject file with retry loop
            let injectSuccess = false;
            let retryCount = 0;
            
            while (!injectSuccess && retryCount < 10) {
              try {
                fileLog(`[Visual Search] Fetching fresh DOM document for Shutterstock (Try ${retryCount + 1})...`);
                const { root } = await scraperWindow.webContents.debugger.sendCommand('DOM.getDocument', { depth: -1 });
                const { nodeId } = await scraperWindow.webContents.debugger.sendCommand('DOM.querySelector', {
                    nodeId: root.nodeId,
                    selector: 'input[type="file"]'
                });
                
                if (nodeId) {
                  fileLog(`[Visual Search] File input found (nodeId=${nodeId}). Injecting file...`);
                  await scraperWindow.webContents.debugger.sendCommand('DOM.setFileInputFiles', {
                      nodeId: nodeId,
                      files: [filePath]
                  });
                  injectSuccess = true;
                  fileLog(`[Visual Search] File injected successfully.`);
                } else {
                  fileLog(`[Visual Search] QuerySelector did not return a nodeId.`);
                  retryCount++;
                  await new Promise(r => setTimeout(r, 300));
                }
              } catch (err) {
                fileLog(`[Visual Search] CDP injection attempt ${retryCount + 1} failed: ${err.message}`);
                retryCount++;
                await new Promise(r => setTimeout(r, 300));
              }
            }

            if (!injectSuccess) {
              throw new Error("Could not inject file path into Shutterstock after 10 attempts.");
            }

            // Step 4: Dispatch change event to trigger the React component's upload handler
            await scraperWindow.webContents.executeJavaScript(`
                (function() {
                    const input = document.querySelector('input[type="file"]');
                    if (input) {
                        // Dispatch multiple events to ensure React picks it up
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                })();
            `);

            fileLog(`[Visual Search] File injected & events dispatched. Waiting for navigation...`);
            // The did-navigate handler will catch the redirect to /search/ris/...

          } catch (cdpErr) {
            fileLog(`[Visual Search] CDP Error: ${cdpErr.message}. Aborting.`);
            cleanupAndResolve({ success: false, error: cdpErr.message });
          }
        });
      } catch (err) {
        fileLog(`[Visual Search] Setup failed: ${err.message}`);
        cleanupAndResolve({ success: false, error: err.message });
      }

      safetyTimeout = setTimeout(() => {
        if (!completed) {
          fileLog(`[Visual Search] Global timeout reached!`);
          cleanupAndResolve({
            success: false,
            error: "Timeout waiting for visual search to complete.",
          });
        }
      }, 60000); 
    });
  });

  ipcMain.handle("scrape-video-preview", async (event, detailUrl) => {
    const path = require("path");
    const fs = require("fs");
    const os = require("os");
    const LOG_FILE = path.join(os.tmpdir(), "imagemetadata_electron.log");

    const fileLog = (...args) => {
      try {
        const msg = `[${new Date().toISOString()}] ${args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === "object" ? JSON.stringify(a) : a)).join(" ")}\n`;
        fs.appendFileSync(LOG_FILE, msg);
        console.log(...args);
      } catch (e) {}
    };

    return new Promise((resolve) => {
      fileLog(`[Video Preview] Scraping video preview URL: ${detailUrl}`);
      const userAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

      let scraperWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      let completed = false;
      let safetyTimeout;

      const cleanupAndResolve = (result) => {
        if (completed) return;
        completed = true;
        if (safetyTimeout) clearTimeout(safetyTimeout);
        fileLog(`[Video Preview] Resolving task. Success: ${result.success}`);
        try {
          if (scraperWindow && !scraperWindow.isDestroyed()) {
            scraperWindow.destroy();
          }
        } catch (e) {}
        resolve(result);
      };

      safetyTimeout = setTimeout(() => {
        if (!completed) {
          fileLog(`[Video Preview] Global timeout reached!`);
          cleanupAndResolve({
            success: false,
            error: "Timeout waiting for video preview to load.",
          });
        }
      }, 15000);

      scraperWindow.loadURL(detailUrl, { userAgent });

      scraperWindow.webContents.on("dom-ready", () => {
        setTimeout(async () => {
          if (completed) return;
          try {
            const videoUrl = await scraperWindow.webContents.executeJavaScript(`
              (() => {
                // Extract the unique numeric asset ID from the current page URL
                const urlMatch = window.location.href.match(/\\/(\\d+)(?:\\b|$|\\?|#)/);
                const assetId = urlMatch ? urlMatch[1] : '';

                // 1. Collect all video and source src elements
                const candidates = [];
                document.querySelectorAll('video, source').forEach(el => {
                  const src = el.src || el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || '';
                  if (src && !src.startsWith('blob:') && !src.startsWith('data:')) {
                    // Exclude generic header promotional template videos
                    if (!src.includes('supernav') && !src.includes('slp-statics')) {
                      candidates.push(src);
                    }
                  }
                });

                // 2. Prioritize the video stream containing the matching asset ID
                const realVideo = candidates.find(src => 
                  (assetId && src.includes(assetId)) &&
                  (src.includes('.mp4') || src.includes('.webm') || src.includes('ftcdn.net') || src.includes('picdn.net'))
                );
                if (realVideo) return realVideo;

                // 3. Fallback to generic preview video if asset ID match was not found
                const fallbackRealVideo = candidates.find(src => 
                  src.includes('.mp4') || 
                  src.includes('.webm') || 
                  src.includes('ftcdn.net') || 
                  src.includes('picdn.net')
                );
                if (fallbackRealVideo) return fallbackRealVideo;

                // 4. Fallback to any non-html webpage source
                const fallback = candidates.find(src => !src.includes('stock.adobe.com') && !src.includes('shutterstock.com'));
                if (fallback) return fallback;

                // 5. Fallback to meta tags only if they contain direct video file streams
                const meta = document.querySelector('meta[property="og:video"]') || 
                             document.querySelector('meta[property="og:video:secure_url"]') ||
                             document.querySelector('meta[name="twitter:player"]');
                if (meta && meta.content) {
                  const content = meta.content;
                  if (content.includes('.mp4') || content.includes('.webm') || content.includes('ftcdn.net') || content.includes('picdn.net')) {
                    return content;
                  }
                }

                return null;
              })()
            `);
            
            if (videoUrl) {
              fileLog(`[Video Preview] Found video preview URL: ${videoUrl}`);
              cleanupAndResolve({ success: true, videoUrl });
            } else {
              fileLog(`[Video Preview] No video preview found on page.`);
              cleanupAndResolve({ success: false, error: "No video found" });
            }
          } catch (err) {
            fileLog(`[Video Preview] executeJavaScript Error: ${err.message}`);
            cleanupAndResolve({ success: false, error: err.message });
          }
        }, 3000);
      });
    });
  });
}

module.exports = { registerTopSellersIPC };
