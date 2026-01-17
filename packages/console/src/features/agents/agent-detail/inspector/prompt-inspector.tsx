import { CodeEditor, CollapsibleSection } from "../../../../ui"

export function PromptInspector(props: { systemPrompt: string; onUpdatePrompt: (prompt: string) => void }) {
  return (
    <div class="space-y-0">
      <CollapsibleSection title="Instructions">
        <CodeEditor
          value={props.systemPrompt}
          onChange={props.onUpdatePrompt}
          language="text"
          placeholder="You are a helpful assistant..."
          minLines={8}
          indent={false}
          bordered
        />
      </CollapsibleSection>
    </div>
  )
}
