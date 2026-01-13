import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createSignal,
  onCleanup,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import {
  CheckCircle,
  CircleNotch,
  Wrench,
  Warning,
  Info,
  WarningOctagon,
  ChartLineUp,
  Headphones,
  MagnifyingGlass,
  UserMinus,
  Bug,
  RocketLaunch,
  CreditCard,
  ShoppingCart,
  Package,
  Heartbeat,
  ListChecks,
  Calendar,
} from "phosphor-solid-js";
import { Badge, Button, Spinner } from "./ui";
import type {
  DemoScenario,
  DemoStep,
  DemoWidget,
  DemoQuestion,
  DemoSelectRows,
  DemoConfirm,
} from "@synatra/core/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICON_MAP: Record<string, any> = {
  ChartLineUp,
  Headphones,
  MagnifyingGlass,
  UserMinus,
  Bug,
  RocketLaunch,
  CreditCard,
  ShoppingCart,
  Package,
  Heartbeat,
  ListChecks,
  Calendar,
};

type DemoItem = {
  id: string;
  type: DemoStep["type"];
  text?: string;
  name?: string;
  status?: "running" | "success";
  approvalState?: "pending" | "approving" | "approved";
  widget?: DemoWidget;
  question?: DemoQuestion;
  questionState?: "pending" | "selecting" | "answered";
  selectRows?: DemoSelectRows;
  selectRowsState?: "pending" | "selecting" | "selected";
  confirm?: DemoConfirm;
  confirmState?: "pending" | "confirming" | "confirmed";
};

type Speed = "slow" | "normal" | "fast" | "instant";

type DemoPreviewProps = {
  scenario: DemoScenario;
  agent?: { icon: string; iconColor: string; name: string } | null;
  class?: string;
  loop?: boolean;
  speed?: Speed;
};

const SPEED_MULTIPLIER: Record<Speed, number> = {
  slow: 1.5,
  normal: 1,
  fast: 0.5,
  instant: 0,
};
const CHAR_DELAY: Record<Speed, { user: number; agent: number }> = {
  slow: { user: 20, agent: 15 },
  normal: { user: 10, agent: 15 },
  fast: { user: 6, agent: 8 },
  instant: { user: 0, agent: 0 },
};

const ICON_COLORS = [
  { id: "gray", value: "#6B7280" },
  { id: "yellow", value: "#F59E0B" },
  { id: "red", value: "#EF4444" },
  { id: "blue", value: "#3B82F6" },
  { id: "green", value: "#22C55E" },
  { id: "plum", value: "#A855F7" },
  { id: "indigo", value: "#6366F1" },
] as const;

function getIconComponent(name: string) {
  return ICON_MAP[name] ?? null;
}

function AgentAvatar(props: {
  icon?: string;
  iconColor?: string;
  size?: number;
}) {
  const size = () => props.size ?? 24;
  const colorValue = () =>
    ICON_COLORS.find((c) => c.id === props.iconColor)?.value ??
    ICON_COLORS[0].value;
  const IconComponent = () =>
    props.icon ? getIconComponent(props.icon) : null;

  return (
    <span
      class="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: `${size()}px`,
        height: `${size()}px`,
        "background-color": `color-mix(in srgb, ${colorValue()} 15%, transparent)`,
      }}
    >
      {IconComponent() ? (
        <Dynamic
          component={IconComponent()!}
          size={size() * 0.55}
          weight="duotone"
          style={{ color: colorValue() }}
        />
      ) : (
        <span class="text-[10px] font-medium" style={{ color: colorValue() }}>
          AI
        </span>
      )}
    </span>
  );
}

function SimpleTableWidget(props: { widget: DemoWidget }) {
  const table = () => props.widget.table;
  return (
    <Show when={table()}>
      <div class="rounded border border-gray-700 overflow-hidden">
        <table class="w-full text-[11px]">
          <thead class="bg-gray-800">
            <tr class="text-gray-400">
              <For each={table()!.columns}>
                {(col) => (
                  <th class="px-2 py-1.5 text-left font-medium">{col.label}</th>
                )}
              </For>
            </tr>
          </thead>
          <tbody class="text-gray-300">
            <For each={table()!.data.slice(0, 5)}>
              {(row) => (
                <tr class="border-t border-gray-700">
                  <For each={table()!.columns}>
                    {(col) => (
                      <td class="px-2 py-1.5">
                        {String(
                          (row as Record<string, unknown>)[col.key] ?? "",
                        )}
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Show>
  );
}

function SimpleChartWidget(props: { widget: DemoWidget }) {
  const chart = () => props.widget.chart;
  const data = () => chart()?.data.datasets[0]?.data ?? [];
  const labels = () => chart()?.data.labels ?? [];
  const max = () => Math.max(...data(), 1);

  return (
    <Show when={chart()}>
      <div class="rounded border border-gray-700 bg-gray-800/50 p-3">
        <div class="text-[10px] text-gray-400 mb-2">
          {props.widget.title ?? "Chart"}
        </div>
        <div class="flex items-end gap-1" style={{ height: "80px" }}>
          <For each={data()}>
            {(val, idx) => {
              const height = max() > 0 ? (val / max()) * 100 : 0;
              return (
                <div class="flex-1 flex flex-col items-end h-full">
                  <div class="w-full flex-1 flex items-end">
                    <div
                      class="w-full bg-blue-500/60 rounded-t"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <span class="text-[8px] text-gray-500 mt-1 truncate w-full text-center">
                    {labels()[idx()] ?? ""}
                  </span>
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </Show>
  );
}

function SimpleKeyValueWidget(props: { widget: DemoWidget }) {
  const kv = () => props.widget.keyValue;
  return (
    <Show when={kv()}>
      <div class="rounded border border-gray-700 bg-gray-800/50 p-3 space-y-2">
        <For each={Object.entries(kv()!.pairs)}>
          {([key, value]) => (
            <div class="flex justify-between text-[11px]">
              <span class="text-gray-400">{key}</span>
              <span class="text-white">{String(value)}</span>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

function parseSimpleMarkdown(text: string): string {
  return text
    .replace(
      /\*\*(.+?)\*\*/g,
      '<strong class="text-white font-medium">$1</strong>',
    )
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(
      /`(.+?)`/g,
      '<code class="bg-gray-700 px-1 rounded text-[10px]">$1</code>',
    );
}

function SimpleMarkdownWidget(props: { widget: DemoWidget }) {
  const md = () => props.widget.markdown;
  const html = () => (md() ? parseSimpleMarkdown(md()!.content) : "");
  return (
    <Show when={md()}>
      <div class="rounded border border-gray-700 bg-gray-800/50 p-3">
        <p
          class="text-[11px] text-gray-300 whitespace-pre-wrap leading-relaxed"
          innerHTML={html()}
        />
      </div>
    </Show>
  );
}

function WidgetRenderer(props: { widget: DemoWidget }) {
  return (
    <Switch
      fallback={
        <div class="text-[10px] text-gray-500">Unknown widget type</div>
      }
    >
      <Match when={props.widget.type === "table"}>
        <SimpleTableWidget widget={props.widget} />
      </Match>
      <Match when={props.widget.type === "chart"}>
        <SimpleChartWidget widget={props.widget} />
      </Match>
      <Match when={props.widget.type === "key_value"}>
        <SimpleKeyValueWidget widget={props.widget} />
      </Match>
      <Match when={props.widget.type === "markdown"}>
        <SimpleMarkdownWidget widget={props.widget} />
      </Match>
    </Switch>
  );
}

const CONFIRM_STYLES = {
  danger: {
    border: "border-red-500/50",
    bg: "bg-red-500/5",
    color: "text-red-500",
  },
  warning: {
    border: "border-amber-500/50",
    bg: "bg-amber-500/5",
    color: "text-amber-500",
  },
  info: {
    border: "border-blue-500/50",
    bg: "bg-blue-500/5",
    color: "text-blue-500",
  },
} as const;

function ConfirmIcon(props: { variant: "danger" | "warning" | "info" }) {
  const iconClass = () =>
    `h-4 w-4 shrink-0 ${CONFIRM_STYLES[props.variant].color}`;
  return (
    <Switch fallback={<Info class={iconClass()} weight="fill" />}>
      <Match when={props.variant === "danger"}>
        <WarningOctagon class={iconClass()} weight="fill" />
      </Match>
      <Match when={props.variant === "warning"}>
        <Warning class={iconClass()} weight="fill" />
      </Match>
    </Switch>
  );
}

function ConfirmPending(props: {
  confirm: DemoConfirm;
  state: "pending" | "confirming" | "confirmed";
}) {
  const variant = () => props.confirm.variant ?? "info";
  const styles = () => CONFIRM_STYLES[variant()];

  return (
    <div class={`rounded border p-2 ${styles().border} ${styles().bg}`}>
      <div class="flex items-start gap-2 mb-2">
        <ConfirmIcon variant={variant()} />
        <span class="text-[10px] text-gray-300">{props.confirm.message}</span>
      </div>
      <div class="flex items-center gap-1">
        <Show when={props.state === "confirming"}>
          <Button
            variant="default"
            size="xs"
            class="bg-emerald-600 pointer-events-none"
          >
            <Spinner size="xs" class="border-white border-t-transparent" />
          </Button>
        </Show>
        <Show when={props.state === "pending"}>
          <Button
            variant="default"
            size="xs"
            class="bg-emerald-600 pointer-events-none"
          >
            Confirm
          </Button>
          <Button variant="outline" size="xs" class="pointer-events-none">
            Reject
          </Button>
        </Show>
      </div>
    </div>
  );
}

export function DemoPreview(props: DemoPreviewProps) {
  const [items, setItems] = createSignal<DemoItem[]>([]);
  const [isThinking, setIsThinking] = createSignal(false);
  let step = 0;
  let count = 0;
  let times: number[] = [];
  let ticks: number[] = [];
  let scrollRef: HTMLDivElement | undefined;

  const speed = () => props.speed ?? "normal";
  const multiplier = () => SPEED_MULTIPLIER[speed()];
  const charDelay = () => CHAR_DELAY[speed()];
  const agentName = () => props.agent?.name ?? "Agent";

  const scrollToBottom = () => {
    if (scrollRef) scrollRef.scrollTop = scrollRef.scrollHeight;
  };

  const clear = () => {
    times.forEach((id) => window.clearTimeout(id));
    ticks.forEach((id) => window.clearInterval(id));
    times = [];
    ticks = [];
  };

  const wait = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    times.push(id);
  };

  const push = (item: DemoItem) => {
    setItems((prev) => [...prev, item]);
    requestAnimationFrame(scrollToBottom);
  };

  const change = (id: string, text: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, text } : item)),
    );
    requestAnimationFrame(scrollToBottom);
  };

  const isInstant = () => speed() === "instant";

  const updateState = (id: string, field: string, value: string) => {
    setItems((prev) =>
      prev.map((entry) =>
        entry.id === id ? { ...entry, [field]: value } : entry,
      ),
    );
  };

  const runStateTransition = (
    id: string,
    field: string,
    states: [string, string],
    delays: [number, number, number],
  ) => {
    const [d1, d2, d3] = isInstant() ? [50, 50, 50] : delays;
    wait(() => {
      updateState(id, field, states[0]);
      wait(() => {
        updateState(id, field, states[1]);
        wait(next, d3);
      }, d2);
    }, d1);
  };

  const runText = (
    id: string,
    text: string,
    charSpeed: number,
    done: () => void,
  ) => {
    if (isInstant() || charSpeed === 0) {
      change(id, text);
      wait(done, 50);
      return;
    }
    let pos = 0;
    const timer = window.setInterval(() => {
      pos += 1;
      change(id, text.slice(0, pos));
      if (pos < text.length) return;
      window.clearInterval(timer);
      wait(done, 250);
    }, charSpeed);
    ticks.push(timer);
  };

  const updateTool = (name: string, status: "running" | "success") => {
    setItems((prev) => {
      const list = [...prev];
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const item = list[i];
        if (item.type !== "tool_call") continue;
        if (item.name !== name) continue;
        list[i] = { ...item, status };
        return list;
      }
      return [
        ...list,
        { id: `tool-${count++}`, type: "tool_call", name, status },
      ];
    });
  };

  const next = () => {
    const seq = props.scenario?.sequence;
    if (!seq || seq.length === 0) return;
    if (step >= seq.length) {
      if (props.loop === false) return;
      wait(start, 4000 * multiplier());
      return;
    }

    const item = seq[step];
    step += 1;

    if (item.type === "user") {
      const id = `user-${count++}`;
      push({ id, type: "user", text: "" });
      runText(id, item.text, charDelay().user, next);
      return;
    }

    if (item.type === "agent") {
      const id = `agent-${count++}`;
      push({ id, type: "agent", text: "" });
      runText(id, item.text, charDelay().agent, next);
      return;
    }

    if (item.type === "thinking") {
      setIsThinking(true);
      wait(() => {
        setIsThinking(false);
        next();
      }, item.duration * multiplier());
      return;
    }

    if (item.type === "tool_call") {
      updateTool(item.name, item.status);
      wait(next, 350 * multiplier());
      return;
    }

    if (item.type === "approval") {
      const id = `approval-${count++}`;
      push({
        id,
        type: "approval",
        text: item.action,
        approvalState: "pending",
      });
      runStateTransition(
        id,
        "approvalState",
        ["approving", "approved"],
        [1000 * multiplier(), 800 * multiplier(), 400 * multiplier()],
      );
      return;
    }

    if (item.type === "delay") {
      wait(next, item.ms * multiplier());
      return;
    }

    if (item.type === "widget") {
      const id = `widget-${count++}`;
      push({ id, type: "widget", widget: item.widget });
      wait(next, isInstant() ? 50 : 300 * multiplier());
      return;
    }

    if (item.type === "question") {
      const id = `question-${count++}`;
      push({
        id,
        type: "question",
        question: item.question,
        questionState: "pending",
      });
      runStateTransition(
        id,
        "questionState",
        ["selecting", "answered"],
        [800 * multiplier(), 600 * multiplier(), 400 * multiplier()],
      );
      return;
    }

    if (item.type === "select_rows") {
      const id = `select-rows-${count++}`;
      push({
        id,
        type: "select_rows",
        selectRows: item.selectRows,
        selectRowsState: "pending",
      });
      runStateTransition(
        id,
        "selectRowsState",
        ["selecting", "selected"],
        [800 * multiplier(), 600 * multiplier(), 400 * multiplier()],
      );
      return;
    }

    if (item.type === "confirm") {
      const id = `confirm-${count++}`;
      push({
        id,
        type: "confirm",
        confirm: item.confirm,
        confirmState: "pending",
      });
      runStateTransition(
        id,
        "confirmState",
        ["confirming", "confirmed"],
        [800 * multiplier(), 600 * multiplier(), 400 * multiplier()],
      );
      return;
    }
  };

  const start = () => {
    clear();
    setItems([]);
    setIsThinking(false);
    step = 0;
    count = 0;
    wait(next, 200);
  };

  createEffect(() => {
    props.scenario;
    start();
  });

  onCleanup(clear);

  return (
    <div
      class={`flex flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-900 ${props.class ?? ""}`}
    >
      <div class="flex items-center gap-2 border-b border-gray-700 px-3 py-2">
        <AgentAvatar
          icon={props.agent?.icon}
          iconColor={props.agent?.iconColor}
          size={20}
        />
        <span class="text-xs font-medium text-white">{agentName()}</span>
        <Badge variant="default" class="text-[10px]">
          Preview
        </Badge>
      </div>

      <div ref={scrollRef} class="flex-1 overflow-y-auto p-3 scrollbar-thin">
        <div class="flex flex-col gap-3">
          <For each={items()}>
            {(item) => (
              <Switch>
                <Match when={item.type === "user"}>
                  <div class="flex gap-2">
                    <div class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-700 text-[10px] font-medium text-gray-300">
                      You
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[10px] text-gray-500 mb-0.5">You</div>
                      <p class="text-xs leading-relaxed text-gray-300 whitespace-pre-wrap">
                        {item.text}
                      </p>
                    </div>
                  </div>
                </Match>
                <Match when={item.type === "agent"}>
                  <div class="flex gap-2">
                    <AgentAvatar
                      icon={props.agent?.icon}
                      iconColor={props.agent?.iconColor}
                      size={20}
                    />
                    <div class="flex-1 min-w-0">
                      <div class="text-[10px] text-gray-500 mb-0.5">
                        {agentName()}
                      </div>
                      <p class="text-xs leading-relaxed text-gray-300 whitespace-pre-wrap">
                        {item.text}
                      </p>
                    </div>
                  </div>
                </Match>
                <Match when={item.type === "tool_call"}>
                  <div class="pl-7">
                    <div class="flex items-center gap-1.5 rounded bg-gray-800/50 px-2 py-1 text-[10px] text-gray-400">
                      <Wrench class="h-3 w-3" />
                      <span class="font-mono truncate">{item.name}</span>
                      <div class="ml-auto flex items-center gap-1">
                        <Show when={item.status === "running"}>
                          <CircleNotch class="h-3 w-3 animate-spin" />
                        </Show>
                        <Show when={item.status === "success"}>
                          <CheckCircle
                            class="h-3 w-3 text-emerald-500"
                            weight="fill"
                          />
                        </Show>
                      </div>
                    </div>
                  </div>
                </Match>
                <Match when={item.type === "approval"}>
                  <div class="flex gap-2">
                    <AgentAvatar
                      icon={props.agent?.icon}
                      iconColor={props.agent?.iconColor}
                      size={20}
                    />
                    <div class="flex-1 min-w-0">
                      <Switch>
                        <Match when={item.approvalState === "approved"}>
                          <div class="rounded border border-emerald-500/50 bg-emerald-500/5 p-2">
                            <div class="flex items-center gap-1.5">
                              <Badge variant="success" class="text-[10px]">
                                Approved
                              </Badge>
                              <span class="text-[10px] text-gray-400 truncate">
                                {item.text}
                              </span>
                            </div>
                          </div>
                        </Match>
                        <Match when={item.approvalState === "approving"}>
                          <div class="rounded border border-amber-500/50 bg-amber-500/5 p-2">
                            <div class="flex items-center gap-1.5 mb-1.5">
                              <Badge variant="warning" class="text-[10px]">
                                Approval
                              </Badge>
                            </div>
                            <div class="mb-1.5 text-[10px] text-gray-300">
                              {item.text}
                            </div>
                            <div class="flex items-center gap-1">
                              <Button
                                variant="default"
                                size="xs"
                                class="bg-emerald-600 pointer-events-none"
                              >
                                <Spinner
                                  size="xs"
                                  class="border-white border-t-transparent"
                                />
                              </Button>
                            </div>
                          </div>
                        </Match>
                        <Match when={item.approvalState === "pending"}>
                          <div class="rounded border border-amber-500/50 bg-amber-500/5 p-2">
                            <div class="flex items-center gap-1.5 mb-1.5">
                              <Badge variant="warning" class="text-[10px]">
                                Approval
                              </Badge>
                            </div>
                            <div class="mb-1.5 text-[10px] text-gray-300">
                              {item.text}
                            </div>
                            <div class="flex items-center gap-1">
                              <Button
                                variant="default"
                                size="xs"
                                class="bg-emerald-600 pointer-events-none"
                              >
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="xs"
                                class="pointer-events-none"
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        </Match>
                      </Switch>
                    </div>
                  </div>
                </Match>
                <Match when={item.type === "widget" && item.widget}>
                  <div class="pl-7">
                    <WidgetRenderer widget={item.widget!} />
                  </div>
                </Match>
                <Match when={item.type === "question" && item.question}>
                  <div class="flex gap-2">
                    <AgentAvatar
                      icon={props.agent?.icon}
                      iconColor={props.agent?.iconColor}
                      size={20}
                    />
                    <div class="flex-1 min-w-0">
                      <Switch>
                        <Match when={item.questionState === "answered"}>
                          <div class="rounded border border-emerald-500/50 bg-emerald-500/5 p-2">
                            <div class="flex items-center gap-1.5 mb-1">
                              <Badge variant="success" class="text-[10px]">
                                Answered
                              </Badge>
                            </div>
                            <div class="text-[10px] text-gray-300">
                              {item.question!.question}
                            </div>
                            <div class="mt-1 text-[10px] text-gray-400">
                              →{" "}
                              {
                                item.question!.options[
                                  item.question!.selectedIndex ?? 0
                                ]?.label
                              }
                            </div>
                          </div>
                        </Match>
                        <Match when={item.questionState === "selecting"}>
                          <div class="rounded border border-blue-500/50 bg-blue-500/5 p-2">
                            <div class="flex items-center gap-1.5 mb-1.5">
                              <Badge variant="default" class="text-[10px]">
                                Question
                              </Badge>
                            </div>
                            <div class="mb-2 text-[10px] text-gray-300">
                              {item.question!.question}
                            </div>
                            <div class="space-y-1">
                              <For each={item.question!.options}>
                                {(opt, idx) => (
                                  <div
                                    class={`rounded px-2 py-1 text-[10px] ${idx() === (item.question!.selectedIndex ?? 0) ? "bg-blue-500 text-white" : "bg-gray-800 text-gray-400"}`}
                                  >
                                    {opt.label}
                                  </div>
                                )}
                              </For>
                            </div>
                          </div>
                        </Match>
                        <Match when={item.questionState === "pending"}>
                          <div class="rounded border border-blue-500/50 bg-blue-500/5 p-2">
                            <div class="flex items-center gap-1.5 mb-1.5">
                              <Badge variant="default" class="text-[10px]">
                                Question
                              </Badge>
                            </div>
                            <div class="mb-2 text-[10px] text-gray-300">
                              {item.question!.question}
                            </div>
                            <div class="space-y-1">
                              <For each={item.question!.options}>
                                {(opt) => (
                                  <div class="rounded bg-gray-800 px-2 py-1 text-[10px] text-gray-400">
                                    {opt.label}
                                  </div>
                                )}
                              </For>
                            </div>
                          </div>
                        </Match>
                      </Switch>
                    </div>
                  </div>
                </Match>
                <Match when={item.type === "select_rows" && item.selectRows}>
                  <div class="flex gap-2">
                    <AgentAvatar
                      icon={props.agent?.icon}
                      iconColor={props.agent?.iconColor}
                      size={20}
                    />
                    <div class="flex-1 min-w-0">
                      <Switch>
                        <Match when={item.selectRowsState === "selected"}>
                          <div class="rounded border border-emerald-500/50 bg-emerald-500/5 p-2">
                            <div class="flex items-center gap-1.5 mb-1">
                              <Badge variant="success" class="text-[10px]">
                                Selected
                              </Badge>
                              <span class="text-[10px] text-gray-400">
                                {item.selectRows!.selectedIndices.length} row(s)
                              </span>
                            </div>
                            <div class="rounded border border-gray-700 overflow-hidden">
                              <table class="w-full text-[10px]">
                                <thead class="bg-gray-800">
                                  <tr>
                                    <For each={item.selectRows!.columns}>
                                      {(col) => (
                                        <th class="px-2 py-1 text-left text-gray-400">
                                          {col.label}
                                        </th>
                                      )}
                                    </For>
                                  </tr>
                                </thead>
                                <tbody>
                                  <For each={item.selectRows!.selectedIndices}>
                                    {(idx) => (
                                      <tr class="border-t border-gray-700 bg-emerald-500/10">
                                        <For each={item.selectRows!.columns}>
                                          {(col) => (
                                            <td class="px-2 py-1 text-gray-300">
                                              {String(
                                                (
                                                  item.selectRows!.data[
                                                    idx
                                                  ] as Record<string, unknown>
                                                )?.[col.key] ?? "",
                                              )}
                                            </td>
                                          )}
                                        </For>
                                      </tr>
                                    )}
                                  </For>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </Match>
                        <Match when={true}>
                          <div class="rounded border border-blue-500/50 bg-blue-500/5 p-2">
                            <div class="flex items-center gap-1.5 mb-1.5">
                              <Badge variant="default" class="text-[10px]">
                                Select rows
                              </Badge>
                              <Show when={item.selectRowsState === "selecting"}>
                                <Spinner size="xs" />
                              </Show>
                            </div>
                            <div class="rounded border border-gray-700 overflow-hidden">
                              <table class="w-full text-[10px]">
                                <thead class="bg-gray-800">
                                  <tr>
                                    <th class="w-6 px-2 py-1" />
                                    <For each={item.selectRows!.columns}>
                                      {(col) => (
                                        <th class="px-2 py-1 text-left text-gray-400">
                                          {col.label}
                                        </th>
                                      )}
                                    </For>
                                  </tr>
                                </thead>
                                <tbody>
                                  <For each={item.selectRows!.data.slice(0, 3)}>
                                    {(row, idx) => (
                                      <tr
                                        class={`border-t border-gray-700 ${item.selectRowsState === "selecting" && item.selectRows!.selectedIndices.includes(idx()) ? "bg-blue-500/10" : ""}`}
                                      >
                                        <td class="w-6 px-2 py-1">
                                          <div
                                            class={`w-3 h-3 rounded border ${item.selectRowsState === "selecting" && item.selectRows!.selectedIndices.includes(idx()) ? "border-blue-500 bg-blue-500" : "border-gray-600"}`}
                                          />
                                        </td>
                                        <For each={item.selectRows!.columns}>
                                          {(col) => (
                                            <td class="px-2 py-1 text-gray-300">
                                              {String(
                                                (
                                                  row as Record<string, unknown>
                                                )[col.key] ?? "",
                                              )}
                                            </td>
                                          )}
                                        </For>
                                      </tr>
                                    )}
                                  </For>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </Match>
                      </Switch>
                    </div>
                  </div>
                </Match>
                <Match when={item.type === "confirm" && item.confirm}>
                  <div class="flex gap-2">
                    <AgentAvatar
                      icon={props.agent?.icon}
                      iconColor={props.agent?.iconColor}
                      size={20}
                    />
                    <div class="flex-1 min-w-0">
                      <Switch>
                        <Match when={item.confirmState === "confirmed"}>
                          <div class="rounded border border-emerald-500/50 bg-emerald-500/5 p-2">
                            <div class="flex items-center gap-1.5">
                              <Badge variant="success" class="text-[10px]">
                                Confirmed
                              </Badge>
                              <span class="text-[10px] text-gray-400 truncate">
                                {item.confirm!.message}
                              </span>
                            </div>
                          </div>
                        </Match>
                        <Match when={true}>
                          <ConfirmPending
                            confirm={item.confirm!}
                            state={item.confirmState!}
                          />
                        </Match>
                      </Switch>
                    </div>
                  </div>
                </Match>
              </Switch>
            )}
          </For>

          <Show when={isThinking()}>
            <div class="flex gap-2">
              <div class="relative flex items-center justify-center">
                <span
                  class="absolute h-5 w-5 animate-ping rounded-full opacity-30"
                  style={{
                    "background-color":
                      ICON_COLORS.find((c) => c.id === props.agent?.iconColor)
                        ?.value ?? ICON_COLORS[0].value,
                  }}
                />
                <AgentAvatar
                  icon={props.agent?.icon}
                  iconColor={props.agent?.iconColor}
                  size={20}
                />
              </div>
              <div class="flex items-center">
                <span class="text-xs text-gray-400">Working on it...</span>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
