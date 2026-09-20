const MOBILE_QUERY = "(max-width: 800px)"
const PANEL_ATTR = "mobile-panel"
const TOGGLE_CLASS = "mobile-panel-toggle"

const isMobile = () => window.matchMedia(MOBILE_QUERY).matches
const isOpen = () => document.documentElement.getAttribute(PANEL_ATTR) === "open"
const rightSidebar = () => document.querySelector<HTMLElement>(".sidebar.right")
const toggleButtons = () => document.querySelectorAll<HTMLElement>(".readermode")

function setPanel(open: boolean) {
  document.documentElement.setAttribute(PANEL_ATTR, open ? "open" : "closed")
  for (const button of toggleButtons()) {
    button.setAttribute("aria-expanded", String(open))
  }
}

// The sidebar still holds markup for components hidden at this width (the
// graph, for one), so an empty drawer is one with nothing left to display.
function hasVisibleContent(sidebar: HTMLElement | null) {
  if (!sidebar) return false
  return Array.from(sidebar.children).some((el) => getComputedStyle(el).display !== "none")
}

function syncButtons() {
  const mobile = isMobile()
  const sidebar = rightSidebar()
  const usable = mobile && hasVisibleContent(sidebar)

  if (usable && sidebar) sidebar.id = "quartz-mobile-panel"

  for (const button of toggleButtons()) {
    button.classList.toggle(TOGGLE_CLASS, usable)
    button.toggleAttribute("hidden", mobile && !usable)
    if (usable) {
      button.setAttribute("aria-controls", "quartz-mobile-panel")
      button.setAttribute("aria-expanded", String(isOpen()))
    } else {
      button.removeAttribute("aria-controls")
      button.removeAttribute("aria-expanded")
    }
  }

  if (!usable && isOpen()) setPanel(false)
}

// Capture on the document so this runs before the reader-mode plugin's own
// listener on the button, which stopPropagation then never reaches.
function onClick(e: MouseEvent) {
  const target = e.target
  if (!(target instanceof Element)) return

  const button = target.closest(`.${TOGGLE_CLASS}`)
  if (button) {
    e.preventDefault()
    e.stopPropagation()
    setPanel(!isOpen())
    return
  }

  if (!isOpen()) return

  // a tap on the backdrop, or on a link that navigates away, closes the drawer
  const sidebar = rightSidebar()
  if (!sidebar?.contains(target) || target.closest("a")) {
    setPanel(false)
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && isOpen()) setPanel(false)
}

document.addEventListener("click", onClick, true)
document.addEventListener("keydown", onKeydown)
window.matchMedia(MOBILE_QUERY).addEventListener("change", syncButtons)

document.addEventListener("nav", () => {
  setPanel(false)
  syncButtons()
})
