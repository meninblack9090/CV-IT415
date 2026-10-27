// Run explicitly with `node tests/browser-theme.cjs` (requires local Chrome).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const workspace = path.resolve(__dirname, '..');
const artifacts = path.join(workspace, '.qa', 'themes');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-theme-chrome-'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [];
const failedRequests = [];
let browser;
let socket;
let server;

async function main() {
  fs.mkdirSync(artifacts, { recursive: true });
  server = http.createServer((request, response) => {
    const filename = path.resolve(workspace, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (!filename.startsWith(workspace + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
    try {
      const content = fs.readFileSync(filename);
      response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' });
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  browser = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--force-device-scale-factor=1', 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  browser.on('error', error => errors.push(error.message));
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100 && !fs.existsSync(portFile); attempt++) await delay(100);
  assert(fs.existsSync(portFile), 'Chrome remote debugging started');
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  let tabs;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) })).json();
      if (tabs.some(candidate => candidate.type === 'page')) break;
    } catch {}
    await delay(100);
  }
  assert(tabs, 'Chrome debugging endpoint responds');
  console.log('Connected to local Chrome.');
  const tab = tabs.find(candidate => candidate.type === 'page');
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) failedRequests.push(message.params.response.url);
    if (!message.id) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  function cdp(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Network.enable');
  await cdp('DOM.enable');
  await cdp('CSS.enable');
  // Offline-safe QA: use the existing system font fallbacks.
  await cdp('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate('document.readyState === "complete" && !!document.getElementById("theme-toggle")')) break;
    await delay(100);
  }
  await delay(1200);
  assert(await evaluate('document.getElementById("loader").classList.contains("done")'));
  const staticContent = '(() => { const main = document.querySelector("main").cloneNode(true); main.querySelector("#role").textContent = ""; return main.textContent; })()';
  const beforeContent = await evaluate(staticContent);
  const initialTheme = await evaluate('document.documentElement.dataset.theme');
  await evaluate('document.getElementById("theme-toggle").click()');
  assert(await evaluate('document.documentElement.classList.contains("theming")'));
  await delay(500);
  assert(!(await evaluate('document.documentElement.classList.contains("theming")')));
  assert.notEqual(await evaluate('document.documentElement.dataset.theme'), initialTheme);
  const savedTheme = await evaluate('localStorage.getItem("cv-theme")');
  await cdp('Page.reload');
  await delay(1200);
  assert.equal(await evaluate('document.documentElement.dataset.theme'), savedTheme);
  await evaluate(`(async () => {
    for (const image of document.images) {
      if (!image.getAttribute('src')) continue;
      image.loading = 'eager';
      await image.decode();
    }
  })()`);

  const carousel = await evaluate(`(() => [...document.querySelectorAll('.logo-row')].map(row => {
    const sets = [...row.querySelectorAll('.logo-set')];
    const track = row.querySelector('.logo-track');
    return {
      names: [...sets[0].querySelectorAll('img')].map(image => image.alt),
      duplicateNames: [...sets[1].querySelectorAll('img')].map(image => image.alt),
      hidden: sets[1].getAttribute('aria-hidden'), duplicateTabStops: sets[1].querySelectorAll('[tabindex="0"]').length,
      widths: sets.map(set => set.getBoundingClientRect().width),
      duration: getComputedStyle(track).animationDuration,
      direction: getComputedStyle(track).animationDirection,
      transform: getComputedStyle(track).transform,
    };
  }))()`);
  assert.equal(carousel.length, 2);
  assert.deepEqual(carousel[0].names, ['HTML5', 'CSS3', 'JavaScript', 'Python', 'Java', 'PHP', 'React', 'Node.js']);
  assert.deepEqual(carousel[1].names, ['Laravel', 'Django', 'Flutter', 'ChatGPT', 'Claude', 'GitHub Copilot', 'Gemini', 'GitHub']);
  for (const row of carousel) {
    assert.deepEqual(row.names, row.duplicateNames);
    assert.equal(row.hidden, 'true');
    assert.equal(row.duplicateTabStops, 0);
    assert(Math.abs(row.widths[0] - row.widths[1]) < .01);
  }
  assert.equal(carousel[0].duration, '25s');
  assert.equal(carousel[1].duration, '32s');
  assert.equal(carousel[0].direction, 'normal');
  assert.equal(carousel[1].direction, 'reverse');
  await delay(100);
  assert.notEqual(await evaluate('getComputedStyle(document.querySelector(".logo-track")).transform'), carousel[0].transform);
  const carouselDocument = await cdp('DOM.getDocument');
  const carouselRow = await cdp('DOM.querySelector', { nodeId: carouselDocument.root.nodeId, selector: '.logo-row' });
  await cdp('CSS.forcePseudoState', { nodeId: carouselRow.nodeId, forcedPseudoClasses: ['hover'] });
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".logo-track")).animationPlayState'), 'paused');
  await cdp('CSS.forcePseudoState', { nodeId: carouselRow.nodeId, forcedPseudoClasses: [] });
  await evaluate('document.querySelector(".technology-logo").focus({preventScroll:true})');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".logo-track")).animationPlayState'), 'paused');
  await evaluate('document.activeElement.blur()');

  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const reports = [];
  for (const [label, width, height] of [['desktop', 1440, 1000], ['tablet', 768, 1024], ['mobile', 390, 844]]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await delay(100);
    for (const theme of ['light', 'dark']) {
      await evaluate(`history.replaceState(null, '', location.pathname); if (document.documentElement.dataset.theme !== '${theme}') document.getElementById('theme-toggle').click(); window.scrollTo({top:0,left:0,behavior:'instant'});`);
      await delay(100);
      await evaluate('window.scrollTo({top:0,left:0,behavior:"instant"})');
      assert.equal(await evaluate('window.scrollY'), 0);
      const report = await evaluate(`(() => {
        const root = document.documentElement;
        const button = document.getElementById('theme-toggle');
        const color = selector => getComputedStyle(document.querySelector(selector)).color;
        const bg = selector => getComputedStyle(document.querySelector(selector)).backgroundColor;
        const buttonRect = button.getBoundingClientRect();
        const sections = [...document.querySelectorAll('main > section')].map(section => ({
          id: section.id,
          width: section.getBoundingClientRect().width,
          background: getComputedStyle(section).backgroundColor,
        }));
        return {
          theme: root.dataset.theme,
          aria: button.getAttribute('aria-label'), pressed: button.getAttribute('aria-pressed'),
          icons: [...button.querySelectorAll('svg')].map(svg => ({ name: svg.classList[0], display: getComputedStyle(svg).display })),
          button: { width: buttonRect.width, height: buttonRect.height, right: buttonRect.right },
          viewport: innerWidth, scrollWidth: root.scrollWidth,
          bg: bg('body'), hero: bg('.hero'), heroText: color('.hero'), heading: color('h2'),
          card: bg('.card'), tags: bg('.tag'), footer: bg('footer'),
          reducedMotion: getComputedStyle(document.querySelector('.photo::before') || document.querySelector('.photo'), '::before').animationName,
          sections,
          brokenImages: [...document.images].filter(image => (!image.complete || !image.naturalWidth) && image.getAttribute('src')).map(image => image.getAttribute('src')),
        };
      })()`);
      assert.equal(report.theme, theme);
      assert.equal(report.aria, `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
      assert.equal(report.pressed, String(theme === 'dark'));
      assert.equal(report.icons.find(icon => icon.name === `theme-icon-${theme === 'dark' ? 'sun' : 'moon'}`).display, 'block');
      assert.equal(report.icons.find(icon => icon.name === `theme-icon-${theme === 'dark' ? 'moon' : 'sun'}`).display, 'none');
      assert.equal(report.button.width, report.button.height);
      assert(report.button.right <= width);
      assert(report.scrollWidth <= width, `No horizontal overflow at ${label} ${theme}`);
      assert.equal(report.sections.length, 8);
      assert.deepEqual(report.brokenImages, []);
      assert.equal(report.bg, theme === 'dark' ? 'rgb(34, 43, 61)' : 'rgb(255, 250, 240)');
      assert.equal(report.hero, theme === 'dark' ? 'rgb(65, 67, 106)' : 'rgb(2, 129, 116)');
      assert.equal(report.heroText, theme === 'dark' ? 'rgb(238, 240, 248)' : 'rgb(255, 255, 255)');
      assert.equal(report.reducedMotion, 'none');
      const reducedCarousel = await evaluate(`(() => ({
        animations: [...document.querySelectorAll('.logo-track')].map(track => getComputedStyle(track).animationName),
        copies: [...document.querySelectorAll('.logo-set[aria-hidden]')].map(set => getComputedStyle(set).display),
        fades: [...document.querySelectorAll('.logo-row')].map(row => getComputedStyle(row).maskImage),
        wrapping: [...document.querySelectorAll('.logo-set:not([aria-hidden])')].map(set => getComputedStyle(set).flexWrap),
      }))()`);
      assert(reducedCarousel.animations.every(value => value === 'none'));
      assert(reducedCarousel.copies.every(value => value === 'none'));
      assert(reducedCarousel.fades.every(value => value === 'none'));
      assert(reducedCarousel.wrapping.every(value => value === 'wrap'));
      assert(!(await evaluate('document.documentElement.classList.contains("theming")')));

      // Check all meaningful text colors against ancestor surfaces and gradient endpoints.
      const contrastExpression = `(() => {
        const role = document.getElementById('role');
        const animatedRole = role.textContent;
        role.textContent = role.getAttribute('aria-label');
        const rgba = color => (color.match(/[\\d.]+/g) || []).map(Number);
        const luminance = rgb => rgb.slice(0,3).map(value => {
          value /= 255;
          return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
        }).reduce((sum, value, index) => sum + value * [.2126,.7152,.0722][index], 0);
        const ratio = (a,b) => { const x = luminance(a), y = luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
        const mix = (a,b,t) => {
          const aa = a[3] ?? 1, ba = b[3] ?? 1;
          const alpha = aa*(1-t)+ba*t;
          return [...a.slice(0,3).map((value,index) => alpha ? (value*aa*(1-t)+b[index]*ba*t)/alpha : 0),alpha];
        };
        // Sample gradients where each text line is actually drawn. A distant
        // glow or the darkest thumbnail corner need not sit behind the text.
        const gradientAt = (image,rect,point) => {
          const colors = (image.match(/rgba?\\([^)]+\\)/g) || []).map(rgba);
          if (colors.length !== 2) return null;
          let t;
          if (image.startsWith('linear-gradient')) {
            const angle = Number(image.match(/linear-gradient\\(([\\d.-]+)deg/)[1])*Math.PI/180;
            const dx = Math.sin(angle), dy = -Math.cos(angle);
            t = .5 + ((point.x-rect.left-rect.width/2)*dx+(point.y-rect.top-rect.height/2)*dy)/(Math.abs(rect.width*dx)+Math.abs(rect.height*dy));
          } else {
            const geometry = image.match(/radial-gradient\\(([\\d.]+)px ([\\d.]+)px at ([\\d.]+)% ([\\d.]+)%/);
            if (!geometry) return null;
            const [,rx,ry,cx,cy] = geometry.map(Number);
            const end = Number(image.match(/([\\d.]+)%\\)/)[1])/100;
            t = Math.hypot((point.x-rect.left-rect.width*cx/100)/rx,(point.y-rect.top-rect.height*cy/100)/ry)/end;
          }
          return mix(colors[0],colors[1],Math.max(0,Math.min(1,t)));
        };
        const backgroundAt = (element,point) => {
          const layers = [];
          for (let ancestor=element; ancestor; ancestor=ancestor.parentElement) {
            const surface = getComputedStyle(ancestor);
            const gradient = gradientAt(surface.backgroundImage,ancestor.getBoundingClientRect(),point);
            if (gradient) layers.push(gradient);
            const base = rgba(surface.backgroundColor);
            if ((base[3] ?? 1) > 0) layers.push(base);
            if ((base[3] ?? 1) === 1) break;
          }
          return layers.reverse().reduce((background,foreground) => {
            const alpha = foreground[3] ?? 1;
            return [...foreground.slice(0,3).map((value,index) => value*alpha+background[index]*(1-alpha)),1];
          },[255,255,255,1]);
        };
        const failures = [];
        let checked = 0;
        for (const element of document.querySelectorAll('body *')) {
          if (!element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) || ![...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())) continue;
          if (element.closest('#loader,#lightbox,svg,script')) continue;
          const style = getComputedStyle(element);
          const backgrounds = [];
          for (const node of element.childNodes) {
            if (node.nodeType !== 3 || !node.textContent.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const rect of range.getClientRects()) {
              for (const offset of [.05,.5,.95]) backgrounds.push(backgroundAt(element,{x:rect.left+rect.width*offset,y:rect.top+rect.height/2}));
            }
          }
          const required = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && parseFloat(style.fontWeight) >= 700) ? 3 : 4.5;
          const minimum = Math.min(...backgrounds.map(background => ratio(rgba(style.color), background)));
          checked++;
          if (minimum < required) failures.push({ text: element.textContent.trim().slice(0,55), ratio: +minimum.toFixed(2), required, selector: element.tagName + '.' + element.className });
        }
        role.textContent = animatedRole;
        return {checked, failures};
      })()`;
      const contrast = await evaluate(contrastExpression);
      report.contrast = contrast;
      report.hoverFailures = [];
      const documentNode = await cdp('DOM.getDocument');
      for (const selector of ['.skill-areas div', '.social-link', '.project-links a', '.btn.main', '.btn.ghost', '.filters button', '.links a', '.theme-toggle']) {
        const { nodeId } = await cdp('DOM.querySelector', { nodeId: documentNode.root.nodeId, selector });
        await cdp('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });
        const hovered = await evaluate(contrastExpression);
        report.hoverFailures.push(...hovered.failures.map(failure => ({ hovered: selector, ...failure })));
        await cdp('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
      }
      const metrics = await cdp('Page.getLayoutMetrics');
      const capture = await cdp('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height: Math.ceil(metrics.cssContentSize.height), scale: 1 },
      });
      fs.writeFileSync(path.join(artifacts, `${label}-${theme}.png`), Buffer.from(capture.data, 'base64'));
      const skillsClip = await evaluate('(() => { const rect = document.getElementById("skills").getBoundingClientRect(); return {x:0,y:rect.top + scrollY,width:innerWidth,height:rect.height,scale:1}; })()');
      const skillsCapture = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: skillsClip });
      fs.writeFileSync(path.join(artifacts, `skills-${label}-${theme}.png`), Buffer.from(skillsCapture.data, 'base64'));
      await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
      const animatedBounds = await evaluate(`(() => {
        const box = document.querySelector('.technology-icons').getBoundingClientRect();
        const cards = document.querySelector('.skill-areas').getBoundingClientRect();
        return {width:box.width, height:box.height, right:box.right, column:cards.width, scrollWidth:document.documentElement.scrollWidth};
      })()`);
      assert(animatedBounds.width <= animatedBounds.column + 1);
      assert(animatedBounds.right <= width);
      assert(animatedBounds.scrollWidth <= width);
      assert(Math.abs(animatedBounds.height - (width <= 640 ? 188.4 : 133.2)) < 1);
      const animatedClip = await evaluate('(() => { const rect = document.getElementById("skills").getBoundingClientRect(); return {x:0,y:rect.top+scrollY,width:innerWidth,height:rect.height,scale:1}; })()');
      const animatedCapture = await cdp('Page.captureScreenshot', {format:'png',captureBeyondViewport:true,clip:animatedClip});
      fs.writeFileSync(path.join(artifacts, `skills-animated-${label}-${theme}.png`), Buffer.from(animatedCapture.data, 'base64'));
      await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      reports.push({ label, ...report });

      if (width <= 1000) {
        await evaluate('document.getElementById("burger").click()');
        assert(await evaluate('document.getElementById("links").classList.contains("open")'));
        await evaluate('document.querySelector(".links a").click()');
        assert(!(await evaluate('document.getElementById("links").classList.contains("open")')));
      }
      await evaluate('document.querySelector(".certificate-card button").click()');
      assert.equal(await evaluate('document.getElementById("lightbox").getAttribute("aria-hidden")'), 'false');
      assert(await evaluate('document.querySelector("#lightbox img").src === new URL(document.querySelector(".certificate-card button").dataset.img, location.href).href'));
      await evaluate('window.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape"}))');
      assert.equal(await evaluate('document.getElementById("lightbox").getAttribute("aria-hidden")'), 'true');
      await evaluate('document.querySelector(".filters button[data-f=mobile]").click()');
      assert.equal(await evaluate('document.querySelectorAll(".project-card:not(.hide)").length'), 1);
      await evaluate('document.querySelector(".filters button[data-f=all]").click()');
      await evaluate('document.getElementById("email-toggle").click()');
      assert(!(await evaluate('document.getElementById("contact-form").hidden')));
      assert.equal(await evaluate('document.getElementById("email-toggle").getAttribute("aria-expanded")'), 'true');
      assert(!(await evaluate('document.getElementById("contact-form").reportValidity()')));
      const message = {name:'Visitor & Friend',email:'visitor@example.com',subject:'Project inquiry & demo?',message:'Hello Justin,\nCan we discuss a project with images & links?\nThank you!'};
      await evaluate(`(() => {
        const form=document.getElementById('contact-form');
        for(const [name,value] of Object.entries(${JSON.stringify(message)})) {
          form.elements.namedItem(name).value=value;
          form.elements.namedItem(name).dispatchEvent(new Event('input',{bubbles:true}));
        }
        form.elements.namedItem('email').value='invalid-address';
      })()`);
      assert(!(await evaluate('document.getElementById("contact-form").reportValidity()')));
      await evaluate(`(() => {
        const form=document.getElementById('contact-form');
        form.elements.namedItem('email').value='visitor@example.com';
        form.elements.namedItem('name').value='   ';
        form.requestSubmit();
      })()`);
      assert(await evaluate('!!document.getElementById("contact-form").elements.namedItem("name").validationMessage'));
      await evaluate(`(() => {
        const form=document.getElementById('contact-form');
        const name=form.elements.namedItem('name');
        name.value=${JSON.stringify(message.name)};
        name.dispatchEvent(new Event('input',{bubbles:true}));
        if(!window.__draftIntercept) {
          document.getElementById('contact-draft-link').addEventListener('click',event=>{
            event.preventDefault();
            window.__draftHref=event.currentTarget.href;
          });
          window.__draftIntercept=true;
        }
        form.requestSubmit();
      })()`);
      const draft=new URL(await evaluate('window.__draftHref'));
      assert.equal(draft.protocol,'mailto:');
      assert.equal(draft.pathname,'umalay.justin@dnsc.edu.ph');
      assert.equal(draft.searchParams.get('subject'),message.subject);
      assert.equal(draft.searchParams.get('body'),`Name: ${message.name}\nEmail: ${message.email}\n\n${message.message}`);
      assert(!(await evaluate('document.getElementById("contact-draft-link").hidden')));
      const formContrast=await evaluate(contrastExpression.replace("document.querySelectorAll('body *')", "document.querySelectorAll('#contact-form *')"));
      assert.deepEqual(formContrast.failures,[],'Contact form text contrast');
      assert((await evaluate('document.documentElement.scrollWidth'))<=width,'Contact form fits the viewport');
      const formClip=await evaluate('(() => {const rect=document.getElementById("contact-form").getBoundingClientRect();return{x:rect.left,y:rect.top+scrollY,width:rect.width,height:rect.height,scale:1};})()');
      const formCapture=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:formClip});
      fs.writeFileSync(path.join(artifacts,`contact-${label}-${theme}.png`),Buffer.from(formCapture.data,'base64'));
      await evaluate('document.getElementById("email-toggle").click(); document.getElementById("contact-form").reset();');
      assert(await evaluate('document.getElementById("contact-form").hidden'));
      assert.equal(await evaluate('document.getElementById("email-toggle").getAttribute("aria-expanded")'),'false');
    }
  }
  assert.equal(await evaluate(staticContent), beforeContent);
  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests.filter(url => !url.endsWith('/favicon.ico')), []);
  fs.writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify({ reports, errors, failedRequests }, null, 2));
  for (const report of reports) {
    console.log(`${report.label} ${report.theme}: all 8 sections, icons, menu/filter/lightbox, ${report.contrast.checked} contrast checks; ${report.contrast.failures.length} contrast failures`);
    if (report.contrast.failures.length) console.log(JSON.stringify(report.contrast.failures));
    if (report.hoverFailures.length) console.log('Hover contrast: ' + JSON.stringify(report.hoverFailures));
  }
  assert(reports.every(report => report.contrast.failures.length === 0), 'All checked text meets WCAG AA contrast');
  assert(reports.every(report => report.hoverFailures.length === 0), 'All checked hover text meets WCAG AA contrast');
  console.log('Browser checks passed. Screenshots: .qa/themes/');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (socket) socket.close();
  if (browser) browser.kill();
  if (server) server.closeAllConnections();
  if (server) server.close();
  // Only remove the exact temporary browser profile created by this script.
  const resolved = path.resolve(profile);
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('cv-theme-chrome-')) {
    await delay(500);
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
  }
});
