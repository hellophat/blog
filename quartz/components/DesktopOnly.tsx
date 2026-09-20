import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { StringResource } from "../util/resources"

const desktopGuard = 'if (!window.matchMedia("(max-width: 800px)").matches) {'

const guardDesktopResource = (resource: StringResource): StringResource => {
  if (!resource) return resource

  const guard = (script: string) => {
    if (script.trimStart().startsWith(desktopGuard)) return script

    return `
${desktopGuard}
${script}
}
`
  }

  return Array.isArray(resource) ? resource.map(guard) : guard(resource)
}

export default ((component: QuartzComponent) => {
  const Component = component
  const desktopAfterDOMLoaded = guardDesktopResource(component.afterDOMLoaded)
  const desktopBeforeDOMLoaded = guardDesktopResource(component.beforeDOMLoaded)

  // Component resources are also collected from the registry, not only from
  // layout wrappers. Keep the registered instance guarded as well so a hidden
  // desktop-only component cannot execute its scripts on mobile.
  component.afterDOMLoaded = desktopAfterDOMLoaded
  component.beforeDOMLoaded = desktopBeforeDOMLoaded

  const DesktopOnly: QuartzComponent = (props: QuartzComponentProps) => {
    return (
      <div class="desktop-only">
        <Component {...props} />
      </div>
    )
  }

  DesktopOnly.displayName = component.displayName
  DesktopOnly.afterDOMLoaded = desktopAfterDOMLoaded
  DesktopOnly.beforeDOMLoaded = desktopBeforeDOMLoaded
  DesktopOnly.css = component?.css
  return DesktopOnly
}) satisfies QuartzComponentConstructor<QuartzComponent>
