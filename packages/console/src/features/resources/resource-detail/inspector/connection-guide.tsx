import { Show, createSignal } from "solid-js"
import { Desktop, Cloud } from "phosphor-solid-js"
import type { Connectors } from "../../../../app/api"

type DeployMode = "local" | "production"
type ProductionMethod = "docker" | "binary" | "k8s" | "ai" | "aws" | "gcp" | "azure"

export function DatabaseConnectionGuideContent(props: {
  type: "postgres" | "mysql"
  connectors: Connectors
  newConnectorToken?: { name: string; token: string } | null
}) {
  const [mode, setMode] = createSignal<DeployMode>("local")
  const [prodMethod, setProdMethod] = createSignal<ProductionMethod>("docker")
  const [copied, setCopied] = createSignal(false)
  const port = () => (props.type === "mysql" ? 3306 : 5432)
  const gatewayUrl = () => {
    const base = import.meta.env.VITE_GATEWAY_URL || "ws://localhost:3003"
    return `${base}/connector/ws`
  }

  const aiPrompt = () => `Help me deploy a Synatra Connector to connect my ${props.type} database.

## Background
Synatra is a platform for building AI agents. To allow agents to query databases in private networks (VPCs), we deploy a "Connector" - a lightweight service that runs inside the VPC and securely relays queries from Synatra's cloud to the database.

## Connection Details (provided by Synatra Console)
- Container image: ghcr.io/synatrahq/connector:latest
- Database type: ${props.type}
- Default database port: ${port()}

## Required Environment Variables
The connector requires these environment variables:
- \`GATEWAY_URL\`: ${gatewayUrl()}
- \`CONNECTOR_TOKEN\`: I will provide this separately (use placeholder <CONNECTOR_TOKEN> in configs)

## Before You Start
Ask me the following questions to determine the best deployment approach:

1. **Infrastructure**: What cloud provider am I using? (AWS, GCP, Azure, or local/on-premise)
2. **Database location**: Where is my ${props.type} database hosted? (e.g., RDS, Cloud SQL, self-managed EC2/VM, local)
3. **Container runtime**: What container orchestration do I have available? (ECS, Cloud Run, Kubernetes, Docker Compose, plain Docker)
4. **Network setup**: Is my database in a private subnet? Do I have existing VPC connectors or NAT gateways?
5. **Permissions**: Do I have permissions to create security groups, IAM roles, or service accounts?

Based on my answers, provide step-by-step deployment instructions.

## After Deployment
Once deployed, remind me to:
1. Check Synatra Console → Settings → Connectors to verify status is "online"
2. Test the database connection using the "Test connection" button`

  const handleCopy = async () => {
    await navigator.clipboard.writeText(aiPrompt())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div class="flex flex-col gap-3">
      <div class="flex gap-1">
        <button
          type="button"
          class="flex items-center gap-1 rounded border px-2 py-1 text-2xs font-medium transition-colors"
          classList={{
            "border-accent bg-accent/10 text-text": mode() === "local",
            "border-border text-text-muted hover:border-border-strong hover:text-text": mode() !== "local",
          }}
          onClick={() => setMode("local")}
        >
          <Desktop class="h-3 w-3" />
          Local
        </button>
        <button
          type="button"
          class="flex items-center gap-1 rounded border px-2 py-1 text-2xs font-medium transition-colors"
          classList={{
            "border-accent bg-accent/10 text-text": mode() === "production",
            "border-border text-text-muted hover:border-border-strong hover:text-text": mode() !== "production",
          }}
          onClick={() => setMode("production")}
        >
          <Cloud class="h-3 w-3" />
          Production
        </button>
      </div>

      <Show when={mode() === "local"}>
        <div class="mt-2 space-y-3 text-2xs">
          <p class="text-text-muted">Test your connection by running the connector locally with Docker.</p>

          <div>
            <p class="mb-1.5 font-medium text-text">1. Start the connector</p>
            <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface-muted px-2 py-1.5 font-code scrollbar-thin">
              {`docker run --rm \\
  -e GATEWAY_URL=${gatewayUrl()} \\
  -e CONNECTOR_TOKEN=${props.newConnectorToken?.token ?? "<your-token>"} \\
  ghcr.io/synatrahq/connector:latest`}
            </code>
          </div>

          <div>
            <p class="mb-1.5 font-medium text-text">2. Configure database host</p>
            <p class="text-text-muted">
              Set the database host to <code class="rounded bg-surface-muted px-1 font-code">host.docker.internal</code>{" "}
              to reach your local {props.type}.
            </p>
            <p class="mt-1.5 text-text-muted">
              On Linux, add{" "}
              <code class="rounded bg-surface-muted px-1 font-code">--add-host=host.docker.internal:host-gateway</code>{" "}
              to the docker run command above.
            </p>
          </div>

          <div>
            <p class="mb-1.5 font-medium text-text">3. Verify connection</p>
            <p class="text-text-muted">
              Confirm the connector status above shows "Online", then use the Test connection button.
            </p>
          </div>
        </div>
      </Show>

      <Show when={mode() === "production"}>
        <div class="mt-2 rounded border border-border bg-surface-muted text-2xs">
          <div class="flex flex-wrap border-b border-border">
            <button
              type="button"
              class="px-3 py-1.5 text-2xs font-medium transition-colors"
              classList={{
                "text-text border-b border-accent -mb-px": prodMethod() === "docker",
                "text-text-muted hover:text-text": prodMethod() !== "docker",
              }}
              onClick={() => setProdMethod("docker")}
            >
              Docker
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-2xs font-medium transition-colors"
              classList={{
                "text-text border-b border-accent -mb-px": prodMethod() === "binary",
                "text-text-muted hover:text-text": prodMethod() !== "binary",
              }}
              onClick={() => setProdMethod("binary")}
            >
              Binary
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-2xs font-medium transition-colors"
              classList={{
                "text-text border-b border-accent -mb-px": prodMethod() === "k8s",
                "text-text-muted hover:text-text": prodMethod() !== "k8s",
              }}
              onClick={() => setProdMethod("k8s")}
            >
              Kubernetes
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-2xs font-medium transition-colors"
              classList={{
                "text-text border-b border-accent -mb-px": prodMethod() === "aws",
                "text-text-muted hover:text-text": prodMethod() !== "aws",
              }}
              onClick={() => setProdMethod("aws")}
            >
              AWS ECS
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-2xs font-medium transition-colors"
              classList={{
                "text-text border-b border-accent -mb-px": prodMethod() === "gcp",
                "text-text-muted hover:text-text": prodMethod() !== "gcp",
              }}
              onClick={() => setProdMethod("gcp")}
            >
              GCP
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-2xs font-medium transition-colors"
              classList={{
                "text-text border-b border-accent -mb-px": prodMethod() === "azure",
                "text-text-muted hover:text-text": prodMethod() !== "azure",
              }}
              onClick={() => setProdMethod("azure")}
            >
              Azure
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-2xs font-medium transition-colors"
              classList={{
                "text-text border-b border-accent -mb-px": prodMethod() === "ai",
                "text-text-muted hover:text-text": prodMethod() !== "ai",
              }}
              onClick={() => setProdMethod("ai")}
            >
              AI Assistant
            </button>
          </div>

          <div class="p-2.5">
            <Show when={prodMethod() === "docker"}>
              <p class="mb-1.5 font-medium text-text">Run with Docker</p>
              <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface px-2 py-1.5 font-code scrollbar-thin">
                {`docker run -d --restart=unless-stopped \\
  --name synatra-connector \\
  -e GATEWAY_URL=${gatewayUrl()} \\
  -e CONNECTOR_TOKEN=<your-token> \\
  ghcr.io/synatrahq/connector:latest`}
              </code>
              <p class="mt-1.5 text-text-muted">
                Run this on a VM or server that has network access to your {props.type} database.
              </p>
            </Show>

            <Show when={prodMethod() === "binary"}>
              <p class="mb-1.5 font-medium text-text">1. Download binary</p>
              <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface px-2 py-1.5 font-code scrollbar-thin">
                {`# Linux (x64)
curl -L -o connector https://github.com/synatrahq/synatra/releases/latest/download/connector-linux-x64
chmod +x connector

# macOS (Apple Silicon)
curl -L -o connector https://github.com/synatrahq/synatra/releases/latest/download/connector-darwin-arm64
chmod +x connector

# macOS (Intel)
curl -L -o connector https://github.com/synatrahq/synatra/releases/latest/download/connector-darwin-x64
chmod +x connector`}
              </code>
              <p class="mt-2 mb-1.5 font-medium text-text">2. Run connector</p>
              <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface px-2 py-1.5 font-code scrollbar-thin">
                {`GATEWAY_URL=${gatewayUrl()} \\
CONNECTOR_TOKEN=<your-token> \\
./connector`}
              </code>
              <p class="mt-1.5 text-text-muted">Use systemd or similar to run as a background service.</p>
            </Show>

            <Show when={prodMethod() === "k8s"}>
              <p class="mb-1.5 font-medium text-text">Kubernetes Deployment</p>
              <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface px-2 py-1.5 font-code scrollbar-thin">
                {`apiVersion: apps/v1
kind: Deployment
metadata:
  name: synatra-connector
spec:
  replicas: 1
  selector:
    matchLabels:
      app: synatra-connector
  template:
    metadata:
      labels:
        app: synatra-connector
    spec:
      terminationGracePeriodSeconds: 10
      containers:
      - name: connector
        image: ghcr.io/synatrahq/connector:latest
        env:
        - name: GATEWAY_URL
          value: "${gatewayUrl()}"
        - name: CONNECTOR_TOKEN
          valueFrom:
            secretKeyRef:
              name: synatra-connector
              key: token
        resources:
          requests:
            memory: "64Mi"
            cpu: "50m"
          limits:
            memory: "128Mi"
            cpu: "100m"`}
              </code>
              <p class="mt-1.5 text-text-muted">
                Create secret:{" "}
                <code class="rounded bg-surface px-1 font-code">
                  kubectl create secret generic synatra-connector --from-literal=token=&lt;your-token&gt;
                </code>
              </p>
            </Show>

            <Show when={prodMethod() === "ai"}>
              <p class="mb-1.5 text-text-muted">Copy this prompt to Claude Code, Cursor, or Codex:</p>
              <div class="relative">
                <pre class="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border bg-surface px-2 py-1.5 font-code text-text scrollbar-thin">
                  {aiPrompt()}
                </pre>
                <button
                  type="button"
                  class="absolute right-1.5 top-1.5 rounded bg-surface-elevated px-2 py-1 text-2xs font-medium text-text-muted transition-colors hover:text-text"
                  onClick={handleCopy}
                >
                  {copied() ? "Copied!" : "Copy"}
                </button>
              </div>
            </Show>

            <Show when={prodMethod() === "aws"}>
              <p class="mb-1.5 font-medium text-text">1. Store token in Secrets Manager</p>
              <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface px-2 py-1.5 font-code scrollbar-thin">
                {`aws secretsmanager create-secret \\
  --name synatra-connector-token \\
  --secret-string "<your-token>"`}
              </code>
              <p class="mt-2 mb-1.5 font-medium text-text">2. Register task definition</p>
              <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface px-2 py-1.5 font-code scrollbar-thin">
                {`{
  "family": "synatra-connector",
  "networkMode": "awsvpc",
  "executionRoleArn": "arn:aws:iam::<account>:role/ecsTaskExecutionRole",
  "containerDefinitions": [{
    "name": "connector",
    "image": "ghcr.io/synatrahq/connector:latest",
    "essential": true,
    "stopTimeout": 10,
    "environment": [
      {"name": "GATEWAY_URL", "value": "${gatewayUrl()}"}
    ],
    "secrets": [
      {"name": "CONNECTOR_TOKEN", "valueFrom": "arn:aws:secretsmanager:<region>:<account>:secret:synatra-connector-token"}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/synatra-connector",
        "awslogs-region": "<region>",
        "awslogs-stream-prefix": "ecs",
        "awslogs-create-group": "true"
      }
    }
  }],
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512"
}`}
              </code>
              <p class="mt-2 mb-1.5 font-medium text-text">3. Create service</p>
              <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface px-2 py-1.5 font-code scrollbar-thin">
                {`aws ecs create-service \\
  --cluster <cluster> \\
  --service-name synatra-connector \\
  --task-definition synatra-connector \\
  --desired-count 1 \\
  --launch-type FARGATE \\
  --network-configuration "awsvpcConfiguration={
    subnets=[<subnet-id>],
    securityGroups=[<sg-id>]
  }"`}
              </code>
              <p class="mt-1.5 text-text-muted">
                Use the same VPC/subnet as your RDS. Execution role needs secretsmanager:GetSecretValue permission.
              </p>
            </Show>

            <Show when={prodMethod() === "gcp"}>
              <p class="mb-1.5 font-medium text-text">Deploy with Cloud Run</p>
              <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface px-2 py-1.5 font-code scrollbar-thin">
                {`gcloud run deploy synatra-connector \\
  --image=ghcr.io/synatrahq/connector:latest \\
  --set-env-vars="GATEWAY_URL=${gatewayUrl()}" \\
  --set-secrets="CONNECTOR_TOKEN=synatra-connector-token:latest" \\
  --network=<vpc-name> \\
  --subnet=<subnet-name> \\
  --vpc-egress=private-ranges-only \\
  --no-cpu-throttling \\
  --min-instances=1 \\
  --max-instances=1 \\
  --cpu=0.5 --memory=256Mi \\
  --no-allow-unauthenticated \\
  --region=<region>`}
              </code>
              <p class="mt-1.5 text-text-muted">
                Create secret first:{" "}
                <code class="rounded bg-surface px-1 font-code">
                  echo -n "&lt;token&gt;" | gcloud secrets create synatra-connector-token --data-file=-
                </code>
              </p>
            </Show>

            <Show when={prodMethod() === "azure"}>
              <p class="mb-1.5 font-medium text-text">1. Create environment with VNet</p>
              <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface px-2 py-1.5 font-code scrollbar-thin">
                {`az containerapp env create \\
  --name synatra-env \\
  --resource-group <resource-group> \\
  --location <location> \\
  --infrastructure-subnet-resource-id <subnet-id>`}
              </code>
              <p class="mt-2 mb-1.5 font-medium text-text">2. Deploy container app</p>
              <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface px-2 py-1.5 font-code scrollbar-thin">
                {`az containerapp create \\
  --name synatra-connector \\
  --resource-group <resource-group> \\
  --environment synatra-env \\
  --image ghcr.io/synatrahq/connector:latest \\
  --env-vars GATEWAY_URL=${gatewayUrl()} \\
  --secrets connector-token=<your-token> \\
  --secret-env-vars CONNECTOR_TOKEN=connector-token \\
  --cpu 0.25 --memory 0.5Gi \\
  --min-replicas 1 \\
  --max-replicas 1`}
              </code>
              <p class="mt-1.5 text-text-muted">
                Use the same VNet as your database. For Key Vault secrets, use{" "}
                <code class="rounded bg-surface px-1 font-code">--secrets "connector-token=keyvaultref:..."</code>
              </p>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )
}
