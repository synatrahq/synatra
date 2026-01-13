import type { AgentTemplate, DemoScenario } from "../types"
import { DatabaseResourceType } from "../types/resource"

type SeedTemplate = Omit<AgentTemplate, "id">

export const AGENT_TEMPLATES: SeedTemplate[] = [
  {
    slug: "mrr-dashboard",
    name: "MRR Dashboard",
    description: "Track monthly recurring revenue, growth metrics, and generate investor reports from Stripe data.",
    category: "analytics",
    icon: "ChartLineUp",
    iconColor: "green",
    prompt: `I want to build an MRR Dashboard Agent that:

- Connects to Stripe to pull subscription and revenue data
- Calculates MRR, growth rate, churn rate, and customer counts
- Generates charts and tables for board meetings
- Identifies top customers by revenue

The agent should:
- Present clear, investor-ready metrics
- Highlight trends and changes from previous periods
- Provide actionable insights on revenue health`,
    suggestedResources: ["stripe", "postgres"],
    demoScenarios: [
      {
        id: "monthly-report",
        title: "Monthly Investor Update",
        sequence: [
          { type: "user", text: "Generate this month's MRR report for our board meeting." },
          { type: "thinking", duration: 700 },
          { type: "tool_call", name: "fetch_stripe_subscriptions", status: "success" },
          { type: "tool_call", name: "calculate_metrics", status: "success" },
          {
            type: "widget",
            widget: {
              type: "key_value",
              id: "mrr-metrics",
              keyValue: {
                pairs: { MRR: "$47,200", Growth: "+12.3%", Churn: "2.1%", "New Customers": "23" },
              },
            },
          },
          {
            type: "widget",
            widget: {
              type: "chart",
              id: "mrr-trend",
              title: "MRR Trend (Last 4 Months)",
              chart: {
                type: "line",
                data: {
                  labels: ["Sep", "Oct", "Nov", "Dec"],
                  datasets: [{ label: "MRR ($K)", data: [38.2, 41.1, 44.3, 47.2] }],
                },
              },
            },
          },
          {
            type: "widget",
            widget: {
              type: "table",
              id: "top-customers",
              table: {
                columns: [
                  { key: "rank", label: "#" },
                  { key: "customer", label: "Customer" },
                  { key: "mrr", label: "MRR" },
                  { key: "plan", label: "Plan" },
                ],
                data: [
                  { rank: 1, customer: "Acme Corp", mrr: "$2,400", plan: "Enterprise" },
                  { rank: 2, customer: "TechFlow Inc", mrr: "$1,800", plan: "Enterprise" },
                  { rank: 3, customer: "DataStream", mrr: "$1,200", plan: "Pro" },
                  { rank: 4, customer: "CloudBase", mrr: "$899", plan: "Pro" },
                  { rank: 5, customer: "StartupXYZ", mrr: "$599", plan: "Pro" },
                ],
              },
            },
          },
          {
            type: "widget",
            widget: {
              type: "markdown",
              id: "summary",
              markdown: {
                content:
                  "**Summary:** Strong month with 12.3% MRR growth. Enterprise segment driving 65% of new revenue. Churn below target at 2.1%. Recommend focusing on mid-market expansion for Q1.",
              },
            },
          },
          { type: "agent", text: "Report ready. MRR grew 12.3% to $47,200 with healthy 2.1% churn." },
        ],
      },
    ] as DemoScenario[],
    displayOrder: 1,
    featured: true,
  },
  {
    slug: "customer-support",
    name: "Customer Support Agent",
    description: "Handle customer inquiries, look up account details, and process refunds with approval workflows.",
    category: "support",
    icon: "Headphones",
    iconColor: "blue",
    prompt: `I want to build a Customer Support Agent that:

- Responds to customer inquiries from Intercom
- Looks up customer information and order history
- Can process refunds with human approval
- Escalates complex issues when needed

The agent should:
- Be polite and professional
- Always verify customer context before taking actions
- Require human approval for any financial operations
- Summarize actions taken after completing a request`,
    suggestedResources: ["intercom", "stripe", "postgres"],
    demoScenarios: [
      {
        id: "refund-request",
        title: "Refund Request",
        sequence: [
          { type: "user", text: "Customer asking for refund on order #ORD-7823. Says product was defective." },
          { type: "thinking", duration: 600 },
          { type: "tool_call", name: "fetch_intercom_customer", status: "success" },
          { type: "tool_call", name: "get_stripe_orders", status: "success" },
          {
            type: "widget",
            widget: {
              type: "key_value",
              id: "customer-info",
              keyValue: {
                pairs: {
                  Customer: "Sarah Chen",
                  Plan: "Pro ($49/mo)",
                  LTV: "$588",
                  "Member Since": "Mar 2024",
                },
              },
            },
          },
          {
            type: "widget",
            widget: {
              type: "table",
              id: "orders",
              table: {
                columns: [
                  { key: "order", label: "Order" },
                  { key: "date", label: "Date" },
                  { key: "amount", label: "Amount" },
                  { key: "status", label: "Status" },
                ],
                data: [
                  { order: "#ORD-7823", date: "Dec 15", amount: "$49.99", status: "Delivered" },
                  { order: "#ORD-7156", date: "Nov 28", amount: "$29.99", status: "Delivered" },
                ],
              },
            },
          },
          {
            type: "question",
            question: {
              question: "What resolution would you like to offer?",
              options: [
                { label: "Full refund ($49.99)", description: "Refund entire order amount" },
                { label: "50% refund ($24.99)", description: "Partial refund for defect" },
                { label: "Store credit ($60)", description: "Credit with 20% bonus" },
                { label: "Escalate to manager", description: "Complex case needs review" },
              ],
              selectedIndex: 0,
            },
          },
          { type: "tool_call", name: "process_stripe_refund", status: "running" },
          { type: "approval", action: "Refund $49.99 to Sarah Chen (card ending 4242)" },
          { type: "tool_call", name: "send_intercom_message", status: "success" },
          { type: "agent", text: "Refund of $49.99 processed. Confirmation sent to Sarah via Intercom." },
        ],
      },
    ] as DemoScenario[],
    displayOrder: 2,
    featured: true,
  },
  {
    slug: "sql-explorer",
    name: "SQL Explorer",
    description: "Query your database using natural language. Get instant answers, tables, and visualizations.",
    category: "analytics",
    icon: "MagnifyingGlass",
    iconColor: "indigo",
    prompt: `I want to build a SQL Explorer Agent that:

- Connects to my database
- Answers questions about data in natural language
- Generates charts and tables for results
- Can explain query logic when asked

The agent should:
- Write efficient, safe SQL queries
- Never modify data (read-only)
- Format results clearly
- Provide actionable insights alongside data`,
    suggestedResources: [...DatabaseResourceType],
    demoScenarios: [
      {
        id: "power-users",
        title: "Find Power Users",
        sequence: [
          { type: "user", text: "Who are our most active users this month?" },
          { type: "thinking", duration: 500 },
          { type: "tool_call", name: "query_database", status: "success" },
          {
            type: "widget",
            widget: {
              type: "table",
              id: "active-users",
              table: {
                columns: [
                  { key: "rank", label: "#" },
                  { key: "user", label: "User" },
                  { key: "actions", label: "Actions" },
                  { key: "lastActive", label: "Last Active" },
                  { key: "plan", label: "Plan" },
                ],
                data: [
                  { rank: 1, user: "Alex Kim", actions: 847, lastActive: "2h ago", plan: "Pro" },
                  { rank: 2, user: "Jordan Lee", actions: 623, lastActive: "1h ago", plan: "Free" },
                  { rank: 3, user: "Taylor Swift", actions: 518, lastActive: "4h ago", plan: "Pro" },
                  { rank: 4, user: "Morgan Chen", actions: 456, lastActive: "30m ago", plan: "Free" },
                  { rank: 5, user: "Casey Jones", actions: 412, lastActive: "6h ago", plan: "Free" },
                ],
              },
            },
          },
          {
            type: "widget",
            widget: {
              type: "chart",
              id: "actions-chart",
              title: "Actions by User",
              chart: {
                type: "bar",
                data: {
                  labels: ["Alex", "Jordan", "Taylor", "Morgan", "Casey"],
                  datasets: [{ label: "Actions", data: [847, 623, 518, 456, 412] }],
                },
              },
            },
          },
          {
            type: "widget",
            widget: {
              type: "markdown",
              id: "insight",
              markdown: {
                content:
                  "**Insight:** 3 of your top 5 power users are on Free plans. Consider targeting Jordan, Morgan, and Casey for upgrade campaigns.",
              },
            },
          },
          { type: "agent", text: "Found your top 5 power users. Alex Kim leads with 847 actions this month." },
        ],
      },
    ] as DemoScenario[],
    displayOrder: 3,
    featured: true,
  },
  {
    slug: "churn-prevention",
    name: "Churn Prevention Agent",
    description: "Identify at-risk customers, analyze churn signals, and take proactive retention actions.",
    category: "analytics",
    icon: "UserMinus",
    iconColor: "red",
    prompt: `I want to build a Churn Prevention Agent that:

- Analyzes customer usage patterns and payment history
- Identifies customers showing churn signals
- Calculates risk scores based on engagement metrics
- Suggests and executes retention interventions

The agent should:
- Proactively surface at-risk accounts
- Provide context on why customers might churn
- Offer multiple intervention options
- Require approval for discounts or credits`,
    suggestedResources: ["stripe", "postgres", "intercom"],
    demoScenarios: [
      {
        id: "at-risk-alert",
        title: "At-Risk Customer Alert",
        sequence: [
          { type: "user", text: "Which customers might churn this month?" },
          { type: "thinking", duration: 700 },
          { type: "tool_call", name: "analyze_customer_activity", status: "success" },
          { type: "tool_call", name: "calculate_churn_risk", status: "success" },
          {
            type: "widget",
            widget: {
              type: "table",
              id: "at-risk",
              table: {
                columns: [
                  { key: "customer", label: "Customer" },
                  { key: "mrr", label: "MRR" },
                  { key: "risk", label: "Risk" },
                  { key: "lastActive", label: "Last Active" },
                  { key: "signal", label: "Warning Sign" },
                ],
                data: [
                  { customer: "DataFlow Inc", mrr: "$299", risk: "82%", lastActive: "18 days", signal: "No logins" },
                  { customer: "CloudBase", mrr: "$149", risk: "71%", lastActive: "12 days", signal: "Support tickets" },
                  {
                    customer: "StartupXYZ",
                    mrr: "$49",
                    risk: "65%",
                    lastActive: "9 days",
                    signal: "Downgrade inquiry",
                  },
                ],
              },
            },
          },
          {
            type: "widget",
            widget: {
              type: "key_value",
              id: "risk-summary",
              keyValue: {
                pairs: {
                  "MRR at Risk": "$497",
                  "Avg Days Inactive": "12",
                  "Top Churn Reason": "Feature gaps",
                },
              },
            },
          },
          {
            type: "question",
            question: {
              question: "What intervention for DataFlow Inc ($299/mo)?",
              options: [
                { label: "20% discount", description: "Save $59.80/mo for 3 months" },
                { label: "Personal call", description: "Schedule CS call this week" },
                { label: "Feature demo", description: "Show underused features" },
                { label: "No action", description: "Monitor for now" },
              ],
              selectedIndex: 0,
            },
          },
          {
            type: "confirm",
            confirm: { message: "Send 20% discount offer ($59.80/mo savings) to DataFlow Inc?", variant: "warning" },
          },
          { type: "tool_call", name: "apply_stripe_discount", status: "running" },
          { type: "approval", action: "Apply 20% discount to DataFlow Inc subscription" },
          { type: "tool_call", name: "send_intercom_message", status: "success" },
          { type: "agent", text: "Discount applied to DataFlow Inc. Personalized retention email sent via Intercom." },
        ],
      },
    ] as DemoScenario[],
    displayOrder: 4,
    featured: true,
  },
  {
    slug: "bug-investigation",
    name: "Bug Investigation Agent",
    description: "Investigate production issues by correlating GitHub issues, error logs, and affected customer data.",
    category: "devops",
    icon: "Bug",
    iconColor: "red",
    prompt: `I want to build a Bug Investigation Agent that:

- Fetches GitHub issue details and related commits
- Queries error logs and affected user data
- Correlates symptoms across data sources
- Identifies root cause and affected customers

The agent should:
- Present a clear timeline of events
- Show which customers are impacted
- Suggest remediation steps
- Help communicate with affected users`,
    suggestedResources: ["github", "postgres"],
    demoScenarios: [
      {
        id: "investigate-bug",
        title: "Production Bug Investigation",
        sequence: [
          { type: "user", text: "Users reporting login failures. Investigate Issue #234." },
          { type: "thinking", duration: 600 },
          { type: "tool_call", name: "fetch_github_issue", status: "success" },
          { type: "tool_call", name: "query_error_logs", status: "success" },
          { type: "tool_call", name: "query_affected_users", status: "success" },
          {
            type: "widget",
            widget: {
              type: "key_value",
              id: "issue-summary",
              keyValue: {
                pairs: {
                  Issue: "#234 - Login fails for SSO users",
                  Reported: "2 hours ago",
                  "Affected Users": "47",
                  "Error Rate": "12.3%",
                },
              },
            },
          },
          {
            type: "widget",
            widget: {
              type: "table",
              id: "affected-users",
              table: {
                columns: [
                  { key: "user", label: "User" },
                  { key: "company", label: "Company" },
                  { key: "lastLogin", label: "Last Login" },
                  { key: "error", label: "Error" },
                ],
                data: [
                  { user: "john@acme.com", company: "Acme Corp", lastLogin: "2h ago", error: "Token expired" },
                  { user: "sarah@techflow.io", company: "TechFlow", lastLogin: "3h ago", error: "Token expired" },
                  { user: "mike@datastream.co", company: "DataStream", lastLogin: "1h ago", error: "Token expired" },
                ],
              },
            },
          },
          {
            type: "widget",
            widget: {
              type: "markdown",
              id: "root-cause",
              markdown: {
                content:
                  "**Root Cause:** SSO token expiry changed from 24h to 1h in commit `ab3f2d` (deployed 3h ago). 47 enterprise users on SSO are affected. Rollback or hotfix recommended.",
              },
            },
          },
          {
            type: "select_rows",
            selectRows: {
              columns: [
                { key: "user", label: "User" },
                { key: "company", label: "Company" },
                { key: "plan", label: "Plan" },
              ],
              data: [
                { user: "john@acme.com", company: "Acme Corp", plan: "Enterprise" },
                { user: "sarah@techflow.io", company: "TechFlow", plan: "Enterprise" },
                { user: "mike@datastream.co", company: "DataStream", plan: "Pro" },
              ],
              selectedIndices: [0, 1, 2],
            },
          },
          { type: "tool_call", name: "add_github_comment", status: "success" },
          {
            type: "agent",
            text: "Added root cause to Issue #234. Ready to notify 47 affected users with status update.",
          },
        ],
      },
    ] as DemoScenario[],
    displayOrder: 5,
    featured: true,
  },
  {
    slug: "user-activation",
    name: "User Activation Agent",
    description: "Track new user onboarding progress, identify stuck users, and send personalized nudges.",
    category: "analytics",
    icon: "RocketLaunch",
    iconColor: "green",
    prompt: `I want to build a User Activation Agent that:

- Tracks new customer onboarding progress
- Identifies users stuck at specific steps
- Analyzes drop-off points in the activation funnel
- Sends personalized help messages

The agent should:
- Define clear onboarding milestones
- Calculate conversion rates by step
- Prioritize high-value stuck users
- Provide context before sending messages`,
    suggestedResources: ["postgres", "intercom"],
    demoScenarios: [
      {
        id: "activation-review",
        title: "Weekly Activation Review",
        sequence: [
          { type: "user", text: "How are this week's signups progressing?" },
          { type: "thinking", duration: 600 },
          { type: "tool_call", name: "query_signup_funnel", status: "success" },
          {
            type: "widget",
            widget: {
              type: "chart",
              id: "funnel",
              title: "Activation Funnel",
              chart: {
                type: "bar",
                data: {
                  labels: ["Signed Up", "Setup Done", "First Action", "Active"],
                  datasets: [{ label: "Users", data: [156, 89, 45, 28] }],
                },
              },
            },
          },
          {
            type: "widget",
            widget: {
              type: "table",
              id: "stuck-users",
              table: {
                columns: [
                  { key: "user", label: "User" },
                  { key: "step", label: "Current Step" },
                  { key: "days", label: "Days Stuck" },
                  { key: "plan", label: "Plan" },
                ],
                data: [
                  { user: "Mike Johnson", step: "2/5 Setup", days: 6, plan: "Pro Trial" },
                  { user: "Lisa Park", step: "3/5 First Action", days: 4, plan: "Pro Trial" },
                  { user: "Chris Wong", step: "2/5 Setup", days: 5, plan: "Free" },
                  { user: "Emma Davis", step: "3/5 First Action", days: 3, plan: "Pro Trial" },
                ],
              },
            },
          },
          {
            type: "widget",
            widget: {
              type: "key_value",
              id: "funnel-metrics",
              keyValue: {
                pairs: {
                  "Conversion Rate": "17.9%",
                  "Avg Time to Active": "3.2 days",
                  "Biggest Drop-off": "Setup → First Action (49%)",
                },
              },
            },
          },
          {
            type: "select_rows",
            selectRows: {
              columns: [
                { key: "user", label: "User" },
                { key: "step", label: "Current Step" },
                { key: "days", label: "Days Stuck" },
              ],
              data: [
                { user: "Mike Johnson", step: "2/5 Setup", days: 6 },
                { user: "Lisa Park", step: "3/5 First Action", days: 4 },
                { user: "Chris Wong", step: "2/5 Setup", days: 5 },
                { user: "Emma Davis", step: "3/5 First Action", days: 3 },
              ],
              selectedIndices: [0, 1],
            },
          },
          { type: "tool_call", name: "send_onboarding_help", status: "success" },
          { type: "agent", text: "Sent personalized help to Mike and Lisa. Will follow up in 48h if no progress." },
        ],
      },
    ] as DemoScenario[],
    displayOrder: 6,
    featured: false,
  },
  {
    slug: "billing-ops",
    name: "Billing Ops Agent",
    description: "Monitor failed payments, recover revenue, and manage billing issues across your customer base.",
    category: "finance",
    icon: "CreditCard",
    iconColor: "green",
    prompt: `I want to build a Billing Ops Agent that:

- Monitors failed payments in Stripe
- Identifies patterns in payment failures
- Executes recovery actions (retry, remind, update card)
- Tracks recovery success rates

The agent should:
- Surface critical billing issues quickly
- Provide context on failure reasons
- Suggest appropriate recovery actions
- Require approval before retrying payments`,
    suggestedResources: ["stripe", "postgres"],
    demoScenarios: [
      {
        id: "payment-recovery",
        title: "Failed Payment Recovery",
        sequence: [
          { type: "user", text: "Check for failed payments this week." },
          { type: "thinking", duration: 500 },
          { type: "tool_call", name: "fetch_failed_payments", status: "success" },
          {
            type: "widget",
            widget: {
              type: "table",
              id: "failed-payments",
              table: {
                columns: [
                  { key: "customer", label: "Customer" },
                  { key: "amount", label: "Amount" },
                  { key: "reason", label: "Reason" },
                  { key: "attempts", label: "Attempts" },
                ],
                data: [
                  { customer: "Acme Corp", amount: "$299", reason: "Card declined", attempts: 2 },
                  { customer: "TechStart Inc", amount: "$149", reason: "Card expired", attempts: 1 },
                  { customer: "DevHub", amount: "$49", reason: "Insufficient funds", attempts: 3 },
                ],
              },
            },
          },
          {
            type: "widget",
            widget: {
              type: "key_value",
              id: "recovery-stats",
              keyValue: {
                pairs: {
                  "Total at Risk": "$497",
                  "Recovery Rate (30d)": "68%",
                  "Most Common": "Card declined (45%)",
                },
              },
            },
          },
          {
            type: "question",
            question: {
              question: "What recovery action to take?",
              options: [
                { label: "Retry all now", description: "Attempt payment for all 3" },
                { label: "Send reminders", description: "Email customers to update payment" },
                { label: "Request card updates", description: "Send card update links" },
              ],
              selectedIndex: 0,
            },
          },
          {
            type: "confirm",
            confirm: { message: "Retry 3 payments totaling $497?", variant: "info" },
          },
          { type: "tool_call", name: "retry_stripe_payments", status: "success" },
          { type: "agent", text: "2 of 3 retries successful. $448 recovered. TechStart needs card update." },
        ],
      },
    ] as DemoScenario[],
    displayOrder: 7,
    featured: false,
  },
  {
    slug: "order-management",
    name: "Order Management Agent",
    description: "Review and manage e-commerce orders, handle fulfillment issues, and process returns.",
    category: "workflow",
    icon: "ShoppingCart",
    iconColor: "blue",
    prompt: `I want to build an Order Management Agent that:

- Queries order status and fulfillment data
- Identifies orders with issues (payment, address, returns)
- Processes order actions with approval
- Updates customers on order status

The agent should:
- Surface problematic orders quickly
- Provide order context before actions
- Require approval for refunds and cancellations
- Keep customers informed`,
    suggestedResources: ["postgres", "stripe"],
    demoScenarios: [
      {
        id: "daily-orders",
        title: "Daily Order Review",
        sequence: [
          { type: "user", text: "Show me today's orders that need attention." },
          { type: "thinking", duration: 500 },
          { type: "tool_call", name: "query_orders", status: "success" },
          {
            type: "widget",
            widget: {
              type: "key_value",
              id: "order-summary",
              keyValue: {
                pairs: {
                  "Orders Today": "47",
                  Revenue: "$3,847",
                  "Pending Fulfillment": "12",
                  Issues: "3",
                },
              },
            },
          },
          {
            type: "widget",
            widget: {
              type: "table",
              id: "problem-orders",
              table: {
                columns: [
                  { key: "order", label: "Order" },
                  { key: "issue", label: "Issue" },
                  { key: "amount", label: "Amount" },
                  { key: "customer", label: "Customer" },
                ],
                data: [
                  { order: "#ORD-8834", issue: "Payment pending", amount: "$129", customer: "John Smith" },
                  { order: "#ORD-8821", issue: "Invalid address", amount: "$89", customer: "Mary Wilson" },
                  { order: "#ORD-8819", issue: "Refund requested", amount: "$67", customer: "Bob Lee" },
                ],
              },
            },
          },
          {
            type: "select_rows",
            selectRows: {
              columns: [
                { key: "order", label: "Order" },
                { key: "issue", label: "Issue" },
                { key: "amount", label: "Amount" },
              ],
              data: [
                { order: "#ORD-8834", issue: "Payment pending", amount: "$129" },
                { order: "#ORD-8821", issue: "Invalid address", amount: "$89" },
                { order: "#ORD-8819", issue: "Refund requested", amount: "$67" },
              ],
              selectedIndices: [0, 1, 2],
            },
          },
          {
            type: "question",
            question: {
              question: "Action for #ORD-8834 (Payment pending)?",
              options: [
                { label: "Retry payment", description: "Attempt charge again" },
                { label: "Cancel order", description: "Cancel and notify customer" },
                { label: "Contact customer", description: "Send payment reminder" },
              ],
              selectedIndex: 0,
            },
          },
          { type: "tool_call", name: "retry_order_payment", status: "success" },
          { type: "approval", action: "Cancel order #ORD-8821 and refund $89 to Mary Wilson" },
          {
            type: "agent",
            text: "3 orders processed. Payment retried, 1 cancelled with refund, address update requested.",
          },
        ],
      },
    ] as DemoScenario[],
    displayOrder: 8,
    featured: false,
  },
  {
    slug: "inventory-alert",
    name: "Inventory Alert Agent",
    description: "Monitor stock levels, predict stockouts, and create purchase orders when inventory runs low.",
    category: "workflow",
    icon: "Package",
    iconColor: "yellow",
    prompt: `I want to build an Inventory Alert Agent that:

- Monitors inventory levels against thresholds
- Calculates days until stockout based on velocity
- Groups reorders by supplier
- Creates purchase orders for approval

The agent should:
- Run daily to check stock levels
- Prioritize by urgency (days to stockout)
- Calculate reorder quantities
- Require approval for purchase orders`,
    suggestedResources: ["postgres"],
    demoScenarios: [
      {
        id: "low-stock",
        title: "Low Stock Alert",
        sequence: [
          { type: "user", text: "Run daily inventory check." },
          { type: "thinking", duration: 600 },
          { type: "tool_call", name: "query_inventory", status: "success" },
          { type: "tool_call", name: "calculate_stockout_days", status: "success" },
          {
            type: "widget",
            widget: {
              type: "table",
              id: "low-stock",
              table: {
                columns: [
                  { key: "sku", label: "SKU" },
                  { key: "product", label: "Product" },
                  { key: "current", label: "Stock" },
                  { key: "min", label: "Min" },
                  { key: "reorder", label: "Reorder Qty" },
                ],
                data: [
                  { sku: "SKU-A100", product: "Widget Pro", current: 12, min: 50, reorder: 100 },
                  { sku: "SKU-B200", product: "Cable Kit", current: 5, min: 20, reorder: 40 },
                  { sku: "SKU-C300", product: "Power Adapter", current: 0, min: 15, reorder: 30 },
                ],
              },
            },
          },
          {
            type: "widget",
            widget: {
              type: "key_value",
              id: "inventory-summary",
              keyValue: {
                pairs: {
                  "Items Below Threshold": "8",
                  "Total Reorder Value": "$2,340",
                  Supplier: "FastParts Inc",
                },
              },
            },
          },
          {
            type: "widget",
            widget: {
              type: "chart",
              id: "stockout-days",
              title: "Days Until Stockout",
              chart: {
                type: "bar",
                data: {
                  labels: ["Widget Pro", "Cable Kit", "Adapter"],
                  datasets: [{ label: "Days", data: [3, 1, 0] }],
                },
              },
            },
          },
          {
            type: "confirm",
            confirm: { message: "Create purchase order for 3 items totaling $2,340?", variant: "warning" },
          },
          { type: "tool_call", name: "create_purchase_order", status: "success" },
          { type: "agent", text: "Purchase order #PO-4521 created and sent to FastParts Inc." },
        ],
      },
    ] as DemoScenario[],
    displayOrder: 9,
    featured: false,
  },
  {
    slug: "customer-health",
    name: "Customer Health Monitor",
    description: "Track customer engagement scores, identify declining accounts, and prioritize outreach.",
    category: "support",
    icon: "Heartbeat",
    iconColor: "plum",
    prompt: `I want to build a Customer Health Monitor that:

- Calculates health scores from usage, support, and payment data
- Identifies accounts with declining engagement
- Segments customers by health status
- Recommends proactive outreach

The agent should:
- Provide clear health score methodology
- Show trends over time
- Highlight specific warning signs
- Suggest concrete next steps`,
    suggestedResources: ["postgres", "stripe", "intercom"],
    demoScenarios: [
      {
        id: "health-check",
        title: "Enterprise Health Check",
        sequence: [
          { type: "user", text: "How are our enterprise customers doing?" },
          { type: "thinking", duration: 700 },
          { type: "tool_call", name: "calculate_health_scores", status: "success" },
          {
            type: "widget",
            widget: {
              type: "table",
              id: "health-scores",
              table: {
                columns: [
                  { key: "customer", label: "Customer" },
                  { key: "score", label: "Score" },
                  { key: "trend", label: "Trend" },
                  { key: "status", label: "Status" },
                  { key: "warning", label: "Warning Sign" },
                ],
                data: [
                  { customer: "Acme Corp", score: 92, trend: "↑", status: "Healthy", warning: "-" },
                  { customer: "TechFlow", score: 78, trend: "→", status: "Stable", warning: "-" },
                  { customer: "DataCorp", score: 45, trend: "↓", status: "At Risk", warning: "Low usage" },
                  { customer: "CloudBase", score: 38, trend: "↓", status: "Critical", warning: "No login 30d" },
                ],
              },
            },
          },
          {
            type: "widget",
            widget: {
              type: "chart",
              id: "health-distribution",
              title: "Customer Health Distribution",
              chart: {
                type: "pie",
                data: {
                  labels: ["Healthy", "At Risk", "Critical"],
                  datasets: [{ label: "Customers", data: [12, 5, 2] }],
                },
              },
            },
          },
          {
            type: "widget",
            widget: {
              type: "key_value",
              id: "health-summary",
              keyValue: {
                pairs: {
                  "Avg Health Score": "71",
                  "MRR from At-Risk": "$1,247",
                  "Top Concern": "Low feature adoption",
                },
              },
            },
          },
          {
            type: "widget",
            widget: {
              type: "markdown",
              id: "action-needed",
              markdown: {
                content:
                  "**Action Needed:** DataCorp and CloudBase showing declining engagement. Last support contact: 45+ days ago. Recommend scheduling check-in calls this week.",
              },
            },
          },
          { type: "agent", text: "2 enterprise customers need attention. Recommend proactive outreach this week." },
        ],
      },
    ] as DemoScenario[],
    displayOrder: 10,
    featured: false,
  },
  {
    slug: "support-summarizer",
    name: "Support Ticket Summarizer",
    description: "Analyze support ticket trends, identify common issues, and surface unresolved critical tickets.",
    category: "support",
    icon: "ListChecks",
    iconColor: "gray",
    prompt: `I want to build a Support Ticket Summarizer that:

- Pulls conversations from Intercom
- Categorizes tickets by topic
- Identifies trending issues
- Surfaces unresolved critical tickets

The agent should:
- Provide clear ticket metrics
- Highlight patterns and trends
- Prioritize by urgency and customer tier
- Suggest process improvements`,
    suggestedResources: ["intercom", "postgres"],
    demoScenarios: [
      {
        id: "weekly-review",
        title: "Weekly Support Review",
        sequence: [
          { type: "user", text: "Summarize this week's support tickets." },
          { type: "thinking", duration: 600 },
          { type: "tool_call", name: "fetch_intercom_conversations", status: "success" },
          { type: "tool_call", name: "categorize_tickets", status: "success" },
          {
            type: "widget",
            widget: {
              type: "chart",
              id: "tickets-by-category",
              title: "Tickets by Category",
              chart: {
                type: "bar",
                data: {
                  labels: ["Auth", "Billing", "Features", "Bugs"],
                  datasets: [{ label: "Tickets", data: [23, 18, 15, 12] }],
                },
              },
            },
          },
          {
            type: "widget",
            widget: {
              type: "key_value",
              id: "support-metrics",
              keyValue: {
                pairs: {
                  "Total Tickets": "68",
                  "Avg Response": "2.4h",
                  "Resolution Rate": "87%",
                  Escalations: "4",
                },
              },
            },
          },
          {
            type: "widget",
            widget: {
              type: "table",
              id: "critical-tickets",
              table: {
                columns: [
                  { key: "ticket", label: "Ticket" },
                  { key: "issue", label: "Issue" },
                  { key: "customer", label: "Customer" },
                  { key: "age", label: "Age" },
                ],
                data: [
                  { ticket: "#T-892", issue: "Login broken", customer: "Enterprise", age: "8h" },
                  { ticket: "#T-887", issue: "Payment failed", customer: "Pro", age: "12h" },
                ],
              },
            },
          },
          {
            type: "widget",
            widget: {
              type: "markdown",
              id: "trend-alert",
              markdown: {
                content:
                  "**Trend Alert:** Auth issues up 40% vs last week. 3 tickets mention SSO integration. Consider prioritizing SSO hotfix or adding troubleshooting docs.",
              },
            },
          },
          { type: "agent", text: "68 tickets this week. Auth issues trending up - investigate SSO integration." },
        ],
      },
    ] as DemoScenario[],
    displayOrder: 11,
    featured: false,
  },
  {
    slug: "scheduled-report",
    name: "Scheduled Report Agent",
    description: "Generate and distribute product metrics reports on a schedule.",
    category: "workflow",
    icon: "Calendar",
    iconColor: "indigo",
    prompt: `I want to build a Scheduled Report Agent that:

- Queries key product metrics from the database
- Generates charts and summaries
- Formats reports for team distribution
- Sends to configured channels

The agent should:
- Present clear, scannable metrics
- Highlight week-over-week changes
- Include actionable insights
- Support multiple output destinations`,
    suggestedResources: [...DatabaseResourceType],
    demoScenarios: [
      {
        id: "weekly-report",
        title: "Weekly Product Report",
        sequence: [
          { type: "user", text: "Generate the weekly product metrics report." },
          { type: "thinking", duration: 500 },
          { type: "tool_call", name: "query_product_metrics", status: "success" },
          {
            type: "widget",
            widget: {
              type: "key_value",
              id: "product-metrics",
              keyValue: {
                pairs: {
                  WAU: "2,847 (+8%)",
                  DAU: "892 (+12%)",
                  "New Signups": "156",
                  "Feature Adoption": "67%",
                },
              },
            },
          },
          {
            type: "widget",
            widget: {
              type: "chart",
              id: "dau-trend",
              title: "DAU Trend (4 Weeks)",
              chart: {
                type: "line",
                data: {
                  labels: ["Week 1", "Week 2", "Week 3", "Week 4"],
                  datasets: [{ label: "DAU", data: [780, 812, 856, 892] }],
                },
              },
            },
          },
          {
            type: "widget",
            widget: {
              type: "markdown",
              id: "weekly-summary",
              markdown: {
                content:
                  "**Weekly Summary:** Strong growth week. DAU up 12%, driven by new onboarding flow. Feature adoption improved 5 points. Watch: Mobile engagement down 3%.",
              },
            },
          },
          {
            type: "confirm",
            confirm: { message: "Send report to #product-updates and leadership@company.com?", variant: "info" },
          },
          { type: "agent", text: "Report delivered to Slack and email. Scheduled for next Monday 9am." },
        ],
      },
    ] as DemoScenario[],
    displayOrder: 12,
    featured: false,
  },
]
