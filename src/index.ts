import { ref, onMounted, onUnmounted } from 'vue'

export interface SurgeOptions {
  port?: string
}

export function useSurge(signalIds: string[], options: SurgeOptions = {}) {
  const port = options.port || '8080'
  const signalRefs: Record<string, ReturnType<typeof ref>> = {}
  const isConnected = ref(false)
  const isLoading = ref(true)
  let ws: WebSocket | null = null

  const waitForConnection = async () => {
    return new Promise((resolve) => {
      // Check if already connected and all requested signals are available
      if (isConnected.value && signalIds.every((id) => signalRefs[id]?.value !== undefined)) {
        isLoading.value = false
        resolve(true)
        return
      }

      console.log('Waiting for connection and signals:', signalIds)

      const interval = setInterval(() => {
        const signalsReady = signalIds.every((id) => signalRefs[id]?.value !== undefined)
        console.log('Connection status:', isConnected.value, 'Signals ready:', signalsReady)

        if (isConnected.value && signalsReady) {
          clearInterval(interval)
          isLoading.value = false
          resolve(true)
        }
      }, 500)
    })
  }

  const connect = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    ws = new WebSocket(`${protocol}//${window.location.hostname}:${port}`)

    ws.onopen = () => {
      isConnected.value = true
      console.log('Connected to WebSignals')
    }

    ws.onclose = () => {
      isConnected.value = false
      isLoading.value = true
      setTimeout(connect, 2000)
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'update') {
        if (!signalRefs[data.id]) {
          signalRefs[data.id] = ref(data.value)
        } else {
          signalRefs[data.id].value = data.value
        }
      }
    }
  }

  const sendUpdate = (id: string, value: any) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'update', id, value }))
    }
  }

  onMounted(() => {
    connect()
    waitForConnection()
  })

  onUnmounted(() => {
    ws?.close()
  })

  // Initialize requested signals
  signalIds.forEach((id) => {
    if (!(id in signalRefs)) {
      signalRefs[id] = ref(undefined)
    }
  })

  return new Proxy(
    {},
    {
      get(target, prop) {
        if (prop === 'isConnected') return isConnected
        if (prop === 'isLoading') return isLoading

        if (typeof prop === 'string' && !(prop in signalRefs)) {
          signalRefs[prop] = ref(undefined)
        }

        if (prop in signalRefs) {
          const signalRef = signalRefs[prop as string]
          return {
            get value() {
              return signalRef.value
            },
            set value(newValue) {
              signalRef.value = newValue
              sendUpdate(prop as string, newValue)
            },
          }
        }

        return target[prop as keyof typeof target]
      },
    },
  )
}
