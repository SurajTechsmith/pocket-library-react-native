import * as Haptics from "expo-haptics";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import {
  addBookmark,
  addNote,
  deleteBookmark,
  deleteNote,
  getBook,
  getBookmarks,
  getNotes,
  isPageBookmarked,
  updateProgress,
  upsertSession,
} from "../db/queries";
import { useStore } from "../store/useStore";
import type { Bookmark, Note } from "../types/index";

type ReaderTheme = "dark" | "sepia" | "light";
const PDF_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html, body { width:100%; height:100%; background:#0a0a0a; }

/* scroll mode — vertical scroll */
#scroll-container {
  width:100%;
  height:100vh;
  overflow-y:auto;
  overflow-x:hidden;
  -webkit-overflow-scrolling:touch;
  display:none;
}
#scroll-container canvas {
  display:block;
  width:100%;
  margin-bottom:2px;
}

/* theme filters */
body.theme-dark #scroll-container canvas,
body.theme-dark #swipe-canvas {
  filter: invert(1) hue-rotate(180deg);
}

body.theme-sepia #scroll-container canvas,
body.theme-sepia #swipe-canvas {
  filter: sepia(0.8) brightness(0.9);
}

/* swipe mode — single page */
#swipe-container {
  width:100%;
  height:100vh;
  overflow:hidden;
  display:none;
  align-items:center;
  justify-content:center;
}
#swipe-canvas {
  display:block;
  touch-action:none;
  max-width:100%;
}

#loading {
  position:fixed; inset:0; display:flex; flex-direction:column;
  align-items:center; justify-content:center; color:#52525b;
  font-family:sans-serif; font-size:14px; gap:12px;
  background:#0a0a0a; z-index:10;
}
.spinner {
  width:32px; height:32px; border:2px solid #1f1f1f;
  border-top-color:#f59e0b; border-radius:50%;
  animation:spin .8s linear infinite;
}
@keyframes spin { to { transform:rotate(360deg); } }

/* mode pill indicator */
#mode-pill {
  position:fixed;
  bottom:24px;
  left:50%;
  transform:translateX(-50%);
  background:#000000cc;
  border:1px solid #2a2a2a;
  border-radius:20px;
  padding:6px 16px;
  color:#f59e0b;
  font-family:sans-serif;
  font-size:12px;
  font-weight:600;
  pointer-events:none;
  opacity:0;
  transition:opacity 0.3s;
  z-index:20;
  white-space:nowrap;
}
#mode-pill.show { opacity:1; }
</style>
</head>
<body>
<div id="loading"><div class="spinner"></div><span>Loading...</span></div>
<div id="scroll-container"></div>
<div id="swipe-container"><canvas id="swipe-canvas"></canvas></div>
<div id="mode-pill"></div>

<script>
var pdfjsLib;
var pdf = null;
var total = 0;
var currentPage = 1;
var rendering = false;
var mode = 'scroll'; // 'scroll' or 'swipe'
var theme = 'dark';
var pendingMsg = null;
var ready = false;
var startX = 0, startY = 0;
var pillTimer = null;

var scrollContainer = document.getElementById('scroll-container');
var swipeContainer = document.getElementById('swipe-container');
var swipeCanvas = document.getElementById('swipe-canvas');
var swipeCtx = swipeCanvas.getContext('2d');
var loading = document.getElementById('loading');
var pill = document.getElementById('mode-pill');

// ── script loader ──────────────────────────────
function loadScript(src, cb) {
  var s = document.createElement('script');
  s.src = src;
  s.onload = cb;
  s.onerror = function() {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type:'JS_ERROR', msg:'failed to load: '+src
    }));
  };
  document.head.appendChild(s);
}

loadScript(
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  function() {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    ready = true;
    if (pendingMsg) {
      var m = pendingMsg; pendingMsg = null; processLoad(m);
    }
  }
);

// ── theme ──────────────────────────────────────
function applyTheme(t) {
  var bg = t === 'light' ? '#ffffff' : t === 'sepia' ? '#f8f0e3' : '#111111';
  document.body.style.background = bg;
  scrollContainer.style.background = bg;
  swipeContainer.style.background = bg;
  // remove old theme classes
  document.body.classList.remove('theme-dark', 'theme-sepia', 'theme-light');
  document.body.classList.add('theme-' + t);
}
// ── show mode pill ─────────────────────────────
function showPill(text) {
  pill.textContent = text;
  pill.classList.add('show');
  clearTimeout(pillTimer);
  pillTimer = setTimeout(function() { pill.classList.remove('show'); }, 1500);
}

// ── render all pages into scroll container ─────
async function renderAllPages() {
  // create placeholder canvases for all pages first
  for (var i = 1; i <= total; i++) {
    var c = document.createElement('canvas');
    c.dataset.page = i;
    c.dataset.rendered = 'false';
    // estimate height so scroll position is roughly correct
    c.style.width = '100%';
    c.style.minHeight = '400px';
    c.style.display = 'block';
    c.style.marginBottom = '2px';
    scrollContainer.appendChild(c);
  }

  // render only first few pages immediately
  var pagesToPrerender = Math.min(total, currentPage + 2);
  for (var j = Math.max(1, currentPage - 1); j <= pagesToPrerender; j++) {
    await renderScrollPage(j);
  }
}

async function renderScrollPage(num) {
  var canvas = scrollContainer.querySelector('[data-page="'+num+'"]');
  if (!canvas || canvas.dataset.rendered === 'true') return;

  var page = await pdf.getPage(num);
  var dpr = window.devicePixelRatio || 1;
  var baseVp = page.getViewport({ scale: 1 });
  var scale = (window.innerWidth / baseVp.width) * dpr;
  var vp = page.getViewport({ scale: scale });

  // canvas internal size = scaled up by dpr
  canvas.width = vp.width;
  canvas.height = vp.height;

  // css display size = normal screen size
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = (vp.height / dpr) + 'px';

  canvas.dataset.rendered = 'true';
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
}

// ── render single page for swipe mode ─────────
async function renderSwipePage(num) {
  if (rendering || !pdf) return;
  rendering = true;
  try {
    var page = await pdf.getPage(num);
    var dpr = window.devicePixelRatio || 1;
    var baseVp = page.getViewport({ scale: 1 });
    var scale = (window.innerWidth / baseVp.width) * dpr;
    var vp = page.getViewport({ scale: scale });

    swipeCanvas.width = vp.width;
    swipeCanvas.height = vp.height;
    swipeCanvas.style.width = window.innerWidth + 'px';
    swipeCanvas.style.height = (vp.height / dpr) + 'px';

    await page.render({ canvasContext: swipeCtx, viewport: vp }).promise;
    currentPage = num;
    notifyPage(currentPage);
  } finally {
    rendering = false;
  }
}

// ── notify RN of page change ───────────────────
function notifyPage(p) {
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'PAGE_CHANGE', page: p, total: total
  }));
}

// ── track scroll position for page number ──────
function setupScrollTracking() {
  var ticking = false;
  scrollContainer.addEventListener('scroll', function() {
    if (!ticking) {
      requestAnimationFrame(async function() {
        var canvases = scrollContainer.querySelectorAll('canvas[data-page]');
        var scrollTop = scrollContainer.scrollTop;
        var viewHeight = scrollContainer.clientHeight;
        var scrollMid = scrollTop + viewHeight / 2;

        // update current page
        for (var i = canvases.length - 1; i >= 0; i--) {
          if (canvases[i].offsetTop <= scrollMid) {
            var p = parseInt(canvases[i].dataset.page);
            if (p !== currentPage) { currentPage = p; notifyPage(p); }
            break;
          }
        }

        // lazy render pages near viewport
        for (var j = 0; j < canvases.length; j++) {
          var c = canvases[j];
          var top = c.offsetTop;
          var inView = top >= scrollTop - viewHeight && top <= scrollTop + viewHeight * 2;
          if (inView && c.dataset.rendered === 'false') {
            renderScrollPage(parseInt(c.dataset.page));
          }
        }

        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
}
// ── switch between scroll and swipe ───────────
async function setMode(m) {
  mode = m;
  if (m === 'scroll') {
    swipeContainer.style.display = 'none';
    scrollContainer.style.display = 'block';
    showPill('Scroll mode');
    if (scrollContainer.children.length === 0) {
      await renderAllPages();
    }
    // jump instantly to current page — no smooth scroll
    var target = scrollContainer.querySelector('[data-page="'+currentPage+'"]');
    if (target) {
      // use instant jump not smooth scroll
      target.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  } else {
    scrollContainer.style.display = 'none';
    swipeContainer.style.display = 'flex';
    showPill('Swipe mode');
    await renderSwipePage(currentPage);
  }
  window.ReactNativeWebView.postMessage(JSON.stringify({ type:'MODE_CHANGE', mode:m }));
}
// ── process LOAD message ───────────────────────
async function processLoad(msg) {
  try {
    theme = msg.theme || 'dark';
    applyTheme(theme);
    currentPage = msg.startPage || 1;

    function base64ToBytes(b64) {
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }

    var bytes = base64ToBytes(msg.base64);
    pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    total = pdf.numPages;
    loading.style.display = 'none';
    await setMode('scroll');
    setupScrollTracking();
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type:'JS_ERROR', msg:'load error: '+e.message
    }));
  }
}

// ── message handler ────────────────────────────
function handleMsg(e) {
  var msg;
  try { msg = JSON.parse(e.data); } catch { return; }

  if (msg.type === 'LOAD') {
    if (!ready) { pendingMsg = msg; return; }
    processLoad(msg);
  }
  if (msg.type === 'GOTO') {
    if (mode === 'swipe') renderSwipePage(msg.page);
    else {
      currentPage = msg.page;
      var target = scrollContainer.querySelector('[data-page="'+msg.page+'"]');
      if (target) target.scrollIntoView({ behavior:'smooth' });
    }
  }
  if (msg.type === 'THEME') {
    theme = msg.theme;
    applyTheme(theme);
    if (mode === 'swipe') renderSwipePage(currentPage);
  }
  if (msg.type === 'TOGGLE_MODE') {
    setMode(mode === 'scroll' ? 'swipe' : 'scroll');
  }
}

document.addEventListener('message', handleMsg);
window.addEventListener('message', handleMsg);

// ── swipe gestures (swipe mode only) ──────────
document.addEventListener('touchstart', function(e) {
  startX = e.touches[0].clientX;
  startY = e.touches[0].clientY;
}, { passive:true });

document.addEventListener('touchend', async function(e) {
  if (mode !== 'swipe') return;
  var dx = startX - e.changedTouches[0].clientX;
  var dy = startY - e.changedTouches[0].clientY;

  // only handle horizontal swipes
  if (Math.abs(dx) < Math.abs(dy)) return;

  // tap — toggle header
  if (Math.abs(dx) < 10) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type:'TAP' }));
    return;
  }

  if (Math.abs(dx) < 60) return;
  if (dx > 0 && currentPage < total) await renderSwipePage(currentPage + 1);
  if (dx < 0 && currentPage > 1) await renderSwipePage(currentPage - 1);
});

// tap on scroll mode toggles header
scrollContainer.addEventListener('click', function() {
  window.ReactNativeWebView.postMessage(JSON.stringify({ type:'TAP' }));
});
</script>
</body>
</html>`;

const EPUB_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html, body { width:100%; height:100%; overflow:hidden; background:#0a0a0a; }
#viewer { width:100vw; height:100vh; }
#loading {
  position:fixed; inset:0; display:flex; flex-direction:column;
  align-items:center; justify-content:center; color:#52525b;
  font-family:sans-serif; font-size:14px; gap:12px;
  background:#0a0a0a; z-index:10;
}
.spinner {
  width:32px; height:32px; border:2px solid #1f1f1f;
  border-top-color:#f59e0b; border-radius:50%;
  animation:spin .8s linear infinite;
}
@keyframes spin { to { transform:rotate(360deg); } }
</style>
</head>
<body>
<div id="loading"><div class="spinner"></div><span>Loading...</span></div>
<div id="viewer"></div>
<script>
var book, rendition, startX = 0;
var ready = false;
var pendingMsg = null;

function loadScript(src, cb) {
  var s = document.createElement('script');
  s.src = src;
  s.onload = cb;
  document.head.appendChild(s);
}

loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', function() {
  loadScript('https://cdn.jsdelivr.net/npm/epubjs/dist/epub.min.js', function() {
    ready = true;
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'JS_ERROR',msg:'epubjs ready'}));
  });
});

document.addEventListener('message', handleMsg);
window.addEventListener('message', handleMsg);

function handleMsg(e) {
  var msg;
  try { msg = JSON.parse(e.data); } catch { return; }
  if (msg.type === 'LOAD') {
    if (!ready) { pendingMsg = msg; return; }
    processLoad(msg);
  }
  if (msg.type === 'GOTO' && rendition) rendition.display(msg.cfi);
  if (msg.type === 'THEME' && rendition) rendition.themes.select(msg.theme);
}

async function processLoad(msg) {
  try {
    document.body.style.background =
      msg.theme === 'light' ? '#ffffff'
      : msg.theme === 'sepia' ? '#f8f0e3' : '#0a0a0a';

    book = ePub(msg.base64, { encoding: 'base64' });
    rendition = book.renderTo('viewer', {
      width: window.innerWidth,
      height: window.innerHeight,
      flow: 'paginated',
    });

    await rendition.display(msg.cfi || undefined);
    document.getElementById('loading').style.display = 'none';

    rendition.themes.register('dark',  { body: { background:'#0a0a0a', color:'#e4e4e7' }});
    rendition.themes.register('sepia', { body: { background:'#f8f0e3', color:'#3d2b1f' }});
    rendition.themes.register('light', { body: { background:'#ffffff', color:'#000000' }});
    rendition.themes.select(msg.theme || 'dark');

    rendition.on('relocated', function(loc) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'PAGE_CHANGE',
        page: loc.start.displayed.page,
        total: loc.start.displayed.total,
        cfi: loc.start.cfi,
      }));
    });
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'JS_ERROR',msg:'epub error:'+e.message}));
  }
}

setInterval(function() {
  if (ready && pendingMsg) {
    var m = pendingMsg;
    pendingMsg = null;
    processLoad(m);
  }
}, 100);

document.addEventListener('touchstart', function(e) { startX = e.touches[0].clientX; }, {passive:true});
document.addEventListener('touchend', function(e) {
  var diff = startX - e.changedTouches[0].clientX;
  if (Math.abs(diff) < 60) return;
  if (diff > 0) rendition && rendition.next();
  if (diff < 0) rendition && rendition.prev();
});
</script>
</body>
</html>`;

const THEMES: { value: ReaderTheme; label: string; bg: string }[] = [
  { value: "dark", label: "Dark", bg: "#0a0a0a" },
  { value: "sepia", label: "Sepia", bg: "#f8f0e3" },
  { value: "light", label: "Light", bg: "#ffffff" },
];

export default function ReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookId = Number(id);
  const router = useRouter();
  const { updateBookProgress } = useStore();

  // book data
  const book = getBook(bookId);
  const isPdf = book?.file_type === "pdf";

  // webview
  const webViewRef = useRef<WebView>(null);
  const [readMode, setReadMode] = useState<"scroll" | "swipe">("scroll");

  function toggleMode() {
    setReadMode(readMode === "scroll" ? "swipe" : "scroll");
    webViewRef.current?.postMessage(JSON.stringify({ type: "TOGGLE_MODE" }));
  }

  // reader state
  const [page, setPage] = useState(book?.current_page ?? 1);
  const [totalPages, setTotalPages] = useState(book?.total_pages ?? 0);
  const [theme, setTheme] = useState<ReaderTheme>("dark");
  const [headerVisible, setHeaderVisible] = useState(true);
  const headerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // bookmarks + notes state
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  // modals
  const [showPanel, setShowPanel] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [panelTab, setPanelTab] = useState<"bookmarks" | "notes">("bookmarks");

  // session tracking
  const sessionStart = useRef(Date.now());
  const sessionStartPage = useRef(page);

  // ── Load HTML template ──────────────────────────

  // ── Save session on leaving ─────────────────────
  useFocusEffect(
    useCallback(() => {
      sessionStart.current = Date.now();
      sessionStartPage.current = page;

      return () => {
        const seconds = Math.floor((Date.now() - sessionStart.current) / 1000);
        const pagesRead = Math.max(0, page - sessionStartPage.current);
        if (seconds > 5) upsertSession(bookId, pagesRead, seconds);
      };
    }, [page]),
  );

  // ── Send book to WebView once HTML loads ────────
  async function onWebViewLoad() {
    if (!book || !webViewRef.current) return;

    try {
      const { File } = require("expo-file-system/next");
      const file = new File(book.file_path);
      const base64 = await file.base64();

      if (!base64) {
        Alert.alert("Error", "Could not read file.");
        return;
      }

      const msg = JSON.stringify({
        type: "LOAD",
        base64,
        theme,
        startPage: book.current_page,
        cfi: book.current_cfi ?? undefined,
      });

      // wait for WebView JS to fully initialize before posting
      setTimeout(() => {
        webViewRef.current?.postMessage(msg);
      }, 500);
    } catch (e) {
      console.log("reader load error:", e);
      Alert.alert("Error", "Could not load book.");
    }
  }
  // ── Handle messages FROM WebView ─────────────
  function onMessage(e: any) {
    let msg: any;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }

    if (msg.type === "JS_ERROR") {
      console.log("JS ERROR inside WebView:", msg.msg, "line:", msg.line);
      return;
    }

    if (msg.type === "PAGE_CHANGE") {
      const newPage: number = msg.page;
      const newTotal: number = msg.total ?? totalPages;
      const cfi: string | undefined = msg.cfi;
      if (msg.type === "MODE_CHANGE") {
        setReadMode(msg.mode);
        return;
      }
      if (msg.type === "TAP") {
        showHeaderTemporarily();
        return;
      }
      setPage(newPage);
      setTotalPages(newTotal);
      setBookmarked(isPageBookmarked(bookId, newPage));
      updateProgress(bookId, newPage, newTotal, cfi);
      updateBookProgress(bookId, newPage, newTotal, cfi);
    }
  }

  // ── Auto-hide header ────────────────────────────
  function showHeaderTemporarily() {
    if (headerVisible) {
      // if already visible, hide immediately
      if (headerTimer.current) {
        clearTimeout(headerTimer.current);
      }
      setHeaderVisible(false);
    } else {
      setHeaderVisible(true);

      if (headerTimer.current) {
        clearTimeout(headerTimer.current);
      }

      headerTimer.current = setTimeout(() => {
        setHeaderVisible(false);
      }, 3000);
    }
  }
  // ── Bookmark toggle ─────────────────────────────
  function toggleBookmark() {
    if (bookmarked) {
      const bm = bookmarks.find((b) => b.page === page);
      if (bm) {
        deleteBookmark(bm.id);
        setBookmarks((prev) => prev.filter((b) => b.id !== bm.id));
      }
      setBookmarked(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      addBookmark(bookId, page);
      setBookmarks(getBookmarks(bookId));
      setBookmarked(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }

  // ── Save note ───────────────────────────────────
  function saveNote() {
    if (!noteText.trim()) return;
    addNote(bookId, page, noteText.trim());
    setNotes(getNotes(bookId));
    setNoteText("");
    setShowNoteModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  // ── Jump to page from panel ─────────────────────
  function jumpToPage(targetPage: number, cfi?: string | null) {
    if (!webViewRef.current) return;
    const msg = isPdf
      ? { type: "GOTO", page: targetPage }
      : { type: "GOTO", cfi: cfi ?? undefined, page: targetPage };
    webViewRef.current.postMessage(JSON.stringify(msg));
    setShowPanel(false);
  }
  // ───mode toggle ─────────────────────────────
  function ModeBtn({
    mode,
    onPress,
  }: {
    mode: "scroll" | "swipe";
    onPress: () => void;
  }) {
    return (
      <TouchableOpacity
        onPress={onPress}
        style={{
          backgroundColor: "#ffffff15",
          borderRadius: 20,
          paddingHorizontal: 10,
          height: 36,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 4,
        }}
      >
        <Text style={{ fontSize: 12 }}>{mode === "scroll" ? "📄" : "📖"}</Text>
      </TouchableOpacity>
    );
  }

  // ── Change theme ────────────────────────────────
  function changeTheme(t: ReaderTheme) {
    setTheme(t);
    setShowTheme(false);
    webViewRef.current?.postMessage(
      JSON.stringify({ type: "THEME", theme: t }),
    );
  }

  const progress = totalPages > 0 ? (page / totalPages) * 100 : 0;
  const bgColor =
    theme === "light" ? "#f8f8f8" : theme === "sepia" ? "#f8f0e3" : "#0a0a0a";

  if (!book) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#0a0a0a",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "#52525b" }}>Book not found</Text>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: bgColor }}>
      {/* ── Progress bar (always visible) ── */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          zIndex: 30,
          backgroundColor: "#ffffff10",
        }}
      >
        <View
          style={{
            height: "100%",
            width: `${progress}%`,
            backgroundColor: "#f59e0b",
          }}
        />
      </View>

      {/* ── Header (auto-hides) ── */}
      {headerVisible && (
        <SafeAreaView
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 20,
            backgroundColor: "#00000088",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}
          >
            {/* back */}
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                backgroundColor: "#ffffff15",
                borderRadius: 20,
                paddingHorizontal: 12,
                paddingVertical: 6,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 14 }}>←</Text>
              <Text style={{ color: "#fff", fontSize: 12 }} numberOfLines={1}>
                {book.title.length > 18
                  ? book.title.slice(0, 18) + "…"
                  : book.title}
              </Text>
            </TouchableOpacity>

            {/* page counter */}
            <Text style={{ color: "#ffffff88", fontSize: 12 }}>
              {page} / {totalPages || "?"}
            </Text>

            {/* actions */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <HeaderBtn
                emoji={bookmarked ? "🔖" : "🔳"}
                onPress={toggleBookmark}
              />
              <HeaderBtn emoji="✏️" onPress={() => setShowNoteModal(true)} />
              <HeaderBtn
                emoji="☰"
                onPress={() => {
                  setShowPanel(true);
                  setPanelTab("bookmarks");
                }}
              />
              <TouchableOpacity
                onPress={() => setShowTheme(true)}
                style={{
                  backgroundColor: "#ffffff15",
                  borderRadius: 20,
                  width: 36,
                  height: 36,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 16 }}>
                  {theme === "dark" ? "🌙" : theme === "sepia" ? "📜" : "☀️"}
                </Text>
              </TouchableOpacity>
              <ModeBtn mode={readMode} onPress={toggleMode} />
            </View>
          </View>
        </SafeAreaView>
      )}

      {/* ── WebView ── */}
      {/* push webview content below header */}
      <View style={{ flex: 1, marginTop: headerVisible ? 120 : 0 }}>
        <WebView
          ref={webViewRef}
          source={{ html: isPdf ? PDF_HTML : EPUB_HTML }}
          originWhitelist={["*"]}
          allowFileAccess={true}
          allowUniversalAccessFromFileURLs={true}
          allowFileAccessFromFileURLs={true}
          mixedContentMode="always"
          javaScriptEnabled
          scrollEnabled={readMode === "scroll"}
          onLoadEnd={onWebViewLoad}
          onMessage={onMessage}
          onError={(e) => console.log("WebView error:", e.nativeEvent)}
          style={{ flex: 1, backgroundColor: bgColor }}
        />
      </View>

      {/* ── Theme picker ── */}
      <Modal visible={showTheme} transparent animationType="fade">
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "#00000066" }}
          activeOpacity={1}
          onPress={() => setShowTheme(false)}
        />
        <View
          style={{
            backgroundColor: "#111111",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 24,
            paddingBottom: 40,
            borderTopWidth: 0.5,
            borderTopColor: "#2a2a2a",
          }}
        >
          <Text
            style={{
              color: "#fff",
              fontSize: 15,
              fontWeight: "700",
              marginBottom: 16,
            }}
          >
            Reader theme
          </Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            {THEMES.map((t) => (
              <TouchableOpacity
                key={t.value}
                onPress={() => changeTheme(t.value)}
                style={{
                  flex: 1,
                  height: 64,
                  borderRadius: 12,
                  backgroundColor: t.bg,
                  borderWidth: theme === t.value ? 2 : 0.5,
                  borderColor: theme === t.value ? "#f59e0b" : "#2a2a2a",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: t.value === "dark" ? "#ffffff" : "#000000",
                  }}
                >
                  {t.label}
                </Text>
                {theme === t.value && (
                  <Text
                    style={{ fontSize: 10, color: "#f59e0b", marginTop: 2 }}
                  >
                    ✓
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* ── Bookmarks + Notes panel ── */}
      <Modal visible={showPanel} transparent animationType="slide">
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "#00000066" }}
          activeOpacity={1}
          onPress={() => setShowPanel(false)}
        />
        <View
          style={{
            backgroundColor: "#111111",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingBottom: 40,
            maxHeight: "70%",
            borderTopWidth: 0.5,
            borderTopColor: "#2a2a2a",
          }}
        >
          {/* panel tabs */}
          <View
            style={{
              flexDirection: "row",
              margin: 16,
              backgroundColor: "#1a1a1a",
              borderRadius: 10,
              padding: 3,
            }}
          >
            {(["bookmarks", "notes"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setPanelTab(t)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: panelTab === t ? "#2a2a2a" : "transparent",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: panelTab === t ? "#ffffff" : "#52525b",
                    fontSize: 13,
                    fontWeight: panelTab === t ? "600" : "400",
                  }}
                >
                  {t === "bookmarks"
                    ? `Bookmarks (${bookmarks.length})`
                    : `Notes (${notes.length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* bookmarks list */}
          {panelTab === "bookmarks" && (
            <FlatList
              data={bookmarks}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={{ paddingHorizontal: 16 }}
              ListEmptyComponent={
                <EmptyPanel
                  emoji="🔖"
                  text="No bookmarks yet"
                  sub="Tap 🔳 while reading to bookmark a page"
                />
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => jumpToPage(item.page, item.cfi)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 14,
                    gap: 12,
                    borderBottomWidth: 0.5,
                    borderBottomColor: "#1f1f1f",
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      backgroundColor: "#f59e0b18",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 16 }}>🔖</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: "#f4f4f5",
                        fontSize: 14,
                        fontWeight: "500",
                      }}
                    >
                      Page {item.page}
                    </Text>
                    {item.label && (
                      <Text
                        style={{ color: "#52525b", fontSize: 12, marginTop: 1 }}
                      >
                        {item.label}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      deleteBookmark(item.id);
                      setBookmarks(getBookmarks(bookId));
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={{ color: "#3f3f46", fontSize: 18 }}>×</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
            />
          )}

          {/* notes list */}
          {panelTab === "notes" && (
            <FlatList
              data={notes}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={{ paddingHorizontal: 16 }}
              ListEmptyComponent={
                <EmptyPanel
                  emoji="📝"
                  text="No notes yet"
                  sub="Tap ✏️ while reading to add a note"
                />
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => jumpToPage(item.page)}
                  style={{
                    paddingVertical: 14,
                    borderBottomWidth: 0.5,
                    borderBottomColor: "#1f1f1f",
                    flexDirection: "row",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      backgroundColor: "#3b82f618",
                      alignItems: "center",
                      justifyContent: "center",
                      marginTop: 2,
                    }}
                  >
                    <Text style={{ fontSize: 16 }}>📝</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ color: "#f4f4f5", fontSize: 14, lineHeight: 20 }}
                      numberOfLines={3}
                    >
                      {item.content}
                    </Text>
                    <Text
                      style={{ color: "#52525b", fontSize: 11, marginTop: 4 }}
                    >
                      Page {item.page}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      deleteNote(item.id);
                      setNotes(getNotes(bookId));
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={{ color: "#3f3f46", fontSize: 18 }}>×</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>

      {/* ── Add note modal ── */}
      <Modal visible={showNoteModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => {
              setShowNoteModal(false);
              setNoteText("");
            }}
          />
          <View
            style={{
              backgroundColor: "#111111",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 20,
              paddingBottom: 32,
              borderTopWidth: 0.5,
              borderTopColor: "#2a2a2a",
            }}
          >
            <Text style={{ color: "#52525b", fontSize: 12, marginBottom: 4 }}>
              Note for page {page}
            </Text>
            <Text
              style={{
                color: "#ffffff",
                fontSize: 16,
                fontWeight: "700",
                marginBottom: 16,
              }}
            >
              Add a note
            </Text>
            <TextInput
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Write your thought..."
              placeholderTextColor="#3f3f46"
              multiline
              autoFocus
              style={{
                color: "#ffffff",
                fontSize: 15,
                backgroundColor: "#1a1a1a",
                borderRadius: 12,
                padding: 14,
                minHeight: 110,
                textAlignVertical: "top",
                borderWidth: 0.5,
                borderColor: "#2a2a2a",
                marginBottom: 14,
              }}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  setShowNoteModal(false);
                  setNoteText("");
                }}
                style={{
                  flex: 1,
                  backgroundColor: "#1a1a1a",
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: "center",
                  borderWidth: 0.5,
                  borderColor: "#2a2a2a",
                }}
              >
                <Text style={{ color: "#71717a", fontWeight: "600" }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={saveNote}
                style={{
                  flex: 1,
                  backgroundColor: "#f59e0b",
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#000", fontWeight: "700" }}>
                  Save Note
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Small helpers ─────────────────────────────────

function HeaderBtn({ emoji, onPress }: { emoji: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: "#ffffff15",
        borderRadius: 20,
        width: 36,
        height: 36,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: 16 }}>{emoji}</Text>
    </TouchableOpacity>
  );
}

function EmptyPanel({
  emoji,
  text,
  sub,
}: {
  emoji: string;
  text: string;
  sub: string;
}) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
      <Text style={{ fontSize: 36 }}>{emoji}</Text>
      <Text style={{ color: "#ffffff", fontSize: 15, fontWeight: "600" }}>
        {text}
      </Text>
      <Text style={{ color: "#52525b", fontSize: 13, textAlign: "center" }}>
        {sub}
      </Text>
    </View>
  );
}
