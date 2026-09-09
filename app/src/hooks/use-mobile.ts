import * as React from "react"

const MOBILE_BREAKPOINT = 768

const query = () =>
  typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT

export function useIsMobile() {
  /* initial value is read synchronously; the effect only subscribes */
  const [isMobile, setIsMobile] = React.useState<boolean>(query)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => setIsMobile(query())
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
