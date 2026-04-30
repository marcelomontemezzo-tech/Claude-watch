// Cliente WebSocket com reconnect leve.
export function connectBus({ url, onEvent, onState }) {
  let ws = null
  let stopped = false
  let retries = 0

  const open = () => {
    onState?.("connecting")
    ws = new WebSocket(url)
    ws.onopen = () => {
      retries = 0
      onState?.("open")
    }
    ws.onmessage = ev => {
      try {
        const msg = JSON.parse(ev.data)
        onEvent?.(msg)
      } catch {
        // ignore non-JSON
      }
    }
    ws.onclose = () => {
      onState?.("closed")
      if (stopped) return
      const wait = Math.min(8000, 500 * 2 ** retries++)
      setTimeout(open, wait)
    }
    ws.onerror = () => {
      try { ws.close() } catch {}
    }
  }

  open()

  return () => { stopped = true; try { ws?.close() } catch {} }
}
