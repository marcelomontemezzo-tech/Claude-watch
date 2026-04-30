import { useState, useCallback } from "react"

export default function Composer({ onSubmit, submitting }) {
  const [text, setText] = useState("")

  const send = useCallback(() => {
    onSubmit(text)
    setText("")
  }, [text, onSubmit])

  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="composer">
      <h2>Nova task</h2>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={onKey}
        placeholder="Descreva o que precisa ser feito. Exemplo: Adicionar campo 'temperatura' no card de lead do Torque, com fallback 'morno' quando vier null."
        disabled={submitting}
        spellCheck={false}
      />
      <div className="row">
        <span className="hint">⌘/Ctrl + Enter envia</span>
        <button
          className="btn-primary"
          onClick={send}
          disabled={submitting || !text.trim()}
        >
          {submitting ? "rodando…" : "rodar pipeline"}
        </button>
      </div>
    </div>
  )
}
