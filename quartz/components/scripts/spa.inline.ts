import micromorph from "micromorph"
import { FullSlug, RelativeURL, getFullSlug, normalizeRelativeURLs } from "../../util/path"
import { fetchCanonical } from "./util"

// adapted from `micromorph`
// https://github.com/natemoo-re/micromorph
const NODE_TYPE_ELEMENT = 1
let announcer = document.createElement("route-announcer")
const isElement = (target: EventTarget | null): target is Element =>
  (target as Node)?.nodeType === NODE_TYPE_ELEMENT
const isLocalUrl = (href: string) => {
  try {
    const url = new URL(href)
    if (window.location.origin === url.origin) {
      return true
    }
  } catch (e) {}
  return false
}

const isSamePage = (url: URL): boolean => {
  const sameOrigin = url.origin === window.location.origin
  const samePath = url.pathname === window.location.pathname
  return sameOrigin && samePath
}

const getOpts = ({ target }: Event): { url: URL; scroll?: boolean } | undefined => {
  if (!isElement(target)) return
  const a = target.closest("a")
  if (!a) return
  if (a.target === "_blank") return
  if ("routerIgnore" in a.dataset) return
  const { href } = a
  if (!isLocalUrl(href)) return
  return { url: new URL(href), scroll: "routerNoscroll" in a.dataset ? false : undefined }
}

const openArticleLinksInNewTabs = () => {
  const currentUrl = new URL(window.location.href)

  for (const link of document.querySelectorAll<HTMLAnchorElement>("article a[href]")) {
    const url = new URL(link.href, currentUrl)
    const isSameDocumentAnchor =
      url.origin === currentUrl.origin &&
      url.pathname === currentUrl.pathname &&
      url.search === currentUrl.search &&
      url.hash.length > 0

    // Footnotes and heading anchors should still jump within the current page.
    if (isSameDocumentAnchor) continue

    link.target = "_blank"
    const rel = new Set((link.rel || "").split(/\s+/).filter(Boolean))
    rel.add("noopener")
    rel.add("noreferrer")
    link.rel = [...rel].join(" ")
  }
}

function notifyNav(url: FullSlug) {
  const event: CustomEventMap["nav"] = new CustomEvent("nav", { detail: { url } })
  document.dispatchEvent(event)
}

const cleanupFns: Set<(...args: any[]) => void> = new Set()
window.addCleanup = (fn) => cleanupFns.add(fn)

type ScrollPosition = { x: number; y: number }
type SpaHistoryState = { quartzScroll?: ScrollPosition } & Record<string, unknown>

const getHistoryState = (): SpaHistoryState => {
  const state = window.history.state
  return state !== null && typeof state === "object" ? state : {}
}

const getScrollPosition = (state: unknown): ScrollPosition | undefined => {
  if (state === null || typeof state !== "object") return
  const position = (state as SpaHistoryState).quartzScroll
  if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
    return position
  }
}

const saveScrollPosition = () => {
  const state = getHistoryState()
  window.history.replaceState(
    { ...state, quartzScroll: { x: window.scrollX, y: window.scrollY } },
    "",
    window.location.href,
  )
}

const elementForHash = (hash: string): HTMLElement | null => {
  if (!hash) return null
  const raw = hash.substring(1)
  // a hand-written link can carry a stray "%", which throws here
  let id = raw
  try {
    id = decodeURIComponent(raw)
  } catch {}
  const target = document.getElementById(id) ?? document.getElementById(raw)
  if (!target) return null

  // Explicit Markdown anchors such as `<a id="torah"></a>` are rendered as
  // an empty paragraph immediately before the actual heading. Scrolling that
  // zero-height inline anchor into view ignores the document's scroll padding
  // and leaves the visible heading offset. Use the following heading instead.
  if (target.tagName === "A" && target.textContent?.trim() === "") {
    const parent = target.parentElement
    const heading = parent?.nextElementSibling
    if (parent?.children.length === 1 && heading?.matches("h1, h2, h3, h4, h5, h6")) {
      return heading as HTMLElement
    }
  }

  return target
}

// The stylesheet sets `scroll-behavior: smooth`, which would animate every
// restoration. `behavior: "instant"` would override it, but it is a WebIDL
// enum value older WebKit rejects with a TypeError -- and this runs inside
// _navigate, where any throw falls through to `window.location.assign` and
// turns a soft navigation into a full page load. Suppress the animation with
// a temporary inline style instead, which every browser understands.
const applyScrollPosition = (url: URL, position?: ScrollPosition) => {
  const root = document.documentElement
  const previousBehavior = root.style.scrollBehavior
  root.style.scrollBehavior = "auto"

  try {
    if (position) {
      window.scrollTo(position.x, position.y)
    } else if (url.hash) {
      elementForHash(url.hash)?.scrollIntoView()
    } else {
      window.scrollTo(0, 0)
    }
  } finally {
    root.style.scrollBehavior = previousBehavior
  }
}

let stopHashStabilization: (() => void) | undefined

// Long pages can keep reflowing after the first animation frame while fonts,
// images, and components settle. The accumulated shift is especially visible
// for fragments near the bottom of the document. Keep the fragment aligned
// briefly, but yield immediately when the visitor starts interacting.
const stabilizeHashPosition = (url: URL, saveAfterRestore: boolean) => {
  stopHashStabilization?.()

  const article = document.querySelector("article")
  if (!url.hash || !article || typeof ResizeObserver === "undefined") return

  const controller = new AbortController()
  let stopped = false
  let observer: ResizeObserver | undefined
  let timer: number | undefined

  const stop = () => {
    if (stopped) return
    stopped = true
    observer?.disconnect()
    if (timer !== undefined) window.clearTimeout(timer)
    controller.abort()
    if (stopHashStabilization === stop) stopHashStabilization = undefined
  }

  const realign = () => {
    if (stopped || window.location.hash !== url.hash) return stop()
    try {
      applyScrollPosition(url)
      if (saveAfterRestore) saveScrollPosition()
    } catch (e) {
      console.error(e)
      stop()
    }
  }

  observer = new ResizeObserver(realign)
  observer.observe(article)
  timer = window.setTimeout(stop, 2500)
  stopHashStabilization = stop

  for (const event of ["pointerdown", "touchstart", "wheel", "keydown"] as const) {
    window.addEventListener(event, stop, { capture: true, once: true, signal: controller.signal })
  }

  document.fonts?.ready.then(realign).catch(() => {})
  if (document.readyState !== "complete") {
    window.addEventListener("load", realign, { once: true, signal: controller.signal })
  }
}

// Apply the position right away so the `nav` event (and the observers it sets
// up, notably the ToC) already sees the final viewport, then re-apply it once
// on the next frame in case swapping stylesheets reflowed the page. The second
// pass must not be awaited: on mobile browsers rAF is throttled during the
// back gesture, and blocking `nav` on it leaves the page uninitialised for as
// long as the transition lasts.
//
// Restoring the scroll position is a nicety; failing at it must never cost the
// visitor a full page reload, so nothing in here is allowed to escape.
const restoreScrollPosition = (
  url: URL,
  position?: ScrollPosition,
  saveAfterRestore: boolean = false,
) => {
  try {
    applyScrollPosition(url, position)
  } catch (e) {
    console.error(e)
  }

  window.requestAnimationFrame(() => {
    try {
      applyScrollPosition(url, position)
      if (saveAfterRestore) saveScrollPosition()
      if (!position && url.hash) stabilizeHashPosition(url, saveAfterRestore)
    } catch (e) {
      console.error(e)
    }
  })
}

if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual"
}

if (!getScrollPosition(window.history.state)) {
  saveScrollPosition()
}

function startLoading() {
  document.querySelector(".navigation-progress")?.remove()
  const loadingBar = document.createElement("div")
  loadingBar.className = "navigation-progress"
  loadingBar.style.width = "0"
  document.body.prepend(loadingBar)

  setTimeout(() => {
    loadingBar.style.width = "80%"
  }, 100)
}

function stopLoading() {
  const loadingBar = document.querySelector(".navigation-progress")
  if (loadingBar) {
    loadingBar.remove()
  }
}

// History traversal re-renders a page the visitor already downloaded, so keep
// the last few responses around. Pages here are large (hundreds of KB), and on
// a phone re-fetching them is what makes going back feel like a fresh load.
// Pages here run to hundreds of KB, so bound the cache by bytes as well as by
// count: holding several of them is exactly the kind of memory pressure that
// gets a tab discarded on a phone, which costs a full reload -- the opposite
// of what the cache is for.
const MAX_CACHED_PAGES = 5
const MAX_CACHED_BYTES = 3_000_000
const pageCache = new Map<string, string>()

const cachedBytes = () => {
  let total = 0
  for (const contents of pageCache.values()) total += contents.length
  return total
}

const cacheKey = (url: URL) => url.origin + url.pathname + url.search

const readPageCache = (url: URL): string | undefined => {
  const key = cacheKey(url)
  const contents = pageCache.get(key)
  if (contents === undefined) return
  // refresh recency
  pageCache.delete(key)
  pageCache.set(key, contents)
  return contents
}

const writePageCache = (url: URL, contents: string) => {
  const key = cacheKey(url)
  pageCache.delete(key)
  pageCache.set(key, contents)
  while (
    pageCache.size > 1 &&
    (pageCache.size > MAX_CACHED_PAGES || cachedBytes() > MAX_CACHED_BYTES)
  ) {
    pageCache.delete(pageCache.keys().next().value as string)
  }
}

// The page the visitor landed on was never fetched by the router, so it is the
// one page missing from the cache -- and the one they are most likely to come
// back to. Warm it while the browser is idle.
// Warming is a speculative download of a page the visitor already has on
// screen. It buys an instant first back, which is worth one request on a
// normal connection and not worth it on a metered or slow one.
const warmingIsWorthIt = () => {
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection
  if (!connection) return true
  if (connection.saveData) return false
  return connection.effectiveType === undefined || connection.effectiveType.includes("4g")
}

const warmPageCache = (url: URL) => {
  if (readPageCache(url) !== undefined) return
  if (!warmingIsWorthIt()) return

  const warm = () =>
    fetchCanonical(url)
      .then((res) => (res.headers.get("content-type")?.startsWith("text/html") ? res.text() : ""))
      .then((contents) => {
        if (contents) writePageCache(url, contents)
      })
      .catch(() => {})

  const idle = window.requestIdleCallback
  if (typeof idle === "function") {
    idle(warm, { timeout: 5000 })
  } else {
    window.setTimeout(warm, 1000)
  }
}

// Giving up on a soft navigation costs the visitor a full page load, which on
// a phone reads as a blank flash and a spinner in the URL bar. It used to
// happen silently; say why, so the next report has something to go on.
const hardNavigate = (url: URL, reason: string) => {
  console.error(`[quartz spa] falling back to a full page load of ${url}: ${reason}`)
  window.location.assign(url)
}

let isNavigating = false
let p: DOMParser
let renderedPathname = window.location.pathname
async function _navigate(url: URL, isBack: boolean = false, scrollPosition?: ScrollPosition) {
  isNavigating = true
  p = p || new DOMParser()

  let contents = isBack ? readPageCache(url) : undefined
  if (contents === undefined) {
    startLoading()
    contents = await fetchCanonical(url)
      .then((res) => {
        const contentType = res.headers.get("content-type")
        if (contentType?.startsWith("text/html")) {
          return res.text()
        } else {
          hardNavigate(url, `response was ${res.status} ${contentType ?? "without a content type"}`)
          return undefined
        }
      })
      .catch((e) => {
        hardNavigate(url, `fetch failed: ${e}`)
        return undefined
      })
  }

  if (!contents) return
  writePageCache(url, contents)

  // notify about to nav
  const event: CustomEventMap["prenav"] = new CustomEvent("prenav", { detail: {} })
  document.dispatchEvent(event)

  // cleanup old
  cleanupFns.forEach((fn) => fn())
  cleanupFns.clear()

  const html = p.parseFromString(contents, "text/html")
  normalizeRelativeURLs(html, url)

  let title = html.querySelector("title")?.textContent
  if (title) {
    document.title = title
  } else {
    const h1 = document.querySelector("h1")
    title = h1?.innerText ?? h1?.textContent ?? url.pathname
  }
  if (announcer.textContent !== title) {
    announcer.textContent = title
  }
  announcer.dataset.persist = ""
  html.body.appendChild(announcer)

  document.querySelector(".navigation-progress")?.remove()
  micromorph(document.body, html.body)
  openArticleLinksInNewTabs()

  // now, patch head, re-executing scripts
  const elementsToRemove = document.head.querySelectorAll(":not([data-persist])")
  elementsToRemove.forEach((el) => el.remove())
  const elementsToAdd = html.head.querySelectorAll(":not([data-persist])")
  elementsToAdd.forEach((el) => document.head.appendChild(el))

  // delay setting the url until now
  // at this point everything is loaded so changing the url should resolve to the correct addresses
  if (!isBack) {
    history.pushState({ quartzScroll: { x: window.scrollX, y: window.scrollY } }, "", url)
  }

  renderedPathname = url.pathname

  // New entries start at the top (or their anchor), while history traversal
  // restores the position saved for that entry.
  restoreScrollPosition(url, isBack ? scrollPosition : undefined, !isBack)
  notifyNav(getFullSlug(window))
  delete announcer.dataset.persist
}

async function navigate(url: URL, isBack: boolean = false, scrollPosition?: ScrollPosition) {
  if (isNavigating) return
  isNavigating = true
  try {
    if (!isBack) saveScrollPosition()
    await _navigate(url, isBack, scrollPosition)
  } catch (e) {
    hardNavigate(url, `navigation threw: ${e}`)
  } finally {
    stopLoading()
    isNavigating = false
  }
}

window.spaNavigate = navigate

function createRouter() {
  if (typeof window !== "undefined") {
    window.addEventListener("click", async (event) => {
      const { url } = getOpts(event) ?? {}
      // dont hijack behaviour, just let browser act normally
      if (!url || event.ctrlKey || event.metaKey) return
      event.preventDefault()

      if (isSamePage(url) && url.hash) {
        // record where the visitor was before the jump, so going back returns
        // them there instead of to the anchor they jumped to
        saveScrollPosition()
        elementForHash(url.hash)?.scrollIntoView()
        // no stored position: the scroll is still animating, so scrollY here is
        // the old one. Leaving it out makes history traversal fall back to the
        // anchor in the URL, which is exactly where this entry points.
        history.pushState({}, "", url)
        return
      }

      navigate(url, false)
    })

    window.addEventListener("popstate", (event) => {
      const url = new URL(window.location.toString())
      const scrollPosition = getScrollPosition(event.state)

      if (url.pathname === renderedPathname) {
        restoreScrollPosition(url, scrollPosition)
        return
      }

      navigate(url, true, scrollPosition)
      return
    })
  }

  return new (class Router {
    go(pathname: RelativeURL) {
      const url = new URL(pathname, window.location.toString())
      return navigate(url, false)
    }

    back() {
      return window.history.back()
    }

    forward() {
      return window.history.forward()
    }
  })()
}

createRouter()
openArticleLinksInNewTabs()
const initialUrl = new URL(window.location.href)
if (initialUrl.hash) {
  // The browser follows the fragment before Quartz components finish laying
  // out. Re-apply it now (and once on the next frame) so content inserted
  // above the target cannot leave a cross-page anchor at the wrong position.
  restoreScrollPosition(initialUrl, undefined, true)
}
notifyNav(getFullSlug(window))
warmPageCache(initialUrl)

if (!customElements.get("route-announcer")) {
  const attrs = {
    "aria-live": "assertive",
    "aria-atomic": "true",
    style:
      "position: absolute; left: 0; top: 0; clip: rect(0 0 0 0); clip-path: inset(50%); overflow: hidden; white-space: nowrap; width: 1px; height: 1px",
  }

  customElements.define(
    "route-announcer",
    class RouteAnnouncer extends HTMLElement {
      constructor() {
        super()
      }
      connectedCallback() {
        for (const [key, value] of Object.entries(attrs)) {
          this.setAttribute(key, value)
        }
      }
    },
  )
}
